"""Patient report endpoint (API design section 6.5) and the optional explanation (section 6.14).

The explanation (RF-22) runs only on a released report and never changes it: the draft, report
hash, approval, case state and case version stay as they were, and no model text is stored.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.cases.state_machine import CaseState
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.config import Settings
from sanad_api.deps import get_catalogues, get_clock, get_db, get_model_adapter, get_settings
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.model_adapter import report_explain, runs
from sanad_api.model_adapter.port import ModelAdapter, run_safely
from sanad_api.navigation.service import get_or_create_episode
from sanad_api.psychosocial.models import PsychosocialSelfReport
from sanad_api.reports.drafts import citation_of, curated_passages
from sanad_api.reports.service import content_of, current_draft, is_released, patient_report
from sanad_api.review.service import latest_decision
from sanad_api.schemas import (
    CitationOut,
    EvidenceOut,
    KnownFactOut,
    LimitOut,
    ReportObservationOut,
    UnknownFieldOut,
)
from sanad_api.vocab import TriageAction

router = APIRouter(tags=["reports"])
AI_DRAFT_LABEL = "AI draft — Mock review"


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


class ExplanationSentenceOut(BaseModel):
    text: str
    passage_ids: list[str]


class ExplanationProducerOut(BaseModel):
    provider: str
    model_id: str
    label: str
    is_ai_generated: bool
    verification_status: str


class ExplanationOut(BaseModel):
    outcome: str  # AI_DRAFT or FALLBACK
    reason_code: str | None
    next_step_label: str
    fallback_text: str
    sentences: list[ExplanationSentenceOut]
    citations: list[CitationOut]
    label: str | None
    produced_by: ExplanationProducerOut | None


@router.post("/cases/{case_id}/report/explanation", response_model=ExplanationOut)
def explain_report(
    request: Request,
    pc: PatientCase = Depends(guard(Action.READ_REPORT)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
    settings: Settings = Depends(get_settings),
    adapter: ModelAdapter = Depends(get_model_adapter),
) -> dict[str, Any]:
    """RF-22, AC-22.5 to AC-22.10. Computed on each call; writes nothing to the case."""
    case = pc.case
    draft = current_draft(db, case)
    if draft is None:
        raise ApiError(409, ErrorCode.DRAFT_NOT_CURRENT)
    if not is_released(case, latest_decision(db, case.case_id)):
        raise ApiError(409, ErrorCode.REPORT_NOT_RELEASED)
    content = content_of(draft)
    label_text = str(content["next_step_label"])
    base = {
        "next_step_label": label_text,
        "fallback_text": str(content["why_next_step"]),
        "sentences": [],
        "label": None,
        "produced_by": None,
    }
    rules = {rule.rule_id: rule for rule in catalogues.triage.rules}
    floor_rule_ids = list(content["triage_proposal"]["rule_ids"])
    passages = [
        passage
        for rule_id in floor_rule_ids
        if rule_id in rules
        for passage in curated_passages(rules[rule_id], catalogues)
    ]
    citations = [citation_of(passage) for passage in passages]

    def fallback(code: str) -> dict[str, Any]:
        return {**base, "outcome": "FALLBACK", "reason_code": code, "citations": citations}

    if not adapter.enabled:
        return fallback("MODEL_DISABLED")
    if content["edited_by_reviewer"]:
        return fallback("REVIEWER_EDITED")
    if not passages:
        return fallback("NO_CURATED_PASSAGES")

    request_id = str(getattr(request.state, "request_id", "req-unknown"))
    if not runs.budget_left(db, case.case_id, settings.model_max_calls_per_case):  # AC-23.7
        runs.record_refusal(
            db,
            actor=pc.auth.actor,
            now=clock.now(),
            case_id=case.case_id,
            case_version=case.case_version,
            request_id=request_id,
            task_id=report_explain.TASK_ID,
            provider=adapter.provider,
            model_id=adapter.model_id,
        )
        return fallback(runs.BUDGET_REASON)

    action = TriageAction(content["triage_proposal"]["action"])
    signals = sorted(
        {s["code"] for s in content["risk_signals"] if s["rule_id"] in floor_rule_ids}
    )
    passage_version = catalogues.passages.catalogue_version
    model_request = report_explain.build_request(
        next_step_label=label_text,
        signals=signals,
        passages=passages,
        request_id=request_id,
        passage_catalogue_version=passage_version,
        settings=settings,
    )
    result = run_safely(adapter, model_request)
    explanation = report_explain.validate(result, [p.passage_id for p in passages], action)
    outcome = "AI_DRAFT" if explanation.sentences else "FALLBACK"
    record(
        db,
        AuditType.MODEL_TASK_RUN,
        actor=pc.auth.actor,
        now=clock.now(),
        case_id=case.case_id,
        case_version=case.case_version,
        request_id=request_id,
        task_id=report_explain.TASK_ID,
        provider=adapter.provider,
        model_id=adapter.model_id,
        prompt_version=report_explain.PROMPT_VERSION,
        schema_version=report_explain.SCHEMA_VERSION,
        rule_version=content["rule_version"],
        passage_catalogue_version=passage_version,
        status=result.status.value,
        error_code=result.error_code,
        outcome=outcome if explanation.sentences else explanation.reason_code,
        attempts=result.attempts,
        elapsed_ms=result.elapsed_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    db.commit()
    if not explanation.sentences:
        return fallback(explanation.reason_code or report_explain.INVALID)
    return {
        **base,
        "outcome": "AI_DRAFT",
        "reason_code": None,
        "sentences": list(explanation.sentences),
        "citations": citations,
        "label": AI_DRAFT_LABEL,
        "produced_by": {
            "provider": adapter.provider,
            "model_id": adapter.model_id,
            "label": adapter.label,
            "is_ai_generated": True,
            "verification_status": "UNVERIFIED",
        },
    }


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
