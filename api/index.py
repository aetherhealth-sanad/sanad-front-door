"""Vercel Python Serverless entrypoint for Sanad API.

Loads secrets from Azure Key Vault when SANAD_KEY_VAULT_URI is set, then exposes
the FastAPI application instance (`app`) for Vercel's Python runtime.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger("sanad.vercel")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))
os.environ.setdefault("SANAD_REPO_ROOT", str(ROOT))

kv_uri = os.environ.get("SANAD_KEY_VAULT_URI")
if kv_uri:
    from azure.identity import DefaultAzureCredential
    from azure.keyvault.secrets import SecretClient

    client = SecretClient(vault_url=kv_uri, credential=DefaultAzureCredential())
    secret_map = {
        "database-url": "SANAD_DATABASE_URL",
        "reviewer-pw": "SANAD_DEMO_REVIEWER_PASSWORD",
        "facility-pw": "SANAD_DEMO_MOCK_FACILITY_PASSWORD",
        "azure-openai-key": "SANAD_AZURE_OPENAI_API_KEY",
    }
    for kv_name, env_name in secret_map.items():
        if not os.environ.get(env_name):
            try:
                value = client.get_secret(kv_name).value
                if value:
                    os.environ[env_name] = value
            except Exception as exc:
                logger.warning("Key Vault lookup failed for %s: %s", kv_name, type(exc).__name__)

if not os.environ.get("SANAD_DATABASE_URL"):
    logger.warning("SANAD_DATABASE_URL is unset; falling back to /tmp/sanad.db (ephemeral)")
    os.environ["SANAD_DATABASE_URL"] = "sqlite:////tmp/sanad.db"

from sanad_api.main import create_app  # noqa: E402

app = create_app()

