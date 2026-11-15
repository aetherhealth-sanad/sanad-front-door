"""RF-27 identifier blocking and redaction before a model call (T4.12).

Synthetic text only. These tests check that the listed patterns are blocked or redacted and
that nothing redacted reaches the model, the audit or the response. Pattern rules miss some
identifiers (AC-27.8); passing here is not evidence that every identifier is caught.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sanad_api.chat.guardrail import check, decode, redact
from sanad_api.config import Settings
from sanad_api.main import create_app
from tests.helpers import Api, ManualClock
from tests.test_chat import FakeAdapter, assessing, details, draft, interpret
from tests.test_model_eval import ev, write_cases


@pytest.fixture
def fake() -> FakeAdapter:
    return FakeAdapter()


@pytest.fixture
def chat(settings: Settings, clock: ManualClock, fake: FakeAdapter) -> Iterator[Api]:
    app = create_app(settings, clock, model_adapter=fake)
    with TestClient(app) as client:
        yield Api(client, app, clock)


# AC-27.1 -------------------------------------------------------------------------------------


def test_tc_27_1_emergency_beats_identifiers(chat: Api, fake: FakeAdapter) -> None:
    patient = assessing(chat)
    text = "I'm John Smith, MRN 123456, sudden severe pain in my testicles"
    body = interpret(patient, text).json()
    assert body["outcome"] == "EMERGENCY_GUIDANCE"
    assert fake.calls == []
    assert details(chat, patient.case_id, "INPUT_CHECKED") == []


# AC-27.2 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "my MRN is 123456",
        "medical record number: 98765",
        "passport no. X12345",
        "national ID 4521 is mine",
        "I live at 12 Baker Street, Dubai",
        "flat 7, 21 Palm Tree Road",
    ],
)
def test_tc_27_2_identifiers_are_blocked_and_nothing_is_sent(
    chat: Api, fake: FakeAdapter, text: str
) -> None:
    patient = assessing(chat)
    body = interpret(patient, text).json()
    assert body["outcome"] == "NEEDS_CORRECTION"
    assert body["reason_code"] == "TEXT_CONTAINS_IDENTIFIER"
    assert fake.calls == []
    (entry,) = details(chat, patient.case_id, "INPUT_CHECKED")
    assert entry["reason_code"] == "TEXT_CONTAINS_IDENTIFIER"
    assert text not in json.dumps(entry)


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("tested 12.03.1990", None),  # a full date is redacted, not blocked as a number
        ("on 2024-01-15", None),
        ("call 050-123-4567", "TEXT_CONTAINS_CONTACT_DETAILS"),
        ("0501234567", "TEXT_CONTAINS_CONTACT_DETAILS"),
    ],
)
def test_tc_27_2_dates_are_not_mistaken_for_phone_numbers(text: str, reason: str | None) -> None:
    found = check(decode(text))
    assert (found.value if found else None) == reason


# AC-27.3 -------------------------------------------------------------------------------------

REDACTED = [
    ("my name is John Smith and I quit years ago", "my name is [NAME] and I quit years ago"),
    ("call me Omar, I used to smoke", "call me [NAME], I used to smoke"),
    ("I'm Nguyen Van An, never smoked", "I'm [NAME], never smoked"),
    ("I am Ahmed Al Farsi", "I am [NAME]"),
    ("Dr. Haddad told me I have type 2", "Dr. [NAME] told me I have type 2"),
    ("my name's Ali", "my name's [NAME]"),
    ("born 12/03/1990, no steroids", "born [DATE], no steroids"),
    ("stopped on 3-7-2021", "stopped on [DATE]"),
    ("tested 05.11.2024", "tested [DATE]"),
    ("since 2019-04-01", "since [DATE]"),
]
UNCHANGED = [
    "I'm not sure",
    "I'm Not sure really",
    "quit in 2019",
    "I am 35",
    "twice a week",
    "10 mg a day",
    "I am currently on a cycle",
    "yes",
]


@pytest.mark.parametrize(("text", "expected"), REDACTED)
def test_tc_27_3_names_and_full_dates_are_redacted(text: str, expected: str) -> None:
    assert redact(text).text == expected


@pytest.mark.parametrize("text", UNCHANGED)
def test_tc_27_3_controls_are_unchanged(text: str) -> None:
    result = redact(text)
    assert result.text == text
    assert result.types == ()


# AC-27.4 / AC-27.5 ---------------------------------------------------------------------------


def test_tc_27_4_and_27_5_model_audit_and_response_see_no_redacted_value(
    chat: Api, fake: FakeAdapter
) -> None:
    patient = assessing(chat)
    fake.replies.append(draft(value=True, temporal_status="PAST"))
    body = interpret(patient, "I'm Karim Nasser, stopped them on 12/03/2020").json()

    assert body["outcome"] == "PROPOSAL"
    assert body["redacted_types"] == ["DATE", "NAME"]
    (request,) = fake.calls
    sent = request.user_content
    assert "Karim" not in sent and "Nasser" not in sent and "12/03/2020" not in sent
    assert json.loads(sent)["message"] == "I'm [NAME], stopped them on [DATE]"
    (run,) = details(chat, patient.case_id, "MODEL_TASK_RUN")
    assert run["redactions"] == "DATE.NAME" and run["redaction_count"] == 2
    dumped = json.dumps(body) + json.dumps(run)
    assert "Karim" not in dumped and "12/03/2020" not in dumped


def test_tc_27_5_clean_text_has_no_redaction_fields(chat: Api, fake: FakeAdapter) -> None:
    patient = assessing(chat)
    fake.replies.append(draft(value=False))
    body = interpret(patient, "never used them").json()
    assert body["redacted_types"] == []
    (run,) = details(chat, patient.case_id, "MODEL_TASK_RUN")
    assert "redactions" not in run and "redaction_count" not in run


# AC-27.7 -------------------------------------------------------------------------------------


def _pii_case(case_id: str, text: str, pii: list[str], expected: dict) -> dict:
    return {
        "case_id": case_id,
        "task_id": "intake.extract.v1",
        "tags": ["pii"],
        "input": {"question_id": "Q-SMOKING", "text": text},
        "pii": pii,
        "expected": expected,
        "replay": {
            "status": "PROPOSED",
            "choice": "ANSWERED",
            "value": False,
            "temporal_status": None,
            "abstain_reason": None,
        },
    }


def test_tc_27_6_runner_counts_pii_leaks(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    no = {"outcome": "PROPOSAL", "choice": "ANSWERED", "value": False, "temporal_status": None}
    blocked = {"outcome": "NEEDS_CORRECTION", "reasons": ["TEXT_CONTAINS_IDENTIFIER"]}
    cases = [
        _pii_case("PII-1", "my name is Sami Odeh and I never smoked", ["Sami", "Odeh"], no),
        _pii_case("PII-2", "my MRN is 445566, never smoked", ["445566"], blocked),
    ]
    card = ev.evaluate(ev.ReplayAdapter(), paths=write_cases(tmp_path, cases), replay=True)
    task = card["tasks"]["intake.extract.v1"]
    assert task["pii_leaks"] == 0 and task["accuracy"] == 1.0 and task["passed"]

    # A builder that forgot to redact must fail the scorecard.
    monkeypatch.setattr(ev.intake_extract, "redact", lambda text: ev.Redaction(text, ()))
    card = ev.evaluate(ev.ReplayAdapter(), paths=write_cases(tmp_path, cases[:1]), replay=True)
    task = card["tasks"]["intake.extract.v1"]
    assert task["pii_leaks"] == 2 and task["pii_leak_case_ids"] == ["PII-1"]
    assert not task["passed"] and not card["passed"]
