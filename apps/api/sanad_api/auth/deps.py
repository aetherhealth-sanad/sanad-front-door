"""Checks 1 and 2 of the API design's order of checks: a valid token, then an allowed role.

They run as dependencies, before the body is validated, so a bad body never tells an
unauthorised caller anything (API design section 2).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from sanad_api.auth.tokens import active_session
from sanad_api.clock import Clock
from sanad_api.deps import get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.vocab import Role


@dataclass(frozen=True)
class AuthContext:
    role: Role
    token_hash: str
    case_id: str | None
    account_id: str | None

    @property
    def actor(self) -> str:
        """Actor label for audit entries: the role, and the demo account for staff."""
        return self.role.value if self.account_id is None else f"{self.role}:{self.account_id}"


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    token = token.strip()
    return token if scheme.lower() == "bearer" and token else None


def get_auth(
    request: Request, db: Session = Depends(get_db), clock: Clock = Depends(get_clock)
) -> AuthContext:
    token = bearer_token(request)
    row = active_session(db, token, clock.now()) if token else None
    if row is None:
        raise ApiError(401, ErrorCode.AUTH_REQUIRED)
    return AuthContext(
        role=Role(row.role),
        token_hash=row.token_hash,
        case_id=row.case_id,
        account_id=row.account_id,
    )


def require_roles(*roles: Role) -> Callable[[AuthContext], AuthContext]:
    def dependency(auth: AuthContext = Depends(get_auth)) -> AuthContext:
        if auth.role not in roles:
            raise ApiError(403, ErrorCode.ROLE_NOT_ALLOWED)
        return auth

    return dependency


require_patient = require_roles(Role.PATIENT)
require_reviewer = require_roles(Role.REVIEWER)
require_mock_facility = require_roles(Role.MOCK_FACILITY)
require_staff = require_roles(Role.REVIEWER, Role.MOCK_FACILITY)
