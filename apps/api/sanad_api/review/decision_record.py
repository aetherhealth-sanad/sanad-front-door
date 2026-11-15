"""Decision record for the reviewer (RF-24, T4.8).

Shows what a draft rests on: the rules that fired, the facts and lab values they read, the
catalogue versions, the claim statuses, the case's model runs and the report hash. Everything is
read from the database, catalogues and stored draft at request time. Nothing here calls a model,
summarises with a model or writes to the database (AC-24.2).
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType
from sanad_api.audit.models import AuditEvent
from sanad_api.catalogues import Catalogues
from sanad_api.facts.service import ConceptView, decode_value
from sanad_api.intake.service import AssessmentContext
from sanad_api.intake.summary import changes_since_upload
from sanad_api.observations.service import observation_out
from sanad_api.reports.models import Draft


def facts_used(views: Mapping[str, ConceptView], concept_codes: Iterable[str]) -> list[dict]:
    """Each concept keeps its stored state; a conflict lists every value with its source."""
    out = []
    for code in dict.fromkeys(concept_codes):
        view = views.get(code)
        if view is None:
            continue
        out.append(
            {
                "concept_code": code,
                "state": view.state.value,
                "values": [
                    {
                        "state": fact.state,
                        "value": decode_value(fact),
                        "temporal_status": fact.temporal_status,
                        "source_type": fact.source_type,
                    }
                    for fact in view.current
                ],
            }
        )
    return out


LIMITING = {"UNKNOWN", "NOT_ASKED", "DECLINED", "CONFLICTING"}


def limitations(views: Mapping[str, ConceptView], concept_codes: Iterable[str]) -> list[dict]:
    """AC-24.5: what the draft could not rest on. A concept with no view was never asked."""
    out = []
    for code in dict.fromkeys(concept_codes):
        view = views.get(code)
        state = view.state.value if view is not None else "NOT_ASKED"
        if state in LIMITING:
            out.append({"concept_code": code, "state": state})
    return out


def _model_runs(db: Session, case_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.case_id == case_id,
            AuditEvent.event_type == AuditType.MODEL_TASK_RUN.value,
        )
        .order_by(AuditEvent.id)
    )
    runs = []
    for row in rows:
        details = json.loads(row.details_json)
        runs.append(
            {
                "task_id": details.get("task_id"),
                "status": details.get("status"),
                "outcome": details.get("outcome"),
                "at": row.occurred_at,
            }
        )
    return runs


def build(
    db: Session,
    case_id: str,
    ctx: AssessmentContext,
    draft: Draft,
    content: Mapping[str, Any],
    catalogues: Catalogues,
    now: datetime,
) -> dict[str, Any]:
    proposal = content["triage_proposal"]
    floor_ids = set(proposal["rule_ids"])
    rules = {rule.rule_id: rule for rule in catalogues.triage.rules}
    hit_ids = list(
        dict.fromkeys([s["rule_id"] for s in content["risk_signals"]] + proposal["rule_ids"])
    )
    hit = [rules[rule_id] for rule_id in hit_ids if rule_id in rules]
    test_codes = {code for rule in hit for code in rule.test_codes}
    return {
        "action": proposal["action"],
        "floor": proposal["floor"],
        "rules": [
            {
                "rule_id": rule.rule_id,
                "signal": rule.signal,
                "sets_floor": rule.rule_id in floor_ids,
                "rule_version": proposal["rule_version"],
                "approval_status": proposal["approval_status"],
            }
            for rule in hit
        ],
        "catalogue_versions": {
            "questions": catalogues.questions.catalogue_version,
            "emergency": catalogues.emergency.catalogue_version,
            "emergency_text": catalogues.emergency_text.catalogue_version,
            "lab_tests": catalogues.lab_tests.catalogue_version,
            "passages": catalogues.passages.catalogue_version,
            "consent": catalogues.consent.consent_version,
        },
        "facts_used": facts_used(ctx.views, [r.concept_code for r in hit if r.concept_code]),
        "observations_used": [
            observation_out(o, used=True)
            for o in ctx.observations
            if o.observation_id in ctx.used_observation_ids and o.test_code in test_codes
        ],
        "evidence": [
            {"claim_id": e["claim_id"], "rule_id": e["rule_id"], "status": e["status"]}
            for e in content["evidence"]
        ],
        "model_runs": _model_runs(db, case_id),
        "limitations": limitations(
            ctx.views, [q.concept_code for q in catalogues.questions.questions]
        ),
        "rules_approval_status": proposal["approval_status"],
        "changes_since_summary": changes_since_upload(db, case_id),  # AC-28.6
        "report_hash": draft.report_hash,
        "built_at": now,
    }
