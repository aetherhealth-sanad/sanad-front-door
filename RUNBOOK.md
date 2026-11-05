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
