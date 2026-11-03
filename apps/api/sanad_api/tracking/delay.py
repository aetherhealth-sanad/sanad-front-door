"""Delayed flag (RF-14, CC-004).

A mock workflow timer, not a clinical deadline. It is computed on read from the last event time,
the current time and the configured threshold. There is no background job, no reminder and no
notification path, and the flag never changes triage (AC-14.4). It is off exactly at the
threshold and on just past it (AC-14.2).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseState
from sanad_api.referral.lifecycle import MockStatus
from sanad_api.referral.service import events_for, referral_for_case
from sanad_api.review.service import decisions_for, pending_request

FLAGGED_STAGES = frozenset(
    {
        CaseState.PENDING_CLINICIAN_REVIEW.value,
        MockStatus.MOCK_SENT.value,
        MockStatus.MOCK_RECEIVED.value,
        MockStatus.MOCK_ACCEPTED.value,
    }
)


@dataclass(frozen=True)
class DelayFlag:
    stage: str
    waiting_since: datetime
    threshold_seconds: int

    def to_json(self) -> dict[str, Any]:
        return {
            "flag": "DELAYED",
            "stage": self.stage,
            "waiting_since": self.waiting_since,
            "threshold_seconds": self.threshold_seconds,
            "threshold_kind": "MOCK_WORKFLOW_TIMER",
        }


def compute_flag(
    stage: str | None, waiting_since: datetime | None, now: datetime, threshold_seconds: int
) -> DelayFlag | None:
    if stage not in FLAGGED_STAGES or waiting_since is None:
        return None
    if (now - waiting_since).total_seconds() > threshold_seconds:
        return DelayFlag(stage, waiting_since, threshold_seconds)
    return None


def current_stage(db: Session, case: Case) -> tuple[str | None, datetime | None]:
    """The stage the case is waiting in, and since when."""
    referral = referral_for_case(db, case.case_id)
    if referral is not None:
        events = events_for(db, referral.referral_id)
        return referral.mock_status, (events[-1].occurred_at if events else referral.created_at)
    if case.state == CaseState.PENDING_CLINICIAN_REVIEW:
        request = pending_request(db, case.case_id)
        if request is None:
            return None, None
        times: Sequence[datetime] = [request.requested_at] + [
            d.decided_at
            for d in decisions_for(db, case.case_id)
            if d.review_request_id == request.review_request_id
        ]
        return case.state, max(times)
    return None, None


def case_flag(db: Session, case: Case, now: datetime, threshold_seconds: int) -> DelayFlag | None:
    stage, since = current_stage(db, case)
    return compute_flag(stage, since, now, threshold_seconds)
