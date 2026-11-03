"""Patient report endpoint (API design section 6.5)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.deps import get_db
from sanad_api.errors import ApiError, ErrorCode
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


@router.get("/cases/{case_id}/report", response_model=PatientReportOut)
def get_report(
    pc: PatientCase = Depends(guard(Action.READ_REPORT)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    draft = current_draft(db, pc.case)
    if draft is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    return patient_report(pc.case, draft, latest_decision(db, pc.case.case_id))
