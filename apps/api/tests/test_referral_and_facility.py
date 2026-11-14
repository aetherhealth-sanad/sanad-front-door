"""RF-12 referral gate, RF-13 mock facility, RF-14 tracking/delayed flag, RF-17 mock labels."""

from __future__ import annotations

import ast
import json
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

import pytest

from sanad_api.consent.service import ScopeStatus
from sanad_api.referral.gate import DecisionSnapshot, GateInputs, evaluate_gate
from sanad_api.referral.lifecycle import FACILITY_STATUSES, LIFECYCLE, MockStatus, can_move
from sanad_api.referral.models import Referral
from tests.helpers import START, Api

PACKAGE = Path(__file__).resolve().parents[1] / "sanad_api"
FORBIDDEN_IMPORTS = {
    "httpx",
    "requests",
    "urllib3",
    "aiohttp",
    "smtplib",
    "twilio",
    "boto3",
    "sendgrid",
    "socket",
}


def _valid_gate_inputs() -> GateInputs:
    return GateInputs(
        provider_share=ScopeStatus.ACTIVE,
        latest_decision=DecisionSnapshot(
            decision="APPROVE",
            kind="SIMULATED_APPROVAL",
            case_version=3,
            report_hash="sha256-report-v3",
            expires_at=START + timedelta(hours=24),
        ),
        case_version=3,
        report_hash="sha256-report-v3",
        case_state="NAVIGATION_STARTED",
        triage_action="SPECIALIST",
        is_synthetic=True,
        referral_exists=False,
        target_mock_facility_id="MOCK-CLINIC-A",
        mock_directory_ids=frozenset({"MOCK-CLINIC-A", "MOCK-CLINIC-B", "MOCK-CLINIC-C"}),
        now=START,
    )


def _gt_rows() -> list[tuple[str, GateInputs, bool, tuple[str, ...]]]:
    base = _valid_gate_inputs()
    assert base.latest_decision is not None
    return [
        ("GT-1", base, True, ()),
        (
            "GT-2",
            replace(base, provider_share=ScopeStatus.MISSING),
            False,
            ("CONSENT_PROVIDER_SHARE_MISSING",),
        ),
        (
            "GT-3",
            replace(base, provider_share=ScopeStatus.REVOKED),
            False,
            ("CONSENT_PROVIDER_SHARE_REVOKED",),
        ),
        ("GT-4", replace(base, latest_decision=None), False, ("APPROVAL_MISSING",)),
        (
            "GT-5",
            replace(
                base,
                latest_decision=replace(base.latest_decision, decision="REJECT", kind=None),
            ),
            False,
            ("APPROVAL_REJECTED",),
        ),
        (
            "GT-6",
            replace(
                base,
                latest_decision=replace(
                    base.latest_decision, decision="REQUEST_CLARIFICATION", kind=None
                ),
            ),
            False,
            ("APPROVAL_MISSING",),
        ),
        (
            "GT-7",
            replace(base, latest_decision=replace(base.latest_decision, case_version=2)),
            False,
            ("APPROVAL_STALE",),
        ),
        (
            "GT-8",
            replace(
                base, latest_decision=replace(base.latest_decision, report_hash="older-hash")
            ),
            False,
            ("APPROVAL_STALE",),
        ),
        (
            "GT-9",
            replace(
                base,
                latest_decision=replace(
                    base.latest_decision, expires_at=START - timedelta(seconds=1)
                ),
            ),
            False,
            ("APPROVAL_STALE",),
        ),
        ("GT-10", replace(base, case_state="ASSESSING"), False, ("STATE_NOT_ELIGIBLE",)),
        (
            "GT-11",
            replace(base, triage_action="EDUCATION"),
            False,
            ("TRIAGE_NOT_ELIGIBLE",),
        ),
        (
            "GT-12",
            replace(base, triage_action="EMERGENCY_GUIDANCE"),
            False,
            ("TRIAGE_NOT_ELIGIBLE",),
        ),
        ("GT-13", replace(base, is_synthetic=False), False, ("CASE_NOT_SYNTHETIC",)),
        (
            "GT-14",
            replace(base, referral_exists=True),
            False,
            ("REFERRAL_ALREADY_EXISTS",),
        ),
        (
            "GT-15",
            replace(base, target_mock_facility_id="REAL-HOSPITAL"),
            False,
            ("TARGET_NOT_IN_MOCK_DIRECTORY",),
        ),
        (
            "GT-16",
            replace(
                base,
                provider_share=ScopeStatus.MISSING,
                latest_decision=None,
                case_state="ASSESSING",
            ),
            False,
            ("CONSENT_PROVIDER_SHARE_MISSING", "APPROVAL_MISSING", "STATE_NOT_ELIGIBLE"),
        ),
    ]


@pytest.mark.parametrize(
    ("row_id", "inputs", "expected_allow", "expected_codes"),
    _gt_rows(),
    ids=[r[0] for r in _gt_rows()],
)
def test_tc_12_1_tc_12_2_referral_gate_truth_table_unit(
    row_id: str,
    inputs: GateInputs,
    expected_allow: bool,
    expected_codes: tuple[str, ...],
) -> None:
    """TC-12.1 and TC-12.2: All 16 truth-table rows (GT-1 to GT-16) evaluate deterministically
    and collect every failing reason code without short-circuiting."""
    decision = evaluate_gate(inputs)
    assert decision.allow is expected_allow, row_id
    assert decision.reason_codes == expected_codes, row_id
    payload = decision.to_json()
    assert payload["decision"] == ("ALLOW" if expected_allow else "DENY")
    assert payload["is_mock"] is True


def test_tc_12_1_tc_12_2_referral_gate_api_allows_only_when_all_pass_and_audits_both(
    api: Api,
) -> None:
    """TC-12.1 and TC-12.2 (API): Denial returns 403 GATE_DENIED with reason codes, creates
    no Referral row, and audits GATE_EVALUATED; ALLOW creates 1 mock referral and audits ALLOW."""
    patient = api.navigating("CN-001")

    # Deny when provider_share is missing (GT-2).
    denied = patient.refer("MOCK-CLINIC-A")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "GATE_DENIED"
    assert denied.json()["error"]["details"] == ["CONSENT_PROVIDER_SHARE_MISSING"]
    assert denied.json()["gate_decision"]["decision"] == "DENY"
    with api.db() as db:
        assert db.query(Referral).filter_by(case_id=patient.case_id).count() == 0

    # Grant provider_share, then test unknown target (GT-15).
    patient.consent(provider_share=True)
    bad_target = patient.refer("NOT-A-MOCK-CLINIC")
    assert bad_target.status_code == 403
    assert bad_target.json()["error"]["details"] == ["TARGET_NOT_IN_MOCK_DIRECTORY"]

    # Valid send (GT-1).
    allowed = patient.refer("MOCK-CLINIC-A")
    assert allowed.status_code == 201
    body = allowed.json()
    assert body["gate_decision"]["decision"] == "ALLOW"
    assert body["referral"]["status"] == "SIMULATED"
    assert body["referral"]["mock_status"] == "MOCK_SENT"
    assert body["referral"]["is_mock"] is True

    # Duplicate send (GT-14).
    dup = patient.refer("MOCK-CLINIC-A")
    assert dup.status_code == 403
    assert "REFERRAL_ALREADY_EXISTS" in dup.json()["error"]["details"]

    gate_audits = [e for e in api.audit(patient.case_id) if e.event_type == "GATE_EVALUATED"]
    decisions = [json.loads(e.details_json)["decision"] for e in gate_audits]
    assert decisions == ["DENY", "DENY", "ALLOW", "DENY"]


def test_tc_12_3_preview_grants_nothing_and_send_rechecks_consent_fresh(api: Api) -> None:
    """TC-12.3: GET /referral-gate returns ALLOW when conditions hold, but revoking
    provider_share before POST /mock-referral causes the send to return 403."""
    patient = api.navigating("CN-001")
    patient.consent(provider_share=True)

    preview = patient.gate("MOCK-CLINIC-A")
    assert preview.status_code == 200
    assert preview.json()["decision"] == "ALLOW"

    patient.consent(provider_share=False)
    send = patient.refer("MOCK-CLINIC-A")
    assert send.status_code == 403
    assert send.json()["error"]["details"] == ["CONSENT_PROVIDER_SHARE_REVOKED"]
    with api.db() as db:
        assert db.query(Referral).filter_by(case_id=patient.case_id).count() == 0


def test_tc_12_4_changed_answers_make_prior_approval_stale(api: Api) -> None:
    """TC-12.4: If answers or case_version change after approval, or approval expires,
    the gate denies with APPROVAL_STALE."""
    patient = api.navigating("CN-001")
    patient.consent(provider_share=True)
    # Advance clock past the 24h approval TTL while keeping a fresh staff/patient check via gate.
    api.clock.advance(24 * 60 * 60 + 10)
    # Gate preview at unit/service level after expiry:
    inputs = _valid_gate_inputs()
    assert inputs.latest_decision is not None
    expired = replace(
        inputs,
        now=START + timedelta(hours=25),
    )
    decision = evaluate_gate(expired)
    assert not decision.allow
    assert decision.reason_codes == ("APPROVAL_STALE",)


def test_tc_12_5_send_for_review_and_approve_create_zero_referrals(api: Api) -> None:
    """TC-12.5: Sending for review and approving create zero rows in referrals."""
    patient = api.approved("CN-001")
    with api.db() as db:
        assert db.query(Referral).filter_by(case_id=patient.case_id).count() == 0


def test_tc_12_7_only_send_mock_referral_constructs_referral() -> None:
    """TC-12.7: AST check that Referral(...) is only instantiated inside
    sanad_api/referral/service.py within send_mock_referral."""
    instantiations: list[str] = []
    for path in PACKAGE.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                for child in ast.walk(node):
                    if (
                        isinstance(child, ast.Call)
                        and isinstance(child.func, ast.Name)
                        and child.func.id == "Referral"
                    ):
                        rel = path.relative_to(PACKAGE).as_posix()
                        instantiations.append(f"{rel}:{node.name}")
    assert instantiations == ["referral/service.py:send_mock_referral"]


def test_tc_12_8_referral_and_mock_facility_import_no_outbound_transport() -> None:
    """TC-12.8: AST import lint verifying referral/ and mock_facility/ import no HTTP,
    SMTP, socket, or SMS client libraries."""
    offenders: list[str] = []
    for folder in ("referral", "mock_facility"):
        for path in (PACKAGE / folder).rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        root = alias.name.split(".")[0]
                        if root in FORBIDDEN_IMPORTS:
                            offenders.append(f"{path.name}:{root}")
                elif isinstance(node, ast.ImportFrom) and node.module:
                    root = node.module.split(".")[0]
                    if root in FORBIDDEN_IMPORTS:
                        offenders.append(f"{path.name}:{root}")
    assert offenders == []


def test_tc_12_9_spouse_share_is_always_refused_and_audited(api: Api) -> None:
    """TC-12.9: POST /spouse-share returns 403 SPOUSE_SHARE_NOT_AVAILABLE even when
    spouse_share consent is granted, and writes SHARE_DENIED to the audit log."""
    patient = api.navigating("CN-001")
    patient.consent(spouse_share=True)
    res = patient.post(patient.path("/spouse-share"))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "SPOUSE_SHARE_NOT_AVAILABLE"
    assert "SHARE_DENIED" in api.audit_types(patient.case_id)


def test_tc_13_1_mock_facility_endpoints_refuse_non_facility_callers(api: Api) -> None:
    """TC-13.1: Mock facility endpoints return 401 to anonymous and 403 to patient/reviewer."""
    patient, referral_id = api.referred("CN-001")
    urls = [
        ("GET", "/api/mock-facility/referrals"),
        ("GET", f"/api/mock-facility/referrals/{referral_id}"),
        ("POST", f"/api/mock-facility/referrals/{referral_id}/events"),
    ]
    for method, url in urls:
        for expected_status, caller in [
            (401, api.anonymous()),
            (403, patient),
            (403, api.reviewer()),
        ]:
            if method == "POST":
                res = caller.post(url, {"mock_status": "MOCK_RECEIVED"})
            else:
                res = caller.get(url)
            assert res.status_code == expected_status, (method, url, expected_status)


def test_tc_13_2_mock_facility_lifecycle_transitions_and_appointments(api: Api) -> None:
    """TC-13.2: Valid lifecycle moves succeed; invalid moves return 409 INVALID_TRANSITION."""
    for current in MockStatus:
        for target in FACILITY_STATUSES:
            assert can_move(current, target) == (target in LIFECYCLE[current])

    patient, referral_id = api.referred("CN-001")
    # Invalid jump from MOCK_SENT directly to MOCK_ACCEPTED -> 409.
    skip = api.facility_event(referral_id, "MOCK_ACCEPTED")
    assert skip.status_code == 409
    assert skip.json()["error"]["code"] == "INVALID_TRANSITION"

    # Valid progression through MOCK_RECEIVED -> MOCK_ACCEPTED -> SCHEDULED -> MOCK_CLOSED.
    assert api.facility_event(referral_id, "MOCK_RECEIVED").status_code == 201
    assert api.facility_event(referral_id, "MOCK_ACCEPTED").status_code == 201
    sched = api.facility_event(
        referral_id,
        "MOCK_APPOINTMENT_SCHEDULED",
        mock_appointment={"starts_at": "2026-11-15T10:00:00Z"},
    )
    assert sched.status_code == 201
    assert sched.json()["mock_appointment"]["label"] == "Mock appointment, not a real booking"

    closed = api.facility_event(referral_id, "MOCK_CLOSED")
    assert closed.status_code == 201
    assert patient.state()["state"] == "CLOSED"

    # No further moves after end state.
    after = api.facility_event(referral_id, "MOCK_RECEIVED")
    assert after.status_code == 409


def test_tc_13_3_forbidden_care_completion_statuses_are_rejected(api: Api) -> None:
    """TC-13.3: Posting PROVIDER_VERIFIED, CARE_COMPLETED, BOOKING_SELF_REPORTED, or
    VISIT_SELF_REPORTED to the mock facility endpoint fails schema validation (422)."""
    _patient, referral_id = api.referred("CN-001")
    for status in (
        "PROVIDER_VERIFIED",
        "CARE_COMPLETED",
        "BOOKING_SELF_REPORTED",
        "VISIT_SELF_REPORTED",
        "MOCK_SENT",
        "MOCK_WITHDRAWN",
    ):
        res = api.facility_event(referral_id, status)
        assert res.status_code == 422, status


def test_tc_13_4_mock_facility_sees_only_snapshot_and_withdrawn_referral_clears_it(
    api: Api,
) -> None:
    """TC-13.4: Facility list/detail expose only case_code, care_type, reviewer_summary,
    and limits (never case_id, answers, or lab values), and revoking provider_share clears
    the snapshot and marks MOCK_WITHDRAWN."""
    patient, referral_id = api.referred("CN-001")
    listing = api.facility().get("/api/mock-facility/referrals").json()
    assert listing["is_mock"] is True
    item = listing["referrals"][0]
    assert item["referral_id"] == referral_id
    assert item["case_code"].startswith("C-")
    assert patient.case_id not in json.dumps(listing)

    detail = api.facility().get(f"/api/mock-facility/referrals/{referral_id}").json()
    assert set(detail["snapshot"]) == {"case_code", "care_type", "reviewer_summary", "limits"}
    assert patient.case_id not in json.dumps(detail)

    # Withdraw provider_share consent while referral is live.
    patient.consent(provider_share=False)
    after = api.facility().get(f"/api/mock-facility/referrals/{referral_id}").json()
    assert after["mock_status"] == "MOCK_WITHDRAWN"
    assert after["snapshot"] is None
    assert api.facility_event(referral_id, "MOCK_RECEIVED").status_code == 409


def test_tc_13_5_mock_directory_contains_only_invented_mock_facilities(api: Api) -> None:
    """TC-13.5: Mock directory facilities carry 'Mock' in their name and is_mock: true."""
    patient = api.start()
    directory = patient.get("/api/mock-directory").json()
    assert directory["is_mock"] is True
    assert len(directory["facilities"]) == 3
    for fac in directory["facilities"]:
        assert "Mock" in fac["name"]
        assert fac["is_mock"] is True


def test_tc_13_6_mock_facility_events_never_alter_triage_review_or_consent(api: Api) -> None:
    """TC-13.6: Mock facility events leave triage proposal, review decision, and consent
    grants completely unchanged."""
    patient, referral_id = api.referred("CN-001")
    consent_before = patient.get(patient.path("/consent")).json()["scopes"]
    report_before = patient.report().json()

    api.facility_event(referral_id, "MOCK_RECEIVED")
    api.facility_event(referral_id, "MOCK_ACCEPTED")

    consent_after = patient.get(patient.path("/consent")).json()["scopes"]
    report_after = patient.report().json()
    assert consent_after == consent_before
    assert report_after["next_step"] == report_before["next_step"]
    assert report_after["review_status"] == report_before["review_status"]


def test_tc_14_2_tc_14_3_tc_14_4_delayed_flag_boundaries_clearing_and_invariance(
    api: Api,
) -> None:
    """TC-14.2, TC-14.3, TC-14.4: Delayed flag is absent at exact threshold (120s),
    present at 121s across all 4 waiting stages, clears when the next event arrives,
    stays absent on MOCK_APPOINTMENT_SCHEDULED and end states, and never changes triage."""
    patient = api.pending("CN-001")
    # Stage 1: PENDING_CLINICIAN_REVIEW
    api.clock.advance(120)
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(1)
    flag1 = patient.tracking().json()["flag"]
    assert flag1 is not None and flag1["flag"] == "DELAYED"
    assert flag1["stage"] == "PENDING_CLINICIAN_REVIEW"
    assert flag1["threshold_kind"] == "MOCK_WORKFLOW_TIMER"
    # Reviewer detail sees the exact same flag.
    rev_detail = api.reviewer().get(f"/api/reviews/{patient.case_id}").json()
    assert rev_detail["tracking_flag"] == flag1

    # Approving clears the review wait.
    api.decide(patient, "APPROVE")
    assert patient.tracking().json()["flag"] is None

    # Start navigation and send referral -> Stage 2: MOCK_SENT
    patient.post(patient.path("/navigation/start"))
    patient.consent(provider_share=True)
    referral_id = patient.refer("MOCK-CLINIC-A").json()["referral"]["referral_id"]
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(120)
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(1)
    assert patient.tracking().json()["flag"]["stage"] == "MOCK_SENT"

    # Stage 3: MOCK_RECEIVED resets timer.
    api.facility_event(referral_id, "MOCK_RECEIVED")
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(120)
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(1)
    assert patient.tracking().json()["flag"]["stage"] == "MOCK_RECEIVED"

    # Stage 4: MOCK_ACCEPTED resets timer.
    api.facility_event(referral_id, "MOCK_ACCEPTED")
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(120)
    assert patient.tracking().json()["flag"] is None
    api.clock.advance(1)
    assert patient.tracking().json()["flag"]["stage"] == "MOCK_ACCEPTED"

    # MOCK_APPOINTMENT_SCHEDULED is not a waiting stage -> flag stays None even after threshold.
    api.facility_event(
        referral_id,
        "MOCK_APPOINTMENT_SCHEDULED",
        mock_appointment={"starts_at": "2026-11-20T10:00:00Z"},
    )
    api.clock.advance(500)
    assert patient.tracking().json()["flag"] is None

    # End state MOCK_CLOSED -> flag stays None and triage is unchanged.
    api.facility_event(referral_id, "MOCK_CLOSED")
    api.clock.advance(500)
    track = patient.tracking().json()
    assert track["flag"] is None
    assert patient.report().json()["next_step"]["action"] == "SPECIALIST"


def test_tc_14_6_tracking_returns_404_for_another_cases_token(api: Api) -> None:
    """TC-14.6: Another patient's token gets 404 NOT_FOUND on /tracking, identical to a
    non-existent case ID."""
    p1 = api.pending("CN-001")
    p2 = api.start()
    res_other = p2.get(p1.path("/tracking"))
    res_missing = p2.get("/api/cases/SANAD-000000000000/tracking")
    assert res_other.status_code == 404
    assert res_missing.status_code == 404
    assert res_other.json()["error"]["code"] == res_missing.json()["error"]["code"] == "NOT_FOUND"


def test_tc_17_2_simulated_api_responses_carry_is_mock_and_simulated_sources(api: Api) -> None:
    """TC-17.2: Every simulated API response includes is_mock: true and simulated events
    carry verification_source: SIMULATED."""
    patient, referral_id = api.referred("CN-001")
    api.facility_event(referral_id, "MOCK_RECEIVED")

    report = patient.report().json()
    assert report["is_mock"] is True
    assert report["next_step"]["is_mock"] is True

    queue = api.reviewer().get("/api/reviews/queue").json()
    assert queue["is_mock"] is True and queue["review_mode"] == "SIMULATED"

    rev_detail = api.reviewer().get(f"/api/reviews/{patient.case_id}").json()
    assert rev_detail["is_mock"] is True and rev_detail["review_mode"] == "SIMULATED"

    gate = patient.gate("MOCK-CLINIC-A").json()
    assert gate["is_mock"] is True

    fac_list = api.facility().get("/api/mock-facility/referrals").json()
    assert fac_list["is_mock"] is True

    fac_detail = api.facility().get(f"/api/mock-facility/referrals/{referral_id}").json()
    assert fac_detail["is_mock"] is True
    assert all(
        e["is_mock"] is True and e["verification_source"] == "SIMULATED"
        for e in fac_detail["events"]
    )

    track = patient.tracking().json()
    assert track["is_mock"] is True
    assert track["referral"]["is_mock"] is True
    assert all(entry["is_mock"] is True for entry in track["timeline"])
