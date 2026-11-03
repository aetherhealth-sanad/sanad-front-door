"""Mock facility endpoints (API design section 6.8).

The operator sees only the approved snapshot: case code, care type, reviewer summary and limits.
No answers, lab values or consent details, and nothing once consent is withdrawn (AC-13.4).
Events never change triage, review or consent (AC-13.6).
"""

from __future__ import annotations

import json
from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import AwareDatetime, BaseModel, ConfigDict
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, deny_transition, record
from sanad_api.auth.deps import AuthContext, require_mock_facility
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseEvent, transition
from sanad_api.clock import Clock
from sanad_api.deps import get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.referral.lifecycle import END_STATES, MockStatus, can_move
from sanad_api.referral.models import Referral
from sanad_api.referral.service import add_event, event_out, events_for
from sanad_api.schemas import ReferralEventOut

router = APIRouter(tags=["mock-facility"])

FACILITY_ACTOR = "MOCK_FACILITY"


class ReferralListItemOut(BaseModel):
    referral_id: str
    case_code: str
    care_type: str
    mock_status: str
    created_at: datetime
    is_mock: bool


class ReferralListOut(BaseModel):
    is_mock: bool
    referrals: list[ReferralListItemOut]


@router.get("/mock-facility/referrals", response_model=ReferralListOut)
def list_referrals(
    auth: AuthContext = Depends(require_mock_facility), db: Session = Depends(get_db)
) -> dict[str, Any]:
    rows = db.query(Referral).order_by(Referral.created_at).all()
    return {
        "is_mock": True,
        "referrals": [
            {
                "referral_id": row.referral_id,
                "case_code": row.case_code,  # never the case ID
                "care_type": row.care_type,
                "mock_status": row.mock_status,
                "created_at": row.created_at,
                "is_mock": True,
            }
            for row in rows
        ],
    }


class SnapshotOut(BaseModel):
    case_code: str
    care_type: str
    reviewer_summary: str
    limits: list[str]


class ReferralDetailOut(BaseModel):
    referral_id: str
    mock_status: str
    is_mock: bool
    snapshot: SnapshotOut | None
    events: list[ReferralEventOut]


def _referral(db: Session, referral_id: str) -> Referral:
    row = db.get(Referral, referral_id)
    if row is None:
        raise ApiError(404, ErrorCode.NOT_FOUND)
    return row


@router.get("/mock-facility/referrals/{referral_id}", response_model=ReferralDetailOut)
def referral_detail(
    referral_id: str,
    auth: AuthContext = Depends(require_mock_facility),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = _referral(db, referral_id)
    return {
        "referral_id": row.referral_id,
        "mock_status": row.mock_status,
        "is_mock": True,
        "snapshot": json.loads(row.snapshot_json) if row.snapshot_json else None,
        "events": [event_out(event) for event in events_for(db, row.referral_id)],
    }


class MockRejectReason(StrEnum):
    NO_CAPACITY = "NO_CAPACITY"
    SERVICE_NOT_OFFERED = "SERVICE_NOT_OFFERED"
    INFORMATION_INCOMPLETE = "INFORMATION_INCOMPLETE"
    OTHER = "OTHER"


class MockAppointmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: AwareDatetime


class MockEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # PROVIDER_VERIFIED, CARE_COMPLETED and the self-reported statuses are not in this enum,
    # so posting them fails validation (AC-13.3).
    mock_status: Literal[
        "MOCK_RECEIVED",
        "MOCK_ACCEPTED",
        "MOCK_REJECTED",
        "MOCK_APPOINTMENT_SCHEDULED",
        "MOCK_CLOSED",
    ]
    reason_code: MockRejectReason | None = None
    mock_appointment: MockAppointmentIn | None = None


@router.post(
    "/mock-facility/referrals/{referral_id}/events",
    status_code=201,
    response_model=ReferralEventOut,
)
def post_event(
    referral_id: str,
    body: MockEventIn,
    auth: AuthContext = Depends(require_mock_facility),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    row = _referral(db, referral_id)
    target = MockStatus(body.mock_status)
    if target is MockStatus.MOCK_REJECTED and body.reason_code is None:
        raise ApiError(422, ErrorCode.REASON_REQUIRED)
    if target is not MockStatus.MOCK_REJECTED and body.reason_code is not None:
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["REASON_NOT_ALLOWED"])
    scheduling = target is MockStatus.MOCK_APPOINTMENT_SCHEDULED
    if scheduling != (body.mock_appointment is not None):
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["MOCK_APPOINTMENT_MISMATCH"])

    case = db.get(Case, row.case_id)
    assert case is not None
    now = clock.now()
    if not can_move(MockStatus(row.mock_status), target):
        raise deny_transition(
            db,
            case_id=case.case_id,
            case_version=case.case_version,
            state=row.mock_status,
            attempted_action=target.value,
            actor=auth.actor,
            now=now,
        )
    event = add_event(
        db,
        case,
        row,
        target,
        actor=FACILITY_ACTOR,
        now=now,
        reason_code=body.reason_code.value if body.reason_code else None,
        appointment_starts_at=body.mock_appointment.starts_at if body.mock_appointment else None,
    )
    if target in END_STATES:
        transition(db, case, CaseEvent.MOCK_REFERRAL_ENDED, auth.actor, now)
        record(
            db,
            AuditType.CASE_CLOSED,
            actor=auth.actor,
            now=now,
            case_id=case.case_id,
            case_version=case.case_version,
            closed_reason="MOCK_REFERRAL_ENDED",
        )
    db.commit()
    return event_out(event)
