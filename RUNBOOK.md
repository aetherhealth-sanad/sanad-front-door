# Sanad Local Runbook

This runbook starts the current local API and web source for development. Sanad is a research prototype, not a medical device. Use synthetic fixtures only; no model provider or real clinic connection is configured.

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

The API loads rules, consent/question catalogues, and synthetic fixtures from this repository when it starts. It makes no model calls and needs no cloud credentials.

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

In terminal 1, from the repository root, set local-only passwords first if you need the simulated staff consoles:

```bash
export SANAD_DEMO_REVIEWER_PASSWORD='choose-a-local-only-password'
export SANAD_DEMO_MOCK_FACILITY_PASSWORD='choose-another-local-only-password'
```

Then start Uvicorn from `apps/api`:

```bash
cd apps/api
SANAD_DATABASE_URL='sqlite:///./sanad-dev.db' .venv/bin/uvicorn sanad_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

The SQLite database is created at `apps/api/sanad-dev.db`; it is ignored by Git. The default local API addresses are:

- OpenAPI UI: <http://127.0.0.1:8000/api/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/api/openapi.json>
- Version endpoint: <http://127.0.0.1:8000/version>

The seeded usernames are `demo-reviewer` and `demo-mock-facility`. Without the password environment variables, staff sign-in is disabled. Do not put passwords in source files or commit them. In the web app, choose **Mock Reviewer** or **Mock Facility** in the top navigation and sign in with the corresponding account.

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

## Current implementation limits

The web source under `apps/web/src` includes patient, Mock Reviewer, Mock Facility, tracking, consent, safety, intake, report, referral, and closed-loop navigation screens wired to the local API contracts. Source presence is not acceptance evidence: browser, contract and CI checks remain pending for this integration work. The following product work also remains open:

- Synthetic sample and blank start are present; a user-facing upload/file-selection flow remains incomplete (T1.7).
- Manual lab entry is P1 and is not implemented; `/lab` is a labelled placeholder.
- No Arabic translation or RTL UI is present. BRD §8.1 and BRD FR-11/PRD-FR-11 classify its priority differently; see the open scope decision and localization review question before scheduling it.
- The reviewer console shows the API's closed-loop funnel. A full evaluation dashboard with rule-conformance runs, failure-case inspection and report export is not present.
- Emergency-page content is marked `CLINICAL_TBD`; it is not clinically approved guidance.

There is no LLM/model integration, real clinic connection, FHIR export or production validation. Use synthetic fixtures only.

Use this setup for local software development with synthetic data only. A server starting successfully does not mean the user journeys pass, the mock screens represent events stored by the API, or any clinical content has been approved. Check the BRD and PRD acceptance criteria before using the app in a demo.

Milestone-by-milestone implementation status is tracked in `specs/referal-flows/implementation-plan.md`; its change history is in `specs/referal-flows/change-log.md`.
