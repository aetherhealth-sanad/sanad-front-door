"""T-60 evaluation run on the lab OCR fixtures (E1).

Run from the repository root with the optional `ocr` extra installed (Tesseract is used when the
program is on the PATH):

    apps/api/.venv/bin/python eval/lab_ocr/run_eval.py
    apps/api/.venv/bin/python eval/lab_ocr/run_eval.py --generated 12   # adds a stress section

It reads every file in `apps/api/tests/fixtures/lab_ocr/` with each available engine, compares
each field with `ground_truth.json`, and writes `eval/lab_ocr/reports/<run_id>.{md,json}`.
Exit code 1 when any silent error occurs.

What the numbers mean: on these fixtures only, the software read back what was printed. They are
NOT_CLINICALLY_VALIDATED and say nothing about real-world accuracy.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sanad_api.document_import.extract import (  # noqa: E402
    DEFAULT_CONFIDENCE_THRESHOLD,
    extract,
)
from sanad_api.document_import.fields import load_lab_catalogue  # noqa: E402
from sanad_api.document_import.model import FieldStatus, LabDraft, Status  # noqa: E402
from sanad_api.document_import.ocr import OcrEngine  # noqa: E402

FIXTURES = REPO_ROOT / "apps" / "api" / "tests" / "fixtures" / "lab_ocr"
OUT_DIR = Path(__file__).resolve().parent / "reports"
LABEL = "NOT_CLINICALLY_VALIDATED"
TODAY = date(2026, 11, 15)


@dataclass
class Score:
    files: int = 0
    extracted: int = 0
    fields: int = 0
    correct: int = 0
    dates: int = 0
    dates_correct: int = 0
    wrong: int = 0
    wrong_caught: int = 0
    silent: int = 0
    per_field: dict[str, list[int]] = field(
        default_factory=dict
    )  # field -> [correct, total]
    silent_examples: list[str] = field(default_factory=list)
    seconds: list[float] = field(default_factory=list)

    def add(
        self, draft: LabDraft, expected: dict[str, Any], seconds: float, where: str
    ) -> None:
        self.files += 1
        self.seconds.append(round(seconds, 3))
        if draft.status is Status.EXTRACTED:
            self.extracted += 1
        got = {item.field_id: item for item in draft.fields}
        for field_id, want in expected.items():
            item = got.get(field_id)
            right = item is not None and (item.value, item.unit) == (
                want["value"],
                want["unit"],
            )
            tally = self.per_field.setdefault(field_id, [0, 0])
            tally[1] += 1
            if field_id == "collection_date":
                self.dates += 1
                self.dates_correct += right
            else:
                self.fields += 1
                self.correct += right
            tally[0] += right
            if right:
                continue
            self.wrong += 1
            caught = (
                item is None
                or bool(item.flags)
                or item.status is FieldStatus.NEEDS_CONFIRMATION
            )
            self.wrong_caught += caught
            if (
                item is not None
                and not item.flags
                and item.confidence >= DEFAULT_CONFIDENCE_THRESHOLD
            ):
                self.silent += 1
                self.silent_examples.append(
                    f"{where}: {field_id} read {item.value!r} {item.unit!r}, "
                    f"expected {want['value']!r} {want['unit']!r}, confidence {item.confidence:.3f}"
                )


def engines() -> dict[str, OcrEngine]:
    found: dict[str, OcrEngine] = {}
    try:
        from sanad_api.document_import.rapid_ocr import RapidOcrEngine

        engine = RapidOcrEngine()
        found[engine.engine_id] = engine
    except ImportError:
        pass
    try:
        from sanad_api.document_import.tesseract_ocr import TesseractEngine

        tesseract = TesseractEngine()
        found[tesseract.engine_id] = tesseract
    except Exception:  # not installed
        pass
    return found


def git(*args: str) -> str:
    done = subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True, text=True)
    return done.stdout.strip()


def acceptance(results: dict[str, Any], truth: dict[str, Any]) -> dict[str, str]:
    """A1, B1 and C1 from T-60, as PASS or FAIL with the reason."""
    out: dict[str, str] = {}
    drafts = results["drafts"]

    a = drafts["lab_A_clean_textlayer.pdf"]["text-layer"]
    bad = [f["field_id"] for f in a["fields"] if f["flags"] or f["confidence"] is None]
    out["A1"] = (
        "PASS"
        if a["status"] == "EXTRACTED" and not bad
        else f"FAIL: {bad or a['reason']}"
    )

    problems = []
    for name in ("lab_B_scanned.pdf", "lab_B_scanned.png"):
        for engine_id, draft in drafts[name].items():
            if draft["status"] != "EXTRACTED":
                problems.append(f"{name}/{engine_id} rejected {draft['reason']}")
    for engine_id, score in results["scores"].items():
        if engine_id != "text-layer" and (
            score["silent"] or score["wrong"] != score["wrong_caught"]
        ):
            problems.append(
                f"{engine_id}: {score['silent']} silent, "
                f"{score['wrong'] - score['wrong_caught']} wrong and not caught"
            )
    if not any(engine != "text-layer" for engine in results["scores"]):
        problems.append("no OCR engine available")
    out["B1"] = "PASS" if not problems else "FAIL: " + "; ".join(problems)

    c = drafts["lab_C_ambiguous_textlayer.pdf"]["text-layer"]
    want = truth["files"]["lab_C_ambiguous_textlayer.pdf"]["fields"]
    misses = []
    for item in c["fields"]:
        expected = want[item["field_id"]]
        missing = set(expected["flags"]) - set(item["flags"])
        if missing or item["status"] != expected["status"]:
            misses.append(
                f"{item['field_id']} missing {sorted(missing)} status {item['status']}"
            )
    out["C1"] = (
        "PASS"
        if c["status"] == "EXTRACTED" and not misses
        else "FAIL: " + "; ".join(misses)
    )
    return out


def run(generated: int) -> dict[str, Any]:
    catalogue = load_lab_catalogue(REPO_ROOT)
    truth = json.loads((FIXTURES / "ground_truth.json").read_text(encoding="utf-8"))
    available = engines()
    scores: dict[str, Score] = {
        "text-layer": Score(),
        **{e: Score() for e in available},
    }
    drafts: dict[str, dict[str, Any]] = {}
    for name, spec in truth["files"].items():
        document = (FIXTURES / name).read_bytes()
        runs: dict[str, OcrEngine | None] = (
            dict(available) if spec["method"] == "OCR" else {"text-layer": None}
        )
        drafts[name] = {}
        for engine_id, engine in runs.items():
            started = time.perf_counter()
            draft = extract(document, catalogue, TODAY, engine=engine)
            scores[engine_id].add(
                draft, spec["fields"], time.perf_counter() - started, name
            )
            drafts[name][engine_id] = draft.to_json()

    stress: dict[str, Score] = {}
    if generated and available:
        import variants
        from lab_reports import random_report, render_pdf
        from lab_reports import truth as report_truth

        for seed in range(generated):
            report = random_report(seed)
            expected = {
                k: {**v, "status": "UNCONFIRMED", "flags": []}
                for k, v in report_truth(report)["fields"].items()
            }
            pdf = render_pdf(report)
            for variant in variants.VARIANTS:
                document = variants.make(pdf, variant, seed)
                for engine_id, engine in available.items():
                    started = time.perf_counter()
                    draft = extract(document, catalogue, TODAY, engine=engine)
                    stress.setdefault(f"{engine_id} / {variant}", Score()).add(
                        draft, expected, time.perf_counter() - started, f"seed {seed}"
                    )
            print(f"generated report {seed + 1}/{generated} done", file=sys.stderr)

    commit_sha = git("rev-parse", "HEAD")
    results: dict[str, Any] = {
        "run_id": f"lab-ocr-{datetime.now(UTC):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:8]}",
        "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "commit_sha": commit_sha or "UNAVAILABLE_SOURCE_ARCHIVE",
        "source_revision_status": "GIT_COMMIT" if commit_sha else "UNVERSIONED_ARCHIVE",
        "working_tree_clean": bool(commit_sha) and git("status", "--porcelain") == "",
        "label": LABEL,
        "label_source": truth["label_source"],
        "fixture_provenance": truth["provenance"],
        "layouts_tested": [truth["layout_id"]],
        "n_files": len(truth["files"]),
        "catalogue_version": catalogue.catalogue_version,
        "confidence_threshold": DEFAULT_CONFIDENCE_THRESHOLD,
        "engines": list(available),
        "fixture_sha256": {
            name: hashlib.sha256((FIXTURES / name).read_bytes()).hexdigest()
            for name in truth["files"]
        },
        "scores": {name: asdict(score) for name, score in scores.items()},
        "stress": {name: asdict(score) for name, score in stress.items()},
        "drafts": drafts,
    }
    results["acceptance"] = acceptance(results, truth)
    return results


def _pct(part: int, whole: int) -> str:
    return f"{part}/{whole} ({100 * part / whole:.0f}%)" if whole else "n/a"


def markdown(r: dict[str, Any]) -> str:
    silent_total = sum(s["silent"] for s in r["scores"].values())
    lines = [
        f"# Lab OCR evaluation, T-60 ({r['label']})",
        "",
        f"**Silent errors: {silent_total}** (target 0)",
        "",
        "> Fixtures only. The software read back what the fixtures print. This is not",
        "> real-world accuracy and not clinical validity.",
        "",
        f"- run_id: `{r['run_id']}`",
        f"- commit_sha: `{r['commit_sha']}`"
        + (
            "" if r["working_tree_clean"] else " (working tree has uncommitted changes)"
        ),
        f"- run_at: {r['run_at']}",
        f"- n files: {r['n_files']}; layouts tested: {', '.join(r['layouts_tested'])}",
        f"- fixtures: {r['fixture_provenance']}",
        f"- engines: {', '.join(r['engines']) or 'none'}; confidence threshold "
        f"{r['confidence_threshold']} (TECH_TBD)",
        "",
        "## Acceptance checks",
        "",
        "| Check | Result |",
        "|---|---|",
        *[f"| {k} | {v} |" for k, v in r["acceptance"].items()],
        "",
        "## Metrics by engine",
        "",
        "| Engine | Files | Silent errors | Field accuracy | Date accuracy | Flag recall |",
        "|---|---|---|---|---|---|",
    ]
    for name, s in r["scores"].items():
        if not s["files"]:
            continue
        lines.append(
            f"| {name} | {s['files']} | **{s['silent']}** | {_pct(s['correct'], s['fields'])} | "
            f"{_pct(s['dates_correct'], s['dates'])} | {_pct(s['wrong_caught'], s['wrong'])} |"
        )
    lines += [
        "",
        "Field accuracy: value and unit both correct. Flag recall: wrong fields that carry a flag "
        "or `NEEDS_CONFIRMATION`. Silent error: wrong, no flag, confidence at or above the "
        "threshold.",
        "",
        "## Field accuracy per field",
        "",
        "| Field | "
        + " | ".join(n for n, s in r["scores"].items() if s["files"])
        + " |",
        "|---|" + "---|" * sum(1 for s in r["scores"].values() if s["files"]),
    ]
    field_ids = next(iter(r["drafts"].values()))
    field_ids = [f["field_id"] for f in next(iter(field_ids.values()))["fields"]] or []
    for field_id in field_ids:
        cells = []
        for s in r["scores"].values():
            if s["files"]:
                got, total = s["per_field"].get(field_id, [0, 0])
                cells.append(f"{got}/{total}")
        lines.append(f"| {field_id} | " + " | ".join(cells) + " |")
    lines += ["", "## Wrong readings on the scanned fixture", ""]
    for name in ("lab_B_scanned.pdf", "lab_B_scanned.png"):
        for engine_id, draft in r["drafts"][name].items():
            truth_fields = json.loads(
                (FIXTURES / "ground_truth.json").read_text(encoding="utf-8")
            )["files"][name]["fields"]
            for item in draft["fields"]:
                want = truth_fields[item["field_id"]]
                if (item["value"], item["unit"]) != (want["value"], want["unit"]):
                    lines.append(
                        f"- {name} / {engine_id}: `{item['field_id']}` read `{item['raw_text']}`"
                        f" → {item['value']!r} {item['unit']!r}; expected {want['value']!r} "
                        f"{want['unit']!r}; flags {item['flags']}; status {item['status']}"
                    )
    examples = [e for s in r["scores"].values() for e in s["silent_examples"]]
    lines += (
        ["", "## Silent errors", "", *(f"- {e}" for e in examples)] if examples else []
    )
    if r["stress"]:
        lines += [
            "",
            "## Stress: generated reports through scan variants",
            "",
            "Generated with `eval/lab_ocr/lab_reports.py`, same layout. Not a T-60 metric.",
            "",
            "| Engine / variant | Files | Silent | Field accuracy | Date accuracy | Flag recall |",
            "|---|---|---|---|---|---|",
        ]
        for name, s in r["stress"].items():
            lines.append(
                f"| {name} | {s['files']} | **{s['silent']}** | {_pct(s['correct'], s['fields'])}"
                f" | {_pct(s['dates_correct'], s['dates'])}"
                f" | {_pct(s['wrong_caught'], s['wrong'])} |"
            )
        stress_examples = [
            e for s in r["stress"].values() for e in s["silent_examples"]
        ]
        if stress_examples:
            lines += ["", "Silent errors in the stress section:", ""]
            lines += [f"- {e}" for e in stress_examples]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--generated", type=int, default=0, help="add N generated reports"
    )
    args = parser.parse_args()
    results = run(args.generated)
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / f"{results['run_id']}.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    text = markdown(results)
    (OUT_DIR / f"{results['run_id']}.md").write_text(text, encoding="utf-8")
    print(text)
    silent = sum(s["silent"] for s in results["scores"].values())
    sys.exit(1 if silent else 0)


if __name__ == "__main__":
    main()
