"""Stores drafts and builds the patient view of the current one.

Nothing that needs approval is shown before approval: `next_step` and `why_next_step` stay null
until guidance is released (AC-08.9, PRD-AC-14).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseState
from sanad_api.reports.drafts import report_hash
from sanad_api.reports.models import Draft
from sanad_api.review.models import ReviewDecision
from sanad_api.vocab import SCREENING_NOTICE, WHO_APPROVES

RULES = "RULES"
REVIEWER_EDIT = "REVIEWER_EDIT"


def current_draft(db: Session, case: Case) -> Draft | None:
    if case.current_draft_id is None:
        return None
    draft = db.get(Draft, case.current_draft_id)
    if draft is None or draft.case_version != case.case_version:
        return None
    return draft


def content_of(draft: Draft) -> dict[str, Any]:
    content: dict[str, Any] = json.loads(draft.content_json)
    return content


def store_draft(
    db: Session, case: Case, content: dict[str, Any], origin: str, now: datetime
) -> Draft:
    digest = report_hash(content)
    existing = current_draft(db, case)
    if existing is not None and existing.report_hash == digest:
        return existing  # same inputs and rule version give the same draft (AC-11.5)
    draft = Draft(
        case_id=case.case_id,
        case_version=case.case_version,
        content_json=json.dumps(content, sort_keys=True),
        report_hash=digest,
        origin=origin,
        created_at=now,
    )
    db.add(draft)
    db.flush()
    case.current_draft_id = draft.id
    return draft


def is_released(case: Case, decision: ReviewDecision | None) -> bool:
    return (
        decision is not None
        and decision.decision == "APPROVE"
        and decision.case_version == case.case_version
        and case.state != CaseState.CONSENT_REVOKED
    )


def review_status(case: Case, decision: ReviewDecision | None) -> str:
    if case.state == CaseState.PENDING_CLINICIAN_REVIEW:
        return "PENDING_CLINICIAN_REVIEW"
    if case.state == CaseState.REVISION_REQUIRED:
        return "REVISION_REQUIRED"
    if is_released(case, decision):
        return "SIMULATED_APPROVAL"
    if decision is not None and decision.decision == "REJECT":
        return "REJECTED"
    return "NOT_SENT"


def patient_report(case: Case, draft: Draft, decision: ReviewDecision | None) -> dict[str, Any]:
    content = content_of(draft)
    released = is_released(case, decision)
    status = review_status(case, decision)
    proposal = content["triage_proposal"]
    return {
        "report_type": "PATIENT",
        "draft_label": content["draft_label"],
        "screening_notice": SCREENING_NOTICE,
        "review_status": status,
        "is_mock": True,
        "rule_version": content["rule_version"],
        "rule_approval_status": content["rule_approval_status"],
        "known": content["known"],
        "unknown": content["unknown"],
        "excluded_items": content["excluded_items"],
        "observations": content["observations"],
        "limits": content["limits"],
        "why_next_step": content["why_next_step"] if released else None,
        "who_approves": WHO_APPROVES,
        "next_step": (
            {"action": proposal["action"], "label": content["next_step_label"], "is_mock": True}
            if released
            else None
        ),
        "next_step_withheld": (
            None if released else ("REVIEW_REJECTED" if status == "REJECTED" else "PENDING_REVIEW")
        ),
        "evidence": content["evidence"],
        "required_statements": content["required_statements"],
        "genetics_support_available": content["genetics_support_available"],
    }
