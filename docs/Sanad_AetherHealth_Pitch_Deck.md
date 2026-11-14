# Sanad (سند) — Future Health Digital Innovation Challenge 2026 Pitch Deck
> **Generated PowerPoint file:** [Sanad_AetherHealth_Pitch_Deck.pptx](file:///Users/macmini/Desktop/AIApp/sanad-front-door/docs/Sanad_AetherHealth_Pitch_Deck.pptx)  
> **Compliance (`T-55`, `BRD v0.4`, `PRD v0.4`):** Built directly from the official 16-slide Future Health Digital Innovation Challenge template, preserving embedded *Outfit* fonts, collaborator banners (Microsoft, Inception, MBZUAI), and table layouts. **Dan** replaces Phúc across all slides. Contains **no unmeasured quantitative claims** and explicitly marks synthetic data, simulated review, and `CLINICAL_TBD` policy.

---

## Slide 1 — Title & Problem Statement
* **Team Name:** AetherHealth — Sanad (سند)
* **Team Size:** 5 members (Trung, Dan, Hoàng, Vinh, Đạt)
* **Problem Statement:** Challenge 01 — Male Reproductive Health (Fertility): A private, culturally trusted digital front door that lowers stigma and friction, checks acute safety red flags before any AI runs, and connects men to clinician-reviewed next steps with purpose-level consent.

---

## Slide 2 — Team Members*

| S.No | Name | Country | Role | Organization | Age confirmation |
|---|---|---|---|---|---|
| **1** | **Trung** | Vietnam | Tech Lead & Backend Architect | AetherHealth | 18+ Confirmed |
| **2** | **Dan** | Vietnam | Senior AI Engineer (LLM, RAG & Safety) | AetherHealth | 18+ Confirmed |
| **3** | **Hoàng** | Vietnam | AI / ML Engineer (Evaluation & Research) | AetherHealth | 18+ Confirmed |
| **4** | **Vinh** | Vietnam | Full-Stack Engineer (Web, UX & Security) | AetherHealth | 18+ Confirmed |
| **5** | **Đạt** | Vietnam | Business Analyst (Clinical Rules & Product) | AetherHealth | 18+ Confirmed |

---

## Slide 3 — Team Capability Summary* *(838 / 1,000 characters)*
* **Multidisciplinary Healthcare AI & Full-Stack Execution:** AetherHealth combines deterministic clinical workflow engineering, bounded AI extraction, and privacy-by-design architecture.
* **Trung — Tech Lead & Backend Architect:** Leads FastAPI/SQLAlchemy architecture, table-driven assessment state machine, purpose-level consent ledger, deterministic referral gate, and Azure deployment.
* **Dan — Senior AI Engineer:** Owns semantic fact normalization (polarity, temporality, provenance), strict JSON-schema Azure OpenAI extraction adapter, and citation-grounded evidence abstention.
* **Hoàng — AI / ML Engineer:** Owns the reproducible evaluation harness, 70-case emergency rule conformance suite, and isolated SEED-ML v3 / CDC NSFG research benchmarks.
* **Vinh — Full-Stack Engineer & Đạt — Business Analyst:** Vinh builds the patient web app, offline emergency Service Worker, and Mock Reviewer/Facility portals; Đạt owns versioned clinical draft catalogues (`CLINICAL_TBD`) and synthetic fixtures.

---

## Slide 4 — Architecture or Workflow Diagram*
**7-Stage Safety-First Patient & Review Pipeline:**
1. **Private Entry & Consent (`S1`):** Pseudonymous start without login or camera. 5 granular scopes (`assessment`, `clinician_review`, `provider_share`, `spouse_share`, `research_use`).
2. **Pre-LLM Emergency Gate (`S0` / `S0b`):** Deterministic rule check + offline Service Worker (`/urgent.html`). Urgent symptoms trigger immediate 998 guidance with zero LLM dependency.
3. **Adaptive Intake & Lab Entry (`S2` / `S6`):** Catalogue-driven chat/form + manual semen lab entry. Optional Azure OpenAI adapter proposes answer matches requiring user confirmation.
4. **Gatekeeper & Semantic Facts:** Preserves `UNKNOWN`, `DECLINED`, `NOT_ASKED`, and `CONFLICTING` states; separates `PAST` vs. `CURRENT` steroid/smoking history.

**Deterministic Governance, Review & Closed Loop:**
5. **Versioned Rules & Triage Floor (`S4`):** Evaluates draft rules (`CLINICAL_TBD`) to propose triage actions (e.g., steroid history → `SPECIALIST` floor). AI can never lower the rule floor.
6. **Template Reports & Simulated Review (`S7`):** Deterministic patient/clinician drafts with explicit limits. Mock Reviewer approves, edits, rejects, or requests clarification (version-bound).
7. **Pure-Function Referral Gate & Closed Loop (`S8`):** `evaluate_gate` requires active consent + current approval + policy pass. Optional session-scoped acknowledgement, self-reported progress & barriers.

---

## Slide 5 — Target Users and Intended Outcome*
**Target Users & Core MVP Personas (Synthetic Design Scenarios):**
* **Men Seeking Private Early Assessment (`J1`):** e.g., 24yo gym trainee with high BMI & past anabolic steroid use before marriage; needs context-aware screening (muscle mass vs. obesity) without stigma.
* **Men with Acute Warning Symptoms (`J4`):** Needs immediate, offline-capable emergency guidance (998) without waiting for a questionnaire or AI model.
* **Men Holding Existing Semen Lab Reports (`J3`):** Needs unit-safe manual entry, user confirmation, and clear assurance that a single value below WHO reference limits is not an infertility diagnosis.
* **Men Facing Access or Privacy Hesitation (`J5`, `J9`, `J10`):** Can choose `Not sure` or `Prefer not to answer`, or log voluntary barriers (privacy, cost, language, schedule) for non-clinical support.

**Intended Outcomes (Prototype & Future Pilot):**
* **Lower Stigma & Earlier Engagement:** Neutral "men's health" framing, no account/phone/camera required, and explicit protection against unconsented spouse or clinic sharing.
* **Explainable, Non-Diagnostic Next Steps:** Every draft answers 4 questions: *What is known? What is unknown? Why this next step? Who approves it?* Zero personal infertility probability scores.
* **Clinician-Supervised Care Navigation:** Structured pre-visit synthesis reduces intake friction while keeping referrals behind human approval and explicit patient consent.

---

## Slide 6 — How Will Success Be Measured?*
**Measured Prototype Verification (`L0` & `L0b`):**
* **L0 Safety & Invariant Suite (254 Pytest Cases Passing):** 100% emergency override on 70 golden safety cases (`RC-EMERG-001..070`) with LLM disabled; 0% lowering of rule floors.
* **L0 Security & Consent Gate Enforcement:** 0 unauthorized shares or referrals across negative API tests (missing consent, revoked consent, non-reviewer role, stale `case_version`).
* **L0 Data Integrity & Semantic Preservation:** 0% conversion of `UNKNOWN` / `DECLINED` / `NOT_ASKED` into `NO` or `NORMAL`; 100% separation of `PAST` vs. `CURRENT` temporal states.
* **L0b Closed-Loop Funnel Telemetry:** Tracks guidance acknowledged, navigation started, and self-reported booking/visit with explicit denominators and `verification_source` labels.

**Honest Evaluation Boundaries (`L1`, `L2`, `L3`):**
* **L1 Clinical Agreement — `NOT_EVALUATED`:** Because the prototype has no independent licensed clinical advisor yet, clinical validity and under-triage rates are explicitly reported as `NOT_EVALUATED`.
* **L2 Real-World Care Outcomes — Pilot Only:** Provider-verified visits and `CARE_COMPLETED` are never claimed from UI clicks or self-reports; reserved for a future approved clinical pilot.
* **L3 Research ML Isolation (`SEED-ML`):** Reported separately (Macro-F1, Balanced Accuracy, rare-class recall) and architectural tests enforce zero flow into patient triage.

---

## Slide 7 — Evidence Supporting the Approach*
**Clinical & Public Health Grounding (Drafts):**
* **WHO Lab Manual for Human Semen (6th Ed., 2021):** Informs draft semen parameter structure and the mandatory patient notice that a sub-reference value does not mean inability to have children.
* **AUA / ASRM Male Infertility Guidelines:** Informs draft risk-signal categories (anabolic steroids, cryptorchidism, gonadotoxins) and specialist referral floors (tagged `CLINICAL_TBD`).
* **Abu Dhabi DoH / ADPHC Alignment Goal:** Designed to support earlier male participation and cardiometabolic/reproductive screening awareness in line with DoH Responsible AI principles.

**Technical Verification & Abstention Design:**
* **Citation-Or-Abstain Report Engine:** Every rule claim requires a verified source ID and version; unverified or placeholder sources automatically trigger `INSUFFICIENT_EVIDENCE`.
* **Deterministic vs. Bounded AI Verification:** 254 automated API/unit tests verify state transitions, Gatekeeper conflict handling, `S0b` emergency text scanning, and strict `V1` schema validation.
* **Authoring-Only Knowledge MCP (`Mode A`):** Read-only stdio MCP server with pinned tool schemas and SHA-256 manifest verification, isolated from user free text and emergency paths.

---

## Slide 8 — Data Sources and Legal Right to Use Them*
1. **Sanad Synthetic Assessment Fixtures (`data/synthetic/`) — Owner: AetherHealth:** 12 synthetic workflow cases (`J1–J5`, `CN`) + 70 golden emergency cases. Sensitivity: Non-personal (`is_synthetic: true`). Right to use: Original team creation; zero real patient data.
2. **Versioned Draft Catalogues (`catalogue/`, `rules/`) — Owner: AetherHealth:** Draft consent scopes, intake questions, psychosocial items, and triage rules (`CLINICAL_TBD`). Right to use: Original authoring; placeholder citations withheld until licence review.
3. **SEED-ML v3 Dataset (Mendeley Data, 10,124 records) — Owner: Public Authors:** De-identified public research dataset under Creative Commons Attribution 4.0 (`CC BY 4.0`). Used strictly in isolated `WS-C` research; never merged with patient cases or used for triage.
4. **CDC NSFG Male 2022–2023 Public Use File — Owner: US NCHS / CDC:** Public domain survey data for access-barrier research only (`RESEARCH_ONLY`); never used as diagnostic or triage labels.
5. **Personal Data Declaration & UAE Data Residency Note:** **NO** real personal or patient health data (PII/PHI) is used, stored, or transmitted. Any future UAE clinical pilot will require UAE Federal Law No. 2 of 2019 compliance and in-country hosting.

---

## Slide 9 — Risks and Safeguards*
**Privacy, Security & Bias Safeguards:**
* **Privacy & Quick Exit:** Pseudonymous tokens, zero health text in audit/Langfuse logs, closed upload schema (rejects PII), and synchronous Quick Exit (wipes DOM/storage + BFCache redirect).
* **Security & Server-Side Gates:** Every route checks role, case state, and active consent on the server; disabling a UI button is never relied on as a security control.
* **Bias & Contextual Fairness:** High BMI + regular strength training prompts for body-composition context rather than assuming obesity; unknown/declined answers never default to "normal".

**Explainability, Human Oversight & Failure Modes:**
* **Explainability & Honest Labelling:** Every simulated screen carries a visible **Mock** badge (`is_mock: true`, `SIMULATED`); reports separate known facts, unknown fields, and draft limits.
* **Human Oversight & Rule Floor:** LLMs cannot diagnose, prescribe, or lower a deterministic triage floor. Referrals require both patient `provider_share` consent and reviewer approval.
* **Safe Failure Modes:** If Azure OpenAI or the network is down, emergency guidance works offline via Service Worker and intake falls back to deterministic buttons/forms.

---

## Slide 10 — Hardware Requirements
* **No Custom Hardware, Wearables, or Connected Sensors Required (Software-Only MVP):** Sanad runs in any standard mobile or desktop web browser (iOS Safari, Android Chrome, Desktop) with zero external medical hardware dependencies.
* **Strict No-Camera & No-Biometric Hardware Policy (`PRD-AC-33` / Rule #13):** Sanad intentionally never requests camera, microphone, video, or facial/emotion recognition permissions, protecting user trust and physical privacy.
* **Offline Emergency Safety on Standard Smartphones:** A lightweight, allow-listed Service Worker precaches `/urgent.html` and `emergency.draft-0.1.json` after first load so emergency guidance (call 998) works with zero connectivity.
* **Manual Semen Lab Entry Instead of Home Optical Hardware:** Users optionally transcribe values from accredited laboratory reports with explicit unit/date confirmation rather than relying on unvalidated smartphone sperm-camera attachments.

---

## Slide 11 — Login Authentication & Guest Access
**Patient Flow — 100% Guest / No Login Required:**
* **Immediate Anonymous Start (`PRD-FR-01`):** Patients start directly from `/` without creating an account, entering a name, email, phone number, or booking an appointment.
* **Built-in Synthetic Sample Profiles:** Judges can launch pre-loaded synthetic cases (`J1-001`..`J1-004`, `J2-001`, `J3-001`, `J4-001`, `J5-001`, `CN-001`) or a blank session in one click.
* **Per-Tab Ephemeral Session Token:** `POST /api/cases` issues an opaque bearer token in `sessionStorage` so judges can test Patient, Reviewer, and Facility views in the same browser.

**Simulated Staff Consoles — Demo Credentials:**
* **Role Switcher in Top Navigation Bar:** Judges can switch between **Patient View**, **Clinician Console (Mock Reviewer)**, and **Facility Portal (Mock Facility)** at any time from the top navbar.
* **Mock Reviewer Sign-In (`/clinician`):** Username: `demo-reviewer` | Default password in `run.sh`: `123456`
* **Mock Facility Sign-In (`/facility`):** Username: `demo-mock-facility` | Default password in `run.sh`: `123456`

---

## Slide 12 — Path to Pilot and Scale*
**Stakeholders, Clinical Governance & Regulatory Path:**
* **Phase 1 — Clinical Advisory & Rule Sign-Off (Months 1–2):** Partner with UAE urology/andrology specialists to review, calibrate, and sign off all `CLINICAL_TBD` emergency triggers, triage floors, and Arabic copy.
* **Phase 2 — Regulatory & Data Residency Review (Months 2–3):** Confirm SaMD classification with DoH/MOHAP, complete DPIA under UAE Federal Law No. 2 of 2019, and deploy in-country (Azure UAE North).
* **Phase 3 — Supervised Single-Clinic Pilot (Months 4–6):** Integrate consented pre-visit summaries and provider-verified appointment feedback with a partner men's health/fertility clinic in Abu Dhabi.

**Technical Integration & Sustainability:**
* **Standards-Ready Interoperability:** Upgrade the conceptual FHIR R4 mapping manifest (`fhir-r4-mapping-0.1.json`) to validated FHIR R4 Bundle exchange and Sahatna/Malaffi integration.
* **Cost-Efficient SLM & Deterministic Architecture:** Deterministic rules handle safety and triage at near-zero compute cost; small language models (SLMs) run only for bounded extraction/drafting.
* **Sustainable B2B2C Public-Health Value:** Reduces unscheduled/misrouted specialist visits and supports ADPHC preventive male health participation.

---

## Slide 13 — Pre-existing IP and Third-Party Materials*
* **Original Challenge IP (Owned by AetherHealth Team):** All Sanad application code (`apps/api`, `apps/web`, `apps/knowledge`), deterministic rules engine, referral gate, synthetic fixtures (`data/synthetic`), and specs (`specs/`) were created for this challenge.
* **Open-Source Software Libraries (Permissive Licenses):** Backend: Python, FastAPI, Pydantic, SQLAlchemy, Pytest (MIT/BSD). Frontend: React, TypeScript, Vite, Tailwind CSS, Lucide Icons (MIT/ISC).
* **Optional Cloud & Observability SDKs:** OpenAI Python SDK (Apache-2.0) and Azure Identity SDK (MIT) for optional Azure OpenAI integration; Langfuse SDK (MIT) for opt-in redacted operational telemetry.
* **Third-Party Datasets & Clinical Guidelines:** SEED-ML v3 (`CC BY 4.0`, isolated research only); CDC NSFG 2022–2023 (US Public Domain, research only). Clinical guideline text is not redistributed without license clearance.

---

## Slide 14 — Conflict of Interest Declaration*
* **No Conflict of Interest Declared:** None of the AetherHealth team members (Trung, Dan, Hoàng, Vinh, Đạt) have any financial, employment, governance, or personal conflict of interest with the Challenge Organizers, Future Health Abu Dhabi, Microsoft, Inception (G42), MBZUAI, Hack2skill, or the Challenge Judges.
* **Independent Prototype Development:** Sanad was independently conceived, designed, and implemented by AetherHealth using publicly available documentation and synthetic data.
* **No Commercial Clinic Endorsement:** All facilities shown in the prototype directory (`MOCK-FAC-01`..`03`) are fictitious mock entities (`is_mock: true`) and represent no commercial relationship with any healthcare provider.

---

## Slide 15 — Additional Slide: End-to-End Demo Journeys & Non-Negotiable Invariants
* **Live End-to-End Prototype Journeys:** `J1` (Contextual Intake & Steroid Floor), `J4` (Pre-LLM Emergency Override), `J3` & `J5` (Lab Safety & Unknown Preservation), `J9` & `J10` (Closed-Loop Navigation & Barriers).
* **Non-Negotiable Safety Invariants:** `INV-01` (Rules Before AI), `INV-05` (Unknown Stays Unknown), `INV-07` (Single Referral Gate `evaluate_gate`), `INV-08` (Honest Verification — no `PROVIDER_VERIFIED` or `CARE_COMPLETED` in MVP).

---

## Slide 16 — Thank You
* Original template closing slide preserved.

