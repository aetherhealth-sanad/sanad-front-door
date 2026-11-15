"""Send for review and the simulated clinician review (API design section 6.6).

The patient's "Send to care facility (Mock)" button asks for a review. It is not the referral,
needs no `provider_share` and creates no referral (AC-07.5). Every reviewer is simulated, so an
approval is stored as SIMULATED_APPROVAL with reviewer type SIMULATED (HR-16). Nothing is ever
approved automatically, including an overdue case (HR-15).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, deny_transition, record
from sanad_api.auth.deps import AuthContext, require_reviewer
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseEvent, CaseState, transition
from sanad_api.cases.views import state_view
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.config import Settings
from sanad_api.consent.service import is_active
from sanad_api.deps import get_catalogues, get_clock, get_db, get_settings
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.facts.service import fact_out
from sanad_api.ids import new_id
from sanad_api.intake.service import assessment_context
from sanad_api.observations.service import observation_out
from sanad_api.psychosocial.models import PsychosocialSelfReport
from sanad_api.reports.drafts import apply_reviewer_edit
from sanad_api.reports.service import REVIEWER_EDIT, content_of, current_draft, store_draft
from sanad_api.review import decision_record
from sanad_api.review.models import ClarificationRequest, ReviewDecision, ReviewRequest
from sanad_api.review.service import (
    DECIDED,
    PENDING,
    SIMULATED,
    SIMULATED_APPROVAL,
    decisions_for,
    has_any_request,
    pending_request,
)
from sanad_api.rules_engine.floor import is_below_floor
from sanad_api.schemas import (
    CaseStateOut,
    EvidenceOut,
    FactOut,
    FlagOut,
    LimitOut,
    ObservationOut,
    RiskSignalOut,
    TriageProposalOut,
    UnknownFieldOut,
)
from sanad_api.tracking.delay import case_flag
from sanad_api.vocab import DRAFT_LABEL, SCREENING_NOTICE, ConsentScope, TriageAction

router = APIRouter(tags=["review"])


class ReviewRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_version: int = Field(ge=1)


class ReviewRequestOut(BaseModel):
    review_request_id: str
    is_mock: bool
    state: CaseStateOut


@router.post("/cases/{case_id}/review-requests", status_code=201, response_model=ReviewRequestOut)
def send_for_review(
    body: ReviewRequestIn,
    response: Response,
    pc: PatientCase = Depends(guard(Action.SEND_FOR_REVIEW)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    case, actor, now = pc.case, pc.auth.actor, clock.now()
    if body.case_version != case.case_version:
        raise ApiError(409, ErrorCode.CASE_VERSION_CONFLICT)
    existing = pending_request(db, case.case_id)
    if existing is not None:
        response.status_code = 200  # a repeat tap creates no duplicate (AC-07.4)
        return _request_out(db, existing, case, catalogues)
    if current_draft(db, case) is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    request = ReviewRequest(
        review_request_id=new_id("RR"),
        case_id=case.case_id,
        case_version=case.case_version,
        status=PENDING,
        requested_at=now,
        closed_at=None,
    )
    db.add(request)
    transition(db, case, CaseEvent.SEND_FOR_REVIEW, actor, now)
    record(
        db,
        AuditType.REVIEW_REQUESTED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        review_request_id=request.review_request_id,
    )
    db.commit()
    return _request_out(db, request, case, catalogues)


def _request_out(
    db: Session, request: ReviewRequest, case: Case, catalogues: Catalogues
) -> dict[str, Any]:
    return {
        "review_request_id": request.review_request_id,
        "is_mock": True,
        "state": state_view(db, case, catalogues),
    }


@dataclass(frozen=True)
class ReviewerCase:
    case: Case
    auth: AuthContext


def reviewer_case(
    case_id: str, auth: AuthContext = Depends(require_reviewer), db: Session = Depends(get_db)
) -> ReviewerCase:
    """A case the reviewer may see: sent for review, with clinician_review active now."""
    case = db.get(Case, case_id)
    if (
        case is None
        or not is_active(db, case_id, ConsentScope.CLINICIAN_REVIEW)
        or not has_any_request(db, case_id)
    ):
        raise ApiError(404, ErrorCode.NOT_FOUND)
    return ReviewerCase(case=case, auth=auth)


def _flag(db: Session, case: Case, clock: Clock, settings: Settings) -> dict[str, Any] | None:
    flag = case_flag(db, case, clock.now(), settings.delayed_flag_seconds)
    return flag.to_json() if flag else None


class QueueItemOut(BaseModel):
    case_id: str
    case_version: int
    sent_at: datetime
    triage_action: str | None
    tracking_flag: FlagOut | None


class QueueOut(BaseModel):
    review_mode: Literal["SIMULATED"]
    is_mock: bool
    items: list[QueueItemOut]


@router.get("/reviews/queue", response_model=QueueOut)
def review_queue(
    auth: AuthContext = Depends(require_reviewer),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    items = []
    pending = db.query(Case).filter(Case.state == CaseState.PENDING_CLINICIAN_REVIEW.value).all()
    for case in pending:
        request = pending_request(db, case.case_id)
        if request is None or not is_active(db, case.case_id, ConsentScope.CLINICIAN_REVIEW):
            continue  # a revoked case leaves the queue at once (AC-08.6)
        draft = current_draft(db, case)
        items.append(
            {
                "case_id": case.case_id,
                "case_version": case.case_version,
                "sent_at": request.requested_at,
                "triage_action": content_of(draft)["triage_proposal"]["action"] if draft else None,
                "tracking_flag": _flag(db, case, clock, settings),
            }
        )
    items.sort(key=lambda item: (item["sent_at"], item["case_id"]))
    return {"review_mode": "SIMULATED", "is_mock": True, "items": items}


class DecisionHistoryOut(BaseModel):
    review_id: str
    decision: str
    kind: str | None
    reason_code: str | None
    note: str | None
    question_ids: list[str]
    case_version: int
    reviewer_type: str
    actor: str
    decided_at: datetime
    expires_at: datetime | None


class ReviewDetailOut(BaseModel):
    case_id: str
    case_version: int
    state: str
    review_mode: Literal["SIMULATED"]
    is_mock: bool
    draft_label: str
    screening_notice: str
    facts: list[FactOut]
    excluded_items: list[str]
    observations: list[ObservationOut]
    unknown_fields: list[UnknownFieldOut]
    risk_signals: list[RiskSignalOut]
    triage_proposal: TriageProposalOut | None
    evidence: list[EvidenceOut]
    limits: list[LimitOut]
    clinician_summary_draft: str | None
    decision_history: list[DecisionHistoryOut]
    tracking_flag: FlagOut | None
    psychosocial_context: list[dict[str, Any]]
    psychosocial_context_use: str
    # RF-24: what the draft rests on, rebuilt from stored data on each read. Reviewer only.
    decision_record: dict[str, Any] | None


def _decision_out(decision: ReviewDecision) -> dict[str, Any]:
    return {
        "review_id": decision.review_id,
        "decision": decision.decision,
        "kind": decision.kind,
        "reason_code": decision.reason_code,
        "note": decision.note,
        "question_ids": json.loads(decision.question_ids_json),
        "case_version": decision.case_version,
        "reviewer_type": decision.reviewer_type,
        "actor": decision.actor,
        "decided_at": decision.decided_at,
        "expires_at": decision.expires_at,
    }


@router.get("/reviews/{case_id}", response_model=ReviewDetailOut)
def review_detail(
    rc: ReviewerCase = Depends(reviewer_case),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    case = rc.case
    ctx = assessment_context(db, case, catalogues)
    draft = current_draft(db, case)
    content = content_of(draft) if draft else None
    psychosocial = (
        db.query(PsychosocialSelfReport)
        .filter_by(case_id=case.case_id)
        .order_by(PsychosocialSelfReport.question_id)
        .all()
    )
    return {
        "case_id": case.case_id,
        "case_version": case.case_version,
        "state": case.state,
        "review_mode": "SIMULATED",
        "is_mock": True,
        "draft_label": DRAFT_LABEL,
        "screening_notice": SCREENING_NOTICE,
        # Items the user excluded are not shown, only named (AC-16.1).
        "facts": [fact_out(f) for f in ctx.facts if f.concept_code not in ctx.excluded],
        "excluded_items": [item.item_id for item in ctx.items if not item.use],
        "observations": [
            observation_out(o, used=o.observation_id in ctx.used_observation_ids)
            for o in ctx.observations
        ],
        "unknown_fields": content["unknown"] if content else [],
        "risk_signals": content["risk_signals"] if content else [],
        "triage_proposal": content["triage_proposal"] if content else None,
        "evidence": content["evidence"] if content else [],
        "limits": content["limits"] if content else [],
        "clinician_summary_draft": content["clinician_summary"] if content else None,
        "decision_history": [_decision_out(d) for d in decisions_for(db, case.case_id)],
        "tracking_flag": _flag(db, case, clock, settings),
        "psychosocial_context": [
            {
                "question_id": row.question_id,
                "response_code": row.response_code,
                "response_state": row.response_state,
                "reference_period": row.reference_period,
                "source_type": row.source_type,
                "verification_status": row.verification_status,
            }
            for row in psychosocial
        ],
        "psychosocial_context_use": "CONTEXT_ONLY_NOT_TRIAGE",
        "decision_record": (
            decision_record.build(db, case.case_id, ctx, draft, content, catalogues, clock.now())
            if draft and content
            else None
        ),
    }


class ReviewReason(StrEnum):
    CONTEXT_UPDATED = "CONTEXT_UPDATED"
    INSUFFICIENT_INFORMATION = "INSUFFICIENT_INFORMATION"
    CONFLICTING_INFORMATION = "CONFLICTING_INFORMATION"
    OUTSIDE_SERVICE_SCOPE = "OUTSIDE_SERVICE_SCOPE"
    TEST_OR_DUPLICATE_CASE = "TEST_OR_DUPLICATE_CASE"
    OTHER = "OTHER"


# A reviewer cannot issue emergency guidance. That comes only from the emergency gate.
ReviewableAction = Literal[
    "PRIORITY_REVIEW", "SPECIALIST", "PRIMARY_CARE", "EDUCATION", "NEEDS_MORE_INFORMATION"
]


class EditsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    triage_action: ReviewableAction | None = None
    clinician_summary: str | None = Field(default=None, min_length=1, max_length=2000)


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["APPROVE", "EDIT", "REJECT", "REQUEST_CLARIFICATION"]
    case_version: int = Field(ge=1)
    reason_code: ReviewReason | None = None
    note: str | None = Field(default=None, max_length=500)
    edits: EditsIn | None = None
    question_ids: list[str] | None = Field(default=None, max_length=20)


class DecisionOut(BaseModel):
    review_id: str
    kind: str | None
    is_mock: bool
    case_version: int
    state: str


def _check_decision_body(body: DecisionIn, catalogues: Catalogues) -> None:
    if body.decision == "REJECT" and body.reason_code is None:
        raise ApiError(422, ErrorCode.REASON_REQUIRED)
    if body.decision == "EDIT" and (
        body.edits is None
        or (body.edits.triage_action is None and body.edits.clinician_summary is None)
    ):
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["EDITS_REQUIRED"])
    if body.decision == "REQUEST_CLARIFICATION":
        ids = body.question_ids or []
        if not ids or len(ids) != len(set(ids)):
            raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["QUESTION_IDS_REQUIRED"])
        if any(catalogues.intake_question(question_id) is None for question_id in ids):
            raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["UNKNOWN_QUESTION"])


@router.post("/reviews/{case_id}/decision", response_model=DecisionOut)
def record_decision(
    body: DecisionIn,
    rc: ReviewerCase = Depends(reviewer_case),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    case, actor, now = rc.case, rc.auth.actor, clock.now()
    if case.state != CaseState.PENDING_CLINICIAN_REVIEW:
        raise deny_transition(
            db,
            case_id=case.case_id,
            case_version=case.case_version,
            state=case.state,
            attempted_action=f"REVIEW_{body.decision}",
            actor=actor,
            now=now,
        )
    _check_decision_body(body, catalogues)
    if body.case_version != case.case_version:
        raise ApiError(409, ErrorCode.CASE_VERSION_CONFLICT)  # overwrites nothing (AC-08.5)
    draft = current_draft(db, case)
    request = pending_request(db, case.case_id)
    if draft is None or request is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    content = content_of(draft)
    if body.decision == "EDIT" and body.edits and body.edits.triage_action is not None:
        floor = content["triage_proposal"]["floor"]
        if is_below_floor(
            TriageAction(body.edits.triage_action),
            TriageAction(floor) if floor else None,
            catalogues.triage.action_rank,
        ):
            raise ApiError(422, ErrorCode.TRIAGE_BELOW_FLOOR)  # AC-08.7

    approving = body.decision == "APPROVE"
    decision = ReviewDecision(
        review_id=new_id("REV"),
        case_id=case.case_id,
        review_request_id=request.review_request_id,
        case_version=case.case_version,
        decision=body.decision,
        kind=SIMULATED_APPROVAL if approving else None,
        reason_code=body.reason_code.value if body.reason_code else None,
        note=body.note,
        question_ids_json=json.dumps(body.question_ids or []),
        # HR-11: an approval is bound to this report's content and expires.
        report_hash=draft.report_hash if approving else None,
        expires_at=now + timedelta(seconds=settings.approval_ttl_seconds) if approving else None,
        reviewer_type=SIMULATED,
        actor=actor,
        decided_at=now,
    )
    db.add(decision)
    db.flush()
    decided_version = case.case_version

    if approving:
        request.status, request.closed_at = DECIDED, now
        for event in (
            CaseEvent.REVIEW_APPROVED,
            CaseEvent.RELEASE_REPORT,
            CaseEvent.ISSUE_GUIDANCE,
        ):
            transition(db, case, event, actor, now)
    elif body.decision == "REJECT":
        request.status, request.closed_at = DECIDED, now
        transition(db, case, CaseEvent.REVIEW_REJECTED, actor, now)
    elif body.decision == "REQUEST_CLARIFICATION":
        request.status, request.closed_at = DECIDED, now
        for question_id in body.question_ids or []:
            db.add(
                ClarificationRequest(
                    case_id=case.case_id,
                    question_id=question_id,
                    review_id=decision.review_id,
                    requested_at=now,
                    resolved_at=None,
                )
            )
        transition(db, case, CaseEvent.CLARIFICATION_REQUESTED, actor, now)
    else:
        # EDIT is not an approval. It raises the version, so APPROVE must follow on it (G5).
        assert body.edits is not None
        case.case_version += 1
        case.updated_at = now
        edited = apply_reviewer_edit(
            content,
            case_version=case.case_version,
            triage_action=body.edits.triage_action,
            summary=body.edits.clinician_summary,
            catalogues=catalogues,
        )
        store_draft(db, case, edited, REVIEWER_EDIT, now)

    record(
        db,
        AuditType.REVIEW_DECIDED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=decided_version,
        review_id=decision.review_id,
        decision=body.decision,
        kind=decision.kind,
        reason_code=decision.reason_code,
        reviewer_type=SIMULATED,
    )
    db.commit()
    return {
        "review_id": decision.review_id,
        "kind": decision.kind,
        "is_mock": True,
        "case_version": case.case_version,
        "state": case.state,
    }
