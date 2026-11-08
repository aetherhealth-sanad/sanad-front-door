# Editorial Taste Web Overhaul & Full API Integration Plan

## 1. Objective
Rebuild the Sanad (`سند`) Landing Page and complete Web Application (`apps/web`) using **Editorial Clinical Brutalism** (`frontend-design` / Taste Skill anti-slop rules) while integrating all latest backend APIs in `apps/api/sanad_api`.

## 2. Design Commitment
- **Style:** Editorial Clinical Brutalism (Swiss Architectural Dossier)
- **Dials:** `DESIGN_VARIANCE: 8`, `MOTION_INTENSITY: 6`, `VISUAL_DENSITY: 5`
- **Palette:** Mineral Stone (`#F3F4F1`), Pure Surface (`#FFFFFF`), Obsidian Forest Ink (`#0B1310`), Locked Forest Emerald Accent (`#0F523E`), Clinical Crimson (`#B91C1C`) for Emergency/Quick Exit.
- **Geometry:** Locked `2px` architectural corners (`rounded-[2px]`), exposed `1px`/`2px` structural hairlines, tactile offset shadows (`shadow-[4px_4px_0px_#0B1310]`).
- **Pre-Flight Guarantees:**
  - Zero em-dashes anywhere in UI strings
  - Eyebrow restraint ($\le 1$ per 3 sections)
  - Hero fits initial viewport (`pt-10 lg:pt-14`, headline $\le 2$ lines, subtext $\le 20$ words, max 4 text elements)
  - Real photography assets (`picsum.photos` seeded clinical/architectural imagery)
  - All 17 Sanad invariants preserved (`MockBadge`, offline `UrgentLink`, synchronous `QuickExit`, neutral language, unknown distinctness).

## 3. Full API Integration Scope (`apps/web/src/api/client.ts`)
1. **Case Creation & Lifecycle (`cases/routes.py`):**
   - `POST /api/cases` with `start_mode: 'SAMPLE' | 'UPLOAD' | 'BLANK'` and `preferred_language: 'en' | 'ar'`
   - `GET /api/cases/{id}/state`
   - `POST /api/cases/{id}/close` (User-initiated session/case close without penalty, BR-32)
2. **Profile Loading (`intake/routes.py`):**
   - `POST /api/cases/{id}/profile/sample`
   - `POST /api/cases/{id}/profile/upload` (Multipart JSON file upload against `upload-profile.schema.json`, RF-02 / T1.7 / T1.10)
3. **Lab Observations J3 (`observations/routes.py`):**
   - `GET /api/cases/{id}/observations`
   - `POST /api/cases/{id}/observations`
   - `PUT /api/cases/{id}/observations/{obs_id}`
   - `DELETE /api/cases/{id}/observations/{obs_id}`
   - `POST /api/cases/{id}/observations/{obs_id}/confirm`
4. **Safety, Intake, Psychosocial & Selective Evidence (`intake/routes.py`, `psychosocial/routes.py`):**
   - `POST /api/cases/{id}/safety-check` (with offline local draft rule evaluation fallback)
   - `GET /api/cases/{id}/questions` & `POST /api/cases/{id}/answers`
   - `GET /api/psychosocial/questions` & `PUT /api/cases/{id}/psychosocial`
   - `PUT /api/cases/{id}/evidence-selection` (J2 selective evidence inclusion/exclusion)
   - `POST /api/cases/{id}/assess` (`FULL_INTAKE` and `LAB_ENTRY`)
5. **Report, Review, Referral Gate, Navigation & Tracking:**
   - `GET /api/cases/{id}/report`
   - `POST /api/cases/{id}/review-requests`
   - `POST /api/cases/{id}/navigation/start`, `GET /api/cases/{id}/navigation`, `POST .../acknowledgements`, `POST .../progress`, `POST .../barriers`
   - `GET /api/mock-directory`, `GET /api/cases/{id}/referral-gate`, `POST /api/cases/{id}/mock-referral`
   - `GET /api/cases/{id}/tracking`
   - Staff consoles: `POST /api/auth/login`, `POST /api/auth/logout`, `/api/reviews/*`, `/api/mock-facility/*`, `/api/evaluation/navigation-funnel`

## 4. Component & Screen Architecture
- `apps/web/index.html` & `apps/web/src/index.css`: Typography (`Plus Jakarta Sans` + `JetBrains Mono`), Editorial Clinical Brutalism CSS variables, spring reveal animations, tactile press utilities, reduced-motion fallbacks.
- `apps/web/src/components/`:
  - `Navbar.tsx`: Single-line desktop architectural header ($\le 72\text{px}$), Role Switcher (`Patient`, `Mock Reviewer`, `Mock Facility`), active Case ID & Close Case trigger, `UrgentLink`, `QuickExit`.
  - `StepProgress.tsx`: Architectural dossier progress bar including `/lab` when active.
  - `MockBadge.tsx`: Crisp `2px` brutalist stamp with `data-testid="mock-badge"` and `data-mock="true"`.
  - `UrgentLink.tsx` & `QuickExit.tsx`: High-contrast clinical crimson controls preserving all test IDs and offline/wipe invariants.
- `apps/web/src/pages/`:
  - `StartScreen.tsx`: Editorial Clinical Brutalist Landing Page with 4 distinct layout families:
    1. Asymmetric 12-Col Hero Dossier + Interactive Case Launchpad (`SAMPLE`, `UPLOAD` JSON with schema preview/downloadable sample JSON, `BLANK`, language `en`/`ar`).
    2. Architectural Trust & Invariant Strip (Horizontal ledger with real SVG marks).
    3. Interactive Clinical Pipeline & Safety Matrix (Tabbed/Step dossier showing how Rules, Gatekeeper, and `evaluate_gate` operate).
    4. Conceptual Governance & FHIR R4 Boundary Manifest (`DESIGN_ONLY` / `NOT_EVALUATED` transparency ledger).
  - `ConsentScreen.tsx`: Purpose-level consent ledger with automatic `SAMPLE` or queued `UPLOAD` profile application after `assessment` consent is granted.
  - `SafetyScreen.tsx`: Offline-capable deterministic safety check with instant local rule trigger.
  - `LabScreen.tsx`: Complete J3 Lab Observation console (`/lab`) wired to `/api/cases/{id}/observations` and `catalogue/lab-tests.draft-0.1.json`.
  - `IntakeScreen.tsx`: Structured follow-up intake with explicit `NOT_SURE` / `PREFER_NOT_TO_ANSWER` / `NOT_ASKED` states, conflict resolution, link to Lab Entry, and optional Psychosocial micro-intake.
  - `ResultScreen.tsx`: Synthesis dossier with J2 Selective Evidence toggles (`PUT /cases/{id}/evidence-selection`), recorded facts, unknown badges, lab observations, rule citations, and Mock Reviewer / Navigation triggers.
  - `ReferralScreen.tsx`: 3-condition `evaluate_gate` live inspector, Mock facility selector, and session-scoped J9/J10 closed-loop navigation feedback.
  - `TrackingScreen.tsx`: Live telemetry timeline, workflow delay flag inspector, and case closure option.
  - `ClinicianPortal.tsx` & `MockFacilityPortal.tsx`: High-density dual-pane staff consoles with closed-loop funnel metrics and version-bound decisions.
