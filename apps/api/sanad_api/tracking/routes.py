"""Tracking endpoint (API design section 6.9). Patient-only: the reviewer sees the same flag in
the case detail (G7). Reading it changes nothing and triggers no reminder (AC-14.4)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sanad_api.audit.log import deny_transition
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.clock import Clock
from sanad_api.config import Settings
from sanad_api.deps import get_clock, get_db, get_settings
from sanad_api.referral.service import event_out, events_for, referral_for_case
from sanad_api.review.service import WITHDRAWN, decisions_for, requests_for
from sanad_api.schemas import FlagOut, MockAppointmentOut
from sanad_api.tracking.delay import case_flag

router = APIRouter(tags=["tracking"])


class TimelineEntryOut(BaseModel):
    kind: str
    value: str | None
    occurred_at: datetime
    verification_source: str
    is_mock: bool
    mock_appointment: MockAppointmentOut | None = None


class TrackingReferralOut(BaseModel):
    referral_id: str
    mock_status: str
    care_type: str
    target_mock_facility_id: str
    is_mock: bool


class TrackingOut(BaseModel):
    case_id: str
    case_state: str
    server_time: datetime
    is_mock: bool
    timeline: list[TimelineEntryOut]
    referral: TrackingReferralOut | None
    flag: FlagOut | None


def _entry(kind: str, value: str | None, at: datetime | None, source: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "value": value,
        "occurred_at": at,
        "verification_source": source,
        "is_mock": True,
    }


@router.get("/cases/{case_id}/tracking", response_model=TrackingOut)
def tracking(
    pc: PatientCase = Depends(guard(Action.READ_TRACKING)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    case, now = pc.case, clock.now()
    requests = requests_for(db, case.case_id)
    if not requests:  # tracking starts at the first send
        raise deny_transition(
            db,
            case_id=case.case_id,
            case_version=case.case_version,
            state=case.state,
            attempted_action=Action.READ_TRACKING.value,
            actor=pc.auth.actor,
            now=now,
        )
    decisions = decisions_for(db, case.case_id)
    timeline: list[dict[str, Any]] = []
    for request in requests:
        timeline.append(_entry("REVIEW_REQUESTED", None, request.requested_at, "SYSTEM_EVENT"))
        for decision in decisions:
            if decision.review_request_id == request.review_request_id:
                value = decision.kind or decision.decision
                timeline.append(_entry("REVIEW_DECISION", value, decision.decided_at, "SIMULATED"))
        if request.status == WITHDRAWN:
            timeline.append(
                _entry("REVIEW_REQUEST_WITHDRAWN", None, request.closed_at, "SYSTEM_EVENT")
            )
    referral = referral_for_case(db, case.case_id)
    if referral is not None:
        for event in events_for(db, referral.referral_id):
            entry = _entry("REFERRAL_EVENT", event.mock_status, event.occurred_at, "SIMULATED")
            entry["mock_appointment"] = event_out(event)["mock_appointment"]
            timeline.append(entry)
    timeline.sort(key=lambda entry: entry["occurred_at"])  # stable: same-time entries keep order

    flag = case_flag(db, case, now, settings.delayed_flag_seconds)
    return {
        "case_id": case.case_id,
        "case_state": case.state,
        "server_time": now,
        "is_mock": True,
        "timeline": timeline,
        "referral": (
            {
                "referral_id": referral.referral_id,
                "mock_status": referral.mock_status,
                "care_type": referral.care_type,
                "target_mock_facility_id": referral.target_mock_facility_id,
                "is_mock": True,
            }
            if referral is not None
            else None
        ),
        "flag": flag.to_json() if flag else None,
    }
