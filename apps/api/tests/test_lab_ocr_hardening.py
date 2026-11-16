"""Regression checks for the T-60 cross-field + explicit-review update, synthetic only."""

from __future__ import annotations

import sys
from datetime import date

import pytest

from sanad_api.document_import.extract import extract, to_observation_inputs
from sanad_api.document_import.fields import load_lab_catalogue
from sanad_api.document_import.model import Flag, Status
from tests.conftest import REPO_ROOT
from tests.helpers import Api

sys.path.insert(0, str(REPO_ROOT / "eval" / "lab_ocr"))
from lab_reports import Report, render_pdf, with_changes  # noqa: E402

TODAY = date(2026, 11, 15)
LAB = load_lab_catalogue(REPO_ROOT)


def parsed(report: Report):
    return extract(render_pdf(report), LAB, TODAY)


def test_consistent_total_is_not_flagged() -> None:
    result = parsed(Report())
    for name in ("volume", "concentration", "total_count"):
        assert Flag.TOTAL_COUNT_MISMATCH not in result.field(name).flags


def test_cross_field_mismatch_marks_all_inputs_without_correcting_values() -> None:
    report = with_changes(Report(), values={**Report().values, "total_count": "560"})
    result = parsed(report)
    for name in ("volume", "concentration", "total_count"):
        item = result.field(name)
        assert Flag.TOTAL_COUNT_MISMATCH in item.flags
        assert item.status.value == "NEEDS_CONFIRMATION"
        assert item.scores.plausibility == 0.0
    assert result.field("total_count").value == 560.0  # no silent correction
    assert result.field("volume").value == 2.5


def test_rounding_tolerance_accepts_56_vs_56_point_25() -> None:
    values = {**Report().values, "concentration": "22.5", "total_count": "56"}
    result = parsed(with_changes(Report(), values=values))
    assert Flag.TOTAL_COUNT_MISMATCH not in result.field("total_count").flags


def test_consistency_check_skips_unrecognized_units_and_missing_values() -> None:
    changed = with_changes(
        Report(), values={**Report().values, "total_count": "560"}, units={"concentration": "???"}
    )
    result = parsed(changed)
    assert Flag.UNIT_UNRECOGNISED in result.field("concentration").flags
    assert Flag.TOTAL_COUNT_MISMATCH not in result.field("total_count").flags


def test_ocr_helper_never_exports_unreviewed_fields() -> None:
    draft = parsed(Report())
    assert to_observation_inputs(draft) == []
    selected = to_observation_inputs(draft, reviewed_field_ids={"volume"})
    assert selected == [{
        "test_code": "VOLUME_PLACEHOLDER", "value": 2.5,
        "unit": "mL", "collected_on": "2026-10-05",
    }]


def test_ocr_helper_rejects_flagged_values_and_unsupported_fields() -> None:
    wrong = parsed(with_changes(Report(), values={**Report().values, "total_count": "560"}))
    with pytest.raises(ValueError, match="OCR_FIELD_NEEDS_MANUAL_REVIEW"):
        to_observation_inputs(wrong, reviewed_field_ids={"volume"})
    with pytest.raises(ValueError, match="OCR_UNSUPPORTED_FIELD_SELECTION"):
        to_observation_inputs(wrong, reviewed_field_ids={"total_count"})
    ambiguous = parsed(with_changes(Report(), collection_date="05/10/26"))
    with pytest.raises(ValueError, match="OCR_COLLECTION_DATE_NEEDS_REVIEW"):
        to_observation_inputs(ambiguous, reviewed_field_ids={"volume"})


def test_api_requires_patient_auth_and_never_writes_observations(api: Api) -> None:
    patient = api.assessing()
    path = patient.path("/profile/document")
    document = render_pdf(Report())
    headers = {**patient.headers, "Content-Type": "application/pdf"}
    response = api.client.post(path, content=document, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "EXTRACTED"
    assert body["is_synthetic"] is True
    assert {f["status"] for f in body["fields"]} <= {"UNCONFIRMED", "NEEDS_CONFIRMATION"}
    assert response.headers["cache-control"] == "no-store"
    assert patient.get(patient.path("/observations")).json()["observations"] == []
    unauthorized = api.client.post(path, content=document, headers={"Content-Type": "application/pdf"})
    assert unauthorized.status_code in {401, 403}


def test_api_limits_upload_and_rejects_non_synthetic(api: Api) -> None:
    patient = api.assessing()
    path = patient.path("/profile/document")
    response = api.client.post(path, content=b"x" * (5 * 1024 * 1024 + 1), headers={
        **patient.headers, "Content-Type": "application/pdf"
    })
    assert response.status_code == 413
    assert response.json()["error"]["details"] == ["DOCUMENT_TOO_LARGE"]
    report = with_changes(Report(), banner=False)
    response = api.client.post(path, content=render_pdf(report), headers={
        **patient.headers, "Content-Type": "application/pdf"
    })
    assert response.status_code == 200
    assert response.json()["reason"] == "DOCUMENT_NOT_SYNTHETIC"
    assert response.json()["fields"] == []


def test_api_rejects_invalid_file_and_remains_read_only(api: Api) -> None:
    patient = api.assessing()
    response = api.client.post(patient.path("/profile/document"), content=b"hello", headers={
        **patient.headers, "Content-Type": "text/plain"
    })
    assert response.status_code == 200
    assert response.json()["status"] == Status.REJECTED
    assert response.json()["fields"] == []
    assert patient.get(patient.path("/observations")).json()["observations"] == []
