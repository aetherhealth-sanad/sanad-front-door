"""RF-28 patient-held visit summary (T4.14).

The server keeps nothing new: the user downloads a summary and may upload it next visit.
Synthetic fixtures only. These tests check the file's content and the round trip; they are not
evidence that a returning user's answers are still true.
"""

from __future__ import annotations

import json

import jsonschema

from sanad_api.facts.models import Fact
from tests.conftest import REPO_ROOT
from tests.helpers import Api, Patient
from tests.test_decision_record import detail

SCHEMA = json.loads((REPO_ROOT / "schemas" / "upload-profile.schema.json").read_text("utf-8"))
EMERGENCY = {"sudden_severe_scrotal_pain", "fever_with_painful_scrotal_swelling", "scrotal_trauma"}


def export(patient: Patient):
    return patient.get(patient.path("/summary-file"))


def assessed(api: Api) -> Patient:
    patient = api.assessing("CN-001")
    answered = patient.answers(
        {"question_id": "Q-SMOKING", "choice": "ANSWERED", "value": True,
         "temporal_status": "CURRENT"},
        {"question_id": "Q-DIABETES", "choice": "NOT_SURE"},
    )  # fmt: skip
    assert answered.status_code == 200, answered.text
    return patient


# AC-28.1 / AC-28.2 / AC-28.3 -----------------------------------------------------------------


def test_tc_28_1_export_is_a_valid_upload_file_with_no_identifiers(api: Api) -> None:
    patient = assessed(api)
    response = export(patient)
    assert response.status_code == 200, response.text
    assert "attachment" in response.headers["content-disposition"]
    assert "no-store" in response.headers["cache-control"]
    body = response.json()
    jsonschema.validate(body, SCHEMA)
    assert body["profile_format"] == "sanad-profile-0.1" and body["is_synthetic"] is True
    assert set(body["summary_of"]) == {"exported_on", "question_catalogue_version"}
    raw = response.text
    assert patient.case_id not in raw and patient.token not in raw


def test_tc_28_1_export_needs_the_case_token_and_consent(api: Api) -> None:
    patient = assessed(api)
    other = api.assessing("CN-001")
    assert other.get(patient.path("/summary-file")).status_code == 404
    fresh = api.start("BLANK")
    assert export(fresh).status_code == 403


def test_tc_28_2_emergency_and_psychosocial_are_never_exported(api: Api) -> None:
    body = export(assessed(api)).json()
    codes = {r["concept_code"] for r in body["responses"]}
    assert not codes & EMERGENCY
    fields = {"concept_code", "value", "state", "temporal_status"}
    assert all(set(r) <= fields for r in body["responses"])


def test_tc_28_3_latest_patient_answer_wins_and_unknown_stays_a_state(api: Api) -> None:
    body = export(assessed(api)).json()
    by_code = {r["concept_code"]: r for r in body["responses"]}
    assert by_code["smoking"] == {"concept_code": "smoking", "value": True,
                                  "temporal_status": "CURRENT"}  # fmt: skip
    assert by_code["type2_diabetes"] == {"concept_code": "type2_diabetes", "state": "UNKNOWN"}


# AC-28.5 / AC-28.6 ---------------------------------------------------------------------------


def returning(api: Api, summary: dict) -> Patient:
    patient = api.start("UPLOAD")
    assert patient.consent(assessment=True).status_code == 200
    response = patient.upload(summary)
    assert response.status_code == 200, response.text
    assert patient.safety().status_code == 200
    return patient


def test_tc_28_4_round_trip_loads_answers_as_user_uploaded(api: Api) -> None:
    summary = export(assessed(api)).json()
    patient = returning(api, summary)
    with api.db() as db:
        facts = db.query(Fact).filter_by(case_id=patient.case_id).all()
    uploaded = {f.concept_code for f in facts if f.source_type == "USER_UPLOADED"}
    assert {r["concept_code"] for r in summary["responses"]} <= uploaded
    assert {f.verification_status for f in facts} == {"UNVERIFIED"}


def test_tc_28_5_changed_answers_are_listed_for_the_reviewer(api: Api) -> None:
    summary = export(assessed(api)).json()
    patient = returning(api, summary)
    changed = patient.answers(
        {"question_id": "Q-SMOKING", "choice": "ANSWERED", "value": True,
         "temporal_status": "PAST"},
    )  # fmt: skip
    assert changed.status_code == 200, changed.text
    # The file said "current", today says "past": the rules ask the user to settle it (RF-06).
    first = patient.assess().json()
    assert first["state"]["state"] == "NEEDS_INFORMATION"
    questions = patient.get(patient.path("/questions")).json()["questions"]
    assert [q["question_id"] for q in questions] == ["Q-SMOKING"]
    settled = patient.answers(
        {"question_id": "Q-SMOKING", "choice": "ANSWERED", "value": True,
         "temporal_status": "PAST"},
    )  # fmt: skip
    assert settled.status_code == 200, settled.text
    assert patient.assess().json()["draft_ready"]
    assert patient.consent(clinician_review=True).status_code == 200
    assert patient.send_for_review().status_code == 201
    record = detail(api, patient)["decision_record"]
    changes = {c["concept_code"]: c for c in record["changes_since_summary"]}
    assert changes["smoking"]["before"] == {"state": "KNOWN_POSITIVE", "value": True,
                                            "temporal_status": "CURRENT",
                                            "source_type": "USER_UPLOADED"}  # fmt: skip
    assert changes["smoking"]["now"]["temporal_status"] == "PAST"
    assert changes["smoking"]["now"]["source_type"] == "PATIENT_REPORTED"
    assert "age_years" not in changes  # unchanged answers are not listed
    assert "improv" not in json.dumps(record).lower()


# AC-28.7 -------------------------------------------------------------------------------------


def test_tc_28_6_export_audit_holds_counts_only(api: Api) -> None:
    patient = assessed(api)
    body = export(patient).json()
    events = [e for e in api.audit(patient.case_id) if e.event_type == "SUMMARY_EXPORTED"]
    (event,) = events
    details = json.loads(event.details_json)
    assert details == {"responses": len(body["responses"]),
                       "observations": len(body.get("observations", []))}  # fmt: skip
