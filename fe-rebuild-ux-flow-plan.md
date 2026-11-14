# Plan: Rebuild Frontend (Session Dashboard & UX Flow v0.3)

## Goal
Rebuild the Sanad patient web application (`apps/web`) to implement the unified **Session Dashboard**, **Chat Intake**, **Review My Health Profile**, and **IPS-inspired Assessment Summary** as specified in `specs/UX-flow.md` and `editorial-taste-web-overhaul.md`.

---

## Tasks

- [x] **Task 1: Session Dashboard Shell (`SessionDashboard.tsx`)**
  - Implement the 3-panel architectural layout: Left rail ("Your session" progress: Consent → Safety → Questions → Review profile → Submit → Summary → Next step), Central interactive workspace, and Right rail ("What you've told us" recorded ledger).
  - Responsive collapse on mobile (drawer for session steps and facts).
  - *Verify:* `npm run build` succeeds and layout renders in browser with responsive breakpoints.

- [x] **Task 2: Dashboard-Integrated Intake & Chat (`IntakeScreen.tsx` / `ChatIntake.tsx`)**
  - Embed the scripted catalogue chat and form into the central workspace.
  - Display live "Core questions: n of m done" text counter without health score rings.
  - Provide 1-tap toggle between "Use the form instead" and "Sanad assistant" chat.
  - Seamlessly route to "Review My Health Profile" upon completing questions or reaching clarification cap.
  - *Verify:* Answering questions updates the right rail live; clicking "Continue to profile review" navigates to review.

- [x] **Task 3: Pre-Submission "Review My Health Profile" Screen (`ReviewProfileScreen.tsx`)**
  - Group recorded facts into: Basic context, Reproductive concern & health history, Conditions/meds/labs, Lifestyle, Missing/conflicting info.
  - Render per-fact display: value + unit, date, origin (`Chat`, `Sample`, `Upload`, `Manual lab`), polarity, temporal status (`CURRENT` / `PAST`), and verification status (`UNVERIFIED`).
  - Provide 3 actions per item: `Confirm` (user confirmed), `Edit` (reopens originating question/lab), and `Not sure` (preserves uncertainty, never becomes No).
  - Include plain acknowledgment: *"I have reviewed the information above to the best of my knowledge."*
  - *Verify:* Edit button reopens question, changes update fact revision, and acknowledgment unlocks Submit Assessment.

- [x] **Task 4: Explicit "Submit Assessment" & Processing State**
  - Implement explicit `Submit Assessment` button that submits for assessment processing only (never auto-shares with external providers).
  - Show calm processing state ("Checking your answers with draft rules...") with session reference and revision token.
  - Safeguard against duplicate submissions with idempotency/disabled state.
  - *Verify:* Submitting triggers `/api/cases/{id}/assess` and transitions cleanly to `/result` upon server completion.

- [x] **Task 5: IPS-Inspired Result Summary Screen (`ResultScreen.tsx`)**
  - Organize results into 7 clear sections: (1) Recorded health profile, (2) Measurements & lab values, (3) What may need attention / unresolved signals, (4) Optional context (wellbeing), (5) Evidence & limitations, (6) Review status, (7) Allowed next step (Mock referral gate).
  - Ensure all mock referral, clinician review, and draft rule badges display visible **Mock** and `CLINICAL_TBD` stamps.
  - *Verify:* Result page displays all sections accurately on sample cases (J1, J3, J4, J5) with no em-dashes and proper Mock badges.

- [x] **Task 6: Lab Observations Console Integration (`LabScreen.tsx`)**
  - Ensure lab entry can be accessed from Chat, Form, Review Profile, or Result screen.
  - Return the user cleanly to their previous step without resetting session state.
  - *Verify:* Adding a lab test reflects immediately in observations and updates Review Profile.

- [x] **Task 7: App Router & Session State Orchestration (`App.tsx`)**
  - Update route transitions in `App.tsx`: `/` → `/consent` → `/session` (hosting Safety, Intake, Review) → `/result` → `/referral` → `/tracking`.
  - Maintain session restoration on reload and strictly preserve synchronous Quick Exit (`about:blank` wipe).
  - *Verify:* Page refresh restores current step; Quick Exit instantly clears storage and redirects.

- [x] **Task 8: End-to-End Verification & Anti-Slop Audit**
  - Run `npm run build` and `npx oxlint` in `apps/web`.
  - Verify zero em-dashes across all UI copy.
  - Test J1 (Blank intake), J3 (Lab entry), J4 (Sample profile) complete flows end-to-end.
  - Run backend pytest: `apps/api/.venv/bin/python -m pytest apps/api/tests`.
  - *Verify:* All tests pass, build produces zero warnings/errors.

---

## Done When
- [x] Session Dashboard is the primary patient experience after launchpad.
- [x] "Review My Health Profile" screen enables explicit per-fact verification before processing.
- [x] Submit Assessment is an explicit user action separate from provider sharing.
- [x] All 17 Sanad safety invariants, offline emergency link, and mock labels remain unbroken.
- [x] Build and test suites pass 100%.

## Notes
- Adheres to **Editorial Clinical Brutalism**: 2px architectural corners (`rounded-[2px]`), `#0B1310` ink, `#0F523E` forest green, `#F3F4F1` stone, and high-contrast tactile buttons (`shadow-[4px_4px_0px_#0B1310]`).
- Clinical text and rule logic remain `CLINICAL_TBD`.
