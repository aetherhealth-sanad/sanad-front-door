"""RF-23 per-case model budget, token counts and run metrics (T4.7).

A fake adapter replaces the model, so no network call is made. These tests check the cap, the
trace fields and the aggregate endpoint on synthetic cases. They say nothing about model quality.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from sanad_api.config import Settings
from sanad_api.main import create_app
from sanad_api.model_adapter.factory import ModelConfigError, build_model_adapter
from sanad_api.model_adapter.port import ModelResult, ModelStatus
from tests.helpers import FACILITY_PASSWORD, REVIEWER_PASSWORD, Api, ManualClock, Patient
from tests.test_citations import GOOD, PASSAGE_ID, FakeAdapter, make_root

DISCLOSURE_VERSION = "MODEL-DISCLOSURE-0.1"
CAP = 2


def proposal(**usage: int) -> ModelResult:
    body = {
        "status": "PROPOSED",
        "choice": "ANSWERED",
        "value": True,
        "temporal_status": "PAST",
        "abstain_reason": None,
    }
    return ModelResult(ModelStatus.OK, json.dumps(body), attempts=1, elapsed_ms=7, **usage)


def build(tmp_path: Path, adapter: Any, cap: int = CAP) -> Iterator[Api]:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        repo_root=make_root(tmp_path),
        commit_sha="test-sha",
        reviewer_password=REVIEWER_PASSWORD,
        mock_facility_password=FACILITY_PASSWORD,
        cases_per_minute_per_ip=10_000,
        logins_per_minute_per_ip=10_000,
        model_max_calls_per_case=cap,
    )
    clock = ManualClock()
    app = create_app(settings, clock, model_adapter=adapter)
    with TestClient(app) as client:
        yield Api(client, app, clock)


@pytest.fixture
def fake() -> FakeAdapter:
    return FakeAdapter()


@pytest.fixture
def api(tmp_path: Path, fake: FakeAdapter) -> Iterator[Api]:
    yield from build(tmp_path, fake)


def interpret(patient: Patient, text: str = "used them years ago, stopped now") -> Any:
    return patient.post(
        patient.path("/chat/interpret"),
        {"question_id": "Q-STEROID-USE", "text": text, "disclosure_version": DISCLOSURE_VERSION},
    )


def release(api: Api, patient: Patient) -> None:
    """Moves a case on from intake to a released report, so both model tasks can run."""
    assert patient.assess().status_code == 200
    assert patient.consent(clinician_review=True).status_code == 200
    assert patient.send_for_review().status_code == 201
    assert api.decide(patient, "APPROVE").status_code == 200


def runs(api: Api, case_id: str) -> list[dict[str, Any]]:
    return [
        json.loads(event.details_json)
        for event in api.audit(case_id)
        if event.event_type == "MODEL_TASK_RUN"
    ]


# AC-23.7 -------------------------------------------------------------------------------------


def test_tc_23_6_cap_stops_chat_and_explanation_without_a_model_call(
    api: Api, fake: FakeAdapter
) -> None:
    patient = api.assessing("CN-001")
    fake.replies = [proposal(), proposal(), GOOD]
    assert interpret(patient).json()["outcome"] == "PROPOSAL"
    assert interpret(patient).json()["outcome"] == "PROPOSAL"
    assert len(fake.calls) == CAP

    chat = interpret(patient)
    assert chat.status_code == 200, chat.text
    assert chat.json()["outcome"] == "FALLBACK"
    assert chat.json()["reason_code"] == "MODEL_BUDGET_EXCEEDED"
    assert interpret(patient).json()["reason_code"] == "MODEL_BUDGET_EXCEEDED"

    release(api, patient)
    explanation = patient.post(patient.path("/report/explanation")).json()
    assert explanation["outcome"] == "FALLBACK"
    assert explanation["reason_code"] == "MODEL_BUDGET_EXCEEDED"
    assert len(fake.calls) == CAP  # no further call reached the adapter

    statuses = [run["status"] for run in runs(api, patient.case_id)]
    assert statuses.count("BUDGET_EXCEEDED") == 3
    assert statuses.count("OK") == CAP


def test_tc_23_7_emergency_text_still_works_past_the_cap(tmp_path: Path, fake: FakeAdapter) -> None:
    for api in build(tmp_path, fake, cap=1):
        patient = api.assessing("CN-001")
        fake.replies = [proposal()]
        interpret(patient)
        assert interpret(patient).json()["reason_code"] == "MODEL_BUDGET_EXCEEDED"
        body = interpret(patient, "I have sudden severe pain in my testicles").json()
        assert body["outcome"] == "EMERGENCY_GUIDANCE"
        assert patient.state()["state"] == "EMERGENCY_GUIDANCE_ISSUED"


@pytest.mark.parametrize("cap", [0, 101])
def test_cap_outside_range_stops_start_up(tmp_path: Path, cap: int) -> None:
    settings = Settings(
        repo_root=tmp_path,
        model_provider="azure_openai",
        azure_openai_endpoint="https://example.openai.azure.com",
        azure_openai_deployment="dep",
        azure_openai_api_key="placeholder",
        model_max_calls_per_case=cap,
    )
    with pytest.raises(ModelConfigError, match="SANAD_MODEL_MAX_CALLS_PER_CASE"):
        build_model_adapter(settings)


# AC-23.8 -------------------------------------------------------------------------------------


def test_tc_23_8_token_counts_are_traced_without_text(api: Api, fake: FakeAdapter) -> None:
    patient = api.assessing("CN-001")
    fake.replies = [proposal(input_tokens=120, output_tokens=18)]
    interpret(patient)
    (run,) = runs(api, patient.case_id)
    assert run["input_tokens"] == 120
    assert run["output_tokens"] == 18
    assert "used them" not in json.dumps(run)


# AC-23.9 -------------------------------------------------------------------------------------


def test_tc_23_9_model_runs_aggregate_for_reviewers_only(api: Api, fake: FakeAdapter) -> None:
    patient = api.assessing("CN-001")
    fake.replies = [proposal(input_tokens=100, output_tokens=10)]
    interpret(patient)
    release(api, patient)
    fake.replies = [GOOD]
    patient.post(patient.path("/report/explanation"))
    patient.post(patient.path("/report/explanation"))  # refused by the budget

    assert api.anonymous().get("/api/evaluation/model-runs").status_code == 401
    assert patient.get("/api/evaluation/model-runs").status_code == 403
    response = api.reviewer().get("/api/evaluation/model-runs")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["synthetic_demo"] is True
    tasks = {task["task_id"]: task for task in body["tasks"]}
    chat = tasks["intake.extract.v1"]
    assert chat["calls"] == 1
    assert chat["by_status"] == {"OK": 1}
    assert chat["by_outcome"] == {"PROPOSAL": 1}
    assert chat["tokens"] == {"input": 100, "output": 10}
    assert chat["latency_ms"] == {"p50": 7, "p95": 7}
    explain = tasks["report.explain.v1"]
    assert explain["by_status"] == {"OK": 1, "BUDGET_EXCEEDED": 1}
    assert explain["by_outcome"] == {"AI_DRAFT": 1}
    assert explain["budget_refusals"] == 1
    text = response.text
    assert patient.case_id not in text
    assert PASSAGE_ID not in text


# AC-23.10 ------------------------------------------------------------------------------------


def test_tc_23_10_default_settings_build_no_client(settings: Settings) -> None:
    assert build_model_adapter(settings).enabled is False
