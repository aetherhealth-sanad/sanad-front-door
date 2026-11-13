"""Order guard for patient actions (RF-04, API design sections 2 and 4).

Checks 3 to 5 of the API design's order of checks, run as dependencies before the body is read:
the token's case matches (404 otherwise, the same as a missing case), the action's consent
scopes are active now (403), and the case state allows the action (409, audited). The server
decides. A disabled button on the client is not a control.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

from fastapi import Depends
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, deny_transition, record
from sanad_api.auth.deps import AuthContext, require_patient
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseState
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.consent.service import is_active
from sanad_api.deps import get_catalogues, get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.vocab import ConsentScope


class Action(StrEnum):
    SET_CONSENT = "SET_CONSENT"
    LOAD_PROFILE = "LOAD_PROFILE"
    RUN_SAFETY_CHECK = "RUN_SAFETY_CHECK"
    SUBMIT_ANSWERS = "SUBMIT_ANSWERS"
    INTERPRET_TEXT = "INTERPRET_TEXT"
    ENTER_OBSERVATION = "ENTER_OBSERVATION"
    SAVE_PSYCHOSOCIAL = "SAVE_PSYCHOSOCIAL"
    SELECT_EVIDENCE = "SELECT_EVIDENCE"
    ASSESS = "ASSESS"
    SEND_FOR_REVIEW = "SEND_FOR_REVIEW"
    START_NAVIGATION = "START_NAVIGATION"
    READ_NAVIGATION = "READ_NAVIGATION"
    UPDATE_NAVIGATION = "UPDATE_NAVIGATION"
    SEND_REFERRAL = "SEND_REFERRAL"
    CLOSE = "CLOSE"
    # Reads that still need a state or a scope.
    READ_QUESTIONS = "READ_QUESTIONS"
    READ_REPORT = "READ_REPORT"
    READ_TRACKING = "READ_TRACKING"


@dataclass(frozen=True)
class ActionRule:
    scopes: tuple[ConsentScope, ...]
    states: frozenset[CaseState] | None  # None: any state


S = CaseState
A = ConsentScope
INTAKE_STATES = frozenset({S.ASSESSING, S.NEEDS_INFORMATION, S.REVISION_REQUIRED})

ACTION_RULES: dict[Action, ActionRule] = {
    Action.LOAD_PROFILE: ActionRule((A.ASSESSMENT,), frozenset({S.CONSENTED})),
    Action.RUN_SAFETY_CHECK: ActionRule((A.ASSESSMENT,), frozenset({S.CONSENTED})),
    Action.SUBMIT_ANSWERS: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    # T4.5: typed chat text is only ever matched to an intake question, so the same states.
    Action.INTERPRET_TEXT: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    Action.ENTER_OBSERVATION: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    Action.SAVE_PSYCHOSOCIAL: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    Action.SELECT_EVIDENCE: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    Action.ASSESS: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    Action.READ_QUESTIONS: ActionRule((A.ASSESSMENT,), INTAKE_STATES),
    # PENDING is allowed so that a repeat tap returns the same request (AC-07.4).
    Action.SEND_FOR_REVIEW: ActionRule(
        (A.ASSESSMENT, A.CLINICIAN_REVIEW), frozenset({S.ASSESSING, S.PENDING_CLINICIAN_REVIEW})
    ),
    Action.START_NAVIGATION: ActionRule((A.ASSESSMENT,), frozenset({S.GUIDANCE_AVAILABLE})),
    Action.READ_NAVIGATION: ActionRule(
        (A.ASSESSMENT,), frozenset({S.GUIDANCE_AVAILABLE, S.NAVIGATION_STARTED})
    ),
    Action.UPDATE_NAVIGATION: ActionRule(
        (A.ASSESSMENT,), frozenset({S.GUIDANCE_AVAILABLE, S.NAVIGATION_STARTED})
    ),
    Action.CLOSE: ActionRule(
        (),
        frozenset(
            {
                S.EDUCATION_ONLY,
                S.EMERGENCY_GUIDANCE_ISSUED,
                S.REJECTED,
                S.GUIDANCE_AVAILABLE,
                S.NAVIGATION_STARTED,
            }
        ),
    ),
    Action.READ_REPORT: ActionRule((A.ASSESSMENT,), None),
    Action.READ_TRACKING: ActionRule((), None),
}


@dataclass(frozen=True)
class PatientCase:
    case: Case
    auth: AuthContext


def patient_case(
    case_id: str, auth: AuthContext = Depends(require_patient), db: Session = Depends(get_db)
) -> PatientCase:
    if auth.case_id != case_id:
        raise ApiError(404, ErrorCode.NOT_FOUND)  # the same answer as a missing case (AC-14.6)
    case = db.get(Case, case_id)
    if case is None:
        raise ApiError(404, ErrorCode.NOT_FOUND)
    return PatientCase(case=case, auth=auth)


def deny_consent(
    db: Session,
    case: Case,
    action: str,
    scopes: list[ConsentScope],
    actor: str,
    clock: Clock,
    catalogues: Catalogues,
) -> ApiError:
    case_id, case_version = case.case_id, case.case_version
    db.rollback()
    record(
        db,
        AuditType.CONSENT_DENIED,
        actor=actor,
        now=clock.now(),
        case_id=case_id,
        case_version=case_version,
        attempted_action=action,
        scopes=[scope.value for scope in scopes],
        consent_version=catalogues.consent.consent_version,
    )
    db.commit()
    return ApiError(403, ErrorCode.CONSENT_REQUIRED, [scope.value for scope in scopes])


def guard(action: Action) -> Callable[..., PatientCase]:
    rule = ACTION_RULES[action]

    def dependency(
        pc: PatientCase = Depends(patient_case),
        db: Session = Depends(get_db),
        clock: Clock = Depends(get_clock),
        catalogues: Catalogues = Depends(get_catalogues),
    ) -> PatientCase:
        case = pc.case
        missing = [scope for scope in rule.scopes if not is_active(db, case.case_id, scope)]
        if missing:
            raise deny_consent(db, case, action.value, missing, pc.auth.actor, clock, catalogues)
        if rule.states is not None and CaseState(case.state) not in rule.states:
            raise deny_transition(
                db,
                case_id=case.case_id,
                case_version=case.case_version,
                state=case.state,
                attempted_action=action.value,
                actor=pc.auth.actor,
                now=clock.now(),
            )
        return pc

    return dependency
