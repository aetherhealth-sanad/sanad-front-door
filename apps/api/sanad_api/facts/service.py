"""Writes and reads SemanticFacts.

This module keeps three promises (INV-05, PRD-FR-17, AC-06.3):
- UNKNOWN, NOT_ASKED and DECLINED are stored and returned as themselves, never as NO or NORMAL.
- PAST stays PAST and NEGATED stays NEGATED, from storage to display.
- Known values that disagree are all kept and the field reads CONFLICTING. The system never
  picks one. Only the user resolves a conflict, by answering the question again.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.cases.models import Case
from sanad_api.catalogues import ConceptDef
from sanad_api.facts.models import Fact
from sanad_api.ids import new_id
from sanad_api.vocab import (
    KNOWN_STATES,
    FieldState,
    Polarity,
    SourceType,
    TemporalStatus,
    VerificationStatus,
)

Value = bool | int | float | str


@dataclass(frozen=True)
class FactInput:
    concept_code: str
    state: FieldState
    value: Value | None = None
    polarity: Polarity | None = None
    temporal_status: TemporalStatus | None = None
    unit: str | None = None
    raw_response_id: str | None = None
    observation_id: str | None = None


def value_problem(concept: ConceptDef, value: object, temporal_status: str | None) -> str | None:
    """Type, range and temporal checks. Returns a fixed code and never the value itself."""
    kind = concept.value_type
    if kind == "BOOLEAN" and not isinstance(value, bool):
        return "VALUE_TYPE"
    if kind == "CHOICE" and (not isinstance(value, str) or value not in concept.options):
        return "VALUE_NOT_ALLOWED"
    if kind in ("INTEGER", "NUMBER"):
        if isinstance(value, bool) or not isinstance(value, int | float):
            return "VALUE_TYPE"
        number = float(value)
        if not math.isfinite(number) or (kind == "INTEGER" and number != int(number)):
            return "VALUE_TYPE"
        if concept.minimum is not None and number < concept.minimum:
            return "VALUE_OUT_OF_RANGE"
        if concept.maximum is not None and number > concept.maximum:
            return "VALUE_OUT_OF_RANGE"
    needs_temporal = concept.temporal and value is True
    if needs_temporal and temporal_status not in {t.value for t in TemporalStatus}:
        return "TEMPORAL_STATUS_REQUIRED"
    if not needs_temporal and temporal_status is not None:
        return "TEMPORAL_STATUS_NOT_ALLOWED"
    return None


def from_value(
    concept_code: str,
    concept: ConceptDef,
    value: Value,
    temporal_status: str | None,
    raw_response_id: str | None = None,
) -> FactInput:
    """Builds a known fact from a value that already passed `value_problem`."""
    normalised: Value = value
    if concept.value_type == "BOOLEAN":
        polarity = Polarity.AFFIRMED if value else Polarity.NEGATED
    elif concept.value_type == "CHOICE":
        polarity = Polarity(concept.options[str(value)])
    else:
        polarity = Polarity.AFFIRMED
        normalised = int(value) if concept.value_type == "INTEGER" else float(value)
    return FactInput(
        concept_code=concept_code,
        state=(
            FieldState.KNOWN_POSITIVE
            if polarity is Polarity.AFFIRMED
            else FieldState.KNOWN_NEGATIVE
        ),
        value=normalised,
        polarity=polarity,
        temporal_status=TemporalStatus(temporal_status) if temporal_status else None,
        unit=concept.unit,
        raw_response_id=raw_response_id,
    )


def from_state(
    concept_code: str, state: FieldState, raw_response_id: str | None = None
) -> FactInput:
    """UNKNOWN or DECLINED. It carries no value, so it can never read as NO."""
    if state not in (FieldState.UNKNOWN, FieldState.DECLINED):
        raise ValueError("only UNKNOWN or DECLINED are stored without a value")
    return FactInput(concept_code=concept_code, state=state, raw_response_id=raw_response_id)


def decode_value(fact: Fact) -> Value | None:
    if fact.value_json is None:
        return None
    decoded: Value = json.loads(fact.value_json)
    return decoded


class DiscrepancyKind(StrEnum):
    """Reason active facts cannot be safely collapsed to a single answer."""

    NONE = "NONE"
    VALUE_CONFLICT = "VALUE_CONFLICT"
    TEMPORAL_CLARIFICATION = "TEMPORAL_CLARIFICATION"


@dataclass(frozen=True)
class ConceptView:
    concept_code: str
    state: FieldState
    current: tuple[Fact, ...]
    known: tuple[Fact, ...]
    discrepancy_kind: DiscrepancyKind = DiscrepancyKind.NONE

    def values(self) -> list[Value]:
        return [v for v in (decode_value(f) for f in self.known) if v is not None]


def build_view(concept_code: str, facts: Sequence[Fact]) -> ConceptView:
    current = tuple(f for f in facts if f.concept_code == concept_code and f.superseded_at is None)
    if not current:
        return ConceptView(concept_code, FieldState.NOT_ASKED, (), ())
    known = tuple(f for f in current if f.state in KNOWN_STATES)
    discrepancy_kind = DiscrepancyKind.NONE
    if known:
        # Disagreement about the value/polarity is distinct from a difference in time context.
        # A temporal-only difference is not evidence of a clinical contradiction, but without
        # event/effective dates it must still be clarified before assessment can proceed.
        if len({(f.state, f.value_json) for f in known}) > 1:
            discrepancy_kind = DiscrepancyKind.VALUE_CONFLICT
        elif len({f.temporal_status for f in known}) > 1:
            discrepancy_kind = DiscrepancyKind.TEMPORAL_CLARIFICATION
        state = (
            FieldState.CONFLICTING
            if discrepancy_kind is not DiscrepancyKind.NONE
            else FieldState(known[0].state)
        )
    else:
        latest = max(current, key=lambda f: (f.recorded_at, f.id or 0))
        state = FieldState(latest.state)
    return ConceptView(concept_code, state, current, known, discrepancy_kind)


def build_views(facts: Sequence[Fact], concept_codes: Iterable[str]) -> dict[str, ConceptView]:
    return {code: build_view(code, facts) for code in concept_codes}


def current_facts(db: Session, case_id: str) -> list[Fact]:
    return (
        db.query(Fact)
        .filter(Fact.case_id == case_id, Fact.superseded_at.is_(None))
        .order_by(Fact.id)
        .all()
    )


class Supersede(StrEnum):
    NONE = "NONE"  # a batch from one profile: rows may disagree and must all stay
    SAME_SOURCE = "SAME_SOURCE"  # a correction from the same channel
    ALL = "ALL"  # the user resolving a conflict or answering a clarification


def write_fact(
    db: Session,
    case_id: str,
    fact: FactInput,
    source_type: SourceType,
    now: datetime,
    supersede: Supersede,
) -> Fact:
    if supersede is not Supersede.NONE:
        older = db.query(Fact).filter(
            Fact.case_id == case_id,
            Fact.concept_code == fact.concept_code,
            Fact.superseded_at.is_(None),
        )
        if supersede is Supersede.SAME_SOURCE:
            older = older.filter(Fact.source_type == source_type.value)
        for row in older:
            row.superseded_at = now
    row = Fact(
        fact_id=new_id("SF"),
        case_id=case_id,
        concept_code=fact.concept_code,
        value_json=None if fact.value is None else json.dumps(fact.value),
        state=fact.state.value,
        polarity=fact.polarity.value if fact.polarity else None,
        temporal_status=fact.temporal_status.value if fact.temporal_status else None,
        unit=fact.unit,
        source_type=source_type.value,
        verification_status=VerificationStatus.UNVERIFIED.value,
        raw_response_id=fact.raw_response_id,
        observation_id=fact.observation_id,
        recorded_at=now,
        superseded_at=None,
    )
    db.add(row)
    db.flush()
    return row


def supersede_observation_facts(
    db: Session, case_id: str, observation_id: str, now: datetime
) -> bool:
    rows = (
        db.query(Fact)
        .filter(
            Fact.case_id == case_id,
            Fact.observation_id == observation_id,
            Fact.superseded_at.is_(None),
        )
        .all()
    )
    for row in rows:
        row.superseded_at = now
    return bool(rows)


def mark_facts_changed(case: Case, now: datetime) -> None:
    """A fact change raises the case version and discards the draft (API design section 4)."""
    case.case_version += 1
    case.current_draft_id = None
    case.updated_at = now


def fact_out(fact: Fact) -> dict[str, Any]:
    return {
        "fact_id": fact.fact_id,
        "concept_code": fact.concept_code,
        "value": decode_value(fact),
        "unit": fact.unit,
        "state": fact.state,
        "polarity": fact.polarity,
        "temporal_status": fact.temporal_status,
        "source_type": fact.source_type,
        "verification_status": fact.verification_status,
        "recorded_at": fact.recorded_at,
    }
