"""Which items count towards the assessment (RF-16, OD-08).

An excluded item keeps its facts and their states. Its concepts are simply not passed to the
rules or the drafts. A genetics result is listed only when it exists and its consent holds.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from sanad_api.catalogues import Catalogues
from sanad_api.consent.service import is_active
from sanad_api.facts.models import EvidenceSelection, Fact


@dataclass(frozen=True)
class EvidenceItemView:
    item_id: str
    kind: str
    use: bool
    consent_valid: bool
    concept_codes: tuple[str, ...]

    @property
    def used_in_assessment(self) -> bool:
        return self.use and self.consent_valid


def _all_items(
    db: Session, case_id: str, facts: Sequence[Fact], catalogues: Catalogues
) -> list[EvidenceItemView]:
    """Every item that has at least one fact in the case, visible or not."""
    present = {f.concept_code for f in facts}
    chosen = {
        row.item_id: row.use
        for row in db.query(EvidenceSelection).filter(EvidenceSelection.case_id == case_id)
    }
    items: list[EvidenceItemView] = []
    for item_id, item in catalogues.questions.evidence_items.items():
        codes = tuple(
            code
            for code, concept in catalogues.questions.concepts.items()
            if concept.evidence_item == item_id
        )
        if not present.intersection(codes):
            continue
        consent_valid = all(is_active(db, case_id, scope) for scope in item.requires_scopes)
        use = chosen.get(item_id, item.default_use)
        items.append(EvidenceItemView(item_id, item.kind, use, consent_valid, codes))
    return items


def evidence_items(
    db: Session, case_id: str, facts: Sequence[Fact], catalogues: Catalogues
) -> list[EvidenceItemView]:
    """The items the user can choose from. An item whose consent is not valid stays hidden
    (AC-16.3)."""
    return [item for item in _all_items(db, case_id, facts, catalogues) if item.consent_valid]


def excluded_concepts(
    db: Session, case_id: str, facts: Sequence[Fact], catalogues: Catalogues
) -> set[str]:
    """Concepts kept out of signals and drafts: the user excluded their item, or its consent
    is not valid. Concepts with no facts yet are not excluded, so their questions are asked."""
    return {
        code
        for item in _all_items(db, case_id, facts, catalogues)
        if not item.used_in_assessment
        for code in item.concept_codes
    }
