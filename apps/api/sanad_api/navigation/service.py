"""Session-scoped closed-loop navigation data and retention helpers."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.auth.models import SessionToken
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseState
from sanad_api.navigation.models import (
    CareBarrierReport,
    CareNavigationEpisode,
    CareNavigationEvent,
    CareNavigationIdempotency,
)
from sanad_api.reports.models import Draft
from sanad_api.reports.service import is_released
from sanad_api.review.models import ReviewDecision

GUIDANCE_STATES = frozenset({CaseState.GUIDANCE_AVAILABLE, CaseState.NAVIGATION_STARTED})


def guidance_reference(case: Case, draft: Draft) -> tuple[str, str] | None:
    if CaseState(case.state) not in GUIDANCE_STATES:
        return None
    return f"GUIDE-{case.case_id}-{draft.id}", draft.report_hash


def current_guidance(
    db: Session, case: Case
) -> tuple[Draft, str, str] | None:
    if case.current_draft_id is None:
        return None
    draft = db.get(Draft, case.current_draft_id)
    if draft is None or draft.case_version != case.case_version:
        return None
    decision = (
        db.query(ReviewDecision)
        .filter_by(case_id=case.case_id)
        .order_by(ReviewDecision.id.desc())
        .first()
    )
    if not is_released(case, decision):
        return None
    reference = guidance_reference(case, draft)
    if reference is None:
        return None
    return draft, reference[0], reference[1]


def get_or_create_episode(
    db: Session,
    *,
    case_id: str,
    session_token_hash: str,
    guidance_id: str,
    guidance_version: str,
    now: datetime,
) -> CareNavigationEpisode:
    episode = (
        db.query(CareNavigationEpisode)
        .filter_by(case_id=case_id, session_token_hash=session_token_hash)
        .one_or_none()
    )
    if episode is None:
        episode = CareNavigationEpisode(
            episode_id=f"NAV-{secrets.token_hex(12)}",
            case_id=case_id,
            session_token_hash=session_token_hash,
            guidance_id=guidance_id,
            guidance_version=guidance_version,
            opened_at=now,
            is_synthetic=True,
        )
        db.add(episode)
        db.flush()
        append_progress(
            db,
            episode,
            status="GUIDANCE_AVAILABLE",
            source="SYSTEM_EVENT",
            actor="SYSTEM",
            now=now,
        )
    return episode


def append_progress(
    db: Session,
    episode: CareNavigationEpisode,
    *,
    status: str,
    source: str,
    actor: str,
    now: datetime,
) -> CareNavigationEvent:
    event = CareNavigationEvent(
        episode_id=episode.episode_id,
        status=status,
        verification_source=source,
        verification_status="UNVERIFIED" if source == "USER_REPORTED" else source,
        actor=actor,
        occurred_at=now,
        recorded_at=now,
    )
    db.add(event)
    db.flush()
    return event


def payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def episode_payload(db: Session, episode: CareNavigationEpisode) -> dict[str, Any]:
    return {
        "episode_id": episode.episode_id,
        "case_id": episode.case_id,
        "guidance_id": episode.guidance_id,
        "guidance_version": episode.guidance_version,
        "opened_at": episode.opened_at,
        "is_synthetic": episode.is_synthetic,
        "acknowledged": (
            db.query(CareNavigationEvent)
            .filter_by(episode_id=episode.episode_id, status="GUIDANCE_ACKNOWLEDGED")
            .first()
            is not None
        ),
        "progress_events": [
            {
                "status": event.status,
                "verification_source": event.verification_source,
                "verification_status": event.verification_status,
                "occurred_at": event.occurred_at,
                "recorded_at": event.recorded_at,
            }
            for event in db.query(CareNavigationEvent)
            .filter_by(episode_id=episode.episode_id)
            .order_by(CareNavigationEvent.id)
            .all()
        ],
        "barrier_reports": [
            {
                "barrier_reasons": json.loads(report.barrier_reasons_json),
                "prefer_not_to_say": report.prefer_not_to_say,
                "free_text_opt_in": report.free_text_opt_in,
                "recorded_at": report.recorded_at,
            }
            for report in db.query(CareBarrierReport)
            .filter_by(episode_id=episode.episode_id)
            .order_by(CareBarrierReport.id)
            .all()
        ],
    }


def purge_session_navigation(db: Session, session_token_hash: str) -> None:
    """Delete all closed-loop data when its anonymous session ends or expires."""
    episodes = (
        db.query(CareNavigationEpisode)
        .filter_by(session_token_hash=session_token_hash)
        .all()
    )
    episode_ids = [episode.episode_id for episode in episodes]
    if episode_ids:
        db.query(CareNavigationEvent).filter(
            CareNavigationEvent.episode_id.in_(episode_ids)
        ).delete(synchronize_session=False)
        db.query(CareBarrierReport).filter(
            CareBarrierReport.episode_id.in_(episode_ids)
        ).delete(synchronize_session=False)
        db.query(CareNavigationIdempotency).filter(
            CareNavigationIdempotency.episode_id.in_(episode_ids)
        ).delete(synchronize_session=False)
        db.query(CareNavigationEpisode).filter(
            CareNavigationEpisode.episode_id.in_(episode_ids)
        ).delete(synchronize_session=False)


def purge_expired_navigation(db: Session, now: datetime) -> None:
    """Remove progress for anonymous patient sessions whose 24-hour token has expired."""
    expired = (
        db.query(SessionToken.token_hash)
        .filter(SessionToken.role == "PATIENT", SessionToken.expires_at <= now)
        .all()
    )
    for (token_hash,) in expired:
        purge_session_navigation(db, token_hash)
