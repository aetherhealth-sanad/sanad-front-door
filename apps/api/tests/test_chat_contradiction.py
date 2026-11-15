"""RF-30 contradiction check for typed chat answers (T4.20).

A fake adapter stands in for the model, so these tests make no network call. They show that the
server compares a validated proposal with the answers the case already holds and tells the user
before anything changes. They say nothing about how well a real model reads a message, and
nothing about clinical safety.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from sanad_api.config import Settings
from sanad_api.facts.models import Fact
from sanad_api.main import create_app
from tests.helpers import Api, ManualClock, Patient
from tests.test_chat import FakeAdapter, details, draft, interpret

STEROID, BMI = "Q-STEROID-USE", "Q-BMI"
CHANGES_MESSAGE = (
    "This is different from an earlier answer. Check which one is right. Nothing changes until "
    "you confirm."
)


@pytest.fixture
def fake() -> FakeAdapter:
    return FakeAdapter()


@pytest.fixture
def chat(settings: Settings, clock: ManualClock, fake: FakeAdapter) -> Iterator[Api]:
    app = create_app(settings, clock, model_adapter=fake)
    with TestClient(app) as client:
        yield Api(client, app, clock)


def blank(api: Api) -> Patient:
    patient = api.start("BLANK")
    assert patient.consent(assessment=True).status_code == 200
    assert patient.safety().json()["state"]["state"] == "ASSESSING"
    return patient


def current(api: Api, case_id: str, concept_code: str) -> list[Fact]:
    with api.db() as db:
        return (
            db.query(Fact)
            .filter_by(case_id=case_id, concept_code=concept_code, superseded_at=None)
            .order_by(Fact.id)
            .all()
        )


def confirm(patient: Patient, proposal: dict[str, object]) -> None:
    keys = ("question_id", "choice", "value", "temporal_status")
    response = patient.answers({key: proposal[key] for key in keys})
    assert response.status_code == 200, response.text


# AC-30.1, AC-30.2 ----------------------------------------------------------------------------


def test_tc_30_1_a_typed_answer_that_differs_from_a_button_answer_is_shown_before_saving(
    chat: Api, fake: FakeAdapter
) -> None:
    patient = blank(chat)
    patient.answers({"question_id": STEROID, "choice": "ANSWERED", "value": False})
    version = patient.state()["case_version"]

    fake.replies.append(draft(value=True, temporal_status="CURRENT"))
    body = interpret(patient, "actually I am on a cycle right now").json()

    assert body["outcome"] == "PROPOSAL"
    assert body["proposal"]["echo_label"] == "Yes, I use them now"
    assert body["contradiction"] == {
        "question_id": STEROID,
        "earlier": [
            {"echo_label": "No", "source_type": "PATIENT_REPORTED", "change": "VALUE_DIFFERS"}
        ],
    }
    assert body["message"] == CHANGES_MESSAGE
    # Nothing changed: the earlier answer is still the only one.
    assert body["state"]["case_version"] == version
    [row] = current(chat, patient.case_id, "anabolic_steroid_use")
    assert row.value_json == "false"


@pytest.mark.parametrize(
    ("fixture_id", "reply", "earlier_label", "change"),
    [
        # J1-004 holds "yes, in the past" from the sample profile.
        ("J1-004", draft(value=True, temporal_status="CURRENT"), "Yes, in the past",
         "TIME_DIFFERS"),
        ("J1-004", draft(value=False), "Yes, in the past", "VALUE_DIFFERS"),
        ("J1-004", draft(choice="NOT_SURE"), "Yes, in the past", "BECOMES_UNKNOWN"),
        ("J1-004", draft(choice="PREFER_NOT_TO_ANSWER"), "Yes, in the past", "BECOMES_UNKNOWN"),
        # J1-002 holds "yes, now".
        ("J1-002", draft(value=True, temporal_status="PAST"), "Yes, I use them now",
         "TIME_DIFFERS"),
    ],
)
def test_tc_30_2_each_kind_of_change_is_named_with_the_earlier_source(
    chat: Api,
    fake: FakeAdapter,
    fixture_id: str,
    reply: object,
    earlier_label: str,
    change: str,
) -> None:
    patient = chat.assessing(fixture_id)
    fake.replies.append(reply)  # type: ignore[arg-type]
    body = interpret(patient, "some answer").json()
    assert body["outcome"] == "PROPOSAL"
    assert body["contradiction"]["earlier"] == [
        {"echo_label": earlier_label, "source_type": "SAMPLE_FIXTURE", "change": change}
    ]


def test_tc_30_2_a_number_is_compared_after_normalising(chat: Api, fake: FakeAdapter) -> None:
    patient = chat.assessing("J1-004")  # BMI 29.0 from the sample profile

    fake.replies.append(draft(value=29))  # the same number written as a whole number
    same = interpret(patient, "29", BMI).json()
    assert same["outcome"] == "PROPOSAL" and same["contradiction"] is None

    fake.replies.append(draft(value=31.5))
    differs = interpret(patient, "31.5", BMI).json()
    [earlier] = differs["contradiction"]["earlier"]
    assert earlier["change"] == "VALUE_DIFFERS"
    assert earlier["echo_label"].startswith("29 ")
    assert earlier["source_type"] == "SAMPLE_FIXTURE"


# AC-30.3 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "earlier",
    [
        None,  # never asked
        {"question_id": STEROID, "choice": "NOT_SURE"},
        {"question_id": STEROID, "choice": "PREFER_NOT_TO_ANSWER"},
        {"question_id": STEROID, "choice": "ANSWERED", "value": True, "temporal_status": "PAST"},
    ],
)
def test_tc_30_3_no_contradiction_when_nothing_known_disagrees(
    chat: Api, fake: FakeAdapter, earlier: dict[str, object] | None
) -> None:
    patient = blank(chat)
    if earlier is not None:
        assert patient.answers(earlier).status_code == 200
    fake.replies.append(draft(value=True, temporal_status="PAST"))
    body = interpret(patient, "I used them years ago").json()
    assert body["outcome"] == "PROPOSAL"
    assert body["contradiction"] is None
    assert body["message"] == "Check this answer. Nothing is saved until you confirm it."


# AC-30.4 -------------------------------------------------------------------------------------


def test_tc_30_4_the_model_never_sees_the_earlier_answer(chat: Api, fake: FakeAdapter) -> None:
    # The request for a case holding "yes, in the past" equals the one for an empty case.
    for patient in (chat.assessing("J1-004"), blank(chat)):
        fake.replies.append(draft(value=True, temporal_status="CURRENT"))
        interpret(patient, "I use them now")

    held, empty = fake.calls
    assert set(json.loads(held.user_content)) == {"question", "message"}
    assert held.user_content == empty.user_content


# AC-30.5 -------------------------------------------------------------------------------------


def test_tc_30_5_confirming_replaces_a_chat_or_form_answer_and_keeps_another_source(
    chat: Api, fake: FakeAdapter
) -> None:
    patient = blank(chat)
    patient.answers({"question_id": STEROID, "choice": "ANSWERED", "value": False})
    fake.replies.append(draft(value=True, temporal_status="CURRENT"))
    confirm(patient, interpret(patient, "I use them now").json()["proposal"])
    [row] = current(chat, patient.case_id, "anabolic_steroid_use")
    assert (row.value_json, row.temporal_status) == ("true", "CURRENT")

    sampled = chat.assessing("J1-004")
    fake.replies.append(draft(value=True, temporal_status="CURRENT"))
    confirm(sampled, interpret(sampled, "I use them now").json()["proposal"])
    rows = current(chat, sampled.case_id, "anabolic_steroid_use")
    assert sorted((r.source_type, r.temporal_status) for r in rows) == [
        ("PATIENT_REPORTED", "CURRENT"),
        ("SAMPLE_FIXTURE", "PAST"),
    ]
    # Both are kept, so the field reads CONFLICTING and blocks until the user resolves it.
    assessed = sampled.assess().json()
    assert assessed["gatekeeper_status"] == "CONFLICTING_DATA"
    assert STEROID in assessed["blocking_question_ids"]


# AC-30.6 -------------------------------------------------------------------------------------


def test_tc_30_6_the_trace_holds_change_codes_only(chat: Api, fake: FakeAdapter) -> None:
    patient = chat.assessing("J1-004")
    fake.replies.append(draft(value=True, temporal_status="CURRENT"))
    interpret(patient, "I use them now")
    fake.replies.append(draft(value=True, temporal_status="PAST"))
    interpret(patient, "I used them before")

    runs = details(chat, patient.case_id, "MODEL_TASK_RUN")
    assert [run.get("contradiction") for run in runs] == [["TIME_DIFFERS"], None]
    stored = json.dumps(runs)
    assert "in the past" not in stored and "I use them now" not in stored


def test_tc_30_6_no_check_without_a_proposal(chat: Api, fake: FakeAdapter) -> None:
    patient = chat.assessing("J1-004")
    fake.replies.append(draft(status="ABSTAIN", choice=None, abstain_reason="UNCLEAR"))
    body = interpret(patient, "hmm").json()
    assert body["outcome"] == "FALLBACK"
    assert body["contradiction"] is None
