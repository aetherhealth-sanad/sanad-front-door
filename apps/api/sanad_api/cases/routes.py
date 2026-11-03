"""Case endpoints (API design section 6.1)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.auth.rate_limit import rate_limited
from sanad_api.auth.tokens import end_case_sessions, issue_session
from sanad_api.cases.guards import Action, PatientCase, guard, patient_case
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseEvent, CaseState, transition
from sanad_api.cases.views import state_view
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.config import Settings
from sanad_api.consent.service import create_scopes
from sanad_api.deps import get_catalogues, get_clock, get_db, get_settings
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.ids import new_case_id
from sanad_api.referral.service import referral_for_case
from sanad_api.schemas import CaseStateOut
from sanad_api.vocab import Role

router = APIRouter(tags=["cases"])


class SampleOut(BaseModel):
    fixture_id: str
    title: str
    description: str
    is_synthetic: bool


class SamplesOut(BaseModel):
    samples: list[SampleOut]


@router.get("/samples", response_model=SamplesOut)
def list_samples(catalogues: Catalogues = Depends(get_catalogues)) -> dict[str, Any]:
    """Consent-negative fixtures are left out: they exist for tests."""
    return {
        "samples": [
            {
                "fixture_id": sample.metadata.fixture_id,
                "title": sample.metadata.title,
                "description": sample.metadata.description,
                "is_synthetic": True,
            }
            for sample in catalogues.samples.values()
            if sample.metadata.listed_as_sample
        ]
    }


class CreateCaseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_mode: Literal["SAMPLE", "UPLOAD", "BLANK"]
    fixture_id: str | None = Field(default=None, max_length=32)
    preferred_language: Literal["en"] = "en"

    @model_validator(mode="after")
    def _fixture_only_for_samples(self) -> CreateCaseIn:
        if (self.start_mode == "SAMPLE") != (self.fixture_id is not None):
            raise ValueError("fixture_id is required for SAMPLE and only for SAMPLE")
        return self


class CreateCaseOut(BaseModel):
    case_id: str
    session_token: str
    expires_at: datetime
    state: CaseStateOut


@router.post(
    "/cases",
    status_code=201,
    response_model=CreateCaseOut,
    dependencies=[Depends(rate_limited("cases"))],
)
def create_case(
    body: CreateCaseIn,
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    """Creates a DRAFT case holding only the start reference. No profile data yet (AC-02.2)."""
    if body.start_mode == "SAMPLE" and body.fixture_id not in catalogues.samples:
        raise ApiError(422, ErrorCode.UNKNOWN_SAMPLE)
    now = clock.now()
    case = Case(
        case_id=new_case_id(),
        state=CaseState.DRAFT.value,
        case_version=1,
        start_mode=body.start_mode,
        fixture_id=body.fixture_id,
        profile_applied=False,
        is_synthetic=True,
        preferred_language=body.preferred_language,
        current_draft_id=None,
        created_at=now,
        updated_at=now,
    )
    db.add(case)
    db.flush()
    create_scopes(db, case.case_id)
    token, session = issue_session(
        db,
        role=Role.PATIENT,
        now=now,
        ttl_seconds=settings.patient_token_ttl_seconds,
        case_id=case.case_id,
    )
    record(
        db,
        AuditType.CASE_CREATED,
        actor=Role.PATIENT.value,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        start_mode=body.start_mode,
    )
    db.commit()
    return {
        "case_id": case.case_id,
        "session_token": token,
        "expires_at": session.expires_at,
        "state": state_view(db, case, catalogues),
    }


@router.get("/cases/{case_id}/state", response_model=CaseStateOut)
def get_state(
    pc: PatientCase = Depends(patient_case),
    db: Session = Depends(get_db),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    return state_view(db, pc.case, catalogues)


@router.post("/cases/{case_id}/close", response_model=CaseStateOut)
def close_case(
    pc: PatientCase = Depends(guard(Action.CLOSE)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    """Closing records no failure, refusal or non-adherence (BR-32)."""
    case, actor, now = pc.case, pc.auth.actor, clock.now()
    transition(db, case, CaseEvent.CLOSE, actor, now)
    record(
        db,
        AuditType.CASE_CLOSED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        closed_reason="USER_CLOSED",
    )
    view = state_view(db, case, catalogues)
    if referral_for_case(db, case.case_id) is None:
        # A closed case with no referral sends the user to the start with the session ended.
        end_case_sessions(db, case.case_id, now)
        record(
            db,
            AuditType.SESSION_ENDED,
            actor=actor,
            now=now,
            case_id=case.case_id,
            case_version=case.case_version,
        )
    db.commit()
    return view
