# Sanad (سند) — Deployment Guideline

> **Research Prototype — Not a Medical Device.**  
> All deployments of Sanad must use **synthetic data only**. Never connect real patient records or outbound clinical referral transport. Clinical rules are unapproved drafts (`CLINICAL_TBD`), and all reviewer and facility workflows are **Mock / Simulated**.

This guide covers all supported ways to run and deploy Sanad:
1. [Local Development (`run.sh` / Manual)](#1-local-development)
2. [Local Containers (Docker)](#2-local-containers-docker)
3. [Vercel Full-Stack + Supabase PostgreSQL + Azure Key Vault](#3-vercel-full-stack--supabase-postgresql--azure-key-vault)
4. [Azure Container Apps + Azure Key Vault](#4-azure-container-apps--azure-key-vault)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Post-Deployment Verification Checklist](#6-post-deployment-verification-checklist)

---

## Architecture & Build Constraints

All deployment targets must respect four codebase invariants:

1. **Build from the repository root (`.`):**
   - `apps/api` loads `rules/`, `catalogue/`, `schemas/`, `data/synthetic/`, and `knowledge/passages.v0.1.json` at startup.
   - `apps/web` imports `rules/` and `catalogue/` directly during Vite build.
2. **Same-origin `/api` and `/version`:**
   - The frontend calls relative `/api/*` paths, Quick Exit sends `navigator.sendBeacon('/api/session/end')`, and the service worker (`apps/web/public/sw.js`) bypasses caching for `/api/`.
   - Reverse proxies (Vite dev server, nginx, or Vercel rewrites) must serve the frontend and `/api/*` + `/version` under one origin.
3. **Cache headers:**
   - `/api/*` responses must carry `Cache-Control: no-store`.
   - `/sw.js` and `/index.html` must carry `Cache-Control: no-cache`.
4. **Database behavior:**
   - **Single-instance container / local:** SQLite (`sqlite:///./sanad-dev.db` or `sqlite:////tmp/sanad.db`) works with 1 replica; container restarts reset cases.
   - **Serverless (Vercel):** Requires external **PostgreSQL** (e.g., Supabase Transaction Pooler on port `6543` with `NullPool`), because serverless `/tmp` is ephemeral and not shared across instances.

---

## 1. Local Development

**Prerequisites:** Python 3.12+, Node.js 20.19+ or 22.12+, and `npm`.

### Quickstart with `run.sh`
```bash
./run.sh
```
This initializes `apps/api/.env` (if missing), prepares SQLite (`apps/api/sanad-dev.db`), optionally starts self-hosted Langfuse on `http://localhost:3100`, and launches:
- **Frontend (Vite):** `http://127.0.0.1:3000`
- **Emergency Page:** `http://127.0.0.1:3000/urgent.html`
- **Backend (FastAPI):** `http://127.0.0.1:8000` (`/api/docs`, `/version`)

See [RUNBOOK.md](RUNBOOK.md) for manual two-terminal setup and troubleshooting.

---

## 2. Local Containers (Docker)

Build both images from the **repository root** (`.`), then link them on a local Docker network:

```bash
docker build -f apps/api/Dockerfile -t sanad-api:local .
docker build -f apps/web/Dockerfile -t sanad-web:local .

docker network create sanad-local
docker run -d --name sanad-api --network sanad-local \
  -e SANAD_COMMIT_SHA=local \
  -e SANAD_DEMO_REVIEWER_PASSWORD=choose-local-pw \
  -e SANAD_DEMO_MOCK_FACILITY_PASSWORD=choose-local-pw \
  sanad-api:local

docker run -d --name sanad-web --network sanad-local \
  -p 127.0.0.1:8088:80 \
  -e API_HOST=sanad-api:8000 \
  sanad-web:local
```

Open `http://127.0.0.1:8088`. Clean up with:
```bash
docker rm -f sanad-web sanad-api && docker network rm sanad-local
```

---

## 3. Vercel Full-Stack + Supabase PostgreSQL + Azure Key Vault

Vercel hosts the React/Vite static frontend (`apps/web/dist`) and runs `sanad-api` as a Python Serverless Function (`api/index.py`).

### 3.1 Repository files used
- [`api/index.py`](api/index.py) — Loads secrets from Azure Key Vault (`SANAD_KEY_VAULT_URI`), sets `SANAD_REPO_ROOT`, and exports FastAPI `app`.
- [`requirements.txt`](requirements.txt) — Python dependencies including `psycopg[binary]` and `azure-keyvault-secrets` (excludes heavy ML/OCR extras to stay under Vercel's 250 MB function limit).
- [`vercel.json`](vercel.json) — Builds `apps/web`, bundles `rules/`, `catalogue/`, `schemas/`, `data/synthetic/`, `knowledge/`, and `apps/api/sanad_api/`, rewrites `/api/*` and `/version` to `/api/index.py`, and sets cache headers.
- [`apps/api/sanad_api/db.py`](apps/api/sanad_api/db.py) — Uses `NullPool` and `prepare_threshold=None` when `VERCEL` is set so serverless invocations do not exhaust Postgres connection pools.

### 3.2 Database & Key Vault setup
1. **PostgreSQL (Supabase):** Use the **Transaction Pooler** URI (port **`6543`**, IPv4-compatible) in SQLAlchemy `psycopg` format (URL-encode special characters in the password, e.g., `@` → `%40`):
   ```text
   postgresql+psycopg://USER:PASSWORD@HOST:6543/postgres?sslmode=require
   ```
2. **Azure Key Vault (`sanad-demo-kv3108`):** Store the secrets:
   ```bash
   KV=sanad-demo-kv3108
   az keyvault secret set --vault-name "$KV" -n database-url --value "postgresql+psycopg://..." -o none
   az keyvault secret set --vault-name "$KV" -n reviewer-pw --value "YOUR_REVIEWER_PW" -o none
   az keyvault secret set --vault-name "$KV" -n facility-pw --value "YOUR_FACILITY_PW" -o none
   az keyvault secret set --vault-name "$KV" -n azure-openai-key --value "YOUR_OPENAI_KEY" -o none
   ```
3. **Service Principal for Vercel:** Grant `Key Vault Secrets User` on the vault:
   ```bash
   KV_ID=$(az keyvault show -n "$KV" --query id -o tsv)
   az ad sp create-for-rbac -n sanad-vercel-kv --role "Key Vault Secrets User" --scopes "$KV_ID"
   ```

### 3.3 Vercel Project Settings & Deploy
1. Set **Root Directory** to `.` (repository root).
2. Configure **Environment Variables** in Vercel:
   - `SANAD_KEY_VAULT_URI` = `https://sanad-demo-kv3108.vault.azure.net/`
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (from the Service Principal)
   - Optional AI adapter: `SANAD_MODEL_PROVIDER=azure_openai`, `SANAD_AZURE_OPENAI_ENDPOINT`, `SANAD_AZURE_OPENAI_DEPLOYMENT`, `SANAD_AZURE_OPENAI_AUTH=api_key`
3. Deploy from the repository root:
   ```bash
   npx --yes vercel --prod
   ```

See [specs/vercel-guide.md](specs/vercel-guide.md) for hybrid hosting (Vercel FE + Container BE) and additional serverless notes.

---

## 4. Azure Container Apps + Azure Key Vault

For container-based hosting on Azure (single-replica SQLite in `/tmp`, nginx reverse proxy on `sanad-web` forwarding to internal `sanad-api`):

```bash
RG=sanad-demo-rg
ACR=sanaddemo
TAG="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"

az acr build -r "$ACR" -t "sanad-api:$TAG" -f apps/api/Dockerfile .
az acr build -r "$ACR" -t "sanad-web:$TAG" -f apps/web/Dockerfile .

az containerapp update -g "$RG" -n sanad-api \
  --image "$ACR.azurecr.io/sanad-api:$TAG" \
  --set-env-vars "SANAD_COMMIT_SHA=$TAG"

az containerapp update -g "$RG" -n sanad-web \
  --image "$ACR.azurecr.io/sanad-web:$TAG"
```

- **Important:** `sanad-api` must keep `--min-replicas 1 --max-replicas 1` when using SQLite, and `sanad-web` sets `API_HOST=sanad-api` with `proxy_http_version 1.1`.
- See [RUNBOOK.md](RUNBOOK.md#deploy-to-azure-container-apps-manual), [specs/azure-container.md](specs/azure-container.md), and [specs/azure-key-vault.md](specs/azure-key-vault.md) for full initial provisioning and Key Vault `keyvaultref` setup.

---

## 5. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SANAD_DATABASE_URL` | Yes (cloud) | SQLite (`sqlite:///...`) locally or `postgresql+psycopg://...` on serverless |
| `SANAD_REPO_ROOT` | Container / Vercel | Path to repository root containing `rules/`, `catalogue/`, `schemas/` |
| `SANAD_COMMIT_SHA` | Optional | Exposed on `GET /version` |
| `SANAD_DEMO_REVIEWER_PASSWORD` | Staff UI | Password for `demo-reviewer` (unset disables login) |
| `SANAD_DEMO_MOCK_FACILITY_PASSWORD` | Staff UI | Password for `demo-mock-facility` (unset disables login) |
| `SANAD_MODEL_PROVIDER` | Optional | `disabled` (default) or `azure_openai` |
| `SANAD_AZURE_OPENAI_ENDPOINT` | If `azure_openai` | Azure OpenAI v1 endpoint (`.../openai/v1`) |
| `SANAD_AZURE_OPENAI_DEPLOYMENT` | If `azure_openai` | Deployment name (e.g. `gpt-6-luna`) |
| `SANAD_AZURE_OPENAI_AUTH` | If `azure_openai` | `api_key` or `entra_id` (`SANAD_HOSTED=true` requires `entra_id`) |
| `SANAD_AZURE_OPENAI_API_KEY` | If `api_key` | Stored in Key Vault or secret env var |
| `SANAD_LANGFUSE_ENABLED` | Optional | `false` by default; `true` enables content-free operational metadata spans |

---

## 6. Post-Deployment Verification Checklist

Run against `https://YOUR-HOSTED-URL`:

1. **Health & Cache Headers:**
   ```bash
   curl -i https://YOUR-HOSTED-URL/version
   curl -i https://YOUR-HOSTED-URL/api/openapi.json   # Verify Cache-Control: no-store
   curl -I https://YOUR-HOSTED-URL/sw.js              # Verify Cache-Control: no-cache
   curl -I https://YOUR-HOSTED-URL/urgent.html        # Verify HTTP 200
   ```
2. **Case Persistence:**
   ```bash
   curl -s -X POST https://YOUR-HOSTED-URL/api/cases \
     -H "Content-Type: application/json" \
     -d '{"start_mode":"BLANK","preferred_language":"en"}'
   ```
   Confirm `201 Created` with a `case_id` and `route: "/consent"`, then complete consent in the browser to confirm database persistence across requests.
3. **Offline Emergency Path:** Load the app once, switch browser DevTools to **Offline**, and confirm `/urgent.html` still loads from the service worker cache.
4. **Safety & Mock Boundaries:** Confirm all reviewer, referral, and facility screens show **Mock** labels, and no real patient data is entered.

