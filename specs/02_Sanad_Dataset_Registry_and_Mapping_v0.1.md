# SANAD — DATASET REGISTRY, FEATURE MAPPING & LABEL PROVENANCE

**Document ID:** `AETHERHEALTH/SANAD/DATASET-REGISTRY/0.1`  
**Version / date:** v0.1 · 2026-11-03  
**Status:** DRAFT — mapping rules; **not evidence that every source file has been opened**  
**Companion:** Data & ML Pipeline Specification v0.1; Model Integration Contract v0.1; Sanad BRD/PRD v0.4.

## 1. Registry purpose and evidence levels

A registry entry is not merely a dataset URL. It names the **exact version and legal access**, observed file schema, unit of analysis, target definition, eligible predictors, preprocessing decisions, splits and publication restrictions. Each field has an evidence level, so planned mappings cannot accidentally be treated as verified training columns.

| Level | Meaning | Training policy |
|---|---|---|
| `AUDITED_LOCAL_FILE` | Opened exact file; header, sheet, rows and checksum recorded | Potentially usable after task and leakage review |
| `VERIFIED_LOCAL_REPORT` | Previously audited artifact with source/hash and task card; original input not re-opened this turn | Reuse cautiously, verify artifact existence/hash |
| `PUBLISHED_DOCUMENTATION` | Official dataset landing page/paper explicitly documents field, but file not inspected | Schema gate still pending |
| `PROPOSED_MAPPING` | Candidate mapping pending codebook or expert review | **Cannot** silently become model feature |
| `UNVERIFIED` | Guess, external claim, conflicting reports or missing data | **No training** on assumed field |

Each mapping row must have `source_file`, `source_sheet`, `source_column`, `column_type`, `raw_codebook_ref`, `semantic_field`, `transformation`, `feature_or_target`, `missing_policy`, `temporal_anchor`, `evidence_level`, `reviewer`, `review_date`.

## 2. Dataset master registry

| ID / version | Where from | Access tier | Confirmed purpose / labels | Status | Hard prohibition |
|---|---|---|---|---|---|
| `nsfg_male_2022_2023_puf` | CDC NSFG Male Respondent PUF 2022–2023 | `PUBLIC`; survey usage constraints | `FATHDIFF` self-reported difficulty; `INFHELP` prior care use | **Existing local audit v1** | Not a clinical diagnosis, semen measurement or referral label |
| `seed_ml_v3` | Mendeley `sc8rsz2vd7/3` | Public source, license to confirm in manifest | `diagnostic` classification from semen-related variables | **Codebook/schema re-audit needed** | No lifestyle/psychological features invented; no clinical triage |
| `mimic_iv_ext_cds_1_0_2` | PhysioNet `mimic-iv-ext-cds/1.0.2` | `CREDENTIALED_RESTRICTED` + required training + DUA | ED acuity, LLM generated specialty referrals and reviewed subset | **Access independent; files not inspected here** | No team sharing, no third-party upload, not fertility outpatient ground truth |
| `malaysia_occ_stress_v3` | Mendeley DOI `10.17632/cgyh5s88kc.3` | `PUBLIC_CC_BY_4_0` stated on landing page | Occupational stress/job satisfaction/performance survey | **Semen target UNVERIFIED** | No semen-quality supervised task until target audited |

**No joins across the four registries:** source populations and sampling frames are unrelated. Rows from different datasets must not be fabricated into a single patient record.

## 3. NSFG: concrete mapping from existing audit

**Evidence:** `Sanad_NSFG_Audit_v1/DATA_AUDIT_REPORT.md` and prior task cards, based on the CDC CSV ZIP. The audit documented original archive hash `949f330a67a37d3e8906492fb404a9e8c669850ff75369777036dfbb31f44073`. Verify actual loaded path/checksum before using it in a new run. Original 4,371 survey respondents and 1,157 columns; sample unit is an NSFG respondent, not a clinical patient encounter.

| Source column | Meaning / role | Raw code handling | Mapped research feature | Gate |
|---|---|---|---|---|
| `AGE_R` | Age, input | numeric; eligibility from task card | `age_years` (survey context) | Audited local report |
| `GENHEALT` | Self-rated general health, input | 1–5 categories; 8 refused, 9 don't know | `general_health_self_rated` | Survey categories, not continuous clinical scale |
| `BMIcat` | BMI class, input | 1–4 categories; 5 undefined, missing for ineligible ages | `bmi_category_survey` | No inference about body fat or gym context |
| `SMK100` | Ever smoked 100 cigarettes, input | 1 yes, 5 no per audited codebook | `smoked_100_lifetime_survey` | Codebook-confirmed values only |
| `SMOKE30` | Past 30-day smoking response, input | Only administered under qualifying smoking history | `smoking_30d_survey` | Routing missing ≠ zero cigarettes |
| `DRINK12` | Alcohol response, input | codebook routing/categories must be preserved | `alcohol_12m_survey` | Verify values in task card |
| `FATHDIFF` | Survey-perceived fertility difficulty, **target A** | 1 yes, 5 no; other special/skip codes excluded per card | `target_self_reported_difficulty` | **Not infertility diagnosis** |
| `INFHELP` | Ever received infertility-related help, **target B** | 1 yes, 5 no; 7 not ascertained, others per codebook | `target_ever_care_use` | **Not clinical referral or completion** |
| `CaseID` | Record key only | hash/retain for provenance, not training | `research_row_id` | **NEVER a feature** |
| `WGT2022_2023`, `VEST`, `VECL` | Survey design / variance | task-specific survey inference handling | metadata | **Not ordinary health features** |
| `BARRIER_01..08` | General healthcare access barriers | multi-response survey routing | exploratory descriptive | **Not fertility-referral completion labels** |

**Prepared tasks (confirmed by prior audit):**

| Task ID | Source target | Valid N | Positive N | Existing artifact |
|---|---|---:|---:|---|
| `nsfg_self_reported_fertility_difficulty_v1` | `FATHDIFF` | 3,437 | 142 | `data/prepared/self_reported_fertility_difficulty/{train,validation,test}.csv` + `task_card.json` |
| `nsfg_prior_infertility_care_use_v1` | `INFHELP` | 3,722 | 227 | `data/prepared/prior_infertility_care_use/{train,validation,test}.csv` + `task_card.json` |

**Important caveats:** Although the prepared file names are given here for handoff, exact filenames must be verified within the mounted artifact before code assumes a layout. The two tasks are not two independent populations or labels from different datasets; they are filtered research subsets of the same source. Previous baseline outputs exist; **do not re-train unless a new experiment or audit correction requires it**. If rerunning, pin the task card and conduct an explicit split compatibility check.

## 4. SEED-ML v3: mapping contract awaiting physical schema verification

| Field family | Intended role | Evidence now | Required audit |
|---|---|---|---|
| `diagnostic` | Research phenotype label (9 categories per prior project notes) | Published/project documentation, not a clinical triage label | Read raw headers, category map, class support |
| Semen measurements | Potential predictors | Dataset/paper discuss sperm-related features | Identify per-field raw type, assay time, units, missing codes |
| Pre-/post-processing observations | Potential leakage | Some semen phenotype labels may be composed of these measures | Identify outcome-defining fields and remove leakage in **early prediction** experiments |
| Patient/visit ID | Grouping / leakage | Patient linkage status unresolved | Verify repeated visits, split by patient if possible |
| BMI, stress, sleep, anxiety, tobacco | **Not established as available** | Prior audit indicates no matching lifestyle variables for proposed task | Do not create columns or claim availability |

**Task acceptance:** For `seed_ml_diagnostic_benchmark_v1`, the *only* allowed task label is source-defined `diagnostic` after verification; if the task is directly measuring contemporaneous semen indicators, call it **phenotype classification** rather than a pre-lab prediction. `triage_action`, infertility probability and psychosocial benefit are forbidden outputs.

## 5. MIMIC-IV-Ext CDS: documented files and join policy

The PhysioNet v1.0.2 public documentation reports a `stay_id`-centered CSV collection. Below is a **published-file inventory, not actual header verification**.

| Source file | Published content (paraphrased) | Research use / caution |
|---|---|---|
| `vital_signs.csv` | Initial vital signs, IDs and text representation | May be available only with ED encounter; unit/string parsing TBD |
| `patient_demographics.csv` | Age, sex, race as bundled text | Interpret provenance, small-cell disclosure and generalization |
| `initial_assessment_info.csv` | ED acuity, pain, chief complaint, arrival/disposition, ICD context | ED outcomes; avoid use of post-triage or discharge fields as pre-triage features |
| `clinical_data.csv` | Clinical note/HPI, tests, medications, diagnosis, LLM referral content | Severe target/post-event leakage risk for early triage tasks |
| `triage_level.csv` | ED triage target (acuity) | May serve ED method benchmark only |
| `specialty_referral.csv` | Specialty referral **generated by an LLM** for selected cases | **Not clinician ground truth** |
| `specialty_referral_clinician_approved.csv` | Clinician-agreed subset (331 cases in source description) | Selected accepted predictions; beware selection bias and inflated estimates |
| `diagnosis.csv` | Diagnosis texts/lists | Different target, post-outcome context |

**Join requirements:** verify actual `stay_id` types/nulls and one-to-one / one-to-many cardinality before joining. Joining labels, diagnoses, notes or discharge information into pre-visit features can induce direct leakage. `subject_id` can matter for grouping but only if actually present/accessible. No unapproved export of patient rows or identifiers into reports.

**Access gate:** `CREDENTIAL_APPROVED` alone is insufficient. Required individual training and *dataset-specific signed DUA* must be verified before download. All access limited to authorized persons and approved compute. PhysioNet's public listing of MIMIC-IV-Ext v1.0.2 specifies **CITI Data or Specimens Only Research** as required training; any additional CITI modules are distinct from this particular listing and should be checked against the logged-in requirements.

## 6. Malaysia occupational stress: what is truly verified?

**Source:** https://data.mendeley.com/datasets/cgyh5s88kc/3 (Mendeley Data v3, 2024-01-02, CC BY 4.0). Public listing identifies the files `DIB dataset and codebook.xlsx` and `DIB questionnaire.docx`, describes occupational stress, job satisfaction and job performance in a male fertility-patient survey. It does **not display an authoritative column name for semen quality**.

| Candidate family | Source column | Status | Action required |
|---|---|---|---|
| Occupational stress items | `OS1...OS41` (previously discussed) | `PROPOSED_MAPPING` | Open workbook; verify exact columns, wording, reverse-coded items, score interpretation |
| Job satisfaction items | `JS1...JS36` (previously discussed) | `PROPOSED_MAPPING` | Verify column availability / codebook |
| Job performance items | `JP1...JP6` (previously discussed) | `PROPOSED_MAPPING` | Verify before use |
| Semen-quality category | **Unknown** | `UNVERIFIED` | Locate exact sheet + column + lab origin + specimen/date metadata |
| Measured semen analytes | **Unknown** | `UNVERIFIED` | Confirm whether actual sperm concentration/motility/morphology values exist |
| Sleep and anxiety | **Unknown** | `UNVERIFIED` | Search codebook; do not infer existence |

**Decision tree:**

1. Workbook has **individual-level measured semen outcome** + stress variables and meaningful time/source → candidate exploratory ablation (pending legal/clinical/methodology audit).
2. Workbook has **survey stress scores only** → can analyze occupational stress, but **not** infer semen quality.
3. Workbook has only aggregate semen class summary, not matched person-level labels → no supervised stress-to-semen model.
4. Workbook uses a clinical label but no raw semen measurements → classify only with explicit caveat about provenance, no quantitative sperm-quality prediction.

**Pre-registered task template (blocked):** `malaysia_stress_to_semen_exploratory_v1`; `target_col: null`; `task_status: BLOCKED_TARGET_UNVERIFIED` until a column-level audit is signed. The dataset license does not make weak or absent labels scientifically valid.

## 7. Cross-dataset feature ontology: conceptual, not merged patient data

| Canonical concept | NSFG | SEED-ML | MIMIC | Malaysia | Runtime Sanad |
|---|---|---|---|---|---|
| Age | `AGE_R` | `TBD` | Published demographics text | `TBD` | Self-reported `age_years` |
| BMI context | `BMIcat` (coarse) | not established | unknown | `TBD` | `bmi` + gym context; no obesity diagnosis |
| Occupational stress | unavailable in prepared task | unavailable/unknown | not appropriate | `OS*` proposed | `PSY-STRESS-01` (not same validated scale) |
| Sleep disruption | not audited | unknown | not established | unknown | `PSY-SLEEP-01` (optional self-report) |
| Anxiety / concern | not audited | unknown | not established | unknown | `PSY-ANXIETY-01` (not psychiatric diagnosis) |
| Semen measurements | not present as matched outcome | source-specific semen features | not fertility cohort | unverified | Optional synthetic/manual lab observations |
| Fertility difficulty | `FATHDIFF` self-report | no equivalence | no equivalence | unverified | **No diagnostic label** |
| Prior care use | `INFHELP` self-report | no equivalence | no equivalence | unverified | Navigation self-report only (different construct) |
| Specialist recommendation | no clinical label | none | ED specialty referrals, partly LLM | none verified | Clinician-approved draft/mock only |

**Key principle:** Same friendly field name does not imply equivalent measurement instrument, geography, timing, validity, or target. Runtime psychosocial questions cannot be treated as equivalent to Malaysia occupational stress scale unless a deliberate measurement-validation study establishes such mapping.

## 8. Registry schema, reviewer workflow and version policy

**Required manifest fields:** `dataset_id`, `dataset_version`, `citation`, `original_url`, `download_date`, `sha256`, `access_tier`, `license`, `dua_status`, `training_status`, `storage_namespace`, `files`, `row_grain`, `target_definitions`, `feature_mappings`, `missing_codebook`, `raw_schema_status`, `task_status`, `reviewer`, `approved_at`, `permitted_purposes`, `prohibited_purposes`.

- **Dataset update** = new immutable version, new SHA, re-profile. No silent overwrite of training corpus.
- **Feature mapping update** = new mapping version; all downstream task cards/splits/model artifacts refer to that exact version.
- **Research output** = source attribution + data card + test evidence and label origin. Do not make population-level claims beyond design.
- **Rights change** = pause processing; new access and DUA review before continuing.
- **Clinical-source reuse** = separate clinical governance approval, not inherited from ML dataset registry.

## 9. Acceptance tests for the registry

| ID | Input condition | Expected behavior |
|---|---|---|
| REG-AC-01 | Missing published license or permitted purpose | `QUARANTINED` and no `prepare/train` |
| REG-AC-02 | Malaysia semen label `null` | `BLOCKED_TARGET_UNVERIFIED`; experiment cannot be scheduled |
| REG-AC-03 | `INFHELP` is mapped to `triage_action` | Contract validation fails |
| REG-AC-04 | `SMOKE30` routing blank is converted to never-smoked | Mapping review fails |
| REG-AC-05 | MIMIC file path under public repo/shared-drive root | Access policy denies |
| REG-AC-06 | MIMIC DUA/training incomplete | Restricted ingestion remains blocked |
| REG-AC-07 | SEED early-prediction feature directly defines `diagnostic` | Leakage gate marks feature forbidden for that study |
| REG-AC-08 | Cross-dataset row concatenation with synthetic patient IDs | Data lineage fails / no mixed patient cohort |
| REG-AC-09 | `CaseID` or `stay_id` appears as numeric predictor | ID leakage review fails |
| REG-AC-10 | Task/card references absent checksum/split | Model cannot be registered |

## 10. References

- Sanad BRD/PRD v0.4 (2026-11-03), `Sanad_NSFG_Audit_v1/DATA_AUDIT_REPORT.md` (2026-10-27).
- CDC NSFG: https://www.cdc.gov/nchs/nsfg/nsfg-2022-2023-puf.htm .
- SEED-ML: https://data.mendeley.com/datasets/sc8rsz2vd7/3 .
- Malaysia: https://data.mendeley.com/datasets/cgyh5s88kc/3 .
- MIMIC-IV-Ext: https://physionet.org/content/mimic-iv-ext-cds/1.0.2/ ; PhysioNet FAQ: https://physionet.org/about/faqs/ ; LLM guidance: https://physionet.org/news/post/llm-responsible-use/ .
