"""Runtime settings, read from environment variables. Secrets never live in the repository."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REVIEWER_USERNAME = "demo-reviewer"
MOCK_FACILITY_USERNAME = "demo-mock-facility"


def _repo_root() -> Path:
    # apps/api/sanad_api/config.py -> repository root
    return Path(__file__).resolve().parents[3]


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "")
    return int(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./sanad-dev.db"
    repo_root: Path = field(default_factory=_repo_root)
    commit_sha: str = "dev"
    # OD-03: tab lifetime on the client, 24-hour expiry on the server.
    patient_token_ttl_seconds: int = 24 * 60 * 60
    staff_token_ttl_seconds: int = 8 * 60 * 60
    # HR-11: an approval expires. Technical policy, not a clinical deadline (TECH_TBD).
    approval_ttl_seconds: int = 24 * 60 * 60
    # OD-07: mock workflow timer for the delayed flag. Not a clinical deadline.
    delayed_flag_seconds: int = 120
    # Demo account passwords. An unset password disables that sign-in.
    reviewer_password: str | None = None
    mock_facility_password: str | None = None
    cases_per_minute_per_ip: int = 30
    logins_per_minute_per_ip: int = 10

    @classmethod
    def from_env(cls) -> Settings:
        root = os.environ.get("SANAD_REPO_ROOT")
        return cls(
            database_url=os.environ.get("SANAD_DATABASE_URL", cls.database_url),
            repo_root=Path(root) if root else _repo_root(),
            commit_sha=os.environ.get("SANAD_COMMIT_SHA", cls.commit_sha),
            patient_token_ttl_seconds=_int_env(
                "SANAD_PATIENT_TOKEN_TTL_SECONDS", cls.patient_token_ttl_seconds
            ),
            staff_token_ttl_seconds=_int_env(
                "SANAD_STAFF_TOKEN_TTL_SECONDS", cls.staff_token_ttl_seconds
            ),
            approval_ttl_seconds=_int_env("SANAD_APPROVAL_TTL_SECONDS", cls.approval_ttl_seconds),
            delayed_flag_seconds=_int_env("SANAD_DELAYED_FLAG_SECONDS", cls.delayed_flag_seconds),
            reviewer_password=os.environ.get("SANAD_DEMO_REVIEWER_PASSWORD") or None,
            mock_facility_password=os.environ.get("SANAD_DEMO_MOCK_FACILITY_PASSWORD") or None,
            cases_per_minute_per_ip=_int_env(
                "SANAD_CASES_PER_MINUTE_PER_IP", cls.cases_per_minute_per_ip
            ),
            logins_per_minute_per_ip=_int_env(
                "SANAD_LOGINS_PER_MINUTE_PER_IP", cls.logins_per_minute_per_ip
            ),
        )
