"""Referral gate endpoints (API design section 6.7).

Access checks run before the gate, so another patient, a reviewer or a mock facility gets 403 or
404 with no gate details (test plan section 5). `POST /mock-referral` is the only way to create a
referral. No module here makes an outbound call (AC-12.8).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.auth.deps import AuthContext, require_patient
from sanad_api.cases.guards import Action, PatientCase, guard, patient_case
from sanad_api.cases.state_machine import CaseEvent, transition
from sanad_api.cases.views import state_view
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.deps import get_catalogues, get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.navigation.models import CareNavigationEpisode, CareNavigationEvent
from sanad_api.navigation.service import (
    append_progress,
    current_guidance,
    get_or_create_episode,
)
from sanad_api.referral.gate import GateDecision, evaluate_gate
from sanad_api.referral.service import gate_inputs, record_gate, referral_out, send_mock_referral
from sanad_api.schemas import CaseStateOut, GateDecisionOut, ReferralOut
from sanad_api.vocab import TriageAction

router = APIRouter(tags=["referral"])


@router.post("/cases/{case_id}/navigation/start", response_model=CaseStateOut)
def start_navigation(
    pc: PatientCase = Depends(guard(Action.START_NAVIGATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    guidance = current_guidance(db, pc.case)
    if guidance is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    _draft, guidance_id, guidance_version = guidance
    now = clock.now()
    episode = get_or_create_episode(
        db,
        case_id=pc.case.case_id,
        session_token_hash=pc.auth.token_hash,
        guidance_id=guidance_id,
        guidance_version=guidance_version,
        now=now,
    )
    transition(db, pc.case, CaseEvent.START_NAVIGATION, pc.auth.actor, clock.now())
    started = (
        db.query(CareNavigationEvent)
        .filter_by(episode_id=episode.episode_id, status="NAVIGATION_STARTED")
        .first()
    )
    if started is None:
        append_progress(
            db,
            episode,
            status="NAVIGATION_STARTED",
            source="SYSTEM_EVENT",
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
            status="NAVIGATION_STARTED",
            verification_source="SYSTEM_EVENT",
        )
    db.commit()
    return state_view(db, pc.case, catalogues)


class MockFacilityOut(BaseModel):
    mock_facility_id: str
    name: str
    care_type: str
    is_mock: bool


class MockDirectoryOut(BaseModel):
    is_mock: bool
    directory_version: str
    facilities: list[MockFacilityOut]


@router.get("/mock-directory", response_model=MockDirectoryOut)
def mock_directory(
    care_type: TriageAction | None = None,
    auth: AuthContext = Depends(require_patient),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    """Invented facilities only (AC-13.5, OD-09)."""
    directory = catalogues.mock_directory
    return {
        "is_mock": True,
        "directory_version": directory.directory_version,
        "facilities": [
            {**facility.model_dump(), "is_mock": True}
            for facility in directory.facilities
            if care_type is None or facility.care_type == care_type
        ],
    }


@router.get("/cases/{case_id}/referral-gate", response_model=GateDecisionOut)
def preview_gate(
    target_mock_facility_id: str | None = Query(default=None, max_length=32),
    pc: PatientCase = Depends(patient_case),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    """The same gate as the send. It grants nothing and writes no audit entry."""
    inputs = gate_inputs(db, pc.case, target_mock_facility_id, clock.now(), catalogues)
    return evaluate_gate(inputs).to_json()


class MockReferralIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_mock_facility_id: str = Field(min_length=1, max_length=32)


class MockReferralOut(BaseModel):
    referral: ReferralOut
    gate_decision: GateDecisionOut


def _denied(decision: GateDecision) -> ApiError:
    return ApiError(
        403,
        ErrorCode.GATE_DENIED,
        decision.reason_codes,
        extra={"gate_decision": jsonable_encoder(decision.to_json())},
    )


@router.post("/cases/{case_id}/mock-referral", status_code=201, response_model=MockReferralOut)
def send_referral(
    body: MockReferralIn,
    pc: PatientCase = Depends(patient_case),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    case, actor, now = pc.case, pc.auth.actor, clock.now()
    target = body.target_mock_facility_id
    try:
        decision, referral = send_mock_referral(db, case, target, now, actor, catalogues)
        db.commit()  # the decision is audited whether it allows or denies (AC-12.2)
    except IntegrityError:
        # A concurrent send won the unique constraint on case_id (API design 6.7).
        db.rollback()
        decision = evaluate_gate(gate_inputs(db, case, target, now, catalogues))
        record_gate(db, case, decision, actor, now)
        db.commit()
        raise _denied(decision) from None
    if referral is None:
        raise _denied(decision)
    episode = (
        db.query(CareNavigationEpisode)
        .filter_by(case_id=case.case_id, session_token_hash=pc.auth.token_hash)
        .one_or_none()
    )
    if episode is not None:
        append_progress(
            db,
            episode,
            status="REFERRAL_REQUESTED",
            source="SIMULATED",
            actor=actor,
            now=now,
        )
        db.commit()
    return {"referral": referral_out(referral), "gate_decision": decision.to_json()}


@router.post("/cases/{case_id}/spouse-share", status_code=403)
def spouse_share(
    pc: PatientCase = Depends(patient_case),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> None:
    """Always refused, whatever scopes are active. No other sharing route exists (AC-12.9)."""
    record(
        db,
        AuditType.SHARE_DENIED,
        actor=pc.auth.actor,
        now=clock.now(),
        case_id=pc.case.case_id,
        case_version=pc.case.case_version,
    )
    db.commit()
    raise ApiError(403, ErrorCode.SPOUSE_SHARE_NOT_AVAILABLE)
