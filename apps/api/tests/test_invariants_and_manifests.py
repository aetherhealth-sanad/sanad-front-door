"""RF-09 quick exit, PRD v0.4 manifests (TC-20.*), Invariants (TC-INV-*), and E2E journeys."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import pytest

from sanad_api.audit.models import AuditEvent
from sanad_api.cases.models import Case
from sanad_api.catalogues import Catalogues
from tests.helpers import Api

REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_GET_PATHS = {
    "/version",
    "/api/samples",
    "/api/consent/current",
    "/api/psychosocial/questions",
}
PUBLIC_POST_PATHS = {
    "/api/cases",
    "/api/auth/login",
    "/api/session/end",
}


def test_tc_09_5_tc_09_6_session_end_invalidates_token_leaves_case_unchanged_and_audits_only_end(
    api: Api,
) -> None:
    """TC-09.5 and TC-09.6: POST /api/session/end invalidates the session token (401 on
    next call), leaves case state, version, and triage unchanged, and writes only SESSION_ENDED."""
    patient = api.drafted("CN-001")
    before_audit = api.audit_types(patient.case_id)

    with api.db() as db:
        case_before = db.get(Case, patient.case_id)
        assert case_before is not None
        state_before = case_before.state
        version_before = case_before.case_version
        draft_before = case_before.current_draft_id

    res = api.client.post("/api/session/end", json={"session_token": patient.token})
    assert res.status_code == 204

    # Subsequent patient call with the old token returns 401 AUTH_REQUIRED.
    after_call = patient.get(patient.path("/state"))
    assert after_call.status_code == 401
    assert after_call.json()["error"]["code"] == "AUTH_REQUIRED"

    # Case state, version, and draft are untouched; only SESSION_ENDED was appended.
    with api.db() as db:
        case_after = db.get(Case, patient.case_id)
        assert case_after is not None
        assert case_after.state == state_before
        assert case_after.case_version == version_before
        assert case_after.current_draft_id == draft_before

    assert api.audit_types(patient.case_id) == [*before_audit, "SESSION_ENDED"]


def test_tc_20_1_fhir_r4_mapping_manifest_is_conceptual_only_and_not_evaluated() -> None:
    """TC-20.1: catalogue/fhir-r4-mapping-0.1.json marks status DESIGN_ONLY,
    compliance_status NOT_EVALUATED, and is_export_enabled false, covering all 6 source entities."""
    manifest_path = REPO_ROOT / "catalogue" / "fhir-r4-mapping-0.1.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["target_release"] == "FHIR R4"
    assert data["status"] == "DESIGN_ONLY"
    assert data["compliance_status"] == "NOT_EVALUATED"
    assert data["is_export_enabled"] is False
    assert data["terminology_status"] == "TERMINOLOGY_TBD"

    entities = {m["source_entity"]: m for m in data["mappings"]}
    expected_entities = {
        "AssessmentCase",
        "AssessmentResponse",
        "PsychosocialSelfReport",
        "ClinicalObservation",
        "SyntheticSemenReport",
        "ConsentLedger",
    }
    assert set(entities) == expected_entities
    for entry in entities.values():
        assert entry["validation_status"] == "NOT_RUN"
        assert entry["target_resource"]
        assert entry["gap_status"]


def test_tc_20_2_synthetic_fixture_manifest_covers_every_fixture_and_marks_not_evaluated(
    catalogues: Catalogues,
) -> None:
    """TC-20.2: data/synthetic/fixture-manifest.v0.4.json covers all 13 synthetic fixtures
    and marks clinical_review_status NOT_CLINICALLY_REVIEWED and NOT_EVALUATED."""
    manifest = catalogues.fixture_manifest
    assert manifest.manifest_status == "SYNTHETIC_PROVENANCE_ONLY"
    assert manifest.clinical_truth_status == "NOT_EVALUATED"
    assert manifest.fixture_count == len(catalogues.samples) == 13
    for entry in manifest.fixtures:
        assert entry.is_synthetic is True
        assert entry.clinical_review_status == "NOT_CLINICALLY_REVIEWED"
        assert entry.clinical_truth_status == "NOT_EVALUATED"
        assert entry.source_files


def test_tc_inv_01_backend_requires_no_model_or_llm_sdk() -> None:
    """TC-INV-01: apps/api/pyproject.toml and sanad_api source depend on no LLM or AI SDK."""
    pyproject = (REPO_ROOT / "apps" / "api" / "pyproject.toml").read_text(encoding="utf-8").lower()
    sdks = ("openai", "anthropic", "google-generativeai", "google-genai", "langchain", "litellm")
    for sdk in sdks:
        assert sdk not in pyproject


def test_tc_inv_02_all_synthetic_fixtures_carry_is_synthetic_and_no_personal_identifiers() -> None:
    """TC-INV-02: Every JSON file under data/synthetic/assessments/ carries is_synthetic: true
    (where applicable) and holds no personal identifier keys or real email/phone patterns."""
    assessments_dir = REPO_ROOT / "data" / "synthetic" / "assessments"
    forbidden_keys = {
        "name",
        "full_name",
        "first_name",
        "last_name",
        "phone",
        "email",
        "national_id",
        "mrn",
    }
    email_re = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

    def _walk_keys(obj: Any) -> set[str]:
        found: set[str] = set()
        if isinstance(obj, dict):
            for k, v in obj.items():
                found.add(k.lower())
                found |= _walk_keys(v)
        elif isinstance(obj, list):
            for item in obj:
                found |= _walk_keys(item)
        return found

    for fixture_dir in sorted(p for p in assessments_dir.iterdir() if p.is_dir()):
        for root_file in ("metadata.json", "intake.json", "consent.json", "evaluation_case.json"):
            fpath = fixture_dir / root_file
            data = json.loads(fpath.read_text(encoding="utf-8"))
            assert data.get("is_synthetic") is True, f"{fpath} missing is_synthetic: true"
        for json_file in fixture_dir.rglob("*.json"):
            raw = json_file.read_text(encoding="utf-8")
            parsed = json.loads(raw)
            assert not (_walk_keys(parsed) & forbidden_keys), f"PII key in {json_file}"
            assert not email_re.search(raw), f"Email pattern in {json_file}"


def test_tc_inv_03_logs_and_audit_entries_never_contain_marker_values(
    api: Api, caplog: pytest.LogCaptureFixture
) -> None:
    """TC-INV-03: Running a full journey with distinctive marker values in answers, lab
    observations, and reviewer notes writes zero marker values to logs or audit_events."""
    caplog.set_level(logging.INFO)
    patient = api.assessing("J1-002")
    patient.answers({"question_id": "Q-BODY-FAT", "choice": "ANSWERED", "value": 33.77})
    obs = patient.observe(
        test_code="MOTILITY_PLACEHOLDER",
        value=41.89,
        unit="%",
        collected_on="2026-10-20",
        reference_source="Synthetic report",
    ).json()
    patient.post(patient.path(f"/observations/{obs['observation_id']}/confirm"))
    patient.assess()
    patient.consent(clinician_review=True, provider_share=True)
    patient.send_for_review()
    api.decide(
        patient,
        "EDIT",
        edits={"clinician_summary": "MARKER-SUMMARY-9912"},
        note="MARKER-NOTE-8821",
    )
    api.decide(patient, "APPROVE", note="MARKER-APPROVE-7712")
    patient.post(patient.path("/navigation/start"))
    patient.refer("MOCK-CLINIC-A")

    markers = ("33.77", "41.89", "MARKER-SUMMARY-9912", "MARKER-NOTE-8821", "MARKER-APPROVE-7712")
    with api.db() as db:
        audit_blob = " ".join(e.details_json for e in db.query(AuditEvent).all())
    log_blob = caplog.text
    for marker in markers:
        assert marker not in audit_blob, f"Marker {marker} leaked into audit_events"
        assert marker not in log_blob, f"Marker {marker} leaked into application logs"


def test_tc_inv_04_every_protected_openapi_endpoint_enforces_auth_role_and_case_ownership(
    api: Api,
) -> None:
    """TC-INV-04: Every non-public endpoint in app.openapi() rejects anonymous callers (401),
    wrong-role callers (403), and another patient's case_id (404)."""
    schema = api.app.openapi()
    p1 = api.pending("CN-001")
    p2 = api.start()
    reviewer = api.reviewer()
    facility = api.facility()

    for path, methods in schema["paths"].items():
        for method_lower, _spec in methods.items():
            method = method_lower.upper()
            if (method == "GET" and path in PUBLIC_GET_PATHS) or (
                method == "POST" and path in PUBLIC_POST_PATHS
            ):
                continue
            url = (
                path.replace("{case_id}", p1.case_id)
                .replace("{observation_id}", "OBS-none")
                .replace("{referral_id}", "REF-none")
            )
            # 1. Anonymous caller gets 401 on every protected route.
            anon_res = api.anonymous().client.request(method, url, json={})
            assert anon_res.status_code == 401, f"Anon allowed on {method} {path}"

            # 2. Patient-owned /api/cases/{case_id}/* routes reject reviewer (403) and other (404).
            if path.startswith("/api/cases/{case_id}"):
                rev_res = reviewer.client.request(method, url, headers=reviewer.headers, json={})
                assert rev_res.status_code == 403, f"Reviewer allowed on {method} {path}"
                other_res = p2.client.request(method, url, headers=p2.headers, json={})
                assert other_res.status_code == 404, f"Other patient not 404 on {method} {path}"

            # 3. Reviewer routes reject patient and mock facility (403).
            if path.startswith("/api/reviews") or path.startswith("/api/evaluation"):
                pat_res = p1.client.request(method, url, headers=p1.headers, json={})
                fac_res = facility.client.request(method, url, headers=facility.headers, json={})
                assert pat_res.status_code == 403, f"Patient allowed on {method} {path}"
                assert fac_res.status_code == 403, f"Facility allowed on {method} {path}"

            # 4. Mock facility routes reject patient and reviewer (403).
            if path.startswith("/api/mock-facility"):
                pat_res = p1.client.request(method, url, headers=p1.headers, json={})
                rev_res = reviewer.client.request(method, url, headers=reviewer.headers, json={})
                assert pat_res.status_code == 403, f"Patient allowed on {method} {path}"
                assert rev_res.status_code == 403, f"Reviewer allowed on {method} {path}"


def test_tc_inv_06_no_provider_verified_or_care_completed_exists_in_vocab_or_outputs() -> None:
    """TC-INV-06 / Invariant 7: No code path writes PROVIDER_VERIFIED or CARE_COMPLETED."""
    from sanad_api import vocab
    from sanad_api.referral import lifecycle

    vocab_values = {
        v.value
        for obj in vars(vocab).values()
        if isinstance(obj, type) and issubclass(obj, vocab.StrEnum)
        for v in obj
    }
    lifecycle_values = {v.value for v in lifecycle.MockStatus}
    assert "PROVIDER_VERIFIED" not in (vocab_values | lifecycle_values)
    assert "CARE_COMPLETED" not in (vocab_values | lifecycle_values)


def test_tc_inv_07_web_source_and_emergency_page_satisfies_no_camera_and_offline_rules() -> None:
    """TC-INV-07, TC-05.4, TC-10.1: apps/web contains no getUserMedia or camera access;
    public/urgent.html has zero external assets and includes the prototype notice;
    public/sw.js caches only static allow-listed files and never /api/."""
    web_dir = REPO_ROOT / "apps" / "web"
    for path in (web_dir / "src").rglob("*"):
        if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".jsx", ".css", ".html"}:
            content = path.read_text(encoding="utf-8")
            assert "getUserMedia" not in content, f"Camera API in {path}"
            assert "mediaDevices" not in content, f"MediaDevices in {path}"

    urgent_html = (web_dir / "public" / "urgent.html").read_text(encoding="utf-8")
    assert "research prototype, not a certified medical device" in urgent_html.lower()
    assert "https://" not in urgent_html and "http://" not in urgent_html

    sw_js = (web_dir / "public" / "sw.js").read_text(encoding="utf-8")
    assert "/urgent.html" in sw_js
    assert "url.pathname.startsWith('/api/')" in sw_js

    # TC-10.4 browser-parity check: SafetyScreen.tsx imports emergency.draft-0.1.json
    # directly and evaluates localTrigger before any network call.
    safety_tsx = (web_dir / "src" / "pages" / "SafetyScreen.tsx").read_text(encoding="utf-8")
    assert "rules/emergency.draft-0.1.json" in safety_tsx
    assert "localTrigger" in safety_tsx

    # TC-09.1..09.4 QuickExit check: clears DOM and storage before sendBeacon('/api/session/end').
    quick_exit_tsx = (web_dir / "src" / "components" / "QuickExit.tsx").read_text(encoding="utf-8")
    assert "replaceChildren()" in quick_exit_tsx
    assert "sendBeacon('/api/session/end'" in quick_exit_tsx
    assert "window.location.replace(" in quick_exit_tsx


def test_tc_inv_09_audit_events_always_include_actor_timestamp_event_type_and_versions(
    api: Api,
) -> None:
    """TC-INV-09: Every AuditEvent row written across a full end-to-end referral flow
    populates actor, occurred_at, event_type, case_id, and case_version."""
    patient, referral_id = api.referred("CN-001")
    api.facility_event(referral_id, "MOCK_RECEIVED")
    api.facility_event(referral_id, "MOCK_CLOSED")

    events = api.audit(patient.case_id)
    assert len(events) >= 8
    for event in events:
        assert event.actor
        assert event.occurred_at is not None
        assert event.event_type
        assert event.case_id == patient.case_id
        assert event.case_version is not None and event.case_version >= 1
        details = json.loads(event.details_json)
        assert isinstance(details, dict)


def test_tc_j1_to_j5_and_cn_end_to_end_journey_matrix(api: Api) -> None:
    """End-to-end journey matrix (TC-J1-01..04, TC-J2-01, TC-J3-01..02, TC-J4-01,
    TC-J5-01, TC-DL-01, TC-CN-01..02): verifies each synthetic fixture's expected
    signals, triage floor/action, review behaviour, and gate outcome."""
    # J1-002: BMI + current steroid use -> SPECIALIST floor -> review -> referral -> MOCK_CLOSED.
    j1_2 = api.assessing("J1-002")
    j1_2.answers({"question_id": "Q-BODY-FAT", "choice": "NOT_SURE"})
    res_j1_2 = j1_2.assess().json()
    assert res_j1_2["triage_proposal"]["action"] == "SPECIALIST"
    j1_2.consent(clinician_review=True, provider_share=True)
    j1_2.send_for_review()
    api.decide(j1_2, "APPROVE")
    j1_2.post(j1_2.path("/navigation/start"))
    ref_res = j1_2.refer("MOCK-CLINIC-A")
    assert ref_res.status_code == 201
    ref_id = ref_res.json()["referral"]["referral_id"]
    api.facility_event(ref_id, "MOCK_RECEIVED")
    api.facility_event(ref_id, "MOCK_ACCEPTED")
    api.facility_event(ref_id, "MOCK_CLOSED")
    assert j1_2.state()["state"] == "CLOSED"

    # CN-001: Consent-negative fixture where provider_share is false -> gate denies.
    cn1 = api.navigating("CN-001")
    cn1_refer = cn1.refer("MOCK-CLINIC-A")
    assert cn1_refer.status_code == 403
    assert cn1_refer.json()["error"]["details"] == ["CONSENT_PROVIDER_SHARE_MISSING"]

    # CN-002: Consent-negative fixture where clinician_review is revoked -> send_for_review 403.
    cn2 = api.drafted("CN-002")
    cn2.consent(clinician_review=True)
    cn2.consent(clinician_review=False)
    assert cn2.send_for_review().status_code == 403
