"""Voluntary closed-loop navigation and barrier feedback (TC-19.1 to TC-19.6)."""

from __future__ import annotations

import json

from sanad_api.audit.models import AuditEvent
from sanad_api.navigation.models import (
    CareBarrierReport,
    CareNavigationEpisode,
    CareNavigationEvent,
    CareNavigationIdempotency,
)
from sanad_api.navigation.service import purge_expired_navigation
from tests.helpers import Api


def test_tc_19_1_report_display_alone_does_not_record_acknowledgement(api: Api) -> None:
    """TC-19.1: Reading the released report creates the episode at GUIDANCE_AVAILABLE,
    but acknowledged remains false until explicit POST /navigation/acknowledgements."""
    patient = api.approved()
    report = patient.report().json()
    assert report["guidance_id"] is not None
    assert report["guidance_version"] is not None

    nav = patient.get(patient.path("/navigation")).json()
    assert nav["acknowledged"] is False
    assert [e["status"] for e in nav["progress_events"]] == ["GUIDANCE_AVAILABLE"]
    assert nav["progress_events"][0]["verification_source"] == "SYSTEM_EVENT"

    ack = patient.post(
        patient.path("/navigation/acknowledgements"),
        {
            "guidance_id": report["guidance_id"],
            "guidance_version": report["guidance_version"],
        },
    )
    assert ack.status_code == 200
    body = ack.json()
    assert body["acknowledged"] is True
    statuses = [e["status"] for e in body["progress_events"]]
    assert statuses == ["GUIDANCE_AVAILABLE", "GUIDANCE_ACKNOWLEDGED"]
    ack_event = body["progress_events"][1]
    assert ack_event["verification_source"] == "SYSTEM_EVENT"
    assert ack_event["verification_status"] == "SYSTEM_EVENT"


def test_tc_19_2_self_reported_progress_events_are_append_only_and_source_labelled(
    api: Api,
) -> None:
    """TC-19.2: Booking and visit self-reports are stored append-only as USER_REPORTED
    and UNVERIFIED, distinct from SYSTEM_EVENT and SIMULATED."""
    patient = api.navigating()
    booking = patient.post(
        patient.path("/navigation/progress"),
        {"status": "BOOKING_SELF_REPORTED", "idempotency_key": "prog-book-1"},
    )
    assert booking.status_code == 200
    visit = patient.post(
        patient.path("/navigation/progress"),
        {"status": "VISIT_SELF_REPORTED", "idempotency_key": "prog-visit-1"},
    )
    assert visit.status_code == 200
    events = visit.json()["progress_events"]
    by_status = {e["status"]: e for e in events}
    assert by_status["GUIDANCE_AVAILABLE"]["verification_source"] == "SYSTEM_EVENT"
    assert by_status["NAVIGATION_STARTED"]["verification_source"] == "SYSTEM_EVENT"
    assert by_status["BOOKING_SELF_REPORTED"]["verification_source"] == "USER_REPORTED"
    assert by_status["BOOKING_SELF_REPORTED"]["verification_status"] == "UNVERIFIED"
    assert by_status["VISIT_SELF_REPORTED"]["verification_source"] == "USER_REPORTED"
    assert by_status["VISIT_SELF_REPORTED"]["verification_status"] == "UNVERIFIED"

    # Reject forbidden provider-verified statuses at the API schema boundary.
    for forbidden in ("PROVIDER_VERIFIED", "CARE_COMPLETED"):
        bad = patient.post(
            patient.path("/navigation/progress"),
            {"status": forbidden, "idempotency_key": f"bad-{forbidden}"},
        )
        assert bad.status_code == 422


def test_tc_19_3_barrier_reasons_are_bounded_exclusive_and_reject_free_text(api: Api) -> None:
    """TC-19.3: Barrier reports accept only bounded codes, enforce PREFER_NOT_TO_SAY
    exclusivity, reject free text, and log no barrier codes in the audit payload."""
    patient = api.navigating()
    path = patient.path("/navigation/barriers")

    ok = patient.post(
        path,
        {
            "barrier_reasons": ["PRIVACY_CONCERN", "COST_CONCERN"],
            "idempotency_key": "bar-ok-1",
        },
    )
    assert ok.status_code == 200
    assert ok.json()["barrier_reports"][0]["barrier_reasons"] == [
        "PRIVACY_CONCERN",
        "COST_CONCERN",
    ]
    assert ok.json()["barrier_reports"][0]["free_text_opt_in"] is False

    # PREFER_NOT_TO_SAY cannot be combined with other reasons.
    mixed_flag = patient.post(
        path,
        {
            "barrier_reasons": ["COST_CONCERN"],
            "prefer_not_to_say": True,
            "idempotency_key": "bar-bad-1",
        },
    )
    assert mixed_flag.status_code == 422

    mixed_list = patient.post(
        path,
        {
            "barrier_reasons": ["PREFER_NOT_TO_SAY", "COST_CONCERN"],
            "idempotency_key": "bar-bad-2",
        },
    )
    assert mixed_list.status_code == 422

    # Free-text field or opt-in is rejected.
    free_text = patient.post(
        path,
        {
            "barrier_reasons": ["OTHER"],
            "free_text": "MARKER-BARRIER-TEXT",
            "idempotency_key": "bar-bad-3",
        },
    )
    assert free_text.status_code == 422
    assert "MARKER-BARRIER-TEXT" not in free_text.text

    opt_in_true = patient.post(
        path,
        {
            "barrier_reasons": ["OTHER"],
            "free_text_opt_in": True,
            "idempotency_key": "bar-bad-4",
        },
    )
    assert opt_in_true.status_code == 422

    audit_events = [
        e for e in api.audit(patient.case_id) if e.event_type == "NAVIGATION_BARRIER_RECORDED"
    ]
    assert len(audit_events) == 1
    details = json.loads(audit_events[0].details_json)
    assert details == {"count": 2, "prefer_not_to_say": False}
    assert "PRIVACY_CONCERN" not in audit_events[0].details_json


def test_tc_19_4_navigation_and_barrier_records_are_deleted_on_session_end_and_expiry(
    api: Api,
) -> None:
    """TC-19.4: Session end and 24-hour token expiry purge CareNavigationEpisode,
    CareNavigationEvent, CareBarrierReport and CareNavigationIdempotency rows."""
    p1 = api.navigating()
    assert (
        p1.post(
            p1.path("/navigation/progress"),
            {"status": "BOOKING_SELF_REPORTED", "idempotency_key": "p1-book"},
        ).status_code
        == 200
    )
    assert (
        p1.post(
            p1.path("/navigation/barriers"),
            {"barrier_reasons": ["SCHEDULE_CONSTRAINT"], "idempotency_key": "p1-bar"},
        ).status_code
        == 200
    )

    # End session via Quick Exit beacon endpoint.
    end_res = api.client.post("/api/session/end", json={"session_token": p1.token})
    assert end_res.status_code == 204
    with api.db() as db:
        assert db.query(CareNavigationEpisode).filter_by(case_id=p1.case_id).count() == 0
        assert db.query(CareNavigationEvent).count() == 0
        assert db.query(CareBarrierReport).count() == 0
        assert db.query(CareNavigationIdempotency).count() == 0

    # Second patient session expires after 24 hours.
    p2 = api.navigating()
    assert (
        p2.post(
            p2.path("/navigation/progress"),
            {"status": "VISIT_SELF_REPORTED", "idempotency_key": "p2-visit"},
        ).status_code
        == 200
    )
    api.clock.advance(24 * 60 * 60 + 1)
    with api.db() as db:
        purge_expired_navigation(db, api.clock.now())
        db.commit()
        assert db.query(CareNavigationEpisode).filter_by(case_id=p2.case_id).count() == 0


def test_tc_19_5_navigation_funnel_reports_numerators_denominators_and_not_available(
    api: Api,
) -> None:
    """TC-19.5: Reviewer funnel endpoint reports numerator, denominator, rate, and
    verification_source per stage, and keeps provider_verified_visits and care_completed
    as NOT_AVAILABLE."""
    p1 = api.navigating()
    rep = p1.report().json()
    p1.post(
        p1.path("/navigation/acknowledgements"),
        {"guidance_id": rep["guidance_id"], "guidance_version": rep["guidance_version"]},
    )
    p1.post(
        p1.path("/navigation/progress"),
        {"status": "BOOKING_SELF_REPORTED", "idempotency_key": "f-book"},
    )

    p2 = api.approved()
    p2.report()  # opens episode 2 at GUIDANCE_AVAILABLE without ack or start

    funnel_res = api.reviewer().get("/api/evaluation/navigation-funnel")
    assert funnel_res.status_code == 200
    funnel = funnel_res.json()
    assert funnel["observed_scope"] == "ACTIVE_SYNTHETIC_SESSIONS"
    assert funnel["synthetic_demo"] is True
    assert funnel["guidance_episodes"] == 2
    assert funnel["acknowledgement"] == {
        "numerator": 1,
        "denominator": 2,
        "rate": 0.5,
        "verification_source": "SYSTEM_EVENT",
    }
    assert funnel["navigation_started"] == {
        "numerator": 1,
        "denominator": 2,
        "rate": 0.5,
        "verification_source": "SYSTEM_EVENT",
    }
    assert funnel["booking_self_reported"] == {
        "numerator": 1,
        "denominator": 2,
        "rate": 0.5,
        "verification_source": "USER_REPORTED",
    }
    assert funnel["visit_self_reported"] == {
        "numerator": 0,
        "denominator": 2,
        "rate": 0.0,
        "verification_source": "USER_REPORTED",
    }
    assert funnel["provider_verified_visits"] == "NOT_AVAILABLE"
    assert funnel["care_completed"] == "NOT_AVAILABLE"


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
