# Referral Flows — Test Plan

| Item | Value |
|---|---|
| **Status** | Draft for team review. Python tests exist for the v0.3 API; v0.4 cases below still need automated coverage. |
| **Version / date** | 0.2, 2026-11-03 |
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

### RF-26 Harness controls (PROPOSED; not an active CI gate)

These tests remain proposed and are not an active CI gate. They need to be authored and made blocking after CC-016 approval; the implementation work is present but has not been accepted. They verify software behavior, not clinical accuracy.

| ID | Setup / action | Blocking? | Expected |
|---|---|---:|---|
| TC-HR-01 | Run referral actions through the backend guard and `evaluate_gate` | B | Missing consent, approval or backend authorization denies; no alternate referral creator exists |
| TC-HR-02 | Submit invalid or oversized structured input and inspect response/logs | B | Closed-schema rejection with reason codes only; submitted values are not repeated in logs or errors |
| TC-HR-03 | Trigger the existing emergency catalogue while optional harness services are disabled or unavailable | B | Existing emergency path is unchanged and does not call MCP or Langfuse |
| TC-HR-04 | Start the API with Langfuse unset or disabled | B | No Langfuse client is initialized and no telemetry is sent |
| TC-HR-05 | Enable Langfuse against a test sink and submit synthetic cases | B | Export contains only the approved operational allowlist; no request body, answer, lab, prompt, passage, token or case identifier |
| TC-HR-06 | Make the configured Langfuse sink unavailable during a request | B | API response, audit write and policy decision are unchanged; exporter failure is contained |
| TC-HR-07 | Inspect MCP discovery and tool listing for Mode A | B | Pinned protocol and tool manifest; read-only tools only; no case, consent, review, referral, calendar or write capability |
| TC-HR-08 | Query MCP with no active approved source, a non-approved source, or a mismatched protocol/tool manifest | B | No passage is returned; result is `NO_GROUNDED_EVIDENCE` or a closed failure code; triage and referral gate do not change |

### PRD v0.4 psychosocial, navigation and FHIR design

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-18.1 | A | B | Save zero to three optional psychosocial answers; omitted answers remain `NOT_ASKED`, declined and unknown remain distinct, and intake continues. | S |
| TC-18.2 | A | B | Each saved response has `PATIENT_REPORTED`, `UNVERIFIED`, assessment scope and reference period; missing assessment consent is denied. | S |
| TC-18.3 | A | B | Psychosocial data appears only as context and cannot change rule signals, floor or action. | S |
| TC-18.4 | A | B | Reviewer can see psychosocial context only with active clinician-review consent; audit stores no answers. | S |
| TC-19.1 | A | B | Report display alone is not acknowledgement; explicit acknowledgement is tied to current guidance and deduplicated. | S |
| TC-19.2 | A | B | Progress events are append-only and source-labelled; booking/visit remain user-reported and unverified; a Mock referral is `SIMULATED`. | S |
| TC-19.3 | A | B | Barrier codes are bounded, free text is rejected, and `PREFER_NOT_TO_SAY` is exclusive. | S |
| TC-19.4 | A | B | Quick exit and expired-session cleanup delete navigation data; a new session cannot read old progress. | S |
| TC-19.5 | A | B | Funnel has explicit numerator/denominator and source; provider verification and care completion remain `NOT_AVAILABLE`. | S |
| TC-19.6 | A | B | Replaying a progress or barrier request with the same idempotency key and payload creates no extra data or audit event; reusing a key with a different payload returns 409 and changes nothing. | S |
| TC-20.1 | C | — | Mapping manifest lists source, target, transform, null handling, provenance and gaps; status is design-only, not FHIR conformance. | S |
| TC-20.2 | C | B | Fixture manifest covers every synthetic case file, has no stale path, and keeps clinical truth `NOT_EVALUATED` and unsupported reference ranges unverified. | S |

### RF-25 Local decision-model provider (`PROPOSED`)

Automated tests go in `apps/api/tests/test_laya_adapter.py`. They replace the `laya` package with a stub that returns fixed answers, so CI downloads no weights and needs no GPU. The live check is a manual run of the RF-23 harness with `--provider laya_local` on a machine that has the pinned weights cached. Neither says anything about clinical quality.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-25.1 | U | B | `laya_local` without the extra installed, without a revision, or with an unknown backend stops start-up with a message naming the setting. | S |
| TC-25.2 | U | B | The adapter loads through `laya.load` with the pinned revision, once per process; nothing imports `laya_mlx`. | S |
| TC-25.3 | U | B | A number question or another task ID returns `UNAVAILABLE` `UNSUPPORTED_TASK` without calling the stub, and the chat endpoint returns its fallback. | S |
| TC-25.4 | U | B | For the steroid question the stub receives labels `YES_CURRENT`, `YES_PAST`, `YES_TIME_UNCLEAR`, `NO`, `NOT_SURE`, `PREFER_NOT_TO_ANSWER`, `NOT_AN_ANSWER` with catalogue wording, and the typed text with no case ID or token. | S |
| TC-25.5 | U | B | Each of these stub answers gives ABSTAIN: `abstain` true, `unbound` true, `route: review`, top probability below the threshold, a prediction set of two labels, `YES_TIME_UNCLEAR`; `NOT_AN_ANSWER` gives `OUT_OF_SCOPE`. | S |
| TC-25.6 | A | B | A stub answer `NOT_SURE` with probability 0.95 becomes a Not sure proposal, never No; `YES_PAST` becomes Yes, in the past; both pass the unchanged RF-21 validator and save nothing until confirmed. | S |
| TC-25.7 | A | B | A stub that sleeps past the deadline or raises gives the RF-21 fallback and a `MODEL_TASK_RUN` entry with `TIMEOUT` or `UNAVAILABLE`, provider `laya_local`, model ID with revision, and no probabilities or text. | S |
| TC-25.8 | U | B | Importing the emergency, triage, review, gate and explanation modules does not import the adapter or `laya`; with default settings `laya` is absent from `sys.modules`. | D |
| TC-25.9 | M | B | Manual: `eval/run_model_eval.py --provider laya_local` on the RF-23 cases writes a scorecard with latency p50/p95 and peak memory; the result is compared with the Azure OpenAI scorecard on the same case-file hash. | M |
| TC-25.10 | U | B | `SANAD_LAYA_ENGINE=vegaml` calls the stub `laya.load` with `vegaml=` the model and the pinned revision; an unknown engine, a calibration without `vegaml`, and a missing calibration directory each stop start-up naming the setting; a valid directory is loaded once with `verify=True`. The stub receives `YN_TIME` for the steroid question, `YN` for the diabetes question and `CHOICE:REGULAR|OCCASIONAL|NONE` for the training question as the question key. | S |
| TC-25.11 | U | B | With a calibration loaded, a stub answer with probability 0.99 and `route: review`, or with `calibrated: false`, gives ABSTAIN (`UNCLEAR`). | S |
| TC-25.12 | U | B | Rows file check: every row parses, has the AC-25.13 fields, names a supported question and a label AC-25.4 builds for it, and no normalised text equals an RF-23 case text. Skipped until the file exists. | D |
| TC-25.13 | M | B | Manual: `eval/fit_decision_head.py` writes a fit report with rows hash, reader revision and `used_by_auto`; the RF-23 scorecard is then run with the calibration and recorded in the ratchet log whether it passes or fails. | M |

### RF-28 Patient-held visit summary (`PROPOSED`)

| ID | Level | Layer | What it checks | Data |
|---|---|---|---|---|
| TC-28.1 | A | B | The export for a case with answers and a lab value validates against `schemas/upload-profile.schema.json`, holds `summary_of`, and contains no case ID or token; a patient token for another case gets 404, and no `assessment` consent gets 403. | S |
| TC-28.2 | A | B | A case whose safety check answered No exports no emergency-screen concept and no psychosocial item. | S |
| TC-28.3 | U | B | A concept with a fixture value and a newer patient answer exports the patient answer; `UNKNOWN` and `DECLINED` export as states. | S |
| TC-28.4 | A | B | Round trip: a new case started by upload with the exported file holds the same answers as `USER_UPLOADED`, and the rules re-run. | S |
| TC-28.5 | A | B | After round trip, a changed patient answer appears in the decision record's `changes_since_summary` with both values; an unchanged one does not. | S |
| TC-28.6 | A | B | Export writes `SUMMARY_EXPORTED` with counts only. | S |
| TC-28.7 | M | W | Manual: the summary page offers the download with the privacy note; nothing downloads on its own. | M |

### RF-27 Identifier blocking and redaction (`PROPOSED`)

| ID | Level | Layer | What it checks | Data |
|---|---|---|---|---|
| TC-27.1 | A | B | A message with a name, a phone number and an emergency pattern returns `EMERGENCY_GUIDANCE`, with no `NEEDS_CORRECTION` and no model call. | S |
| TC-27.2 | A | B | Each blocked sample (record number with keyword, passport or national ID with digits, street address) returns `NEEDS_CORRECTION` `TEXT_CONTAINS_IDENTIFIER`; the fake adapter is not called and the audit holds the reason code only. | S |
| TC-27.3 | U | B | Redaction table: names after "my name is", "call me", "I'm" + two capitalised words, and "Dr" + name become `[NAME]`; `/`, `-`, `.` and ISO dates become `[DATE]`; controls ("I'm not sure", "quit in 2019", "I am 35", "twice a week", "10 mg") are unchanged. | D |
| TC-27.4 | A | B | The fake adapter receives the redacted message; neither the original name nor the date appears anywhere in the model request. | S |
| TC-27.5 | A | B | `MODEL_TASK_RUN` has `redactions` `DATE.NAME` and `redaction_count` 2 and no redacted value; the response has `redacted_types` `["DATE", "NAME"]`; a clean message has an empty list and no `redactions` field. | S |
| TC-27.6 | U | B | Runner: replay over the identifier cases gives `pii_leaks` 0; a request that still holds a listed string counts one leak and fails the scorecard. | D |
| TC-27.7 | M | W | Manual: in the chat, a typed answer with a name shows the hidden-name line and the proposal still needs confirmation. | M |

### RF-24 Decision record for the reviewer (`PROPOSED`)

Automated tests are in `apps/api/tests/test_decision_record.py`. They check that the record matches stored data. They say nothing about whether a reviewer reads it.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-24.1 | A | B | For the J1 sample, `decision_record` holds the floor action, rule ID, rule version, approval status, catalogue versions, the steroid fact with state, value, temporal status and source type, the claim statuses, and the current report hash. | S |
| TC-24.2 | A | B | Reading the detail twice makes no model call, writes no audit entry and leaves `case_version` and the report hash unchanged. | S |
| TC-24.3 | A | B | A field answered `UNKNOWN` stays `UNKNOWN`, and a field with disagreeing sources lists every value with its source under `CONFLICTING`. | S |
| TC-24.4 | A | B | `GET /cases/{id}/report` has no `decision_record` field, and a patient token gets 403 on the reviewer detail. | S |
| TC-24.4b | A | B | AC-24.5: a case with a skipped question and a declined one lists both under `limitations` with their states; no field in the record holds a percentage. | S |

### RF-23 Model evaluation harness, budget and run metrics (`PROPOSED`)

Automated tests go in `apps/api/tests/test_model_eval.py` and `apps/api/tests/test_model_budget.py`. The CI tests use `replay` replies stored in the case files, so they need no key and make no network call. A live scorecard is a manual run on synthetic cases; it measures software behaviour only and stays `NOT_CLINICALLY_VALIDATED`.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-23.1 | U | B | Every line in `eval/model/*.jsonl` parses, has a unique case ID, a known task ID, an expected result, at least one tag and a `replay` reply, and passes the fixture identifier guard. The intake file has at least one `injection`, `unsure` and `declined` case; the explanation file at least one `injection`, `blocked_term` and `other_step` case. | D |
| TC-23.2 | U | B | The runner imports the task builder and validator from `sanad_api.model_adapter`; it holds no copy of the prompt, schema or validator. | D |
| TC-23.3 | A | B | `replay` over the shipped cases exits 0 and writes a JSON and a Markdown scorecard with provider, model, versions, case-file hash, per-tag accuracy, unsafe conversions, fallback reasons, latency p50 and p95. | S |
| TC-23.4 | U | B | A replay reply that turns an expected `UNSURE` into `NO`, or an expected fallback into a draft, is counted as an unsafe conversion and makes the runner exit non-zero, whatever the accuracy threshold. | S |
| TC-23.5 | U | B | Accuracy below the threshold makes the runner exit non-zero; the threshold cannot switch off the unsafe-conversion check. | S |
| TC-23.6 | A | B | After the per-case cap is reached, chat matching and the explanation return their fallback with `MODEL_BUDGET_EXCEEDED`, the fake adapter receives no call, and a `MODEL_TASK_RUN` entry with status `BUDGET_EXCEEDED` is written. | S |
| TC-23.7 | A | B | Past the cap, a typed message matching an emergency word pattern still reaches emergency guidance. | S |
| TC-23.8 | A | B | When the provider reports usage, `MODEL_TASK_RUN` holds `input_tokens` and `output_tokens` and no model text. | S |
| TC-23.9 | A | B | `GET /evaluation/model-runs` with a reviewer token returns per-task counts, status and outcome counts, latency p50 and p95, token totals and budget refusals, and no case ID or text; a patient token gets 403 and no token gets 401. | S |
| TC-23.10 | A | B | With default settings the replay CI job and the metrics endpoint build no model client. | S |
| TC-23.11 | U | B | The intake case file has at least one case for each jailbreak tag, each expecting a fallback or `NEEDS_CORRECTION`; replay scores them with zero unsafe conversions. | D |
| TC-23.12 | U | B | A run equal to the baseline passes; one with lower accuracy beyond tolerance, or one more unsafe conversion or PII leak, fails and names the task. | D |
| TC-23.13 | U | B | Every task ID constant in `sanad_api.model_adapter` and every provider name has a heading in `specs/model-task-policies.md`. | D |
| TC-23.14 | M | W | Manual: as reviewer, the metrics panel shows the counts and latency returned by the endpoint and the `NOT_CLINICALLY_VALIDATED` label; as patient, it is absent. | M |
| TC-23.15 | U | B | With a stub judge: agreement below 0.80 on the calibration set stops the run with no scores reported; at or above 0.80 the explanations are scored and every score has a reason. | D |

### RF-22 Pinned citations and grounded explanation (`PROPOSED`)

Automated tests are in `apps/api/tests/test_citations.py`. They copy the catalogues to a temporary folder and add one synthetic test passage, so the shipped passage file stays as the team left it. A fake adapter replaces the model. These tests check wiring and refusal paths only. They say nothing about the quality of any wording or source, which stays `NOT_EVALUATED`.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-22.1 | U | B | A passage whose excerpt no longer matches its hash is marked unusable at load, and start-up still succeeds. | S |
| TC-22.2 | A | B | A `TEAM_CURATED` ref to a usable passage gives a `TEAM_CURATED` claim with title, locator, URL, license, excerpt and the not-reviewed note; a ref to a missing passage, a mismatched hash or a ref hash that differs gives `INSUFFICIENT_EVIDENCE` with no citation. | S |
| TC-22.3 | A | B | No report field shows `SUPPORTED` or `VERIFIED` for a `TEAM_CURATED` claim, and `NO_VERIFIED_EVIDENCE` stays in the limits. | S |
| TC-22.4 | U | B | The emergency modules import neither the passage loader nor the explanation task. | D |
| TC-22.5 | A | B | Explanation before release returns 409 `REPORT_NOT_RELEASED`; without a token 401; draft, report hash, state and `case_version` are unchanged after any call. | S |
| TC-22.6 | A | B | The model request holds the next-step label, signal codes and passage excerpts only: no case ID, answer value or token. | S |
| TC-22.7 | A | B | Each of these model replies gives `FALLBACK` `MODEL_OUTPUT_INVALID`: not JSON, an unknown passage ID, a sentence with no passage ID, a blocked term, a percentage, a cue for another next step, more than 3 sentences. | S |
| TC-22.8 | A | B | Disabled provider, no curated passage, reviewer-edited next step, timeout and adapter exception each return a 200 `FALLBACK` with the static text and the matching reason code. | S |
| TC-22.9 | A | B | A valid reply returns `AI_DRAFT` with the label, provider and unverified flags, and one `MODEL_TASK_RUN` audit entry with codes only. | S |
| TC-22.10 | A | B | With default settings the endpoint returns `FALLBACK` `MODEL_DISABLED` and builds no client. | S |
| TC-22.11 | U | B | Stored replies with "you have", "definitely", an email address, a seven-digit number and `[NAME]` each give `OUTPUT_POLICY_BLOCKED`; a reply with a missing field still gives `MODEL_OUTPUT_INVALID`. | D |

### RF-21 Chat intake and bounded model adapter (`PROPOSED`)

Automated tests are in `apps/api/tests/test_chat.py` and `apps/api/tests/test_model_adapter.py`. A fake adapter and a stub SDK client replace the model, so CI needs no key and makes no network call. These tests check the order of checks and the contract. They do not measure how well any real model matches answers: that needs a labelled synthetic set and stays `NOT_EVALUATED` (PRD-FR-18, NFR-14).

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-21.1 | A | B | Each draft word pattern, including a negated sentence, moves the case to `EMERGENCY_GUIDANCE_ISSUED` with no model call, with and without a provider; the audit entry holds rule IDs, version and `CHAT_TEXT` only. | D |
| TC-21.2 | A | B | Contact details, another script, a safety or unknown question ID, or a missing disclosure do not stop an emergency sentence reaching guidance. | S |
| TC-21.3 | A | B | Empty, other-script and contact-detail text return `NEEDS_CORRECTION` with a reason code; no model call; case unchanged; audit holds the code only. | S |
| TC-21.4 | A | B | A valid match returns a proposal with the catalogue label and AI, unverified and confirmation flags; no fact and no version change until `/answers` confirms it as `PATIENT_REPORTED`. The request carries the PRD 4.7.2 envelope and a strict schema. | S |
| TC-21.5 | A, U | B | Every listed contract break falls back as `MODEL_OUTPUT_INVALID`; not sure and prefer not to answer are kept; abstentions fall back with their reason. | S |
| TC-21.6 | A | B | Disabled, timeout, unavailable, filtered, refused and adapter exceptions fall back with a fixed message; buttons still save; each call leaves a code-only trace. | S |
| TC-21.7 | A | B | No token 401, another case 404, revoked consent 403, wrong state 409, with no model call. | S |
| TC-21.8 | A | B | Safety question IDs, a missing or stale disclosure version and text over 500 characters are refused with no model call. | S |
| TC-21.9 | A | B | A marker word in typed text appears in no table, audit entry, response or log line; the model request holds no case ID or token. | S |
| TC-21.10 | A | B | `GET /chat/assistant` shows the scripted label with typing off by default, and names the provider and disclosure when on. | S |
| TC-21.11 | U | B | Azure adapter: deployment as `model`, strict `json_schema`, retries only transient errors within attempts and deadline, no retry on content filter or 4xx, filtered, truncated and refused completions give no content, v1 base URL, bad settings stop start-up without echoing the key. | S |
| TC-21.12 | U | B | With default settings the app holds the disabled adapter, which never reaches the network. | S |
| TC-21.13 | U | B | `SANAD_HOSTED=true` with `api_key` raises a configuration error naming `SANAD_HOSTED`; with `entra_id` it builds the adapter with a token provider; locally `api_key` still works. | S |
| TC-21.13 | E | — | Chat at `/intake`: buttons, opt-outs and skip; typed proposal confirm and reject; emergency sentence replaces the page with `/urgent.html`; works at 360 px; keyboard only. Not yet automated (no Playwright suite). | S |
| TC-21.14 | M | — | Against a real Azure deployment with synthetic text: a smoke run of J1 by typing, plus a content-filter and timeout check. Record region, deployment type, model version and abuse-monitoring status. | S |

### RF-29 OCR one synthetic lab report, T-60 (`PROPOSED`)

Automated tests are in `apps/api/tests/test_lab_ocr.py`. Fixtures are in `apps/api/tests/fixtures/lab_ocr/` (stand-ins from `eval/lab_ocr/make_fixtures.py` until the T-20/T-34 package arrives). Most tests replay the text layer through a fake engine, so CI needs no OCR engine; the real-engine B1 cases are skipped when neither RapidOCR nor Tesseract is installed. The oracle is the fixtures' ground truth, a software oracle.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-29.1 | U | B | Wrong type by content, broken PDF, oversized file and too many pages are refused with a reason code. | S |
| TC-29.2 | U | B | No banner, or an ID without `SYN-`, gives `DOCUMENT_NOT_SYNTHETIC` and no field. | S |
| TC-29.3 | U | — | A text layer is read with no OCR call; an image-only page goes to the engine; each field records its method. | S |
| TC-29.4 | U | B | A1: `lab_A` returns all nine fields with value, unit, raw text, box and confidence, no flag, `UNCONFIRMED`. Generated reports are read back exactly. | S |
| TC-29.5 | U | B | B1: the T-60 baseline failures from a confident engine are flagged and `NEEDS_CONFIRMATION`; a misread in-range digit is caught by the motility total; low OCR confidence alone sets `NEEDS_CONFIRMATION`; `lab_B` (PDF and PNG) through each installed engine has no silent error. | S |
| TC-29.6 | U | B | C1: `lab_C` gives exactly the ground-truth flags and statuses for decimal commas, missing units and the ambiguous date. | S |
| TC-29.7 | U | B | Confidence equals the lowest of the three scores; the reader never confirms. | S |
| TC-29.8 | U | B | Blank, missing, unreadable, duplicated, comma-ambiguous, unknown-unit and out-of-range readings, and day-first, month-first, two-digit-year and invalid dates, give the listed value and flag. | S |
| TC-29.9 | A | B | U1: values stored from the draft are `NEEDS_USER_CONFIRMATION`; an unconfirmed concentration of 0 raises no `LAB_REPORTS_NO_SPERM`; after the user edits and confirms it, it does. Every target test code exists in the lab catalogue with the canonical unit. | S |
| TC-29.10 | U | B | Instruction-like lines in the report leave the draft identical. | S |
| TC-29.11 | U | B | Log capture at DEBUG holds none of the report's text or values. | S |
| TC-29.12 | U, C | B | No engine: scans give `OCR_UNAVAILABLE`, text PDFs work; the emergency modules do not import the reader. | S |
| TC-29.13 | U | — | E1: the run result has `run_id`, commit SHA, label, `n`, layouts and A1/B1/C1; silent errors come first in the Markdown. Fixture hashes match `ground_truth.json`. | S |
| TC-29.14 | A, E | — | Waits for T4.19: endpoint guard (401, 404, 403, 409), no write, no stored file, audit codes only; T-33 screen, cleared at session end and Quick Exit, no browser storage. Not written. | S |

### RF-30 Contradiction check for typed chat answers (`PROPOSED`)

Automated tests are in `apps/api/tests/test_chat_contradiction.py`. A fake adapter replays model output, so the tests make no network call. The oracle is the case's stored facts, a software oracle; nothing here measures how well a real model reads a message.

| Test | Lvl | Block | Check | Oracle |
|---|---|---|---|---|
| TC-30.1 | A | B | A button "No" then a typed "now" proposal returns the earlier label and source, `VALUE_DIFFERS` and the fixed message; no fact written, version unchanged. | S |
| TC-30.2 | A | B | Sample-profile answers give `TIME_DIFFERS`, `VALUE_DIFFERS` and `BECOMES_UNKNOWN` with `SAMPLE_FIXTURE`; a BMI of 29 equals 29.0 and 31.5 differs. | S |
| TC-30.3 | A | B | Not asked, not sure, prefer not to answer and an equal earlier answer return no contradiction and the usual message. | S |
| TC-30.4 | A | B | The model request for a case holding an answer equals the request for an empty case. | S |
| TC-30.5 | A | B | Confirming replaces a same-source answer; with a sample-profile answer both are kept and the assessment returns `CONFLICTING_DATA` with the question blocking. | S |
| TC-30.6 | A | B | The trace holds the change codes only and no label or text; a fallback has no check. | S |
| TC-30.7 | E | — | Chat shows the earlier answer and its source next to the proposal; keyboard only, 360 px. Not yet automated (no Playwright suite). | S |

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
| PRD-AC-17 outage fallback | TC-INV-01, TC-21.6 |
| PRD-AC-50 typed emergency, provider off | TC-21.1 |
| PRD-AC-54 correction logs reason code only | TC-21.3 |
| PRD-AC-60 extraction must not flip time, negation or source | TC-21.5 (validator and user confirmation; a model's own flip rate is `NOT_EVALUATED`) |
| PRD-AC-63 timeout, bad JSON, finite attempts | TC-21.5, TC-21.6, TC-21.11 |
| PRD-AC-64 prompt injection cannot act | TC-21.4 (no write without confirmation) |
| PRD-AC-70 model cannot reach tools, approval or consent | TC-21.4, TC-21.8 |
| PRD-AC-21 spouse denied | TC-12.9 |
| PRD-AC-22 missing shown | TC-06.5 |
| PRD-AC-23 no booking needed | TC-02.1 |
| PRD-AC-24 past stays past | TC-11.2 |
| PRD-AC-25 negation stays | TC-11.2 |
| PRD-AC-26 conflict with lab | TC-15.6 |
| PRD-AC-33 no camera | TC-INV-07 |
| PRD-AC-41 boundary: no completed care from the mock | TC-13.3, TC-14.5 |

**Not covered here:** PRD-AC-16 (Arabic), PRD-AC-18 and 19 (evaluation run), PRD-AC-20 and 34 (research isolation), and PRD-AC-27 to 32 (P1 and P2 features). TC-19.1 to TC-19.6 define service-level J9/J10 checks, but this plan has no patient UI or dashboard interaction checks for PRD-AC-35 to 40; those remain open for MVP acceptance.

**Golden sets.** Journey and gate cases are planned for `eval/golden/workflow_cases.jsonl`, `rule_conformance.jsonl` and `consent_security.jsonl`, counting towards the PRD's 36-case target. Only `rule_conformance.jsonl` currently exists. `closed_loop_navigation.jsonl` and `evidence_grounding.jsonl` are also planned, but neither is present yet.

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
