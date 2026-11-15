# Model task policy cards

One card per model task and per provider (RF-23 AC-23.13, ProtonX Governance Harness). A card says what the model may do, what it must never do, what data it receives and what happens when it fails. A test fails when a task ID or provider in code has no card here.

Status: `PROPOSED`. Owner and approver are roles until the team names people; nothing here is approved for use with real patients. A passing test suite is not evidence of clinical safety.

## Task `intake.extract.v1`

Chat answer matching (RF-21). Off by default.

| | |
|---|---|
| **Allowed** | Suggest which catalogue answer a typed message means for the current intake question, or abstain. |
| **Restricted** | Runs only after the emergency word check, the input guardrail (RF-21, RF-27), the disclosure check and the per-case budget. Every proposal needs the user's confirmation before anything is saved. |
| **Prohibited** | Writing a fact; answering a safety-screen question; triage, emergency, consent, review or referral decisions; free-text replies to the user; any diagnosis or probability. |
| **Data sent** | The question, its catalogue options and the typed text after redaction of names and full dates (RF-27). No case ID, token, earlier answer or identifier. |
| **Output** | Strict JSON schema, then the code validator (AC-21.5). Opt-outs never become No. |
| **On failure** | Fixed message and the buttons; a code-only `MODEL_TASK_RUN` trace. |
| **Evaluation** | RF-23 intake case file; limits: accuracy at least 0.90, zero unsafe conversions, zero PII leaks (OD-15, AC-27.7). |
| **Owner / approver** | Tech Lead / pending (CC-011) |

## Task `report.explain.v1`

Plain-language explanation of a released report (RF-22). Off by default.

| | |
|---|---|
| **Allowed** | Restate, in at most a few sentences, why the released next step was suggested, using only the passages sent. |
| **Restricted** | Only for a released report; only passages from the pinned catalogue; every sentence cites a sent passage; the output policy check runs on every sentence (AC-22.11). |
| **Prohibited** | Diagnosis, probability, sterility or fertility statements, prescriptions, cures, certainty phrasing, a cue for a next step other than the released one, identifiers, new clinical claims. |
| **Data sent** | The released next-step label, the rule signals and the passage texts. No patient answers, case ID or typed text. |
| **Output** | Strict JSON schema, then the validator; blocks are reported as `OUTPUT_POLICY_BLOCKED`. |
| **On failure** | The report shows without an explanation; a code-only trace. |
| **Evaluation** | RF-23 explanation case file; offline rubric judge with a 0.80 calibration gate (AC-23.15). |
| **Owner / approver** | Tech Lead / pending (CC-013) |

## Provider `azure_openai`

| | |
|---|---|
| **Allowed** | Serving the two tasks above through the Azure OpenAI v1 API with strict structured output. |
| **Restricted** | Entra ID authentication recommended; a hosted deployment refuses API keys (AC-21.13). Keys only in the untracked `.env`. Retries only timeouts, connection errors, 429 and 5xx within one deadline. |
| **Prohibited** | Any other task; storing completions; sending identifiers or case IDs. |
| **Data leaves the app** | Yes, to the configured Azure resource. Synthetic text only until CC-011 is approved. |
| **Owner / approver** | Tech Lead + Security / pending |

## Provider `laya_local`

| | |
|---|---|
| **Allowed** | `intake.extract.v1` yes/no and choice questions only, on the API host, with a pinned revision and optionally a fitted calibration (RF-25). |
| **Restricted** | Abstains on low probability, review routes, uncalibrated options and ambiguous prediction sets. Stays off until its scorecard passes OD-15. |
| **Prohibited** | Number questions, the explanation task, any decision in the protected modules (AC-25.10). |
| **Data leaves the app** | No; weights download once, typed text stays on the host. |
| **Owner / approver** | Tech Lead / pending (CC-015, CC-017); weight licence pending (OD-17) |
