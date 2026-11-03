"""Emergency gate (RF-10, HR-02).

It runs first, independent of the Gatekeeper, and does not wait for missing data. A trigger
always wins: any current fact holding a trigger value fires its rule, even when another source
disagrees. The browser check reads the same catalogue file and must agree (AC-10.4).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from sanad_api.catalogues import EmergencyCatalogue


class SafetyResult(StrEnum):
    EMERGENCY_GUIDANCE_ISSUED = "EMERGENCY_GUIDANCE_ISSUED"
    SAFE_TO_CONTINUE = "SAFE_TO_CONTINUE"  # a routing value, never shown to the user as "safe"
    NEEDS_RECHECK = "NEEDS_RECHECK"


@dataclass(frozen=True)
class EmergencyResult:
    triggered: bool
    rule_ids: tuple[str, ...]
    catalogue_version: str


def _same(value: object, trigger: object) -> bool:
    # True == 1 in Python, so compare types too.
    return type(value) is type(trigger) and value == trigger


def evaluate_values(
    values_by_concept: Mapping[str, Sequence[object]], catalogue: EmergencyCatalogue
) -> EmergencyResult:
    fired = tuple(
        rule.rule_id
        for rule in catalogue.rules
        if any(
            _same(value, trigger)
            for value in values_by_concept.get(rule.concept_code, ())
            for trigger in rule.trigger_values
        )
    )
    return EmergencyResult(bool(fired), fired, catalogue.catalogue_version)


@dataclass(frozen=True)
class SafetyEvaluation:
    result: SafetyResult
    rule_ids: tuple[str, ...]
    missing_question_ids: tuple[str, ...]


def evaluate_responses(
    responses: Mapping[str, str], catalogue: EmergencyCatalogue
) -> SafetyEvaluation:
    """The check on raw safety-screen responses, as the browser runs it (rule_conformance.jsonl).

    Unknown question IDs, from an older catalogue, are ignored. A missing current question
    never counts as NO: with no trigger, the result is NEEDS_RECHECK.
    """
    values: dict[str, list[object]] = {}
    for question in catalogue.questions:
        response = responses.get(question.question_id)
        if response is None:
            continue
        mapped = catalogue.response_values[response]
        if mapped.value is not None:
            values.setdefault(question.concept_code, []).append(mapped.value)
    result = evaluate_values(values, catalogue)
    missing = tuple(q.question_id for q in catalogue.questions if q.question_id not in responses)
    if result.triggered:
        outcome = SafetyResult.EMERGENCY_GUIDANCE_ISSUED
    elif missing:
        outcome = SafetyResult.NEEDS_RECHECK
    else:
        outcome = SafetyResult.SAFE_TO_CONTINUE
    return SafetyEvaluation(outcome, result.rule_ids, missing)
