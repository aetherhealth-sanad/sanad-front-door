"""Content-free Langfuse generation telemetry tests (INV-03, AC-23.8)."""

from __future__ import annotations

from typing import Any

from sanad_api.model_adapter.port import (
    ModelRequest,
    ModelResult,
    ModelStatus,
    TaskEnvelope,
    run_safely,
)
from sanad_api.observability import LangfuseTelemetry


class _FakeGeneration:
    def __init__(self, kwargs: dict[str, Any]) -> None:
        self.start_kwargs = kwargs
        self.update_kwargs: dict[str, Any] = {}
        self.exited = False

    def __enter__(self) -> _FakeGeneration:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.exited = True

    def update(self, **kwargs: Any) -> None:
        self.update_kwargs.update(kwargs)


class _FakeSpan:
    def __init__(self) -> None:
        self.generations: list[_FakeGeneration] = []

    def __enter__(self) -> _FakeSpan:
        return self

    def __exit__(self, *_exc: object) -> None:
        pass

    def start_as_current_observation(self, **kwargs: Any) -> _FakeGeneration:
        gen = _FakeGeneration(kwargs)
        self.generations.append(gen)
        return gen

    def update(self, **_kwargs: Any) -> None:
        pass


class _FakeLangfuseClient:
    def __init__(self) -> None:
        self.spans: list[_FakeSpan] = []

    def start_as_current_observation(self, **_kwargs: Any) -> _FakeSpan:
        span = _FakeSpan()
        self.spans.append(span)
        return span


class _FakeAdapter:
    provider = "azure_openai"
    model_id = "gpt-6-luna"
    label = "Azure OpenAI"
    enabled = True

    def __init__(self, reply: ModelResult | Exception) -> None:
        self._reply = reply

    def complete_json(self, _request: ModelRequest) -> ModelResult:
        if isinstance(self._reply, Exception):
            raise self._reply
        return self._reply


def _sample_request() -> ModelRequest:
    return ModelRequest(
        envelope=TaskEnvelope(
            request_id="req-1",
            task_id="intake.extract.v1",
            purpose="EXTRACTION_DRAFT_ONLY",
            schema_version="intake-answer-draft-0.1",
            prompt_version="intake-extract-prompt-0.1",
            question_catalogue_version="questions-draft-0.1",
            timeout_ms=12_000,
            max_attempts=2,
        ),
        system_prompt="SECRET_PROMPT_TEXT",
        user_content='{"message":"SECRET_USER_TEXT"}',
        schema_name="intake_answer_draft",
        json_schema={"type": "object"},
    )


def test_langfuse_records_model_and_tokens_without_prompt_text() -> None:
    client = _FakeLangfuseClient()
    telemetry = LangfuseTelemetry(client)
    adapter = _FakeAdapter(
        ModelResult(
            ModelStatus.OK,
            content='{"status":"PROPOSED"}',
            attempts=1,
            elapsed_ms=850,
            input_tokens=567,
            output_tokens=54,
        )
    )

    with telemetry.request_span("abc123"):
        result = run_safely(adapter, _sample_request())

    assert result.status is ModelStatus.OK
    (span,) = client.spans
    (gen,) = span.generations
    assert gen.exited is True
    assert gen.start_kwargs["as_type"] == "generation"
    assert gen.start_kwargs["name"] == "intake.extract.v1"
    assert gen.start_kwargs["model"] == "gpt-6-luna"
    assert "input" not in gen.start_kwargs and "output" not in gen.start_kwargs
    assert gen.update_kwargs["usage_details"] == {"input": 567, "output": 54}
    assert gen.update_kwargs["level"] == "DEFAULT"
    assert "input" not in gen.update_kwargs and "output" not in gen.update_kwargs
    dumped = repr(gen.start_kwargs) + repr(gen.update_kwargs)
    assert "SECRET_PROMPT_TEXT" not in dumped and "SECRET_USER_TEXT" not in dumped


def test_langfuse_records_adapter_error_and_fails_closed() -> None:
    client = _FakeLangfuseClient()
    telemetry = LangfuseTelemetry(client)
    adapter = _FakeAdapter(RuntimeError("boom"))

    with telemetry.request_span("abc123"):
        result = run_safely(adapter, _sample_request())

    assert result.status is ModelStatus.UNAVAILABLE
    assert result.error_code == "ADAPTER_ERROR"
    (gen,) = client.spans[0].generations
    assert gen.update_kwargs["level"] == "ERROR"
    assert gen.update_kwargs["status_message"] == "ADAPTER_ERROR"
    assert gen.update_kwargs["usage_details"] is None

