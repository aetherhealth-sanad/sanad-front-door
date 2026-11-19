"""Intake endpoints (API design sections 6.3 to 6.5 and 6.11)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StringConstraints,
)
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, deny_transition, record
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.cases.state_machine import CaseEvent, CaseState, transition
from sanad_api.cases.views import state_view
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.deps import get_catalogues, get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.facts.evidence import evidence_items
from sanad_api.facts.models import EvidenceSelection
from sanad_api.facts.service import (
    Supersede,
    build_view,
    current_facts,
    decode_value,
    fact_out,
    from_state,
    from_value,
    mark_facts_changed,
    value_problem,
    write_fact,
)
from sanad_api.gatekeeper.service import QuestionNeed
from sanad_api.intake import summary
from sanad_api.intake.service import (
    MAX_UPLOAD_BYTES,
    apply_profile,
    assess,
    assessment_context,
    check_profile,
    emergency_gate,
    gatekeeper_for,
    record_safety,
)
from sanad_api.review.service import open_clarifications
from sanad_api.rules_engine.emergency import SafetyResult, evaluate_responses
from sanad_api.schemas import CaseStateOut, RiskSignalOut, TriageProposalOut
from sanad_api.vocab import SCREENING_NOTICE, EntryPath, FieldState, SourceType

router = APIRouter(tags=["intake"])


@router.get("/cases/{case_id}/summary-file")
def export_summary(
    pc: PatientCase = Depends(guard(Action.EXPORT_SUMMARY)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> JSONResponse:
    """RF-28: the user's structured answers as a file they keep. Sanad keeps no copy."""
    now = clock.now()
    body = summary.build(db, pc.case.case_id, catalogues, now.date())
    record(
        db,
        AuditType.SUMMARY_EXPORTED,
        actor=pc.auth.actor,
        now=now,
        case_id=pc.case.case_id,
        case_version=pc.case.case_version,
        responses=len(body["responses"]),
        observations=len(body["observations"]),
    )
    db.commit()
    name = f"sanad-summary-{now.date().isoformat()}.json"
    return JSONResponse(
        body,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )

JSON_CONTENT_TYPES = {"", "application/json", "text/json", "text/plain", "application/octet-stream"}
ANSWER_TYPES = {
    "BOOLEAN": "BOOLEAN",
    "CHOICE": "SINGLE_CHOICE",
    "INTEGER": "INTEGER",
    "NUMBER": "NUMBER",
}


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _profile_loaded(
    db: Session, pc: PatientCase, mode: str, clock: Clock, catalogues: Catalogues
) -> None:
    case = pc.case
    if case.start_mode != mode or case.profile_applied:
        raise deny_transition(
            db,
            case_id=case.case_id,
            case_version=case.case_version,
            state=case.state,
            attempted_action=Action.LOAD_PROFILE.value,
            actor=pc.auth.actor,
            now=clock.now(),
        )


def _after_fact_write(
    db: Session, pc: PatientCase, catalogues: Catalogues, origin: str, now: datetime
) -> None:
    """The emergency gate runs straight after new facts arrive (AC-10.6, G6)."""
    result = emergency_gate(db, pc.case, catalogues, pc.auth.actor, now)
    if result.triggered:
        record_safety(
            db, pc.case, result, SafetyResult.EMERGENCY_GUIDANCE_ISSUED, origin, pc.auth.actor, now
        )


@router.post("/cases/{case_id}/profile/sample", response_model=CaseStateOut)
def load_sample(
    pc: PatientCase = Depends(guard(Action.LOAD_PROFILE)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    _profile_loaded(db, pc, "SAMPLE", clock, catalogues)
    sample = catalogues.samples.get(pc.case.fixture_id or "")
    if sample is None:
        raise ApiError(422, ErrorCode.UNKNOWN_SAMPLE)
    now = clock.now()
    profile = check_profile(sample.profile(), catalogues.upload_schema)
    apply_profile(db, pc.case, profile, SourceType.SAMPLE_FIXTURE, catalogues, now)
    _after_fact_write(db, pc, catalogues, "PROFILE", now)
    db.commit()
    return state_view(db, pc.case, catalogues)


@router.post("/cases/{case_id}/profile/upload", response_model=CaseStateOut)
def load_upload(
    file: UploadFile = File(...),
    pc: PatientCase = Depends(guard(Action.LOAD_PROFILE)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    _profile_loaded(db, pc, "UPLOAD", clock, catalogues)
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ApiError(413, ErrorCode.UPLOAD_TOO_LARGE)
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in JSON_CONTENT_TYPES:
        raise ApiError(415, ErrorCode.UPLOAD_WRONG_TYPE)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ApiError(415, ErrorCode.UPLOAD_WRONG_TYPE) from None
    now = clock.now()
    profile = check_profile(data, catalogues.upload_schema)
    apply_profile(db, pc.case, profile, SourceType.USER_UPLOADED, catalogues, now)
    _after_fact_write(db, pc, catalogues, "PROFILE", now)
    db.commit()
    return state_view(db, pc.case, catalogues)


class SafetyAnswerIn(_In):
    question_id: str = Field(max_length=32)
    response: Literal["YES", "NO", "NOT_SURE", "PREFER_NOT_TO_ANSWER"]


class SafetyCheckIn(_In):
    catalogue_version: str | None = Field(default=None, max_length=64)
    answers: list[SafetyAnswerIn] = Field(max_length=20)


class SafetyCheckOut(BaseModel):
    result: str
    rule_ids: list[str]
    catalogue_version: str
    approval_status: str
    disclosure: str
    needs_recheck: bool
    state: CaseStateOut


@router.post("/cases/{case_id}/safety-check", response_model=SafetyCheckOut)
def safety_check(
    body: SafetyCheckIn,
    pc: PatientCase = Depends(guard(Action.RUN_SAFETY_CHECK)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    question_ids = [answer.question_id for answer in body.answers]
    if len(question_ids) != len(set(question_ids)):
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["DUPLICATE_QUESTION"])
    case, actor, now = pc.case, pc.auth.actor, clock.now()
    emergency = catalogues.emergency
    current = {question.question_id: question for question in emergency.questions}
    wrote = False
    for answer in body.answers:
        question = current.get(answer.question_id)
        if question is None:
            continue  # from an older catalogue: ignored, never rejected
        mapped = emergency.response_values[answer.response]
        concept = catalogues.concepts[question.concept_code]
        fact = (
            from_value(question.concept_code, concept, mapped.value, None, question.question_id)
            if mapped.value is not None
            else from_state(question.concept_code, mapped.state, question.question_id)
        )
        write_fact(db, case.case_id, fact, SourceType.PATIENT_REPORTED, now, Supersede.SAME_SOURCE)
        wrote = True
    if wrote:
        mark_facts_changed(case, now)

    # A trigger always wins, whatever catalogue version the client used (API design 6.4).
    result = emergency_gate(db, case, catalogues, actor, now)
    missing = evaluate_responses(
        {answer.question_id: answer.response for answer in body.answers}, emergency
    ).missing_question_ids
    if result.triggered:
        outcome = SafetyResult.EMERGENCY_GUIDANCE_ISSUED
    elif missing:
        outcome = SafetyResult.NEEDS_RECHECK  # the case stays CONSENTED
    else:
        transition(db, case, CaseEvent.SAFETY_CLEAR, actor, now)
        outcome = SafetyResult.SAFE_TO_CONTINUE
    record_safety(db, case, result, outcome, "SAFETY_CHECK", actor, now)
    db.commit()
    return {
        "result": outcome.value,
        "rule_ids": list(result.rule_ids),
        "catalogue_version": emergency.catalogue_version,
        "approval_status": emergency.approval_status,
        "disclosure": emergency.disclosure,
        "needs_recheck": outcome is SafetyResult.NEEDS_RECHECK,
        "state": state_view(db, case, catalogues),
    }


class OptionOut(BaseModel):
    value: bool | str
    label: str


class ConflictingValueOut(BaseModel):
    value: bool | int | float | str | None
    unit: str | None
    temporal_status: str | None
    source_type: str
    recorded_at: datetime


class QuestionOut(BaseModel):
    question_id: str
    text: str
    answer_type: str
    unit: str | None
    options: list[OptionOut]
    temporal_options: list[OptionOut]
    opt_out_choices: list[str]
    reason: str
    blocking: bool
    conflicting_values: list[ConflictingValueOut]


class QuestionsOut(BaseModel):
    questions: list[QuestionOut]
    catalogue_version: str
    approval_status: str


def _question_out(need: QuestionNeed, catalogues: Catalogues) -> dict[str, Any]:
    question = need.question
    concept = catalogues.concepts[question.concept_code]
    return {
        "question_id": question.question_id,
        "text": question.text,
        "answer_type": ANSWER_TYPES[concept.value_type],
        "unit": concept.unit,
        "options": [option.model_dump() for option in question.options],
        "temporal_options": [option.model_dump() for option in question.temporal_options],
        "opt_out_choices": ["NOT_SURE", "PREFER_NOT_TO_ANSWER"],
        "reason": need.reason.value,
        "blocking": need.blocking,
        "conflicting_values": [
            {
                "value": decode_value(fact),
                "unit": fact.unit,
                "temporal_status": fact.temporal_status,
                "source_type": fact.source_type,
                "recorded_at": fact.recorded_at,
            }
            for fact in need.conflicting
        ],
    }


@router.get("/cases/{case_id}/questions", response_model=QuestionsOut)
def get_questions(
    pc: PatientCase = Depends(guard(Action.READ_QUESTIONS)),
    db: Session = Depends(get_db),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    ctx = assessment_context(db, pc.case, catalogues)
    # The first intake shows every open question. After that, only what blocks (AC-06.1).
    first_pass = pc.case.state == CaseState.ASSESSING
    result, _ = gatekeeper_for(db, pc.case, ctx, catalogues, EntryPath.FULL_INTAKE, first_pass)
    return {
        "questions": [_question_out(need, catalogues) for need in result.needs],
        "catalogue_version": catalogues.questions.catalogue_version,
        "approval_status": catalogues.questions.approval_status,
    }


class ProfileReviewFactOut(BaseModel):
    fact_id: str
    concept_code: str
    value: bool | int | float | str | None
    unit: str | None
    state: str
    polarity: str | None
    temporal_status: str | None
    source_type: str
    verification_status: str
    recorded_at: datetime


class ProfileReviewItemOut(BaseModel):
    question_id: str
    concept_code: str
    text: str
    answer_type: str
    unit: str | None
    options: list[OptionOut]
    temporal_options: list[OptionOut]
    state: str
    discrepancy_kind: str
    facts: list[ProfileReviewFactOut]


class ProfileReviewOut(BaseModel):
    case_id: str
    case_version: int
    catalogue_version: str
    items: list[ProfileReviewItemOut]


@router.get("/cases/{case_id}/review-profile", response_model=ProfileReviewOut)
def review_profile(
    pc: PatientCase = Depends(guard(Action.READ_PROFILE)),
    db: Session = Depends(get_db),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    """Patient-only view of persisted facts, independent of the open-question list.

    This read does not confirm, resolve, infer or write any health information.
    """
    facts = current_facts(db, pc.case.case_id)
    items = []
    for question in catalogues.questions.questions:
        view = build_view(question.concept_code, facts)
        items.append({
            "question_id": question.question_id,
            "concept_code": question.concept_code,
            "text": question.text,
            "answer_type": ANSWER_TYPES[catalogues.concepts[question.concept_code].value_type],
            "unit": catalogues.concepts[question.concept_code].unit,
            "options": [option.model_dump() for option in question.options],
            "temporal_options": [option.model_dump() for option in question.temporal_options],
            "state": view.state.value,
            "discrepancy_kind": view.discrepancy_kind.value,
            "facts": [fact_out(fact) for fact in view.current],
        })
    return {
        "case_id": pc.case.case_id,
        "case_version": pc.case.case_version,
        "catalogue_version": catalogues.questions.catalogue_version,
        "items": items,
    }


ChoiceValue = Annotated[str, StringConstraints(strict=True, max_length=32)]


class AnswerIn(_In):
    question_id: str = Field(max_length=32)
    choice: Literal["ANSWERED", "NOT_SURE", "PREFER_NOT_TO_ANSWER"]
    value: StrictBool | StrictInt | StrictFloat | ChoiceValue | None = None
    temporal_status: Literal["CURRENT", "PAST"] | None = None


class AnswersIn(_In):
    answers: list[AnswerIn] = Field(min_length=1, max_length=50)
    review_correction: bool = False
    expected_case_version: int | None = Field(default=None, ge=0)
    review_correction: bool = False
    expected_case_version: int | None = Field(default=None, ge=0)


def _answer_problem(answer: AnswerIn, catalogues: Catalogues) -> str | None:
    question = catalogues.answerable.get(answer.question_id)
    if question is None:
        return "UNKNOWN_QUESTION"
    if answer.choice != "ANSWERED":
        if answer.value is not None or answer.temporal_status is not None:
            return "VALUE_NOT_ALLOWED"
        return None
    if answer.value is None:
        return "VALUE_REQUIRED"
    return value_problem(
        catalogues.concepts[question.concept_code], answer.value, answer.temporal_status
    )


@router.post("/cases/{case_id}/answers", response_model=CaseStateOut)
def submit_answers(
    body: AnswersIn,
    pc: PatientCase = Depends(guard(Action.SUBMIT_ANSWERS)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    if body.review_correction:
        # Explicit correction from patient review overrides the previously imported/current
        # fact for this question, but only against the version the patient reviewed.
        if len(body.answers) != 1 or body.expected_case_version is None:
            raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["REVIEW_CORRECTION_VERSION_REQUIRED"])
        if body.expected_case_version != pc.case.case_version:
            raise ApiError(409, ErrorCode.CASE_VERSION_CONFLICT)
    question_ids = [answer.question_id for answer in body.answers]
    if len(question_ids) != len(set(question_ids)):
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["DUPLICATE_QUESTION"])
    problems = sorted({p for p in (_answer_problem(a, catalogues) for a in body.answers) if p})
    if problems:
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, problems)

    case, now = pc.case, clock.now()
    clarifications = {c.question_id: c for c in open_clarifications(db, case.case_id)}
    facts = current_facts(db, case.case_id)
    for answer in body.answers:
        question = catalogues.answerable[answer.question_id]
        code = question.concept_code
        if answer.choice == "ANSWERED":
            assert answer.value is not None
            fact = from_value(
                code,
                catalogues.concepts[code],
                answer.value,
                answer.temporal_status,
                question.question_id,
            )
        else:
            state = FieldState.UNKNOWN if answer.choice == "NOT_SURE" else FieldState.DECLINED
            fact = from_state(code, state, question.question_id)
        # Answering a conflicting or clarified question is the user's resolution. Otherwise
        # facts from other sources stay, and a disagreement reads CONFLICTING (AC-06.3).
        resolving = (
            body.review_correction
            or build_view(code, facts).state is FieldState.CONFLICTING
            or answer.question_id in clarifications
        )
        supersede = Supersede.ALL if resolving else Supersede.SAME_SOURCE
        write_fact(db, case.case_id, fact, SourceType.PATIENT_REPORTED, now, supersede)
        if answer.question_id in clarifications:
            clarifications[answer.question_id].resolved_at = now
    mark_facts_changed(case, now)
    _after_fact_write(db, pc, catalogues, "FOLLOW_UP_FORM", now)  # AC-06.6
    db.commit()
    return state_view(db, case, catalogues)


class AssessIn(_In):
    entry_path: EntryPath = EntryPath.FULL_INTAKE


class AssessOut(BaseModel):
    gatekeeper_status: str | None
    blocking_question_ids: list[str]
    risk_signals: list[RiskSignalOut]
    triage_proposal: TriageProposalOut | None
    draft_ready: bool
    screening_notice: str
    state: CaseStateOut


@router.post("/cases/{case_id}/assess", response_model=AssessOut)
def run_assessment(
    body: AssessIn,
    pc: PatientCase = Depends(guard(Action.ASSESS)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    outcome = assess(db, pc.case, body.entry_path, catalogues, pc.auth.actor, clock.now())
    db.commit()
    content = json.loads(outcome.draft.content_json) if outcome.draft else None
    return {
        "gatekeeper_status": outcome.gatekeeper.status.value if outcome.gatekeeper else None,
        "blocking_question_ids": (
            list(outcome.gatekeeper.blocking_question_ids) if outcome.gatekeeper else []
        ),
        "risk_signals": content["risk_signals"] if content else [],
        "triage_proposal": content["triage_proposal"] if content else None,
        "draft_ready": content is not None,
        "screening_notice": SCREENING_NOTICE,
        "state": state_view(db, pc.case, catalogues),
    }


class EvidenceChoiceIn(_In):
    item_id: str = Field(max_length=32)
    use: StrictBool


class EvidenceSelectionIn(_In):
    items: list[EvidenceChoiceIn] = Field(min_length=1, max_length=10)


class EvidenceItemOut(BaseModel):
    item_id: str
    kind: str
    use: bool
    used_in_assessment: bool
    concept_codes: list[str]


class EvidenceSelectionOut(BaseModel):
    items: list[EvidenceItemOut]
    state: CaseStateOut


@router.put("/cases/{case_id}/evidence-selection", response_model=EvidenceSelectionOut)
def select_evidence(
    body: EvidenceSelectionIn,
    pc: PatientCase = Depends(guard(Action.SELECT_EVIDENCE)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    case, now = pc.case, clock.now()
    listed = {
        item.item_id: item
        for item in evidence_items(db, case.case_id, current_facts(db, case.case_id), catalogues)
    }
    if any(choice.item_id not in listed for choice in body.items):
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["UNKNOWN_ITEM"])
    changed = False
    for choice in body.items:
        if listed[choice.item_id].use == choice.use:
            continue
        row = (
            db.query(EvidenceSelection)
            .filter(
                EvidenceSelection.case_id == case.case_id,
                EvidenceSelection.item_id == choice.item_id,
            )
            .one_or_none()
        )
        if row is None:
            row = EvidenceSelection(case_id=case.case_id, item_id=choice.item_id)
            db.add(row)
        row.use = choice.use
        row.updated_at = now
        changed = True
    if changed:
        mark_facts_changed(case, now)  # a selection counts as a fact change (API design 4)
    db.flush()
    items = evidence_items(db, case.case_id, current_facts(db, case.case_id), catalogues)
    db.commit()
    return {
        "items": [
            {
                "item_id": item.item_id,
                "kind": item.kind,
                "use": item.use,
                "used_in_assessment": item.used_in_assessment,
                "concept_codes": list(item.concept_codes),
            }
            for item in items
        ],
        "state": state_view(db, case, catalogues),
    }
