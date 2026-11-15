"""Runtime settings, read from environment variables and an optional `.env` file.

Secrets never live in the repository. Copy `apps/api/.env.example` to `apps/api/.env` (which Git
ignores) and fill it in, or set the same variables in the shell. A variable set in the shell wins
over the file. `SANAD_ENV_FILE` points to a different file. Empty values count as unset.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

REVIEWER_USERNAME = "demo-reviewer"
MOCK_FACILITY_USERNAME = "demo-mock-facility"


def _repo_root() -> Path:
    # apps/api/sanad_api/config.py -> repository root
    return Path(__file__).resolve().parents[3]


def default_env_file() -> Path:
    # apps/api/sanad_api/config.py -> apps/api/.env, wherever Uvicorn is started from
    return Path(__file__).resolve().parents[1] / ".env"


def read_env(env_file: Path | None = None) -> dict[str, str]:
    """The `.env` values overlaid by the real environment. `os.environ` is not changed.
    Values are taken literally: `$` in a password is not expanded."""
    path = env_file or Path(os.environ.get("SANAD_ENV_FILE") or default_env_file())
    from_file = dotenv_values(path, interpolate=False) if path.is_file() else {}
    merged = {key: value for key, value in from_file.items() if value is not None}
    merged.update(os.environ)
    return merged


def _str(env: Mapping[str, str], name: str) -> str | None:
    return env.get(name) or None


def _float(env: Mapping[str, str], name: str, default: float) -> float:
    raw = _str(env, name)
    return float(raw) if raw else default


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    raw = env.get(name, "")
    return int(raw) if raw else default


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


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
    reviewer_password: str | None = field(default=None, repr=False)
    mock_facility_password: str | None = field(default=None, repr=False)
    cases_per_minute_per_ip: int = 30
    logins_per_minute_per_ip: int = 10
    # Observability is explicitly opt-in; never infer enablement from credentials alone.
    langfuse_enabled: bool = False
    langfuse_base_url: str | None = None
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    # T4.5, CC-011: the model adapter is off unless an operator turns it on. "disabled" makes
    # no network call. "azure_openai" sends typed chat text to the configured Azure resource.
    model_provider: str = "disabled"
    azure_openai_endpoint: str | None = None
    azure_openai_deployment: str | None = None
    azure_openai_api_key: str | None = field(default=None, repr=False)
    # "api_key" or "entra_id" (DefaultAzureCredential, for example a managed identity).
    azure_openai_auth: str = "api_key"
    # PRD 4.7.2 engineering defaults (TECH_TBD, OQ-32). One deadline covers every attempt.
    model_timeout_ms: int = 12_000
    model_max_attempts: int = 2
    model_max_completion_tokens: int = 800
    model_max_calls_per_case: int = 20  # RF-23 AC-23.7, TECH_TBD
    # RF-25, CC-015: local decision model. Only read when SANAD_MODEL_PROVIDER=laya_local.
    laya_model: str = "convaiinnovations/laya"
    laya_revision: str | None = None  # a pinned commit SHA; required for laya_local
    laya_device: str | None = None  # None lets laya choose (CUDA, MPS, XPU, then CPU)
    decision_min_prob: float = 0.80  # TECH_TBD, set from the RF-23 scorecard
    laya_engine: str = "checkpoint"  # checkpoint or vegaml (AC-25.11, CC-017)
    laya_calibration: Path | None = None  # a save_calibration directory; vegaml only

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> Settings:
        env = read_env(env_file)
        root = _str(env, "SANAD_REPO_ROOT")
        return cls(
            database_url=_str(env, "SANAD_DATABASE_URL") or cls.database_url,
            repo_root=Path(root) if root else _repo_root(),
            commit_sha=_str(env, "SANAD_COMMIT_SHA") or cls.commit_sha,
            patient_token_ttl_seconds=_int(
                env, "SANAD_PATIENT_TOKEN_TTL_SECONDS", cls.patient_token_ttl_seconds
            ),
            staff_token_ttl_seconds=_int(
                env, "SANAD_STAFF_TOKEN_TTL_SECONDS", cls.staff_token_ttl_seconds
            ),
            approval_ttl_seconds=_int(env, "SANAD_APPROVAL_TTL_SECONDS", cls.approval_ttl_seconds),
            delayed_flag_seconds=_int(env, "SANAD_DELAYED_FLAG_SECONDS", cls.delayed_flag_seconds),
            reviewer_password=_str(env, "SANAD_DEMO_REVIEWER_PASSWORD"),
            mock_facility_password=_str(env, "SANAD_DEMO_MOCK_FACILITY_PASSWORD"),
            cases_per_minute_per_ip=_int(
                env, "SANAD_CASES_PER_MINUTE_PER_IP", cls.cases_per_minute_per_ip
            ),
            logins_per_minute_per_ip=_int(
                env, "SANAD_LOGINS_PER_MINUTE_PER_IP", cls.logins_per_minute_per_ip
            ),
            model_provider=_str(env, "SANAD_MODEL_PROVIDER") or cls.model_provider,
            azure_openai_endpoint=_str(env, "SANAD_AZURE_OPENAI_ENDPOINT"),
            azure_openai_deployment=_str(env, "SANAD_AZURE_OPENAI_DEPLOYMENT"),
            azure_openai_api_key=_str(env, "SANAD_AZURE_OPENAI_API_KEY"),
            azure_openai_auth=_str(env, "SANAD_AZURE_OPENAI_AUTH") or cls.azure_openai_auth,
            model_timeout_ms=_int(env, "SANAD_MODEL_TIMEOUT_MS", cls.model_timeout_ms),
            model_max_attempts=_int(env, "SANAD_MODEL_MAX_ATTEMPTS", cls.model_max_attempts),
            model_max_completion_tokens=_int(
                env, "SANAD_MODEL_MAX_COMPLETION_TOKENS", cls.model_max_completion_tokens
            ),
            model_max_calls_per_case=_int(
                env, "SANAD_MODEL_MAX_CALLS_PER_CASE", cls.model_max_calls_per_case
            ),
            laya_model=_str(env, "SANAD_LAYA_MODEL") or cls.laya_model,
            laya_revision=_str(env, "SANAD_LAYA_REVISION"),
            laya_device=_str(env, "SANAD_LAYA_DEVICE"),
            decision_min_prob=_float(env, "SANAD_DECISION_MIN_PROB", cls.decision_min_prob),
            laya_engine=_str(env, "SANAD_LAYA_ENGINE") or cls.laya_engine,
            laya_calibration=(
                Path(cal) if (cal := _str(env, "SANAD_LAYA_CALIBRATION")) else None
            ),
            langfuse_enabled=_bool_env("SANAD_LANGFUSE_ENABLED"),
            langfuse_base_url=os.environ.get("LANGFUSE_BASE_URL") or None,
            langfuse_public_key=os.environ.get("LANGFUSE_PUBLIC_KEY") or None,
            langfuse_secret_key=os.environ.get("LANGFUSE_SECRET_KEY") or None,
        )
