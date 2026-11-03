"""Checks and stores lab values.

A missing or invalid unit or date does not fail the request. The value is held at
NEEDS_USER_CONFIRMATION with its issues, and it is never converted or used (AC-15.2). Only a
value the user confirms with no open issues reaches the assessment.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy.orm import Session

from sanad_api.cases.models import Case
from sanad_api.catalogues import Catalogues, LabCatalogue
from sanad_api.facts.service import (
    FactInput,
    Supersede,
    mark_facts_changed,
    supersede_observation_facts,
    write_fact,
)
from sanad_api.ids import new_id
from sanad_api.observations.models import Observation
from sanad_api.vocab import FieldState, Polarity, SourceType

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Confirmation(StrEnum):
    NEEDS_USER_CONFIRMATION = "NEEDS_USER_CONFIRMATION"
    CONFIRMED_BY_USER = "CONFIRMED_BY_USER"


@dataclass(frozen=True)
class ObservationFields:
    test_code: str
    value: float | None
    unit: str | None
    collected_on: str | None
    reference_source: str | None


def check(fields: ObservationFields, lab: LabCatalogue, today: date) -> list[str]:
    """Returns issue codes. Codes only: an issue never repeats the submitted value."""
    issues: list[str] = []
    test = lab.tests[fields.test_code]
    if fields.value is None:
        issues.append("VALUE_MISSING")
    else:
        too_high = test.maximum is not None and fields.value > test.maximum
        if not math.isfinite(fields.value) or fields.value < 0 or too_high:
            issues.append("VALUE_OUT_OF_RANGE")
    if not fields.unit:
        issues.append("UNIT_MISSING")
    elif fields.unit not in test.accepted_units:
        issues.append("UNIT_NOT_ACCEPTED")
    if not fields.collected_on:
        issues.append("DATE_MISSING")
    else:
        collected = _parse_date(fields.collected_on)
        if collected is None:
            issues.append("DATE_INVALID")
        elif collected > today:
            issues.append("DATE_IN_FUTURE")
    if not fields.reference_source:
        issues.append("REFERENCE_SOURCE_MISSING")
    elif fields.reference_source not in lab.reference_sources:
        issues.append("REFERENCE_SOURCE_NOT_ACCEPTED")
    return issues


def _parse_date(raw: str) -> date | None:
    if not _ISO_DATE.match(raw):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def create(
    db: Session,
    case_id: str,
    fields: ObservationFields,
    source: SourceType,
    lab: LabCatalogue,
    now: datetime,
) -> Observation:
    row = Observation(
        observation_id=new_id("OBS"),
        case_id=case_id,
        test_code=fields.test_code,
        value=fields.value,
        unit=fields.unit,
        collected_on=fields.collected_on,
        reference_source=fields.reference_source,
        source=source.value,
        confirmation_status=Confirmation.NEEDS_USER_CONFIRMATION.value,
        issues_json=json.dumps(check(fields, lab, now.date())),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    return row


def issues_of(row: Observation) -> list[str]:
    issues: list[str] = json.loads(row.issues_json)
    return issues


def is_confirmed(row: Observation) -> bool:
    return row.confirmation_status == Confirmation.CONFIRMED_BY_USER.value


def for_case(db: Session, case_id: str) -> list[Observation]:
    return (
        db.query(Observation).filter(Observation.case_id == case_id).order_by(Observation.id).all()
    )


def replace(
    db: Session,
    case: Case,
    row: Observation,
    fields: ObservationFields,
    lab: LabCatalogue,
    now: datetime,
) -> None:
    was_confirmed = is_confirmed(row)
    row.test_code = fields.test_code
    row.value = fields.value
    row.unit = fields.unit
    row.collected_on = fields.collected_on
    row.reference_source = fields.reference_source
    row.issues_json = json.dumps(check(fields, lab, now.date()))
    row.confirmation_status = Confirmation.NEEDS_USER_CONFIRMATION.value
    row.updated_at = now
    if was_confirmed:
        # A confirmed value was in use, so taking it out is a fact change.
        supersede_observation_facts(db, case.case_id, row.observation_id, now)
        mark_facts_changed(case, now)


def remove(db: Session, case: Case, row: Observation, now: datetime) -> None:
    if is_confirmed(row):
        supersede_observation_facts(db, case.case_id, row.observation_id, now)
        mark_facts_changed(case, now)
    db.delete(row)


def confirm(
    db: Session, case: Case, row: Observation, catalogues: Catalogues, now: datetime
) -> None:
    row.confirmation_status = Confirmation.CONFIRMED_BY_USER.value
    row.updated_at = now
    derived = catalogues.lab_tests.derived_fact
    concept = catalogues.concepts[derived.concept_code]
    # A confirmed lab value implies the test happened. If the user said it did not, both
    # facts stay and the field reads CONFLICTING (AC-15.6).
    write_fact(
        db,
        case.case_id,
        FactInput(
            concept_code=derived.concept_code,
            state=FieldState.KNOWN_POSITIVE if derived.value else FieldState.KNOWN_NEGATIVE,
            value=derived.value,
            polarity=Polarity.AFFIRMED if derived.value else Polarity.NEGATED,
            unit=concept.unit,
            observation_id=row.observation_id,
        ),
        SourceType.USER_ENTERED,
        now,
        Supersede.NONE,
    )
    mark_facts_changed(case, now)


def observation_out(row: Observation, *, used: bool | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "observation_id": row.observation_id,
        "kind": row.kind,
        "test_code": row.test_code,
        "value": row.value,
        "unit": row.unit,
        "collected_on": row.collected_on,
        "reference_source": row.reference_source,
        "source": row.source,
        "confirmation_status": row.confirmation_status,
        "issues": issues_of(row),
    }
    if used is not None:
        out["used_in_assessment"] = used
    return out
