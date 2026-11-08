"""RF-21 Azure OpenAI adapter and adapter factory (T4.5, AC-21.11, AC-21.12).

A stub stands in for the `openai` client, so no request leaves the machine. The SDK's own error
and response types are used, so the mapping is tested against the real classes.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from typing import Any

import httpx2
import openai
import pytest
from openai.types.chat import ChatCompletion

from sanad_api.config import Settings
from sanad_api.main import create_app
from sanad_api.model_adapter.azure_openai import AzureOpenAIAdapter, v1_base_url
from sanad_api.model_adapter.disabled import DisabledAdapter
from sanad_api.model_adapter.factory import ModelConfigError, build_model_adapter
from sanad_api.model_adapter.port import ModelRequest, ModelStatus, TaskEnvelope

URL = "https://example-resource.openai.azure.com/openai/v1/chat/completions"
SECRET = "test-only-key-do-not-use"


def completion(
    content: str | None = '{"ok": true}',
    finish_reason: str = "stop",
    refusal: str | None = None,
) -> ChatCompletion:
    return ChatCompletion.model_validate(
        {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": "test-model",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": finish_reason,
                    "message": {"role": "assistant", "content": content, "refusal": refusal},
                }
            ],
        }
    )


def status_error(cls: type[openai.APIStatusError], status: int, body: Any) -> Exception:
    response = httpx2.Response(status, request=httpx2.Request("POST", URL))
    return cls("error", response=response, body=body)


def timeout_error() -> Exception:
    return openai.APITimeoutError(request=httpx2.Request("POST", URL))


def connection_error() -> Exception:
    return openai.APIConnectionError(request=httpx2.Request("POST", URL))


class StubClient:
    """The slice of `openai.OpenAI` the adapter uses: `chat.completions.create`."""

    def __init__(self, *replies: ChatCompletion | Exception) -> None:
        self.replies = list(replies)
        self.calls: list[dict[str, Any]] = []
        self.chat = self
        self.completions = self

    def create(self, **kwargs: Any) -> ChatCompletion:
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class StepClock:
    def __init__(self, step: float = 0.0) -> None:
        self.now, self.step = 0.0, step

    def __call__(self) -> float:
        value = self.now
        self.now += self.step
        return value


def request(timeout_ms: int = 12_000, max_attempts: int = 2) -> ModelRequest:
    return ModelRequest(
        envelope=TaskEnvelope(
            request_id="req-test",
            task_id="intake.extract.v1",
            purpose="EXTRACTION_DRAFT_ONLY",
            schema_version="intake-answer-draft-0.1",
            prompt_version="intake-extract-prompt-0.1",
            question_catalogue_version="questions-draft-0.1",
            timeout_ms=timeout_ms,
            max_attempts=max_attempts,
        ),
        system_prompt="system",
        user_content='{"message": "never"}',
        schema_name="intake_answer_draft",
        json_schema={"type": "object"},
    )


def adapter(client: StubClient, clock: StepClock | None = None) -> AzureOpenAIAdapter:
    return AzureOpenAIAdapter(client, "sanad-mini", 800, monotonic=clock or StepClock())  # type: ignore[arg-type]


# AC-21.11: the call ---------------------------------------------------------------------------


def test_tc_21_11_success_uses_the_deployment_and_strict_json_schema() -> None:
    client = StubClient(completion('{"status": "ABSTAIN"}'))
    result = adapter(client).complete_json(request())
    assert result.status is ModelStatus.OK and result.content == '{"status": "ABSTAIN"}'
    assert result.attempts == 1
    [call] = client.calls
    assert call["model"] == "sanad-mini"
    schema = {"name": "intake_answer_draft", "strict": True, "schema": {"type": "object"}}
    assert call["response_format"] == {"type": "json_schema", "json_schema": schema}
    assert [m["role"] for m in call["messages"]] == ["system", "user"]
    assert call["max_completion_tokens"] == 800
    assert 0 < call["timeout"] <= 12
    assert "store" not in call and "temperature" not in call


def test_tc_21_11_transient_errors_are_retried_within_the_attempt_limit() -> None:
    client = StubClient(timeout_error(), completion())
    result = adapter(client).complete_json(request())
    assert result.status is ModelStatus.OK and result.attempts == 2

    client = StubClient(connection_error(), status_error(openai.RateLimitError, 429, None))
    result = adapter(client).complete_json(request())
    assert result.status is ModelStatus.UNAVAILABLE and result.attempts == 2
    assert result.error_code == "HTTP_429"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (status_error(openai.BadRequestError, 400, {"code": "content_filter"}),
         ModelStatus.CONTENT_FILTERED, "FILTERED"),
        (status_error(openai.BadRequestError, 400, {"error": {"code": "content_filter"}}),
         ModelStatus.CONTENT_FILTERED, "FILTERED"),
        (status_error(openai.BadRequestError, 400, {"code": "invalid_request"}),
         ModelStatus.UNAVAILABLE, "HTTP_400"),
        (status_error(openai.AuthenticationError, 401, None), ModelStatus.UNAVAILABLE, "HTTP_401"),
        (status_error(openai.NotFoundError, 404, None), ModelStatus.UNAVAILABLE, "HTTP_404"),
    ],
)
def test_tc_21_11_blocks_and_client_errors_are_not_retried(
    error: Exception, status: ModelStatus, code: str
) -> None:
    client = StubClient(error, completion())
    result = adapter(client).complete_json(request())
    assert (result.status, result.error_code, result.attempts) == (status, code, 1)
    assert result.content is None


@pytest.mark.parametrize(
    ("reply", "status", "code"),
    [
        (completion(None, finish_reason="content_filter"), ModelStatus.CONTENT_FILTERED,
         "FILTERED"),
        (completion('{"status": "PRO', finish_reason="length"), ModelStatus.OUTPUT_INVALID,
         "FINISH_LENGTH"),
        (completion(None, refusal="I can't help with that."), ModelStatus.REFUSED, "REFUSAL"),
        (completion(None), ModelStatus.OUTPUT_INVALID, "FINISH_STOP"),
    ],
)
def test_tc_21_11_unusable_completions_are_not_passed_on(
    reply: ChatCompletion, status: ModelStatus, code: str
) -> None:
    result = adapter(StubClient(reply)).complete_json(request())
    assert (result.status, result.error_code, result.content) == (status, code, None)


def test_tc_21_11_one_deadline_covers_every_attempt() -> None:
    """Each clock read moves 0.3 s on. Attempt 1 starts with 0.7 s left; attempt 2 would start
    with 0.4 s left, under the 0.5 s minimum, so it is never made."""
    client = StubClient(timeout_error(), completion())
    result = adapter(client, StepClock(step=0.3)).complete_json(request(timeout_ms=1_000))
    assert result.status is ModelStatus.TIMEOUT and result.error_code == "DEADLINE_REACHED"
    assert len(client.calls) == 1


@pytest.mark.parametrize(
    ("endpoint", "expected"),
    [
        ("https://res.openai.azure.com", "https://res.openai.azure.com/openai/v1/"),
        ("https://res.openai.azure.com/", "https://res.openai.azure.com/openai/v1/"),
        ("https://res.openai.azure.com/openai", "https://res.openai.azure.com/openai/v1/"),
        ("https://res.openai.azure.com/openai/v1/", "https://res.openai.azure.com/openai/v1/"),
        ("https://res.services.ai.azure.com", "https://res.services.ai.azure.com/openai/v1/"),
    ],
)
def test_tc_21_11_endpoint_becomes_the_v1_base_url(endpoint: str, expected: str) -> None:
    assert v1_base_url(endpoint) == expected


def test_tc_21_11_endpoint_must_be_https() -> None:
    with pytest.raises(ValueError):
        v1_base_url("http://res.openai.azure.com")


# AC-21.11: configuration ----------------------------------------------------------------------


@pytest.fixture
def azure_settings(settings: Settings) -> Settings:
    return replace(
        settings,
        model_provider="azure_openai",
        azure_openai_endpoint="https://example-resource.openai.azure.com",
        azure_openai_deployment="sanad-mini",
        azure_openai_api_key=SECRET,
    )


def test_tc_21_11_factory_builds_a_v1_client_without_sdk_retries(azure_settings: Settings) -> None:
    built = build_model_adapter(azure_settings)
    assert isinstance(built, AzureOpenAIAdapter)
    assert built.enabled and built.provider == "azure_openai" and built.model_id == "sanad-mini"
    client = built._client
    assert str(client.base_url) == "https://example-resource.openai.azure.com/openai/v1/"
    assert client.max_retries == 0


@pytest.mark.parametrize(
    "change",
    [
        {"azure_openai_endpoint": None},
        {"azure_openai_deployment": None},
        {"azure_openai_api_key": None},
        {"azure_openai_endpoint": "http://example-resource.openai.azure.com"},
        {"azure_openai_deployment": "has spaces"},
        {"azure_openai_auth": "password"},
        {"model_max_attempts": 9},
        {"model_timeout_ms": 10},
        {"model_provider": "someone-else"},
    ],
)
def test_tc_21_11_bad_configuration_stops_start_up_without_echoing_secrets(
    azure_settings: Settings, change: dict[str, Any]
) -> None:
    with pytest.raises(ModelConfigError) as raised:
        build_model_adapter(replace(azure_settings, **change))
    assert SECRET not in str(raised.value)


def test_tc_21_11_entra_id_uses_a_token_provider(azure_settings: Settings) -> None:
    pytest.importorskip("azure.identity")
    built = build_model_adapter(
        replace(azure_settings, azure_openai_auth="entra_id", azure_openai_api_key=None)
    )
    assert isinstance(built, AzureOpenAIAdapter)


def test_tc_21_11_settings_never_print_the_key(azure_settings: Settings) -> None:
    assert SECRET not in repr(azure_settings)


# AC-21.12 ------------------------------------------------------------------------------------


@pytest.fixture
def default_app(settings: Settings) -> Iterator[Any]:
    yield create_app(settings)


def test_tc_21_12_default_app_has_no_model(default_app: Any) -> None:
    """INV-01: with default settings no adapter can reach the network."""
    adapter_in_use = default_app.state.model_adapter
    assert isinstance(adapter_in_use, DisabledAdapter)
    assert adapter_in_use.enabled is False
    result = adapter_in_use.complete_json(request())
    assert result.status is ModelStatus.DISABLED and result.attempts == 0
