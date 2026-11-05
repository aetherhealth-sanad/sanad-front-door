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

## Start the API

In terminal 1, from the repository root:

```bash
cd apps/api
SANAD_DATABASE_URL='sqlite:///./sanad-dev.db' .venv/bin/uvicorn sanad_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

The SQLite database is created at `apps/api/sanad-dev.db`; it is ignored by Git. The default local API addresses are:

- OpenAPI UI: <http://127.0.0.1:8000/api/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/api/openapi.json>
- Version endpoint: <http://127.0.0.1:8000/version>

To enable the API's seeded staff accounts for direct API development, set local-only passwords in this terminal before starting Uvicorn:

```bash
export SANAD_DEMO_REVIEWER_PASSWORD='choose-a-local-only-password'
export SANAD_DEMO_MOCK_FACILITY_PASSWORD='choose-another-local-only-password'
```

The usernames are `demo-reviewer` and `demo-mock-facility`. Without these environment variables, staff sign-in is disabled. Do not put passwords in source files or commit them. The current web UI does not include a staff sign-in flow.

## Start the web app

In terminal 2, from the repository root:

```bash
cd apps/web
npm run dev -- --host 127.0.0.1
```

Open <http://127.0.0.1:3000>. Vite proxies requests under `/api` to `http://127.0.0.1:8000`, so start the API first. The development server serves the static emergency page at <http://127.0.0.1:3000/urgent.html>.

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

The web source exists under `apps/web/src`, but the patient, reviewer, facility, and tracking screens are not yet reliably integrated with the current API contracts. For example, consent, safety, intake, report, review, referral, and tracking requests use payloads or response shapes that differ from the API. Some screens show local fallback content after request failures. The current safety screen therefore blocks assessment continuation when its safety request fails; the screen still needs to collect and submit the required safety answers. Quick Exit also sends a session-end field name the API does not accept, so server-side session cleanup waits for token expiry.

Use this setup for local software development with synthetic data only. A server starting successfully does not mean the user journeys pass, the mock screens represent events stored by the API, or any clinical content has been approved. Check the BRD and PRD acceptance criteria before using the app in a demo.

The README, `AGENTS.md`, and referral-flow implementation plan contain older statements that the web UI is absent. This runbook reflects the source currently present in `apps/web`.
