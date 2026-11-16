# Referral Flows — API Design

| Item | Value |
|---|---|
| **Status** | Draft for team review. Backend routes are implemented in `apps/api`; v0.4 additions below remain subject to review. |
| **Version / date** | 0.2, 2026-11-03 |
| **Implements** | [Product spec](product-spec.md) `RF-01` to `RF-17` and `RF-21`; PRD v0.4 `PRD-FR-24` to `PRD-FR-30` |
| **Built by** | [Implementation plan](implementation-plan.md) `T*` tasks |
| **Verified by** | [Test plan](test-plan.md) `TC-*` |

This document defines the HTTP contract between the web app and the API. BRD/PRD v0.4 decide scope and behavior; the product spec supplies M1–M3 detail where it is not superseded. The generated OpenAPI file is the source of truth for field shapes, and this document stays the source of truth for access, state and error rules.

Every response here is synthetic. Nothing in this API sends data outside the app, with one exception that is off by default: when an operator enables a model provider, `POST /cases/{id}/chat/interpret` sends typed text and one catalogue question to it (§6.13, CC-011), and `POST /cases/{id}/report/explanation` sends the released next-step label, signal codes and team-curated passages (§6.14, CC-013).

## 1. Conventions

| Topic | Rule |
|---|---|
| **Base path** | `/api`. The one exception is `GET /version`. Paths below omit the prefix. |
| **Origin** | Web and API share one origin through a reverse proxy, or the Vite proxy in development. CORS stays off. |
| **Versioning** | No version in the path. The only client lives in this repo and uses generated types, and CI fails on drift (`contract-drift`). |
| **Format** | JSON and UTF-8, except for file upload. Timestamps are UTC ISO 8601. Field names use `snake_case`. |
| **Caching** | Every response sets `Cache-Control: no-store`. The service worker never handles `/api/*` (AC-05.4). |
| **Updates** | The client polls. `/tracking` calls `GET /cases/{id}/tracking` every 10 seconds while open. There are no WebSockets and no push. |
| **Rate limits** | `POST /cases` and `POST /auth/login` are limited per IP and return 429. IPs are kept in memory only and never logged. |

**Data rules for all endpoints**

- Tokens never appear in URLs.
- Request logs record the method, path template, status, duration and `request_id`. They never record bodies (INV-03).
- Answers use fixed choices and numbers. The only free text in this API is the reviewer's optional `note` and edited summary, and the patient's typed chat text (§6.13), which is never stored. None of it is copied into audit entries.
- `error.message` is fixed text chosen by `error.code` and never contains submitted values.
- Replace FastAPI's default 422 handler. It echoes the submitted `input`, which would break AC-02.5 and INV-03.

## 2. Authentication and access

| Role | How it is obtained | Token lifetime |
|---|---|---|
| `PATIENT` | `POST /cases`. The token is bound to that one case. | 24 hours (OD-03) |
| `REVIEWER` | `POST /auth/login` with a seeded demo account | 8 hours |
| `MOCK_FACILITY` | `POST /auth/login` with a seeded demo account | 8 hours |

Tokens are opaque random values of at least 256 bits, stored hashed and sent as `Authorization: Bearer <token>`. The client holds them in `sessionStorage`, so each tab has its own session. Demo passwords come from environment variables.

**Order of checks.** Each protected endpoint runs these in order and stops at the first failure. They run as dependencies, so a bad body can never reveal anything to an unauthorised caller.

| # | Check | Failure |
|---|---|---|
| 1 | Token present, valid and not ended or expired | 401 `AUTH_REQUIRED` |
| 2 | Token's role may use this endpoint | 403 `ROLE_NOT_ALLOWED` |
| 3 | Patient token matches this case | 404 `NOT_FOUND`, the same as a case that does not exist (AC-14.6) |
| 4 | Required consent scope is active now | 403 `CONSENT_REQUIRED` |
| 5 | Case state allows this action | 409 `INVALID_TRANSITION` |
| 6 | Body is valid | 422 with a specific code |

The gate (§6.7) runs after checks 1 to 3, so a caller without access never sees gate details.

## 3. Endpoint index

| Method and path | Purpose | Role | Task | Covers |
|---|---|---|---|---|
| `GET /version` | Deployed commit SHA, also used as the deploy health check | Public | T1.4 | AC-01.4 |
| `GET /samples` | Sample profiles for the start screen | Public | T1.7 | AC-02.1 |
| `POST /cases` | Create a `DRAFT` case and session | Public | T1.5 | AC-02.2 |
| `GET /cases/{id}/state` | State, route, allowed actions | Patient | T1.5 | AC-04.1, AC-04.2 |
| `POST /cases/{id}/close` | User closes the case | Patient | T1.5 | PRD §4.7 |
| `POST /session/end` | End session on Quick exit | Token in body | T2.8 | AC-09.5, AC-09.6 |
| `GET /consent/current` | Current consent version and scope text | Public | T1.8 | AC-03.1 |
| `GET /cases/{id}/consent` | This case's consent record | Patient | T1.8 | AC-03.5 |
| `PUT /cases/{id}/consent` | Grant, decline or revoke scopes | Patient | T1.8 | AC-03.2 to AC-03.5 |
| `POST /cases/{id}/profile/sample` | Apply the chosen sample | Patient | T1.10 | AC-02.2, AC-10.6 |
| `POST /cases/{id}/profile/upload` | Validate and apply an uploaded file | Patient | T1.10 | AC-02.4, AC-02.5, AC-10.6 |
| `POST /cases/{id}/safety-check` | Server safety check | Patient | T2.1 | AC-10.1, AC-10.2, AC-10.7 |
| `GET /cases/{id}/questions` | Questions still needed | Patient | T2.2 | AC-06.1, AC-06.3, AC-06.4 |
| `POST /cases/{id}/answers` | Save answers and field states | Patient | T2.2 | AC-06.2, AC-06.3, AC-06.6 |
| `POST /cases/{id}/assess` | Gatekeeper, signals, floor, draft | Patient | T2.3 to T2.5 | AC-06.5, AC-11.1, AC-11.5, AC-11.6 |
| `GET /chat/assistant` | Assistant labels, whether typing is on, provider and disclosure | Public | T4.5 | AC-21.10 |
| `POST /cases/{id}/chat/interpret` | Typed text for one intake question: emergency, correction, proposal or fallback. Writes no fact. | Patient | T4.5 | AC-21.1 to AC-21.9 |
| `GET /cases/{id}/report` | Patient view of the draft or released result | Patient | T2.5 | AC-11.2 to AC-11.4, AC-08.9 |
| `POST /cases/{id}/report/explanation` | Optional plain-language rewording of the released next step, citing team-curated passages, or the static text as a fallback. Writes nothing to the case. | Patient | T4.6 | AC-22.5 to AC-22.10 |
| `POST /cases/{id}/review-requests` | The send button | Patient | T2.6 | AC-07.2 to AC-07.6 |
| `GET /psychosocial/questions` | Draft optional question catalogue; clearly marked pending review | Public | T4.1 | PRD-FR-29 |
| `GET /cases/{id}/psychosocial` | Read the three contextual response states | Patient, assessment consent | T4.1 | PRD-FR-29, PRD-AC-42 |
| `PUT /cases/{id}/psychosocial` | Replace up to three optional self-reports; omitted items become `NOT_ASKED` | Patient, assessment consent | T4.1 | PRD-FR-29/30, PRD-AC-42/43 |
| `POST /auth/login` | Staff sign-in | Public | T2.7 | AC-08.1 |
| `POST /auth/logout` | Staff sign-out | Staff | T2.7 | AC-08.1 |
| `GET /reviews/queue` | Review queue | Reviewer | T2.7 | AC-08.2, AC-08.6 |
| `GET /reviews/{case_id}` | Reviewer case detail | Reviewer | T2.7 | AC-08.2, AC-14.6 |
| `POST /reviews/{case_id}/decision` | Record a decision | Reviewer | T2.7 | AC-08.4 to AC-08.8 |
| `POST /cases/{id}/navigation/start` | Set `NAVIGATION_STARTED` | Patient | T3.2 | AC-12.6 |
| `GET /cases/{id}/navigation` | Current session's episode and events | Patient, assessment consent | T4.2 | PRD-FR-24/25 |
| `POST /cases/{id}/navigation/acknowledgements` | Acknowledge the current released guidance explicitly | Patient, assessment consent | T4.2 | PRD-FR-24 |
| `POST /cases/{id}/navigation/progress` | Append a user-selected progress status with an idempotency key | Patient, assessment consent | T4.2 | PRD-FR-25/28 |
| `POST /cases/{id}/navigation/barriers` | Append optional barrier codes with an idempotency key; no free text | Patient, assessment consent | T4.2 | PRD-FR-26/28 |
| `GET /evaluation/navigation-funnel` | Aggregate active synthetic episodes with denominators and source | Reviewer | T4.2 | PRD-FR-27 |
| `GET /evaluation/model-runs` | Code-only aggregate of model task runs: counts, statuses, outcomes, latency, tokens, budget refusals | Reviewer | T4.7 | AC-23.9 |
| `GET /mock-directory` | Mock facilities by care type | Patient | T3.2 | AC-13.5 |
| `GET /cases/{id}/referral-gate` | Gate preview, grants nothing | Patient | T3.1 | AC-12.3, AC-12.6 |
| `POST /cases/{id}/mock-referral` | Evaluate the gate and create the referral | Patient | T3.1 | AC-12.1 to AC-12.5 |
| `POST /cases/{id}/spouse-share` | Always refused | Patient | T3.1 | AC-12.9 |
| `GET /cases/{id}/tracking` | Timeline and delayed flag | Patient | T3.5 | AC-14.1 to AC-14.6 |
| `GET /mock-facility/referrals` | Mock facility queue | Mock facility | T3.4 | AC-13.1, AC-13.4 |
| `GET /mock-facility/referrals/{id}` | Approved snapshot | Mock facility | T3.4 | AC-13.4 |
| `POST /mock-facility/referrals/{id}/events` | Post a mock event | Mock facility | T3.4 | AC-13.2, AC-13.3, AC-13.6 |
| `POST /cases/{id}/observations` | Enter a lab value | Patient | T3.7 | AC-15.1, AC-15.2 |
| `PUT /cases/{id}/observations/{obs_id}` | Correct a lab value | Patient | T3.7 | AC-15.2 |
| `DELETE /cases/{id}/observations/{obs_id}` | Remove a lab value | Patient | T3.7 | PRD Screen 5 |
| `POST /cases/{id}/observations/{obs_id}/confirm` | Confirm after preview | Patient | T3.7 | AC-15.1, AC-15.2, AC-15.6 |
| `PUT /cases/{id}/evidence-selection` | Choose which items count | Patient | T3.8 | AC-16.1 |

These need no API: the emergency page, emergency rules, education content and upload template are static files served by the web app.

**Criteria met without their own endpoint**

| Criteria | How the API supports them |
|---|---|
| AC-03.6 | Check 4 in §2, on every patient-data write |
| AC-04.4, AC-10.5 | The action rules in §4 |
| AC-04.5 | No API involved: `/urgent.html` is a static file |
| AC-04.6 | The client stores only the token, and the server holds the step |
| AC-04.7 | An ended or expired token gets 401, and the client opens the start screen |
| AC-07.1 | The button shows only when `allowed_actions` contains `SEND_FOR_REVIEW` |
| AC-08.3 | `review_mode: SIMULATED` on queue and detail. The banner text lives in the UI. |
| AC-10.4 | Browser and server read the same catalogue file, so no API is involved |
| AC-12.8 | No endpoint or module here makes an outbound call |
| AC-14.7 | UI only. The API supplies the flag, and the client adds text and icon. |
| AC-15.3 | `required_statements` in the report (§6.5) |
| AC-15.5 | J3 uses the same review, gate and tracking endpoints |
| AC-16.2 | The report schema has no field for a condition or diagnosis (INV-06) |
| AC-16.4 | J2 follows the same action rules and gate |

## 4. Action rules

This is the contract for the order guard (RF-04). An action outside its allowed states returns 409 `INVALID_TRANSITION`, changes nothing and writes an audit entry (AC-04.3). `assessment` means active `assessment` consent.

| Action | Required consent | Allowed states | Resulting state |
|---|---|---|---|
| Grant `assessment` | None | `DRAFT` | `CONSENTED` |
| Decline `assessment` | None | `DRAFT` | `EDUCATION_ONLY` |
| Revoke `assessment` | None | Any open state | `CONSENT_REVOKED` |
| Load sample or upload | `assessment` | `CONSENTED` | Same, or `EMERGENCY_GUIDANCE_ISSUED` on a trigger |
| Safety check | `assessment` | `CONSENTED` | `ASSESSING` or `EMERGENCY_GUIDANCE_ISSUED` |
| Answers, observations, evidence selection | `assessment` | `ASSESSING`, `NEEDS_INFORMATION`, `REVISION_REQUIRED` | Same, or `EMERGENCY_GUIDANCE_ISSUED` on a trigger |
| Interpret typed text (`INTERPRET_TEXT`) | `assessment` | `ASSESSING`, `NEEDS_INFORMATION`, `REVISION_REQUIRED` | Same, or `EMERGENCY_GUIDANCE_ISSUED` on a typed-text trigger. Not listed in `allowed_actions`; the client reads `GET /chat/assistant`. |
| Assess | `assessment` | `ASSESSING`, `NEEDS_INFORMATION`, `REVISION_REQUIRED` | `ASSESSING` with a draft, or `NEEDS_INFORMATION` |
| Send for review | `assessment`, `clinician_review` | `ASSESSING` with a current draft | `PENDING_CLINICIAN_REVIEW` |
| Decision `APPROVE` | `clinician_review` | `PENDING_CLINICIAN_REVIEW` | `APPROVED`, then automatically `REPORT_RELEASED` and `GUIDANCE_AVAILABLE` |
| Decision `EDIT` | `clinician_review` | `PENDING_CLINICIAN_REVIEW` | Same, with `case_version` + 1 |
| Decision `REJECT` | `clinician_review` | `PENDING_CLINICIAN_REVIEW` | `REJECTED` |
| Decision `REQUEST_CLARIFICATION` | `clinician_review` | `PENDING_CLINICIAN_REVIEW` | `REVISION_REQUIRED` |
| Revoke `clinician_review` | None | `PENDING_CLINICIAN_REVIEW` | `ASSESSING` (G3) |
| Start navigation | `assessment` | `GUIDANCE_AVAILABLE` | `NAVIGATION_STARTED` |
| Send referral | Gate decides (§6.7) | Gate decides | `REFERRAL_REQUESTED` |
| Mock event reaching an end state | None | `REFERRAL_REQUESTED` | `CLOSED` |
| Revoke `provider_share` with a live referral | None | `REFERRAL_REQUESTED` | Referral `MOCK_WITHDRAWN`, case `CLOSED` |
| Close | None | `EDUCATION_ONLY`, `EMERGENCY_GUIDANCE_ISSUED`, `REJECTED`, `GUIDANCE_AVAILABLE`, `NAVIGATION_STARTED` | `CLOSED` |

Fact changes raise `case_version` and discard the current draft, so a new assess is needed before sending. Confirmed observations and evidence selections count as fact changes.

## 5. Errors

All errors share one body. `details` carries codes only, never submitted values.

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "This step is not available for the case right now.",
    "details": [],
    "request_id": "req-5e1a"
  }
}
```

| Status | Codes | Used when |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `AUTH_REQUIRED`, `INVALID_CREDENTIALS` | No valid token, or failed sign-in |
| 403 | `ROLE_NOT_ALLOWED`, `CONSENT_REQUIRED`, `GATE_DENIED`, `SPOUSE_SHARE_NOT_AVAILABLE` | Authenticated but not permitted |
| 404 | `NOT_FOUND` | Missing, or not this session's case |
| 409 | `INVALID_TRANSITION`, `CASE_VERSION_CONFLICT`, `CONSENT_VERSION_OUTDATED`, `DRAFT_NOT_CURRENT`, `REPORT_NOT_RELEASED`, `BLOCKING_ITEMS_REMAIN`, `IDEMPOTENCY_KEY_REUSED` | Conflict with current state or retry key reused with a different payload |
| 413 | `UPLOAD_TOO_LARGE` | File over 256 KB |
| 415 | `UPLOAD_WRONG_TYPE` | File is not JSON |
| 422 | `VALIDATION_FAILED`, `UPLOAD_SCHEMA_INVALID`, `UPLOAD_UNKNOWN_FIELD`, `UPLOAD_NOT_SYNTHETIC`, `UNKNOWN_SAMPLE`, `REASON_REQUIRED`, `TRIAGE_BELOW_FLOOR`, `OBSERVATION_INVALID` | Body rejected |
| 429 | `RATE_LIMITED` | Rate limit reached |

The client treats a network failure or any 5xx as "cannot reach the server": it offers retry and always keeps the emergency link and Quick exit working.

## 6. Endpoint details

### 6.1 Cases and session

**`POST /cases`**. `start_mode` is `SAMPLE`, `UPLOAD` or `BLANK`, and `fixture_id` is required for `SAMPLE`. The case stores only this reference, and no profile data, until consent (AC-02.2). A file chosen in the browser is not read or sent at this point (AC-02.3).

```json
{"start_mode": "SAMPLE", "fixture_id": "J1-002", "preferred_language": "en"}
```

201:

```json
{
  "case_id": "SANAD-7f3c91",
  "session_token": "opaque-token",
  "expires_at": "2026-11-11T09:00:00Z",
  "state": {
    "case_id": "SANAD-7f3c91",
    "state": "DRAFT",
    "case_version": 1,
    "route": "/consent",
    "allowed_actions": ["SET_CONSENT"]
  }
}
```

**`GET /cases/{id}/state`** returns the `state` object above. The client stores none of it and redirects on `route` ([route table](product-spec.md#52-which-step-each-case-state-allows)). `allowed_actions` is drawn from `SET_CONSENT`, `LOAD_PROFILE`, `RUN_SAFETY_CHECK`, `SUBMIT_ANSWERS`, `ENTER_OBSERVATION`, `SELECT_EVIDENCE`, `ASSESS`, `SEND_FOR_REVIEW`, `START_NAVIGATION`, `SEND_REFERRAL` and `CLOSE`.

**`POST /cases/{id}/close`** returns the `state` object. It records no failure, refusal or non-adherence (BR-32).

**`POST /session/end`** exists for Quick exit, which calls `navigator.sendBeacon`. Beacons cannot set an `Authorization` header, so the token travels in the body (G1).

```json
{"session_token": "opaque-token"}
```

It always returns 204, including for unknown or ended tokens, so it cannot be used to test whether a token exists. It ends the session and writes only `SESSION_ENDED`. Case state and triage do not change (AC-09.6). The old token then gets 401 everywhere (AC-09.5).

**`GET /samples`** lists samples for the start screen. Consent-negative fixtures are left out because they exist for tests.

```json
{
  "samples": [
    {"fixture_id": "J1-002", "title": "Sample A", "description": "Health context with follow-up questions", "is_synthetic": true}
  ]
}
```

**`GET /version`** returns `{"commit_sha": "914f1d2"}`.

### 6.2 Consent

**`GET /consent/current`** gives the screen its text, so what the user reads and what is recorded share one version. Each scope has the four statements AC-03.1 requires.

```json
{
  "consent_version": "CONSENT-0.1",
  "scopes": [
    {
      "scope": "provider_share",
      "data_covered": "...",
      "used_for": "...",
      "who_sees_it": "...",
      "if_off": "...",
      "used_in_this_flow": true
    }
  ]
}
```

**`PUT /cases/{id}/consent`** takes only the scopes being changed. The other scopes stay as they are, so granting `assessment` can never switch on anything else (AC-03.4).

```json
{"consent_version": "CONSENT-0.1", "decisions": {"assessment": true}}
```

200, also returned by `GET /cases/{id}/consent`, with `state` omitted on the read:

```json
{
  "case_id": "SANAD-7f3c91",
  "consent_version": "CONSENT-0.1",
  "scopes": {
    "assessment": {"granted": true, "captured_at": "2026-11-10T09:00:00Z", "revoked_at": null},
    "clinician_review": {"granted": false, "captured_at": null, "revoked_at": null},
    "provider_share": {"granted": false, "captured_at": null, "revoked_at": null},
    "spouse_share": {"granted": false, "captured_at": null, "revoked_at": null},
    "research_use": {"granted": false, "captured_at": null, "revoked_at": null}
  },
  "state": {
    "case_id": "SANAD-7f3c91",
    "state": "CONSENTED",
    "case_version": 1,
    "route": "/safety",
    "allowed_actions": ["LOAD_PROFILE", "RUN_SAFETY_CHECK"]
  }
}
```

- `false` on a granted scope is a revocation and sets `revoked_at`. `false` on `assessment` in `DRAFT` is a decline.
- Decline stores no assessment data and discards the start reference (AC-03.3). The client drops any selected file (AC-02.6).
- Revoking `assessment` also revokes the other scopes, and it withdraws a live referral (G4).
- A stale `consent_version` returns 409 `CONSENT_VERSION_OUTDATED`, and the client refetches the text.

### 6.3 Profiles

**`POST /cases/{id}/profile/sample`** has no body and applies the sample chosen at start.

**`POST /cases/{id}/profile/upload`** takes `multipart/form-data` with one `file` part. The client reads and sends the file only after consent. All checks run on the server, and rejection stores nothing (AC-02.5).

| Failure | Status and code |
|---|---|
| Over 256 KB | 413 `UPLOAD_TOO_LARGE` |
| Not JSON | 415 `UPLOAD_WRONG_TYPE` |
| Fails the schema | 422 `UPLOAD_SCHEMA_INVALID` |
| Field outside the schema | 422 `UPLOAD_UNKNOWN_FIELD`. The field's name is file content, so it is not repeated. |
| `is_synthetic` missing or not `true` | 422 `UPLOAD_NOT_SYNTHETIC` |

Both return 200 with the `state` object. Values carry `source: USER_UPLOADED` and `verification_status: UNVERIFIED` for uploads, and `source: SAMPLE_FIXTURE` for samples. Emergency rules run immediately on load, so a profile holding a trigger reaches guidance without showing the safety screen (AC-10.6, G6).

### 6.4 Safety check

**`POST /cases/{id}/safety-check`** evaluates with the server's own catalogue. Allowed `response` values are `YES`, `NO`, `NOT_SURE` and `PREFER_NOT_TO_ANSWER`.

```json
{
  "catalogue_version": "emergency-draft-0.1",
  "answers": [
    {"question_id": "SAFETY-01", "response": "NO"},
    {"question_id": "SAFETY-02", "response": "NOT_SURE"}
  ]
}
```

200:

```json
{
  "result": "SAFE_TO_CONTINUE",
  "rule_ids": [],
  "catalogue_version": "emergency-draft-0.1",
  "approval_status": "CLINICAL_TBD",
  "needs_recheck": false,
  "state": {
    "case_id": "SANAD-7f3c91",
    "state": "ASSESSING",
    "case_version": 2,
    "route": "/intake",
    "allowed_actions": ["SUBMIT_ANSWERS", "ENTER_OBSERVATION", "ASSESS"]
  }
}
```

- `result` is `EMERGENCY_GUIDANCE_ISSUED` or `SAFE_TO_CONTINUE`, the PRD's terms. `SAFE_TO_CONTINUE` is a routing value and must never be shown to the user as "safe" or "all clear".
- **A trigger always wins.** A stale `catalogue_version` is never rejected. If no trigger fired but the client's catalogue lacks current questions, the case stays `CONSENTED` with `needs_recheck: true`, and the client shows the updated questions.
- The audit entry records rule IDs and catalogue version, with no answers (AC-10.7).
- If the API cannot be reached, the browser runs the same catalogue locally (AC-10.3). A positive result shows guidance, and nothing is sent to the server later.

### 6.5 Questions, answers and assessment

**`GET /cases/{id}/questions`** returns only what is still needed (AC-06.1). `reason` is `MISSING`, `CONFLICTING`, `CONTEXT` or `CLARIFICATION_REQUESTED`. Both conflicting values are listed with their sources (AC-06.3).

```json
{
  "questions": [
    {
      "question_id": "Q-TRAINING-CONTEXT",
      "text": "...",
      "answer_type": "SINGLE_CHOICE",
      "options": [{"value": "REGULAR", "label": "..."}],
      "reason": "CONTEXT",
      "blocking": true,
      "conflicting_values": []
    }
  ],
  "catalogue_version": "questions-draft-0.1"
}
```

**`POST /cases/{id}/answers`** maps each `choice` to a stored field state:

| `choice` | Stored state |
|---|---|
| `ANSWERED` | `KNOWN_POSITIVE` or `KNOWN_NEGATIVE`, from the value |
| `NOT_SURE` | `UNKNOWN` |
| `PREFER_NOT_TO_ANSWER` | `DECLINED` |

```json
{
  "answers": [
    {"question_id": "Q-STEROID-USE", "choice": "ANSWERED", "value": true, "temporal_status": "PAST"},
    {"question_id": "Q-BODY-FAT", "choice": "NOT_SURE"},
    {"question_id": "Q-TRAINING-CONTEXT", "choice": "PREFER_NOT_TO_ANSWER"}
  ]
}
```

200 returns the `state` object. Saving does not assess, except that an emergency answer moves the case at once (AC-06.6).

**`POST /cases/{id}/assess`** takes an `entry_path` of `FULL_INTAKE` or `LAB_ONLY`. `LAB_ONLY` is the direct J3 path (AC-15.4), and non-lab items then report as `NOT_ASKED` limits.

```json
{"entry_path": "FULL_INTAKE"}
```

200:

```json
{
  "gatekeeper_status": "READY_FOR_ASSESSMENT",
  "blocking_question_ids": [],
  "risk_signals": [
    {"code": "BMI_CONTEXT_NEEDED", "source_field": "bmi", "status": "OBSERVED"},
    {"code": "REPORTS_ANABOLIC_STEROID_USE", "source_field": "anabolic_steroid_use", "status": "OBSERVED"}
  ],
  "triage_proposal": {
    "action": "SPECIALIST",
    "floor": "SPECIALIST",
    "rule_ids": ["DRAFT-STEROID-01"],
    "rule_version": "draft-0.1",
    "approval_status": "CLINICAL_TBD"
  },
  "draft_ready": true,
  "state": {
    "case_id": "SANAD-7f3c91",
    "state": "ASSESSING",
    "case_version": 3,
    "route": "/result",
    "allowed_actions": ["SEND_FOR_REVIEW", "SUBMIT_ANSWERS", "ENTER_OBSERVATION"]
  }
}
```

- `gatekeeper_status` is `READY_FOR_ASSESSMENT`, `NEEDS_INFORMATION` or `CONFLICTING_DATA`. The last two list `blocking_question_ids`, move the case to `NEEDS_INFORMATION` and produce no draft.
- Only unanswered and conflicting items block. If only `DECLINED` or `UNKNOWN` items remain, assessment continues with `NEEDS_MORE_INFORMATION`, or the floor if one applies (AC-06.5).
- The same inputs and rule version always return the same output (AC-11.5). `action` can never sit below `floor` (AC-11.6).

**`GET /cases/{id}/report`**

```json
{
  "report_type": "PATIENT",
  "draft_label": "Draft, generated from draft rules",
  "review_status": "PENDING_CLINICIAN_REVIEW",
  "is_mock": true,
  "known": [
    {"concept_code": "anabolic_steroid_use", "value": true, "polarity": "AFFIRMED", "temporal_status": "PAST", "source_type": "PATIENT_REPORTED", "verification_status": "UNVERIFIED"}
  ],
  "unknown": [
    {"concept_code": "body_fat_percent", "state": "UNKNOWN"}
  ],
  "why_next_step": null,
  "who_approves": "A simulated reviewer. No licensed clinician has approved this.",
  "next_step": null,
  "next_step_withheld": "PENDING_REVIEW",
  "evidence": [
    {"claim_id": "CLAIM-01", "status": "INSUFFICIENT_EVIDENCE"}
  ]
}
```

- `next_step` and `why_next_step` stay null until guidance is released (AC-08.9).
- `known` keeps polarity and time through to the display (AC-11.2).
- Evidence returns `INSUFFICIENT_EVIDENCE` until a verified source exists. Placeholder sources are never returned as citations (AC-11.4).
- The response schema has no field for a diagnosis or probability (INV-06).
- A report holding lab values adds `required_statements`, which contains the exact sentence AC-15.3 requires. The server supplies it, so no client can leave it out.

### 6.6 Send for review and clinician review

**`POST /cases/{id}/review-requests`** is the "Send to care facility (Mock)" button. It needs `clinician_review`, and it does not need `provider_share` or create a referral (AC-07.5).

```json
{"case_version": 3}
```

- First call: 201 with `{"review_request_id": "RR-12", "is_mock": true, "state": {...}}`.
- Repeat while pending: 200 with the same `review_request_id`, and no duplicate (AC-07.4).
- No consent: 403 `CONSENT_REQUIRED` with `details: ["clinician_review"]`, which is the client's cue to ask for that scope (AC-07.2).
- Old version: 409 `CASE_VERSION_CONFLICT`.
- Draft missing or outdated: 409 `DRAFT_NOT_CURRENT`.
- Emergency and education-only cases: 409 `INVALID_TRANSITION` (AC-07.6).

**`POST /auth/login`** takes `{"username": "...", "password": "..."}` and returns 200 with `{"token": "...", "role": "REVIEWER", "expires_at": "..."}`. Any failed attempt gets the same 401 `INVALID_CREDENTIALS`.

**`GET /reviews/queue`** lists pending cases with active `clinician_review`. A revoked case leaves the queue at once (AC-08.6).

```json
{
  "review_mode": "SIMULATED",
  "is_mock": true,
  "items": [
    {"case_id": "SANAD-7f3c91", "case_version": 3, "sent_at": "2026-11-10T09:00:00Z", "triage_action": "SPECIALIST", "tracking_flag": null}
  ]
}
```

**`GET /reviews/{case_id}`** gives the detail AC-08.2 lists. It returns 404 for a case without active `clinician_review`.

```json
{
  "case_id": "SANAD-7f3c91",
  "case_version": 3,
  "state": "PENDING_CLINICIAN_REVIEW",
  "review_mode": "SIMULATED",
  "is_mock": true,
  "facts": [],
  "unknown_fields": [],
  "risk_signals": [],
  "triage_proposal": {"action": "SPECIALIST", "floor": "SPECIALIST", "rule_ids": ["DRAFT-STEROID-01"], "rule_version": "draft-0.1", "approval_status": "CLINICAL_TBD"},
  "evidence": [],
  "clinician_summary_draft": "...",
  "decision_history": [],
  "tracking_flag": null
}
```

**`POST /reviews/{case_id}/decision`**

```json
{
  "decision": "EDIT",
  "case_version": 3,
  "reason_code": "CONTEXT_UPDATED",
  "note": "Optional, at most 500 characters.",
  "edits": {"triage_action": "PRIORITY_REVIEW", "clinician_summary": "..."}
}
```

| `decision` | Required | Effect |
|---|---|---|
| `APPROVE` | `case_version` | Stored as `SIMULATED_APPROVAL`, bound to this version |
| `EDIT` | `edits` | New `case_version`. It is not an approval, so `APPROVE` must follow on the new version (G5). |
| `REJECT` | `reason_code`, otherwise 422 `REASON_REQUIRED` | `REJECTED` |
| `REQUEST_CLARIFICATION` | `question_ids` from the catalogue | `REVISION_REQUIRED`. The questions appear in the user's form (AC-08.8). |

The response is 200 with `{"review_id": "...", "kind": "SIMULATED_APPROVAL", "is_mock": true, "case_version": 3, "state": "GUIDANCE_AVAILABLE"}`. `kind` is null for decisions other than `APPROVE`.

- An old `case_version` returns 409 `CASE_VERSION_CONFLICT` and overwrites nothing (AC-08.5).
- A triage edit below the floor returns 422 `TRIAGE_BELOW_FLOOR` (AC-08.7).
- Actor, time, version and `reason_code` go in the audit entry. `note` does not (INV-03).

### 6.7 Referral gate

**`POST /cases/{id}/navigation/start`** has no body and returns the `state` object.

**`GET /mock-directory?care_type=SPECIALIST`** returns invented facilities only (AC-13.5, OD-09).

```json
{
  "is_mock": true,
  "facilities": [
    {"mock_facility_id": "MOCK-CLINIC-A", "name": "Mock Clinic A", "care_type": "SPECIALIST"}
  ]
}
```

**`GET /cases/{id}/referral-gate?target_mock_facility_id=MOCK-CLINIC-A`** runs the same `evaluate_gate` as the send and returns 200 with the decision. **It grants nothing and writes no audit entry**, because the client calls it repeatedly. Without a target, the target check is skipped and `conditions.backend_policy.target_checked` is `false`.

```json
{
  "decision": "DENY",
  "conditions": {
    "user_consent": {"passed": false, "scope": "provider_share"},
    "clinician_approval": {"passed": true, "kind": "SIMULATED_APPROVAL", "case_version": 3},
    "backend_policy": {"passed": true, "target_checked": true}
  },
  "reason_codes": ["CONSENT_PROVIDER_SHARE_MISSING"],
  "policy_version": "gate-0.1",
  "is_mock": true,
  "evaluated_at": "2026-11-10T09:00:00Z"
}
```

The reason codes and conditions are defined in [RF-12](product-spec.md#rf-12-referral-gate-m3). The client turns each code into plain language and an action. Missing consent can be granted on the same screen with `PUT /cases/{id}/consent` (AC-12.6).

**`POST /cases/{id}/mock-referral`**

```json
{"target_mock_facility_id": "MOCK-CLINIC-A"}
```

The server reads consent, review and case fresh in one transaction, runs `evaluate_gate`, and writes the decision and any referral together (AC-12.3). This is the only path that creates a referral (AC-12.7). A unique constraint on the referral's `case_id` makes a concurrent second call lose with `REFERRAL_ALREADY_EXISTS`.

Allowed, 201:

```json
{
  "referral": {
    "referral_id": "REF-41ab",
    "case_id": "SANAD-7f3c91",
    "case_version": 3,
    "status": "SIMULATED",
    "mock_status": "MOCK_SENT",
    "care_type": "SPECIALIST",
    "target_mock_facility_id": "MOCK-CLINIC-A",
    "is_mock": true,
    "created_at": "2026-11-10T09:00:01Z"
  },
  "gate_decision": {
    "decision": "ALLOW",
    "conditions": {
      "user_consent": {"passed": true, "scope": "provider_share"},
      "clinician_approval": {"passed": true, "kind": "SIMULATED_APPROVAL", "case_version": 3},
      "backend_policy": {"passed": true, "target_checked": true}
    },
    "reason_codes": [],
    "policy_version": "gate-0.1",
    "is_mock": true,
    "evaluated_at": "2026-11-10T09:00:01Z"
  }
}
```

Denied, 403 with every failing code and no referral (AC-12.2):

```json
{
  "error": {
    "code": "GATE_DENIED",
    "message": "This referral cannot be sent yet.",
    "details": ["CONSENT_PROVIDER_SHARE_MISSING", "APPROVAL_STALE"],
    "request_id": "req-77c0"
  },
  "gate_decision": {
    "decision": "DENY",
    "conditions": {
      "user_consent": {"passed": false, "scope": "provider_share"},
      "clinician_approval": {"passed": false, "kind": "SIMULATED_APPROVAL", "case_version": 2},
      "backend_policy": {"passed": true, "target_checked": true}
    },
    "reason_codes": ["CONSENT_PROVIDER_SHARE_MISSING", "APPROVAL_STALE"],
    "policy_version": "gate-0.1",
    "is_mock": true,
    "evaluated_at": "2026-11-10T09:00:01Z"
  }
}
```

If a double tap returns `REFERRAL_ALREADY_EXISTS`, the client routes to `/tracking` and does not show an error.

**`POST /cases/{id}/spouse-share`** always returns 403 `SPOUSE_SHARE_NOT_AVAILABLE` and writes an audit entry, whatever scopes are active (AC-12.9). No other sharing route exists.

### 6.8 Mock facility

**`GET /mock-facility/referrals`** lists referrals with `referral_id`, `case_code`, `care_type`, `mock_status`, `created_at` and `is_mock`. `case_code` is a separate short code, so the operator never sees `case_id`.

**`GET /mock-facility/referrals/{id}`** returns the approved snapshot and nothing else (AC-13.4). It holds no answers, lab values or consent details. After withdrawal, `snapshot` is null.

```json
{
  "referral_id": "REF-41ab",
  "mock_status": "MOCK_SENT",
  "is_mock": true,
  "snapshot": {
    "case_code": "C-2041",
    "care_type": "SPECIALIST",
    "reviewer_summary": "...",
    "limits": ["..."]
  },
  "events": []
}
```

**`POST /mock-facility/referrals/{id}/events`**

```json
{
  "mock_status": "MOCK_APPOINTMENT_SCHEDULED",
  "mock_appointment": {"starts_at": "2026-11-20T10:00:00Z"}
}
```

201 returns the event:

```json
{
  "event_id": "EVT-90c2",
  "referral_id": "REF-41ab",
  "mock_status": "MOCK_APPOINTMENT_SCHEDULED",
  "mock_appointment": {"starts_at": "2026-11-20T10:00:00Z", "label": "Mock appointment, not a real booking"},
  "occurred_at": "2026-11-10T09:05:00Z",
  "recorded_at": "2026-11-10T09:05:00Z",
  "actor": "MOCK_FACILITY",
  "verification_source": "SIMULATED",
  "verification_status": "UNVERIFIED",
  "is_mock": true
}
```

- The request enum holds `MOCK_RECEIVED`, `MOCK_ACCEPTED`, `MOCK_REJECTED`, `MOCK_APPOINTMENT_SCHEDULED` and `MOCK_CLOSED`. Other values, including `PROVIDER_VERIFIED` and `CARE_COMPLETED`, return 422 (AC-13.3).
- `MOCK_SENT` and `MOCK_WITHDRAWN` are set only by the system.
- `MOCK_REJECTED` needs a `reason_code`.
- Moves outside the [lifecycle](product-spec.md#53-mock-referral-lifecycle) return 409 `INVALID_TRANSITION` (AC-13.2).
- Events never change triage, review or consent (AC-13.6).

### 6.9 Tracking

**`GET /cases/{id}/tracking`** works from the first send onward, and the flag is computed when read (AC-14.2).

```json
{
  "case_id": "SANAD-7f3c91",
  "case_state": "REFERRAL_REQUESTED",
  "server_time": "2026-11-10T09:03:30Z",
  "is_mock": true,
  "timeline": [
    {"kind": "REVIEW_REQUESTED", "occurred_at": "2026-11-10T08:55:00Z", "verification_source": "SYSTEM_EVENT", "is_mock": true},
    {"kind": "REVIEW_DECISION", "value": "SIMULATED_APPROVAL", "occurred_at": "2026-11-10T08:58:00Z", "verification_source": "SIMULATED", "is_mock": true},
    {"kind": "REFERRAL_EVENT", "value": "MOCK_SENT", "occurred_at": "2026-11-10T09:00:01Z", "verification_source": "SIMULATED", "is_mock": true}
  ],
  "referral": {"referral_id": "REF-41ab", "mock_status": "MOCK_SENT", "care_type": "SPECIALIST", "target_mock_facility_id": "MOCK-CLINIC-A", "is_mock": true},
  "flag": {
    "flag": "DELAYED",
    "stage": "MOCK_SENT",
    "waiting_since": "2026-11-10T09:00:01Z",
    "threshold_seconds": 120,
    "threshold_kind": "MOCK_WORKFLOW_TIMER"
  }
}
```

- `flag` is null at or below the threshold, in end states and in `MOCK_APPOINTMENT_SCHEDULED`.
- Reading this endpoint changes nothing and triggers no reminder (AC-14.4).
- `referral` is null until a referral exists.
- The reviewer sees the same flag as `tracking_flag` in the case detail, so this endpoint stays patient-only (AC-14.6, G7).

### 6.10 Lab observations

**`POST /cases/{id}/observations`** creates a value at `NEEDS_USER_CONFIRMATION`. A bad unit or date does not fail the request. The value is held with its issues listed, and it is not converted or used (AC-15.2).

```json
{
  "test_code": "MOTILITY_PLACEHOLDER",
  "value": 40,
  "unit": null,
  "collected_on": "2026-10-20",
  "reference_source": "Synthetic report"
}
```

201:

```json
{
  "observation_id": "OBS-J3-01",
  "kind": "SEMEN_LAB_VALUE",
  "test_code": "MOTILITY_PLACEHOLDER",
  "value": 40,
  "unit": null,
  "collected_on": "2026-10-20",
  "reference_source": "Synthetic report",
  "source": "USER_ENTERED",
  "confirmation_status": "NEEDS_USER_CONFIRMATION",
  "issues": ["UNIT_MISSING"]
}
```

**`PUT`** replaces the fields and rechecks them. **`DELETE`** returns 204. **`POST .../confirm`** returns the observation at `CONFIRMED_BY_USER`, or 422 `OBSERVATION_INVALID` if `issues` is not empty. Only confirmed values reach assessment. A value that contradicts a self-report keeps both, marked `CONFLICTING`, and the next assess reports it (AC-15.6).

### 6.11 Evidence selection (J2)

**`PUT /cases/{id}/evidence-selection`**

```json
{"items": [{"item_id": "ITEM-MEDICINES", "use": false}]}
```

200 returns every item with `used_in_assessment`. This is separate from field state, so an excluded answer keeps its original state and the PRD's state list does not change (AC-16.1). Genetics items appear only when a result exists and its consent is valid (AC-16.3, OD-08).

### 6.12 v0.4 psychosocial context and closed-loop navigation

These endpoints implement bounded synthetic-prototype contracts from [PRD v0.4](../Sanad_AetherHealth_PRD_v0.4.md#531-closed-loop-functional-contracts-p0) and [E2E workflow v0.4](../Sanad_E2E_Workflow_v0.4.md). They do not add a consent scope, clinical rule, FHIR export or provider integration.

**Psychosocial context**

- `GET /psychosocial/questions` returns at most three draft prompts with `CLINICAL_TBD` and copy-review status. The response is not an approved instrument.
- `GET /cases/{id}/psychosocial` and `PUT /cases/{id}/psychosocial` require the patient token, active `assessment` consent, and an intake state.
- Responses use `YES`, `NO`, `NOT_SURE`, `DECLINED` or `NOT_ASKED`, with the response state preserved separately. Omitted questions in `PUT` become `NOT_ASKED`.
- Stored values carry `PATIENT_REPORTED`, `UNVERIFIED`, `assessment`, `LAST_4_WEEKS` and a timestamp. The table is separate from `Fact`; these values never enter triage rules.
- Patient report and consented reviewer detail expose values as `CONTEXT_ONLY_NOT_TRIAGE`. No psychosocial sharing action exists.

**Navigation**

- Navigation is available only for released guidance in `GUIDANCE_AVAILABLE` or `NAVIGATION_STARTED`. Its ID and version come from the current approved draft; stale guidance cannot be acknowledged.
- `GUIDANCE_ACKNOWLEDGED` is an explicit, deduplicated `SYSTEM_EVENT`. Reading a report is not an acknowledgement.
- Progress is append-only. Booking and visit statuses are `USER_REPORTED` and `UNVERIFIED`; no write path creates `PROVIDER_VERIFIED` or `CARE_COMPLETED`. Progress requests require a client-generated `idempotency_key` (1–128 characters). Repeating the same key and payload in the same episode returns the existing episode without a second event or audit entry. Reusing the key with a different payload returns 409 `IDEMPOTENCY_KEY_REUSED`.
- Barrier requests accept only the fixed code list and `PREFER_NOT_TO_SAY`. Free text is rejected. They require an `idempotency_key` with the same length and replay behavior as progress requests. Audit entries contain counts, not barrier selections.
- Episode rows are bound to the anonymous session token hash. Quick exit deletes that session's navigation rows; expiry cleanup removes rows for expired patient sessions. Funnel metrics include active sessions only.
- The reviewer-only funnel reports each numerator and denominator. Provider-verified visits and care completion are `NOT_AVAILABLE`.

**Conceptual FHIR boundary.** `catalogue/fhir-r4-mapping-0.1.json` is a design manifest only. No FHIR export, validator, profile selection or conformance claim exists. Internal consent checks remain authoritative.

### 6.13 Chat intake and typed-text matching (RF-21, `PROPOSED`)

**`GET /chat/assistant`** (public) returns `assistant_label` ("Sanad assistant"), `assistant_note` ("Scripted questions from a draft catalogue"), `copy_status`, `typing_enabled`, `max_text_chars` (500), and, only when a provider is enabled, `model` (`provider`, `label`, `match_label`), `disclosure` and `disclosure_version` (`MODEL-DISCLOSURE-0.1`).

**`POST /cases/{id}/chat/interpret`**

```json
{"question_id": "Q-STEROID-USE", "text": "used them years ago, not now", "disclosure_version": "MODEL-DISCLOSURE-0.1"}
```

Order of work, each step only if the previous one did not answer:

1. Order guard as for answers: 401, 404, 403 `CONSENT_REQUIRED`, 409 `INVALID_TRANSITION`. The body is limited to 500 characters (422).
2. Decoding (NFKC, control characters removed), then the stage 2a word check against `rules/emergency-text.draft-0.1.json`. A hit applies `EMERGENCY_TRIGGER` and returns `EMERGENCY_GUIDANCE` with `emergency.rule_ids`, version, `CLINICAL_TBD` and `is_simulated: true`.
3. `question_id` must be an intake catalogue question, otherwise 422 `VALIDATION_FAILED` `UNKNOWN_QUESTION`. Safety questions are never accepted.
4. Input checks: `TEXT_EMPTY`, `TEXT_LANGUAGE_NOT_SUPPORTED` (anything outside ASCII, because the word check covers English only) `TEXT_CONTAINS_CONTACT_DETAILS` and, under RF-27, `TEXT_CONTAINS_IDENTIFIER` (ID numbers with a keyword, street addresses) return `NEEDS_CORRECTION`.
5. No provider enabled: `FALLBACK` with `MODEL_DISABLED`.
6. `disclosure_version` must match, otherwise 422 `VALIDATION_FAILED` `DISCLOSURE_NOT_ACKNOWLEDGED`.
7. RF-27 redaction: the task builder replaces names with `[NAME]` and full dates with `[DATE]` before the payload is built. The response carries `redacted_types` (`NAME`, `DATE`; empty when none) and never a redacted value.
8. The `intake.extract.v1` task runs through the adapter, then the validator. The result is `PROPOSAL` or `FALLBACK` with one of `ABSTAIN_OUT_OF_SCOPE`, `ABSTAIN_UNCLEAR`, `MODEL_UNAVAILABLE`, `MODEL_CONTENT_FILTERED`, `MODEL_REFUSED` or `MODEL_OUTPUT_INVALID`.

```json
{
  "outcome": "PROPOSAL",
  "reason_code": null,
  "message": "Check this answer. Nothing is saved until you confirm it.",
  "proposal": {"question_id": "Q-STEROID-USE", "choice": "ANSWERED", "value": true, "temporal_status": "PAST", "echo_label": "Yes, in the past"},
  "produced_by": {"provider": "azure_openai", "model_id": "<deployment>", "label": "Azure OpenAI", "is_ai_generated": true, "verification_status": "UNVERIFIED", "needs_user_confirmation": true},
  "emergency": null,
  "state": {"case_id": "SANAD-7f3c91", "state": "ASSESSING", "case_version": 4, "route": "/intake", "allowed_actions": ["SUBMIT_ANSWERS", "ENTER_OBSERVATION", "ASSESS"]}
}
```

`message` is fixed text chosen by the outcome and reason code. `echo_label` comes from catalogue labels. Neither repeats the typed text. The endpoint writes no fact and does not change `case_version`. The client saves a confirmed proposal through `POST /cases/{id}/answers`, which runs the emergency gate.

**What reaches the model.** A system prompt, the question's text, answer type, unit and options, and the typed text. No case ID, token, earlier answer or other identifier. Stored completions are never requested.

### 6.14 Pinned citations and report explanation (RF-22, `PROPOSED`)

**Citations in `GET /cases/{id}/report`.** Each `evidence` entry keeps `claim_id`, `rule_id`, `status` and `citation`. `status` is `SUPPORTED` (a `VERIFIED` ref, none exist today), `TEAM_CURATED` or `INSUFFICIENT_EVIDENCE`. For `TEAM_CURATED`, `citation` adds the passage fields:

```json
{
  "claim_id": "CLAIM-DRAFT-STEROID-01",
  "rule_id": "DRAFT-STEROID-01",
  "status": "TEAM_CURATED",
  "citation": {
    "source_id": "<SOURCE-ID>", "version": "<version>",
    "passage_id": "<PASSAGE-ID>", "title": "<document title>", "locator": "<section or page>",
    "url": "<publisher URL>", "license": "<license>", "excerpt": "<verbatim excerpt, max 600 chars>",
    "review_status": "TEAM_CURATED", "review_note": "Team-selected source, not reviewed by a clinician"
  }
}
```

**`POST /cases/{id}/report/explanation`** takes no body.

1. Report guard: 401, 404, 403 `CONSENT_REQUIRED`. No current draft: 409 `DRAFT_NOT_CURRENT`. Not released (no current simulated approval): 409 `REPORT_NOT_RELEASED`.
2. No model call, `FALLBACK`, when: no provider (`MODEL_DISABLED`), the reviewer changed the next step (`REVIEWER_EDITED`), or no floor rule has a usable `TEAM_CURATED` passage (`NO_CURATED_PASSAGES`).
3. Otherwise `report.explain.v1` runs through the adapter, then the validator (AC-22.7).

```json
{
  "outcome": "AI_DRAFT",
  "reason_code": null,
  "next_step_label": "Consider a specialist men's health service (andrology).",
  "fallback_text": "You reported using anabolic steroids, now or in the past. A draft rule suggests a specialist service for this.",
  "sentences": [{"text": "<plain-language sentence>", "passage_ids": ["<PASSAGE-ID>"]}],
  "citations": [{"passage_id": "<PASSAGE-ID>", "title": "...", "locator": "...", "url": "...", "review_note": "Team-selected source, not reviewed by a clinician"}],
  "label": "AI draft — Mock review",
  "produced_by": {"provider": "azure_openai", "model_id": "<deployment>", "label": "Azure OpenAI", "is_ai_generated": true, "verification_status": "UNVERIFIED"}
}
```

On `FALLBACK`, `sentences` is empty, `label` and `produced_by` are null, and the client shows `fallback_text`. The response is computed on each call and nothing is stored.

**What reaches the model.** A system prompt, the next-step label, the signal codes of the floor rules and the passage IDs with excerpts. No case ID, token, answer, lab value or free text.

### 6.15 Model budget, run metrics and decision record (RF-23, RF-24, `PROPOSED`)

**Local decision provider (RF-25).** No endpoint changes. With `SANAD_MODEL_PROVIDER=laya_local`, `GET /chat/assistant` returns `model: {"provider": "laya_local", "label": "Laya (local model on this server)", "model_id": "convaiinnovations:laya:<revision, 12 chars>"}`, and `POST /cases/{id}/chat/interpret` returns the same outcomes as with Azure OpenAI. A number question returns `FALLBACK` with `reason_code: "MODEL_UNAVAILABLE"`, because the adapter does not support it.

**Per-case budget.** Before any model call, `POST /cases/{id}/chat/interpret` and `POST /cases/{id}/report/explanation` count the case's `MODEL_TASK_RUN` entries that reached the adapter. At `SANAD_MODEL_MAX_CALLS_PER_CASE` they skip the model and return their usual fallback shape with `reason_code: "MODEL_BUDGET_EXCEEDED"`, still 200. In chat, the emergency word check runs before the budget check.

**`GET /evaluation/model-runs`** (reviewer token) aggregates audit entries. It takes no parameters and returns no case ID, value or text.

```json
{
  "observed_scope": "ALL_SYNTHETIC_CASES",
  "synthetic_demo": true,
  "tasks": [
    {
      "task_id": "intake.extract.v1",
      "calls": 42,
      "by_status": {"OK": 39, "TIMEOUT": 1, "BUDGET_EXCEEDED": 2},
      "by_outcome": {"PROPOSAL": 31, "ABSTAIN": 6, "FALLBACK": 5},
      "attempts_mean": 1.1,
      "latency_ms": {"p50": 1450, "p95": 3800},
      "tokens": {"input": 18200, "output": 2100}
    }
  ]
}
```

**`decision_record` in `GET /reviews/{case_id}`** is built at read time from stored data. Values below are illustrative.

```json
"decision_record": {
  "action": "SPECIALIST",
  "floor": "SPECIALIST",
  "rules": [{"rule_id": "DRAFT-STEROID-01", "signal": "REPORTS_ANABOLIC_STEROID_USE", "sets_floor": true, "rule_version": "draft-0.1", "approval_status": "CLINICAL_TBD"}],
  "catalogue_versions": {"questions": "questions-draft-0.1", "emergency": "emergency-draft-0.1", "emergency_text": "emergency-text-draft-0.1", "lab_tests": "lab-tests-draft-0.1", "passages": "passages-0.1", "consent": "CONSENT-0.1"},
  "facts_used": [
    {"concept_code": "anabolic_steroid_use", "state": "KNOWN_POSITIVE",
     "values": [{"state": "KNOWN_POSITIVE", "value": true, "temporal_status": "PAST", "source_type": "PATIENT_REPORTED"}]}
  ],
  "observations_used": [],
  "evidence": [{"claim_id": "CLAIM-DRAFT-STEROID-01", "rule_id": "DRAFT-STEROID-01", "status": "INSUFFICIENT_EVIDENCE"}],
  "model_runs": [{"task_id": "intake.extract.v1", "status": "OK", "outcome": "PROPOSAL", "at": "2026-11-14T09:00:00Z"}],
  "report_hash": "<sha256>",
  "built_at": "2026-11-14T09:05:00Z"
}
```

## 7. Audit events

The API has no endpoint for reading the audit log in this flow. Tests read the table directly, and reviewers see `decision_history`. Each entry holds actor, time, event type, case ID and the relevant versions (INV-09), and never answers, lab values or notes (INV-03).

| Event type | Written when | Extra fields |
|---|---|---|
| `CASE_CREATED` | Case created | `start_mode` |
| `CONSENT_CHANGED` | Scope granted, declined or revoked | `scope`, `consent_version` |
| `TRANSITION_DENIED` | 409 `INVALID_TRANSITION` | `attempted_action`, `state` |
| `SAFETY_CHECKED` | Safety check or late trigger | `rule_ids`, `catalogue_version` |
| `ASSESSED` | Draft produced | `rule_ids`, `rule_version`, `case_version` |
| `REVIEW_REQUESTED` | Send button | `case_version` |
| `REVIEW_DECIDED` | Reviewer decision | `decision`, `reason_code`, `case_version` |
| `GATE_EVALUATED` | Send referral, allowed or denied | `decision`, `reason_codes`, `policy_version` |
| `SHARE_DENIED` | Spouse share request | None |
| `REFERRAL_EVENT` | Mock event or withdrawal | `mock_status` |
| `CASE_CLOSED` | Case closed | `closed_reason` |
| `SESSION_ENDED` | Quick exit | None |
| `PSYCHOSOCIAL_CAPTURED` | Optional context replaced | `count`, `catalogue_version` (never answer values) |
| `NAVIGATION_ACKNOWLEDGED` | Explicit acknowledgement | `guidance_version` |
| `NAVIGATION_PROGRESS_RECORDED` | User progress or navigation opened | `status`, `verification_source` |
| `NAVIGATION_BARRIER_RECORDED` | Barrier selection | `count`, `prefer_not_to_say` (never reason codes) |
| `SAFETY_CHECKED` with `origin: CHAT_TEXT` | Typed text matched an emergency word pattern | `rule_ids`, `catalogue_version`, `result` |
| `INPUT_CHECKED` | Typed text rejected by the input checks | `result`, `reason_code`, `origin`, `question_id` (never the text) |
| `MODEL_TASK_RUN` | Every model task call, and every call refused by the per-case budget (status `BUDGET_EXCEEDED`) | `request_id`, `task_id`, `provider`, `model_id`, `prompt_version`, `schema_version`, `question_catalogue_version`, `question_id`, `status`, `error_code`, `outcome`, `attempts`, `elapsed_ms`, `input_tokens`, `output_tokens` (when reported) |

Navigation write keys are unique per episode and operation. They are opaque retry tokens, not patient identifiers. The server stores a hash of the normalized request payload with each key so a retry can be distinguished from accidental key reuse.

## 8. Gaps this design found

Writing the contract exposed places where the other specs were silent or wrong. Items that change behaviour are `PROPOSED`, and [CC-009](change-log.md#cc-009-consent-revocation-and-case-state) tracks them for approval.

| ID | Gap | Resolution | Follow-up |
|---|---|---|---|
| G1 | The plan sends Quick exit through `sendBeacon` with Bearer auth, but beacons cannot set headers. The plan also cleared storage first, which would lose the token. | Read the token into a local variable first, then clear storage, then send it in the body. AC-09.2 still holds: storage is clear before the network call. | Plan §4.5 corrected |
| G2 | The plan's API table had no endpoints for sign-in, samples, consent text and read, questions, mock directory, facility snapshot, lab confirm and edit, evidence selection, spouse refusal or close. | Added here. | Plan §5 now points to this document |
| G3 | AC-08.6 removes a case from the queue when `clinician_review` is revoked, but no state change exists, so the case would sit in `PENDING_CLINICIAN_REVIEW` forever. | Add the edge `PENDING_CLINICIAN_REVIEW` to `ASSESSING`. The draft remains and the user may send again. | CC-009 |
| G4 | Nothing said what happens to other scopes, or to a live referral, when `assessment` is revoked. | Revoking `assessment` revokes all scopes and withdraws a live referral. | CC-009 |
| G5 | `EDIT` is required by AC-08.4 but has no edge in PRD §4.7. | No state change, and `case_version` goes up, so `APPROVE` must be on the edited version. | None |
| G6 | AC-10.6 fires emergency rules at once on load, so a J4 sample would skip the safety screen that TC-J4-01 expects. | Kept the immediate trigger because a trigger never waits. TC-J4-01 now uses a blank start with the fixture's answers. Upload triggers stay in TC-10.6. | Test plan updated |
| G7 | The plan listed tracking as Patient and Reviewer, but the reviewer only needs the flag. | Patient-only endpoint, with the flag embedded in the reviewer's detail. | None |
| G8 | The edges into `CLOSED` from `EDUCATION_ONLY`, `EMERGENCY_GUIDANCE_ISSUED`, `REJECTED` and others had no trigger. | Added `POST /cases/{id}/close`. | None |
| G9 | PRD §4.7 has `ASSESSING` to `REPORT_RELEASED` for approved education-only content. Which actions skip review is undecided (TBD-07). | No endpoint uses this edge in this flow, so every draft goes through review. The state machine keeps the edge. | Revisit with TBD-07 |
