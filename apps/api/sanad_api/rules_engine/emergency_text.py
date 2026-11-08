"""Emergency check on typed text, stage 2a (S0b, PRD-FR-03, PRD 4.7.1).

Code only, no model. It runs on every typed message before any input check can discard it and
before any model call (NFR-19, NFR-22). Each rule restates one existing draft trigger as word
groups and fires when the text holds a word from every group. Negation is ignored on purpose.
The patterns are `CLINICAL_TBD` and labelled simulated (CC-012).
"""

from __future__ import annotations

import re
import unicodedata

from sanad_api.catalogues import EmergencyTextCatalogue
from sanad_api.rules_engine.emergency import EmergencyResult

_WORD = re.compile(r"[a-z]+")


def words(text: str) -> frozenset[str]:
    return frozenset(_WORD.findall(unicodedata.normalize("NFKC", text).casefold()))


def scan_text(text: str, catalogue: EmergencyTextCatalogue) -> EmergencyResult:
    found = words(text)
    fired = tuple(
        rule.rule_id
        for rule in catalogue.rules
        if all(found.intersection(group) for group in rule.all_of)
    )
    return EmergencyResult(bool(fired), fired, catalogue.catalogue_version)
