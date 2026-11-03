"""Navigation retry behavior (TC-19.6)."""

from __future__ import annotations

from sanad_api.audit.models import AuditEvent
from sanad_api.navigation.models import (
    CareBarrierReport,
    CareNavigationEvent,
    CareNavigationIdempotency,
)
from tests.helpers import Api


def test_tc_19_6_progress_replay_is_idempotent_and_key_reuse_is_rejected(api: Api) -> None:
    patient = api.navigating()
    path = patient.path("/navigation/progress")
    initial_audit_count = sum(
        event.event_type == "NAVIGATION_PROGRESS_RECORDED" for event in api.audit(patient.case_id)
    )
    request = {"status": "BOOKING_SELF_REPORTED", "idempotency_key": "retry-progress-01"}

    first = patient.post(path, request)
    replay = patient.post(path, request)
    conflicting = patient.post(
        path, {"status": "VISIT_SELF_REPORTED", "idempotency_key": "retry-progress-01"}
    )

    assert first.status_code == replay.status_code == 200
    assert conflicting.status_code == 409
    assert conflicting.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    with api.db() as db:
        writes = (
            db.query(CareNavigationIdempotency)
            .filter_by(
                episode_id=first.json()["episode_id"],
                operation="PROGRESS",
                idempotency_key="retry-progress-01",
            )
            .all()
        )
        progress_events = (
            db.query(CareNavigationEvent)
            .filter_by(
                episode_id=first.json()["episode_id"],
                status="BOOKING_SELF_REPORTED",
            )
            .all()
        )
        audit_rows = (
            db.query(AuditEvent)
            .filter_by(case_id=patient.case_id, event_type="NAVIGATION_PROGRESS_RECORDED")
            .all()
        )
    assert len(writes) == 1
    assert len(progress_events) == 1
    assert len(audit_rows) == initial_audit_count + 1


def test_tc_19_6_barrier_replay_is_idempotent_and_key_reuse_is_rejected(api: Api) -> None:
    patient = api.navigating()
    path = patient.path("/navigation/barriers")
    request = {"barrier_reasons": ["COST_CONCERN"], "idempotency_key": "retry-barrier-01"}

    first = patient.post(path, request)
    replay = patient.post(path, request)
    conflicting = patient.post(
        path,
        {"barrier_reasons": ["PRIVACY_CONCERN"], "idempotency_key": "retry-barrier-01"},
    )

    assert first.status_code == replay.status_code == 200
    assert conflicting.status_code == 409
    assert conflicting.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    with api.db() as db:
        writes = (
            db.query(CareNavigationIdempotency)
            .filter_by(
                episode_id=first.json()["episode_id"],
                operation="BARRIER",
                idempotency_key="retry-barrier-01",
            )
            .all()
        )
        reports = (
            db.query(CareBarrierReport)
            .filter_by(episode_id=first.json()["episode_id"])
            .all()
        )
        audit_rows = (
            db.query(AuditEvent)
            .filter_by(case_id=patient.case_id, event_type="NAVIGATION_BARRIER_RECORDED")
            .all()
        )
    assert len(writes) == 1
    assert len(reports) == 1
    assert len(audit_rows) == 1
