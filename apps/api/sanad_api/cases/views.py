"""The case state object: state, version, route and allowed actions.

The server holds the step. The client stores none of this and redirects on `route`, so a reload
resumes correctly and editing browser storage changes nothing (AC-04.1, AC-04.6).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from sanad_api.cases.guards import Action
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseState
from sanad_api.catalogues import Catalogues
from sanad_api.facts.evidence import evidence_items
from sanad_api.facts.service import current_facts
from sanad_api.observations.service import for_case as observations_for
from sanad_api.referral.service import referral_for_case
from sanad_api.reports.service import current_draft
from sanad_api.vocab import SourceType

S = CaseState

FIXED_ROUTES: dict[CaseState, str] = {
    S.DRAFT: "/consent",
    S.EDUCATION_ONLY: "/education",
    S.CONSENTED: "/safety",
    S.EMERGENCY_GUIDANCE_ISSUED: "/urgent.html",
    S.NEEDS_INFORMATION: "/intake",
    S.REVISION_REQUIRED: "/intake",
    S.PENDING_CLINICIAN_REVIEW: "/tracking",
    S.APPROVED: "/result",
    S.REPORT_RELEASED: "/result",
    S.GUIDANCE_AVAILABLE: "/result",
    S.REJECTED: "/result",
    S.NAVIGATION_STARTED: "/referral",
    S.REFERRAL_REQUESTED: "/tracking",
    S.CONSENT_REVOKED: "/privacy",
}


def route_for(db: Session, case: Case, catalogues: Catalogues) -> str:
    state = CaseState(case.state)
    if state is S.ASSESSING:
        if current_draft(db, case) is not None:
            return "/result"
        return "/lab" if _lab_first(db, case, catalogues) else "/intake"
    if state is S.CLOSED:
        return "/tracking" if referral_for_case(db, case.case_id) else "/"
    return FIXED_ROUTES[state]


def _lab_first(db: Session, case: Case, catalogues: Catalogues) -> bool:
    """A user with lab results may go to /lab without the full intake (AC-15.4)."""
    if not observations_for(db, case.case_id):
        return False
    intake = set(catalogues.questions.concepts)
    return not any(
        fact.source_type == SourceType.PATIENT_REPORTED and fact.concept_code in intake
        for fact in current_facts(db, case.case_id)
    )


def allowed_actions(db: Session, case: Case, catalogues: Catalogues) -> list[str]:
    state = CaseState(case.state)
    actions: list[Action] = []
    if state is S.DRAFT:
        actions = [Action.SET_CONSENT]
    elif state is S.CONSENTED:
        if case.start_mode in ("SAMPLE", "UPLOAD") and not case.profile_applied:
            actions.append(Action.LOAD_PROFILE)
        actions.append(Action.RUN_SAFETY_CHECK)
    elif state in (S.ASSESSING, S.NEEDS_INFORMATION, S.REVISION_REQUIRED):
        has_draft = state is S.ASSESSING and current_draft(db, case) is not None
        if has_draft:
            actions.append(Action.SEND_FOR_REVIEW)
        actions += [Action.SUBMIT_ANSWERS, Action.ENTER_OBSERVATION]
        if evidence_items(db, case.case_id, current_facts(db, case.case_id), catalogues):
            actions.append(Action.SELECT_EVIDENCE)
        if not has_draft:
            actions.append(Action.ASSESS)
    elif state is S.GUIDANCE_AVAILABLE:
        actions = [Action.START_NAVIGATION, Action.CLOSE]
    elif state is S.NAVIGATION_STARTED:
        actions = [Action.SEND_REFERRAL, Action.CLOSE]
    elif state in (S.EDUCATION_ONLY, S.EMERGENCY_GUIDANCE_ISSUED, S.REJECTED):
        actions = [Action.CLOSE]
    return [action.value for action in actions]


def state_view(db: Session, case: Case, catalogues: Catalogues) -> dict[str, Any]:
    return {
        "case_id": case.case_id,
        "state": case.state,
        "case_version": case.case_version,
        "route": route_for(db, case, catalogues),
        "allowed_actions": allowed_actions(db, case, catalogues),
    }
