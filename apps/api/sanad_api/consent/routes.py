"""Consent endpoints (API design section 6.2).

`PUT` takes only the scopes being changed, so granting `assessment` never switches anything else
on (AC-03.4). The whole request is planned before anything is written, so a refused request
changes nothing. Revocation side effects follow CC-009 (`PROPOSED`):
- `clinician_review` revoked while pending: the case returns to ASSESSING with its draft (G3).
- `provider_share` revoked with a live referral: MOCK_WITHDRAWN and the case closes (OD-10).
- `assessment` revoked: every scope is revoked and a live referral is withdrawn (G4).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, deny_transition, record
from sanad_api.cases.guards import Action, PatientCase, deny_consent, patient_case
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import REVOCABLE_STATES, CaseEvent, CaseState, transition
from sanad_api.cases.views import state_view
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.consent.models import ConsentGrant
from sanad_api.consent.service import grant, load_grants, revoke
from sanad_api.deps import get_catalogues, get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.facts.evidence import excluded_concepts
from sanad_api.facts.service import current_facts, mark_facts_changed
from sanad_api.referral.service import withdraw_live_referral
from sanad_api.review.service import withdraw_pending
from sanad_api.schemas import CaseStateOut
from sanad_api.vocab import ConsentScope

router = APIRouter(tags=["consent"])

S = CaseState
A = ConsentScope


class ScopeTextOut(BaseModel):
    scope: str
    data_covered: str
    used_for: str
    who_sees_it: str
    if_off: str
    used_in_this_flow: bool


class ConsentCurrentOut(BaseModel):
    consent_version: str
    copy_status: str
    scopes: list[ScopeTextOut]


@router.get("/consent/current", response_model=ConsentCurrentOut)
def current_consent_text(catalogues: Catalogues = Depends(get_catalogues)) -> dict[str, Any]:
    consent = catalogues.consent
    return {
        "consent_version": consent.consent_version,
        "copy_status": consent.copy_status,
        "scopes": [text.model_dump() for text in consent.scopes],
    }


class ScopeStateOut(BaseModel):
    granted: bool
    captured_at: datetime | None
    revoked_at: datetime | None


class ConsentRecordOut(BaseModel):
    case_id: str
    consent_version: str
    scopes: dict[str, ScopeStateOut]


class ConsentUpdateOut(ConsentRecordOut):
    state: CaseStateOut


def _record_view(db: Session, case_id: str, catalogues: Catalogues) -> dict[str, Any]:
    grants = load_grants(db, case_id)
    return {
        "case_id": case_id,
        "consent_version": catalogues.consent.consent_version,
        "scopes": {
            scope.value: {
                "granted": grants[scope].granted,
                "captured_at": grants[scope].captured_at,
                "revoked_at": grants[scope].revoked_at,
            }
            for scope in ConsentScope
        },
    }


@router.get("/cases/{case_id}/consent", response_model=ConsentRecordOut)
def get_case_consent(
    pc: PatientCase = Depends(patient_case),
    db: Session = Depends(get_db),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    return _record_view(db, pc.case.case_id, catalogues)


class ConsentPutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent_version: str = Field(max_length=32)
    decisions: dict[ConsentScope, StrictBool] = Field(min_length=1)


def _changed(
    db: Session,
    case: Case,
    scope: ConsentScope,
    change: str,
    actor: str,
    version: str,
    now: datetime,
) -> None:
    record(
        db,
        AuditType.CONSENT_CHANGED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        scope=scope.value,
        consent_version=version,
        change=change,
    )


def _excluded(db: Session, case: Case, catalogues: Catalogues) -> set[str]:
    return excluded_concepts(db, case.case_id, current_facts(db, case.case_id), catalogues)


@router.put("/cases/{case_id}/consent", response_model=ConsentUpdateOut)
def put_case_consent(
    body: ConsentPutIn,
    pc: PatientCase = Depends(patient_case),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    case, actor, now = pc.case, pc.auth.actor, clock.now()
    version = catalogues.consent.consent_version
    if body.consent_version != version:
        raise ApiError(409, ErrorCode.CONSENT_VERSION_OUTDATED)
    grants = load_grants(db, case.case_id)
    state = CaseState(case.state)

    def refuse() -> ApiError:
        return deny_transition(
            db,
            case_id=case.case_id,
            case_version=case.case_version,
            state=case.state,
            attempted_action=Action.SET_CONSENT.value,
            actor=actor,
            now=now,
        )

    # Plan first, so that a refused request changes nothing.
    assessment_change: str | None = None
    wanted = body.decisions.get(A.ASSESSMENT)
    if wanted is True and not grants[A.ASSESSMENT].granted:
        if state is not S.DRAFT:
            raise refuse()
        assessment_change = "GRANTED"
    elif wanted is False and state is S.DRAFT:
        assessment_change = "DECLINED"
    elif wanted is False and grants[A.ASSESSMENT].granted:
        assessment_change = "REVOKED"
    assessment_after = assessment_change == "GRANTED" or (
        grants[A.ASSESSMENT].granted and assessment_change != "REVOKED"
    )

    to_grant: list[ConsentScope] = []
    to_revoke: list[ConsentScope] = []
    for scope, want in body.decisions.items():
        if scope is A.ASSESSMENT:
            continue
        if want and not grants[scope].granted:
            if not assessment_after:
                raise deny_consent(
                    db, case, Action.SET_CONSENT.value, [A.ASSESSMENT], actor, clock, catalogues
                )
            if state in (S.CLOSED, S.CONSENT_REVOKED):
                raise refuse()
            to_grant.append(scope)
        elif not want and grants[scope].granted and assessment_change != "REVOKED":
            to_revoke.append(scope)

    excluded_before = _excluded(db, case, catalogues)
    if assessment_change == "GRANTED":
        grant(grants[A.ASSESSMENT], version, now)
        _changed(db, case, A.ASSESSMENT, "GRANTED", actor, version, now)
        transition(db, case, CaseEvent.GRANT_ASSESSMENT, actor, now)
    elif assessment_change == "DECLINED":
        # Decline stores no assessment data and discards the start reference (AC-03.3).
        case.start_mode = None
        case.fixture_id = None
        _changed(db, case, A.ASSESSMENT, "DECLINED", actor, version, now)
        transition(db, case, CaseEvent.DECLINE_ASSESSMENT, actor, now)
    elif assessment_change == "REVOKED":
        _revoke_everything(db, case, grants, actor, version, now)

    for scope in to_grant:
        grant(grants[scope], version, now)
        _changed(db, case, scope, "GRANTED", actor, version, now)
    for scope in to_revoke:
        revoke(grants[scope], version, now)
        _changed(db, case, scope, "REVOKED", actor, version, now)
        _after_revoke(db, case, scope, actor, now)

    # Revoking clinician_review can take a genetics result out of use (OD-08). That changes
    # the facts the draft was built on, so the draft goes.
    if _excluded(db, case, catalogues) != excluded_before:
        mark_facts_changed(case, now)
    db.commit()
    return {**_record_view(db, case.case_id, catalogues), "state": state_view(db, case, catalogues)}


def _revoke_everything(
    db: Session,
    case: Case,
    grants: dict[ConsentScope, ConsentGrant],
    actor: str,
    version: str,
    now: datetime,
) -> None:
    for scope, row in grants.items():
        if row.granted:
            revoke(row, version, now)
            _changed(db, case, scope, "REVOKED", actor, version, now)
    withdraw_live_referral(db, case, now)
    withdraw_pending(db, case.case_id, now)
    if CaseState(case.state) in REVOCABLE_STATES:
        transition(db, case, CaseEvent.REVOKE_ASSESSMENT, actor, now)


def _after_revoke(db: Session, case: Case, scope: ConsentScope, actor: str, now: datetime) -> None:
    state = CaseState(case.state)
    if scope is A.CLINICIAN_REVIEW and state is S.PENDING_CLINICIAN_REVIEW:
        withdraw_pending(db, case.case_id, now)
        transition(db, case, CaseEvent.CLINICIAN_REVIEW_REVOKED, actor, now)
    if scope is not A.PROVIDER_SHARE or state is not S.REFERRAL_REQUESTED:
        return
    if withdraw_live_referral(db, case, now) is not None:
        transition(db, case, CaseEvent.PROVIDER_SHARE_WITHDRAWN, actor, now)
        record(
            db,
            AuditType.CASE_CLOSED,
            actor=actor,
            now=now,
            case_id=case.case_id,
            case_version=case.case_version,
            closed_reason="CONSENT_WITHDRAWN",
        )
