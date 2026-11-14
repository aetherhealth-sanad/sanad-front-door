"""RF-24 decision record for the reviewer (T4.8).

The record is rebuilt from stored data on each read. These tests check that it matches what is
stored and changes nothing. They say nothing about whether a reviewer reads it.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from sanad_api.config import Settings
from sanad_api.facts.models import Fact
from sanad_api.facts.service import build_view
from sanad_api.main import create_app
from sanad_api.model_adapter.port import ModelResult, ModelStatus
from sanad_api.reports.models import Draft
from sanad_api.review.decision_record import facts_used
from tests.helpers import Api, ManualClock, Patient
from tests.test_citations import FakeAdapter

DISCLOSURE_VERSION = "MODEL-DISCLOSURE-0.1"


@pytest.fixture
def fake() -> FakeAdapter:
    return FakeAdapter()


@pytest.fixture
def rec_api(settings: Settings, clock: ManualClock, fake: FakeAdapter) -> Iterator[Api]:
    app = create_app(settings, clock, model_adapter=fake)
    with TestClient(app) as client:
        yield Api(client, app, clock)


def detail(api: Api, patient: Patient) -> dict:
    response = api.reviewer().get(f"/api/reviews/{patient.case_id}")
    assert response.status_code == 200, response.text
    return response.json()


# AC-24.1 -------------------------------------------------------------------------------------


def test_tc_24_1_record_matches_stored_rules_facts_and_hash(api: Api) -> None:
    patient = api.pending("CN-001")
    record = detail(api, patient)["decision_record"]

    assert record["action"] == "SPECIALIST"
    assert record["floor"] == "SPECIALIST"
    steroid = next(r for r in record["rules"] if r["rule_id"] == "DRAFT-STEROID-01")
    assert steroid == {
        "rule_id": "DRAFT-STEROID-01",
        "signal": "REPORTS_ANABOLIC_STEROID_USE",
        "sets_floor": True,
        "rule_version": "draft-0.1",
        "approval_status": "CLINICAL_TBD",
    }
    assert record["catalogue_versions"] == {
        "questions": "questions-draft-0.1",
        "emergency": "emergency-draft-0.1",
        "emergency_text": "emergency-text-draft-0.1",
        "lab_tests": "lab-tests-draft-0.1",
        "passages": "passages-0.1",
        "consent": "CONSENT-0.1",
    }
    fact = next(f for f in record["facts_used"] if f["concept_code"] == "anabolic_steroid_use")
    assert fact["state"] == "KNOWN_POSITIVE"
    assert fact["values"] and all(v["source_type"] for v in fact["values"])
    assert {e["status"] for e in record["evidence"]} == {"INSUFFICIENT_EVIDENCE"}
    assert record["model_runs"] == []
    with api.db() as db:
        stored = db.query(Draft).filter_by(case_id=patient.case_id).order_by(Draft.id.desc())
        assert record["report_hash"] == stored.first().report_hash
    assert record["built_at"]


# AC-24.2 -------------------------------------------------------------------------------------


def test_tc_24_2_reading_writes_nothing_and_calls_no_model(rec_api: Api, fake: FakeAdapter) -> None:
    patient = rec_api.assessing("CN-001")
    body = {
        "status": "PROPOSED",
        "choice": "ANSWERED",
        "value": True,
        "temporal_status": "PAST",
        "abstain_reason": None,
    }
    fake.replies = [ModelResult(ModelStatus.OK, json.dumps(body), attempts=1, elapsed_ms=5)]
    chat = patient.post(
        patient.path("/chat/interpret"),
        {
            "question_id": "Q-STEROID-USE",
            "text": "used them, stopped",
            "disclosure_version": DISCLOSURE_VERSION,
        },
    )
    assert chat.json()["outcome"] == "PROPOSAL"
    assert patient.assess().status_code == 200
    assert patient.consent(clinician_review=True).status_code == 200
    assert patient.send_for_review().status_code == 201

    audit_before = len(rec_api.audit(patient.case_id))
    version_before = patient.state()["case_version"]
    first = detail(rec_api, patient)["decision_record"]
    second = detail(rec_api, patient)["decision_record"]

    assert len(fake.calls) == 1  # only the chat call; building the record calls nothing
    assert len(rec_api.audit(patient.case_id)) == audit_before
    assert patient.state()["case_version"] == version_before
    assert first["report_hash"] == second["report_hash"]
    (run,) = first["model_runs"]
    assert run["task_id"] == "intake.extract.v1"
    assert run["status"] == "OK" and run["outcome"] == "PROPOSAL"
    assert set(run) == {"task_id", "status", "outcome", "at"}


# AC-24.3 -------------------------------------------------------------------------------------


def _fact(state: str, value: object, source: str, temporal: str | None = None) -> Fact:
    return Fact(
        fact_id=f"SF-{source}-{state}",
        case_id="CASE-1",
        concept_code="smoking",
        value_json=None if value is None else json.dumps(value),
        state=state,
        polarity=None,
        temporal_status=temporal,
        unit=None,
        source_type=source,
        verification_status="UNVERIFIED",
        recorded_at=datetime(2026, 11, 14, tzinfo=UTC),
        superseded_at=None,
        id=1,
    )


def test_tc_24_3_unknown_and_conflicting_keep_their_state() -> None:
    unknown = build_view("smoking", [_fact("UNKNOWN", None, "PATIENT_REPORTED")])
    (entry,) = facts_used({"smoking": unknown}, ["smoking"])
    assert entry["state"] == "UNKNOWN"
    assert entry["values"] == [
        {
            "state": "UNKNOWN",
            "value": None,
            "temporal_status": None,
            "source_type": "PATIENT_REPORTED",
        }
    ]

    facts = [
        _fact("KNOWN_POSITIVE", True, "SAMPLE_FIXTURE", "CURRENT"),
        _fact("KNOWN_NEGATIVE", False, "PATIENT_REPORTED"),
    ]
    conflicting = build_view("smoking", facts)
    (entry,) = facts_used({"smoking": conflicting}, ["smoking"])
    assert entry["state"] == "CONFLICTING"
    assert {(v["value"], v["source_type"]) for v in entry["values"]} == {
        (True, "SAMPLE_FIXTURE"),
        (False, "PATIENT_REPORTED"),
    }


# AC-24.4 -------------------------------------------------------------------------------------


def test_tc_24_4_record_is_reviewer_only(api: Api) -> None:
    patient = api.pending("CN-001")
    assert "decision_record" not in patient.report().json()
    response = patient.get(f"/api/reviews/{patient.case_id}")
    assert response.status_code == 403  # a patient token has the wrong role
    assert "decision_record" not in response.text
