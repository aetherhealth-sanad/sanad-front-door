# Sanad – Harness Rules v0.1 (EN)

Nov 3, 2026 · @Nguyen Thanh Trung

## Goals and principles

Sanad's harness is the deterministic rules, consent and state gates, audit logging, and automated checks around the backend. This is a research prototype: the current API makes no model calls, has no browser client, and sends no data outside the app. The HR rules below mix implemented backend controls with future model-agent design; they are targets, not claims that every item is implemented. The current automated gate is the backend pytest suite and Ruff. Model traces, browser/server parity, model timeouts and agent-tool restrictions are not executable until those components exist.

1. **Rules first.** Emergency and draft triage rules run deterministically. There is currently no model result to combine with the rule floor.
2. **Policy sits outside the model and defaults to deny.** Every action with a side effect (writing a record, sending a referral) passes through a code gate. No rule that allows it means it is blocked.
3. **Numbers come from code.** Any implemented comparison uses deterministic code and versioned catalogue values. Clinical thresholds remain draft or absent; no WHO threshold or model explanation is claimed.
4. **Least privilege.** Each agent has only the tools its role needs.
5. **Reviewers see enough to judge.** Yellow and above needs doctor review, and the review screen shows the sources, the rule that fired and the floor.
6. **Every decision leaves a trace and has a test.** Audit events, traces and evals run in CI.
7. **No model in the current backend.** If model integration is proposed later, it requires a separate reviewed contract, provider abstraction, constrained output, deterministic checks and a bake-off before use. No SLM choice is made by this document.

**Current action vocabulary:** the backend uses `TriageAction` values such as `EMERGENCY_GUIDANCE`, `PRIORITY_REVIEW`, and `SPECIALIST`, ordered by the versioned catalogue. The Red/Orange/Yellow/Blue/Green terms below are legacy planning language and do not define the current API taxonomy.

## The six harness layers

&#91;embedded content: Sanad harness architecture · 5 layers and an observability band\]

A call moves from top to bottom, and the policy layer blocks it before any tool or data is touched. The band at the bottom records every decision made in the five layers above it.

## Rules HR-01 to HR-30

Thirty rules in six groups. The "Enforced by" column says whether a rule is guaranteed by code, a test or a process, so that no rule lives only in a prompt.

### A. Triage and rules

| ID | Rule | Enforced by | Task |
| --- | --- | --- | --- |
| HR-01 | Rules run before any future model call; current API has no model-call path | Current deterministic assessment flow; model-order check is future work | T-15, T-05 |
| HR-02 | The emergency gate runs before ordinary assessment, independent of follow-up completeness | Emergency gate and API tests; no model call exists | T-14 |
| HR-03 | Any future proposal must respect the floor ranked by the versioned catalogue; current actions are rule-derived | Catalogue action rank and floor unit tests | T-15, T-19 |
| HR-04 | Clinical thresholds and constants come from the versioned rule catalogue, never from retrieved text | Catalogue in git; version-load test | T-12, T-15 |
| HR-05 | Numbers (WHO 2021 thresholds, unit conversion, age, BMI, time to conceive) are computed by code; the model only explains | Deterministic tool; eval against the golden set | T-15, T-33 |
| HR-06 | Changing a clinical rule goes through change control: PR, reviewer, golden-set rerun | PR template and CI gate | T-06, T-35 |

### B. Consent and identity

| ID | Rule | Enforced by | Task |
| --- | --- | --- | --- |
| HR-07 | Every tool that reads or writes data checks consent for the right purpose (profile\_import, provider\_share, spouse\_share) on the server | Backend middleware; negative-consent tests | T-11, T-65 |
| HR-08 | Revoking consent takes effect at once: the next call is blocked | Mid-session revocation test | T-11, T-02 |
| HR-09 | Tools run in the context of the anonymous case, never with an admin account, and never forward the client's token to a downstream service | Service identities and a secrets store; code review | T-04, T-07 |
| HR-10 | The referral gate opens only when all three conditions hold: provider\_share consent is active, the review is APPROVED, and the backend authorizes the caller (RBAC). Missing any one returns 403, writes an audit event and leaves the case state unchanged | Policy module in section 5; bypass tests | T-26, T-37 |
| HR-11 | An approval is bound to the content hash of the report and has an expiry; if the content changes after approval, the approval is void | Hash comparison in the gate; edit-after-approval test | T-25, T-26 |
| HR-12 | When a case resumes after waiting for review, consent and rules are re-checked before it continues | Hook on every state transition | T-08 |

### C. Humans in the loop

| ID | Rule | Enforced by | Task |
| --- | --- | --- | --- |
| HR-13 | The state machine requires review before releasing guidance or requesting referral; action-specific clinical review levels and timing are not approved | State machine and API gate tests; clinical policy remains `CLINICAL_TBD` | T-08, T-25 |
| HR-14 | The review screen shows the rule that fired, the floor, the cited passages and a diff against the previous version, so approval is not a one-tap habit | UI checklist; usability test | T-25 |
| HR-15 | The review SLA has a clock; overdue cases raise a warning and escalate, and are never auto-approved | Overdue-check job | T-25, T-27 |
| HR-16 | A simulated reviewer must be labelled "Simulated review" on screen and in the audit, because the team has no clinical advisor yet | Mandatory reviewer\_type field | T-13, T-25 |

### D. Tools and data

| ID | Rule | Enforced by | Task |
| --- | --- | --- | --- |
| HR-17 | Future agents may call only the tools in the matrix in section 4; the current API has no agent tool runtime | Planned allowlist; current access is enforced by backend route guards | T-05, T-07 |
| HR-18 | Outbound tools (referral, sharing) are locked for agents; they are reachable only through the HR-10 gate | No grant to agents; test | T-26 |
| HR-19 | Agents return output that matches a versioned schema. SLM output is schema-constrained, and anything that fails validation is rejected | Pydantic and OpenAPI; contract test | T-07 |
| HR-20 | Clinical answers must cite source passages; with no source, the answer is an abstention | Citation check after the model; eval | T-23 |
| HR-21 | Retrieval reads only sources in the approved manifest (version, licence) | Index built from the manifest only | T-22 |
| HR-22 | Research outputs (SEED-ML, NSFG) never reach TriageDecision | Separate module; import test | T-43 |
| HR-23 | Content from uploaded files (semen report, OCR output) is data, not instructions; every field is normalised and unit-checked before use | Semantic fact normalisation; injection red-team | T-18, T-33 |

### E. Runtime

| ID | Rule | Enforced by | Task |
| --- | --- | --- | --- |
| HR-24 | The state machine allows only valid transitions; an illegal one is blocked | Transition table; unit test | T-08 |
| HR-25 | Each case has a cap on steps, tool calls and tokens; exceeding it stops the case safely | Counters in the orchestrator | T-05 |
| HR-26 | Every write (referral, event, progress) carries an idempotency key so a retry creates no duplicate | Duplicate-guard key at the API | T-28, T-29 |
| HR-27 | If a future model or search call times out, return a rules-only result with a label and never invent content | Planned provider abstraction; no model/search calls exist in the current API | T-05 |

### F. Observability, privacy and labels

| ID | Rule | Enforced by | Task |
| --- | --- | --- | --- |
| HR-28 | Every policy decision writes an audit event with policy\_version, decision, reason and an anonymous case id. Prompt text and health data are never logged, only hashes | Data-minimised audit events; no-PHI log test | T-09, T-48 |
| HR-29 | Anonymous sessions auto-delete under the retention policy; quick-exit clears all state on the device | Storage lifecycle rule; session-cleanup test | T-02, T-48 |
| HR-30 | Every simulated part is labelled "Mock", and the product never shows a status confirmed by a provider unless a real confirmation exists. Every output says "Screening, not diagnosis" | Mandatory label in the component; UI test | T-26, T-29 |

## Agent and tool matrix

Every tool is denied by default; the table lists what each agent may call (rule HR-17). No agent may send a referral directly.

| Agent | May call | Forbidden | Runs as |
| --- | --- | --- | --- |
| Gatekeeper | Read the consented FHIR profile (profile\_import), ask follow-up questions, normalise facts | Send a referral, call retrieval, write Consent | SLM agent |
| Rules engine | Read normalised facts and the rule catalogue, compute the triage floor | Call the SLM, call external networks | Code, no model |
| Evidence | Read the case's uploaded files, run OCR, return fields with units | Write to the record before unit and source are confirmed, send data outside | OCR service |
| Clinical Risk | Read facts, search approved sources, return a proposed level with citations | Go below the floor, read data without consent, call write tools | SLM agent |
| Report | Draft patient and clinician reports from existing results | Add new conclusions, give a diagnosis | SLM agent |
| Navigation | Create a draft ServiceRequest, suggest facilities | Send a referral directly; only the HR-10 gate may send | SLM agent plus code |
| Orchestrator | Coordinate handoffs between agents, read case state | Move a case to SENT itself, skip the rules or the gate | Code with SLM planning |

## Referral gate as policy-as-code

The HR-10 gate should be a plain Python function in the backend: deny by default, with unit tests. Moving to a policy engine such as OPA or Cedar only makes sense if the rule count grows; with three conditions and three weeks, a function is enough. This is a sample for Vinh and Trung to align on, not final code.

```python
from dataclasses import dataclass

ALLOWED_ROLES = {"clinician_console"}

@dataclass(frozen=True)
class GateInput:
    consent_provider_share: bool   # FHIR Consent, still active
    review_status: str             # "APPROVED" or any other status
    review_content_hash: str       # report hash when the doctor approved
    report_content_hash: str       # report hash now
    review_expires_at: float
    now: float
    actor_role: str                # caller role, taken from the server-side token

def referral_gate(g: GateInput) -> dict:
    reasons = []
    if not g.consent_provider_share:
        reasons.append("NO_PROVIDER_SHARE_CONSENT")
    if (g.review_status != "APPROVED"
            or g.review_content_hash != g.report_content_hash
            or g.now > g.review_expires_at):
        reasons.append("NO_VALID_APPROVAL")
    if g.actor_role not in ALLOWED_ROLES:
        reasons.append("BACKEND_NOT_AUTHORIZED")
    return {"allow": not reasons, "reasons": reasons,
            "policy_version": "referral-gate-v1"}
```

The handler calls `referral_gate` before any send. If `allow` is false, it returns 403, writes an audit event (policy\_version, reasons, anonymous case id) and leaves the case state unchanged.

Required tests for the gate (T-37):

- Missing provider\_share consent, other conditions met: 403, reason NO\_PROVIDER\_SHARE\_CONSENT.
- Not reviewed, or review rejected: 403, reason NO\_VALID\_APPROVAL.
- Report edited after approval (hash mismatch): 403.
- Approval expired: 403.
- Wrong caller role, or a call made by an agent: 403, reason BACKEND\_NOT\_AUTHORIZED.
- Consent revoked while waiting to send: 403 on the next call.
- All three conditions met: allowed, and sent only once per case (idempotency key).

## Behavioral evals and CI gate

Future agent evals should check traces as well as final answers. The current repository has no agent, browser client, or trace-evaluation runner. The backend workflow runs pytest (including the emergency golden set and API gate tests) and Ruff on pushes and pull requests. It does not claim browser parity or model behavioral coverage.

| Case | Assertion | Status | Rule |
| --- | --- | --- | --- |
| J4: severe testicular pain | Emergency gate fires and the case cannot proceed to review/referral | Backend tests |
| J1: high BMI, steroid use | Draft action uses the configured `SPECIALIST` floor; no diagnosis is produced | Backend tests |
| J3: semen report uploaded | Unverified reference ranges are not compared; confirmation status is preserved | Backend tests |
| Referral gate conditions | Missing consent, approval or policy denies; audit and state checks are tested | Backend tests |
| Consent revoked mid-session | The next dependent call is blocked | Backend tests |
| SLM proposes a level below the floor | Final result is overridden and audited | Planned; no model |
| Uploaded report contains instructions | Data is normalized and cannot call tools or alter policy | Planned; no OCR/agent |
| SLM times out | Rules-only result is returned with a label | Planned; no model |
| Browser/server rule parity | Both evaluators agree across the golden set | Planned; no browser client |
| Logs and traces | No health data or prompt text is recorded | Backend privacy tests; no model traces |

Current CI gate and planned evals:

- The checked-in GitHub Actions workflow runs the backend pytest suite and Ruff on pushes and pull requests. These checks fail the workflow on errors.
- Pytest includes synthetic emergency rule-conformance cases and API safety/referral gate tests. These verify software behavior only; clinical quality remains `NOT_EVALUATED` without independent clinician labels.
- Browser/server parity, model traces, prompt injection red-team and model bake-offs are planned checks and are not currently run by CI.
- Branch protection and required-check configuration are repository-host settings and still need an administrator to enable them.

## Target maturity and ownership

The target for 20/11 is to fully reach L2 and the first part of L3 and L4 on the maturity scale in the source document. That scale is the source's own proposal, not a published standard.

| Level | Target for 20/11 | Related rules |
| --- | --- | --- |
| L1 Basic controls | Reached: tool allowlist, output schema, central logging | HR-17, HR-19, HR-28 |
| L2 Correct authorization | Reached: default-deny policy, purpose-level consent, doctor review | HR-01 to HR-03, HR-07 to HR-16 |
| L3 Durable operation | Partial: state machine, idempotency, timeout and fallback, quota and tracing at the model gateway. No durable checkpointing yet | HR-24 to HR-27 |
| L4 Continuous measurement | Partial: evals on traces in CI, golden set, one round of cross red-team. No SLOs yet | Section 6 |
| L5 Self-improving | Not done: repeated failures are turned into new rules or tests by a person | Not applied |

Ownership by person:

| Person | Owns | Rules |
| --- | --- | --- |
| Trung | Core policy, emergency gate, audit, session cleanup; reviews Vinh's referral gate code | HR-01 to HR-06, HR-09, HR-11, HR-12, HR-17 to HR-19, HR-22, HR-24 to HR-26, HR-28, HR-29 |
| Phúc | Citations, retrieval sources, file-injection defence, SLM timeout and fallback | HR-20, HR-21, HR-23, HR-27 |
| Hoàng | Trace-based evals, golden set, CI gate | Section 6, checks for HR-05 |
| Vinh | Referral gate and consent in the UI, review screen, state machine, Mock labels, quick-exit | HR-07, HR-08, HR-10, HR-13 to HR-15, HR-24, HR-29, HR-30 |
| Đạt | Rule catalogue content, simulated reviewer wording, hard-user role in red-team | HR-04, HR-16, HR-30 |

Next step: add a Rule column to the backlog and put the HR IDs into each task's acceptance criteria.

## Not applied yet, SLM notes and caveats

The source document was written for enterprise agents (quotes, CRM), so some parts do not apply directly to Sanad in three weeks.

- **Cedar and OPA:** not used. The referral gate is a tested Python function; revisit only if the rule count grows.
- **MCP, OAuth 2.1, tool-definition pinning:** Sanad calls tools through its own backend and API gateway, not third-party MCP servers. Pin the OpenAPI version instead (HR-19). If MCP is added later, add rules against tool poisoning and token passthrough.
- **Semantic cache at the gateway:** not used on any step that touches health data or has side effects.
- **Trace naming:** use the OpenTelemetry names `invoke_agent` and `execute_tool`, plus a custom `policy.check` span. That convention is still in Development status, so pin its version.
- **Harness² from Google:** not used to modify Sanad's guardrails automatically. It is research code, not an officially supported Google product.

SLM-specific notes:

- Keep prompts short and give the model one job per agent. Put every constraint that matters in code, not in the prompt.
- Constrain output to a JSON schema and reject anything that fails validation (HR-19).
- Keep the model behind the provider abstraction (T-05), so changing it is configuration.
- Run a bake-off of the SLM against a larger model on the same golden set before locking the choice; Hoàng owns this (T-45, T-46).

Source caveats: "harness engineering" is not a standard issued by a standards body. The performance figures in the source document are published by the vendors themselves. OWASP numbering may differ between the 2025 and 2026 editions, so cite the edition when quoting.

Source: the attached document "Harness Know-how: a standard harness engineering framework for enterprise AI agents" (compared against FPT AI EOS).
