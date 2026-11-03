"""Case state machine (PRD section 4.7, product spec section 10 and API design G3).

This table is the only description of allowed moves, and `transition` is the only code that
writes `Case.state` (plan section 4.1). An architecture test enforces both. J9 states
(GUIDANCE_ACKNOWLEDGED, PROGRESS_SELF_REPORTED) are absent because J9 is not built in this flow.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy.orm import Session

from sanad_api.cases.models import Case, CaseTransition


class CaseState(StrEnum):
    DRAFT = "DRAFT"
    EDUCATION_ONLY = "EDUCATION_ONLY"
    CONSENTED = "CONSENTED"
    EMERGENCY_GUIDANCE_ISSUED = "EMERGENCY_GUIDANCE_ISSUED"
    ASSESSING = "ASSESSING"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"
    PENDING_CLINICIAN_REVIEW = "PENDING_CLINICIAN_REVIEW"
    REVISION_REQUIRED = "REVISION_REQUIRED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REPORT_RELEASED = "REPORT_RELEASED"
    GUIDANCE_AVAILABLE = "GUIDANCE_AVAILABLE"
    NAVIGATION_STARTED = "NAVIGATION_STARTED"
    REFERRAL_REQUESTED = "REFERRAL_REQUESTED"
    CLOSED = "CLOSED"
    CONSENT_REVOKED = "CONSENT_REVOKED"


class CaseEvent(StrEnum):
    GRANT_ASSESSMENT = "GRANT_ASSESSMENT"
    DECLINE_ASSESSMENT = "DECLINE_ASSESSMENT"
    SAFETY_CLEAR = "SAFETY_CLEAR"
    EMERGENCY_TRIGGER = "EMERGENCY_TRIGGER"
    INFORMATION_MISSING = "INFORMATION_MISSING"
    INFORMATION_CORRECTED = "INFORMATION_CORRECTED"
    REVISION_UPDATED = "REVISION_UPDATED"
    RELEASE_EDUCATION_ONLY = "RELEASE_EDUCATION_ONLY"
    SEND_FOR_REVIEW = "SEND_FOR_REVIEW"
    CLARIFICATION_REQUESTED = "CLARIFICATION_REQUESTED"
    REVIEW_APPROVED = "REVIEW_APPROVED"
    REVIEW_REJECTED = "REVIEW_REJECTED"
    CLINICIAN_REVIEW_REVOKED = "CLINICIAN_REVIEW_REVOKED"
    RELEASE_REPORT = "RELEASE_REPORT"
    ISSUE_GUIDANCE = "ISSUE_GUIDANCE"
    START_NAVIGATION = "START_NAVIGATION"
    REQUEST_REFERRAL = "REQUEST_REFERRAL"
    MOCK_REFERRAL_ENDED = "MOCK_REFERRAL_ENDED"
    PROVIDER_SHARE_WITHDRAWN = "PROVIDER_SHARE_WITHDRAWN"
    CLOSE = "CLOSE"
    REVOKE_ASSESSMENT = "REVOKE_ASSESSMENT"


S = CaseState
E = CaseEvent

# States from which revoking `assessment` moves the case to CONSENT_REVOKED (API design 4).
REVOCABLE_STATES = frozenset(
    {
        S.CONSENTED,
        S.EMERGENCY_GUIDANCE_ISSUED,
        S.ASSESSING,
        S.NEEDS_INFORMATION,
        S.PENDING_CLINICIAN_REVIEW,
        S.REVISION_REQUIRED,
        S.APPROVED,
        S.REJECTED,
        S.REPORT_RELEASED,
        S.GUIDANCE_AVAILABLE,
        S.NAVIGATION_STARTED,
        S.REFERRAL_REQUESTED,
    }
)

TRANSITIONS: dict[tuple[CaseState, CaseEvent], CaseState] = {
    (S.DRAFT, E.GRANT_ASSESSMENT): S.CONSENTED,
    (S.DRAFT, E.DECLINE_ASSESSMENT): S.EDUCATION_ONLY,
    (S.CONSENTED, E.SAFETY_CLEAR): S.ASSESSING,
    (S.CONSENTED, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    # R9 (CC-005): a trigger found later still reaches guidance.
    (S.ASSESSING, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.NEEDS_INFORMATION, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.REVISION_REQUIRED, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.ASSESSING, E.INFORMATION_MISSING): S.NEEDS_INFORMATION,
    (S.NEEDS_INFORMATION, E.INFORMATION_CORRECTED): S.ASSESSING,
    # PRD edge for approved education-only content. No endpoint uses it in this flow (G9).
    (S.ASSESSING, E.RELEASE_EDUCATION_ONLY): S.REPORT_RELEASED,
    (S.ASSESSING, E.SEND_FOR_REVIEW): S.PENDING_CLINICIAN_REVIEW,
    (S.PENDING_CLINICIAN_REVIEW, E.CLARIFICATION_REQUESTED): S.REVISION_REQUIRED,
    (S.REVISION_REQUIRED, E.REVISION_UPDATED): S.ASSESSING,
    (S.PENDING_CLINICIAN_REVIEW, E.REVIEW_APPROVED): S.APPROVED,
    (S.PENDING_CLINICIAN_REVIEW, E.REVIEW_REJECTED): S.REJECTED,
    # G3 (CC-009): revoking clinician_review returns the case to the user with its draft.
    (S.PENDING_CLINICIAN_REVIEW, E.CLINICIAN_REVIEW_REVOKED): S.ASSESSING,
    (S.APPROVED, E.RELEASE_REPORT): S.REPORT_RELEASED,
    (S.REPORT_RELEASED, E.ISSUE_GUIDANCE): S.GUIDANCE_AVAILABLE,
    (S.GUIDANCE_AVAILABLE, E.START_NAVIGATION): S.NAVIGATION_STARTED,
    # Only the referral gate fires this event (RF-12).
    (S.NAVIGATION_STARTED, E.REQUEST_REFERRAL): S.REFERRAL_REQUESTED,
    (S.REFERRAL_REQUESTED, E.MOCK_REFERRAL_ENDED): S.CLOSED,
    (S.REFERRAL_REQUESTED, E.PROVIDER_SHARE_WITHDRAWN): S.CLOSED,
    (S.GUIDANCE_AVAILABLE, E.CLOSE): S.CLOSED,
    (S.NAVIGATION_STARTED, E.CLOSE): S.CLOSED,
    (S.EMERGENCY_GUIDANCE_ISSUED, E.CLOSE): S.CLOSED,
    (S.EDUCATION_ONLY, E.CLOSE): S.CLOSED,
    # R9 (CC-005): a rejected case has an exit.
    (S.REJECTED, E.CLOSE): S.CLOSED,
    **{(state, E.REVOKE_ASSESSMENT): S.CONSENT_REVOKED for state in REVOCABLE_STATES},
}


class InvalidTransitionError(Exception):
    def __init__(self, state: CaseState, event: CaseEvent) -> None:
        super().__init__(f"{event} is not allowed from {state}")
        self.state = state
        self.event = event


def can_transition(state: str, event: CaseEvent) -> bool:
    return (CaseState(state), event) in TRANSITIONS


def transition(db: Session, case: Case, event: CaseEvent, actor: str, now: datetime) -> CaseState:
    current = CaseState(case.state)
    target = TRANSITIONS.get((current, event))
    if target is None:
        raise InvalidTransitionError(current, event)
    case.state = target.value
    case.updated_at = now
    db.add(
        CaseTransition(
            case_id=case.case_id,
            from_state=current.value,
            to_state=target.value,
            event=event.value,
            actor=actor,
            occurred_at=now,
        )
    )
    return target
