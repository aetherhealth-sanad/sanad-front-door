# Referral Flows — Test Plan

| Item | Value |
|---|---|
| **Status** | Draft for team review. No tests written yet. |
| **Version / date** | 0.1, 2026-11-02 |
| **Verifies** | [Product spec](product-spec.md) `AC-*` and `INV-*` |
| **Built during** | [Implementation plan](implementation-plan.md) `T*` tasks |

> **What passing means.** These tests show the software behaves as specified on synthetic data. They do not show clinical safety, accuracy or validity, and no result may be reported that way. `clinical_agreement` stays `NOT_EVALUATED` until independently labelled cases exist (PRD-AC-19).

## 1. Conventions

**IDs.** `TC-02.3` verifies `AC-02.3`. `TC-INV-05` verifies `INV-05`. Journey tests are `TC-J1-01` and so on. Automated tests carry the ID in their name, so the `spec-trace` check can find them.

**Level**

| Code | Level | Tool |
|---|---|---|
| U | Unit | pytest, Vitest |
| A | API integration against a real test database | pytest with FastAPI client |
| E | End-to-end in a browser | Playwright |
| C | Repository or CI configuration | Scripts, GitHub settings |
| M | Manual, recorded in the PR or release notes | Checklist in §7 |

**Oracle.** Following PRD §7.2, each test uses one truth source. Results from different sources are never combined.

| Code | Source | Used for |
|---|---|---|
| S | Software oracle, written by BA and QA from this spec | State, permissions, validation, UI behaviour |
| D | Draft rule oracle | Consistency with `draft-0.1` rules only. Says nothing about medical correctness. |

**Block.** `B` means a failure blocks merging once the milestone's code exists, and blocks the demo. These cover safety, consent, gates, Mock labels and data integrity. A dash means the failure must be fixed before the milestone exits, but it does not block other PRs.

## 2. Environments

| Environment | Used for |
|---|---|
| **CI** | U, A and E on Chromium, in a mobile viewport for patient flows and desktop for reviewer and mock facility flows. No secrets and no model keys. |
| **CI, extra browsers** | WebKit and Firefox for `TC-05.*` and `TC-09.*`, the checks most likely to differ across browsers. |
| **Staging** | HTTPS smoke test after deploy. |
| **Real devices** | One iPhone with Safari and one Android phone with Chrome, for §7. Playwright WebKit is not iOS Safari, and service worker behaviour differs. |

Time-dependent tests use an injected clock and no sleeps.

## 3. Fixtures

All fixtures are synthetic, follow PRD §4.2 and sit in `data/synthetic/assessments/`. Expected results are software or draft-rule expectations, not medical ground truth.

| Fixture | Scenario | Expected behaviour | Oracle | Milestone |
|---|---|---|---|---|
| J1-001 | High BMI, strength training, no steroid claim | Context questions, no `obesity_confirmed` | D | M2 |
| J1-002 | High BMI, current steroid use (main demo case) | Two signals, `SPECIALIST` floor, `CLINICAL_TBD` | D | M1 for loading, M2 for rules |
| J1-003 | High BMI, context `DECLINED` | `DECLINED` kept, limits shown | S | M2 |
| J1-004 | Same as J1-002 with steroid use in the past | `PAST` kept, not shown as current | S | M2 |
| J4-001 | Simulated emergency trigger | Immediate guidance | D | M2 |
| J4-002 | Same trigger with API stopped and no model configured | Immediate guidance from browser check | S | M2 |
| J5-001 | Required answers missing | `NEEDS_INFORMATION`, no invented values | S | M2 |
| J5-002 | Conflicting answers | Both kept, `CONFLICTING` | S | M2 |
| J3-001 | Valid lab value, unit, date and source | Observation confirmed, draft, no conclusion | D | M3 |
| J3-002 | Missing or invalid unit or date | Held at `NEEDS_USER_CONFIRMATION` | S | M3 |
| J2-001 | T2D, history, optional genetics result (exploratory) | No inference, per-item control | S | M3 |
| CN-001 | Approved case, `provider_share` off | Gate denies | S | M3 |
| CN-002 | Approved case, `provider_share` revoked before send | Gate denies | S | M3 |

That is 13 fixtures, inside the PRD's starting range of 12–20. Test-only upload files live beside the tests: wrong type, oversized, unknown field (`name`), and `is_synthetic` false or missing.

The fixture guard rejects any file under `data/synthetic/` that lacks `is_synthetic: true` or fails its schema.

## 4. Test catalogue

### RF-01 CI/CD

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-01.1 | C | B | Workflow file declares every required check. A PR run shows all of them. | S |
| TC-01.2 | M | B | A test PR with a deliberately failing check, and one with no review, cannot merge. | S |
| TC-01.3 | C | B | A PR run succeeds with no repository secrets exposed to it. | S |
| TC-01.4 | M | — | A merge deploys and `/version` shows its SHA. A forced deploy failure leaves the old SHA live. | S |
| TC-01.5 | M | — | On a clean machine, the documented command starts the app with fixtures. | S |

### RF-02 Start screen

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-02.1 | E | B | All listed elements are visible with no login. No input asks for name, phone or email. | S |
| TC-02.2 | A | B | `POST /cases` returns a `DRAFT` case with a random ID containing no personal data, and no profile data on the case. | S |
| TC-02.3 | E | B | Spy on network and on file read: selecting a file produces neither, until consent is granted. | S |
| TC-02.4 | A | B | After consent, values from a valid file carry `USER_UPLOADED` and `UNVERIFIED`. | S |
| TC-02.5 | A | B | Table test across wrong type, over 256 KB, schema failure, unknown field, `is_synthetic` false or missing: rejected, nothing stored, error repeats no file content. | S |
| TC-02.6 | E | B | Select file, decline consent: nothing is uploaded and the reference is gone. | S |

### RF-03 Consent

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-03.1 | E | B | Five scopes each show the four required statements, and all start off. | S |
| TC-03.2 | A | B | Grant saves version and timestamp, and state becomes `CONSENTED`. | S |
| TC-03.3 | A | B | Decline gives `EDUCATION_ONLY`, and the database holds no assessment data. E2E confirms education and emergency stay available. | S |
| TC-03.4 | A | B | After granting `assessment`, the other four scopes read false. | S |
| TC-03.5 | A | B | Revoke each scope: the next dependent action is denied. The audit entry holds no health content. | S |
| TC-03.6 | A | B | Each patient-data write without `assessment` consent returns 403, and nothing is stored. | S |

### RF-04 Step memory and order guard

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-04.1 | E | B | Reload at each main step: same step, same data. | S |
| TC-04.2 | E | B | For each state in a sample path, open each later route by URL, and press Back: redirected, with state unchanged. | S |
| TC-04.3 | A | B | A forbidden transition returns 409, state is unchanged, and audit entry exists. | S |
| TC-04.4 | U | B | From the transition table: every allowed edge passes and every other state and event pair is rejected. Includes additions R9. | S |
| TC-04.5 | E | B | `/urgent.html` opens in every state and with no session. | S |
| TC-04.6 | E | B | Tamper with storage and client state: the step does not advance. | S |
| TC-04.7 | E | B | Expired, ended and missing session: start screen with no case data. | S |

### RF-05 Offline emergency guidance

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-05.1 | E | B | Load once, wait for the worker, go offline, open the page: full content shown. | S |
| TC-05.2 | E | B | Offline, navigate to `/`, `/intake` and an unknown route: emergency content with offline notice. | S |
| TC-05.3 | E | B | Block all scripts and external requests: page renders, and the link is `tel:998`. | S |
| TC-05.4 | E | B | After full J1, list Cache Storage: only allow-listed URLs, and none under `/api`. | S |
| TC-05.5 | E | B | Page shows version and approval label with no session. No API request is made. | S |
| TC-05.6 | E | — | Serve a new build: the next online load updates the cached content. | S |
| TC-05.7 | E | B | The message is absent before the worker is ready and shown afterwards. | S |
| TC-05.8 | E | B | One-tap link present on every patient route, including decline and error states. | S |

### RF-06 Follow-up form

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-06.1 | E | B | J5-001 shows only missing questions, each with both opt-out choices. | S |
| TC-06.2 | A | B | Each choice stores `DECLINED` or `UNKNOWN`. A read-back never shows `NO` or `NORMAL`. | S |
| TC-06.3 | A | B | J5-002 keeps both values as `CONFLICTING`. Neither is chosen by the system. | S |
| TC-06.4 | U | B | J1-001 produces a context question, and `obesity_confirmed` is absent. | D |
| TC-06.5 | A | B | J1-003 may continue with `NEEDS_MORE_INFORMATION` and limits listed. Unanswered or conflicting items return a block. With a floor firing, the floor applies. | D |
| TC-06.6 | E | B | An emergency answer in the form opens guidance at once. | S |

### RF-07 Send to care facility, Mock

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-07.1 | E | B | Button absent without a draft, and present with exact label and helper text when there is one. | S |
| TC-07.2 | E | B | Without the scope, a prompt appears. Declining sends nothing, and the draft stays visible. | S |
| TC-07.3 | A | B | Direct call without `clinician_review`: 403, state unchanged. | S |
| TC-07.4 | A | B | Success: `PENDING_CLINICIAN_REVIEW`, one queue entry, one audit entry. A repeat call adds no duplicates. | S |
| TC-07.5 | A | B | No referral row exists after sending, and `provider_share` was not needed. | S |
| TC-07.6 | A | B | Emergency and education-only cases are refused, and the button is absent. | S |

### RF-08 Clinician review page

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-08.1 | A | B | No token, patient token and mock facility token each fail on every reviewer endpoint. State unchanged. | S |
| TC-08.2 | E | — | Detail shows facts with source and time, unknowns, rule IDs and version, approval status and evidence status. | S |
| TC-08.3 | E | B | Exact banner text on queue, detail and decision views. | S |
| TC-08.4 | A | B | Each decision makes the right transition and records actor, time, version and reason. `REJECT` with no reason fails. Approval stored as `SIMULATED_APPROVAL`. | S |
| TC-08.5 | A | B | A decision with an old version returns 409 and changes nothing. | S |
| TC-08.6 | A | B | After revocation, the case leaves the queue and decisions are denied. | S |
| TC-08.7 | A | B | An edit below the floor returns 422. An edit above it is accepted. | D |
| TC-08.8 | E | — | `REQUEST_CLARIFICATION` returns the user to the form with the requested question. | S |
| TC-08.9 | E | B | While pending, the user's screens show no recommendation that needs approval. | S |

### RF-09 Quick exit

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-09.1 | E | B | Present on each patient route. One click with no dialog. Reachable by keyboard. | S |
| TC-09.2 | E | B | Instrument the handler: page, forms, stores, file reference and storage are clear before the first network request. | S |
| TC-09.3 | E | B | Back after exit shows no case data, tested with back-forward cache behaviour on all three engines. | S |
| TC-09.4 | E | B | Works with network off and with API returning 500. | S |
| TC-09.5 | A | B | After session end, the old token returns 401. | S |
| TC-09.6 | A | B | Case state and triage are unchanged. The only new audit entry is `SESSION_ENDED`. | S |
| TC-09.7 | E | B | After exit, offline `/urgent.html` opens. | S |
| TC-09.8 | E | — | `document.title` on every patient route equals "Sanad". | S |

### RF-10 Safety check and J4

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-10.1 | E | B | Safety screen comes before any other question and shows the simulated-draft disclosure. | S |
| TC-10.2 | A | B | J4-001 gives `EMERGENCY_GUIDANCE_ISSUED` with no outbound model call, and no further questions. | D |
| TC-10.3 | E | B | API stopped: positive answer shows guidance. Negative answer shows retry and link, and never "all clear". | S |
| TC-10.4 | U | B | Python and TypeScript checks return identical results across every case in `rule_conformance.jsonl`. | D |
| TC-10.5 | A | B | Sending or referring an emergency case is refused. | S |
| TC-10.6 | A | B | A trigger from upload and from the form each reach emergency guidance from every allowed earlier state. | S |
| TC-10.7 | A | — | The audit entry has rule ID and version, with no answer text. | S |

### RF-11 J1 facts, floor and draft

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-11.1 | U | B | J1-002: two separate signals, `SPECIALIST`, `DRAFT-STEROID-01`, `CLINICAL_TBD`. E2E confirms the label is visible. | D |
| TC-11.2 | A | B | J1-004 stays `PAST`, and negated smoking stays `NEGATED`, from storage through to display. | S |
| TC-11.3 | E | B | Both drafts show the four required parts. Text scan finds no diagnosis or probability. | S |
| TC-11.4 | U | B | A claim with a pending source is removed or labelled. `GUIDELINE-TO-BE-REVIEWED` never renders as a citation. | S |
| TC-11.5 | U | — | Repeated runs give byte-identical output for each fixture. | S |
| TC-11.6 | U | B | Property test across rule hits and requested actions: result is never below the floor. | D |

### RF-12 Referral gate

See the truth table in §5.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-12.1 | U, A | B | GT-1 creates one referral in `MOCK_SENT`, and the case is `REFERRAL_REQUESTED`. | S |
| TC-12.2 | U, A | B | GT-2 to GT-10 each give 403 or DENY, all expected codes, no referral row, an audit entry. | S |
| TC-12.3 | A | B | Fetch preview showing pass, revoke consent, send: denied. | S |
| TC-12.4 | U, A | B | GT-11: seed a version change after approval, giving `APPROVAL_STALE`. | S |
| TC-12.5 | U | B | GT-12 to GT-16 each return exactly the expected code. | S |
| TC-12.6 | E | — | `/referral` shows three conditions with status and plain-language next steps. Granting consent there updates the display. | S |
| TC-12.7 | U | B | Architecture test: `Referral` is constructed only in the gate's send function. | S |
| TC-12.8 | U | B | Import-lint test: referral and mock facility modules import no HTTP, SMTP or SMS client. | S |
| TC-12.9 | A | B | With `provider_share` on and `spouse_share` off, a spouse share request is denied. | S |

### RF-13 Mock facility

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-13.1 | A, E | B | Other roles are refused, and the banner is always visible. | S |
| TC-13.2 | U, A | B | Every lifecycle edge passes and every other pair returns 409. Event fields match the required values. | S |
| TC-13.3 | U | B | Schema rejects the four forbidden values, and a repository scan finds no code writing them. | S |
| TC-13.4 | A | B | Snapshot holds only the listed fields. After revocation: `MOCK_WITHDRAWN`, snapshot hidden. | S |
| TC-13.5 | E | B | Facility and appointment text carries the Mock wording. The directory holds only invented names. | S |
| TC-13.6 | A | B | After each event type, triage, review and consent are unchanged. | S |

### RF-14 Tracking and delayed flag

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-14.1 | E | — | Timeline shows each stage in order with time and source label. | S |
| TC-14.2 | U | B | Controlled clock: off at exactly the threshold, on one second past, for each of the four stages. | S |
| TC-14.3 | E, U | B | Exact wording. Clears on next event. Absent on end states and on `MOCK_APPOINTMENT_SCHEDULED`. | S |
| TC-14.4 | A | B | When flag is on: triage unchanged, no reminder path exists, and wording does not attribute the delay to the user. | S |
| TC-14.5 | E | B | Rejected and closed cases show non-clinical options, and the text scan finds no claim of completed care. | S |
| TC-14.6 | A | B | Another case's ID returns 404. The reviewer's detail shows the same flag. | S |
| TC-14.7 | E | — | The flag has text and an icon, and passes contrast checks. | S |

### RF-15 J3 lab entry

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-15.1 | E | — | J3-001 entry leads to a preview, then a confirmed observation. | S |
| TC-15.2 | A | B | J3-002 stays `NEEDS_USER_CONFIRMATION`, is not used in the draft, and is not converted. | S |
| TC-15.3 | E | B | Exact sentence is shown, and text scan finds no conclusion about having children. | S |
| TC-15.4 | E | — | After consent and safety check, `/lab` opens without the full intake. | S |
| TC-15.5 | E | — | J3 reaches review, gate and tracking through the same endpoints. | S |
| TC-15.6 | A | B | Contradicting self-report and lab value are both kept with their sources, as `CONFLICTING`. | S |

### RF-16 J2 selective evidence

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-16.1 | A | — | An excluded item is not in signals or drafts, and stays marked as excluded. | S |
| TC-16.2 | U | B | J2-001 with family history and no result: no output names a genetic condition. | S |
| TC-16.3 | E | — | Genetics support is absent with no result or no valid consent, and present with both. | S |
| TC-16.4 | A | — | J2 requires review and is refused by the gate until approved. | S |

### RF-17 Mock labelling

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-17.1 | E | B | Each listed element shows the word Mock. | S |
| TC-17.2 | A | B | Each listed response includes `is_mock: true`, and events include `SIMULATED`. | S |
| TC-17.3 | E | B | The audit reads `eval/mock-screens.json`, visits each screen and fails on a missing label. A check confirms that each route with simulated data is on the list. | S |
| TC-17.4 | E | B | Text scan on mock screens finds no raw enum code standing alone. | S |

### Invariants

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-INV-01 | A, E | B | All journeys pass with no model configured, and network capture shows no model endpoint. | S |
| TC-INV-02 | C | B | Fixture guard runs in CI, and a test file without the marker fails it. | S |
| TC-INV-03 | A | B | Run all journeys with marker values in answers and lab fields. Search logs, audit and telemetry: no marker found. | S |
| TC-INV-04 | A | B | Generated from OpenAPI: every protected endpoint is called with no token, wrong role and wrong case, and refused. | S |
| TC-INV-05 | A | B | For each field across all fixtures, `UNKNOWN`, `NOT_ASKED` and `DECLINED` survive to storage, API and display. | S |
| TC-INV-06 | E | B | Forbidden-phrase scan of all rendered results across all fixtures. | S |
| TC-INV-07 | E | B | No permission prompts during all journeys, and code scan finds no `getUserMedia`. | S |
| TC-INV-08 | M | — | Copy review against the neutral language rules. | S |
| TC-INV-09 | A | B | Sample of each audit event type has all required fields. | S |
| TC-INV-10 | E | — | axe-core smoke check on each screen and a keyboard-only J1 run. | S |
| TC-INV-11 | E | — | At 360 px wide, no patient route scrolls horizontally. | S |

### Journeys

Each runs through the real UI and API with one fixture.

| Test | Fixture | Path | Milestone |
|---|---|---|---|
| TC-J4-01 | J4-001 | Blank start, consent, safety screen with the fixture's answers, guidance | M2 |
| TC-J4-02 | J4-002 | Same with API stopped and no model | M2 |
| TC-J1-01 | J1-002 | Start, consent, safety, form, draft, send, review, approval | M2 |
| TC-J1-02 | J1-003 | Same with a declined answer, then limits shown | M2 |
| TC-J5-01 | J5-001, J5-002 | Missing and conflicting, then the form, then `NEEDS_MORE_INFORMATION` | M2 |
| TC-J1-03 | J1-002 | From approval: blocked, consent granted, referral, accepted, appointment, closed | M3 |
| TC-J1-04 | J1-002 | From referral: rejected, explained | M3 |
| TC-DL-01 | J1-002 | No mock response: flag appears, event arrives, flag clears | M3 |
| TC-CN-01 | CN-001 | Referral denied, reason shown | M3 |
| TC-CN-02 | CN-002 | Revoked before send, denied. Revoked after send, `MOCK_WITHDRAWN`. | M3 |
| TC-J3-01 | J3-001 | Lab entry through to mock referral | M3 |
| TC-J3-02 | J3-002 | Bad unit held, not used | M3 |
| TC-J2-01 | J2-001 | Selective evidence through review | M3 |

## 5. Referral gate truth table

`evaluate_gate` is a pure function, so unit tests cover all eight rows. Rows where approval or policy fails while the state is otherwise correct cannot all be reached through normal API use, and the API tests seed those states directly.

| Row | Consent | Approval | Policy | Result | Codes |
|---|---|---|---|---|---|
| GT-1 | Pass | Pass | Pass | **ALLOW** | None |
| GT-2 | Fail | Pass | Pass | DENY | `CONSENT_PROVIDER_SHARE_MISSING` |
| GT-3 | Pass | Fail | Pass | DENY | `APPROVAL_MISSING` |
| GT-4 | Pass | Pass | Fail | DENY | `STATE_NOT_ELIGIBLE` |
| GT-5 | Fail | Fail | Pass | DENY | Both consent and approval codes |
| GT-6 | Fail | Pass | Fail | DENY | Both consent and policy codes |
| GT-7 | Pass | Fail | Fail | DENY | Both approval and policy codes |
| GT-8 | Fail | Fail | Fail | DENY | All three |

Single-cause denials:

| Row | Setup | Expected code |
|---|---|---|
| GT-9 | `provider_share` granted, then revoked | `CONSENT_PROVIDER_SHARE_REVOKED` |
| GT-10 | Latest decision is a rejection | `APPROVAL_REJECTED` |
| GT-11 | Approval is for an older case version | `APPROVAL_STALE` |
| GT-12 | Triage is `EMERGENCY_GUIDANCE`, `EDUCATION` or `NEEDS_MORE_INFORMATION` | `TRIAGE_NOT_ELIGIBLE` |
| GT-13 | Case is not synthetic (seeded) | `CASE_NOT_SYNTHETIC` |
| GT-14 | A referral already exists | `REFERRAL_ALREADY_EXISTS` |
| GT-15 | Target not in the mock directory | `TARGET_NOT_IN_MOCK_DIRECTORY` |
| GT-16 | State is earlier than `NAVIGATION_STARTED` | `STATE_NOT_ELIGIBLE` |

Access checks run before the gate. Another patient's token, a reviewer's token or a mock facility token gets 403 or 404 with no gate details, so denial reasons do not leak.

## 6. PRD acceptance coverage

| PRD criterion | Tests |
|---|---|
| PRD-AC-01 private start | TC-02.1, TC-02.2 |
| PRD-AC-02 decline gives education only | TC-03.3 |
| PRD-AC-03 provider share absent or revoked | TC-12.2, TC-CN-01, TC-CN-02 |
| PRD-AC-04 emergency with no LLM | TC-10.2, TC-J4-02 |
| PRD-AC-05 BMI not obesity | TC-06.4 |
| PRD-AC-06 steroid floor | TC-11.1 |
| PRD-AC-07 declined stays declined | TC-06.2 |
| PRD-AC-08 conflicts kept | TC-06.3 |
| PRD-AC-09 bad lab unit | TC-15.2 |
| PRD-AC-10 no source, no claim | TC-11.4 |
| PRD-AC-11 reports with limits | TC-11.3 |
| PRD-AC-12 non-clinician refused | TC-08.1 |
| PRD-AC-13 stale review | TC-08.5 |
| PRD-AC-14 pending blocks action | TC-08.9, TC-12.2 |
| PRD-AC-15 mock referral only | TC-12.1, TC-17.2 |
| PRD-AC-17 outage fallback | TC-INV-01 |
| PRD-AC-21 spouse denied | TC-12.9 |
| PRD-AC-22 missing shown | TC-06.5 |
| PRD-AC-23 no booking needed | TC-02.1 |
| PRD-AC-24 past stays past | TC-11.2 |
| PRD-AC-25 negation stays | TC-11.2 |
| PRD-AC-26 conflict with lab | TC-15.6 |
| PRD-AC-33 no camera | TC-INV-07 |
| PRD-AC-41 boundary: no completed care from the mock | TC-13.3, TC-14.5 |

**Not covered here:** PRD-AC-16 (Arabic), PRD-AC-18 and 19 (evaluation run), PRD-AC-20 and 34 (research isolation), PRD-AC-27 to 32 (P1 and P2 features), PRD-AC-35 to 40 (J9, J10, funnel). These stay open for the MVP.

**Golden sets.** Journey and gate cases feed `eval/golden/workflow_cases.jsonl`, `rule_conformance.jsonl` and `consent_security.jsonl`, counting towards the PRD's 36-case target. `closed_loop_navigation.jsonl` and `evidence_grounding.jsonl` belong to the uncovered items.

## 7. Manual checklists

Record device, browser, commit SHA, date and tester in the PR or release notes.

**Offline emergency (M1 exit, real phones)**

- [ ] Load the app online and wait for the offline message.
- [ ] Turn on airplane mode, then close and reopen the browser.
- [ ] `/urgent.html` opens with full content.
- [ ] Other routes show the emergency content.
- [ ] The 998 link opens the dialler.

**Quick exit (M2 exit, real phones)**

- [ ] Fill part of a form, select a file and tap Quick exit once.
- [ ] The neutral page appears with no visible flash of case data.
- [ ] Back shows no case data.
- [ ] Task switcher and browser's recent-tab preview show no case data. If a preview persists, record it as a known limit.
- [ ] Repeat with airplane mode on.

**Demo safety (before each demo)**

- [ ] No clinical claim without an approval status or `CLINICAL_TBD`.
- [ ] Emergency path works.
- [ ] A denied referral is shown to be denied.
- [ ] Every simulated element reads Mock.
- [ ] No real data in the environment.

Any failure is a BRD stop-the-demo condition: fix it before presenting.

## 8. CI gates

| Check | Runs | Becomes required |
|---|---|---|
| `lint-types` | Ruff, mypy, ESLint, `tsc` | M1 |
| `test-unit` | pytest and Vitest unit tests | M1 |
| `test-api` | API integration tests | M1 |
| `contract-drift` | Generated client matches OpenAPI | M1 |
| `build` | Web and API builds | M1 |
| `e2e` | Playwright | M1 |
| `secret-scan` | Gitleaks | M1 |
| `fixture-guard` | Synthetic marker and schema on all fixtures | M1 |
| `spec-trace` | See below | M1 |

**`spec-trace`** enforces the link between spec and tests:

- Every `AC-*` and `INV-*` in the product spec has a `TC-*` in this plan.
- Every automated `TC-*` for a finished milestone has a test carrying its ID.
- A `TC-*` referring to a removed `AC-*` fails the check.

## 9. Exit criteria and reporting

A milestone exits when all of these are true:

- Every blocking test for its scope passes in CI on the merge commit.
- Non-blocking tests pass, or each failure is listed in the release notes with an owner.
- The relevant manual checklists are recorded.
- No open defect touches an invariant.

Each milestone report states commit SHA, rule catalogue version, consent version, pass and fail counts by level, failed cases and what was not tested. Rule tests report as **draft rule conformance**. Clinical agreement reports as `NOT_EVALUATED`.

**Not tested by this plan:** whether draft rules or emergency guidance are medically correct, real user comprehension, load or performance limits, real data handling, Arabic and RTL, and legal compliance.
