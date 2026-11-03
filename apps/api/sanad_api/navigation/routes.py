"""Voluntary closed-loop navigation API (PRD-FR-24 to PRD-FR-28)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.auth.deps import AuthContext, require_reviewer
from sanad_api.auth.models import SessionToken
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.clock import Clock
from sanad_api.deps import get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.navigation.models import (
    CareBarrierReport,
    CareNavigationEpisode,
    CareNavigationEvent,
    CareNavigationIdempotency,
)
from sanad_api.navigation.service import (
    append_progress,
    current_guidance,
    episode_payload,
    get_or_create_episode,
    payload_hash,
)

router = APIRouter(tags=["navigation"])

GuidanceStatus = Literal[
    "BOOKING_SELF_REPORTED",
    "VISIT_SELF_REPORTED",
    "UNABLE_TO_PROCEED",
    "DEFERRED",
    "DECLINED",
    "NO_UPDATE",
]
BarrierReason = Literal[
    "PRIVACY_CONCERN",
    "LANGUAGE_BARRIER",
    "COST_CONCERN",
    "SERVICE_UNCLEAR",
    "SCHEDULE_CONSTRAINT",
    "NOT_READY",
    "OTHER",
    "PREFER_NOT_TO_SAY",
]


def _recover_concurrent_replay(
    db: Session,
    *,
    episode_id: str,
    idempotency_key: str,
    request_hash: str,
    operation: str,
) -> dict[str, Any] | None:
    """Return the winner's result when a concurrent retry wins the unique-key race."""
    db.rollback()
    existing = (
        db.query(CareNavigationIdempotency)
        .filter_by(
            episode_id=episode_id,
            operation=operation,
            idempotency_key=idempotency_key,
        )
        .one_or_none()
    )
    if existing is None:
        return None
    if existing.request_hash != request_hash:
        raise ApiError(409, ErrorCode.IDEMPOTENCY_KEY_REUSED)
    episode = db.get(CareNavigationEpisode, episode_id)
    if episode is None:
        return None
    db.commit()
    return episode_payload(db, episode)


class NavigationEpisodeOut(BaseModel):
    episode_id: str
    case_id: str
    guidance_id: str
    guidance_version: str
    opened_at: datetime
    is_synthetic: bool
    acknowledged: bool
    progress_events: list[dict[str, Any]]
    barrier_reports: list[dict[str, Any]]


class AcknowledgeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    guidance_id: str = Field(min_length=1, max_length=64)
    guidance_version: str = Field(min_length=1, max_length=80)


class ProgressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: GuidanceStatus
    idempotency_key: str = Field(min_length=1, max_length=128)


class BarrierIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    barrier_reasons: list[BarrierReason] = Field(default_factory=list, max_length=8)
    prefer_not_to_say: bool = False
    free_text_opt_in: Literal[False] = False
    idempotency_key: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def _exclusive_prefer_not_to_say(self) -> BarrierIn:
        if self.prefer_not_to_say and self.barrier_reasons:
            raise ValueError("PREFER_NOT_TO_SAY cannot be combined with other barriers")
        if "PREFER_NOT_TO_SAY" in self.barrier_reasons and len(self.barrier_reasons) != 1:
            raise ValueError("PREFER_NOT_TO_SAY cannot be combined with other barriers")
        if len(self.barrier_reasons) != len(set(self.barrier_reasons)):
            raise ValueError("barrier_reasons must be unique")
        return self


class FunnelMetricOut(BaseModel):
    numerator: int
    denominator: int
    rate: float | None
    verification_source: str


class NavigationFunnelOut(BaseModel):
    observed_scope: str
    synthetic_demo: bool
    guidance_episodes: int
    acknowledgement: FunnelMetricOut
    navigation_started: FunnelMetricOut
    booking_self_reported: FunnelMetricOut
    visit_self_reported: FunnelMetricOut
    provider_verified_visits: Literal["NOT_AVAILABLE"] = "NOT_AVAILABLE"
    care_completed: Literal["NOT_AVAILABLE"] = "NOT_AVAILABLE"


def _current_episode(
    pc: PatientCase, db: Session, clock: Clock
) -> tuple[CareNavigationEpisode, Any]:
    guidance = current_guidance(db, pc.case)
    if guidance is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    draft, guidance_id, guidance_version = guidance
    episode = get_or_create_episode(
        db,
        case_id=pc.case.case_id,
        session_token_hash=pc.auth.token_hash,
        guidance_id=guidance_id,
        guidance_version=guidance_version,
        now=clock.now(),
    )
    if episode.guidance_id != guidance_id or episode.guidance_version != guidance_version:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    return episode, draft


@router.get("/cases/{case_id}/navigation", response_model=NavigationEpisodeOut)
def get_navigation(
    pc: PatientCase = Depends(guard(Action.READ_NAVIGATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    episode, _draft = _current_episode(pc, db, clock)
    db.commit()
    return episode_payload(db, episode)


@router.post(
    "/cases/{case_id}/navigation/acknowledgements", response_model=NavigationEpisodeOut
)
def acknowledge_guidance(
    body: AcknowledgeIn,
    pc: PatientCase = Depends(guard(Action.UPDATE_NAVIGATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    episode, _draft = _current_episode(pc, db, clock)
    if body.guidance_id != episode.guidance_id or body.guidance_version != episode.guidance_version:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    exists = (
        db.query(CareNavigationEvent)
        .filter_by(episode_id=episode.episode_id, status="GUIDANCE_ACKNOWLEDGED")
        .first()
    )
    if exists is None:
        now = clock.now()
        append_progress(
            db,
            episode,
            status="GUIDANCE_ACKNOWLEDGED",
            source="SYSTEM_EVENT",
            actor=pc.auth.actor,
            now=now,
        )
        record(
            db,
            AuditType.NAVIGATION_ACKNOWLEDGED,
            actor=pc.auth.actor,
            now=now,
            case_id=pc.case.case_id,
            case_version=pc.case.case_version,
            guidance_version=episode.guidance_version,
        )
    db.commit()
    return episode_payload(db, episode)


@router.post("/cases/{case_id}/navigation/progress", response_model=NavigationEpisodeOut)
def record_progress(
    body: ProgressIn,
    pc: PatientCase = Depends(guard(Action.UPDATE_NAVIGATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    episode, _draft = _current_episode(pc, db, clock)
    digest = payload_hash({"status": body.status})
    existing = (
        db.query(CareNavigationIdempotency)
        .filter_by(
            episode_id=episode.episode_id,
            operation="PROGRESS",
            idempotency_key=body.idempotency_key,
        )
        .one_or_none()
    )
    if existing is not None:
        if existing.request_hash != digest:
            raise ApiError(409, ErrorCode.IDEMPOTENCY_KEY_REUSED)
        db.commit()
        return episode_payload(db, episode)
    now = clock.now()
    try:
        db.add(
            CareNavigationIdempotency(
                episode_id=episode.episode_id,
                operation="PROGRESS",
                idempotency_key=body.idempotency_key,
                request_hash=digest,
                created_at=now,
            )
        )
        append_progress(
            db,
            episode,
            status=body.status,
            source="USER_REPORTED",
            actor=pc.auth.actor,
            now=now,
        )
        record(
            db,
            AuditType.NAVIGATION_PROGRESS_RECORDED,
            actor=pc.auth.actor,
            now=now,
            case_id=pc.case.case_id,
            case_version=pc.case.case_version,
            status=body.status,
            verification_source="USER_REPORTED",
        )
        db.commit()
    except IntegrityError:
        recovered = _recover_concurrent_replay(
            db,
            episode_id=episode.episode_id,
            idempotency_key=body.idempotency_key,
            request_hash=digest,
            operation="PROGRESS",
        )
        if recovered is None:
            raise
        return recovered
    return episode_payload(db, episode)


@router.post("/cases/{case_id}/navigation/barriers", response_model=NavigationEpisodeOut)
def record_barriers(
    body: BarrierIn,
    pc: PatientCase = Depends(guard(Action.UPDATE_NAVIGATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    episode, _draft = _current_episode(pc, db, clock)
    reasons = list(body.barrier_reasons)
    if body.prefer_not_to_say:
        reasons = ["PREFER_NOT_TO_SAY"]
    prefer_not_to_say = body.prefer_not_to_say or "PREFER_NOT_TO_SAY" in reasons
    digest = payload_hash(
        {"barrier_reasons": sorted(reasons), "prefer_not_to_say": prefer_not_to_say}
    )
    existing = (
        db.query(CareNavigationIdempotency)
        .filter_by(
            episode_id=episode.episode_id,
            operation="BARRIER",
            idempotency_key=body.idempotency_key,
        )
        .one_or_none()
    )
    if existing is not None:
        if existing.request_hash != digest:
            raise ApiError(409, ErrorCode.IDEMPOTENCY_KEY_REUSED)
        db.commit()
        return episode_payload(db, episode)
    try:
        db.add(
            CareNavigationIdempotency(
                episode_id=episode.episode_id,
                operation="BARRIER",
                idempotency_key=body.idempotency_key,
                request_hash=digest,
                created_at=clock.now(),
            )
        )
        db.add(
            CareBarrierReport(
                episode_id=episode.episode_id,
                barrier_reasons_json=json.dumps(reasons),
                free_text_opt_in=False,
                prefer_not_to_say=prefer_not_to_say,
                actor=pc.auth.actor,
                recorded_at=clock.now(),
            )
        )
        record(
            db,
            AuditType.NAVIGATION_BARRIER_RECORDED,
            actor=pc.auth.actor,
            now=clock.now(),
            case_id=pc.case.case_id,
            case_version=pc.case.case_version,
            count=len(reasons),
            prefer_not_to_say=body.prefer_not_to_say,
        )
        db.commit()
    except IntegrityError:
        recovered = _recover_concurrent_replay(
            db,
            episode_id=episode.episode_id,
            idempotency_key=body.idempotency_key,
            request_hash=digest,
            operation="BARRIER",
        )
        if recovered is None:
            raise
        return recovered
    return episode_payload(db, episode)


def _metric(numerator: int, denominator: int, source: str) -> dict[str, Any]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "rate": numerator / denominator if denominator else None,
        "verification_source": source,
    }


@router.get("/evaluation/navigation-funnel", response_model=NavigationFunnelOut)
def navigation_funnel(
    _auth: AuthContext = Depends(require_reviewer),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    active_sessions = select(SessionToken.token_hash).where(
        SessionToken.role == "PATIENT",
        SessionToken.ended_at.is_(None),
        SessionToken.expires_at > clock.now(),
    )
    episodes = (
        db.query(CareNavigationEpisode)
        .filter(
            CareNavigationEpisode.is_synthetic.is_(True),
            CareNavigationEpisode.session_token_hash.in_(active_sessions),
        )
        .all()
    )
    episode_ids = [episode.episode_id for episode in episodes]
    events = (
        db.query(CareNavigationEvent).filter(CareNavigationEvent.episode_id.in_(episode_ids)).all()
        if episode_ids
        else []
    )
    by_status: dict[str, set[str]] = {}
    for event in events:
        by_status.setdefault(event.status, set()).add(event.episode_id)
    total = len(episodes)
    return {
        "observed_scope": "ACTIVE_SYNTHETIC_SESSIONS",
        "synthetic_demo": True,
        "guidance_episodes": total,
        "acknowledgement": _metric(
            len(by_status.get("GUIDANCE_ACKNOWLEDGED", set())), total, "SYSTEM_EVENT"
        ),
        "navigation_started": _metric(
            len(by_status.get("NAVIGATION_STARTED", set())), total, "SYSTEM_EVENT"
        ),
        "booking_self_reported": _metric(
            len(by_status.get("BOOKING_SELF_REPORTED", set())), total, "USER_REPORTED"
        ),
        "visit_self_reported": _metric(
            len(by_status.get("VISIT_SELF_REPORTED", set())), total, "USER_REPORTED"
        ),
    }
