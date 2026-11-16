"""Patient-held visit summary (RF-28, T4.14, CC-019).

The export is the user's own structured answers in the existing upload format, so the next visit
can start from it. The server keeps no copy. Changes since an uploaded file are listed for the
reviewer by code; nothing here judges whether anything improved (INV-08).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.catalogues import Catalogues
from sanad_api.facts.models import Fact
from sanad_api.facts.service import current_facts, decode_value
from sanad_api.observations import service as observations
from sanad_api.vocab import FieldState, SourceType

PROFILE_FORMAT = "sanad-profile-0.1"
_KNOWN = {FieldState.KNOWN_POSITIVE.value, FieldState.KNOWN_NEGATIVE.value}
_STATES = {FieldState.UNKNOWN.value, FieldState.DECLINED.value}


def _exportable(catalogues: Catalogues) -> set[str]:
    """Upload-schema concepts minus the emergency screen, which is asked fresh (AC-28.2)."""
    allowed = set(catalogues.upload_schema["$defs"]["concept_code"]["enum"])
    return allowed - set(catalogues.emergency_concepts)


def _pick(facts: list[Fact]) -> Fact:
    """AC-28.3: the latest patient answer, else the latest value."""
    reported = [f for f in facts if f.source_type == SourceType.PATIENT_REPORTED.value]
    return max(reported or facts, key=lambda f: f.id)


def _response(fact: Fact) -> dict[str, Any] | None:
    if fact.state in _KNOWN:
        out: dict[str, Any] = {"concept_code": fact.concept_code, "value": decode_value(fact)}
        if fact.temporal_status:
            out["temporal_status"] = fact.temporal_status
        return out
    if fact.state in _STATES:  # never exported as No (INV-05)
        return {"concept_code": fact.concept_code, "state": fact.state}
    return None  # NOT_ASKED is the absence of a fact


def build(db: Session, case_id: str, catalogues: Catalogues, today: date) -> dict[str, Any]:
    allowed = _exportable(catalogues)
    by_concept: dict[str, list[Fact]] = {}
    for fact in current_facts(db, case_id):
        if fact.concept_code in allowed:
            by_concept.setdefault(fact.concept_code, []).append(fact)
    responses = [r for facts in by_concept.values() if (r := _response(_pick(facts)))]
    rows = observations.for_case(db, case_id)
    return {
        "profile_format": PROFILE_FORMAT,
        "is_synthetic": True,  # synthetic-only prototype (INV-09)
        "summary_of": {
            "exported_on": today.isoformat(),
            "question_catalogue_version": catalogues.questions.catalogue_version,
        },
        "responses": responses,
        "observations": [
            {
                "test_code": o.test_code,
                "value": o.value,
                "unit": o.unit,
                "collected_on": o.collected_on,
                "reference_source": o.reference_source,
            }
            for o in rows
        ],
    }


def _side(fact: Fact) -> dict[str, Any]:
    return {
        "state": fact.state,
        "value": decode_value(fact),
        "temporal_status": fact.temporal_status,
        "source_type": fact.source_type,
    }


def changes_since_upload(db: Session, case_id: str) -> list[dict[str, Any]]:
    """AC-28.6: concepts whose newest patient answer differs from the uploaded one."""
    rows = db.query(Fact).filter(Fact.case_id == case_id).order_by(Fact.id).all()
    before: dict[str, Fact] = {}
    now: dict[str, Fact] = {}
    for fact in rows:  # superseded rows count too: the upload is the earlier visit's claim
        if fact.source_type == SourceType.USER_UPLOADED.value:
            before[fact.concept_code] = fact
        elif fact.source_type == SourceType.PATIENT_REPORTED.value:
            now[fact.concept_code] = fact
    out = []
    for code, old in before.items():
        new = now.get(code)
        if new is None:
            continue
        old_side, new_side = _side(old), _side(new)
        same = {k: v for k, v in old_side.items() if k != "source_type"} == {
            k: v for k, v in new_side.items() if k != "source_type"
        }
        if not same:
            out.append({"concept_code": code, "before": old_side, "now": new_side})
    return out
