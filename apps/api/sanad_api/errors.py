"""One error body for the whole API (API design section 5).

`message` is fixed text chosen by `code`. `details` carries codes only. Neither ever repeats a
submitted value, which is why FastAPI's default 422 handler is replaced (AC-02.5, INV-03).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("sanad.errors")


class ErrorCode(StrEnum):
    BAD_REQUEST = "BAD_REQUEST"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ROLE_NOT_ALLOWED = "ROLE_NOT_ALLOWED"
    CONSENT_REQUIRED = "CONSENT_REQUIRED"
    GATE_DENIED = "GATE_DENIED"
    SPOUSE_SHARE_NOT_AVAILABLE = "SPOUSE_SHARE_NOT_AVAILABLE"
    NOT_FOUND = "NOT_FOUND"
    INVALID_TRANSITION = "INVALID_TRANSITION"
    CASE_VERSION_CONFLICT = "CASE_VERSION_CONFLICT"
    CONSENT_VERSION_OUTDATED = "CONSENT_VERSION_OUTDATED"
    DRAFT_NOT_CURRENT = "DRAFT_NOT_CURRENT"
    REPORT_NOT_RELEASED = "REPORT_NOT_RELEASED"
    IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED"
    BLOCKING_ITEMS_REMAIN = "BLOCKING_ITEMS_REMAIN"
    UPLOAD_TOO_LARGE = "UPLOAD_TOO_LARGE"
    UPLOAD_WRONG_TYPE = "UPLOAD_WRONG_TYPE"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    UPLOAD_SCHEMA_INVALID = "UPLOAD_SCHEMA_INVALID"
    UPLOAD_UNKNOWN_FIELD = "UPLOAD_UNKNOWN_FIELD"
    UPLOAD_NOT_SYNTHETIC = "UPLOAD_NOT_SYNTHETIC"
    UNKNOWN_SAMPLE = "UNKNOWN_SAMPLE"
    REASON_REQUIRED = "REASON_REQUIRED"
    TRIAGE_BELOW_FLOOR = "TRIAGE_BELOW_FLOOR"
    OBSERVATION_INVALID = "OBSERVATION_INVALID"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.BAD_REQUEST: "The request could not be read.",
    ErrorCode.AUTH_REQUIRED: "A valid session is required.",
    ErrorCode.INVALID_CREDENTIALS: "The username or password is not correct.",
    ErrorCode.ROLE_NOT_ALLOWED: "This account cannot use this feature.",
    ErrorCode.CONSENT_REQUIRED: "This step needs your permission first.",
    ErrorCode.GATE_DENIED: "This referral cannot be sent yet.",
    ErrorCode.SPOUSE_SHARE_NOT_AVAILABLE: "Sharing with a spouse or partner is not available.",
    ErrorCode.NOT_FOUND: "Not found.",
    ErrorCode.INVALID_TRANSITION: "This step is not available for the case right now.",
    ErrorCode.CASE_VERSION_CONFLICT: "The case has changed. Reload it and try again.",
    ErrorCode.CONSENT_VERSION_OUTDATED: "The consent text has changed. Read the current version.",
    ErrorCode.DRAFT_NOT_CURRENT: "The draft result is missing or out of date.",
    ErrorCode.REPORT_NOT_RELEASED: "The result has not been released yet.",
    ErrorCode.IDEMPOTENCY_KEY_REUSED: "That retry key was already used for a different request.",
    ErrorCode.BLOCKING_ITEMS_REMAIN: "Some required items are still missing.",
    ErrorCode.UPLOAD_TOO_LARGE: "The file is larger than 256 KB.",
    ErrorCode.UPLOAD_WRONG_TYPE: "The file is not JSON.",
    ErrorCode.VALIDATION_FAILED: "Some fields are missing or not valid.",
    ErrorCode.UPLOAD_SCHEMA_INVALID: "The file does not match the upload template.",
    ErrorCode.UPLOAD_UNKNOWN_FIELD: "The file has a field that the upload template does not allow.",
    ErrorCode.UPLOAD_NOT_SYNTHETIC: "The file must be marked as synthetic data.",
    ErrorCode.UNKNOWN_SAMPLE: "That sample does not exist.",
    ErrorCode.REASON_REQUIRED: "A reason is required for this decision.",
    ErrorCode.TRIAGE_BELOW_FLOOR: "That action is below the draft rule floor for this case.",
    ErrorCode.OBSERVATION_INVALID: "This value has open issues and cannot be confirmed.",
    ErrorCode.RATE_LIMITED: "Too many requests. Try again shortly.",
    ErrorCode.INTERNAL_ERROR: "Something went wrong on the server.",
}

NO_STORE = {"Cache-Control": "no-store"}


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        details: Sequence[str] = (),
        extra: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(code.value)
        self.status_code = status_code
        self.code = code
        self.details = [str(d) for d in details]
        self.extra = dict(extra or {})


def _request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "req-unknown"))


def error_response(
    request: Request,
    status_code: int,
    code: ErrorCode,
    details: Sequence[str] = (),
    extra: Mapping[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "error": {
            "code": code.value,
            "message": MESSAGES[code],
            "details": list(details),
            "request_id": _request_id(request),
        }
    }
    body.update(extra or {})
    return JSONResponse(status_code=status_code, content=body, headers=NO_STORE)


async def _handle_api_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(request, exc.status_code, exc.code, exc.details, exc.extra)


async def _handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Error types only. Locations can hold submitted keys and `input` holds submitted values.
    types = sorted({str(error.get("type", "invalid")) for error in exc.errors()})
    if "json_invalid" in types:
        return error_response(request, 400, ErrorCode.BAD_REQUEST)
    return error_response(request, 422, ErrorCode.VALIDATION_FAILED, types)


_HTTP_CODES = {
    401: ErrorCode.AUTH_REQUIRED,
    403: ErrorCode.ROLE_NOT_ALLOWED,
    404: ErrorCode.NOT_FOUND,
}


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    status = exc.status_code if exc.status_code in _HTTP_CODES else 400
    return error_response(request, status, _HTTP_CODES.get(exc.status_code, ErrorCode.BAD_REQUEST))


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled %s request_id=%s", type(exc).__name__, _request_id(request))
    return error_response(request, 500, ErrorCode.INTERNAL_ERROR)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(Exception, _handle_unexpected)
