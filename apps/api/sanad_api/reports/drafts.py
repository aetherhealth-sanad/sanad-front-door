"""Template drafts (RF-11, PRD-FR-08).

Drafts come from fixed templates, so the same inputs and rule version always give byte-identical
content (AC-11.5). Content holds no IDs or timestamps for the same reason. A draft states what is
known, what is not, why this next step and who approves it, and holds no diagnosis or
probability (AC-11.3, INV-06). A claim without a verified source is labelled insufficient
evidence, and a placeholder source never shows as a citation (AC-11.4, HR-20). A claim backed by
a team-curated passage is labelled TEAM_CURATED, never as verified (RF-22, AC-22.2, AC-22.3).

The clinician summary carries codes, rule IDs and field states, but no answers or lab values,
because it becomes the reviewer summary in a mock referral snapshot (AC-13.4).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from sanad_api.catalogues import Catalogues, Passage, TriageRule
from sanad_api.facts.service import ConceptView, decode_value
from sanad_api.observations.models import Observation
from sanad_api.observations.service import Confirmation, issues_of
from sanad_api.rules_engine.triage import TriageResult
from sanad_api.vocab import DRAFT_LABEL, SCREENING_NOTICE, EntryPath, FieldState, TriageAction

LAB_STATEMENT = "A result below a reference limit does not mean you cannot have children."
PLACEHOLDER_SOURCES = frozenset({"GUIDELINE-TO-BE-REVIEWED"})
NO_RULE_REASON = "No draft rule sets a next step for the information given."
INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
TEAM_CURATED = "TEAM_CURATED"
CURATED_NOTE = "Team-selected source, not reviewed by a clinician"

LIMIT_TEXT: dict[str, str] = {
    "DRAFT_RULES": "These results come from draft rules that no clinician has approved.",
    "SIMULATED_REVIEW": "Any review is simulated. No licensed clinician checks this case.",
    "INFORMATION_INCOMPLETE": (
        "Some information is not known or was not given, so this result is limited."
    ),
    "ITEMS_EXCLUDED": "You chose not to use some items in this assessment.",
    "LAB_VALUES_UNVERIFIED": (
        "Lab values were entered by hand and have not been checked against the original report."
    ),
    "LAB_VALUES_HELD": "Some lab values have open issues and were not used.",
    "LAB_REFERENCE_LIMITS_NOT_SUPPLIED": (
        "Reference limits for lab values have not been supplied yet, so values were not "
        "compared with them."
    ),
    "NO_VERIFIED_EVIDENCE": "No verified source supports these statements yet.",
}


@dataclass(frozen=True)
class DraftInputs:
    case_version: int
    entry_path: EntryPath
    views: Mapping[str, ConceptView]
    excluded_concepts: frozenset[str]
    excluded_item_ids: tuple[str, ...]
    observations: tuple[Observation, ...]
    used_observation_ids: frozenset[str]
    triage: TriageResult
    gatekeeper_status: str
    genetics_support_available: bool


def report_hash(content: Mapping[str, Any]) -> str:
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_content(inputs: DraftInputs, catalogues: Catalogues) -> dict[str, Any]:
    triage = inputs.triage
    rules = {rule.rule_id: rule for rule in catalogues.triage.rules}
    unknown = _unknown(inputs, catalogues)
    observations = [
        _observation_entry(row, row.observation_id in inputs.used_observation_ids)
        for row in inputs.observations
    ]
    evidence = [_evidence(rules[rule_id], catalogues) for rule_id in triage.hit_rule_ids]
    used_labs = any(entry["used_in_assessment"] for entry in observations)
    held_labs = any(
        entry["confirmation_status"] != Confirmation.CONFIRMED_BY_USER for entry in observations
    )

    limit_codes = ["DRAFT_RULES", "SIMULATED_REVIEW"]
    limit_codes += ["INFORMATION_INCOMPLETE"] if unknown else []
    limit_codes += ["ITEMS_EXCLUDED"] if inputs.excluded_item_ids else []
    limit_codes += ["LAB_VALUES_UNVERIFIED"] if used_labs else []
    limit_codes += ["LAB_VALUES_HELD"] if held_labs else []
    limit_codes += list(triage.limit_codes)
    # A team-curated source is not a verified one, so the limit stays (AC-22.3).
    if any(entry["status"] != "SUPPORTED" for entry in evidence):
        limit_codes.append("NO_VERIFIED_EVIDENCE")

    explanations = [rules[rule_id].patient_explanation for rule_id in triage.hit_rule_ids]
    if not triage.floor_rule_ids:
        explanations.append(NO_RULE_REASON)

    content: dict[str, Any] = {
        "case_version": inputs.case_version,
        "entry_path": inputs.entry_path.value,
        "draft_label": DRAFT_LABEL,
        "screening_notice": SCREENING_NOTICE,
        "rule_version": triage.rule_version,
        "rule_approval_status": triage.approval_status,
        "gatekeeper_status": inputs.gatekeeper_status,
        "risk_signals": [
            {
                "code": s.code,
                "source_field": s.source_field,
                "status": s.status,
                "rule_id": s.rule_id,
            }
            for s in triage.risk_signals
        ],
        "triage_proposal": {
            "action": triage.action.value,
            "floor": triage.floor.value if triage.floor else None,
            "rule_ids": list(triage.floor_rule_ids),
            "rule_version": triage.rule_version,
            "approval_status": triage.approval_status,
        },
        "known": _known(inputs, catalogues),
        "unknown": unknown,
        "excluded_items": list(inputs.excluded_item_ids),
        "observations": observations,
        "limits": [{"code": code, "text": LIMIT_TEXT[code]} for code in limit_codes],
        "evidence": evidence,
        "required_statements": [LAB_STATEMENT] if used_labs else [],
        "next_step_label": catalogues.triage.action_labels[triage.action],
        "why_next_step": " ".join(explanations),
        "genetics_support_available": inputs.genetics_support_available,
        "edited_by_reviewer": False,
    }
    content["clinician_summary"] = clinician_summary(content)
    return content


def apply_reviewer_edit(
    content: Mapping[str, Any],
    *,
    case_version: int,
    triage_action: str | None,
    summary: str | None,
    catalogues: Catalogues,
) -> dict[str, Any]:
    edited = json.loads(json.dumps(content))
    edited["case_version"] = case_version
    edited["edited_by_reviewer"] = True
    if triage_action is not None and triage_action != edited["triage_proposal"]["action"]:
        edited["triage_proposal"]["action"] = triage_action
        edited["next_step_label"] = catalogues.triage.action_labels[TriageAction(triage_action)]
        edited["why_next_step"] = "A simulated reviewer changed the suggested next step."
    edited["clinician_summary"] = summary if summary is not None else clinician_summary(edited)
    return edited


def clinician_summary(content: Mapping[str, Any]) -> str:
    proposal = content["triage_proposal"]
    signals = ", ".join(f"{s['code']} ({s['source_field']})" for s in content["risk_signals"])
    unknown = ", ".join(f"{u['concept_code']} ({u['state']})" for u in content["unknown"])
    floor_rules = f" from {', '.join(proposal['rule_ids'])}" if proposal["rule_ids"] else ""
    used = sum(1 for o in content["observations"] if o["used_in_assessment"])
    held = sum(
        1
        for o in content["observations"]
        if o["confirmation_status"] != Confirmation.CONFIRMED_BY_USER
    )
    return " ".join(
        [
            f"{DRAFT_LABEL}. {SCREENING_NOTICE}.",
            f"Rules {proposal['rule_version']}, {proposal['approval_status']}.",
            f"Signals: {signals or 'none'}.",
            f"Rule floor: {proposal['floor'] or 'none'}{floor_rules}.",
            f"Proposed action: {proposal['action']}.",
            f"Not known: {unknown or 'none'}.",
            f"Excluded by the user: {', '.join(content['excluded_items']) or 'none'}.",
            f"Lab values: {used} confirmed and used, {held} held for confirmation.",
            "Evidence: no verified source is available yet.",
        ]
    )


def _known(inputs: DraftInputs, catalogues: Catalogues) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for code in catalogues.concepts:
        if code in inputs.excluded_concepts:
            continue
        for fact in inputs.views[code].known:
            entries.append(
                {
                    "concept_code": code,
                    "value": decode_value(fact),
                    "unit": fact.unit,
                    "polarity": fact.polarity,
                    "temporal_status": fact.temporal_status,
                    "source_type": fact.source_type,
                    "verification_status": fact.verification_status,
                }
            )
    return entries


def _unknown(inputs: DraftInputs, catalogues: Catalogues) -> list[dict[str, str]]:
    asked = {question.concept_code for question in catalogues.questions.questions}
    entries: list[dict[str, str]] = []
    for code in catalogues.concepts:
        if code in inputs.excluded_concepts:
            continue
        state = inputs.views[code].state
        listed = state in (FieldState.UNKNOWN, FieldState.DECLINED, FieldState.CONFLICTING) or (
            state is FieldState.NOT_ASKED and code in asked
        )
        if listed:
            entries.append({"concept_code": code, "state": state.value})
    return entries


def _observation_entry(row: Observation, used: bool) -> dict[str, Any]:
    return {
        "test_code": row.test_code,
        "value": row.value,
        "unit": row.unit,
        "collected_on": row.collected_on,
        "reference_source": row.reference_source,
        "source": row.source,
        "confirmation_status": row.confirmation_status,
        "issues": issues_of(row),
        "used_in_assessment": used,
    }


def curated_passages(rule: TriageRule, catalogues: Catalogues) -> list[Passage]:
    """The rule's TEAM_CURATED passages that exist, still match their hash and match the hash
    pinned in the rule (AC-22.2). Anything else is treated as no source."""
    found: list[Passage] = []
    for ref in rule.evidence_refs:
        if ref.verification != TEAM_CURATED or ref.passage_id is None:
            continue
        passage = catalogues.passage(ref.passage_id)
        if passage is not None and passage.content_sha256 == ref.content_sha256:
            found.append(passage)
    return found


def citation_of(passage: Passage) -> dict[str, Any]:
    return {
        "source_id": passage.source_id,
        "version": passage.source_version,
        "passage_id": passage.passage_id,
        "title": passage.title,
        "locator": passage.locator,
        "url": passage.url,
        "license": passage.license,
        "excerpt": passage.excerpt,
        "review_status": TEAM_CURATED,
        "review_note": CURATED_NOTE,
    }


def _evidence(rule: TriageRule, catalogues: Catalogues) -> dict[str, Any]:
    verified = [
        ref
        for ref in rule.evidence_refs
        if ref.verification == "VERIFIED" and ref.source_id not in PLACEHOLDER_SOURCES
    ]
    if verified:
        ref = verified[0]
        return {
            "claim_id": f"CLAIM-{rule.rule_id}",
            "rule_id": rule.rule_id,
            "status": "SUPPORTED",
            "citation": {"source_id": ref.source_id, "version": ref.version},
        }
    curated = curated_passages(rule, catalogues)
    if curated:
        # A team-chosen source is shown as such, never as SUPPORTED (AC-22.3).
        return {
            "claim_id": f"CLAIM-{rule.rule_id}",
            "rule_id": rule.rule_id,
            "status": TEAM_CURATED,
            "citation": citation_of(curated[0]),
        }
    return {
        "claim_id": f"CLAIM-{rule.rule_id}",
        "rule_id": rule.rule_id,
        "status": INSUFFICIENT_EVIDENCE,
        "citation": None,
    }
