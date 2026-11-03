"""RF-06 follow-up form and INV-05 unknown states."""

from __future__ import annotations

import json
from typing import Any

import pytest
from httpx import Response

from sanad_api.facts.models import Fact
from tests.helpers import Api


def _questions(response: Response) -> dict[str, dict[str, Any]]:
    return {q["question_id"]: q for q in response.json()["questions"]}


def test_tc_06_2_opt_outs_store_declined_and_unknown(api: Api) -> None:
    patient = api.assessing("J1-002")
    response = patient.answers(
        {"question_id": "Q-BODY-FAT", "choice": "NOT_SURE"},
        {"question_id": "Q-SMOKING", "choice": "PREFER_NOT_TO_ANSWER"},
    )
    assert response.status_code == 200
    with api.db() as db:
        facts = {f.concept_code: f for f in db.query(Fact).filter_by(case_id=patient.case_id)}
    assert facts["body_fat_percent"].state == "UNKNOWN"
    assert facts["smoking"].state == "DECLINED"
    for fact in (facts["body_fat_percent"], facts["smoking"]):
        assert fact.value_json is None and fact.polarity is None
    patient.assess()
    unknown = {u["concept_code"]: u["state"] for u in patient.report().json()["unknown"]}
    assert unknown["body_fat_percent"] == "UNKNOWN" and unknown["smoking"] == "DECLINED"


def test_tc_06_3_conflicting_values_are_both_kept(api: Api) -> None:
    """TC-06.3 (J5-002): both kept as CONFLICTING, and the system picks neither."""
    patient = api.assessing("J5-002")
    assessed = patient.assess().json()
    assert assessed["gatekeeper_status"] == "CONFLICTING_DATA"
    assert assessed["blocking_question_ids"] == ["Q-SMOKING"]
    assert assessed["state"]["state"] == "NEEDS_INFORMATION" and not assessed["draft_ready"]
    smoking = _questions(patient.get(patient.path("/questions")))["Q-SMOKING"]
    assert smoking["reason"] == "CONFLICTING" and smoking["blocking"] is True
    values = sorted(str(v["value"]) for v in smoking["conflicting_values"])
    assert values == ["False", "True"]
    # The user resolves it.
    patient.answers({"question_id": "Q-SMOKING", "choice": "ANSWERED", "value": False})
    with api.db() as db:
        rows = db.query(Fact).filter_by(case_id=patient.case_id, concept_code="smoking").all()
    assert len(rows) == 3 and sum(1 for r in rows if r.superseded_at is None) == 1
    assert patient.assess().json()["gatekeeper_status"] == "READY_FOR_ASSESSMENT"


def test_tc_06_4_bmi_with_training_asks_for_context_and_never_concludes(api: Api) -> None:
    """TC-06.4 (J1-001): a context question, and obesity_confirmed appears nowhere."""
    patient = api.assessing("J1-001")
    questions = _questions(patient.get(patient.path("/questions")))
    assert questions["Q-BODY-FAT"]["reason"] == "CONTEXT" and questions["Q-BODY-FAT"]["blocking"]
    assessed = patient.assess()
    assert assessed.json()["blocking_question_ids"] == ["Q-STEROID-USE", "Q-BODY-FAT"]
    assert "obesity" not in assessed.text.lower()


def test_tc_06_5_declined_items_continue_with_limits(api: Api) -> None:
    """TC-06.5 (J1-003): NEEDS_MORE_INFORMATION with limits, never low risk."""
    patient = api.assessing("J1-003")
    body = patient.assess().json()
    assert body["gatekeeper_status"] == "READY_FOR_ASSESSMENT"
    assert body["triage_proposal"]["action"] == "NEEDS_MORE_INFORMATION"
    report = patient.report().json()
    assert "INFORMATION_INCOMPLETE" in {limit["code"] for limit in report["limits"]}
    states = {u["concept_code"]: u["state"] for u in report["unknown"]}
    assert states["strength_training"] == "DECLINED" and states["body_fat_percent"] == "DECLINED"


def test_tc_06_5_unanswered_items_block(api: Api) -> None:
    """TC-06.5 (J5-001): unanswered required items block, and nothing is invented."""
    patient = api.assessing("J5-001")
    body = patient.assess().json()
    assert body["gatekeeper_status"] == "NEEDS_INFORMATION"
    assert body["blocking_question_ids"] == ["Q-BMI", "Q-STEROID-USE"]
    assert body["triage_proposal"] is None and patient.report().status_code == 409


def test_tc_06_5_a_floor_still_applies_with_declined_items(api: Api) -> None:
    patient = api.assessing("J1-002")
    patient.answers({"question_id": "Q-BODY-FAT", "choice": "PREFER_NOT_TO_ANSWER"})
    body = patient.assess().json()
    assert body["triage_proposal"]["action"] == "SPECIALIST"
    assert body["triage_proposal"]["floor"] == "SPECIALIST"


def test_later_questions_show_only_what_blocks(api: Api) -> None:
    """API support for TC-06.1: in NEEDS_INFORMATION only missing or conflicting questions."""
    patient = api.assessing("J1-002")
    first = _questions(patient.get(patient.path("/questions")))
    assert "Q-SMOKING" in first and first["Q-SMOKING"]["blocking"] is False
    patient.assess()
    later = _questions(patient.get(patient.path("/questions")))
    assert list(later) == ["Q-BODY-FAT"]
    for question in later.values():
        assert question["opt_out_choices"] == ["NOT_SURE", "PREFER_NOT_TO_ANSWER"]


@pytest.mark.parametrize(
    ("answer", "detail"),
    [
        ({"question_id": "Q-NOPE", "choice": "NOT_SURE"}, "UNKNOWN_QUESTION"),
        ({"question_id": "Q-BMI", "choice": "ANSWERED", "value": "MARKER-9"}, "VALUE_TYPE"),
        ({"question_id": "Q-BMI", "choice": "ANSWERED", "value": 400}, "VALUE_OUT_OF_RANGE"),
        ({"question_id": "Q-STEROID-USE", "choice": "ANSWERED", "value": True},
         "TEMPORAL_STATUS_REQUIRED"),
        ({"question_id": "Q-BMI", "choice": "NOT_SURE", "value": 29}, "VALUE_NOT_ALLOWED"),
        ({"question_id": "Q-BMI", "choice": "ANSWERED"}, "VALUE_REQUIRED"),
    ],
)  # fmt: skip
def test_bad_answers_are_refused_without_echoing_values(
    api: Api, answer: dict[str, object], detail: str
) -> None:
    patient = api.assessing("J1-002")
    response = patient.answers(answer)
    assert response.status_code == 422
    assert response.json()["error"]["details"] == [detail]
    assert "MARKER-9" not in response.text


def test_duplicate_answers_are_refused(api: Api) -> None:
    patient = api.assessing("J1-002")
    answer = {"question_id": "Q-SMOKING", "choice": "NOT_SURE"}
    assert patient.answers(answer, answer).status_code == 422


def test_tc_inv_05_unknown_declined_and_not_asked_survive_to_the_api(api: Api) -> None:
    """TC-INV-05: across fixtures, these states are never stored or shown as NO or NORMAL."""
    for fixture in ("J1-003", "J1-004", "J2-001"):
        patient = api.drafted(fixture)
        report = patient.report().json()
        with api.db() as db:
            stored = {
                (f.concept_code, f.state)
                for f in db.query(Fact).filter_by(case_id=patient.case_id)
                if f.state in ("UNKNOWN", "DECLINED")
            }
        shown = {(u["concept_code"], u["state"]) for u in report["unknown"]}
        assert stored <= shown, fixture
        known_codes = {k["concept_code"] for k in report["known"]}
        assert not {code for code, _ in shown} & known_codes, fixture
        text = json.dumps(report)
        assert '"NO"' not in text and "NORMAL" not in text, fixture
