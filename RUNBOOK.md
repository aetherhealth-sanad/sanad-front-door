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

The API loads rules, consent/question catalogues, and synthetic fixtures from this repository when it starts. By default it makes no model calls and needs no cloud credentials. The optional Azure OpenAI answer matching for the chat is described [below](#optional-azure-openai-answer-matching-in-the-chat).

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

## Optional: Azure OpenAI answer matching in the chat

The `/intake` chat works with buttons and number fields and needs no model. With a provider enabled, users can also type an answer, and Azure OpenAI suggests which catalogue answer it means; the user confirms before anything is saved (RF-21). **This sends typed text to Microsoft and is not approved yet (CC-011).** Use it only with synthetic text, and never type real health information.

Install the optional extra once:

```bash
cd apps/api
.venv/bin/python -m pip install -e '.[azure]'   # or: uv pip install --python .venv/bin/python -e '.[azure]'
```

Set these in the API's environment before starting Uvicorn. Never put a key in a file in the repository.

| Variable | Value |
|---|---|
| `SANAD_MODEL_PROVIDER` | `azure_openai` (default `disabled`, which makes no model call) |
| `SANAD_AZURE_OPENAI_ENDPOINT` | `https://<resource>.openai.azure.com`. `/openai/v1/` is added for you, and no `api-version` is used. |
| `SANAD_AZURE_OPENAI_DEPLOYMENT` | Your deployment name, not the model name. Choose a model that supports structured outputs. |
| `SANAD_AZURE_OPENAI_AUTH` | `api_key` (default) or `entra_id` |
| `SANAD_AZURE_OPENAI_API_KEY` | The key from the Azure portal (resource → Keys and Endpoint). Leave it unset with `entra_id`. |
| `SANAD_MODEL_TIMEOUT_MS`, `SANAD_MODEL_MAX_ATTEMPTS`, `SANAD_MODEL_MAX_COMPLETION_TOKENS` | Optional. Defaults 12000, 2 and 800 (`TECH_TBD`). |

```bash
export SANAD_MODEL_PROVIDER=azure_openai
export SANAD_AZURE_OPENAI_ENDPOINT='https://<resource>.openai.azure.com'
export SANAD_AZURE_OPENAI_DEPLOYMENT='<deployment-name>'
export SANAD_AZURE_OPENAI_API_KEY='<key>'
SANAD_DATABASE_URL='sqlite:///./sanad-dev.db' .venv/bin/uvicorn sanad_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

The start-up log then shows `model adapter: azure_openai (<deployment>)`. A missing or invalid setting stops start-up and names the setting without printing the key.

With `SANAD_AZURE_OPENAI_AUTH=entra_id`, the API uses `DefaultAzureCredential` (for example `az login` locally, or a managed identity when hosted). The identity needs the `Cognitive Services OpenAI User` role on the resource. Hosted deployments should keep the key in Key Vault or protected app settings ([Azure service guide](specs/azure-service-guide.md)).

To turn typing off again, unset `SANAD_MODEL_PROVIDER` or set it to `disabled`. Emergency handling, consent and the rules never depend on this setting.

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

The only model integration is the optional, off-by-default chat answer matching above (RF-21, `PROPOSED`). There is no real clinic connection, FHIR export or production validation. Use synthetic fixtures only.

Use this setup for local software development with synthetic data only. A server starting successfully does not mean the user journeys pass, the mock screens represent events stored by the API, or any clinical content has been approved. Check the BRD and PRD acceptance criteria before using the app in a demo.

Milestone-by-milestone implementation status is tracked in `specs/referal-flows/implementation-plan.md`; its change history is in `specs/referal-flows/change-log.md`.
