# Bug fix: summary download is a JSON file, and the privacy screen has UI errors

Read `AGENTS.md` first. Follow its hard rules, especially: no health data in localStorage or IndexedDB, label everything simulated as Mock, never show unreviewed judgment, no unmeasured claims, "Screening, not diagnosis" on every result.

Find the code by searching for these strings:
- `Download my summary`, `Keep a summary for your next visit`, `sanad-summary-`
- `Privacy & Information Boundaries`, `Confidential Patient Session`, `Quick Setup Options`, `Continue to Health Education`, `Skip to General Education`

Observed locally on `http://127.0.0.1:3000` on 2026-11-16.

---

## Bug 1: "Download my summary" gives the user a raw JSON file

### What happens
On the result page, the card "Keep a summary for your next visit" has a button **Download my summary**. Clicking it downloads `sanad-summary-2026-11-16.json` (693 bytes). A patient cannot read a JSON file, and the card text promises "a summary for your next visit".

### Expected
The main action gives a **human-readable summary** the user can read, print or show a doctor. The JSON file stays available only as a secondary option for re-use with "Upload profile".

### Required changes
1. **Primary button: "Download my summary (PDF)".** Open a print-friendly summary view and call `window.print()` so the user can save it as PDF. Do not add a heavy PDF library unless printing does not work. If you add one, explain why in the PR.
2. **Secondary link: "Save my answers to reuse next time (.json)".** Keep the current JSON export behind this link. Add one line of help text: it is for "Upload profile", and it is not meant to be read.
3. **Content of the readable summary**, in this order:
   - Title: "Sanad screening summary". Date of the session. A line "Screening, not diagnosis". A line "Research prototype, synthetic data only".
   - What you told us: each answer with its status (answered, skipped, prefer not to say, not sure). Never show skipped or declined as "No".
   - What your numbers mean, and what is unclear: only content that is **released**.
   - Your allowed next step: only if released.
   - If the case is `PENDING_REVIEW` (or any state where a next step is withheld): show "A next step is withheld until the required review is complete." Do **not** include the withheld judgment, level or next step.
   - Limits and sources: show cited sources. If evidence is missing, write plain text such as "No verified source was available for this point". Do not print internal codes.
   - Emergency line: "If symptoms are severe or sudden, call 998" (use the existing approved emergency text and link, do not write new clinical wording).
4. **Privacy**
   - Build the summary in the browser from data already on screen. No new server endpoint, no server copy, no logging of its content.
   - Do not store it in localStorage, sessionStorage or IndexedDB.
   - File name stays neutral, for example `sanad-summary-YYYY-MM-DD.pdf`. No health words in the file name or the PDF title.
   - Quick Exit must close the print view and clear it from memory.
5. **Print styles:** `@media print` hides navigation, buttons, Quick Exit, footer links. Light background, readable font size, page breaks between sections.

### Acceptance tests (name them TC-BUG-SUM-xx)
- TC-BUG-SUM-01: Clicking the primary button opens the print view; no `.json` file is downloaded.
- TC-BUG-SUM-02: The JSON link still downloads the same JSON as before, and "Upload profile" accepts it.
- TC-BUG-SUM-03: A case in `PENDING_REVIEW` produces a summary with no level, judgment or level-specific next step.
- TC-BUG-SUM-04: A skipped or declined answer is printed as skipped or "Prefer not to say", never "No".
- TC-BUG-SUM-05: The summary contains "Screening, not diagnosis" and the synthetic-data line.
- TC-BUG-SUM-06: No internal codes (for example `NO_VERIFIED_EVIDENCE`, `CLAIM-DRAFT-...`, `INSUFFICIENT_EVIDENCE`) appear in the summary.
- TC-BUG-SUM-07: Nothing new is written to localStorage, sessionStorage or IndexedDB.

---

## Bug 2: privacy and consent screen ("Privacy & Information Boundaries")

### What happens
1. **Raw error text.** A red box shows `Failed to fetch`. This is the browser's network error passed straight to the user. It appears when the API is not reachable.
2. **Broken image.** At the top right, a broken-image icon with alt text "Confidential Patient Session" is shown inside a bordered box.
3. **Button label does not match the selection.** "Health Assessment (Essential)" is selected, but the main button says **"Continue to Health Education →"**. The second button says "Skip to General Education". Two education buttons, and no button that says "assessment".
4. **The main button looks disabled** (faded) even though it may be clickable. It is unclear whether the user can continue.
5. **The selected option is hard to see.** "Quick Setup Options" pills do not show clearly which one is active, or what each one switches on.

### Expected and required changes
1. **Error handling**
   - Never show raw `error.message` to the user. Map network failures to plain text: "We could not reach Sanad right now. Check your connection and try again." Add a **Try again** button.
   - Keep the **Urgent Help** link visible in the error state.
   - While the request fails, do not let the user continue to the assessment (consent must be saved on the server first). "Skip to General Education" may still work because it records no health answers.
   - Log only an error code, not request content.
   - Also check why the request fails locally (API not running on the expected port, or the dev proxy target is wrong). Write the cause in the PR. Do not change the API contract to hide it.
2. **Broken image:** remove the image. If a visual is wanted, use a small inline icon from the existing icon set. No stock photos of doctors or patients.
3. **Button labels follow the selection**
   - "Health Assessment" selected → primary button **"Continue to health assessment"**.
   - "Education only" selected → primary button **"Continue to general education"**, and hide the separate "Skip to General Education" button (it would be a duplicate).
   - Keep one secondary text link "Skip to general education" only when the assessment option is selected.
4. **Button state:** the primary button is either clearly enabled (full color) or disabled with a short reason under it, for example "Waiting for the connection".
5. **Selection clarity:** the active option has a clear selected state (filled plus checkmark, `aria-pressed="true"` or a radio group). Under the options, list in plain words what is on and off for the current choice, using the real consent scopes (`assessment` on; `clinician_review`, `provider_share`, `spouse_share`, `research_use` off by default).
6. **Copy check:** "no real personal identifiers (name, phone, or national ID) are ever recorded, and data is only processed for this private session". Keep this only if it is true in the code and matches `docs/privacy.md` or the retention policy. If not sure, shorten it to what is true and flag it in the PR.

### Acceptance tests (name them TC-BUG-PRIV-xx)
- TC-BUG-PRIV-01: With the API down, the screen shows the plain error text and a Try again button. The string `Failed to fetch` never appears.
- TC-BUG-PRIV-02: With the API down, the assessment cannot start; general education still works; the Urgent Help link is visible.
- TC-BUG-PRIV-03: No broken image or alt text box is rendered.
- TC-BUG-PRIV-04: The primary button label matches the selected option in both cases.
- TC-BUG-PRIV-05: The selected option has `aria-pressed="true"` or is a checked radio, and keyboard users can change it.
- TC-BUG-PRIV-06: The list of what is on and off matches the consent payload sent to the API.

---

## Related observations (do not fix in this PR, just list them in the PR description)

1. **Internal codes shown to the patient** on the result page: `[NO_VERIFIED_EVIDENCE]`, `CLAIM-DRAFT-BMI-CONTEXT-01: INSUFFICIENT_EVIDENCE`. These should become plain language.
2. **Possible dead end:** the result page says the next step is withheld until review (`PENDING_REVIEW`), and also says "Reviewer access was not consented to". If review needs `clinician_review` consent, the user waits for a review that can never happen. The page should say this directly and offer the consent setting as the way forward, or the status should not be `PENDING_REVIEW`. Needs a product decision; do not change the state machine without change control.

---

## Out of scope
- No changes to clinical rules, thresholds, triage levels, consent scopes or the label taxonomy.
- No new storage of health data on the server or in the browser.

## Done when
- All TC-BUG-SUM and TC-BUG-PRIV tests pass, plus the existing test suite.
- Screenshots of the new result-page card, the printed summary (one released case, one `PENDING_REVIEW` case) and the privacy screen (normal and API-down) are attached to the PR.
