"""Optional psychosocial micro-intake (PRD-FR-29/30; BR-34 to BR-37).

Only explicitly submitted, assessment-consented self-reports are stored. They are not added to
the canonical clinical facts used by the rules engine and cannot change triage.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.catalogues import read_json
from sanad_api.clock import Clock
from sanad_api.config import Settings
from sanad_api.deps import get_clock, get_db, get_settings
from sanad_api.psychosocial.models import PsychosocialSelfReport

router = APIRouter(tags=["psychosocial"])

QUESTION_IDS = ("PSY-STRESS-01", "PSY-SLEEP-01", "PSY-ANXIETY-01")
QuestionId = Literal["PSY-STRESS-01", "PSY-SLEEP-01", "PSY-ANXIETY-01"]
ResponseCode = Literal["YES", "NO", "NOT_SURE"]
ResponseState = Literal["KNOWN_POSITIVE", "KNOWN_NEGATIVE", "UNKNOWN", "DECLINED", "NOT_ASKED"]

REFERENCE_PERIOD = "LAST_4_WEEKS"
PSYCHOSOCIAL_VERSION = "psychosocial-context-0.1"


class PsychosocialAnswerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: QuestionId
    response_state: ResponseState
    response_code: ResponseCode | None = None

    @model_validator(mode="after")
    def _state_matches_answer(self) -> PsychosocialAnswerIn:
        expected = {
            "KNOWN_POSITIVE": "YES",
            "KNOWN_NEGATIVE": "NO",
            "UNKNOWN": "NOT_SURE",
            "DECLINED": None,
            "NOT_ASKED": None,
        }[self.response_state]
        if self.response_code != expected:
            raise ValueError("response_code does not match response_state")
        return self


class PsychosocialAnswersIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: list[PsychosocialAnswerIn] = Field(max_length=3)

    @model_validator(mode="after")
    def _unique_questions(self) -> PsychosocialAnswersIn:
        question_ids = [answer.question_id for answer in self.answers]
        if len(question_ids) != len(set(question_ids)):
            raise ValueError("question_id values must be unique")
        return self


class PsychosocialAnswerOut(BaseModel):
    question_id: str
    response_code: str | None
    response_state: str
    reference_period: str
    source_type: Literal["PATIENT_REPORTED"] | None
    verification_status: Literal["UNVERIFIED"] | None
    consent_scope: Literal["assessment"]
    collected_at: datetime | None


class PsychosocialAnswersOut(BaseModel):
    version: str
    diagnostic_label: None = None
    answers: list[PsychosocialAnswerOut]


class PsychosocialQuestionOut(BaseModel):
    question_id: str
    concept_code: str
    draft_text: str
    source_type: str
    verification_status: str
    use: str


class PsychosocialQuestionCatalogueOut(BaseModel):
    catalogue_version: str
    approval_status: str
    copy_status: str
    reference_period: str
    status_note: str
    questions: list[PsychosocialQuestionOut]


def _out(row: PsychosocialSelfReport) -> dict[str, Any]:
    return {
        "question_id": row.question_id,
        "response_code": row.response_code,
        "response_state": row.response_state,
        "reference_period": row.reference_period,
        "source_type": row.source_type,
        "verification_status": row.verification_status,
        "consent_scope": row.consent_scope,
        "collected_at": row.collected_at,
    }


def _answers(db: Session, case_id: str) -> list[dict[str, Any]]:
    rows = {
        row.question_id: row
        for row in db.query(PsychosocialSelfReport).filter_by(case_id=case_id).all()
    }
    answers: list[dict[str, Any]] = []
    for question_id in QUESTION_IDS:
        row = rows.get(question_id)
        if row is None:
            answers.append(
                {
                    "question_id": question_id,
                    "response_code": None,
                    "response_state": "NOT_ASKED",
                    "reference_period": REFERENCE_PERIOD,
                    "source_type": None,
                    "verification_status": None,
                    "consent_scope": "assessment",
                    "collected_at": None,
                }
            )
        else:
            answers.append(_out(row))
    return answers


@router.get("/psychosocial/questions", response_model=PsychosocialQuestionCatalogueOut)
def psychosocial_questions(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    catalogue = read_json(settings.repo_root / "catalogue/psychosocial.draft-0.1.json")
    return catalogue


@router.put("/cases/{case_id}/psychosocial", response_model=PsychosocialAnswersOut)
def save_psychosocial(
    body: PsychosocialAnswersIn,
    pc: PatientCase = Depends(guard(Action.SAVE_PSYCHOSOCIAL)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    now = clock.now()
    submitted: dict[str, PsychosocialAnswerIn] = {
        answer.question_id: answer for answer in body.answers
    }
    for question_id in QUESTION_IDS:
        answer = submitted.get(question_id)
        state = answer.response_state if answer is not None else "NOT_ASKED"
        response_code = answer.response_code if answer is not None else None
        row = (
            db.query(PsychosocialSelfReport)
            .filter_by(case_id=pc.case.case_id, question_id=question_id)
            .one_or_none()
        )
        if row is None:
            row = PsychosocialSelfReport(
                case_id=pc.case.case_id,
                question_id=question_id,
            )
            db.add(row)
        row.response_code = response_code
        row.response_state = state
        row.reference_period = REFERENCE_PERIOD
        row.source_type = "PATIENT_REPORTED" if state != "NOT_ASKED" else None
        row.verification_status = "UNVERIFIED" if state != "NOT_ASKED" else None
        row.consent_scope = "assessment"
        row.collected_at = now if state != "NOT_ASKED" else None

    record(
        db,
        AuditType.PSYCHOSOCIAL_CAPTURED,
        actor=pc.auth.actor,
        now=now,
        case_id=pc.case.case_id,
        case_version=pc.case.case_version,
        count=len(body.answers),
        catalogue_version=PSYCHOSOCIAL_VERSION,
    )
    db.commit()
    return {"version": PSYCHOSOCIAL_VERSION, "answers": _answers(db, pc.case.case_id)}


@router.get("/cases/{case_id}/psychosocial", response_model=PsychosocialAnswersOut)
def get_psychosocial(
    pc: PatientCase = Depends(guard(Action.SAVE_PSYCHOSOCIAL)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return {"version": PSYCHOSOCIAL_VERSION, "answers": _answers(db, pc.case.case_id)}
