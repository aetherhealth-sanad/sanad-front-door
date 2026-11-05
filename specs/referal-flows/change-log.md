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
| 0.5 | 2026-11-05 | Synchronized implementation status with current patient/staff UI source; clarified J9/J10 client test gaps and parent-scope conflicts; removed unreviewed clinical claims from education; aligned Quick Exit with existing wipe/BFCache/neutral-title criteria. No BRD/PRD contract or clinical rule changed; verification and content review remain pending. | Codex | Pending |
| 0.4 | 2026-11-03 | Specified idempotency for navigation progress/barrier retries; clarified current harness and CI scope. | Codex | Pending |
| 0.3 | 2026-11-03 | Added backend contracts for PRD v0.4 psychosocial context and session-scoped closed-loop navigation; added conceptual FHIR mapping manifest; recorded session-only progress retention choice for review. | Codex | Pending |
| 0.2 | 2026-11-02 | Added `api-design.md`. Corrected Quick exit order in plan §4.5 so the token survives and travels in the beacon body. Replaced the API table in plan §5 with a link. Changed TC-J4-01 to a blank start. Opened CC-009. | Drafted by Claude Code for trung1234 | Pending |
| 0.1 | 2026-11-02 | First draft of the product spec, implementation plan and test plan, covering milestones M1 to M3. Added `AGENTS.md`. Reconciled the team brief with BRD and PRD v0.3. No code written. | Drafted by Claude Code for trung1234 | Pending |

## Change-control records

Each proposal below changes or extends a parent document, so it needs an approver. CC-001 to CC-008 were opened with version 0.1, and CC-009 with version 0.2.

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
