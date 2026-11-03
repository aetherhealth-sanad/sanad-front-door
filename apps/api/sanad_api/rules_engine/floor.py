"""Triage floor (HR-03, AC-11.6, AC-08.7).

Nothing may sit below the floor set by the rules. The order comes from the catalogue's
`action_rank`, so it is data that a clinician can change, not code.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from sanad_api.vocab import TriageAction

Ranks = Mapping[TriageAction, int]


def highest(actions: Iterable[TriageAction], ranks: Ranks) -> TriageAction | None:
    ordered = sorted(actions, key=lambda action: ranks[action], reverse=True)
    return ordered[0] if ordered else None


def is_below_floor(action: TriageAction, floor: TriageAction | None, ranks: Ranks) -> bool:
    return floor is not None and ranks[action] < ranks[floor]


@dataclass(frozen=True)
class FloorResult:
    action: TriageAction
    floor: TriageAction | None
    overridden: bool


def apply_floor(proposed: TriageAction, floor: TriageAction | None, ranks: Ranks) -> FloorResult:
    """A proposal below the floor is replaced by the floor, and the caller must audit that."""
    if floor is not None and is_below_floor(proposed, floor, ranks):
        return FloorResult(floor, floor, True)
    return FloorResult(proposed, floor, False)
