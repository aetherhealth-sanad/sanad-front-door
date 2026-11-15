# Sanad Local Runbook

This runbook starts the current local API and web source for development, and describes a [manual container deploy to Azure Container Apps](#deploy-to-azure-container-apps-manual). Sanad is a research prototype, not a medical device. Use synthetic fixtures only; no model provider or real clinic connection is configured.

## Prerequisites

- Python 3.12 or newer (`apps/api/pyproject.toml`)
- Node.js `^20.19.0` or `>=22.12.0` and npm (Vite's engine requirement in `apps/web/package-lock.json`)
- A terminal in the repository root

## Install dependencies

From the repository root:

```bash
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -e 'apps/api[dev]'

cd apps/web
npm ci
cd ../..
```

The API loads rules, consent/question catalogues, and synthetic fixtures from this repository when it starts. By default it makes no model calls and needs no cloud credentials. The optional Azure OpenAI answer matching for the chat is described [below](#optional-azure-openai-answer-matching-in-the-chat).

## Cách chạy Langfuse (self-hosted)

Langfuse cần Postgres, ClickHouse, Redis và MinIO. Dùng Docker Compose trong repository chính
của Langfuse (nằm ngoài repository Sanad). Đây là cách chạy local để phát triển; Docker Compose
không cung cấp high availability hoặc backup. Trước khi chạy, cập nhật các secret được đánh dấu
`CHANGEME` trong file compose của Langfuse. Vite của Sanad dùng cổng `3000`, nên đổi port mapping
của Langfuse web từ `3000:3000` thành `127.0.0.1:3100:3000` để hai ứng dụng có thể chạy cùng lúc.

```bash
# 1. Chạy server Langfuse
git clone https://github.com/langfuse/langfuse.git ~/langfuse
cd ~/langfuse
docker compose up -d
# Chờ khoảng 2-3 phút; kiểm tra log tới khi langfuse-web báo Ready.
docker compose logs -f langfuse-web
```

Mở <http://localhost:3100>, tạo user, organization và project. Vào **Settings → API Keys** để
tạo cặp `pk-lf-...` / `sk-lf-...`.

```bash
# 2. Cài extra cho API (từ repository Sanad)
cd /Users/macmini/Desktop/AIApp/sanad-front-door
apps/api/.venv/bin/python -m pip install -e 'apps/api[observability]'

# 3. Chạy API với biến môi trường; không commit key
export SANAD_LANGFUSE_ENABLED=true
export SANAD_DATABASE_URL=sqlite:///./apps/api/sanad-dev.db
export LANGFUSE_BASE_URL=http://localhost:3100
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
apps/api/.venv/bin/uvicorn sanad_api.main:create_app --factory --app-dir apps/api --reload
```

Gọi `http://127.0.0.1:8000/version` hoặc tạo case tổng hợp qua UI, rồi xem tab **Traces** trong
project. Mỗi request được trace sẽ có span `http.request` với metadata `http.route`,
`http.status_code` và thời lượng. Metadata `policy.*` chỉ có trên request phát sinh policy audit
event.

Mở trace và xác nhận input/output trống. Các endpoint ghi câu trả lời như `answers` và kiểm tra an
toàn như `safety-check` bị loại khỏi tracing nên không tạo trace. Tracing tắt theo mặc định; khi
bật, exporter chỉ gửi route template, method, status, thời lượng và policy codes được cho phép.
Request/response body, case ID, câu trả lời, giá trị xét nghiệm, prompt và passages không được gửi.

## Optional authoring knowledge MCP server

The MCP server is a separate authoring tool. It uses stdio and the separate PostgreSQL knowledge
database; it does not connect to the API case database. The reader connection must use the
`sanad_kn_mcp` read-only role. The checked-in source manifest is empty and no approved corpus is
available, so evidence searches abstain until a reviewed corpus and index exist. The embedding
model ID and max-distance threshold must be configured to match a reviewed index and evaluation;
without them, search returns `KNOWLEDGE_UNAVAILABLE`.

```bash
python3 -m venv apps/knowledge/.venv
apps/knowledge/.venv/bin/python -m pip install -e apps/knowledge
```

Configure `SANAD_KNOWLEDGE_DATABASE_URL`, `SANAD_EMBEDDING_MODEL_ID`, and
`SANAD_KNOWLEDGE_MAX_DISTANCE` in the process environment. `SANAD_KNOWLEDGE_TIMEOUT_MS` is
optional and defaults to 3000. Then launch:

```bash
apps/knowledge/.venv/bin/sanad-knowledge-mcp
```

The command stays attached to stdin/stdout for its MCP host. It accepts only fixed topic codes and
source/chunk identifiers; it has no case, consent, referral, calendar, or write tools. Apply the
one-time database bootstrap in `knowledge/migrations/0001_init.sql` only to the separate knowledge
database. Do not add patient data or unapproved sources to it.

## Start the API

In terminal 1, from the repository root, create your local settings file once:

```bash
cp apps/api/.env.example apps/api/.env
```

`apps/api/.env` is ignored by Git. If you need the simulated staff consoles, set local-only passwords in it:

```dotenv
SANAD_DEMO_REVIEWER_PASSWORD=choose-a-local-only-password
SANAD_DEMO_MOCK_FACILITY_PASSWORD=choose-another-local-only-password
```

Shell variables still work and win over the file, for example `export SANAD_DEMO_REVIEWER_PASSWORD=...`.

Then start Uvicorn from `apps/api`:

```bash
cd apps/api
SANAD_DATABASE_URL='sqlite:///./sanad-dev.db' .venv/bin/uvicorn sanad_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

The SQLite database is created at `apps/api/sanad-dev.db`; it is ignored by Git. The default local API addresses are:

- OpenAPI UI: <http://127.0.0.1:8000/api/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/api/openapi.json>
- Version endpoint: <http://127.0.0.1:8000/version>

The seeded usernames are `demo-reviewer` and `demo-mock-facility`. Without the password settings, staff sign-in is disabled. Keep passwords in `apps/api/.env` or the shell only; never put them in `.env.example`, source files or commits. In the web app, choose **Mock Reviewer** or **Mock Facility** in the top navigation and sign in with the corresponding account.

## Optional: Azure OpenAI answer matching in the chat

The `/intake` chat works with buttons and number fields and needs no model. With a provider enabled, users can also type an answer, and Azure OpenAI suggests which catalogue answer it means; the user confirms before anything is saved (RF-21). **This sends typed text to Microsoft and is not approved yet (CC-011).** Use it only with synthetic text, and never type real health information.

Install the optional extra once:

```bash
cd apps/api
.venv/bin/python -m pip install -e '.[azure]'   # or: uv pip install --python .venv/bin/python -e '.[azure]'
```

Put the settings in `apps/api/.env`, which Git ignores. Start from the committed template:

```bash
cp apps/api/.env.example apps/api/.env
# then edit apps/api/.env: set SANAD_MODEL_PROVIDER=azure_openai and fill in the Azure values
```

The API reads `apps/api/.env` at start-up wherever Uvicorn is started from. A variable set in your shell wins over the file, `SANAD_ENV_FILE=/path/to/file` points to a different file, and empty values count as unset. Never put a real key in `.env.example`, and never commit `.env`. A test fails if the example ever holds a key or password.

| Variable | Value |
|---|---|
| `SANAD_MODEL_PROVIDER` | `azure_openai` (default `disabled`, which makes no model call) |
| `SANAD_AZURE_OPENAI_ENDPOINT` | `https://<resource>.openai.azure.com`. `/openai/v1/` is added for you, and no `api-version` is used. |
| `SANAD_AZURE_OPENAI_DEPLOYMENT` | Your deployment name, not the model name. Choose a model that supports structured outputs. |
| `SANAD_AZURE_OPENAI_AUTH` | `api_key` (default) or `entra_id` |
| `SANAD_AZURE_OPENAI_API_KEY` | The key from the Azure portal (resource → Keys and Endpoint). Leave it unset with `entra_id`. |
| `SANAD_MODEL_TIMEOUT_MS`, `SANAD_MODEL_MAX_ATTEMPTS`, `SANAD_MODEL_MAX_COMPLETION_TOKENS` | Optional. Defaults 12000, 2 and 800 (`TECH_TBD`). |

A filled-in `apps/api/.env` looks like this:

```dotenv
SANAD_MODEL_PROVIDER=azure_openai
SANAD_AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
SANAD_AZURE_OPENAI_DEPLOYMENT=<deployment-name>
SANAD_AZURE_OPENAI_AUTH=api_key
SANAD_AZURE_OPENAI_API_KEY=<key>
```

Then start the API as usual from `apps/api`:

```bash
.venv/bin/uvicorn sanad_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

The start-up log then shows `model adapter: azure_openai (<deployment>)`. A missing or invalid setting stops start-up and names the setting without printing the key.

With `SANAD_AZURE_OPENAI_AUTH=entra_id`, the API uses `DefaultAzureCredential` (for example `az login` locally, or a managed identity when hosted). The identity needs the `Cognitive Services OpenAI User` role on the resource. Hosted deployments should keep the key in Key Vault or protected app settings ([Azure service guide](specs/azure-service-guide.md)).

To turn typing off again, set `SANAD_MODEL_PROVIDER=disabled` in `apps/api/.env` (or remove the line). Emergency handling, consent and the rules never depend on this setting.

## Optional: local decision model (Laya) for answer matching

RF-25, CC-015 (`PROPOSED`). Laya returns a typed choice with probabilities and writes no text. It runs on the API host, so typed chat text does not leave the machine. It handles yes/no and choice questions only; number questions fall back to the buttons. The weight licence is not yet confirmed (OD-17), so use it for local evaluation only.

```powershell
# CPU torch keeps the download small; drop --index-url to get a CUDA build instead.
apps/api/.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
apps/api/.venv/Scripts/python -m pip install -e "apps/api[decision]"
$env:SANAD_MODEL_PROVIDER = "laya_local"
$env:SANAD_LAYA_REVISION = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"  # upstream reviewed pin
$env:USE_TF = "0"
# First run downloads the checkpoint into the Hugging Face cache. Afterwards:
$env:HF_HUB_OFFLINE = "1"
```

On Apple Silicon, `pip install laya-mlx` and `SANAD_LAYA_BACKEND=auto` (or `mlx`) use the MLX port instead. Compare providers on the same synthetic cases with `python eval/run_model_eval.py --provider laya_local` and `--provider azure_openai`; enable Laya in a demo only if its scorecard shows zero unsafe conversions (OD-15, OD-16).

### Fitted head with the vegaml engine (T4.11, CC-017)

The vegaml engine keeps a 0.8B reader frozen and fits small heads plus a calibration on labelled synthetic rows (`eval/decision/intake_rows.v0.1.jsonl`). The RF-23 cases are never used to fit. The calibration directory is not committed; rebuild it from the rows:

```powershell
$rev = "4d2050287982ca7a7bb0c22fd19a389f5f94474e"   # nandakishorm/vega-U, read 2026-11-14
apps/api/.venv/Scripts/python eval/fit_decision_head.py --revision $rev   # add --allow-unreviewed for draft rows
$env:SANAD_MODEL_PROVIDER = "laya_local"
$env:SANAD_LAYA_ENGINE = "vegaml"
$env:SANAD_LAYA_MODEL = "nandakishorm/vega-U"
$env:SANAD_LAYA_REVISION = $rev
$env:SANAD_LAYA_CALIBRATION = "eval/out/decision/calibration"
apps/api/.venv/Scripts/python eval/run_model_eval.py --provider laya_local
```

## Start the web app

In terminal 2, from the repository root:

```bash
cd apps/web
npm run dev -- --host 127.0.0.1
```

Open <http://127.0.0.1:3000>. Vite proxies requests under `/api` to `http://127.0.0.1:8000`, so start the API first. The development server serves the static emergency page at <http://127.0.0.1:3000/urgent.html>.

## Try the local flows

- Start a blank case or choose a synthetic sample on the start screen. The app asks for consent before applying sample data.
- Use the **Mock Reviewer** and **Mock Facility** navigation options for their simulated staff flows. Configure the local-only passwords above before starting the API.
- Keep the emergency page reachable at <http://127.0.0.1:3000/urgent.html>. The service worker caches this static page and does not cache API responses.
- Use separate browser tabs for patient and staff roles if you need to keep their session tokens separate.

## Stop and reset

- Stop either server with `Ctrl+C` in its terminal.
- To reset local API state, stop the API and remove `apps/api/sanad-dev.db`; the API will create an empty database on the next start.
- To reinstall web dependencies from the lockfile, run `npm ci` from `apps/web`.

## Useful project commands

Run from the relevant directory:

```bash
# apps/api
.venv/bin/python -m pytest
.venv/bin/ruff check sanad_api tests

# apps/web
npm run lint
npm run build
npm run preview
```

`npm run preview` serves the most recent `npm run build` output. The Vite development server is the normal local workflow.

## Deploy to Azure Container Apps (manual)

T1.4, `TECH_TBD`. The deploy target (OD-05) is not yet decided, and this is a manual deploy, not the deploy-on-merge that AC-01.4 asks for. Synthetic data only: do not enter real health information in a hosted demo.

Two container apps share one environment:

```text
Browser ──HTTPS──▶ sanad-web  (external ingress, nginx)
                     ├─ /                 built React app, sw.js, urgent.html
                     └─ /api/*, /version ──▶ sanad-api  (internal ingress, FastAPI, exactly 1 replica)
```

The web app calls the relative path `/api`, and the service worker skips `/api/` by path, so the API is served from the same origin through nginx and has no public address. nginx sets `Cache-Control: no-store` on every API response (invariant 11).

| File | Purpose |
|---|---|
| `apps/api/Dockerfile` | API image. Copies `rules/`, `catalogue/`, `schemas/`, `data/synthetic/` and `knowledge/passages.v0.1.json`, which the API loads at start-up. No model extra is installed. |
| `apps/web/Dockerfile` | Builds the web app and serves `dist/` with nginx. |
| `apps/web/nginx/default.conf.template` | Proxy to `${API_HOST}`, cache headers, SPA fallback, client-IP handling for the rate limits. |
| `.dockerignore` | Keeps `apps/api/.env`, `*.db`, `node_modules` and `.git` out of the build context that `az acr build` uploads. |

Build both images from the repository root.

**Try the containers locally first** (needs Docker). Locally there is no Container Apps router, so the web container talks to the API's port directly:

```bash
docker build -f apps/api/Dockerfile -t sanad-api:local .
docker build -f apps/web/Dockerfile -t sanad-web:local .
docker network create sanad-local
docker run -d --name sanad-api --network sanad-local -e SANAD_COMMIT_SHA=local sanad-api:local
docker run -d --name sanad-web --network sanad-local -p 127.0.0.1:8088:80 -e API_HOST=sanad-api:8000 sanad-web:local
# open http://127.0.0.1:8088 ; clean up with:
docker rm -f sanad-web sanad-api && docker network rm sanad-local
```

**First deploy.** `az acr build` builds the images in Azure, so an Apple Silicon Mac needs no local Docker or `--platform` flag. The commands below create billable resources.

```bash
RG=sanad-demo-rg
LOC=uaenorth                    # azure-service-guide §5; UAE North has access restrictions, so confirm your subscription
ACR=sanaddemo$RANDOM            # globally unique, lowercase letters and digits
ENV=sanad-env
SHA=$(git rev-parse --short HEAD)
REVIEWER_PW=$(openssl rand -base64 18)    # never reuse run.sh's local default password
FACILITY_PW=$(openssl rand -base64 18)

az login
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

az group create -n $RG -l $LOC
az acr create -g $RG -n $ACR --sku Basic
az acr build -r $ACR -t sanad-api:$SHA -f apps/api/Dockerfile .
az acr build -r $ACR -t sanad-web:$SHA -f apps/web/Dockerfile .

az containerapp env create -g $RG -n $ENV -l $LOC

# Create the API first: nginx does not start if it cannot resolve "sanad-api".
# --allow-insecure: nginx reaches the API over plain HTTP inside the environment.
az containerapp create -g $RG -n sanad-api --environment $ENV \
  --image $ACR.azurecr.io/sanad-api:$SHA \
  --registry-server $ACR.azurecr.io --registry-identity system \
  --ingress internal --target-port 8000 --allow-insecure \
  --min-replicas 1 --max-replicas 1 \
  --secrets reviewer-pw="$REVIEWER_PW" facility-pw="$FACILITY_PW" \
  --env-vars SANAD_COMMIT_SHA=$SHA \
             SANAD_DEMO_REVIEWER_PASSWORD=secretref:reviewer-pw \
             SANAD_DEMO_MOCK_FACILITY_PASSWORD=secretref:facility-pw

az containerapp create -g $RG -n sanad-web --environment $ENV \
  --image $ACR.azurecr.io/sanad-web:$SHA \
  --registry-server $ACR.azurecr.io --registry-identity system \
  --ingress external --target-port 80 \
  --min-replicas 1 --max-replicas 2 \
  --env-vars API_HOST=sanad-api

WEB=$(az containerapp show -g $RG -n sanad-web --query properties.configuration.ingress.fqdn -o tsv)
echo "https://$WEB"
```

Keep the two passwords somewhere safe; they are the Mock Reviewer and Mock Facility sign-ins for the hosted demo.

**Check the deploy:**

```bash
curl -s  https://$WEB/version                                   # {"commit_sha":"<SHA>"}
curl -sI https://$WEB/api/openapi.json | grep -i cache-control  # no-store
curl -sI https://$WEB/urgent.html | head -1                     # 200
```

Then open the site, load it once, switch DevTools to offline and confirm the emergency page still opens (AC-05.4). Container Apps serves HTTPS, which the service worker needs.

**Redeploy** a new commit:

```bash
SHA=$(git rev-parse --short HEAD)
az acr build -r $ACR -t sanad-api:$SHA -f apps/api/Dockerfile .
az acr build -r $ACR -t sanad-web:$SHA -f apps/web/Dockerfile .
az containerapp update -g $RG -n sanad-api --image $ACR.azurecr.io/sanad-api:$SHA --set-env-vars SANAD_COMMIT_SHA=$SHA
az containerapp update -g $RG -n sanad-web --image $ACR.azurecr.io/sanad-web:$SHA
```

**Remove everything:** `az group delete -n $RG`.

Limits of this setup:

- **Cases are lost on every API restart or redeploy.** SQLite lives at `/tmp/sanad.db` inside the container, which is why the API runs exactly one replica. PostgreSQL is not yet validated as a target (azure-service-guide §3).
- **Rate limits use the real client address.** nginx takes the last `X-Forwarded-For` entry, which the Container Apps ingress adds, and the API trusts forwarded headers only because its ingress is internal. Earlier entries, which a client could forge, are ignored. Confirm this once on the hosted demo.
- **Keep every model provider off.** Do not set `SANAD_MODEL_PROVIDER` (CC-011, OD-13 and OD-17 are open), and leave Langfuse disabled.
- **The interactive API docs are public** through the web address. Uncomment the two `return 404` lines in `apps/web/nginx/default.conf.template` to hide them (azure-service-guide §3).
- **Logs:** nginx access logging is off. API logs go to the environment's Log Analytics workspace; set a short retention period there (azure-service-guide §3).

## Current implementation limits

The web source under `apps/web/src` includes patient, Mock Reviewer, Mock Facility, tracking, consent, safety, intake, report, referral, and closed-loop navigation screens wired to the local API contracts. Source presence is not acceptance evidence: browser, contract and CI checks remain pending for this integration work. The following product work also remains open:

- Synthetic sample and blank start are present; a user-facing upload/file-selection flow remains incomplete (T1.7).
- Manual lab entry is P1 and is not implemented; `/lab` is a labelled placeholder.
- No Arabic translation or RTL UI is present. BRD §8.1 and BRD FR-11/PRD-FR-11 classify its priority differently; see the open scope decision and localization review question before scheduling it.
- The reviewer console shows the API's closed-loop funnel. A full evaluation dashboard with rule-conformance runs, failure-case inspection and report export is not present.
- Emergency-page content is marked `CLINICAL_TBD`; it is not clinically approved guidance.

The only model integration is the optional, off-by-default chat answer matching above (RF-21, `PROPOSED`). There is no real clinic connection, FHIR export or production validation. Use synthetic fixtures only.

Use this setup for local software development with synthetic data only. A server starting successfully does not mean the user journeys pass, the mock screens represent events stored by the API, or any clinical content has been approved. Check the BRD and PRD acceptance criteria before using the app in a demo.

Milestone-by-milestone implementation status is tracked in `specs/referal-flows/implementation-plan.md`; its change history is in `specs/referal-flows/change-log.md`.
