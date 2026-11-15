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
from sanad_api.model_adapter.laya_local import LayaLocalAdapter, labels_for
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
        return {"answers": {key: self.answer for key in questions}}

    def load_calibration(self, path: str, verify: Any = True) -> dict[str, Any]:
        self.calibration = (path, verify)
        return {}


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
    assert list(questions) == ["YN_TIME"]
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


# AC-25.11 / AC-25.12 -------------------------------------------------------------------------


def test_tc_25_10_vegaml_engine_and_calibration_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, catalogues: Catalogues
) -> None:
    loads: list[dict[str, Any]] = []
    built: list[StubAgent] = []
    stub = types.ModuleType("laya")

    def load(*args: Any, **kwargs: Any) -> StubAgent:
        loads.append(kwargs)
        built.append(StubAgent())
        return built[-1]

    stub.load = load  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "laya", stub)
    reader = "nandakishorm/vega-U"
    with pytest.raises(ModelConfigError, match="SANAD_LAYA_ENGINE"):
        build_model_adapter(laya_settings(tmp_path, laya_engine="gpu-magic"))
    with pytest.raises(ModelConfigError, match="SANAD_LAYA_ENGINE=vegaml"):
        build_model_adapter(laya_settings(tmp_path, laya_calibration=tmp_path))
    with pytest.raises(ModelConfigError, match="not a directory"):
        build_model_adapter(
            laya_settings(
                tmp_path, laya_engine="vegaml", laya_calibration=tmp_path / "missing"
            )
        )
    assert loads == []

    adapter = build_model_adapter(
        laya_settings(
            tmp_path, laya_engine="vegaml", laya_model=reader, laya_calibration=tmp_path
        )
    )
    assert loads == [{"vegaml": reader, "revision": REVISION, "device": None}]
    (agent,) = built
    assert agent.calibration == (str(tmp_path), True)

    agent.answer = choice("NO")
    for qid, key in [
        ("Q-STEROID-USE", "YN_TIME"),
        ("Q-DIABETES", "YN"),
        ("Q-TRAINING-CONTEXT", "CHOICE:REGULAR|OCCASIONAL|NONE"),
    ]:
        adapter.complete_json(request(catalogues, qid, "no"))
        assert list(agent.calls[-1][1]) == [key]


def test_tc_25_10_calibration_that_fails_to_verify_stops_start_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Rejecting(StubAgent):
        def load_calibration(self, path: str, verify: Any = True) -> dict[str, Any]:
            raise ValueError("manifest hash mismatch")

    stub = types.ModuleType("laya")
    stub.load = lambda *a, **k: Rejecting()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "laya", stub)
    with pytest.raises(ModelConfigError, match="could not be loaded and verified"):
        build_model_adapter(
            laya_settings(tmp_path, laya_engine="vegaml", laya_calibration=tmp_path)
        )


@pytest.mark.parametrize(
    "answer",
    [choice("NO", prob=0.99, route="review"), choice("NO", prob=0.99, calibrated=False)],
)
def test_tc_25_11_fitted_route_and_uncalibrated_options_abstain(
    adapter: LayaLocalAdapter, agent: StubAgent, catalogues: Catalogues, answer: dict[str, Any]
) -> None:
    agent.answer = answer
    body = draft(adapter, catalogues, "Q-SMOKING", "nope")
    assert body["status"] == "ABSTAIN" and body["abstain_reason"] == "UNCLEAR"


# AC-25.13 ------------------------------------------------------------------------------------

ROWS = Path(__file__).resolve().parents[3] / "eval" / "decision" / "intake_rows.v0.1.jsonl"
EVAL_CASES = Path(__file__).resolve().parents[3] / "eval" / "model" / "intake_extract.v0.1.jsonl"


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


@pytest.mark.skipif(not ROWS.exists(), reason="rows file not written yet")
def test_tc_25_12_rows_file_is_well_formed_and_disjoint_from_eval(
    catalogues: Catalogues,
) -> None:
    eval_texts = {
        _norm(json.loads(line)["input"]["text"])
        for line in EVAL_CASES.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    ids = set()
    for line in ROWS.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        assert set(row) == {"row_id", "question_id", "state", "label", "author"}, row
        assert row["row_id"] not in ids
        ids.add(row["row_id"])
        assert row["author"] in ("TEAM", "MODEL_DRAFTED_TEAM_REVIEWED", "MODEL_DRAFTED_UNREVIEWED")
        payload = json.loads(request(catalogues, row["question_id"], row["state"]).user_content)
        question = payload["question"]
        assert question["answer_type"] in ("yes_no", "choice"), row
        assert row["label"] in labels_for(question), row
        assert _norm(row["state"]) not in eval_texts, row["row_id"]


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
