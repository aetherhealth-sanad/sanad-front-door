"""Staff sign-in and sign-out, and the Quick-exit session end (API design sections 6.1, 6.6)."""

from __future__ import annotations

import hmac
import json
from datetime import datetime
from typing import Any, Literal
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.auth.deps import AuthContext, require_staff
from sanad_api.auth.models import SessionToken
from sanad_api.auth.rate_limit import rate_limited
from sanad_api.auth.tokens import active_session, hash_token, issue_session
from sanad_api.cases.models import Case
from sanad_api.clock import Clock
from sanad_api.config import MOCK_FACILITY_USERNAME, REVIEWER_USERNAME, Settings
from sanad_api.deps import get_clock, get_db, get_settings
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.vocab import Role

router = APIRouter(tags=["auth"])

MAX_BEACON_BYTES = 4096


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


class LoginOut(BaseModel):
    token: str
    role: Literal["REVIEWER", "MOCK_FACILITY"]
    expires_at: datetime


@router.post("/auth/login", response_model=LoginOut, dependencies=[Depends(rate_limited("login"))])
def login(
    body: LoginIn,
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Seeded demo accounts. Passwords come from the environment, never from the repository."""
    accounts = {
        REVIEWER_USERNAME: (Role.REVIEWER, settings.reviewer_password),
        MOCK_FACILITY_USERNAME: (Role.MOCK_FACILITY, settings.mock_facility_password),
    }
    role, expected = accounts.get(body.username, (None, None))
    supplied = body.password.encode("utf-8")
    matches = expected is not None and hmac.compare_digest(supplied, expected.encode("utf-8"))
    if role is None or not matches:
        raise ApiError(401, ErrorCode.INVALID_CREDENTIALS)  # one answer for every failure
    token, row = issue_session(
        db,
        role=role,
        now=clock.now(),
        ttl_seconds=settings.staff_token_ttl_seconds,
        account_id=body.username,
    )
    db.commit()
    return {"token": token, "role": role.value, "expires_at": row.expires_at}


@router.post("/auth/logout", status_code=204)
def logout(
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> Response:
    row = db.get(SessionToken, auth.token_hash)
    if row is not None:
        row.ended_at = clock.now()
        db.commit()
    return Response(status_code=204)


async def _raw_body(request: Request) -> bytes:
    return await request.body()


def _token_from(body: bytes) -> str | None:
    """Beacons cannot set an Authorization header, so the token comes in the body (G1)."""
    if not body or len(body) > MAX_BEACON_BYTES:
        return None
    text = body.decode("utf-8", errors="ignore")
    token: object = None
    try:
        parsed = json.loads(text)
        token = parsed.get("session_token") if isinstance(parsed, dict) else None
    except ValueError:
        values = parse_qs(text).get("session_token", [])
        token = values[0] if values else None
    return token if isinstance(token, str) and 0 < len(token) <= 128 else None


@router.post("/session/end", status_code=204)
def end_session(
    body: bytes = Depends(_raw_body),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> Response:
    """Always 204, so it cannot test whether a token exists. Only SESSION_ENDED is written, and
    the case state and triage do not change (AC-09.5, AC-09.6)."""
    token = _token_from(body)
    now = clock.now()
    if token:
        from sanad_api.navigation.service import purge_session_navigation

        purge_session_navigation(db, hash_token(token))
    row = active_session(db, token, now) if token else None
    if row is not None:
        row.ended_at = now
        case = db.get(Case, row.case_id) if row.case_id else None
        record(
            db,
            AuditType.SESSION_ENDED,
            actor=row.role if row.account_id is None else f"{row.role}:{row.account_id}",
            now=now,
            case_id=case.case_id if case else None,
            case_version=case.case_version if case else None,
        )
    db.commit()
    return Response(status_code=204)
