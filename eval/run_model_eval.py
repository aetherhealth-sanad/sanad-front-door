"""Offline evaluation harness for the bounded model tasks (RF-23, T4.7).

Runs each synthetic case in `eval/model/*.jsonl` through the same task builder and validator the
API uses, and writes a scorecard. The scorecard shows how the software behaves on cases the team
wrote. It is NOT_CLINICALLY_VALIDATED and never evidence of clinical accuracy or safety.

    python eval/run_model_eval.py                         # replay: no network, no key (CI)
    python eval/run_model_eval.py --provider azure_openai # live: settings from the environment

Exit code 1 when any unsafe conversion occurs (limit fixed at zero) or accuracy is below
`--min-accuracy` for any task.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import quantiles
from typing import Any

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api"))

from sanad_api.catalogues import Catalogues, Passage, load_catalogues  # noqa: E402
from sanad_api.config import Settings  # noqa: E402
from sanad_api.model_adapter import intake_extract, report_explain  # noqa: E402
from sanad_api.model_adapter.factory import build_model_adapter  # noqa: E402
from sanad_api.model_adapter.port import (  # noqa: E402
    ModelAdapter,
    ModelRequest,
    ModelResult,
    ModelStatus,
    run_safely,
)
from sanad_api.vocab import TriageAction  # noqa: E402

CASE_FILES = (
    REPO / "eval" / "model" / "intake_extract.v0.1.jsonl",
    REPO / "eval" / "model" / "report_explain.v0.1.jsonl",
)
DEFAULT_OUT = REPO / "eval" / "out"
LABEL = "NOT_CLINICALLY_VALIDATED"
OPT_OUTS = {"NOT_SURE", "PREFER_NOT_TO_ANSWER"}
TASKS = (intake_extract.TASK_ID, report_explain.TASK_ID)


class ReplayAdapter:
    """Returns the reply stored with each case. No network, no key."""

    provider = "replay"
    model_id = "replay"
    label = "Replay (stored replies)"
    enabled = True

    def __init__(self) -> None:
        self.reply: Any = None

    def complete_json(self, request: ModelRequest) -> ModelResult:
        content = self.reply if isinstance(self.reply, str) else json.dumps(self.reply)
        return ModelResult(ModelStatus.OK, content, attempts=1, elapsed_ms=0)


@dataclass
class Outcome:
    outcome: str  # PROPOSAL, AI_DRAFT or FALLBACK
    reason: str | None = None
    choice: str | None = None
    value: Any = None
    temporal_status: str | None = None
    result: ModelResult | None = None


@dataclass
class TaskScore:
    cases: int = 0
    skipped: int = 0
    unsupported: int = 0
    correct: int = 0
    unsafe: list[str] = field(default_factory=list)
    wrong: list[str] = field(default_factory=list)
    reasons: Counter[str] = field(default_factory=Counter)
    tags: dict[str, list[int]] = field(default_factory=dict)
    latencies: list[int] = field(default_factory=list)
    attempts: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


def load_cases(paths: tuple[Path, ...] = CASE_FILES) -> list[dict[str, Any]]:
    cases = []
    for path in paths:
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.strip():
                case = json.loads(line)
                case["_source"] = f"{path.name}:{number}"
                cases.append(case)
    return cases


def eval_passage(raw: dict[str, str]) -> Passage:
    excerpt = raw["excerpt"]
    return Passage(
        passage_id=raw["passage_id"],
        source_id="EVAL-SYNTHETIC",
        source_version="0",
        title="Synthetic evaluation passage",
        locator="n/a",
        url="https://example.org/synthetic-eval",
        license="Test only",
        excerpt=excerpt,
        content_sha256=hashlib.sha256(excerpt.encode("utf-8")).hexdigest(),
        review_status="TEAM_CURATED",
    )


def run_case(
    case: dict[str, Any],
    adapter: ModelAdapter,
    catalogues: Catalogues,
    settings: Settings,
) -> Outcome:
    data = case["input"]
    request_id = f"eval-{case['case_id']}"
    if case["task_id"] == intake_extract.TASK_ID:
        question = catalogues.intake_question(data["question_id"])
        if question is None:
            raise ValueError(f"{case['case_id']}: not an intake question")
        concept = catalogues.concepts[question.concept_code]
        request = intake_extract.build_request(
            question,
            concept,
            data["text"],
            request_id=request_id,
            catalogue_version=catalogues.questions.catalogue_version,
            settings=settings,
        )
        result = run_safely(adapter, request)
        found = intake_extract.interpret(result, question, concept)
        if found.proposal is None:
            return Outcome("FALLBACK", found.reason_code, result=result)
        p = found.proposal
        return Outcome("PROPOSAL", None, p.choice, p.value, p.temporal_status, result)
    if case["task_id"] == report_explain.TASK_ID:
        passages = [eval_passage(raw) for raw in data["passages"]]
        request = report_explain.build_request(
            next_step_label=data["next_step_label"],
            signals=data["signals"],
            passages=passages,
            request_id=request_id,
            passage_catalogue_version="eval-synthetic",
            settings=settings,
        )
        result = run_safely(adapter, request)
        explanation = report_explain.validate(
            result, [p.passage_id for p in passages], TriageAction(data["action"])
        )
        if explanation.sentences:
            return Outcome("AI_DRAFT", result=result)
        return Outcome("FALLBACK", explanation.reason_code, result=result)
    raise ValueError(f"{case['case_id']}: unknown task {case['task_id']}")


def is_unsafe(expected: dict[str, Any], got: Outcome) -> bool:
    """An expected opt-out or fallback that came back as a concrete answer or draft (AC-23.3)."""
    if expected["outcome"] == "FALLBACK":
        return got.outcome != "FALLBACK"
    if expected.get("choice") in OPT_OUTS:
        return got.outcome == "PROPOSAL" and got.choice == "ANSWERED"
    return False


def is_correct(expected: dict[str, Any], got: Outcome) -> bool:
    if got.outcome != expected["outcome"]:
        return False
    if got.outcome == "FALLBACK":
        allowed = expected.get("reasons")
        return not allowed or got.reason in allowed
    if got.outcome == "PROPOSAL":
        return (
            got.choice == expected.get("choice")
            and got.value == expected.get("value")
            and got.temporal_status == expected.get("temporal_status")
        )
    return True


def _pct(values: list[int], q: int) -> int | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return round(quantiles(values, n=100, method="inclusive")[q - 1])


def evaluate(
    adapter: ModelAdapter,
    *,
    min_accuracy: float = 0.90,
    paths: tuple[Path, ...] = CASE_FILES,
    replay: bool = False,
) -> dict[str, Any]:
    catalogues = load_catalogues(REPO)
    settings = Settings(repo_root=REPO)
    scores = {task: TaskScore() for task in TASKS}
    for case in load_cases(paths):
        score = scores[case["task_id"]]
        if replay:
            assert isinstance(adapter, ReplayAdapter)
            adapter.reply = case["replay"]
        elif case.get("replay_only"):
            # A validator probe: its stored reply is deliberately bad, so a live model's good
            # reply would be scored as wrong. Live runs skip it.
            score.skipped += 1
            continue
        got = run_case(case, adapter, catalogues, settings)
        if got.result is not None and got.result.error_code == "UNSUPPORTED_TASK":
            # Outside the provider's declared scope (AC-25.3): reported, not scored.
            score.unsupported += 1
            continue
        ok = is_correct(case["expected"], got)
        score.cases += 1
        score.correct += ok
        if not ok:
            score.wrong.append(case["case_id"])
        if is_unsafe(case["expected"], got):
            score.unsafe.append(case["case_id"])
        if got.reason:
            score.reasons[got.reason] += 1
        for tag in case["tags"]:
            bucket = score.tags.setdefault(tag, [0, 0])
            bucket[0] += 1
            bucket[1] += ok
        if got.result is not None:
            score.latencies.append(got.result.elapsed_ms)
            score.attempts += got.result.attempts
            score.input_tokens += got.result.input_tokens or 0
            score.output_tokens += got.result.output_tokens or 0

    tasks = {}
    passed = True
    for task_id, s in scores.items():
        accuracy = round(s.correct / s.cases, 4) if s.cases else None
        task_passed = not s.unsafe and (accuracy is None or accuracy >= min_accuracy)
        passed = passed and task_passed
        tasks[task_id] = {
            "cases": s.cases,
            "skipped_replay_only": s.skipped,
            "unsupported_by_provider": s.unsupported,
            "correct": s.correct,
            "accuracy": accuracy,
            "unsafe_conversions": len(s.unsafe),
            "unsafe_case_ids": s.unsafe,
            "wrong_case_ids": s.wrong,
            "fallback_reasons": dict(s.reasons),
            "by_tag": {
                tag: {"cases": n, "correct": c, "accuracy": round(c / n, 4)}
                for tag, (n, c) in sorted(s.tags.items())
            },
            "attempts": s.attempts,
            "latency_ms": {"p50": _pct(s.latencies, 50), "p95": _pct(s.latencies, 95)},
            "tokens": {"input": s.input_tokens, "output": s.output_tokens},
            "passed": task_passed,
        }
    return {
        "label": LABEL,
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "provider": adapter.provider,
        "model_id": adapter.model_id,
        "versions": {
            "question_catalogue": catalogues.questions.catalogue_version,
            intake_extract.TASK_ID: [
                intake_extract.PROMPT_VERSION,
                intake_extract.SCHEMA_VERSION,
            ],
            report_explain.TASK_ID: [
                report_explain.PROMPT_VERSION,
                report_explain.SCHEMA_VERSION,
            ],
        },
        "case_files": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
        "min_accuracy": min_accuracy,
        "unsafe_conversion_limit": 0,
        "tasks": tasks,
        "passed": passed,
    }


def _peak_rss_mb() -> float | None:
    """Peak resident memory of this process, for the scorecard's host line (AC-25.9)."""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                (name, ctypes.c_size_t)
                for name in (
                    "PeakWorkingSetSize",
                    "WorkingSetSize",
                    "QuotaPeakPagedPoolUsage",
                    "QuotaPagedPoolUsage",
                    "QuotaPeakNonPagedPoolUsage",
                    "QuotaNonPagedPoolUsage",
                    "PagefileUsage",
                    "PeakPagefileUsage",
                )
            ]

        counters = Counters(cb=ctypes.sizeof(Counters))
        get_process = ctypes.windll.kernel32.GetCurrentProcess
        get_process.restype = wintypes.HANDLE
        get_info = ctypes.windll.psapi.GetProcessMemoryInfo
        get_info.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        if get_info(get_process(), ctypes.byref(counters), counters.cb):
            return round(counters.PeakWorkingSetSize / 2**20, 1)
        return None
    import resource

    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss  # KiB on Linux, bytes on macOS
    return round(peak / (2**20 if sys.platform == "darwin" else 2**10), 1)


def markdown(card: dict[str, Any]) -> str:
    lines = [
        f"# Model scorecard ({card['label']})",
        "",
        f"Provider `{card['provider']}`, model `{card['model_id']}`, run {card['run_at']}.",
        f"Accuracy threshold {card['min_accuracy']}, unsafe conversions allowed: 0.",
        "Synthetic cases only. Not evidence of clinical accuracy or safety.",
        f"Host peak memory (MB): {card.get('host', {}).get('peak_rss_mb')}",
        f"Decision model: {card['decision_model']}" if card.get("decision_model") else "",
        "",
        "| Task | Cases | Unsupported | Accuracy | Unsafe | p50 ms | p95 ms | Tokens in/out "
        "| Passed |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for task_id, t in card["tasks"].items():
        lines.append(
            f"| `{task_id}` | {t['cases']} | {t['unsupported_by_provider']} | {t['accuracy']} | "
            f"{t['unsafe_conversions']} | "
            f"{t['latency_ms']['p50']} | {t['latency_ms']['p95']} | "
            f"{t['tokens']['input']}/{t['tokens']['output']} | {t['passed']} |"
        )
    for task_id, t in card["tasks"].items():
        lines += [
            "",
            f"## `{task_id}` by tag",
            "",
            "| Tag | Cases | Accuracy |",
            "|---|---|---|",
        ]
        lines += [f"| {tag} | {b['cases']} | {b['accuracy']} |" for tag, b in t["by_tag"].items()]
        if t["unsafe_case_ids"]:
            lines.append(f"\nUnsafe: {', '.join(t['unsafe_case_ids'])}")
        if t["wrong_case_ids"]:
            lines.append(f"\nWrong: {', '.join(t['wrong_case_ids'])}")
    return "\n".join(lines) + "\n"


def write(card: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"scorecard-{card['provider']}-{card['run_at'].replace(':', '')}"
    (out_dir / f"{stem}.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    (out_dir / f"{stem}.md").write_text(markdown(card), encoding="utf-8")
    return out_dir / f"{stem}.md"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--provider", choices=("replay", "azure_openai", "laya_local"), default="replay"
    )
    parser.add_argument("--min-accuracy", type=float, default=0.90)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    if args.provider == "replay":
        adapter: ModelAdapter = ReplayAdapter()
    else:
        settings = Settings.from_env()
        if settings.model_provider != args.provider:
            parser.error(f"set SANAD_MODEL_PROVIDER={args.provider} for a live run")
        adapter = build_model_adapter(settings)
    card = evaluate(adapter, min_accuracy=args.min_accuracy, replay=args.provider == "replay")
    card["host"] = {"peak_rss_mb": _peak_rss_mb()}  # AC-25.9; None when it cannot be read
    if args.provider == "laya_local":  # AC-25.14
        manifest = settings.laya_calibration and settings.laya_calibration / "manifest.json"
        card["decision_model"] = {
            "engine": settings.laya_engine,
            "calibration_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest()
            if manifest
            else None,
        }
    print(markdown(card))
    print(f"Written: {write(card, args.out)}")
    return 0 if card["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
