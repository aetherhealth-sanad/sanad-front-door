# Hosting Sanad on Vercel — Feasibility, Architecture, and Setup Guide

**Recorded:** 2026-11-16  
**Status:** `TECH_TBD`. This guide evaluates Vercel as an alternative or complement to [Azure Container Apps](azure-container.md) for the synthetic demo. It does not decide the production deploy target (`OD-05`, owner: Tech Lead).

Sanad is a research prototype, not a medical device. Any hosted demo holds **synthetic data only**. Hosting it on Vercel says nothing about clinical safety, validity, interoperability, or legal compliance.

---

## 1. Short Answer: Can You Use Vercel Instead of Azure Container Apps?

**Yes — with an important distinction between the frontend and the backend:**

| Approach | Frontend (`apps/web`) | Backend (`apps/api`) | Database | Effort & Risk |
|---|---|---|---|---|
| **Azure Container Apps** (current) | nginx + Vite build | FastAPI container (1 replica) | SQLite in `/tmp` | Working baseline ([azure-container.md](azure-container.md)) |
| **Option A: Vercel Hybrid** *(Recommended)* | **Vercel** (CDN + Rewrites) | Container host (Azure Container Apps, Railway, Render, or Fly.io) | SQLite (single replica) or Postgres | **Low effort.** Zero Python code changes; keeps same-origin `/api` and Azure Managed Identity. |
| **Option B: Full-Stack on Vercel** | **Vercel** (Static CDN) | **Vercel Python Serverless Function** (`api/index.py`) | **External PostgreSQL required** (Neon, Supabase, etc.) | **Medium effort.** Requires external Postgres (SQLite breaks across serverless instances) and cannot run heavy ML/OCR extras. |

**Recommendation:** If your goal is faster frontend deploys, preview URLs per PR, and simpler TLS/CDN management, use **Option A (Vercel for `apps/web` + a container host for `apps/api`)**. Only use **Option B (Full-Stack on Vercel)** if you want a single-platform deployment and are willing to provision an external PostgreSQL database.

---

## 2. Codebase Constraints That Shape Any Vercel Setup

Before configuring Vercel, four constraints in the repository must be preserved (see also [azure-container.md §2](azure-container.md#2-lessons-learned)):

1. **Build from the repository root (`.`):**
   - `apps/web` pages import `../../../../rules/` and `../../../../catalogue/`.
   - `apps/api` (`sanad_api/catalogues.py`) loads `rules/`, `catalogue/`, `schemas/`, `data/synthetic/`, and `knowledge/passages.v0.1.json` at start-up.
   - Setting Vercel's Root Directory to `apps/web` alone will **fail the build** unless you keep the Root Directory at the repository root (`.`).

2. **Same-origin `/api` and `/version`:**
   - `apps/web/src/api/client.ts` calls the relative path `/api`.
   - `apps/web/public/sw.js` bypasses caching by checking `url.pathname.startsWith('/api/')` (Invariant 11).
   - Quick Exit uses `navigator.sendBeacon('/api/session/end')`.
   - Therefore, Vercel **must** rewrite `/api/*` and `/version` to the backend rather than calling a separate backend domain directly from the browser.

3. **Strict cache headers (Invariant 11 & AC-05.6):**
   - `/api/*` responses (including 4xx errors) must carry `Cache-Control: no-store`.
   - `/sw.js` and `/index.html` must carry `Cache-Control: no-cache` so new deploys replace the service worker and app shell.

4. **Upload size limit:**
   - `apps/api` enforces a 256 KB upload limit for lab reports. Vercel's serverless function payload limit is 4.5 MB, which is sufficient for `apps/api` if kept in mind.

---

## 3. Option A (Recommended): Frontend on Vercel + Backend on Container Host

In this setup, Vercel serves the built React app (`apps/web/dist`) and proxies `/api/*` and `/version` to your running `sanad-api` container (on Azure Container Apps, Railway, Render, or Fly.io) via Vercel Rewrites.

### 3.1 Backend prerequisites

1. Deploy `apps/api` using [`apps/api/Dockerfile`](../apps/api/Dockerfile) on a single-replica container host with a public HTTPS URL (e.g., `https://sanad-api.example.com`).
2. Set the required environment variables on the backend:
   - `SANAD_REPO_ROOT=/app`
   - `SANAD_DATABASE_URL=sqlite:////tmp/sanad.db` (single replica only; synthetic data resets on restart)
   - `SANAD_DEMO_REVIEWER_PASSWORD` and `SANAD_DEMO_MOCK_FACILITY_PASSWORD`
   - Optional AI adapter: `SANAD_MODEL_PROVIDER=azure_openai`, `SANAD_AZURE_OPENAI_ENDPOINT`, `SANAD_AZURE_OPENAI_DEPLOYMENT`, and either Managed Identity (`SANAD_HOSTED=true`, `SANAD_AZURE_OPENAI_AUTH=entra_id` on Azure) or `SANAD_AZURE_OPENAI_API_KEY`.

### 3.2 Vercel project settings

In the Vercel dashboard (**Project Settings -> Build & Deployment**):

- **Framework Preset:** `Vite` (or `Other`)
- **Root Directory:** `.` *(leave empty / repository root — do NOT set to `apps/web`)*
- **Install Command:** `cd apps/web && npm ci`
- **Build Command:** `cd apps/web && npm run build`
- **Output Directory:** `apps/web/dist`

### 3.3 `vercel.json` (Option A)

Place `vercel.json` at the **repository root** (replace `https://YOUR-API-HOST` with your backend's HTTPS URL):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "cd apps/web && npm ci",
  "buildCommand": "cd apps/web && npm run build",
  "outputDirectory": "apps/web/dist",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-API-HOST/api/:path*"
    },
    {
      "source": "/version",
      "destination": "https://YOUR-API-HOST/version"
    },
    {
      "source": "/((?!assets/|urgent\\.html|sw\\.js|favicon\\.svg).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    }
  ]
}
```

> [!NOTE]
> If your backend is on **Azure Container Apps** with `internal` ingress (`sanad-api`), Vercel cannot reach an internal-only Container App over the internet. You must either switch `sanad-api` ingress to `external` (HTTPS) or host `sanad-api` on a public container service.

---

## 4. Option B (Experimental): Full-Stack on Vercel Serverless

You can run both `apps/web` and `apps/api` inside a single Vercel project using Vercel's Python runtime, **provided you address five serverless limitations first**.

### 4.1 What breaks with SQLite on Vercel

In [`apps/api/sanad_api/db.py`](../apps/api/sanad_api/db.py), `sanad-api` defaults to SQLite. On Vercel Serverless:

- The deployment filesystem is **read-only** except `/tmp`.
- `/tmp` is **ephemeral and isolated per function instance**.
- If a user calls `POST /api/cases` on Instance A and `POST /api/cases/{id}/consent` hits Instance B, Instance B has an empty database and returns `404 Case not found`.

**Required fix:** Provision a managed PostgreSQL database (e.g., Neon, Supabase, or Vercel Postgres) and set `SANAD_DATABASE_URL` in Vercel Environment Variables:

```text
SANAD_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

`sanad_api/db.py` already supports non-SQLite URLs (`if not database_url.startswith("sqlite"): return create_engine(database_url)`), so you only need to add `psycopg[binary]>=3.2` to your Python dependencies.

### 4.2 Other serverless constraints to account for

| Constraint | Impact on `sanad-api` | Mitigation |
|---|---|---|
| **250 MB unzipped bundle limit** | `sanad-api` + `openai` fits easily. Installing `laya_local` (`torch`, `transformers`) or `ocr` (`rapidocr`, `onnxruntime`, `numpy`) **exceeds 250 MB**. | Keep `SANAD_MODEL_PROVIDER` set to `disabled` or `azure_openai`. Do not install `[decision]` or `[ocr]` extras on Vercel. |
| **No continuous background loop** | `_lifespan` in `main.py` starts `purge_loop()` every 30s to clean expired navigation progress. Serverless functions freeze between requests. | Session expiry is still enforced on read; for periodic DB cleanup, trigger a Vercel Cron or external job if needed. |
| **Per-instance rate limiter** | `RateLimiter` in `main.py` stores counts in process memory, so limits apply per warm instance rather than globally. | Acceptable for a synthetic demo; use Vercel WAF / Upstash Redis if strict global rate limiting is needed. |
| **Azure OpenAI Auth (`AC-21.13`)** | `factory.py` rejects `SANAD_HOSTED=true` unless `SANAD_AZURE_OPENAI_AUTH=entra_id`. Vercel has no Azure Managed Identity. | Either provide Service Principal env vars (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) for `DefaultAzureCredential`, or keep `SANAD_HOSTED=false` with `api_key` only in non-public/dev previews. |
| **Function timeout** | Vercel Hobby plan defaults to 10s (configurable up to 60s on Hobby/Pro). `SANAD_MODEL_TIMEOUT_MS` defaults to `12000` (12s) with 2 attempts. | Set `maxDuration: 30` (or `60`) in `vercel.json` for `api/index.py`, or lower `SANAD_MODEL_TIMEOUT_MS` to `8000` on Hobby. |

### 4.3 Minimal files needed for Option B

1. **Create `api/index.py`** at the repository root so Vercel exposes FastAPI as a Serverless Function:

```python
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))
os.environ.setdefault("SANAD_REPO_ROOT", str(ROOT))

from sanad_api.main import create_app  # noqa: E402

app = create_app()
```

2. **Create `requirements.txt`** at the repository root (Vercel's Python builder installs from root `requirements.txt` or `pyproject.toml`):

```text
fastapi>=0.115
sqlalchemy>=2.0.30
pydantic>=2.7
jsonschema>=4.22
python-multipart>=0.0.9
python-dotenv>=1.0
psycopg[binary]>=3.2
openai>=3.40,<4
azure-identity>=1.17
langfuse>=5,<6
```

3. **Create `vercel.json`** at the repository root:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "cd apps/web && npm ci",
  "buildCommand": "cd apps/web && npm run build",
  "outputDirectory": "apps/web/dist",
  "functions": {
    "api/index.py": {
      "maxDuration": 30,
      "includeFiles": "{rules,catalogue,schemas,data/synthetic,knowledge,apps/api/sanad_api}/**"
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index.py" },
    { "source": "/version", "destination": "/api/index.py" },
    {
      "source": "/((?!assets/|urgent\\.html|sw\\.js|favicon\\.svg).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    }
  ]
}
```

4. **Set Environment Variables in Vercel** (**Project Settings -> Environment Variables**):
   - `SANAD_DATABASE_URL`: `postgresql+psycopg://...`
   - `SANAD_COMMIT_SHA`: set automatically or via `VERCEL_GIT_COMMIT_SHA`
   - `SANAD_DEMO_REVIEWER_PASSWORD` / `SANAD_DEMO_MOCK_FACILITY_PASSWORD`
   - Optional Azure OpenAI: `SANAD_MODEL_PROVIDER=azure_openai`, `SANAD_AZURE_OPENAI_ENDPOINT`, `SANAD_AZURE_OPENAI_DEPLOYMENT`, `SANAD_AZURE_OPENAI_AUTH`, `SANAD_AZURE_OPENAI_API_KEY` (or Service Principal vars)
   - Optional Langfuse: `SANAD_LANGFUSE_ENABLED=true`, `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`

---

## 5. Post-Deploy Verification Checklist

After deploying to `https://YOUR-VERCEL-URL`, verify the invariants from [`AGENTS.md`](../AGENTS.md) and [`specs/azure-container.md`](azure-container.md):

1. **Version & API reachability:**
   ```bash
   curl -i https://YOUR-VERCEL-URL/version
   curl -i https://YOUR-VERCEL-URL/api/openapi.json
   ```
   Confirm `Cache-Control: no-store` is present on `/api/*` responses.

2. **Case creation (verifies same-origin proxy + DB persistence):**
   ```bash
   curl -s -X POST https://YOUR-VERCEL-URL/api/cases \
     -H "Content-Type: application/json" \
     -d '{"language":"en"}'
   ```
   Then immediately fetch the case or submit consent using the returned `case_id` and `session_token` to verify database persistence across requests.

3. **Emergency page & Service Worker (`AC-05.4`, `AC-05.6`):**
   - Open `https://YOUR-VERCEL-URL/urgent.html` -> returns `200`.
   - Check `curl -I https://YOUR-VERCEL-URL/sw.js` -> `Cache-Control: no-cache`.
   - Toggle **Offline** in browser DevTools and reload -> `/urgent.html` still loads from the service worker cache, and `/api/*` requests are never cached.

4. **Missing asset behavior:**
   - Request `https://YOUR-VERCEL-URL/assets/does-not-exist.js` -> returns `404` (not `index.html`).

5. **No real data & Mock labels:**
   - Confirm only synthetic fixtures are used and all simulated reviewer/referral UI elements display **Mock**.

