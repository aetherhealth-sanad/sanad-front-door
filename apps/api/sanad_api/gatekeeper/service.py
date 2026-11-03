"""Decides what is still needed before an assessment can run.

It never invents a value. Only unanswered and CONFLICTING items block. UNKNOWN and DECLINED let
the user continue, and the result lists them as limits (AC-06.5). On the LAB_ONLY path, intake
items that were never asked do not block: they become NOT_ASKED limits (AC-15.4).
"""

from __future__ import annotations

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from sanad_api.catalogues import QuestionDef
from sanad_api.facts.models import Fact
from sanad_api.facts.service import ConceptView
from sanad_api.vocab import EntryPath, FieldState


class GatekeeperStatus(StrEnum):
    READY_FOR_ASSESSMENT = "READY_FOR_ASSESSMENT"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"
    CONFLICTING_DATA = "CONFLICTING_DATA"


class NeedReason(StrEnum):
    MISSING = "MISSING"
    CONFLICTING = "CONFLICTING"
    CONTEXT = "CONTEXT"
    CLARIFICATION_REQUESTED = "CLARIFICATION_REQUESTED"


@dataclass(frozen=True)
class QuestionNeed:
    question: QuestionDef
    reason: NeedReason
    blocking: bool
    conflicting: tuple[Fact, ...]


@dataclass(frozen=True)
class GatekeeperResult:
    status: GatekeeperStatus
    needs: tuple[QuestionNeed, ...]

    @property
    def blocking_question_ids(self) -> tuple[str, ...]:
        return tuple(need.question.question_id for need in self.needs if need.blocking)


def evaluate(
    *,
    questions: Sequence[QuestionDef],
    views: Mapping[str, ConceptView],
    entry_path: EntryPath,
    excluded_concepts: Collection[str],
    context_question_ids: Collection[str],
    clarification_question_ids: Collection[str],
    include_optional: bool,
) -> GatekeeperResult:
    full_intake = entry_path is EntryPath.FULL_INTAKE
    needs: list[QuestionNeed] = []
    for question in questions:
        if question.concept_code in excluded_concepts:
            continue  # the user chose not to use this item (AC-16.1)
        view = views[question.concept_code]
        if question.question_id in clarification_question_ids:
            needs.append(QuestionNeed(question, NeedReason.CLARIFICATION_REQUESTED, True, ()))
        elif view.state is FieldState.CONFLICTING:
            needs.append(QuestionNeed(question, NeedReason.CONFLICTING, True, view.known))
        elif view.state is FieldState.NOT_ASKED:
            if full_intake and question.question_id in context_question_ids:
                needs.append(QuestionNeed(question, NeedReason.CONTEXT, True, ()))
            elif full_intake and question.required:
                needs.append(QuestionNeed(question, NeedReason.MISSING, True, ()))
            elif include_optional:
                needs.append(QuestionNeed(question, NeedReason.MISSING, False, ()))
    if any(need.reason is NeedReason.CONFLICTING for need in needs):
        status = GatekeeperStatus.CONFLICTING_DATA
    elif any(need.blocking for need in needs):
        status = GatekeeperStatus.NEEDS_INFORMATION
    else:
        status = GatekeeperStatus.READY_FOR_ASSESSMENT
    return GatekeeperResult(status, tuple(needs))
