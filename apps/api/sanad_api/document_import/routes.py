"""Read-only local OCR for synthetic semen reports (T-60 / RF-29).

The endpoint is intentionally *not* an observation-writing endpoint: a successful response
is an unconfirmed draft. No file is kept by Sanad, no text or measurements are logged, and
nothing reaches triage until the patient uses the separate observation-confirmation flow.

Use a raw application/pdf / image/* request body, not multipart UploadFile: the latter may
spool sensitive content to a temporary disk file before the handler is called.
"""

from __future__ import annotations

import shutil
from functools import lru_cache
from importlib.util import find_spec
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.clock import Clock
from sanad_api.deps import get_clock
from sanad_api.document_import.extract import extract
from sanad_api.document_import.fields import load_lab_catalogue
from sanad_api.document_import.intake import Limits
from sanad_api.document_import.model import RejectReason
from sanad_api.document_import.ocr import DisabledOcr, OcrEngine
from sanad_api.errors import ApiError, ErrorCode

router = APIRouter(tags=["document-import"])
_OCR_LOCK = Lock()  # protect shared OCR-engine instance; requests are synthetic and small


@lru_cache(maxsize=1)
def _local_engine() -> OcrEngine:
    """Optional CPU-only OCR, initialized once; text PDFs work with DisabledOcr too."""
    if find_spec("rapidocr") is not None:
        try:
            from sanad_api.document_import.rapid_ocr import RapidOcrEngine

            return RapidOcrEngine()
        except (ImportError, RuntimeError, OSError):
            pass
    if shutil.which("tesseract"):
        from sanad_api.document_import.tesseract_ocr import TesseractEngine

        return TesseractEngine()
    return DisabledOcr()


def _extract_in_worker(
    document: bytes, catalogue: Any, today: Any, limits: Limits
) -> dict[str, Any]:
    # OCR is CPU-heavy: never block the async event loop that serves emergency endpoints.
    with _OCR_LOCK:
        draft = extract(document, catalogue, today, engine=_local_engine(), limits=limits)
    return draft.to_json()


@router.post("/cases/{case_id}/profile/document")
async def read_synthetic_lab_report(
    request: Request,
    pc: PatientCase = Depends(guard(Action.ENTER_OBSERVATION)),
    clock: Clock = Depends(get_clock),
) -> dict[str, Any]:
    """Return OCR draft only; no observation/clinical state is changed.

    Authentication, consent and intake state are checked before this function reads bytes.
    Streaming enforces a fixed 5 MiB cap without relying on untrusted Content-Length.
    """
    del pc  # authorization is enforced by the dependency
    limits = Limits()
    raw_length = request.headers.get("content-length")
    if raw_length and raw_length.isdigit() and int(raw_length) > limits.max_bytes:
        raise ApiError(413, ErrorCode.VALIDATION_FAILED, [RejectReason.DOCUMENT_TOO_LARGE.value])
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limits.max_bytes:
            raise ApiError(
                413, ErrorCode.VALIDATION_FAILED, [RejectReason.DOCUMENT_TOO_LARGE.value]
            )
        chunks.append(chunk)
    if not size:
        raise ApiError(422, ErrorCode.VALIDATION_FAILED, [RejectReason.DOCUMENT_UNREADABLE.value])

    catalogue = load_lab_catalogue(request.app.state.settings.repo_root)
    return await run_in_threadpool(
        _extract_in_worker, b"".join(chunks), catalogue, clock.now().date(), limits
    )
