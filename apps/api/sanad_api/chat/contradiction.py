"""Does a chat proposal disagree with an answer the case already holds? (RF-30, `PROPOSED`)

The model never sees the earlier answer (AC-21.9). This module compares the proposal with the
case's current known facts on the server, after the strict validator, with plain code. It
decides nothing: it only tells the user that confirming would change an earlier answer, so the
change is never silent. It writes nothing, and it never says which answer is right.

It compares one field with itself only. Contradictions across different fields (for example a
"no" to one question and a "yes" to a related one) are not checked: deciding which fields
contradict each other is a clinical rule (product spec §3.2).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from sanad_api.catalogues import ConceptDef, QuestionDef
from sanad_api.facts.models import Fact
from sanad_api.facts.service import build_view, decode_value, from_value
from sanad_api.model_adapter.intake_extract import Proposal, echo_label


class Change(StrEnum):
    VALUE_DIFFERS = "VALUE_DIFFERS"  # yes against no, another option or another number
    TIME_DIFFERS = "TIME_DIFFERS"  # the same yes, current against past (MIC-AC-03)
    BECOMES_UNKNOWN = "BECOMES_UNKNOWN"  # a known answer against not sure or prefer not to say


@dataclass(frozen=True)
class Earlier:
    echo_label: str
    source_type: str
    change: Change


@dataclass(frozen=True)
class Contradiction:
    question_id: str
    earlier: tuple[Earlier, ...]

    @property
    def changes(self) -> list[str]:
        return sorted({item.change.value for item in self.earlier})


def _earlier_label(question: QuestionDef, concept: ConceptDef, fact: Fact) -> str:
    value = decode_value(fact)
    shown = Proposal(question.question_id, "ANSWERED", value, fact.temporal_status)
    return echo_label(question, concept, shown)


def _change(proposal: Proposal, concept_code: str, concept: ConceptDef, fact: Fact) -> Change:
    if proposal.choice != "ANSWERED" or proposal.value is None:
        return Change.BECOMES_UNKNOWN
    wanted = from_value(concept_code, concept, proposal.value, proposal.temporal_status)
    same_value = fact.state == wanted.state.value and fact.value_json == json.dumps(wanted.value)
    return Change.TIME_DIFFERS if same_value else Change.VALUE_DIFFERS


def _same(proposal: Proposal, concept_code: str, concept: ConceptDef, fact: Fact) -> bool:
    if proposal.choice != "ANSWERED" or proposal.value is None:
        return False  # the facts compared here are all known, so an opt-out always differs
    wanted = from_value(concept_code, concept, proposal.value, proposal.temporal_status)
    temporal = wanted.temporal_status.value if wanted.temporal_status else None
    return (fact.state, fact.value_json, fact.temporal_status) == (
        wanted.state.value,
        json.dumps(wanted.value),
        temporal,
    )


def check(
    proposal: Proposal,
    question: QuestionDef,
    concept: ConceptDef,
    facts: Sequence[Fact],
) -> Contradiction | None:
    """The earlier known answers that confirming `proposal` would contradict, or None.

    Not asked, not sure and prefer not to answer are not earlier answers: replacing them is new
    information, not a contradiction. An earlier answer equal to the proposal is not listed.
    """
    code = question.concept_code
    view = build_view(code, facts)
    earlier = tuple(
        Earlier(
            echo_label=_earlier_label(question, concept, fact),
            source_type=fact.source_type,
            change=_change(proposal, code, concept, fact),
        )
        for fact in view.known
        if not _same(proposal, code, concept, fact)
    )
    return Contradiction(question.question_id, earlier) if earlier else None
