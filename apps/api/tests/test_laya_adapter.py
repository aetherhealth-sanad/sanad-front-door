"""RF-25 local decision-model provider (T4.9).

A stub replaces the `laya` package, so CI downloads no weights and needs no GPU. These tests check
the label mapping, the abstain rules, the deadline and the import boundary. They say nothing about
how well the real model matches answers; that is the RF-23 scorecard's job.
"""

from __future__ import annotations

import ast
import json
import sys
import time
import types
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from sanad_api.catalogues import Catalogues
from sanad_api.config import Settings
from sanad_api.main import create_app
from sanad_api.model_adapter import intake_extract
from sanad_api.model_adapter.factory import ModelConfigError, build_model_adapter
from sanad_api.model_adapter.laya_local import LayaLocalAdapter
from sanad_api.model_adapter.port import ModelStatus
from tests.helpers import Api, ManualClock

REVISION = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"
SANAD_API = Path(__file__).resolve().parents[1] / "sanad_api"


class StubAgent:
    """Answers like `laya.Agent.predict`: one dict per question id under `answers`."""

    def __init__(self) -> None:
        self.answer: dict[str, Any] = {}
        self.calls: list[tuple[Any, dict[str, Any]]] = []
        self.sleep = 0.0
        self.error: Exception | None = None

    def predict(self, state: Any, questions: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((state, questions))
        if self.sleep:
            time.sleep(self.sleep)
        if self.error:
            raise self.error
        return {"answers": {"answer": self.answer}}


def choice(label: str, prob: float = 0.95, **extra: Any) -> dict[str, Any]:
    return {"type": "choice", "choice": label, "probabilities": {label: prob}, **extra}


@pytest.fixture
def agent() -> StubAgent:
    return StubAgent()


@pytest.fixture
def adapter(agent: StubAgent) -> LayaLocalAdapter:
    return LayaLocalAdapter(agent, "convaiinnovations/laya", REVISION, min_prob=0.80)


def request(catalogues: Catalogues, question_id: str, text: str, timeout_ms: int = 5_000) -> Any:
    question = catalogues.intake_question(question_id)
    assert question is not None
    settings = Settings(model_timeout_ms=timeout_ms)
    return intake_extract.build_request(
        question,
        catalogues.concepts[question.concept_code],
        text,
        request_id="req-test",
        catalogue_version=catalogues.questions.catalogue_version,
        settings=settings,
    )


def draft(adapter: LayaLocalAdapter, catalogues: Catalogues, qid: str, text: str) -> Any:
    result = adapter.complete_json(request(catalogues, qid, text))
    assert result.status is ModelStatus.OK, result
    return json.loads(result.content or "")


def laya_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "repo_root": tmp_path,
        "model_provider": "laya_local",
        "laya_revision": REVISION,
    }
    values.update(overrides)
    return Settings(**values)


# AC-25.1 -------------------------------------------------------------------------------------


def test_tc_25_1_bad_configuration_stops_start_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setitem(sys.modules, "laya", None)  # import fails: extra not installed
    with pytest.raises(ModelConfigError, match=r"apps/api\[decision\]"):
        build_model_adapter(laya_settings(tmp_path))
    stub = types.ModuleType("laya")
    stub.load = lambda *a, **k: StubAgent()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "laya", stub)
    with pytest.raises(ModelConfigError, match="SANAD_LAYA_REVISION"):
        build_model_adapter(laya_settings(tmp_path, laya_revision=None))
    with pytest.raises(ModelConfigError, match="SANAD_LAYA_BACKEND"):
        build_model_adapter(laya_settings(tmp_path, laya_backend="cuda-magic"))
    with pytest.raises(ModelConfigError, match="SANAD_DECISION_MIN_PROB"):
        build_model_adapter(laya_settings(tmp_path, decision_min_prob=0.3))


# AC-25.2 -------------------------------------------------------------------------------------


def test_tc_25_2_torch_backend_loads_once_with_the_pinned_revision(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    loads: list[tuple[Any, dict[str, Any]]] = []
    stub = types.ModuleType("laya")

    def load(*args: Any, **kwargs: Any) -> StubAgent:
        loads.append((args, kwargs))
        return StubAgent()

    stub.load = load  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "laya", stub)
    monkeypatch.setitem(sys.modules, "laya_mlx", None)
    adapter = build_model_adapter(laya_settings(tmp_path))
    assert isinstance(adapter, LayaLocalAdapter)
    assert loads == [(("convaiinnovations/laya",), {"revision": REVISION, "device": None})]
    assert adapter.provider == "laya_local"
    assert adapter.model_id == f"convaiinnovations:laya:{REVISION[:12]}"
    assert adapter.label == "Laya (local model on this server)"


# AC-25.3 -------------------------------------------------------------------------------------


@pytest.mark.parametrize("question_id", ["Q-AGE", "Q-BMI"])
def test_tc_25_3_number_questions_are_unsupported(
    adapter: LayaLocalAdapter, agent: StubAgent, catalogues: Catalogues, question_id: str
) -> None:
    result = adapter.complete_json(request(catalogues, question_id, "I am 34"))
    assert result.status is ModelStatus.UNAVAILABLE
    assert result.error_code == "UNSUPPORTED_TASK"
    assert agent.calls == []


# AC-25.4 -------------------------------------------------------------------------------------


def test_tc_25_4_labels_come_from_the_catalogue_and_text_goes_alone(
    adapter: LayaLocalAdapter, agent: StubAgent, catalogues: Catalogues
) -> None:
    agent.answer = choice("NOT_AN_ANSWER")
    adapter.complete_json(request(catalogues, "Q-STEROID-USE", "used them, stopped"))
    ((state, questions),) = agent.calls
    assert state == "used them, stopped"
    (q,) = questions.values()
    assert q["type"] == "choice"
    assert list(q["criteria"]) == [
        "YES_CURRENT",
        "YES_PAST",
        "YES_TIME_UNCLEAR",
        "NO",
        "NOT_SURE",
        "PREFER_NOT_TO_ANSWER",
        "NOT_AN_ANSWER",
    ]
    question = catalogues.intake_question("Q-STEROID-USE")
    assert question is not None and question.text in q["instructions"]
    assert "req-test" not in json.dumps(questions)


def test_tc_25_4_choice_question_uses_option_values(
    adapter: LayaLocalAdapter, agent: StubAgent, catalogues: Catalogues
) -> None:
    agent.answer = choice("REGULAR")
    body = draft(adapter, catalogues, "Q-TRAINING-CONTEXT", "I lift four times a week")
    ((_, questions),) = agent.calls
    (q,) = questions.values()
    assert list(q["criteria"])[:3] == ["REGULAR", "OCCASIONAL", "NONE"]
    assert body == {
        "status": "PROPOSED",
        "choice": "ANSWERED",
        "value": "REGULAR",
        "temporal_status": None,
        "abstain_reason": None,
    }


# AC-25.5 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("answer", "reason"),
    [
        (choice("NO", abstain=True), "UNCLEAR"),
        (choice("NO", unbound=True), "UNCLEAR"),
        (choice("NO", route="review"), "UNCLEAR"),
        (choice("NO", prob=0.6), "UNCLEAR"),
        (choice("NO", prediction_set=["NO", "NOT_SURE"]), "UNCLEAR"),
        (choice("YES_TIME_UNCLEAR"), "UNCLEAR"),
        (choice("NOT_AN_ANSWER"), "OUT_OF_SCOPE"),
    ],
)
def test_tc_25_5_abstain_rules(
    adapter: LayaLocalAdapter,
    agent: StubAgent,
    catalogues: Catalogues,
    answer: dict[str, Any],
    reason: str,
) -> None:
    agent.answer = answer
    body = draft(adapter, catalogues, "Q-STEROID-USE", "hmm")
    assert body == {
        "status": "ABSTAIN",
        "choice": None,
        "value": None,
        "temporal_status": None,
        "abstain_reason": reason,
    }


# AC-25.6 -------------------------------------------------------------------------------------


@pytest.fixture
def laya_api(settings: Settings, clock: ManualClock, adapter: LayaLocalAdapter) -> Iterator[Api]:
    app = create_app(settings, clock, model_adapter=adapter)
    with TestClient(app) as client:
        yield Api(client, app, clock)


def interpret(api: Api, text: str) -> dict[str, Any]:
    patient = api.assessing("CN-001")
    disclosure = api.client.get("/api/chat/assistant").json()
    response = patient.post(
        patient.path("/chat/interpret"),
        {
            "question_id": "Q-STEROID-USE",
            "text": text,
            "disclosure_version": disclosure["disclosure_version"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_tc_25_6_not_sure_stays_not_sure_and_past_stays_past(
    laya_api: Api, agent: StubAgent
) -> None:
    agent.answer = choice("NOT_SURE", prob=0.95)
    body = interpret(laya_api, "no idea really")
    assert body["outcome"] == "PROPOSAL"
    assert body["proposal"]["choice"] == "NOT_SURE"
    assert body["proposal"]["value"] is None

    agent.answer = choice("YES_PAST")
    body = interpret(laya_api, "years ago, stopped")
    assert body["proposal"]["value"] is True
    assert body["proposal"]["temporal_status"] == "PAST"
    assert body["produced_by"]["provider"] == "laya_local"


def test_tc_25_6_assistant_discloses_a_local_model(laya_api: Api) -> None:
    body = laya_api.client.get("/api/chat/assistant").json()
    assert body["model"]["label"] == "Laya (local model on this server)"
    assert "Azure" not in body["disclosure"]
    assert "this server" in body["disclosure"]


# AC-25.7 -------------------------------------------------------------------------------------


def test_tc_25_7_deadline_and_errors_fall_back(
    adapter: LayaLocalAdapter, agent: StubAgent, catalogues: Catalogues
) -> None:
    agent.answer = choice("NO")
    agent.sleep = 1.5
    result = adapter.complete_json(request(catalogues, "Q-SMOKING", "no", timeout_ms=1_000))
    assert result.status is ModelStatus.TIMEOUT
    agent.sleep = 0
    agent.error = RuntimeError("boom")
    result = adapter.complete_json(request(catalogues, "Q-SMOKING", "no"))
    assert result.status is ModelStatus.UNAVAILABLE
    assert result.error_code == "LOCAL_MODEL_ERROR"


# AC-25.10 ------------------------------------------------------------------------------------

PROTECTED = [
    "rules_engine/emergency.py",
    "rules_engine/emergency_text.py",
    "rules_engine/triage.py",
    "referral/gate.py",
    "review/routes.py",
    "reports/routes.py",
    "model_adapter/report_explain.py",
]


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
            names.update(f"{node.module}.{alias.name}" for alias in node.names)
    return names


def test_tc_25_8_protected_modules_never_import_the_decision_model(settings: Settings) -> None:
    for rel in PROTECTED:
        path = SANAD_API / rel
        if not path.exists():
            continue
        imported = _imports(path)
        assert not any("laya" in name for name in imported), rel
    sys.modules.pop("laya", None)
    create_app(settings, ManualClock())
    assert "laya" not in sys.modules
