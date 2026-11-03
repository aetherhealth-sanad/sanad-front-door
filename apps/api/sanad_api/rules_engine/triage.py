"""Risk signals and the draft triage floor (RF-11, PRD-FR-06).

The rule kinds live here. Every concept, state, number and wording they use comes from the
catalogue (HR-04). A risk signal is not a triage action, and neither is ever a diagnosis or a
probability (BRD section 9.1, INV-06). The same inputs and rule version always give the same
result (AC-11.5).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from sanad_api.catalogues import TriageCatalogue, TriageRule
from sanad_api.facts.service import ConceptView
from sanad_api.rules_engine.floor import apply_floor, highest
from sanad_api.vocab import FieldState, TriageAction


@dataclass(frozen=True)
class LabValue:
    observation_id: str
    test_code: str
    value: float
    unit: str


@dataclass(frozen=True)
class TriageInputs:
    views: Mapping[str, ConceptView]  # concepts the user allows to be used
    lab_values: tuple[LabValue, ...]  # confirmed values only


@dataclass(frozen=True)
class RiskSignal:
    code: str
    source_field: str
    rule_id: str
    status: str = "OBSERVED"


@dataclass(frozen=True)
class TriageResult:
    risk_signals: tuple[RiskSignal, ...]
    hit_rule_ids: tuple[str, ...]
    floor_rule_ids: tuple[str, ...]
    floor: TriageAction | None
    action: TriageAction
    rule_version: str
    approval_status: str
    context_question_ids: tuple[str, ...]
    limit_codes: tuple[str, ...]


def evaluate(inputs: TriageInputs, catalogue: TriageCatalogue) -> TriageResult:
    hits: list[tuple[TriageRule, RiskSignal]] = []
    limits: list[str] = []
    for rule in catalogue.rules:
        rule_hits, rule_limits = _evaluate_rule(rule, inputs)
        hits.extend((rule, signal) for signal in rule_hits)
        limits.extend(code for code in rule_limits if code not in limits)

    floor = highest((r.floor for r, _ in hits if r.floor is not None), catalogue.action_rank)
    # No model proposes anything in this flow, so the floor is the proposal. Without a floor
    # the result is NEEDS_MORE_INFORMATION, which is never treated as low risk (AC-06.5).
    proposal = floor or catalogue.default_action
    final = apply_floor(proposal, floor, catalogue.action_rank)
    return TriageResult(
        risk_signals=tuple(signal for _, signal in hits),
        hit_rule_ids=_unique(r.rule_id for r, _ in hits),
        floor_rule_ids=_unique(r.rule_id for r, _ in hits if r.floor is not None),
        floor=floor,
        action=final.action,
        rule_version=catalogue.rule_version,
        approval_status=catalogue.approval_status,
        context_question_ids=_unique(q for r, _ in hits for q in r.context_question_ids),
        limit_codes=tuple(limits),
    )


def context_questions(inputs: TriageInputs, catalogue: TriageCatalogue) -> tuple[str, ...]:
    return evaluate(inputs, catalogue).context_question_ids


def _unique(items: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(items))


def _evaluate_rule(rule: TriageRule, inputs: TriageInputs) -> tuple[list[RiskSignal], list[str]]:
    if rule.kind == "FACT_STATE":
        return _fact_state(rule, inputs.views), []
    if rule.kind == "BMI_CONTEXT":
        return _bmi_context(rule, inputs.views), []
    if rule.kind == "LAB_BELOW_REFERENCE":
        return _lab_below_reference(rule, inputs.lab_values)
    if rule.kind == "LAB_EQUALS":
        return _lab_equals(rule, inputs.lab_values), []
    raise ValueError(f"unknown rule kind {rule.kind}")


def _fact_state(rule: TriageRule, views: Mapping[str, ConceptView]) -> list[RiskSignal]:
    assert rule.concept_code is not None
    view = views.get(rule.concept_code)
    if view is None or view.state not in rule.match_states:
        return []
    return [RiskSignal(rule.signal, rule.concept_code, rule.rule_id)]


def _bmi_context(rule: TriageRule, views: Mapping[str, ConceptView]) -> list[RiskSignal]:
    assert rule.concept_code is not None
    view = views.get(rule.concept_code)
    if view is None or view.state is not FieldState.KNOWN_POSITIVE:
        return []
    cutoff = rule.parameters.get("bmi_context_cutoff")
    numbers = [float(v) for v in view.values() if isinstance(v, int | float)]
    # With no cut-off supplied, any reported BMI asks for context. BMI is never read alone.
    if cutoff is None or any(number >= float(cutoff) for number in numbers):
        return [RiskSignal(rule.signal, rule.concept_code, rule.rule_id)]
    return []


def _lab_below_reference(
    rule: TriageRule, lab_values: tuple[LabValue, ...]
) -> tuple[list[RiskSignal], list[str]]:
    limits: dict[str, dict[str, float | str]] = rule.parameters.get("reference_lower_limits", {})
    signals: list[RiskSignal] = []
    not_compared = False
    for lab in lab_values:
        limit = limits.get(lab.test_code)
        if limit is None or limit["unit"] != lab.unit:
            not_compared = True  # never convert units to make a comparison (AC-15.2)
            continue
        if lab.value < float(limit["lower_limit"]) and all(
            s.source_field != lab.test_code for s in signals
        ):
            signals.append(RiskSignal(rule.signal, lab.test_code, rule.rule_id))
    return signals, (["LAB_REFERENCE_LIMITS_NOT_SUPPLIED"] if not_compared else [])


def _lab_equals(rule: TriageRule, lab_values: tuple[LabValue, ...]) -> list[RiskSignal]:
    signals: list[RiskSignal] = []
    for lab in lab_values:
        matches = lab.test_code in rule.test_codes and lab.value == rule.equals
        if matches and all(s.source_field != lab.test_code for s in signals):
            signals.append(RiskSignal(rule.signal, lab.test_code, rule.rule_id))
    return signals
