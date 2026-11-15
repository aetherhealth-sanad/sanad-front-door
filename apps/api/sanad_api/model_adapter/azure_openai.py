"""Azure OpenAI adapter, v1 API (T4.5, CC-011). Optional: install the `azure` extra.

Client set-up follows Microsoft's v1 guidance: the standard `OpenAI` client with `base_url` set
to `https://<resource>.openai.azure.com/openai/v1/`, no `api_version`, and either an API key or
a Microsoft Entra ID token provider passed as `api_key`. `model` is the deployment name.

The adapter asks for strict structured output (`response_format` of type `json_schema`) and
returns the raw JSON text. It never retries a content-filter block or a client error. It retries
timeouts, connection errors, 429 and 5xx within one deadline and `max_attempts`, with SDK
retries switched off so every attempt is counted in the trace (NFR-21).

Data sent: the system prompt, and a user message holding one catalogue question and the text
the user typed. No case ID, token, earlier answer or identifier is sent. Stored completions are
never requested.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from sanad_api.model_adapter.port import ModelRequest, ModelResult, ModelStatus

if TYPE_CHECKING:
    from openai import OpenAI
    from openai.types.chat import ChatCompletion

# Token scope from Microsoft's v1 API lifecycle page (checked 2026-11-08).
ENTRA_SCOPE = "https://ai.azure.com/.default"
MIN_ATTEMPT_SECONDS = 0.5


def v1_base_url(endpoint: str) -> str:
    """Accepts the resource endpoint with or without the `/openai/v1` suffix."""
    url = endpoint.strip().rstrip("/")
    if not url.startswith("https://"):
        raise ValueError("The Azure OpenAI endpoint must start with https://")
    if url.endswith("/openai"):
        url += "/v1"
    elif not url.endswith("/openai/v1"):
        url += "/openai/v1"
    return url + "/"


def _is_content_filter(error: Any) -> bool:
    if getattr(error, "code", None) == "content_filter":
        return True
    body = getattr(error, "body", None)
    nested = body.get("error") if isinstance(body, dict) else None
    return isinstance(nested, dict) and nested.get("code") == "content_filter"


class AzureOpenAIAdapter:
    provider = "azure_openai"
    label = "Azure OpenAI"

    def __init__(
        self,
        client: OpenAI,
        deployment: str,
        max_completion_tokens: int,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self.model_id = deployment
        self._max_completion_tokens = max_completion_tokens
        self._monotonic = monotonic

    @property
    def enabled(self) -> bool:
        return True

    def complete_json(self, request: ModelRequest) -> ModelResult:
        import openai  # present whenever this adapter could be built

        started = self._monotonic()
        deadline = started + request.envelope.timeout_ms / 1000
        attempts = 0
        status, error_code = ModelStatus.UNAVAILABLE, "NO_ATTEMPT"
        while attempts < request.envelope.max_attempts:
            remaining = deadline - self._monotonic()
            if remaining < MIN_ATTEMPT_SECONDS:
                status, error_code = ModelStatus.TIMEOUT, "DEADLINE_REACHED"
                break
            attempts += 1
            try:
                completion = self._client.chat.completions.create(
                    model=self.model_id,
                    messages=[
                        {"role": "system", "content": request.system_prompt},
                        {"role": "user", "content": request.user_content},
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": request.schema_name,
                            "strict": True,
                            "schema": request.json_schema,
                        },
                    },
                    max_completion_tokens=self._max_completion_tokens,
                    timeout=remaining,
                )
            except openai.APITimeoutError:  # a subclass of APIConnectionError, so first
                status, error_code = ModelStatus.TIMEOUT, "TIMEOUT"
                continue
            except openai.APIConnectionError:
                status, error_code = ModelStatus.UNAVAILABLE, "CONNECTION_ERROR"
                continue
            except openai.BadRequestError as error:
                if _is_content_filter(error):
                    return self._done(ModelStatus.CONTENT_FILTERED, attempts, started, "FILTERED")
                return self._done(ModelStatus.UNAVAILABLE, attempts, started, "HTTP_400")
            except (openai.RateLimitError, openai.InternalServerError) as error:
                status, error_code = ModelStatus.UNAVAILABLE, f"HTTP_{error.status_code}"
                continue
            except openai.APIStatusError as error:  # 401, 403, 404 and the rest: configuration
                return self._done(
                    ModelStatus.UNAVAILABLE, attempts, started, f"HTTP_{error.status_code}"
                )
            except openai.OpenAIError:
                return self._done(ModelStatus.UNAVAILABLE, attempts, started, "SDK_ERROR")
            return self._read(completion, attempts, started)
        return self._done(status, attempts, started, error_code)

    def _read(self, completion: ChatCompletion, attempts: int, started: float) -> ModelResult:
        if not completion.choices:
            return self._done(ModelStatus.OUTPUT_INVALID, attempts, started, "NO_CHOICE")
        choice = completion.choices[0]
        if choice.finish_reason == "content_filter":
            return self._done(ModelStatus.CONTENT_FILTERED, attempts, started, "FILTERED")
        if choice.message.refusal:
            return self._done(ModelStatus.REFUSED, attempts, started, "REFUSAL")
        if choice.finish_reason != "stop" or not choice.message.content:
            code = f"FINISH_{choice.finish_reason}".upper()
            return self._done(ModelStatus.OUTPUT_INVALID, attempts, started, code)
        return ModelResult(
            ModelStatus.OK,
            choice.message.content,
            attempts=attempts,
            elapsed_ms=self._elapsed_ms(started),
            input_tokens=completion.usage.prompt_tokens if completion.usage else None,
            output_tokens=completion.usage.completion_tokens if completion.usage else None,
        )

    def _done(
        self, status: ModelStatus, attempts: int, started: float, error_code: str | None
    ) -> ModelResult:
        return ModelResult(status, None, attempts, self._elapsed_ms(started), error_code)

    def _elapsed_ms(self, started: float) -> int:
        return max(0, int((self._monotonic() - started) * 1000))
