"""Model run accounting (RF-23, T4.7): the per-case call cap and code-only run metrics.

Both read `MODEL_TASK_RUN` audit entries, which already hold codes only (INV-03). The cap counts
entries that reached the adapter; a refusal by the cap is recorded but never counted, so the
count cannot grow by asking again.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from statistics import quantiles
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, Detail, record
from sanad_api.audit.models import AuditEvent
from sanad_api.auth.deps import AuthContext, require_reviewer
from sanad_api.deps import get_db

BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
BUDGET_REASON = "MODEL_BUDGET_EXCEEDED"

router = APIRouter(tags=["evaluation"])


def _runs(db: Session, case_id: str | None = None) -> list[dict[str, Any]]:
    query = db.query(AuditEvent.details_json).filter(
        AuditEvent.event_type == AuditType.MODEL_TASK_RUN.value
    )
    if case_id is not None:
        query = query.filter(AuditEvent.case_id == case_id)
    return [json.loads(row.details_json) for row in query]


def budget_left(db: Session, case_id: str, cap: int) -> bool:
    used = sum(1 for run in _runs(db, case_id) if run.get("status") != BUDGET_EXCEEDED)
    return used < cap


def record_refusal(
    db: Session, *, actor: str, now: datetime, case_id: str, case_version: int, **codes: Detail
) -> None:
    """Writes the code-only trace for a call the cap refused (AC-23.8)."""
    record(
        db,
        AuditType.MODEL_TASK_RUN,
        actor=actor,
        now=now,
        case_id=case_id,
        case_version=case_version,
        status=BUDGET_EXCEEDED,
        outcome=BUDGET_REASON,
        attempts=0,
        elapsed_ms=0,
        **codes,
    )
    db.commit()


def _percentile(values: list[int], q: int) -> int | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return round(quantiles(values, n=100, method="inclusive")[q - 1])


def summarize(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tasks: dict[str, list[dict[str, Any]]] = {}
    for run in runs:
        tasks.setdefault(str(run.get("task_id")), []).append(run)
    out = []
    for task_id, items in sorted(tasks.items()):
        called = [run for run in items if run.get("status") != BUDGET_EXCEEDED]
        latencies = [int(run.get("elapsed_ms") or 0) for run in called]
        out.append(
            {
                "task_id": task_id,
                "calls": len(items),
                "by_status": dict(Counter(str(run.get("status")) for run in items)),
                "by_outcome": dict(
                    Counter(str(run.get("outcome")) for run in called if run.get("outcome"))
                ),
                "budget_refusals": len(items) - len(called),
                "attempts_mean": (
                    round(sum(int(run.get("attempts") or 0) for run in called) / len(called), 2)
                    if called
                    else None
                ),
                "latency_ms": {
                    "p50": _percentile(latencies, 50),
                    "p95": _percentile(latencies, 95),
                },
                "tokens": {
                    "input": sum(int(run.get("input_tokens") or 0) for run in called),
                    "output": sum(int(run.get("output_tokens") or 0) for run in called),
                },
            }
        )
    return out


@router.get("/evaluation/model-runs")
def model_runs(
    _auth: AuthContext = Depends(require_reviewer), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """AC-23.9. Aggregates only: no case ID, value or text."""
    return {
        "observed_scope": "ALL_SYNTHETIC_CASES",
        "synthetic_demo": True,
        "tasks": summarize(_runs(db)),
    }
