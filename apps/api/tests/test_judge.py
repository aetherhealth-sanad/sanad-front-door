"""RF-23 AC-23.15 offline LLM-as-judge for explanations (T4.16).

A stub judge stands in for the model, so CI needs no key. These tests check the calibration gate
and that every score carries a reason. A judge score is never evidence of clinical validity.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from types import ModuleType
from typing import Any

import pytest

from tests.conftest import REPO_ROOT

SCRIPT = REPO_ROOT / "eval" / "judge_explanations.py"
CALIBRATION = REPO_ROOT / "eval" / "judge" / "explanations_calibration.v0.1.jsonl"


def load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("judge_explanations", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["judge_explanations"] = module
    spec.loader.exec_module(module)
    return module


jx = load()


def items() -> list[dict[str, Any]]:
    return [json.loads(line) for line in CALIBRATION.read_text("utf-8").splitlines() if line]


def oracle(item: dict[str, Any]) -> dict[str, Any]:
    """Agrees with the label: what a well-calibrated judge would say."""
    ok = item["label"] == "PASS"
    return {"reason": "stub", "grounded": ok, "on_step": True, "safe_wording": True, "plain": True}


def test_tc_23_15_calibration_set_is_labelled_and_synthetic() -> None:
    rows = items()
    assert len(rows) >= 8
    assert {r["label"] for r in rows} == {"PASS", "FAIL"}
    for row in rows:
        assert row["why"], row["item_id"]
        assert all(p["excerpt"].startswith("SYNTHETIC EVAL TEXT") for p in row["passages"])


def test_tc_23_15_gate_blocks_a_judge_that_disagrees_with_the_labels() -> None:
    always_pass = lambda item: {  # noqa: E731
        "reason": "stub", "grounded": True, "on_step": True, "safe_wording": True, "plain": True
    }
    with pytest.raises(jx.CalibrationFailed) as failed:
        jx.run(always_pass, items(), targets=[{"item_id": "T-1"}])
    assert failed.value.agreement < 0.80


def test_tc_23_15_calibrated_judge_scores_every_target_with_a_reason() -> None:
    targets = [r for r in items() if r["label"] == "PASS"][:2]
    report = jx.run(oracle, items(), targets=targets)
    assert report["calibration"]["agreement"] == 1.0
    assert report["label"] == "NOT_CLINICALLY_VALIDATED"
    assert len(report["scores"]) == 2
    assert all(s["reason"] and s["verdict"] in {"PASS", "FAIL"} for s in report["scores"])


def test_tc_23_15_verdict_is_pass_only_when_every_criterion_holds() -> None:
    base = {"reason": "r", "grounded": True, "on_step": True, "safe_wording": True, "plain": True}
    assert jx.verdict(base) == "PASS"
    for key in ("grounded", "on_step", "safe_wording", "plain"):
        assert jx.verdict({**base, key: False}) == "FAIL"
