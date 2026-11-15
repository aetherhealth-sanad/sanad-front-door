"""Fit the local decision model's heads and calibration on labelled synthetic rows (RF-25, T4.11).

AC-25.13/25.14, CC-017. Reads `eval/decision/intake_rows.v0.1.jsonl` only; the RF-23 cases are
never read here, so their scorecard measures transfer. Writes the calibration directory and a fit
report under `eval/out/decision/` (not committed). Load the directory with
`SANAD_LAYA_ENGINE=vegaml SANAD_LAYA_CALIBRATION=<dir>`.

    python eval/fit_decision_head.py --revision <sha> [--allow-unreviewed]

Needs `pip install -e "apps/api[decision]"`. vegaml suggests one CPU thread; on the Windows
test host that was about 7x slower (p50 2.6 s against 350 ms), so keep torch's default.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from sanad_api.catalogues import load_catalogues  # noqa: E402
from sanad_api.config import Settings  # noqa: E402
from sanad_api.model_adapter import intake_extract  # noqa: E402
from sanad_api.model_adapter.laya_local import decision_question  # noqa: E402

ROWS = ROOT / "eval" / "decision" / "intake_rows.v0.1.jsonl"
OUT = ROOT / "eval" / "out" / "decision"
REVIEWED = {"TEAM", "MODEL_DRAFTED_TEAM_REVIEWED"}


def vega_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Each row as laya's `{state, questions, gold}`, built with the adapter's own prompt."""
    catalogues = load_catalogues(ROOT)
    settings = Settings()
    out = []
    for row in rows:
        question = catalogues.intake_question(row["question_id"])
        if question is None:
            raise ValueError(f"{row['row_id']}: unknown question {row['question_id']}")
        request = intake_extract.build_request(
            question,
            catalogues.concepts[question.concept_code],
            row["state"],
            request_id="fit",
            catalogue_version=catalogues.questions.catalogue_version,
            settings=settings,
        )
        key, spec, labels = decision_question(json.loads(request.user_content)["question"])
        if row["label"] not in labels:
            raise ValueError(f"{row['row_id']}: label {row['label']} is not one of {list(labels)}")
        out.append({"state": row["state"], "questions": {key: spec}, "gold": {key: row["label"]}})
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--rows", type=Path, default=ROWS)
    parser.add_argument("--model", default="nandakishorm/vega-U")
    parser.add_argument("--revision", required=True, help="pinned commit SHA of the reader")
    parser.add_argument("--target-precision", type=float, default=0.95)
    parser.add_argument("--allow-unreviewed", action="store_true")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args(argv)

    raw = args.rows.read_bytes()
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
    authors = collections.Counter(row["author"] for row in rows)
    unreviewed = sum(n for author, n in authors.items() if author not in REVIEWED)
    if unreviewed and not args.allow_unreviewed:
        parser.error(f"{unreviewed} rows are not reviewed (OD-18); pass --allow-unreviewed")
    examples = vega_rows(rows)

    import laya  # type: ignore[import-not-found]

    started = time.monotonic()
    agent = laya.load(vegaml=args.model, revision=args.revision)
    report = agent.fit(examples, target_precision=args.target_precision)
    calibration = args.out / "calibration"
    agent.save_calibration(str(calibration))
    fit_report = {
        "label": "NOT_CLINICALLY_VALIDATED",
        "rows_file": args.rows.name,
        "rows_sha256": hashlib.sha256(raw).hexdigest(),
        "rows": len(rows),
        "rows_by_author": dict(authors),
        "rows_by_key": dict(collections.Counter(next(iter(e["gold"])) for e in examples)),
        "reader": args.model,
        "revision": args.revision,
        "target_precision": args.target_precision,
        "calibration_dir": str(calibration),
        "calibration_sha256": hashlib.sha256((calibration / "manifest.json").read_bytes())
        .hexdigest(),
        "seconds": round(time.monotonic() - started),
        "fit": report,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / "fit_report.json"
    path.write_text(json.dumps(fit_report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: v for k, v in fit_report.items() if k != "fit"}, indent=2))
    print("serving:", report.get("serving"), "kept:", report.get("kept"))
    print(f"Written: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
