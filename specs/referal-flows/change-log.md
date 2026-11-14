# Referral Flows — Change Log

Records changes to the [product spec](product-spec.md), [implementation plan](implementation-plan.md) and [test plan](test-plan.md), newest first.

**How to use this file**

- Add an entry in the same PR as any change to these specs.
- Do not edit past entries. Add a new one that corrects or replaces them.
- Add a change-control record when a change touches clinical rules, triage levels, label taxonomy, consent scopes, data policy or a PRD contract ([BRD v0.4 §17](../Sanad_AetherHealth_BRD_v0.4.md#17-delivery-plan--change-control)).
- Write "Pending" until a named person approves. **Never record an approval that did not happen.** An unapproved item stays `PROPOSED`.

## Versions

| Version | Date | Change | Author | Reviewed by |
|---|---|---|---|---|
| 0.8 | 2026-11-12 | Implemented bounded harness code after the user directly requested implementation: shared structured profile guardrail, off-by-default redacted Langfuse telemetry, separate read-only authoring MCP server with strict hashed tools, and isolated knowledge database schema. No runtime model calls, new clinical rules or referral path were added. TC-HR acceptance, M3 exit and Tech Lead review remain pending. | Codex | Pending (Tech Lead and acceptance) |
| 0.7 | 2026-11-12 | Opened CC-016 for deterministic harness hardening, opt-in redacted Langfuse telemetry and Mode A MCP only. Requester approved the Product/Security scope and selected self-hosted Langfuse; formal named approver entry, Tech Lead review and M3 exit remain pending. Runtime agents and new clinical rules remain out of scope. | Codex | Pending (Product/Security requester name and Tech Lead) |
| 0.6 | 2026-11-08 | Added RF-21 chat intake with a bounded model adapter (AC-21.1 to AC-21.12, T4.5, TC-21.1 to TC-21.12, API design §6.13). Added an optional Azure OpenAI adapter, off by default, a stage 2a emergency word check for typed text, and the `INPUT_CHECKED` and `MODEL_TASK_RUN` audit events. Amended INV-01. Opened CC-011 and CC-012. Settings, including the Azure OpenAI key, can live in a Git-ignored `apps/api/.env` copied from the committed `apps/api/.env.example` (placeholders only); shell variables still win. **Order of work:** code and tests were written in the same branch as these spec changes, not after review, so the spec must be reviewed before merge and the code changed if review changes the spec. | Drafted by Claude Code for trung1234 | Pending |
| 0.5 | 2026-11-05 | Synchronized implementation status with current patient/staff UI source; clarified J9/J10 client test gaps and parent-scope conflicts; removed unreviewed clinical claims from education; aligned Quick Exit with existing wipe/BFCache/neutral-title criteria. No BRD/PRD contract or clinical rule changed; verification and content review remain pending. | Codex | Pending |
| 0.4 | 2026-11-03 | Specified idempotency for navigation progress/barrier retries; clarified current harness and CI scope. | Codex | Pending |
| 0.3 | 2026-11-03 | Added backend contracts for PRD v0.4 psychosocial context and session-scoped closed-loop navigation; added conceptual FHIR mapping manifest; recorded session-only progress retention choice for review. | Codex | Pending |
| 0.2 | 2026-11-02 | Added `api-design.md`. Corrected Quick exit order in plan §4.5 so the token survives and travels in the beacon body. Replaced the API table in plan §5 with a link. Changed TC-J4-01 to a blank start. Opened CC-009. | Drafted by Claude Code for trung1234 | Pending |
| 0.1 | 2026-11-02 | First draft of the product spec, implementation plan and test plan, covering milestones M1 to M3. Added `AGENTS.md`. Reconciled the team brief with BRD and PRD v0.3. No code written. | Drafted by Claude Code for trung1234 | Pending |

## Change-control records

Each proposal below changes or extends a parent document, so it needs an approver. CC-001 to CC-008 were opened with version 0.1, CC-009 with version 0.2, CC-010 with version 0.3, CC-011 and CC-012 with version 0.6, and CC-016 with version 0.7 (CC-013 to CC-015 are reserved by RF-22 to RF-25 on a parallel branch).

### CC-016 Deterministic harness, Langfuse and authoring-time MCP

| Field | Value |
|---|---|
| **Status** | `PROPOSED`; user directly requested code and identified themself as Product/Security approver, selecting self-hosted Langfuse. Formal named approver entry, Tech Lead review, acceptance and M3 exit criteria remain pending; code is not release approval. |
| **Reason** | The product request asks for MCP, policy-engine, Langfuse observability and guardrails. Current code already has the deterministic Python `evaluate_gate`, emergency catalogue and closed-schema API checks, but no MCP server, Langfuse exporter or free-text/model runtime. |
| **Evidence** | `harness.md` HR-01/02/10/19/28; PRD-FR-35/38/40/41 and NFR-03/08/19/21/24; `mcp-context-design.md` v0.2 is `PROPOSED`, `TECH_TBD` and requires change control before code. PRD-FR-37 defers runtime model agents. |
| **Change** | Retain server-side default-deny checks and the single Python referral gate; preserve emergency ordering and add no clinical rules; constrain MCP to local authoring-time, read-only Mode A against approved manifest sources; make Langfuse opt-in and off by default, with an operational-field allowlist and no request bodies, health data, case IDs, prompts, passages or tokens. Bounded code is present. Langfuse deployment target is self-hosted; endpoint/operator configuration and formal review remain outstanding. MCP Mode B and all model calls remain out of scope. |
| **Affected journeys** | J1–J5 safety/action paths; internal authoring workflow. MCP does not enter the patient or emergency journey. |
| **Tests** | TC-HR-01 to TC-HR-08 (proposed; software checks only). Renumbered from RF-18/CC-011 on 2026-11-14 because those IDs were already in use. |
| **Approver** | Product/Security: requester stated approval on 2026-11-12; formal named entry pending. Tech Lead: pending. Langfuse endpoint and operator configuration remain outstanding. |
| **Version** | Product spec 0.2; harness proposal, implementation plan and test plan updates 2026-11-12. |

### CC-011 Optional model call for typed chat text

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending. Code is present and **off by default**. Do not enable it in a demo before approval. |
| **Reason** | The team asked for a chat intake that uses Azure OpenAI. PRD-FR-37 (Must) and PRD-FR-04 call for a bounded model adapter. Product spec §3.2 and INV-01 ruled out every model call. |
| **Evidence** | PRD 4.7.1 and 4.7.2 define the order of checks and the task envelope. Microsoft's v1 API, structured outputs and data-privacy pages were read on 2026-11-08 (see [Azure service guide §9](../azure-service-guide.md#9-azure-openai-for-rf-21-answer-matching)). |
| **Change** | (1) One model task, `intake.extract.v1`: typed text for one intake question goes to the configured provider, which may only pick that question's answer, an opt-out, or abstain. The user confirms before anything is saved. (2) The text leaves the app only when an operator sets `SANAD_MODEL_PROVIDER=azure_openai` and the user has read a disclosure naming the provider. (3) The text is not stored or logged, and the request carries no case ID or token. (4) INV-01 now reads: no model call by default; emergency rules, consent, state, triage, review and the gate never call a model. |
| **Data policy** | Sending typed text outside the app is a data-policy change (AGENTS.md). The `assessment` consent text ("Only this session") does not describe it, and is **not** changed here (R16). Microsoft states prompts and completions are not used to train models. Prompts may be kept for abuse monitoring unless modified abuse monitoring is approved, and Global deployments may process data in any region. Region, deployment type and abuse-monitoring status must be decided before enabling (OD-13). |
| **Affected journeys** | J1, J3, J5 at `/intake`. J4 gains the typed-text emergency path (CC-012). |
| **Tests** | TC-21.1 to TC-21.12 |
| **Approver** | Pending (Product + Security + Legal for the data policy and consent text; Tech Lead for the adapter) |
| **Version** | Spec 0.6 |

### CC-012 Draft emergency word patterns for typed text

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, `CLINICAL_TBD`, approval pending |
| **Reason** | Typed text must pass a code-only emergency check before any other check or model call (PRD-FR-03 stage 2a, PRD-AC-50, GOLD IG-01). No approved pattern list exists (OQ-30). |
| **Evidence** | `rules/emergency.draft-0.1.json` holds three draft triggers copied from the README triage table. |
| **Change** | `rules/emergency-text.draft-0.1.json` restates each of the three draft triggers as word groups. It adds no trigger, and the loader refuses a rule that does not restate an existing one. Matching ignores negation on purpose, so "no sudden severe testicle pain" also fires: a false alarm shows emergency guidance and ends the assessment, which is judged less harmful than a miss. English only. Text in another script is never sent to a model. |
| **Affected journeys** | J4, and every journey that uses typing |
| **Tests** | TC-21.1, TC-21.2 |
| **Approver** | Pending (Clinical for the patterns and the false-alarm trade-off; Localization for Arabic) |
| **Version** | Spec 0.6 |

### CC-010 Session-only closed-loop retention

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, Product + Security review pending |
| **Reason** | PRD v0.4 OQ-19 leaves persistence of self-reported progress across anonymous sessions unresolved. |
| **Evidence** | The user selected session-only retention for this implementation; PRD v0.4 §4.13 requires progress retention policy and BRD v0.4 §10.7 limits the anonymous progress record. |
| **Change** | Bind navigation episodes to the patient session. Delete navigation acknowledgement, progress and barrier rows on explicit session end and expire them in the backend cleanup task. They are not visible to later sessions. |
| **Affected journeys** | J9, J10 |
| **Tests** | TC-19.4 |
| **Approver** | Pending (Product + Security) |
| **Version** | Spec 0.3 |

### CC-001 Offline emergency guidance

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | The brief requires emergency guidance to open with no network. |
| **Evidence** | Team brief. PRD Screen 3 says guidance must not wait for the network. OQ-12 leaves offline support open and says health data must not be cached by default. |
| **Change** | Store a static emergency page and allow-listed files on the device, and cache no API responses. Answers OQ-12 for this flow only. |
| **Affected journeys** | J4, all patient screens |
| **Tests** | TC-05.1 to TC-05.8, TC-09.7 |
| **Approver** | Pending (Frontend + Security, per OQ-12) |
| **Version** | Spec 0.1 |

### CC-002 Quick exit becomes required

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | The brief requires Quick exit in M2. |
| **Evidence** | PRD-FR-11 includes it only "if time allows", and the README lists it as unscoped design intent. |
| **Change** | Quick exit is must-have, on every patient screen. |
| **Affected journeys** | All patient journeys |
| **Tests** | TC-09.1 to TC-09.8 |
| **Approver** | Pending (Product) |
| **Version** | Spec 0.1 |

### CC-003 Mock referral lifecycle

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | The brief requires a mock facility that can receive, reject and schedule, and a screen tracking those events. |
| **Evidence** | PRD §4.7 moves `REFERRAL_REQUESTED` straight to `CLOSED`, with no states in between. |
| **Change** | Add a separate `mock_status` lifecycle on the referral (product spec §5.3). Case states do not change. Forbidden outcomes stay forbidden: `PROVIDER_VERIFIED`, `CARE_COMPLETED`. |
| **Affected journeys** | J1, J2, J3 |
| **Tests** | TC-13.1 to TC-13.6, TC-J1-03, TC-J1-04 |
| **Approver** | Pending (Backend + Product) |
| **Version** | Spec 0.1 |

### CC-004 Delayed flag as a mock workflow timer

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | The brief requires a flag when a sent case is delayed. |
| **Evidence** | README and BRD set no review or response times until a clinician approves them, and BR-32 forbids default reminders and punitive tracking. |
| **Change** | Flag from a configurable timer, labelled as not a clinical deadline. It does not change triage, send reminders or attribute the delay to the user. Its value (120 seconds) suits the demo and carries no clinical meaning. |
| **Affected journeys** | J1, J2, J3 |
| **Tests** | TC-14.2 to TC-14.4, TC-DL-01 |
| **Approver** | Pending (Product + QA; Clinical if ever presented as a service level) |
| **Version** | Spec 0.1 |

### CC-005 Case state machine additions

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | A later emergency trigger had no path to guidance, and a rejected case had no exit. |
| **Evidence** | PRD §4.7 only allows the emergency edge from `CONSENTED`, and BR-06 requires guidance whenever a trigger appears. `REJECTED` has no outgoing edge. |
| **Change** | Add `ASSESSING`, `NEEDS_INFORMATION` and `REVISION_REQUIRED` to `EMERGENCY_GUIDANCE_ISSUED`. Add `REJECTED` to `CLOSED`. |
| **Affected journeys** | J1, J3, J4, J5 |
| **Tests** | TC-04.4, TC-10.6 |
| **Approver** | Pending (Tech Lead; Clinical for the emergency edge) |
| **Version** | Spec 0.1 |

### CC-006 Simulated approval passes the gate

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | No clinician exists yet, so a strict approval check could never pass in the demo. |
| **Evidence** | PRD §4.10 defines `SIMULATED_APPROVAL`. README states the clinical advisor is TBD. |
| **Change** | The gate accepts `SIMULATED_APPROVAL`, with the banner `MOCK — SIMULATED REVIEW — NOT CLINICALLY APPROVED`. The only possible outcome is a mock referral. This must be revisited before any real action exists. |
| **Affected journeys** | J1, J2, J3 |
| **Tests** | TC-08.3, TC-08.4, TC-12.1, TC-12.8 |
| **Approver** | Pending (Product + Security) |
| **Version** | Spec 0.1 |

### CC-007 Draft label without AI

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | This flow has no AI, so the required `AI-generated draft` label would be untrue. |
| **Evidence** | BR-11 and PRD-FR-08 require that label on drafts. |
| **Change** | Use "Draft, generated from draft rules" until AI drafting exists. |
| **Affected journeys** | J1, J2, J3 |
| **Tests** | TC-11.3 |
| **Approver** | Pending (Product) |
| **Version** | Spec 0.1 |

### CC-008 Consent for genetics results

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | J2 needs a consent basis for a genetics result, and no scope covers it. |
| **Evidence** | README and BRD J2 require "valid consent" without defining it. BR-02 lists five scopes. |
| **Change** | No new scope. Use `assessment`, `clinician_review` and a per-item choice (OD-08). |
| **Affected journeys** | J2 |
| **Tests** | TC-16.1, TC-16.3 |
| **Approver** | Pending (Product + Security) |
| **Version** | Spec 0.1 |

### CC-009 Consent revocation and case state

| Field | Value |
|---|---|
| **Status** | `PROPOSED`, approval pending |
| **Reason** | Revoking `clinician_review` during review left a case stuck in `PENDING_CLINICIAN_REVIEW`, and the effect of revoking `assessment` on other scopes and on a live referral was undefined. |
| **Evidence** | AC-08.6 removes the case from the queue but names no state change. PRD §4.7 has no matching edge, and OQ-04 leaves revocation open. See [API design §8](api-design.md#8-gaps-this-design-found), G3 and G4. |
| **Change** | Add the edge `PENDING_CLINICIAN_REVIEW` to `ASSESSING` when `clinician_review` is revoked. Revoking `assessment` revokes all scopes and moves a live referral to `MOCK_WITHDRAWN`. |
| **Affected journeys** | J1, J2, J3 |
| **Tests** | TC-03.5, TC-04.4, TC-08.6, TC-13.4 |
| **Approver** | Pending (Backend + Security) |
| **Version** | Spec 0.2 |

## Decisions log

Open decisions and their defaults live in [product spec §11](product-spec.md#11-open-decisions). Record each confirmation here.

| Date | Decision | Outcome | Decided by |
|---|---|---|---|
| | | | |
