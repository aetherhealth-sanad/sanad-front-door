# Sanad – OCR one synthetic lab report (T-60) v0.2

| Item | Value |
|---|---|
| **Status** | `PROPOSED`. Not approved. The extractor, both OCR engines, stand-in fixtures and the evaluation run are present; no endpoint or screen uses them yet. |
| **Version / date** | 0.2, 2026-11-15. Replaces v0.1 (synthetic Patient Summary import), which read the wrong document type. |
| **Task brief** | T-60 "OCR one synthetic lab report" (Tech Lead), GitHub issue #103 |
| **Requirement** | [RF-27](referal-flows/product-spec.md#rf-27-ocr-one-synthetic-lab-report-t-60-v04-addition-proposed) |
| **Tasks** | T4.11, T4.12, T4.13 in the [implementation plan](referal-flows/implementation-plan.md) |
| **Tests** | TC-27.1 to TC-27.14 in the [test plan](referal-flows/test-plan.md), in `apps/api/tests/test_lab_ocr.py` |
| **Change control** | [CC-017](referal-flows/change-log.md#cc-017-synthetic-profile-document-import-with-local-ocr) |
| **Parent contracts** | PRD-FR-13, BRD FR-13, NFR-19, harness HR-04, HR-23 (T-60 calls it HR-09) |
| **Owner** | Hoàng. Lab-entry screen: Vinh (T-33). Fixtures: Đạt (T-20, T-34, T-35). |

> **Boundary.** Research prototype, not a medical device. Synthetic reports only. The reader reads values and never interprets them: nothing here says whether a value is normal. Every value waits for the user. A passing run shows the software reads the fixtures; it is not evidence of real-world accuracy or clinical validity.

## 1. What it does

It reads one synthetic semen analysis report, as a PDF or a picture, in one English layout. For each of nine fields it returns the value, the unit, the text as read, where it was on the page, a confidence from 0 to 1 and a list of flags. It never applies a value: the user confirms or edits each one on the lab-entry screen (T-33), and the rules read confirmed values only.

| Field | `field_id` | Canonical unit | Lab catalogue code |
|---|---|---|---|
| Volume | `volume` | mL | `VOLUME_PLACEHOLDER` |
| pH | `ph` | none | none yet |
| Sperm concentration | `concentration` | million/mL | `CONCENTRATION_PLACEHOLDER` |
| Total sperm count | `total_count` | million | none yet |
| Progressive motility (PR) | `progressive_motility` | % | `PROGRESSIVE_MOTILITY_PLACEHOLDER` |
| Non-progressive motility (NP) | `non_progressive_motility` | % | none yet |
| Immotile (IM) | `immotile` | % | none yet |
| Normal forms | `normal_forms` | % | `MORPHOLOGY_PLACEHOLDER` |
| Collection date | `collection_date` | ISO date | `collected_on` of each value |

Four fields have no lab catalogue code yet. They are read and shown for confirmation, but they cannot be stored until BA adds a code (OD-20). Labels, unit spellings and plausibility bounds live in [`catalogue/lab-report-ocr.draft-0.1.json`](../catalogue/lab-report-ocr.draft-0.1.json).

## 2. Hard rules

| # | Rule | Source |
|---|---|---|
| 1 | Synthetic reports only: the synthetic banner on every page and a report ID starting `SYN-`, or nothing is read. | BR-15, PRD-FR-13 |
| 2 | Nothing is applied silently. Every value starts unconfirmed, whatever its confidence. | T-60 req. 3, 4 |
| 3 | The rules engine and the report read confirmed values only. | T-60 req. 5 |
| 4 | A blank or unreadable field stays empty and the user is asked. No guessing, no correction, no conversion, no value computed from other values. | T-60 req. 6, AC-15.2, HR-04 |
| 5 | File content is data, not instructions. | T-60 req. 7, HR-23 |
| 6 | Logs hold reason codes and hashes only, never text or values. | T-60 req. 8, INV-03 |
| 7 | The file and page image are temporary and leave no browser storage. | T-60 req. 9 |
| 8 | OCR runs locally. No VLM or LLM reads images. No cloud OCR. | T-60 scope |
| 9 | Extracted data does not go to pgvector, which holds approved source text only. | MCP context design §2 |

## 3. Pipeline

| Stage | What it does | Fails closed with |
|---|---|---|
| S1 Intake | Type from the first bytes (PDF, PNG, JPEG), size, page and pixel limits | `DOCUMENT_UNSUPPORTED_TYPE`, `DOCUMENT_TOO_LARGE`, `DOCUMENT_TOO_MANY_PAGES`, `DOCUMENT_UNREADABLE` |
| S2 Text | A page with a text layer is read from it (fast path). A page without one is rendered at 300 DPI and read by a local OCR engine. | `OCR_UNAVAILABLE` when no engine is installed |
| S3 Synthetic | Banner on every page, `SYN-` report ID | `DOCUMENT_NOT_SYNTHETIC` |
| S4 Rows | Cells grouped into rows by position. A skewed page is straightened first: in box coordinates for RapidOCR, in the image for Tesseract. | `DOCUMENT_LAYOUT_NOT_RECOGNISED` |
| S5 Fields | A row whose first cell is a known label belongs to that field | A field not found gets `VALUE_MISSING` |
| S6 Parse | One clean number and a known unit spelling, or one date; plausibility bounds; PR + NP + IM total | Flags (§4) |
| S7 Status | `NEEDS_CONFIRMATION` when confidence is below the threshold or any flag is set; otherwise `UNCONFIRMED` | |

Code: `apps/api/sanad_api/document_import/` (`intake`, `text_layer`, `ocr`, `prepare`, `rapid_ocr`, `tesseract_ocr`, `layout`, `fields`, `parse`, `extract`, `model`).

## 4. Output, confidence and flags

Each field, as T-60 requirement 1 lists:

```json
{
  "field_id": "volume",
  "value": 2.5,
  "unit": "mL",
  "raw_text": "2.5 mL",
  "bbox": {"page": 1, "x": 280.0, "y": 202.1, "width": 108.3, "height": 10.0},
  "confidence": 1.0,
  "scores": {"ocr": 1.0, "parse": 1.0, "plausibility": 1.0},
  "flags": [],
  "status": "UNCONFIRMED",
  "method": "TEXT_LAYER",
  "target_test_code": "VOLUME_PLACEHOLDER"
}
```

**Confidence** is the lowest of three scores (T-60 requirement 2):

| Score | 1.0 | Lower |
|---|---|---|
| `ocr` | text layer | the lowest word confidence in the value and unit cells |
| `parse` | one clean number or ISO date | 0.5 when a rule was needed (decimal comma, day-first date); 0 when unreadable |
| `plausibility` | unit present and known, value inside the bounds | 0 otherwise, and for PR, NP and IM that break the total |

The threshold is 0.90 (`TECH_TBD`, OD-21). Below it the field gets `OCR_CONFIDENCE_LOW` (when the OCR score is the cause) and `NEEDS_CONFIRMATION`.

**Flags.** The six T-60 flags, plus five for cases its requirements name but give no flag for:

| Flag | Raised when |
|---|---|
| `UNIT_MISSING` | a field that has a unit is printed without one |
| `DECIMAL_SEPARATOR_UNCLEAR` | a comma in the number. `2,5` is read as 2.5 and flagged; `1,250` and `2,5.0` give no value |
| `DATE_FORMAT_AMBIGUOUS` | `dd/mm` or `mm/dd` both possible, or a two-digit year. No value. |
| `DUPLICATE_VALUE` | two numbers in one cell, or the field printed twice. No value is chosen. |
| `OUT_OF_RANGE` | outside the plausibility bounds, or a date in the future |
| `OCR_CONFIDENCE_LOW` | OCR score below the threshold |
| `VALUE_MISSING` | the field is not on the page, or blank (T-60 req. 6) |
| `VALUE_UNREADABLE` | text that is not one number or date: `2..5`, `n/a`, `<2` |
| `UNIT_UNRECOGNISED` | a unit that is not a known spelling: `mt`, `1076/mL`, `10°6` |
| `DATE_INVALID` | `2026-13-45` |
| `MOTILITY_SUM_MISMATCH` | PR + NP + IM differs from 100 by more than 1. Catches a misread digit that is in range and confident. No value is computed. |

The plausibility bounds catch reading errors such as a lost decimal point. They are wide on purpose (volume 0–20 mL, pH 0–14, concentration 0–1000 million/mL, total 0–5000 million, percentages 0–100). They are **not** reference limits, and they are `TECH_TBD` until BA reviews them.

**Unit spellings** map to one canonical spelling with no numeric change: `10^6/mL`, `x10^6/mL`, `×10^6/mL` and `million/mL` are all `million/mL`. This answers the unit question in OD-19 for the reader; BA still needs to confirm the list.

## 5. Storage and screens (T4.13, waits for CC-017)

The reader writes nothing. `to_observation_inputs(draft)` turns the fields that have a lab catalogue code into `POST /cases/{id}/observations` bodies. The client sends them only after the user has reviewed them on the lab-entry screen (T-33). They are stored as `NEEDS_USER_CONFIRMATION`, and the user confirms each one through the existing confirm endpoint (RF-15), which also needs a reference source. TC-27.9 shows an unconfirmed value of 0 does not raise the draft `LAB_EQUALS` signal, and does once confirmed.

Still to build: the read-only `POST /cases/{id}/profile/document` endpoint and its audit event, the T-33 screen with the bounding-box highlight, and the temporary-file handling of T-60 requirement 9 (in memory only, cleared at session end and Quick Exit, no `localStorage` or IndexedDB).

## 6. Fixtures and evaluation

**Fixtures** in `apps/api/tests/fixtures/lab_ocr/`, with the file names T-60 lists. They are **stand-ins** made by `eval/lab_ocr/make_fixtures.py`, because Đạt's package (T-20, T-34) is not in the repository. When it arrives, copy its files and `ground_truth.json` over these; the tests and the runner read the same names.

| File | Purpose |
|---|---|
| `lab_A_clean_textlayer.pdf` | Clean reference, text layer, all units |
| `lab_B_scanned.pdf`, `lab_B_scanned.png` | No text layer: turned 2.5°, noisy, soft |
| `lab_C_ambiguous_textlayer.pdf` | Decimal commas, two missing units, `05/10/26` |
| `ground_truth.json` | Expected value, unit, status and flags per field; file hashes |

**Run:** `apps/api/.venv/bin/python eval/lab_ocr/run_eval.py [--generated N]` writes `eval/lab_ocr/reports/<run_id>.{md,json}` with `run_id`, commit SHA, `n`, layouts, the A1/B1/C1 checks, and per engine: silent errors (first), field accuracy, date accuracy and flag recall. `--generated N` adds a stress section on generated reports through scan variants, which is not a T-60 metric. The exit code is 1 on any silent error. T-36's report format is not in the repository yet, so the format may need to change to match it.

## 7. Engines

| Engine | Role | Notes |
|---|---|---|
| pdfplumber | Text layer fast path | MIT |
| RapidOCR 3.10 | OCR engine | Runs the PaddleOCR PP-OCRv6 models on ONNX Runtime, in-process, CPU. Installs with pip; models ship in the package. Licence of the package and models to confirm. |
| Tesseract 5.5 | Baseline OCR engine | System package, called as a local child process with the page on standard input. Pages are straightened first. |

Both are named or allowed by T-60 (Tesseract or PaddleOCR). Neither sends data anywhere. With neither installed, a scanned page returns `OCR_UNAVAILABLE` and a text-layer PDF still works.

## 8. Research notes

Checked 2026-11-14 against current documentation and public benchmarks. Vendor numbers are vendor-reported and were not measured on Sanad documents.

1. **Do not OCR when you do not have to.** A software PDF has a text layer, and reading it is exact.
2. **A detection and recognition engine, not a VLM.** Document VLMs lead parsing benchmarks (PaddleOCR-VL-1.6 reports about 96.3 on OmniDocBench v1.6) but need a GPU and can write a plausible number that is not on the page, with no word-level confidence. T-60 rules them out.
3. **Preparation matters on poor input.** About 300 DPI; fix orientation, then skew. An engine that returns upright boxes cannot be corrected after reading, which is why Tesseract pages are straightened first.
4. **Key on labels, then validate numbers hard.** Typical errors are a lost decimal point, `O` for `0`, `x10^6` read as `x1076` or `10°6`. A strict number pattern, unit spellings and bounds catch them; nothing is auto-corrected.
5. **Confidence routes, it does not decide.** Use the lowest word score in a field. Confidence alone did not separate right from wrong in the earlier run (wrong fields up to 0.983), which is why the plausibility score and the motility total exist.
6. **Measure fields, not characters,** and count silent errors separately.

Sources: [PaddleOCR documentation](https://www.paddleocr.ai/latest/en/index.html), [PaddleOCR 3.0 technical report](https://arxiv.org/pdf/2507.05595), [PaddleOCR-VL paper](https://arxiv.org/pdf/2510.14528), [Best local OCR 2026](https://pasqualepillitteri.it/en/news/25568/best-local-ocr-pc-server-2026), [Improving OCR accuracy](https://docsumo.com/blog/improving-ocr-accuracy), [Document OCR service design](https://www.techinterview.org/post/3233472317/lld-document-ocr/?format=md), [pdfplumber and PyMuPDF](https://pdf.oxide.fyi/docs/comparison/pdfplumber-vs-pymupdf).

## 9. Open points

| ID | Question | Working default | Owner |
|---|---|---|---|
| OD-18 | The task was first described as storing results in pgvector. T-60 does not mention it. | Not stored in pgvector. | Tech Lead |
| OD-19 | Are the unit spellings in the catalogue right? | As listed, `TECH_TBD` | BA |
| OD-20 | Lab catalogue codes for pH, total count, NP and IM | Read and shown, not stored | BA + Clinical |
| OD-21 | Size, page and pixel limits, confidence threshold, plausibility bounds | 5 MB, 5 pages, 0.90, §4 bounds | Tech Lead + QA |
| OD-23 | T-60 U1 says unconfirmed values must not appear in the report output. The current report (RF-15) lists held values with `used_in_assessment: false`. | Rules ignore them (tested); the report is unchanged until decided | Tech Lead + Product |
| — | T-60 says not to start before T-36 and T-46 are done (issues #79 and #89 look like them and are open). | Work started on the owner's request | Tech Lead |
| — | Đạt's fixture package (T-20, T-34) | Stand-in fixtures | Đạt |
