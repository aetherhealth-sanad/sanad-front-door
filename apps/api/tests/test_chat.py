"""RF-21 chat intake with the bounded model adapter (T4.5).

A fake adapter stands in for the model, so these tests make no network call and need no key
(AC-01.3). Passing them shows the software keeps its order of checks on synthetic input. It says
nothing about how well any real model matches answers, and nothing about clinical safety.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from sanad_api.audit.models import AuditEvent
from sanad_api.config import Settings
from sanad_api.db import Base
from sanad_api.facts.models import Fact
from sanad_api.main import create_app
from sanad_api.model_adapter.port import ModelRequest, ModelResult, ModelStatus
from tests.helpers import Api, ManualClock, Patient

DISCLOSURE_VERSION = "MODEL-DISCLOSURE-0.1"
MARKER = "zqmarker"  # an unusual word to search storage and logs for


class FakeAdapter:
    provider = "fake"
    model_id = "fake-model-1"
    label = "Fake model (tests)"

    def __init__(self) -> None:
        self.replies: list[ModelResult | Exception] = []
        self.calls: list[ModelRequest] = []

    @property
    def enabled(self) -> bool:
        return True

    def complete_json(self, request: ModelRequest) -> ModelResult:
        self.calls.append(request)
        if not self.replies:
            raise AssertionError("unexpected model call")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def draft(**fields: Any) -> ModelResult:
    body = {
        "status": "PROPOSED",
        "choice": "ANSWERED",
        "value": None,
        "temporal_status": None,
        "abstain_reason": None,
        **fields,
    }
    return ModelResult(ModelStatus.OK, json.dumps(body), attempts=1, elapsed_ms=4)


def raw(content: str) -> ModelResult:
    return ModelResult(ModelStatus.OK, content, attempts=1, elapsed_ms=4)


@pytest.fixture
def fake() -> FakeAdapter:
    return FakeAdapter()


@pytest.fixture
def chat(settings: Settings, clock: ManualClock, fake: FakeAdapter) -> Iterator[Api]:
    app = create_app(settings, clock, model_adapter=fake)
    with TestClient(app) as client:
        yield Api(client, app, clock)


def assessing(api: Api) -> Patient:
    patient = api.start("BLANK")
    assert patient.consent(assessment=True).status_code == 200
    assert patient.safety().json()["state"]["state"] == "ASSESSING"
    return patient


def interpret(
    patient: Patient,
    text: str,
    question_id: str = "Q-STEROID-USE",
    disclosure: str | None = DISCLOSURE_VERSION,
) -> Response:
    return patient.post(
        patient.path("/chat/interpret"),
        {"question_id": question_id, "text": text, "disclosure_version": disclosure},
    )


def details(api: Api, case_id: str, event_type: str) -> list[dict[str, Any]]:
    return [
        json.loads(event.details_json)
        for event in api.audit(case_id)
        if event.event_type == event_type
    ]


def fact_rows(api: Api, case_id: str, concept_code: str) -> list[Fact]:
    with api.db() as db:
        return db.query(Fact).filter_by(case_id=case_id, concept_code=concept_code).all()


# AC-21.1 -------------------------------------------------------------------------------------

EMERGENCY_TEXTS = [
    ("I have sudden severe pain in my testicles", "DRAFT-EMERG-TEXT-01"),
    ("there's a fever and my scrotum is swollen", "DRAFT-EMERG-TEXT-02"),
    ("I got kicked in the balls an hour ago", "DRAFT-EMERG-TEXT-03"),
    # Negation is ignored on purpose: a false alarm beats a missed one (CC-012).
    ("no, I don't have sudden testicle pain", "DRAFT-EMERG-TEXT-01"),
]


@pytest.mark.parametrize(("text", "rule_id"), EMERGENCY_TEXTS)
def test_tc_21_1_emergency_text_reaches_guidance_with_no_model_call(
    chat: Api, fake: FakeAdapter, text: str, rule_id: str
) -> None:
    patient = assessing(chat)
    response = interpret(patient, text)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["outcome"] == "EMERGENCY_GUIDANCE"
    assert body["state"]["state"] == "EMERGENCY_GUIDANCE_ISSUED"
    assert body["state"]["route"] == "/urgent.html"
    assert body["emergency"]["rule_ids"] == [rule_id]
    assert body["emergency"]["approval_status"] == "CLINICAL_TBD"
    assert body["emergency"]["is_simulated"] is True
    assert fake.calls == []
    safety = details(chat, patient.case_id, "SAFETY_CHECKED")[-1]
    assert safety == {
        "catalogue_version": "emergency-text-draft-0.1",
        "origin": "CHAT_TEXT",
        "result": "EMERGENCY_GUIDANCE_ISSUED",
        "rule_ids": [rule_id],
    }


def test_tc_21_1_emergency_text_works_with_no_model_configured(api: Api) -> None:
    """PRD-AC-50: the provider is off, and guidance still opens."""
    patient = assessing(api)
    body = interpret(patient, "sudden severe testicle pain", disclosure=None).json()
    assert body["outcome"] == "EMERGENCY_GUIDANCE"
    assert patient.state()["state"] == "EMERGENCY_GUIDANCE_ISSUED"


# AC-21.2 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "question_id", "disclosure"),
    [
        ("call 0501234567, sudden severe testicle pain", "Q-STEROID-USE", DISCLOSURE_VERSION),
        ("ألم sudden severe pain in my testicles", "Q-STEROID-USE", DISCLOSURE_VERSION),
        ("sudden severe pain in my testicles", "SAFETY-01", DISCLOSURE_VERSION),
        ("sudden severe pain in my testicles", "Q-UNKNOWN", DISCLOSURE_VERSION),
        ("sudden severe pain in my testicles", "Q-STEROID-USE", None),
    ],
)
def test_tc_21_2_emergency_check_runs_before_every_rejection(
    chat: Api, fake: FakeAdapter, text: str, question_id: str, disclosure: str | None
) -> None:
    patient = assessing(chat)
    body = interpret(patient, text, question_id, disclosure).json()
    assert body["outcome"] == "EMERGENCY_GUIDANCE"
    assert fake.calls == []


# AC-21.3 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "reason_code"),
    [
        ("  !!! ", "TEXT_EMPTY"),
        ("أنا لا أعرف", "TEXT_LANGUAGE_NOT_SUPPORTED"),
        ("email me at someone@example.org", "TEXT_CONTAINS_CONTACT_DETAILS"),
        ("my number is +971 50 123 4567", "TEXT_CONTAINS_CONTACT_DETAILS"),
    ],
)
def test_tc_21_3_input_checks_reject_and_send_nothing(
    chat: Api, fake: FakeAdapter, text: str, reason_code: str
) -> None:
    patient = assessing(chat)
    version = patient.state()["case_version"]
    body = interpret(patient, text).json()
    assert body["outcome"] == "NEEDS_CORRECTION"
    assert body["reason_code"] == reason_code
    assert body["state"]["state"] == "ASSESSING" and body["state"]["case_version"] == version
    assert fake.calls == []
    assert details(chat, patient.case_id, "INPUT_CHECKED") == [
        {
            "origin": "CHAT_TEXT",
            "question_id": "Q-STEROID-USE",
            "reason_code": reason_code,
            "result": "NEEDS_CORRECTION",
        }
    ]


# AC-21.4 -------------------------------------------------------------------------------------


def test_tc_21_4_a_proposal_saves_nothing_until_the_user_confirms(
    chat: Api, fake: FakeAdapter, settings: Settings
) -> None:
    patient = assessing(chat)
    version = patient.state()["case_version"]
    fake.replies.append(draft(value=True, temporal_status="PAST"))
    body = interpret(patient, "I used them years ago and stopped").json()

    assert body["outcome"] == "PROPOSAL"
    assert body["proposal"] == {
        "question_id": "Q-STEROID-USE",
        "choice": "ANSWERED",
        "value": True,
        "temporal_status": "PAST",
        "echo_label": "Yes, in the past",  # the catalogue label, not model text
    }
    assert body["produced_by"] == {
        "provider": "fake",
        "model_id": "fake-model-1",
        "label": "Fake model (tests)",
        "is_ai_generated": True,
        "verification_status": "UNVERIFIED",
        "needs_user_confirmation": True,
    }
    assert body["state"]["case_version"] == version
    assert fact_rows(chat, patient.case_id, "anabolic_steroid_use") == []

    request = fake.calls[0]
    assert request.envelope.task_id == "intake.extract.v1"
    assert request.envelope.purpose == "EXTRACTION_DRAFT_ONLY"
    assert request.envelope.max_attempts == settings.model_max_attempts
    assert request.envelope.timeout_ms == settings.model_timeout_ms
    sent = json.loads(request.user_content)
    assert sent["question"]["text"] == "Have you ever used anabolic steroids?"
    assert sent["message"] == "I used them years ago and stopped"
    schema = request.json_schema
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])

    proposal = body["proposal"]
    confirmed = patient.answers(
        {key: proposal[key] for key in ("question_id", "choice", "value", "temporal_status")}
    )
    assert confirmed.status_code == 200, confirmed.text
    [row] = fact_rows(chat, patient.case_id, "anabolic_steroid_use")
    assert row.source_type == "PATIENT_REPORTED" and row.temporal_status == "PAST"


# AC-21.5 -------------------------------------------------------------------------------------

STEROID, BMI, AGE, TRAINING = "Q-STEROID-USE", "Q-BMI", "Q-AGE", "Q-TRAINING-CONTEXT"


@pytest.mark.parametrize(
    ("question_id", "reply"),
    [
        (STEROID, raw("not json")),
        (STEROID, draft(value=True)),  # yes without current or past
        (STEROID, draft(value=False, temporal_status="PAST")),
        (STEROID, draft(value="yes")),
        (STEROID, draft(value=1)),  # 1 is not True
        (STEROID, draft(value=True, temporal_status="SOMETIMES")),
        (STEROID, draft(choice="NOT_SURE", value=False)),  # an opt-out never carries a value
        (STEROID, draft(choice=None)),
        (STEROID, draft(value=True, temporal_status="PAST", abstain_reason="UNCLEAR")),
        (STEROID, draft(value=True, temporal_status="PAST", invented_field="x")),
        (STEROID, raw('{"status": "PROPOSED", "choice": "ANSWERED"}')),
        (BMI, draft(value=500)),
        (BMI, draft(value=None)),
        (AGE, draft(value=24.5)),
        (TRAINING, draft(value="DAILY")),
    ],
)
def test_tc_21_5_output_outside_the_contract_falls_back(
    chat: Api, fake: FakeAdapter, question_id: str, reply: ModelResult
) -> None:
    patient = assessing(chat)
    fake.replies.append(reply)
    body = interpret(patient, "some answer", question_id).json()
    assert body["outcome"] == "FALLBACK"
    assert body["reason_code"] == "MODEL_OUTPUT_INVALID"
    assert body["proposal"] is None


@pytest.mark.parametrize(
    ("question_id", "reply", "choice", "value", "echo"),
    [
        (STEROID, draft(choice="NOT_SURE"), "NOT_SURE", None, "Not sure"),
        (STEROID, draft(choice="PREFER_NOT_TO_ANSWER"), "PREFER_NOT_TO_ANSWER", None,
         "Prefer not to answer"),
        (STEROID, draft(value=False), "ANSWERED", False, "No"),
        (AGE, draft(value=24.0), "ANSWERED", 24, "24 years"),
        (BMI, draft(value=31.5), "ANSWERED", 31.5, "31.5 kg/m2"),
        (TRAINING, draft(value="OCCASIONAL"), "ANSWERED", "OCCASIONAL", "Sometimes"),
    ],
)
def test_tc_21_5_valid_matches_keep_their_meaning(
    chat: Api,
    fake: FakeAdapter,
    question_id: str,
    reply: ModelResult,
    choice: str,
    value: Any,
    echo: str,
) -> None:
    """INV-05: not sure and prefer not to answer are never turned into No."""
    patient = assessing(chat)
    fake.replies.append(reply)
    proposal = interpret(patient, "some answer", question_id).json()["proposal"]
    assert proposal["choice"] == choice
    assert proposal["value"] == value and type(proposal["value"]) is type(value)
    assert proposal["echo_label"] == echo


@pytest.mark.parametrize("reason", ["OUT_OF_SCOPE", "UNCLEAR"])
def test_tc_21_5_abstention_falls_back(chat: Api, fake: FakeAdapter, reason: str) -> None:
    patient = assessing(chat)
    fake.replies.append(draft(status="ABSTAIN", choice=None, abstain_reason=reason))
    body = interpret(patient, "what is the weather").json()
    assert body["outcome"] == "FALLBACK" and body["reason_code"] == f"ABSTAIN_{reason}"


# AC-21.6 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("reply", "reason_code", "status"),
    [
        (ModelResult(ModelStatus.TIMEOUT, None, 2, 12_000, "TIMEOUT"), "MODEL_UNAVAILABLE",
         "TIMEOUT"),
        (ModelResult(ModelStatus.UNAVAILABLE, None, 2, 30, "HTTP_503"), "MODEL_UNAVAILABLE",
         "UNAVAILABLE"),
        (ModelResult(ModelStatus.CONTENT_FILTERED, None, 1, 30, "FILTERED"),
         "MODEL_CONTENT_FILTERED", "CONTENT_FILTERED"),
        (ModelResult(ModelStatus.REFUSED, None, 1, 30, "REFUSAL"), "MODEL_REFUSED", "REFUSED"),
        (RuntimeError("adapter bug"), "MODEL_UNAVAILABLE", "UNAVAILABLE"),
    ],
)
def test_tc_21_6_provider_failures_fall_back_to_the_buttons(
    chat: Api, fake: FakeAdapter, reply: ModelResult | Exception, reason_code: str, status: str
) -> None:
    patient = assessing(chat)
    fake.replies.append(reply)
    body = interpret(patient, "I used to, a while back").json()
    assert body["outcome"] == "FALLBACK" and body["reason_code"] == reason_code
    assert body["message"] == (
        "I couldn't match that to an answer. Please choose one with the buttons."
    )
    trace = details(chat, patient.case_id, "MODEL_TASK_RUN")[-1]
    assert trace["status"] == status and trace["outcome"] == reason_code
    # The structured path is unaffected.
    answered = patient.answers({"question_id": STEROID, "choice": "NOT_SURE"})
    assert answered.status_code == 200


def test_tc_21_6_no_model_configured_falls_back_without_a_trace(api: Api) -> None:
    patient = assessing(api)
    body = interpret(patient, "I used them in the past", disclosure=None).json()
    assert body["outcome"] == "FALLBACK" and body["reason_code"] == "MODEL_DISABLED"
    assert details(api, patient.case_id, "MODEL_TASK_RUN") == []


def test_tc_21_6_trace_records_versions_and_counts(chat: Api, fake: FakeAdapter) -> None:
    """NFR-21: every model call leaves a code-only trace."""
    patient = assessing(chat)
    fake.replies.append(draft(value=False))
    interpret(patient, "never")
    [trace] = details(chat, patient.case_id, "MODEL_TASK_RUN")
    assert trace.pop("request_id").startswith("req-")
    assert trace == {
        "attempts": 1,
        "elapsed_ms": 4,
        "error_code": None,
        "input_tokens": None,  # the fake reports no usage (AC-23.8)
        "model_id": "fake-model-1",
        "output_tokens": None,
        "outcome": "PROPOSAL",
        "prompt_version": "intake-extract-prompt-0.1",
        "provider": "fake",
        "question_catalogue_version": "questions-draft-0.1",
        "question_id": "Q-STEROID-USE",
        "schema_version": "intake-answer-draft-0.1",
        "status": "OK",
        "task_id": "intake.extract.v1",
    }


# AC-21.7 -------------------------------------------------------------------------------------


def test_tc_21_7_the_server_guards_every_call(chat: Api, fake: FakeAdapter) -> None:
    patient = assessing(chat)
    other = assessing(chat)
    body = {"question_id": STEROID, "text": "never", "disclosure_version": DISCLOSURE_VERSION}

    no_token = chat.anonymous().post(patient.path("/chat/interpret"), body)
    assert no_token.status_code == 401
    wrong_case = Patient(chat.client, other.token, patient.case_id)
    assert interpret(wrong_case, "never").status_code == 404

    consented = chat.start("BLANK")
    consented.consent(assessment=True)
    early = interpret(consented, "never")
    assert early.status_code == 409 and early.json()["error"]["code"] == "INVALID_TRANSITION"

    assert other.consent(assessment=False).status_code == 200
    revoked = interpret(other, "never")
    assert revoked.status_code == 403 and revoked.json()["error"]["code"] == "CONSENT_REQUIRED"

    interpret(patient, "sudden severe testicle pain")  # now EMERGENCY_GUIDANCE_ISSUED
    after = interpret(patient, "never")
    assert after.status_code == 409
    assert fake.calls == []


# AC-21.8 -------------------------------------------------------------------------------------


def test_tc_21_8_only_intake_questions_reach_a_model(chat: Api, fake: FakeAdapter) -> None:
    patient = assessing(chat)
    safety = interpret(patient, "no", "SAFETY-01")
    assert safety.status_code == 422
    assert safety.json()["error"]["details"] == ["UNKNOWN_QUESTION"]
    missing = interpret(patient, "no", STEROID, disclosure=None)
    assert missing.status_code == 422
    assert missing.json()["error"]["details"] == ["DISCLOSURE_NOT_ACKNOWLEDGED"]
    stale = interpret(patient, "no", STEROID, disclosure="MODEL-DISCLOSURE-0.0")
    assert stale.status_code == 422
    too_long = interpret(patient, "x" * 501)
    assert too_long.status_code == 422
    assert fake.calls == []


# AC-21.9 -------------------------------------------------------------------------------------


def test_tc_21_9_typed_text_is_not_stored_logged_or_sent_with_identifiers(
    chat: Api, fake: FakeAdapter, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    patient = assessing(chat)
    fake.replies += [draft(value=False), ModelResult(ModelStatus.UNAVAILABLE, None, 2, 9, "X")]
    texts = [
        f"no never {MARKER}",
        f"{MARKER} again",
        f"{MARKER} write to me at someone@example.org",
    ]
    for text in texts:
        response = interpret(patient, text)
        assert response.status_code == 200
        assert MARKER not in json.dumps(response.json())

    for request in fake.calls:
        assert patient.case_id not in request.user_content
        assert patient.token is not None and patient.token not in request.user_content
        assert patient.case_id not in json.dumps(request.envelope.__dict__)

    with chat.db() as db:
        for table in Base.metadata.sorted_tables:
            for row in db.execute(table.select()).all():
                assert MARKER not in str(tuple(row)), table.name
        assert all(MARKER not in event.details_json for event in db.query(AuditEvent))
    assert MARKER not in caplog.text


# AC-21.10 ------------------------------------------------------------------------------------


def test_tc_21_10_assistant_is_scripted_with_typing_off_by_default(api: Api) -> None:
    body = api.client.get("/api/chat/assistant").json()
    assert body["assistant_label"] == "Sanad assistant"
    assert body["assistant_note"] == "Scripted questions from a draft catalogue"
    assert body["typing_enabled"] is False
    assert body["model"] is None and body["disclosure"] is None
    assert "AI" not in body["assistant_label"]


def test_tc_21_10_assistant_names_the_provider_when_typing_is_on(chat: Api) -> None:
    body = chat.client.get("/api/chat/assistant").json()
    assert body["typing_enabled"] is True
    assert body["model"] == {
        "provider": "fake",
        "label": "Fake model (tests)",
        "match_label": "Matched by AI, not verified",
    }
    assert body["disclosure_version"] == DISCLOSURE_VERSION
    assert "Fake model (tests)" in body["disclosure"]
    assert "Do not type names, contact details or real health information" in body["disclosure"]
