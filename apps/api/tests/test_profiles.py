"""RF-02 profile loading: samples and synthetic uploads."""

from __future__ import annotations

import json
from typing import Any

import pytest

from sanad_api.cases.models import Case
from sanad_api.facts.models import Fact
from sanad_api.observations.models import Observation
from tests.helpers import Api

MARKER = "MARKER-UPLOAD-5521"


def profile(*responses: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {
        "profile_format": "sanad-profile-0.1",
        "is_synthetic": True,
        "responses": list(responses),
        **extra,
    }


VALID = profile(
    {"concept_code": "bmi", "value": 29.0},
    {"concept_code": "anabolic_steroid_use", "value": True, "temporal_status": "PAST"},
    {"concept_code": "body_fat_percent", "state": "UNKNOWN"},
)


def test_tc_02_4_uploaded_values_are_user_uploaded_and_unverified(api: Api) -> None:
    patient = api.start("UPLOAD")
    patient.consent(assessment=True)
    response = patient.upload(VALID)
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "CONSENTED"
    assert "LOAD_PROFILE" not in response.json()["allowed_actions"]
    with api.db() as db:
        facts = db.query(Fact).filter_by(case_id=patient.case_id).all()
        assert len(facts) == 3
        assert {f.source_type for f in facts} == {"USER_UPLOADED"}
        assert {f.verification_status for f in facts} == {"UNVERIFIED"}
        steroid = next(f for f in facts if f.concept_code == "anabolic_steroid_use")
        assert steroid.temporal_status == "PAST"
        unknown = next(f for f in facts if f.concept_code == "body_fat_percent")
        assert unknown.state == "UNKNOWN" and unknown.value_json is None


BAD_UPLOADS: list[tuple[str, Any, str, int, str]] = [
    ("wrong type", b"%PDF-1.4 " + MARKER.encode(), "application/pdf", 415, "UPLOAD_WRONG_TYPE"),
    ("not JSON", MARKER.encode(), "application/json", 415, "UPLOAD_WRONG_TYPE"),
    ("over 256 KB", b"{" + b" " * (256 * 1024) + b"}", "application/json", 413, "UPLOAD_TOO_LARGE"),
    (
        "schema failure",
        profile({"concept_code": "bmi", "value": MARKER}),
        "application/json",
        422,
        "UPLOAD_SCHEMA_INVALID",
    ),
    ("unknown field", {**VALID, "name": MARKER}, "application/json", 422, "UPLOAD_UNKNOWN_FIELD"),
    (
        "unknown nested field",
        profile({"concept_code": "bmi", "value": 29.0, "phone": MARKER}),
        "application/json",
        422,
        "UPLOAD_UNKNOWN_FIELD",
    ),
    ("is_synthetic false", {**VALID, "is_synthetic": False}, "application/json", 422,
     "UPLOAD_NOT_SYNTHETIC"),
    ("is_synthetic missing", {k: v for k, v in VALID.items() if k != "is_synthetic"},
     "application/json", 422, "UPLOAD_NOT_SYNTHETIC"),
]  # fmt: skip


@pytest.mark.parametrize(
    ("label", "data", "content_type", "status", "code"), BAD_UPLOADS, ids=[b[0] for b in BAD_UPLOADS]
)
def test_tc_02_5_bad_uploads_are_rejected_and_store_nothing(
    api: Api, label: str, data: Any, content_type: str, status: int, code: str
) -> None:
    """TC-02.5: rejected, nothing stored, and the error repeats none of the file's content."""
    patient = api.start("UPLOAD")
    patient.consent(assessment=True)
    response = patient.upload(data, content_type=content_type)
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code
    assert MARKER not in response.text and "name" not in response.json()["error"]["details"]
    with api.db() as db:
        assert db.query(Fact).filter_by(case_id=patient.case_id).count() == 0
        case = db.get(Case, patient.case_id)
        assert case is not None and not case.profile_applied
    assert patient.state()["case_version"] == 1


def test_sample_values_carry_sample_fixture_source(api: Api) -> None:
    patient = api.consented("J1-002")
    response = patient.load_sample()
    assert response.status_code == 200 and response.json()["case_version"] == 2
    with api.db() as db:
        sources = {f.source_type for f in db.query(Fact).filter_by(case_id=patient.case_id)}
        assert sources == {"SAMPLE_FIXTURE"}


def test_a_profile_loads_only_once(api: Api) -> None:
    patient = api.consented("J1-002")
    assert patient.load_sample().status_code == 200
    second = patient.load_sample()
    assert second.status_code == 409 and second.json()["error"]["code"] == "INVALID_TRANSITION"


def test_upload_is_refused_for_a_sample_case(api: Api) -> None:
    patient = api.consented("J1-002")
    assert patient.upload(VALID).status_code == 409


def test_uploaded_lab_values_wait_for_confirmation(api: Api) -> None:
    patient = api.start("UPLOAD")
    patient.consent(assessment=True)
    observation = {
        "test_code": "MOTILITY_PLACEHOLDER",
        "value": 40,
        "unit": "%",
        "collected_on": "2026-10-20",
        "reference_source": "Synthetic report",
    }
    assert patient.upload(profile(observations=[observation])).status_code == 200
    with api.db() as db:
        row = db.query(Observation).filter_by(case_id=patient.case_id).one()
        assert row.confirmation_status == "NEEDS_USER_CONFIRMATION"
        assert row.source == "USER_UPLOADED" and json.loads(row.issues_json) == []
