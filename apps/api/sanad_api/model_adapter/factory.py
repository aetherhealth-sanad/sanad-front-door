"""Chooses the adapter from settings. A broken configuration stops the API at start-up, the same
way a broken catalogue does, instead of failing in the middle of a journey. Error messages name
the setting and never repeat a secret."""

from __future__ import annotations

import re
from collections.abc import Callable

from sanad_api.config import Settings
from sanad_api.model_adapter.disabled import DisabledAdapter
from sanad_api.model_adapter.port import ModelAdapter

PROVIDERS = ("disabled", "azure_openai")
# Deployment names go into audit entries, which hold codes only (INV-03).
_DEPLOYMENT = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")


class ModelConfigError(ValueError):
    pass


def build_model_adapter(settings: Settings) -> ModelAdapter:
    if settings.model_provider == "disabled":
        return DisabledAdapter()
    if settings.model_provider == "azure_openai":
        return _azure_openai(settings)
    raise ModelConfigError(f"SANAD_MODEL_PROVIDER must be one of {', '.join(PROVIDERS)}")


def _check_budget(settings: Settings) -> None:
    if not 1_000 <= settings.model_timeout_ms <= 60_000:
        raise ModelConfigError("SANAD_MODEL_TIMEOUT_MS must be between 1000 and 60000")
    if not 1 <= settings.model_max_attempts <= 3:
        raise ModelConfigError("SANAD_MODEL_MAX_ATTEMPTS must be between 1 and 3")
    if not 64 <= settings.model_max_completion_tokens <= 4_096:
        raise ModelConfigError("SANAD_MODEL_MAX_COMPLETION_TOKENS must be between 64 and 4096")


def _azure_openai(settings: Settings) -> ModelAdapter:
    try:
        from openai import OpenAI
    except ImportError as error:
        raise ModelConfigError(
            "SANAD_MODEL_PROVIDER=azure_openai needs the optional extra: "
            "pip install -e 'apps/api[azure]'"
        ) from error
    from sanad_api.model_adapter.azure_openai import ENTRA_SCOPE, AzureOpenAIAdapter, v1_base_url

    _check_budget(settings)
    endpoint, deployment = settings.azure_openai_endpoint, settings.azure_openai_deployment
    if not endpoint or not deployment:
        raise ModelConfigError(
            "SANAD_MODEL_PROVIDER=azure_openai needs SANAD_AZURE_OPENAI_ENDPOINT and "
            "SANAD_AZURE_OPENAI_DEPLOYMENT"
        )
    if not _DEPLOYMENT.match(deployment):
        raise ModelConfigError("SANAD_AZURE_OPENAI_DEPLOYMENT has characters that are not allowed")
    try:
        base_url = v1_base_url(endpoint)
    except ValueError as error:
        raise ModelConfigError(str(error)) from error

    api_key: str | Callable[[], str]
    if settings.azure_openai_auth == "api_key":
        if not settings.azure_openai_api_key:
            raise ModelConfigError(
                "SANAD_AZURE_OPENAI_AUTH=api_key needs SANAD_AZURE_OPENAI_API_KEY"
            )
        api_key = settings.azure_openai_api_key
    elif settings.azure_openai_auth == "entra_id":
        try:
            from azure.identity import DefaultAzureCredential, get_bearer_token_provider
        except ImportError as error:
            raise ModelConfigError(
                "SANAD_AZURE_OPENAI_AUTH=entra_id needs the optional extra: "
                "pip install -e 'apps/api[azure]'"
            ) from error
        api_key = get_bearer_token_provider(DefaultAzureCredential(), ENTRA_SCOPE)
    else:
        raise ModelConfigError("SANAD_AZURE_OPENAI_AUTH must be api_key or entra_id")

    client = OpenAI(base_url=base_url, api_key=api_key, max_retries=0)
    return AzureOpenAIAdapter(client, deployment, settings.model_max_completion_tokens)
