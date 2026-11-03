"""Loads fresh gate inputs, sends mock referrals and records their events.

`send_mock_referral` is the only code that constructs a `Referral` (AC-12.7, enforced by an
architecture test). It reads consent, review and case state inside the request's transaction,
evaluates the gate, and writes the decision and any referral together (AC-12.3).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseEvent, transition
from sanad_api.catalogues import Catalogues
from sanad_api.consent.service import load_grants, status_of
from sanad_api.ids import new_case_code, new_id
from sanad_api.referral.gate import DecisionSnapshot, GateDecision, GateInputs, evaluate_gate
from sanad_api.referral.lifecycle import LIVE_STATES, MockStatus
from sanad_api.referral.models import Referral, ReferralEvent
from sanad_api.reports.service import content_of, current_draft
from sanad_api.review.service import latest_decision
from sanad_api.vocab import ConsentScope

SYSTEM = "SYSTEM"
MOCK_APPOINTMENT_LABEL = "Mock appointment, not a real booking"


def referral_for_case(db: Session, case_id: str) -> Referral | None:
    return db.query(Referral).filter(Referral.case_id == case_id).one_or_none()


def gate_inputs(
    db: Session, case: Case, target: str | None, now: datetime, catalogues: Catalogues
) -> GateInputs:
    grants = load_grants(db, case.case_id)
    draft = current_draft(db, case)
    decision = latest_decision(db, case.case_id)
    return GateInputs(
        provider_share=status_of(grants.get(ConsentScope.PROVIDER_SHARE)),
        latest_decision=(
            DecisionSnapshot(
                decision=decision.decision,
                kind=decision.kind,
                case_version=decision.case_version,
                report_hash=decision.report_hash,
                expires_at=decision.expires_at,
            )
            if decision is not None
            else None
        ),
        case_version=case.case_version,
        report_hash=draft.report_hash if draft else None,
        case_state=case.state,
        triage_action=content_of(draft)["triage_proposal"]["action"] if draft else None,
        is_synthetic=case.is_synthetic,
        referral_exists=referral_for_case(db, case.case_id) is not None,
        target_mock_facility_id=target,
        mock_directory_ids=frozenset(
            facility.mock_facility_id for facility in catalogues.mock_directory.facilities
        ),
        now=now,
    )


def record_gate(db: Session, case: Case, decision: GateDecision, actor: str, now: datetime) -> None:
    record(
        db,
        AuditType.GATE_EVALUATED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        decision="ALLOW" if decision.allow else "DENY",
        reason_codes=list(decision.reason_codes),
        policy_version=decision.policy_version,
    )


def send_mock_referral(
    db: Session, case: Case, target: str, now: datetime, actor: str, catalogues: Catalogues
) -> tuple[GateDecision, Referral | None]:
    decision = evaluate_gate(gate_inputs(db, case, target, now, catalogues))
    record_gate(db, case, decision, actor, now)
    if not decision.allow:
        return decision, None

    draft = current_draft(db, case)
    assert draft is not None  # the gate passed, so an approved current draft exists
    content = content_of(draft)
    case_code = _unused_case_code(db)
    referral = Referral(
        referral_id=new_id("REF"),
        case_id=case.case_id,
        case_version=case.case_version,
        case_code=case_code,
        status="SIMULATED",
        mock_status=MockStatus.MOCK_SENT.value,
        care_type=content["triage_proposal"]["action"],
        target_mock_facility_id=target,
        # The approved snapshot is all the mock facility ever sees (AC-13.4).
        snapshot_json=json.dumps(
            {
                "case_code": case_code,
                "care_type": content["triage_proposal"]["action"],
                "reviewer_summary": content["clinician_summary"],
                "limits": [limit["text"] for limit in content["limits"]],
            }
        ),
        is_mock=True,
        created_at=now,
    )
    db.add(referral)
    db.flush()
    add_event(db, case, referral, MockStatus.MOCK_SENT, actor=SYSTEM, now=now)
    transition(db, case, CaseEvent.REQUEST_REFERRAL, actor, now)
    db.flush()
    return decision, referral


def add_event(
    db: Session,
    case: Case,
    referral: Referral,
    status: MockStatus,
    *,
    actor: str,
    now: datetime,
    reason_code: str | None = None,
    appointment_starts_at: datetime | None = None,
) -> ReferralEvent:
    event = ReferralEvent(
        event_id=new_id("EVT"),
        referral_id=referral.referral_id,
        mock_status=status.value,
        reason_code=reason_code,
        mock_appointment_starts_at=appointment_starts_at,
        actor=actor,
        verification_source="SIMULATED",
        verification_status="UNVERIFIED",
        is_mock=True,
        occurred_at=now,
        recorded_at=now,
    )
    db.add(event)
    referral.mock_status = status.value
    record(
        db,
        AuditType.REFERRAL_EVENT,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        referral_id=referral.referral_id,
        event_id=event.event_id,
        mock_status=status.value,
    )
    return event


def withdraw_live_referral(db: Session, case: Case, now: datetime) -> Referral | None:
    """Consent revoked in flight: the referral becomes MOCK_WITHDRAWN and its snapshot goes
    (OD-10, AC-13.4)."""
    referral = referral_for_case(db, case.case_id)
    if referral is None or MockStatus(referral.mock_status) not in LIVE_STATES:
        return None
    add_event(db, case, referral, MockStatus.MOCK_WITHDRAWN, actor=SYSTEM, now=now)
    referral.snapshot_json = None
    return referral


def events_for(db: Session, referral_id: str) -> list[ReferralEvent]:
    return (
        db.query(ReferralEvent)
        .filter(ReferralEvent.referral_id == referral_id)
        .order_by(ReferralEvent.id)
        .all()
    )


def referral_out(referral: Referral) -> dict[str, Any]:
    return {
        "referral_id": referral.referral_id,
        "case_id": referral.case_id,
        "case_version": referral.case_version,
        "status": referral.status,
        "mock_status": referral.mock_status,
        "care_type": referral.care_type,
        "target_mock_facility_id": referral.target_mock_facility_id,
        "is_mock": True,
        "created_at": referral.created_at,
    }


def event_out(event: ReferralEvent) -> dict[str, Any]:
    out: dict[str, Any] = {
        "event_id": event.event_id,
        "referral_id": event.referral_id,
        "mock_status": event.mock_status,
        "reason_code": event.reason_code,
        "mock_appointment": None,
        "occurred_at": event.occurred_at,
        "recorded_at": event.recorded_at,
        "actor": event.actor,
        "verification_source": event.verification_source,
        "verification_status": event.verification_status,
        "is_mock": True,
    }
    if event.mock_appointment_starts_at is not None:
        out["mock_appointment"] = {
            "starts_at": event.mock_appointment_starts_at,
            "label": MOCK_APPOINTMENT_LABEL,
        }
    return out


def _unused_case_code(db: Session) -> str:
    for _ in range(10):
        code = new_case_code()
        if db.query(Referral).filter(Referral.case_code == code).first() is None:
            return code
    raise RuntimeError("could not allocate a case code")
