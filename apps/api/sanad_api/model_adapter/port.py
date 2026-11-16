"""The port every model adapter implements, and the values that cross it.

The envelope follows PRD 4.7.2: a fixed task, a fixed schema and prompt version, one deadline
and a finite number of attempts. It carries no case ID and no patient identifier, because
nothing an adapter receives needs to identify a person (data minimisation, NFR-01).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

from sanad_api.observability import LangfuseTelemetry


class ModelStatus(StrEnum):
    OK = "OK"
    DISABLED = "DISABLED"
    TIMEOUT = "TIMEOUT"
    UNAVAILABLE = "UNAVAILABLE"
    CONTENT_FILTERED = "CONTENT_FILTERED"
    REFUSED = "REFUSED"
    OUTPUT_INVALID = "OUTPUT_INVALID"


@dataclass(frozen=True)
class TaskEnvelope:
    request_id: str
    task_id: str
    purpose: str
    schema_version: str
    prompt_version: str
    question_catalogue_version: str
    timeout_ms: int
    max_attempts: int


@dataclass(frozen=True)
class ModelRequest:
    envelope: TaskEnvelope
    system_prompt: str
    user_content: str
    schema_name: str
    json_schema: dict[str, Any]


@dataclass(frozen=True)
class ModelResult:
    """`content` is raw JSON text from the model. It is untrusted until a task validates it."""

    status: ModelStatus
    content: str | None
    attempts: int
    elapsed_ms: int
    error_code: str | None = None
    input_tokens: int | None = None  # as reported by the provider (AC-23.8)
    output_tokens: int | None = None


class ModelAdapter(Protocol):
    """A provider. `provider` and `model_id` are codes for the trace. `label` is shown to users
    next to anything the model produced, so it must name the provider honestly."""

    provider: str
    model_id: str
    label: str

    @property
    def enabled(self) -> bool: ...

    def complete_json(self, request: ModelRequest) -> ModelResult: ...


def run_safely(adapter: ModelAdapter, request: ModelRequest) -> ModelResult:
    """An adapter bug must fail closed to the task's fallback, and must not log the request."""
    with LangfuseTelemetry.model_generation(
        task_id=request.envelope.task_id,
        provider=adapter.provider,
        model_id=adapter.model_id,
        prompt_version=request.envelope.prompt_version,
        schema_version=request.envelope.schema_version,
    ) as gen:
        try:
            result = adapter.complete_json(request)
        except Exception as error:  # any failure means "no model result"
            logging.getLogger("sanad.model").error("model adapter failed: %s", type(error).__name__)
            result = ModelResult(ModelStatus.UNAVAILABLE, None, 0, 0, "ADAPTER_ERROR")
        LangfuseTelemetry.finish_model_generation(
            gen,
            status=result.status.value,
            attempts=result.attempts,
            elapsed_ms=result.elapsed_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            error_code=result.error_code,
        )
        return result
