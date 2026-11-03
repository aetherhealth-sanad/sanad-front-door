"""Review lookups shared by the patient, reviewer, gate and tracking code."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from sanad_api.review.models import ClarificationRequest, ReviewDecision, ReviewRequest

PENDING = "PENDING"
DECIDED = "DECIDED"
WITHDRAWN = "WITHDRAWN"
SIMULATED_APPROVAL = "SIMULATED_APPROVAL"
SIMULATED = "SIMULATED"


def pending_request(db: Session, case_id: str) -> ReviewRequest | None:
    return (
        db.query(ReviewRequest)
        .filter(ReviewRequest.case_id == case_id, ReviewRequest.status == PENDING)
        .one_or_none()
    )


def has_any_request(db: Session, case_id: str) -> bool:
    return db.query(ReviewRequest).filter(ReviewRequest.case_id == case_id).first() is not None


def requests_for(db: Session, case_id: str) -> list[ReviewRequest]:
    return (
        db.query(ReviewRequest)
        .filter(ReviewRequest.case_id == case_id)
        .order_by(ReviewRequest.id)
        .all()
    )


def decisions_for(db: Session, case_id: str) -> list[ReviewDecision]:
    return (
        db.query(ReviewDecision)
        .filter(ReviewDecision.case_id == case_id)
        .order_by(ReviewDecision.id)
        .all()
    )


def latest_decision(db: Session, case_id: str) -> ReviewDecision | None:
    decisions = decisions_for(db, case_id)
    return decisions[-1] if decisions else None


def open_clarifications(db: Session, case_id: str) -> list[ClarificationRequest]:
    return (
        db.query(ClarificationRequest)
        .filter(ClarificationRequest.case_id == case_id, ClarificationRequest.resolved_at.is_(None))
        .all()
    )


def withdraw_pending(db: Session, case_id: str, now: datetime) -> bool:
    request = pending_request(db, case_id)
    if request is None:
        return False
    request.status = WITHDRAWN
    request.closed_at = now
    return True
