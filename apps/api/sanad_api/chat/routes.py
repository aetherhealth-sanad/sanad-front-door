"""Chat endpoints (RF-21, T4.5, API design 6.13).

`GET /chat/assistant` tells the client how to label the assistant and whether typing is on.
`POST /cases/{id}/chat/interpret` takes one typed message for one intake question and returns
one of four outcomes. It never writes a fact: a proposal is saved only when the user confirms
it through `POST /cases/{id}/answers`.

Order of work for a typed message (PRD 4.7.1):

1. The order guard: patient token, active `assessment` consent, intake state.
2. Bounded decoding (P0), then the emergency text check (S0b). A hit moves the case to
   `EMERGENCY_GUIDANCE_ISSUED` with no model call (BR-06, PRD-AC-50).
3. Input checks (IG). A rejected message is never sent to the model.
4. The model adapter, if one is enabled, then the strict validator (V1).
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.cases.state_machine import CaseEvent, transition
from sanad_api.cases.views import state_view
from sanad_api.catalogues import Catalogues
from sanad_api.chat.guardrail import MAX_TEXT_CHARS, check, decode
from sanad_api.clock import Clock
from sanad_api.config import Settings
from sanad_api.deps import get_catalogues, get_clock, get_db, get_model_adapter, get_settings
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.intake.service import record_safety
from sanad_api.model_adapter import intake_extract
from sanad_api.model_adapter.port import ModelAdapter, ModelRequest, ModelResult, ModelStatus
from sanad_api.rules_engine.emergency import SafetyResult
from sanad_api.rules_engine.emergency_text import scan_text
from sanad_api.schemas import CaseStateOut

router = APIRouter(tags=["chat"])
logger = logging.getLogger("sanad.model")

ASSISTANT_LABEL = "Sanad assistant"
ASSISTANT_NOTE = "Scripted questions from a draft catalogue"
AI_MATCH_LABEL = "Matched by AI, not verified"
DISCLOSURE_VERSION = "MODEL-DISCLOSURE-0.1"
DISCLOSURE = (
    "Typing is optional. If you send typed text, Sanad sends it with the current question to "
    "{label} (Microsoft Azure) so it can suggest a matching answer. Sanad does not store the "
    "text. Microsoft handles it under its Azure OpenAI data terms. Do not type names, contact "
    "details or real health information. Answering with the buttons sends nothing to a model."
)

# Draft copy (T1.11 review pending). Fixed text chosen by code, never the user's words.
MESSAGES = {
    "EMERGENCY": "What you wrote may describe an urgent problem. Opening emergency guidance.",
    "PROPOSAL": "Check this answer. Nothing is saved until you confirm it.",
    "TEXT_EMPTY": "Type a short answer, or use the buttons.",
    "TEXT_LANGUAGE_NOT_SUPPORTED": (
        "Typing works in English only for now. Nothing was sent. Please use the buttons."
    ),
    "TEXT_CONTAINS_CONTACT_DETAILS": (
        "Please remove contact details such as email addresses or phone numbers. "
        "Nothing was sent."
    ),
    "MODEL_DISABLED": "Typing is not available. Please use the buttons.",
    "ABSTAIN_OUT_OF_SCOPE": (
        "I can only help with the current question here. Please use the buttons, or type a "
        "short answer to this question."
    ),
    "ABSTAIN_UNCLEAR": "I couldn't match that to one answer. Please choose one with the buttons.",
}
FALLBACK_MESSAGE = "I couldn't match that to an answer. Please choose one with the buttons."


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModelInfoOut(BaseModel):
    provider: str
    label: str
    match_label: str


class AssistantOut(BaseModel):
    assistant_label: str
    assistant_note: str
    copy_status: str
    typing_enabled: bool
    max_text_chars: int
    model: ModelInfoOut | None
    disclosure: str | None
    disclosure_version: str | None


@router.get("/chat/assistant", response_model=AssistantOut)
def assistant(adapter: ModelAdapter = Depends(get_model_adapter)) -> dict[str, Any]:
    enabled = adapter.enabled
    return {
        "assistant_label": ASSISTANT_LABEL,
        "assistant_note": ASSISTANT_NOTE,
        "copy_status": "DRAFT",
        "typing_enabled": enabled,
        "max_text_chars": MAX_TEXT_CHARS,
        "model": (
            {"provider": adapter.provider, "label": adapter.label, "match_label": AI_MATCH_LABEL}
            if enabled
            else None
        ),
        "disclosure": DISCLOSURE.format(label=adapter.label) if enabled else None,
        "disclosure_version": DISCLOSURE_VERSION if enabled else None,
    }


class InterpretIn(_In):
    question_id: str = Field(max_length=32)
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    disclosure_version: str | None = Field(default=None, max_length=32)


class ProposalOut(BaseModel):
    question_id: str
    choice: str
    value: bool | int | float | str | None
    temporal_status: str | None
    echo_label: str


class ProducedByOut(BaseModel):
    provider: str
    model_id: str
    label: str
    is_ai_generated: bool
    verification_status: str
    needs_user_confirmation: bool


class EmergencyOut(BaseModel):
    rule_ids: list[str]
    catalogue_version: str
    approval_status: str
    is_simulated: bool
    disclosure: str


class InterpretOut(BaseModel):
    outcome: Literal["EMERGENCY_GUIDANCE", "NEEDS_CORRECTION", "PROPOSAL", "FALLBACK"]
    reason_code: str | None
    message: str
    proposal: ProposalOut | None
    produced_by: ProducedByOut | None
    emergency: EmergencyOut | None
    state: CaseStateOut


def _out(
    outcome: str,
    reason_code: str | None,
    state: dict[str, Any],
    message_key: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    key = message_key or reason_code or outcome
    return {
        "outcome": outcome,
        "reason_code": reason_code,
        "message": MESSAGES.get(key, FALLBACK_MESSAGE),
        "proposal": None,
        "produced_by": None,
        "emergency": None,
        "state": state,
        **extra,
    }


def _run_model(adapter: ModelAdapter, request: ModelRequest) -> ModelResult:
    """An adapter bug must fail closed to the fallback form, and must not log the request."""
    try:
        return adapter.complete_json(request)
    except Exception as error:  # any failure means "no proposal"
        logger.error("model adapter failed: %s", type(error).__name__)
        return ModelResult(ModelStatus.UNAVAILABLE, None, 0, 0, "ADAPTER_ERROR")


@router.post("/cases/{case_id}/chat/interpret", response_model=InterpretOut)
def interpret_text(
    body: InterpretIn,
    request: Request,
    pc: PatientCase = Depends(guard(Action.INTERPRET_TEXT)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
    settings: Settings = Depends(get_settings),
    adapter: ModelAdapter = Depends(get_model_adapter),
) -> dict[str, Any]:
    case, actor, now = pc.case, pc.auth.actor, clock.now()
    text = decode(body.text)

    # S0b first. Nothing below may discard the text before this check (PRD 4.7.1).
    scan = scan_text(text, catalogues.emergency_text)
    if scan.triggered:
        transition(db, case, CaseEvent.EMERGENCY_TRIGGER, actor, now)
        record_safety(
            db, case, scan, SafetyResult.EMERGENCY_GUIDANCE_ISSUED, "CHAT_TEXT", actor, now
        )
        db.commit()
        text_catalogue = catalogues.emergency_text
        return _out(
            "EMERGENCY_GUIDANCE",
            None,
            state_view(db, case, catalogues),
            message_key="EMERGENCY",
            emergency={
                "rule_ids": list(scan.rule_ids),
                "catalogue_version": scan.catalogue_version,
                "approval_status": text_catalogue.approval_status,
                "is_simulated": text_catalogue.is_simulated,
                "disclosure": catalogues.emergency.disclosure,
            },
        )

    question = catalogues.intake_question(body.question_id)
    if question is None:  # safety questions are never sent to a model (AC-21.8)
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["UNKNOWN_QUESTION"])

    reason = check(text)
    if reason is not None:
        record(
            db,
            AuditType.INPUT_CHECKED,
            actor=actor,
            now=now,
            case_id=case.case_id,
            case_version=case.case_version,
            result="NEEDS_CORRECTION",
            reason_code=reason.value,
            origin="CHAT_TEXT",
            question_id=question.question_id,
        )
        db.commit()
        return _out("NEEDS_CORRECTION", reason.value, state_view(db, case, catalogues))

    if not adapter.enabled:
        return _out("FALLBACK", "MODEL_DISABLED", state_view(db, case, catalogues))
    if body.disclosure_version != DISCLOSURE_VERSION:
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["DISCLOSURE_NOT_ACKNOWLEDGED"])

    concept = catalogues.concepts[question.concept_code]
    request_id = str(getattr(request.state, "request_id", "req-unknown"))
    model_request = intake_extract.build_request(
        question,
        concept,
        text,
        request_id=request_id,
        catalogue_version=catalogues.questions.catalogue_version,
        settings=settings,
    )
    result = _run_model(adapter, model_request)
    interpretation = intake_extract.interpret(result, question, concept)
    proposal = interpretation.proposal
    record(
        db,
        AuditType.MODEL_TASK_RUN,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        request_id=request_id,
        task_id=intake_extract.TASK_ID,
        provider=adapter.provider,
        model_id=adapter.model_id,
        prompt_version=intake_extract.PROMPT_VERSION,
        schema_version=intake_extract.SCHEMA_VERSION,
        question_catalogue_version=catalogues.questions.catalogue_version,
        question_id=question.question_id,
        status=result.status.value,
        error_code=result.error_code,
        outcome="PROPOSAL" if proposal else interpretation.reason_code,
        attempts=result.attempts,
        elapsed_ms=result.elapsed_ms,
    )
    db.commit()
    state = state_view(db, case, catalogues)
    if proposal is None:
        return _out("FALLBACK", interpretation.reason_code, state)
    return _out(
        "PROPOSAL",
        None,
        state,
        proposal={
            "question_id": proposal.question_id,
            "choice": proposal.choice,
            "value": proposal.value,
            "temporal_status": proposal.temporal_status,
            "echo_label": intake_extract.echo_label(question, concept, proposal),
        },
        produced_by={
            "provider": adapter.provider,
            "model_id": adapter.model_id,
            "label": adapter.label,
            "is_ai_generated": True,
            "verification_status": "UNVERIFIED",
            "needs_user_confirmation": True,
        },
    )
