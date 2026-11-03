# Sanad — End-to-End Workflow v0.4

Version: 0.4 | Date: 2026/11/03 | Status: Draft; clinical safety rules pending approval.

## Scope
P0 = mobile-first responsive patient web app, desktop clinician portal, consent and safety, optional psychosocial input, evidence-backed reports, mock navigation, voluntary progress and barrier tracking. P1 = FHIR R4 validator, optional exports. P2/pilot = actual clinician/provider integrations.

```mermaid
flowchart TD
 A[Private Entry + consent] --> B{Deterministic emergency gate}
 B -->|Triggered| E[Approved emergency guidance / no LLM]
 B -->|Clear| C[Adaptive clinical intake]
 C --> D{User opts into psychosocial context?}
 D -->|Yes| D1[Max 3 voluntary self-report questions: stress / sleep / worry]
 D -->|Skip / decline| F[Preserve NOT_ASKED / DECLINED]
 D1 --> F
 F --> G[Semantic Layer: temporal / polarity / source / status]
 G --> H{Gatekeeper complete and coherent?}
 H -->|Clarify| C
 H -->|Ready or limited| I[Evidence + Clinical Rules; psychosocial context NOT automatic triage]
 I --> J[Patient summary + clinician draft]
 J --> K{Clinical approval required?}
 K -->|Yes| L[Authorized clinician review or explicit simulation]
 L -->|Approve| M[Released allowed next-step guidance]
 L -->|Reject / clarification| C
 K -->|No: approved education| M
 M --> N{User chooses next step?}
 N -->|Private| P[Guidance acknowledged / deferred]
 N -->|Mock navigation| O{Consent + action authorization?}
 O -->|No| P
 O -->|Yes| Q[Mock referral / navigation initiated]
 Q --> R[Self-reported progress or optional barrier]
 P --> R
 R --> S[Source-aware outcome and evaluation; no verified care claim]
 E --> S
```

## Swimlane responsibilities

| Actor | P0 responsibility | Not permitted |
|---|---|---|
| Patient | Grants scopes, answers/skips optional questions, selects navigation, self-reports status | Not obligated to share sensitive information |
| Sanad | Emergency check, bounded AI tasks, semantic validation, rules, mock tracking | Diagnose infertility, infer semen quality from stress, auto-share |
| Clinician | Review/approve permitted drafts when actual reviewer exists; otherwise show simulation clearly | Simulated approval cannot be presented as real |
| Healthcare provider | No live provider integration in MVP | No `SCHEDULED/SEEN` as verified without real evidence |

## Data-exchange boundary
Internal case → FHIR R4 conceptual mapper (`Patient`, `QuestionnaireResponse`, `Observation`, `DiagnosticReport`) using synthetic case. Mapping does not change consent enforcement or constitute FHIR conformance. Provider interfaces require separate security, clinical and legal review.

## Exceptions and regression cases
Emergency always overrides AI; LLM outage leaves safe form/rules; opt-out does not block intake; missing information does not imply normal; clinically unapproved signals cannot cause automatic referral; consent revoked blocks sharing; user booking/visit reports remain `SELF_REPORTED`; simulated outcomes not called verified.
