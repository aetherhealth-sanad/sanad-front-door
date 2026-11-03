"""Opaque session tokens of 256 bits, stored hashed (API design section 2)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from sanad_api.auth.models import SessionToken
from sanad_api.vocab import Role


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(
    db: Session,
    *,
    role: Role,
    now: datetime,
    ttl_seconds: int,
    case_id: str | None = None,
    account_id: str | None = None,
) -> tuple[str, SessionToken]:
    token = secrets.token_urlsafe(32)
    row = SessionToken(
        token_hash=hash_token(token),
        role=role.value,
        case_id=case_id,
        account_id=account_id,
        created_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds),
        ended_at=None,
    )
    db.add(row)
    return token, row


def active_session(db: Session, token: str, now: datetime) -> SessionToken | None:
    row = db.get(SessionToken, hash_token(token))
    if row is None or row.ended_at is not None or row.expires_at <= now:
        return None
    return row


def end_case_sessions(db: Session, case_id: str, now: datetime) -> None:
    from sanad_api.navigation.service import purge_session_navigation

    for row in db.query(SessionToken).filter(
        SessionToken.case_id == case_id, SessionToken.ended_at.is_(None)
    ):
        purge_session_navigation(db, row.token_hash)
        row.ended_at = now
