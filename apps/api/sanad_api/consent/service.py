"""Scope state, read fresh from the database at the moment of each action (HR-08)."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy.orm import Session

from sanad_api.consent.models import ConsentGrant
from sanad_api.vocab import ConsentScope


class ScopeStatus(StrEnum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"
    MISSING = "MISSING"


def create_scopes(db: Session, case_id: str) -> None:
    """Every scope starts off (AC-03.1)."""
    for scope in ConsentScope:
        db.add(ConsentGrant(case_id=case_id, scope=scope.value, granted=False))


def load_grants(db: Session, case_id: str) -> dict[ConsentScope, ConsentGrant]:
    rows = db.query(ConsentGrant).filter(ConsentGrant.case_id == case_id).all()
    return {ConsentScope(row.scope): row for row in rows}


def is_active(db: Session, case_id: str, scope: ConsentScope) -> bool:
    row = (
        db.query(ConsentGrant)
        .filter(ConsentGrant.case_id == case_id, ConsentGrant.scope == scope.value)
        .one_or_none()
    )
    return row is not None and row.granted


def status_of(grant: ConsentGrant | None) -> ScopeStatus:
    if grant is not None and grant.granted:
        return ScopeStatus.ACTIVE
    if grant is not None and grant.revoked_at is not None:
        return ScopeStatus.REVOKED
    return ScopeStatus.MISSING


def grant(row: ConsentGrant, consent_version: str, now: datetime) -> None:
    row.granted = True
    row.consent_version = consent_version
    row.captured_at = now
    row.revoked_at = None


def revoke(row: ConsentGrant, consent_version: str, now: datetime) -> None:
    row.granted = False
    row.consent_version = consent_version
    row.revoked_at = now
