"""Optional, content-free Langfuse tracing.

Only request route templates, methods, status codes, durations, and whitelisted policy codes are
recorded. Request/response bodies, headers, query strings, case IDs, prompts and health data are
never passed to the Langfuse SDK. Tracing is off unless SANAD_LANGFUSE_ENABLED=true.
"""

from __future__ import annotations

import logging
import re
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any
from urllib.parse import urlsplit

from sanad_api.config import Settings

logger = logging.getLogger("sanad.observability")
_current_span: ContextVar[Any | None] = ContextVar("sanad_langfuse_span", default=None)
_SAFE_CODE = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
_SAFE_ROUTE = re.compile(r"^/[A-Za-z0-9_./{}-]{1,200}$")


def _safe_base_url(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return None
    return value.rstrip("/")


class LangfuseTelemetry:
    """Langfuse wrapper with a strict metadata allowlist and fail-open export behavior."""

    def __init__(self, client: Any | None = None) -> None:
        self._client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> LangfuseTelemetry:
        if not settings.langfuse_enabled:
            return cls()
        base_url = _safe_base_url(settings.langfuse_base_url)
        if not (
            base_url
            and settings.langfuse_public_key
            and settings.langfuse_secret_key
        ):
            logger.warning("Langfuse disabled: explicit enablement needs base URL and credentials")
            return cls()
        try:
            from langfuse import Langfuse

            client = Langfuse(
                public_key=settings.langfuse_public_key,
                secret_key=settings.langfuse_secret_key,
                base_url=base_url,
                tracing_enabled=True,
            )
        except Exception:
            # Missing optional dependency or bad client setup must not affect API startup.
            logger.warning("Langfuse disabled: client initialization failed")
            return cls()
        logger.info("Langfuse metadata tracing enabled for configured self-hosted endpoint")
        return cls(client)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @contextmanager
    def request_span(self, commit_sha: str, *, excluded: bool = False) -> Iterator[Any | None]:
        if self._client is None or excluded:
            yield None
            return
        try:
            safe_version = commit_sha if _SAFE_CODE.fullmatch(commit_sha) else "unversioned"
            manager = self._client.start_as_current_observation(
                as_type="span", name="http.request", version=safe_version
            )
        except Exception:
            # Export/tracing outages are diagnostics only and never change request behavior.
            logger.warning("Langfuse span failed; API behavior is unchanged")
            yield None
            return
        try:
            span = manager.__enter__()
        except Exception:
            logger.warning("Langfuse span start failed; API behavior is unchanged")
            yield None
            return
        token: Token[Any | None] = _current_span.set(span)
        request_error: tuple[Any, Any, Any] | None = None
        try:
            yield span
        except BaseException:
            request_error = sys.exc_info()  # Preserve errors raised by the API request.
            raise
        finally:
            _current_span.reset(token)
            try:
                manager.__exit__(*(request_error or (None, None, None)))
            except Exception:
                logger.warning("Langfuse span end failed; API behavior is unchanged")

    @staticmethod
    def finish_request(
        span: Any | None,
        *,
        method: str,
        route_template: str,
        status_code: int,
        duration_ms: int,
    ) -> None:
        if span is None:
            return
        method_code = (
            method
            if method in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}
            else "OTHER"
        )
        route_code = route_template if _SAFE_ROUTE.fullmatch(route_template) else "unmatched"
        route_segments = route_code.strip("/").split("/")
        if route_segments[:2] == ["api", "cases"] and (
            len(route_segments) < 3 or route_segments[2] != "{case_id}"
        ):
            route_code = "unmatched"
        try:
            span.update(
                metadata={
                    "http.method": method_code,
                    "http.route": route_code,
                    "http.status_code": int(status_code),
                    "http.duration_ms": max(0, int(duration_ms)),
                }
            )
        except Exception:
            logger.warning("Langfuse metadata update failed; API behavior is unchanged")

    @staticmethod
    def record_policy(
        *, event_type: str, decision: str, reason_codes: list[str], policy_version: str | None
    ) -> None:
        span = _current_span.get()
        if span is None:
            return
        # These fields are built from enums/code lists in the audit module. Never pass actor,
        # case_id, request body, answers or free text to telemetry.
        event_code = event_type if event_type in {
            "GATE_EVALUATED", "CONSENT_DENIED", "TRANSITION_DENIED", "SHARE_DENIED"
        } else "POLICY_EVENT"
        decision_code = decision if decision in {"ALLOW", "DENY"} else "DENY"
        clean_reasons = [
            code for code in reason_codes[:12]
            if isinstance(code, str) and code.isascii() and _SAFE_CODE.fullmatch(code)
        ]
        safe_policy_version = (
            policy_version
            if isinstance(policy_version, str) and _SAFE_CODE.fullmatch(policy_version)
            else None
        )
        try:
            span.update(
                metadata={
                    "policy.event": event_code,
                    "policy.decision": decision_code,
                    "policy.reason_codes": clean_reasons,
                    "policy.version": safe_policy_version,
                }
            )
        except Exception:
            logger.warning("Langfuse policy metadata update failed; API behavior is unchanged")

    @staticmethod
    @contextmanager
    def model_generation(
        *,
        task_id: str,
        provider: str,
        model_id: str,
        prompt_version: str,
        schema_version: str,
    ) -> Iterator[Any | None]:
        """Record a content-free Langfuse generation span for token/cost tracking."""
        span = _current_span.get()
        if span is None:
            yield None
            return
        safe_task = task_id if _SAFE_CODE.fullmatch(task_id) else "model.task"
        safe_provider = provider if _SAFE_CODE.fullmatch(provider) else "unknown"
        safe_model = model_id if _SAFE_CODE.fullmatch(model_id) else "unknown"
        safe_prompt = prompt_version if _SAFE_CODE.fullmatch(prompt_version) else "unversioned"
        safe_schema = schema_version if _SAFE_CODE.fullmatch(schema_version) else "unversioned"
        try:
            manager = span.start_as_current_observation(
                as_type="generation",
                name=safe_task,
                model=safe_model,
                version=safe_prompt,
                metadata={
                    "model.provider": safe_provider,
                    "model.schema_version": safe_schema,
                },
            )
            gen = manager.__enter__()
        except Exception:
            logger.warning("Langfuse generation span start failed; API behavior is unchanged")
            yield None
            return
        call_error: tuple[Any, Any, Any] | None = None
        try:
            yield gen
        except BaseException:
            call_error = sys.exc_info()
            raise
        finally:
            try:
                manager.__exit__(*(call_error or (None, None, None)))
            except Exception:
                logger.warning("Langfuse generation span end failed; API behavior is unchanged")

    @staticmethod
    def finish_model_generation(
        gen: Any | None,
        *,
        status: str,
        attempts: int,
        elapsed_ms: int,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        error_code: str | None = None,
    ) -> None:
        if gen is None:
            return
        safe_status = status if _SAFE_CODE.fullmatch(status) else "UNKNOWN"
        safe_error = (
            error_code if isinstance(error_code, str) and _SAFE_CODE.fullmatch(error_code) else None
        )
        usage_details: dict[str, int] = {}
        if input_tokens is not None:
            usage_details["input"] = max(0, int(input_tokens))
        if output_tokens is not None:
            usage_details["output"] = max(0, int(output_tokens))
        metadata: dict[str, Any] = {
            "model.status": safe_status,
            "model.attempts": max(0, int(attempts)),
            "model.elapsed_ms": max(0, int(elapsed_ms)),
        }
        if safe_error is not None:
            metadata["model.error_code"] = safe_error
        try:
            gen.update(
                usage_details=usage_details or None,
                level="DEFAULT" if safe_status == "OK" else "ERROR",
                status_message=safe_error,
                metadata=metadata,
            )
        except Exception:
            logger.warning("Langfuse generation metadata update failed; API behavior is unchanged")

    def shutdown(self) -> None:
        if self._client is None:
            return
        try:
            self._client.shutdown()
        except Exception:
            logger.warning("Langfuse shutdown failed; API shutdown continues")
