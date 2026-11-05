# AGENTS.md

Instructions for anyone changing this repository, human or AI coding agent. Read this before you touch anything.

## What this repository is

**Sanad** is a private front door for men's reproductive health, built by AetherHealth for the Future Health Digital Innovation Challenge 2026. It is a **research prototype and not a medical device**. It does not diagnose, prescribe, or estimate a personal probability of infertility.

**Current state:** the repository has a Python/FastAPI backend, React/TypeScript patient and simulated staff UI under `apps/web`, synthetic fixtures, draft rule catalogues, a golden rule set and pytest API tests under `apps/api`. UI/API source integration exists but still needs acceptance and CI verification. Production FHIR export/validation and model integration are not present.

## Where the truth lives

Read in this order. When two documents disagree, the higher one wins. Stop and raise the conflict instead of choosing silently.

| # | Document | Decides |
|---|---|---|
| 1 | [BRD v0.4](specs/Sanad_AetherHealth_BRD_v0.4.md) | Business rules (`BR-*`), journeys, MVP scope |
| 2 | [PRD v0.4](specs/Sanad_AetherHealth_PRD_v0.4.md) | Product contracts (`PRD-FR-*`, `PRD-AC-*`), case state machine |
| 3 | [E2E workflow v0.4](specs/Sanad_E2E_Workflow_v0.4.md) | Cross-actor flow and exchange boundaries |
| 4 | [Product spec](specs/referal-flows/product-spec.md) | Referral flow behaviour (`RF-*`, `AC-*`, `INV-*`) where not superseded by v0.4 |
| 5 | [Implementation plan](specs/referal-flows/implementation-plan.md) | Stack, structure, tasks (`T*`) |
| 6 | [API design](specs/referal-flows/api-design.md) | Endpoints, access checks, action rules, error codes |
| 7 | [Test plan](specs/referal-flows/test-plan.md) | How each criterion is verified (`TC-*`) |
| 8 | [README](README.md) | Repository status, quickstart and implementation notes. It never overrides the BRD or PRD on scope. |

The product spec extends the PRD in a few places. Those extensions are listed in [product-spec §10](specs/referal-flows/product-spec.md#10-reconciliation-with-the-brd-and-prd) and recorded in the [change log](specs/referal-flows/change-log.md). Until an approver signs them, treat them as `PROPOSED`.

Status tags: `TEAM_DECISION`, `PROPOSED`, `CLINICAL_TBD` (not approved by a clinician), `TECH_TBD` (needs technical verification), `RESEARCH_ONLY` (never used for care decisions).

## How work happens here: spec first

Order of work for every change:

1. **Find the requirement.** Every change traces to an `RF-*` requirement and a `T*` task. If none exists, go to step 2. If one does, skip to step 3.
2. **Change the spec first.** Update the product spec, then the implementation plan and test plan, and add a change-log entry. Get it reviewed.
3. **Write the failing test.** Name it with its `TC-*` ID so the traceability check can find it.
4. **Implement only what the task asks.** Do not add features, refactors or abstractions the task does not need.
5. **Update the task status** in the implementation plan in the same PR.

If the code and the spec disagree, the spec is right until it is changed. Do not edit a spec to match code that already drifted without saying so in the change log.

Do not start a later milestone until the current milestone's exit criteria in the implementation plan pass.

## Rules that must never break

These hold on every branch and in every demo. Full list with test IDs: [product-spec §8](specs/referal-flows/product-spec.md#8-invariants), as constrained by BRD/PRD v0.4.

1. **The backend decides.** Consent, role and case state are checked on the server at the moment of each action. Disabling a button is not a control.
2. **Referrals pass the gate.** A referral exists only if user consent, clinician approval and backend policy all pass. `evaluate_gate` is the only code path that creates one.
3. **Rules run before anything else.** Emergency guidance never waits for a model, a clinician, the network or the rest of a questionnaire.
4. **Emergency guidance stays reachable.** It works from every state, without consent, and offline after the first load. Never put it behind a guard.
5. **Unknown stays unknown.** `UNKNOWN`, `NOT_ASKED` and `DECLINED` never become `NO` or `NORMAL`. Missing data never means low risk.
6. **Nothing simulated looks real.** Every simulated element shows the word **Mock** to the user and carries `is_mock: true` and `verification_source: SIMULATED` in data.
7. **Nothing claims verified care.** No code path writes `PROVIDER_VERIFIED` or `CARE_COMPLETED`.
8. **No clinical conclusions.** No infertility diagnosis, no personal probability, no conclusion from a single BMI, habit or lab value.
9. **Synthetic data only.** No real patient data in fixtures, logs, screenshots or tests. No names, phone numbers or other identifiers.
10. **Logs stay thin.** Log who, when, which action and which versions. Never log answers, lab values or free text.
11. **API responses are never cached** by the service worker. Only the allow-listed static files are.
12. **No outbound referral transport.** The referral modules contain no HTTP, email or SMS client. Nothing leaves for a real clinic.
13. **No camera.** No camera prompts, video, or facial or emotion analysis.
14. **Neutral language.** Say "men's health", not "infertility". Assume nothing about marriage, religion or plans for children.
15. **Psychosocial context stays contextual.** The optional maximum of three self-reports is `PATIENT_REPORTED` and `UNVERIFIED`; it never enters triage rules or supports diagnosis/semen prediction. See PRD-FR-29/30.
16. **Closed-loop events stay session scoped.** Acknowledgement is a system event; booking/visit are user-reported and unverified. Progress and barrier data are deleted at session end/expiry. No provider verification or `CARE_COMPLETED` write exists.
17. **FHIR status stays honest.** The mapping manifest is conceptual, `NOT_EVALUATED`, and never implies interoperability or conformance.

**Stop and fix first** if you find a dangerous clinical claim without approval or source, a broken emergency path, a consent bypass, real personal data in a trace, or a mock referral shown as real. Do not merge or demo around it.

## Things you must not decide alone

Stop and ask a human when a task needs any of these:

- A clinical rule, threshold, triage level, emergency trigger, or the wording of emergency guidance.
- A response time or SLA presented as clinically meaningful.
- A change to consent scopes, label taxonomy, the case state machine or data policy.
- Any real provider, clinic or hospital name.
- Anything that sends data outside the app.

Changes to clinical rules, triage levels, label taxonomy, consent scopes or data policy need change control: an issue or PR recording `reason → evidence → affected journeys → tests → approver → version`, plus a [change-log](specs/referal-flows/change-log.md) entry. **Never describe an unapproved rule as approved.** There is no clinical advisor yet, so all clinical content is `CLINICAL_TBD` and must be shown as simulated.

## Scope of the current work

Use the bounded P0 scope in [BRD v0.4](specs/Sanad_AetherHealth_BRD_v0.4.md) and [PRD v0.4](specs/Sanad_AetherHealth_PRD_v0.4.md). J9/J10 and optional psychosocial API contracts are tracked in T4.2/T4.1, with patient UI source now present; tests and review remain pending. The current source makes **no LLM calls**. FHIR is a conceptual mapping only; export, validation, RAG, full evaluation reporting and provider integrations remain unimplemented.

## Repository layout

Today:

```text
AGENTS.md
README.md
apps/api/sanad_api/   # Python/FastAPI backend
apps/api/tests/       # pytest API/unit coverage
apps/web/src/         # React/TypeScript patient and simulated staff UI
apps/web/public/      # Static emergency page and service worker
RUNBOOK.md            # Local API and web development setup
catalogue/            # Versioned consent, question and service data
data/synthetic/       # Synthetic fixtures only
eval/golden/          # Rule conformance cases
rules/                # Draft rule catalogues, CLINICAL_TBD
specs/
├── Sanad_AetherHealth_BRD_v0.4.md
├── Sanad_AetherHealth_PRD_v0.4.md
├── Sanad_E2E_Workflow_v0.4.md
└── referal-flows/
    ├── product-spec.md
    ├── implementation-plan.md
    ├── api-design.md
    ├── test-plan.md
    └── change-log.md
```

Planned layout: [implementation-plan §3](specs/referal-flows/implementation-plan.md#3-repository-layout).

## Commands

From the repository root, install and start the local API:

```bash
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -e 'apps/api[dev]'
apps/api/.venv/bin/uvicorn sanad_api.main:create_app --factory --app-dir apps/api --reload
```

Run the backend suite from `apps/api` with `.venv/bin/python -m pytest`. Ruff is configured in `apps/api/pyproject.toml`; run `.venv/bin/ruff check sanad_api tests` from `apps/api`. Do not run with real patient data or connect an outbound referral transport.

For the web app, run `npm ci` and `npm run dev -- --host 127.0.0.1` from `apps/web`; use the complete two-terminal setup in [RUNBOOK.md](RUNBOOK.md). The web development server proxies `/api` to the local API.

## Git and pull requests

- Branch as `feat/<issue>-<name>` from `main`. Spec-only work uses `spec/<name>`.
- Open a PR with `Closes #<issue>` and at least one review.
- List the `RF-*`, `T*` and `TC-*` IDs the PR covers in its description.
- Keep PRs to one task where possible.
- Never commit keys, tokens or real data. Never skip hooks or CI checks to get a merge through.
- Do not push or merge unless asked to.

## Definition of done

A task is done when all of these are true:

- [ ] Its `TC-*` tests exist, are named with their IDs, and pass in CI.
- [ ] Negative paths are tested at the API, not only in the UI.
- [ ] The invariants above still hold.
- [ ] Every simulated element touched shows **Mock**.
- [ ] New user-facing clinical text is tagged `CLINICAL_TBD` or carries its approval.
- [ ] Specs and the change log reflect anything that changed.
- [ ] The task is marked done in the implementation plan.

A passing test suite proves the software behaves as specified. **It is never evidence of clinical safety or validity.** Do not write or imply otherwise in code, docs, PRs or demos.
