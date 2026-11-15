"""S2, first choice: read the words a PDF already holds.

A PDF written by software carries its text and the position of every word, and reading that is
exact. OCR runs only on a page that has no usable text layer (AC-27.3). `pdfplumber` is imported
here and nowhere else, so the API still starts when the optional dependency is missing.
"""

from __future__ import annotations

import io
import logging
from typing import Any

from sanad_api.document_import.intake import Limits, Rejected
from sanad_api.document_import.layout import merge_words
from sanad_api.document_import.model import Fragment, RejectReason

# pdfminer, which pdfplumber uses, writes every string of the document to its DEBUG log. Logs
# must hold no document content (INV-03), so its loggers are capped whatever the root level is.
logging.getLogger("pdfminer").setLevel(logging.WARNING)
logging.getLogger("pdfplumber").setLevel(logging.WARNING)

# Fewer letters and digits than this on a page means it has no usable text layer.
MIN_TEXT_CHARS = 20


def read_pdf(document: bytes, limits: Limits) -> list[list[Fragment] | None]:
    """One entry per page: its cells, or `None` when the page needs OCR."""
    try:
        import pdfplumber
    except ImportError as error:  # pragma: no cover - depends on the install
        raise Rejected(RejectReason.DOCUMENT_UNREADABLE) from error
    try:
        with pdfplumber.open(io.BytesIO(document)) as pdf:
            if len(pdf.pages) > limits.max_pages:
                raise Rejected(RejectReason.DOCUMENT_TOO_MANY_PAGES)
            if not pdf.pages:
                raise Rejected(RejectReason.DOCUMENT_UNREADABLE)
            return [_page_cells(page) for page in pdf.pages]
    except Rejected:
        raise
    except Exception as error:  # a damaged or encrypted file; the cause is not repeated
        raise Rejected(RejectReason.DOCUMENT_UNREADABLE) from error


def _page_cells(page: Any) -> list[Fragment] | None:
    words = [
        Fragment(
            text=str(word["text"]),
            x0=float(word["x0"]),
            x1=float(word["x1"]),
            top=float(word["top"]),
            bottom=float(word["bottom"]),
        )
        for word in page.extract_words()
    ]
    usable = sum(ch.isalnum() for word in words for ch in word.text)
    if usable < MIN_TEXT_CHARS:
        return None
    return merge_words(words)
