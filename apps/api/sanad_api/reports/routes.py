"""Patient report endpoint (API design section 6.5)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.cases.state_machine import CaseState
from sanad_api.clock import Clock
from sanad_api.deps import get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.navigation.service import get_or_create_episode
from sanad_api.psychosocial.models import PsychosocialSelfReport
from sanad_api.reports.service import current_draft, patient_report
from sanad_api.review.service import latest_decision
from sanad_api.schemas import (
    EvidenceOut,
    KnownFactOut,
    LimitOut,
    ReportObservationOut,
    UnknownFieldOut,
)

router = APIRouter(tags=["reports"])


class NextStepOut(BaseModel):
    action: str
    label: str
    is_mock: bool


class PatientReportOut(BaseModel):
    report_type: str
    draft_label: str
    screening_notice: str
    review_status: str
    is_mock: bool
    rule_version: str
    rule_approval_status: str
    known: list[KnownFactOut]
    unknown: list[UnknownFieldOut]
    excluded_items: list[str]
    observations: list[ReportObservationOut]
    limits: list[LimitOut]
    why_next_step: str | None
    who_approves: str
    next_step: NextStepOut | None
    next_step_withheld: str | None
    evidence: list[EvidenceOut]
    required_statements: list[str]
    genetics_support_available: bool
    guidance_id: str | None
    guidance_version: str | None
    psychosocial_context: list[dict[str, Any]]
    psychosocial_context_use: str


@router.get("/cases/{case_id}/report", response_model=PatientReportOut)
def get_report(
    pc: PatientCase = Depends(guard(Action.READ_REPORT)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    draft = current_draft(db, pc.case)
    if draft is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    output = patient_report(pc.case, draft, latest_decision(db, pc.case.case_id))
    rows = (
        db.query(PsychosocialSelfReport)
        .filter_by(case_id=pc.case.case_id)
        .order_by(PsychosocialSelfReport.question_id)
        .all()
    )
    output["psychosocial_context"] = [
        {
            "question_id": row.question_id,
            "response_code": row.response_code,
            "response_state": row.response_state,
            "reference_period": row.reference_period,
            "source_type": row.source_type,
            "verification_status": row.verification_status,
            "consent_scope": row.consent_scope,
            "collected_at": row.collected_at,
        }
        for row in rows
    ]
    output["psychosocial_context_use"] = "CONTEXT_ONLY_NOT_TRIAGE"
    if pc.case.state in {CaseState.GUIDANCE_AVAILABLE, CaseState.NAVIGATION_STARTED}:
        get_or_create_episode(
            db,
            case_id=pc.case.case_id,
            session_token_hash=pc.auth.token_hash,
            guidance_id=output["guidance_id"],
            guidance_version=output["guidance_version"],
            now=clock.now(),
        )
        db.commit()
    return output
