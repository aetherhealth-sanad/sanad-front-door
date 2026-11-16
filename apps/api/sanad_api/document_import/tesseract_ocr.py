"""A local OCR engine: the Tesseract command-line program (T-60 baseline engine).

The program runs on this machine as a child process. The page goes to it on standard input and
the words come back on standard output, so nothing touches the disk or the network. Tesseract is
a system package (`brew install tesseract`, `apt-get install tesseract-ocr`), not a Python one.
"""

from __future__ import annotations

import csv
import io
import shutil
import subprocess
from typing import TYPE_CHECKING

from sanad_api.document_import.intake import Rejected
from sanad_api.document_import.layout import merge_words
from sanad_api.document_import.model import Fragment, RejectReason
from sanad_api.document_import.prepare import straighten

if TYPE_CHECKING:
    from PIL.Image import Image

TIMEOUT_SECONDS = 60
# Page segmentation 4: one column of text of variable sizes. It keeps table rows as lines.
PAGE_SEGMENTATION = "4"


class TesseractEngine:
    def __init__(self, binary: str | None = None) -> None:
        found = binary or shutil.which("tesseract")
        if found is None:
            raise Rejected(RejectReason.OCR_UNAVAILABLE)
        self._binary = found
        version = subprocess.run(
            [found, "--version"], capture_output=True, text=True, timeout=TIMEOUT_SECONDS
        )
        first = (version.stdout or version.stderr).splitlines()[0].split()
        self.engine_id = f"tesseract-{first[1] if len(first) > 1 else 'unknown'}"

    @property
    def enabled(self) -> bool:
        return True

    def read(self, image: Image) -> list[Fragment]:
        buffer = io.BytesIO()
        straighten(image.convert("RGB")).save(buffer, format="PNG")
        try:
            done = subprocess.run(
                [self._binary, "stdin", "stdout", "--psm", PAGE_SEGMENTATION, "-l", "eng", "tsv"],
                input=buffer.getvalue(),
                capture_output=True,
                timeout=TIMEOUT_SECONDS,
                check=True,
            )
        except (subprocess.SubprocessError, OSError) as error:
            raise Rejected(RejectReason.DOCUMENT_UNREADABLE) from error
        words = []
        for row in csv.DictReader(io.StringIO(done.stdout.decode("utf-8")), delimiter="\t"):
            text, confidence = (row.get("text") or "").strip(), float(row.get("conf") or -1)
            if not text or confidence < 0:
                continue
            left, top = float(row["left"]), float(row["top"])
            words.append(
                Fragment(
                    text,
                    left,
                    left + float(row["width"]),
                    top,
                    top + float(row["height"]),
                    confidence / 100,
                )
            )
        return merge_words(words)
