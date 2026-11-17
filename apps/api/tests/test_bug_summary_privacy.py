"""Acceptance tests for Bug 1 (summary download/print) and Bug 2 (privacy/consent screen).

Traceability: TC-BUG-SUM-01..07, TC-BUG-PRIV-01..06 (specs/bu_summary.md).
"""

from __future__ import annotations

import json
import subprocess

import jsonschema

from tests.conftest import REPO_ROOT
from tests.helpers import Api

UPLOAD_SCHEMA = json.loads(
    (REPO_ROOT / "schemas" / "upload-profile.schema.json").read_text("utf-8")
)
RESULT_SCREEN = REPO_ROOT / "apps" / "web" / "src" / "pages" / "ResultScreen.tsx"
CONSENT_SCREEN = REPO_ROOT / "apps" / "web" / "src" / "pages" / "ConsentScreen.tsx"
SUMMARY_MODEL = REPO_ROOT / "apps" / "web" / "src" / "pages" / "summaryModel.ts"


def _eval_summary_ts(report: dict) -> dict:
    script = (
        "import { buildReadableSummary } from './apps/web/src/pages/summaryModel.ts';"
        f"const report = {json.dumps(report)};"
        "console.log(JSON.stringify(buildReadableSummary(report, '2026-11-16')));"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout.strip().splitlines()[-1])


# Bug 1: Readable summary & JSON export (TC-BUG-SUM-01..07) -----------------------------------


def test_tc_bug_sum_01_primary_button_opens_print_view_without_json_download() -> None:
    src = RESULT_SCREEN.read_text("utf-8")
    assert 'data-testid="download-summary-pdf"' in src
    assert "Download my summary (PDF)" in src
    assert "window.print()" in src
    assert 'data-testid="printable-summary"' in src
    handler = src.split("const handleOpenPrintSummary")[1].split("const handleClosePrintSummary")[0]
    assert "downloadSummary" not in handler


def test_tc_bug_sum_02_json_link_downloads_same_json_and_upload_profile_accepts_it(
    api: Api,
) -> None:
    src = RESULT_SCREEN.read_text("utf-8")
    assert 'data-testid="download-summary-json"' in src
    assert "Save my answers to reuse next time (.json)" in src
    assert "Upload profile" in src
    assert "not meant to be read" in src

    patient = api.assessing("CN-001")
    patient.answers(
        {"question_id": "Q-SMOKING", "choice": "ANSWERED", "value": False},
        {"question_id": "Q-DIABETES", "choice": "PREFER_NOT_TO_ANSWER"},
    )
    res = patient.get(patient.path("/summary-file"))
    assert res.status_code == 200
    body = res.json()
    jsonschema.validate(body, UPLOAD_SCHEMA)

    returning = api.start("UPLOAD")
    assert returning.consent(assessment=True).status_code == 200
    assert returning.upload(body).status_code == 200


def test_tc_bug_sum_03_pending_review_summary_has_no_level_judgment_or_next_step(
    api: Api,
) -> None:
    patient = api.drafted("CN-001")
    report = patient.get(patient.path("/report")).json()
    assert report["next_step_withheld"] == "PENDING_REVIEW"
    assert report["next_step"] is None

    summary = _eval_summary_ts(report)
    assert summary["isWithheld"] is True
    assert (
        summary["allowedNextStep"]
        == "A next step is withheld until the required review is complete."
    )
    raw = json.dumps(summary)
    for withheld_term in (
        "PENDING_REVIEW",
        "PRIORITY_REVIEW",
        "SPECIALIST",
        "PRIMARY_CARE",
        "EDUCATION",
    ):
        assert withheld_term not in raw


def test_tc_bug_sum_04_skipped_or_declined_printed_as_skipped_or_prefer_not_to_say(
    api: Api,
) -> None:
    patient = api.assessing("CN-001")
    patient.answers(
        {"question_id": "Q-DIABETES", "choice": "PREFER_NOT_TO_ANSWER"},
        {"question_id": "Q-SMOKING", "choice": "NOT_SURE"},
    )
    assert patient.assess().status_code == 200
    report = patient.get(patient.path("/report")).json()

    summary = _eval_summary_ts(report)
    by_q = {item["question"]: item for item in summary["whatYouToldUs"]}

    diabetes = by_q["Have you been told you have type 2 diabetes?"]
    assert diabetes["answer"] == "Prefer not to say"
    assert diabetes["status"] == "Prefer not to say"
    assert diabetes["answer"] != "No"

    smoking = by_q["Do you smoke tobacco, or have you smoked in the past?"]
    assert smoking["answer"] == "Not sure"
    assert smoking["status"] == "Not sure"
    assert smoking["answer"] != "No"

    medicines = by_q["Do you take any medicines regularly?"]
    assert medicines["answer"] == "Skipped"
    assert medicines["status"] == "Skipped"
    assert medicines["answer"] != "No"


def test_tc_bug_sum_05_summary_contains_screening_not_diagnosis_and_synthetic_line(
    api: Api,
) -> None:
    patient = api.drafted("CN-001")
    report = patient.get(patient.path("/report")).json()
    summary = _eval_summary_ts(report)

    assert summary["title"] == "Sanad screening summary"
    assert summary["screeningNotice"] == "Screening, not diagnosis"
    assert summary["prototypeNotice"] == "Research prototype, synthetic data only"
    assert summary["pdfFileName"] == "sanad-summary-2026-11-16.pdf"
    assert summary["emergencyText"] == "If symptoms are severe or sudden, call 998"


def test_tc_bug_sum_06_no_internal_codes_appear_in_summary(api: Api) -> None:
    patient = api.drafted("CN-001")
    report = patient.get(patient.path("/report")).json()
    summary = _eval_summary_ts(report)
    raw = json.dumps(summary)

    for code in (
        "NO_VERIFIED_EVIDENCE",
        "CLAIM-DRAFT-",
        "INSUFFICIENT_EVIDENCE",
        "DRAFT_RULES",
        "SIMULATED_REVIEW",
        "CLINICAL_TBD",
        "PATIENT_REPORTED",
        "PENDING_REVIEW",
    ):
        assert code not in raw


def test_tc_bug_sum_07_nothing_new_written_to_browser_storage() -> None:
    src = SUMMARY_MODEL.read_text("utf-8")
    assert "localStorage" not in src
    assert "sessionStorage" not in src
    assert "indexedDB" not in src


# Bug 2: Privacy and consent screen (TC-BUG-PRIV-01..06) --------------------------------------


def test_tc_bug_priv_01_api_down_shows_plain_error_and_try_again_never_failed_to_fetch() -> None:
    src = CONSENT_SCREEN.read_text("utf-8")
    model_src = SUMMARY_MODEL.read_text("utf-8")
    assert "We could not reach Sanad right now. Check your connection and try again." in model_src
    assert 'data-testid="consent-try-again"' in src
    assert "Try again" in src
    assert "err.message" not in src


def test_tc_bug_priv_02_api_down_blocks_assessment_allows_education_keeps_urgent_help() -> None:
    src = CONSENT_SCREEN.read_text("utf-8")
    assert "isAssessmentBlockedByConnection" in src
    assert "Waiting for the connection" in src
    assert "onConsentComplete('/education')" in src
    assert "<UrgentLink />" in src
    assert 'href="/urgent.html"' in src


def test_tc_bug_priv_03_no_broken_image_or_alt_text_box_rendered() -> None:
    src = CONSENT_SCREEN.read_text("utf-8")
    assert "<img" not in src
    assert "Confidential Patient Session" not in src
    assert "real_patient_peace_of_mind.jpg" not in src


def test_tc_bug_priv_04_primary_button_label_matches_selected_option() -> None:
    src = CONSENT_SCREEN.read_text("utf-8")
    assert "'Continue to health assessment'" in src
    assert "'Continue to general education'" in src
    assert "Skip to general education" in src


def test_tc_bug_priv_05_selected_option_has_aria_pressed_and_keyboard_support() -> None:
    src = CONSENT_SCREEN.read_text("utf-8")
    assert 'data-testid="preset-health-assessment"' in src
    assert "aria-pressed={isAssessmentEnabled}" in src
    assert 'data-testid="preset-education-only"' in src
    assert "aria-pressed={!isAssessmentEnabled}" in src
    assert "ArrowRight" in src and "ArrowLeft" in src


def test_tc_bug_priv_06_on_and_off_list_matches_consent_payload_sent_to_api(api: Api) -> None:
    proc = subprocess.run(
        ["node", "--test", "apps/web/tests/bug_summary_privacy.test.ts"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    assert "TC-BUG-PRIV-06" in proc.stdout

    patient = api.start()
    decisions = {
        "assessment": True,
        "clinician_review": False,
        "provider_share": False,
        "spouse_share": False,
        "research_use": False,
    }
    res = patient.put(
        patient.path("/consent"),
        {"consent_version": "CONSENT-0.1", "decisions": decisions},
    )
    assert res.status_code == 200
    scopes = res.json()["scopes"]
    assert {k: v["granted"] for k, v in scopes.items()} == decisions
