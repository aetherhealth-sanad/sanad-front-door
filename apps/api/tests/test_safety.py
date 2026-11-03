"""RF-10 safety check, J4 and late emergency triggers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from sanad_api.catalogues import Catalogues
from sanad_api.facts.models import Fact
from sanad_api.rules_engine.emergency import evaluate_responses
from tests.helpers import Api, Patient

GOLDEN = Path(__file__).resolve().parents[3] / "eval" / "golden" / "rule_conformance.jsonl"
YES_01 = {"SAFETY-01": "YES", "SAFETY-02": "NO", "SAFETY-03": "NO"}


def _blank_consented(api: Api) -> Patient:
    patient = api.start()
    patient.consent(assessment=True)
    return patient


def test_tc_10_2_trigger_gives_guidance_and_no_further_questions(api: Api) -> None:
    """TC-10.2 (J4-001): EMERGENCY_GUIDANCE_ISSUED at once, from the rules alone."""
    patient = _blank_consented(api)
    body = patient.safety(YES_01).json()
    assert body["result"] == "EMERGENCY_GUIDANCE_ISSUED"
    assert body["rule_ids"] == ["DRAFT-EMERG-01"] and body["approval_status"] == "CLINICAL_TBD"
    assert body["state"]["state"] == "EMERGENCY_GUIDANCE_ISSUED"
    assert body["state"]["route"] == "/urgent.html"
    assert body["state"]["allowed_actions"] == ["CLOSE"]
    assert patient.get(patient.path("/questions")).status_code == 409
    assert patient.answers({"question_id": "Q-SMOKING", "choice": "NOT_SURE"}).status_code == 409


def _golden_cases() -> list[dict[str, object]]:
    lines = GOLDEN.read_text().splitlines()
    return [json.loads(line) for line in lines if line and "_meta" not in json.loads(line)]


@pytest.mark.parametrize("case", _golden_cases(), ids=lambda c: str(c["case_id"]))
def test_tc_10_4_rule_conformance_golden_set(
    case: dict[str, object], catalogues: Catalogues
) -> None:
    """TC-10.4: the Python check returns the golden result. The browser check must too."""
    responses = case["responses"]
    assert isinstance(responses, dict)
    evaluation = evaluate_responses(responses, catalogues.emergency)
    expected = case["expected"]
    assert isinstance(expected, dict)
    assert evaluation.result.value == expected["result"]
    assert list(evaluation.rule_ids) == expected["rule_ids"]


def test_tc_10_4_golden_set_covers_every_full_response_combination() -> None:
    assert len(_golden_cases()) >= 4**3


def test_tc_10_5_emergency_case_cannot_be_sent_or_referred(api: Api) -> None:
    patient = _blank_consented(api)
    patient.safety(YES_01)
    patient.consent(clinician_review=True)
    send = patient.send_for_review()
    assert send.status_code == 409 and send.json()["error"]["code"] == "INVALID_TRANSITION"
    refer = patient.refer()
    assert refer.status_code == 403 and "STATE_NOT_ELIGIBLE" in refer.json()["error"]["details"]
    assert patient.state()["state"] == "EMERGENCY_GUIDANCE_ISSUED"


def test_tc_10_6_trigger_in_an_upload_reaches_guidance(api: Api) -> None:
    patient = api.start("UPLOAD")
    patient.consent(assessment=True)
    response = patient.upload(
        {
            "profile_format": "sanad-profile-0.1",
            "is_synthetic": True,
            "responses": [{"concept_code": "scrotal_trauma", "value": True}],
        }
    )
    assert response.json()["state"] == "EMERGENCY_GUIDANCE_ISSUED"


def test_tc_10_6_trigger_in_a_sample_skips_the_safety_screen(api: Api) -> None:
    """G6: a profile holding a trigger reaches guidance without the safety screen."""
    patient = api.consented("J4-001")
    assert patient.load_sample().json()["state"] == "EMERGENCY_GUIDANCE_ISSUED"


@pytest.mark.parametrize("start_state", ["ASSESSING", "NEEDS_INFORMATION", "REVISION_REQUIRED"])
def test_tc_10_6_trigger_in_the_form_reaches_guidance_from_each_state(
    api: Api, start_state: str
) -> None:
    """TC-10.6 and AC-06.6: a late trigger has the same effect from every earlier state."""
    if start_state == "ASSESSING":
        patient = api.assessing("J1-002")
    elif start_state == "NEEDS_INFORMATION":
        patient = api.assessing("J1-002")
        patient.assess()
    else:
        patient = api.pending()
        api.decide(patient, "REQUEST_CLARIFICATION", question_ids=["Q-SMOKING"])
    assert patient.state()["state"] == start_state
    response = patient.answers({"question_id": "SAFETY-02", "choice": "ANSWERED", "value": True})
    assert response.status_code == 200
    assert response.json()["state"] == "EMERGENCY_GUIDANCE_ISSUED"
    checked = [e for e in api.audit(patient.case_id) if e.event_type == "SAFETY_CHECKED"]
    assert '"origin": "FOLLOW_UP_FORM"' in checked[-1].details_json


def test_tc_10_7_audit_has_rule_ids_and_version_but_no_answers(api: Api) -> None:
    patient = _blank_consented(api)
    patient.safety(YES_01)
    event = [e for e in api.audit(patient.case_id) if e.event_type == "SAFETY_CHECKED"][-1]
    details = json.loads(event.details_json)
    assert details["rule_ids"] == ["DRAFT-EMERG-01"]
    assert details["catalogue_version"] == "emergency-draft-0.1"
    assert set(details) == {"rule_ids", "catalogue_version", "result", "origin"}
    assert "YES" not in event.details_json and "SAFETY-01" not in event.details_json


def test_not_sure_is_stored_unknown_and_does_not_trigger(api: Api) -> None:
    patient = _blank_consented(api)
    body = patient.safety({"SAFETY-01": "NO", "SAFETY-02": "NOT_SURE", "SAFETY-03": "NO"}).json()
    assert body["result"] == "SAFE_TO_CONTINUE" and body["state"]["state"] == "ASSESSING"
    with api.db() as db:
        fact = db.query(Fact).filter_by(
            case_id=patient.case_id, concept_code="fever_with_painful_scrotal_swelling"
        ).one()
        assert fact.state == "UNKNOWN" and fact.value_json is None


def test_missing_current_question_asks_for_a_recheck(api: Api) -> None:
    """API design 6.4: no trigger and a missing current question keep the case CONSENTED."""
    patient = _blank_consented(api)
    body = patient.safety({"SAFETY-01": "NO"}).json()
    assert body["result"] == "NEEDS_RECHECK" and body["needs_recheck"] is True
    assert body["state"]["state"] == "CONSENTED" and body["state"]["route"] == "/safety"


def test_a_trigger_wins_even_with_a_stale_catalogue(api: Api) -> None:
    patient = _blank_consented(api)
    response = patient.post(
        patient.path("/safety-check"),
        {
            "catalogue_version": "emergency-draft-0.0",
            "answers": [
                {"question_id": "SAFETY-OLD-09", "response": "NO"},
                {"question_id": "SAFETY-03", "response": "YES"},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["result"] == "EMERGENCY_GUIDANCE_ISSUED"
    assert response.json()["rule_ids"] == ["DRAFT-EMERG-03"]


def test_safety_check_runs_only_once_consented(api: Api) -> None:
    patient = api.assessing()
    assert patient.safety().status_code == 409
