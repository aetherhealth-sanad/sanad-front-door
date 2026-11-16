"""S4: turn loose pieces of text back into rows.

Both text sources give fragments with boxes. A row is the set of fragments that sit on the same
line, ordered left to right. Words that are close together form one cell; a wide gap starts the
next cell.
"""

from __future__ import annotations

from collections.abc import Iterable

from sanad_api.document_import.model import Fragment

# A gap wider than this share of the line height starts a new cell. In the sample document the
# gap between words is under 0.75 of the line height and the gap between cells is over 1.5.
CELL_GAP = 0.9
# Two fragments share a row when their centres differ by less than this share of their height.
ROW_TOLERANCE = 0.5

Row = tuple[Fragment, ...]


def rows(fragments: Iterable[Fragment]) -> list[Row]:
    """Groups fragments into rows, top to bottom, each ordered left to right.

    A fragment joins the row whose rightmost cell is level with it. Comparing with the
    neighbouring cell, not with the whole row, keeps a row together when a photo taken at an
    angle makes the line drift up or down across the page.
    """
    grouped: list[list[Fragment]] = []
    for fragment in sorted(fragments, key=lambda f: f.x0):
        best: tuple[float, list[Fragment]] | None = None
        for row in grouped:
            last = row[-1]
            distance = abs(fragment.centre_y - last.centre_y)
            level = distance <= ROW_TOLERANCE * min(last.height, fragment.height)
            if level and (best is None or distance < best[0]):
                best = (distance, row)
        if best is not None:
            best[1].append(fragment)
        else:
            grouped.append([fragment])
    grouped.sort(key=lambda row: (row[0].centre_y, row[0].x0))
    return [tuple(row) for row in grouped]


def merge_words(words: Iterable[Fragment]) -> list[Fragment]:
    """Joins the words of one cell. Used for a text layer, which gives single words."""
    merged: list[Fragment] = []
    for row in rows(words):
        cell = row[0]
        for word in row[1:]:
            if word.x0 - cell.x1 <= CELL_GAP * max(cell.height, word.height):
                cell = Fragment(
                    text=f"{cell.text} {word.text}",
                    x0=cell.x0,
                    x1=word.x1,
                    top=min(cell.top, word.top),
                    bottom=max(cell.bottom, word.bottom),
                    confidence=min(cell.confidence, word.confidence),
                )
            else:
                merged.append(cell)
                cell = word
        merged.append(cell)
    return merged
