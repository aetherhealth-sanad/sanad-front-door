# SANAD T-60 OCR — Implementation Update (16 Nov 2026)

**Source basis:** `sanad-front-door-feat-chat-contradiction-check (1).zip`. This update does
not replace the existing parser/OCR engines or change any `CLINICAL_TBD` triage rule.

## Changes

1. `document_import/extract.py`: checks *Total Sperm Count* in millions against *Volume* (mL)
   multiplied by *Concentration* (million/mL), for clean values from the **same synthetic
   report**. Tolerance `max(1.0 million, 5% of calculated total)` is configurable in the
   OCR catalogue and is `TECH_TBD`, not a clinical standard. If inconsistent, label all three
   `TOTAL_COUNT_MISMATCH`, keep the printed values unchanged, require manual review. Never
   infer missing values or diagnose infertility from this check.
2. `document_import/model.py`, `fields.py`, and
   `catalogue/lab-report-ocr.draft-0.1.json`: new flag and validation rule. The catalogue ID,
   clinical approval state, and version **are not upgraded**.
3. `document_import/extract.py`: `to_observation_inputs` now requires an explicit
   `reviewed_field_ids={...}` selection, a valid collection date, and clean mapped fields;
   otherwise returns nothing or raises a reason-code exception. It never stores/auto-confirms.
4. `document_import/routes.py` + `main.py`: `POST /api/cases/{case_id}/profile/document`
   accepts raw PDF/PNG/JPEG bytes. Guards are the same as observation entry: patient token,
   `assessment` consent and allowed intake state. File stays in memory, 5 MiB limit enforced
   while streaming, no file bytes saved, no LLM/VLM, no PDF/field contents logged. The local
   OCR engine is optional; text-layer PDFs work with it disabled.
5. `apps/web/src/pages/OcrLabReview.tsx` + `LabScreen.tsx` + `api/client.ts`: browser-only
   preview and per-field manual prefill; user must then click Save Observation and the
   existing Confirm Observation separately. `target_test_code: null` or flagged fields
   remain display-only. This is **not** automatic clinical data ingestion.
6. `eval/lab_ocr/lab_reports.py`: generated synthetic stress fixtures now have consistent
   total counts, so independent OCR text correctness is not conflated with an internally
   inconsistent invented report. Golden fixture files remain unchanged.
7. `eval/lab_ocr/run_eval.py`: a ZIP without `.git` now reports `UNAVAILABLE_SOURCE_ARCHIVE`
   (and `UNVERSIONED_ARCHIVE`) instead of incorrectly treating the tree as a clean Git commit.

## Local usage

From repository root on Windows PowerShell:

```powershell
.\apps\api\.venv\Scripts\python.exe -m pip install -e "apps/api[dev,documents]"
# For scanned PDFs/images, install a local OCR engine as described in specs/ocr-lab-report.md.
.\apps\api\.venv\Scripts\python.exe -m pytest apps/api/tests/test_lab_ocr.py apps/api/tests/test_lab_ocr_hardening.py
```

Start backend and frontend as per `RUNBOOK.md`. Navigate to the Lab Observations screen,
choose a **synthetic** PDF and select **Read report**. Review each field, select **Prefill manual
entry** on a clean supported item, inspect/adjust the manual form, save, and confirm from the
observation ledger. This requires successful prior consent/safety steps. No Azure API key is
needed for OCR.

To use OCR on scanned PDF/PNG/JPEG, the environment needs the optional OCR dependencies
(e.g. `pip install -e "apps/api[ocr]"`; or Tesseract installed locally). Installation alone
is not evidence of recognition accuracy. Run the independent benchmark before making claims.

## Current limitations / not delivered

- This feature is for demo synthetic documents only; a printed synthetic label is not a
  reliable test that a document contains no PHI. Do **not** upload real patient records.
- Web preview lists bounding-box coordinates but does **not** draw precise highlights yet.
- Only the 5 existing lab catalogue test codes may be recorded. pH/total count/NP/IM are
  shown as read-only until their schema and approvals are agreed.
- Validation tolerances, unit spellings, synthetic layout and reliability threshold remain
  engineering drafts (`TECH_TBD`, `CLINICAL_TBD`).
- New end-to-end browser QA, independent lab report layouts, security hardening, and
  clinical review remain to be completed before real-world deployment.
- OCR confidence is an engineering score, **not** a calibrated probability of clinical correctness.
