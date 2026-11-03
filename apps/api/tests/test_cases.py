"""RF-02 start screen (API part) and RF-04 step memory and order guard."""

from __future__ import annotations

import ast
import re
from pathlib import Path

from sanad_api.audit.models import AuditEvent
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import (
    TRANSITIONS,
    CaseEvent,
    CaseState,
    InvalidTransitionError,
    transition,
)
from sanad_api.facts.models import Fact
from sanad_api.observations.models import Observation
from tests.helpers import START, Api

PACKAGE = Path(__file__).resolve().parents[1] / "sanad_api"
S, E = CaseState, CaseEvent

# Written independently from PRD section 4.7, product spec section 10 (R9) and API design G3,
# so the code's table is checked against the spec rather than against itself.
OPEN = [
    S.CONSENTED, S.EMERGENCY_GUIDANCE_ISSUED, S.ASSESSING, S.NEEDS_INFORMATION,
    S.PENDING_CLINICIAN_REVIEW, S.REVISION_REQUIRED, S.APPROVED, S.REJECTED,
    S.REPORT_RELEASED, S.GUIDANCE_AVAILABLE, S.NAVIGATION_STARTED, S.REFERRAL_REQUESTED,
]  # fmt: skip
EXPECTED_EDGES = {
    (S.DRAFT, E.GRANT_ASSESSMENT): S.CONSENTED,
    (S.DRAFT, E.DECLINE_ASSESSMENT): S.EDUCATION_ONLY,
    (S.CONSENTED, E.SAFETY_CLEAR): S.ASSESSING,
    (S.CONSENTED, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.ASSESSING, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.NEEDS_INFORMATION, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.REVISION_REQUIRED, E.EMERGENCY_TRIGGER): S.EMERGENCY_GUIDANCE_ISSUED,
    (S.ASSESSING, E.INFORMATION_MISSING): S.NEEDS_INFORMATION,
    (S.NEEDS_INFORMATION, E.INFORMATION_CORRECTED): S.ASSESSING,
    (S.ASSESSING, E.RELEASE_EDUCATION_ONLY): S.REPORT_RELEASED,
    (S.ASSESSING, E.SEND_FOR_REVIEW): S.PENDING_CLINICIAN_REVIEW,
    (S.PENDING_CLINICIAN_REVIEW, E.CLARIFICATION_REQUESTED): S.REVISION_REQUIRED,
    (S.REVISION_REQUIRED, E.REVISION_UPDATED): S.ASSESSING,
    (S.PENDING_CLINICIAN_REVIEW, E.REVIEW_APPROVED): S.APPROVED,
    (S.PENDING_CLINICIAN_REVIEW, E.REVIEW_REJECTED): S.REJECTED,
    (S.PENDING_CLINICIAN_REVIEW, E.CLINICIAN_REVIEW_REVOKED): S.ASSESSING,
    (S.APPROVED, E.RELEASE_REPORT): S.REPORT_RELEASED,
    (S.REPORT_RELEASED, E.ISSUE_GUIDANCE): S.GUIDANCE_AVAILABLE,
    (S.GUIDANCE_AVAILABLE, E.START_NAVIGATION): S.NAVIGATION_STARTED,
    (S.NAVIGATION_STARTED, E.REQUEST_REFERRAL): S.REFERRAL_REQUESTED,
    (S.REFERRAL_REQUESTED, E.MOCK_REFERRAL_ENDED): S.CLOSED,
    (S.REFERRAL_REQUESTED, E.PROVIDER_SHARE_WITHDRAWN): S.CLOSED,
    (S.GUIDANCE_AVAILABLE, E.CLOSE): S.CLOSED,
    (S.NAVIGATION_STARTED, E.CLOSE): S.CLOSED,
    (S.EMERGENCY_GUIDANCE_ISSUED, E.CLOSE): S.CLOSED,
    (S.EDUCATION_ONLY, E.CLOSE): S.CLOSED,
    (S.REJECTED, E.CLOSE): S.CLOSED,
    **{(state, E.REVOKE_ASSESSMENT): S.CONSENT_REVOKED for state in OPEN},
}


class _RecordingSession:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, row: object) -> None:
        self.added.append(row)


def test_tc_04_4_every_edge_passes_and_every_other_pair_is_rejected() -> None:
    """TC-04.4: one table, including the R9 additions and the G3 edge."""
    assert TRANSITIONS == EXPECTED_EDGES
    for state in CaseState:
        for event in CaseEvent:
            case = Case(case_id="SANAD-test", state=state.value, case_version=1)
            session = _RecordingSession()
            if (state, event) in EXPECTED_EDGES:
                result = transition(session, case, event, "TEST", START)  # type: ignore[arg-type]
                assert result is EXPECTED_EDGES[(state, event)]
                assert case.state == result.value and len(session.added) == 1
            else:
                try:
                    transition(session, case, event, "TEST", START)  # type: ignore[arg-type]
                except InvalidTransitionError:
                    pass
                else:
                    raise AssertionError(f"{state} + {event} should be rejected")
                assert case.state == state.value and not session.added


def test_tc_04_4_only_the_state_machine_writes_case_state() -> None:
    """Plan 4.1: no code other than transition() assigns `.state`."""
    offenders = []
    for path in PACKAGE.rglob("*.py"):
        if path.name == "state_machine.py":
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            targets = node.targets if isinstance(node, ast.Assign) else []
            if isinstance(node, ast.AugAssign | ast.AnnAssign):
                targets = [node.target]
            for target in targets:
                if isinstance(target, ast.Attribute) and target.attr == "state":
                    offenders.append(f"{path.name}:{node.lineno}")
    assert offenders == []


def test_tc_02_2_create_case_holds_only_the_start_reference(api: Api) -> None:
    """TC-02.2: DRAFT, a random ID with no personal data, no profile data on the case."""
    first = api.start("SAMPLE", "J1-002")
    second = api.start("SAMPLE", "J1-002")
    assert first.case_id != second.case_id
    assert re.fullmatch(r"SANAD-[0-9a-f]{12}", first.case_id)
    state = first.state()
    assert state == {
        "case_id": first.case_id,
        "state": "DRAFT",
        "case_version": 1,
        "route": "/consent",
        "allowed_actions": ["SET_CONSENT"],
    }
    with api.db() as db:
        assert db.query(Fact).filter_by(case_id=first.case_id).count() == 0
        assert db.query(Observation).filter_by(case_id=first.case_id).count() == 0
        case = db.get(Case, first.case_id)
        assert case is not None and case.fixture_id == "J1-002" and not case.profile_applied


def test_create_case_refuses_an_unknown_sample(api: Api) -> None:
    response = api.client.post("/api/cases", json={"start_mode": "SAMPLE", "fixture_id": "X-999"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNKNOWN_SAMPLE"


def test_create_case_needs_a_fixture_only_for_samples(api: Api) -> None:
    for body in ({"start_mode": "SAMPLE"}, {"start_mode": "BLANK", "fixture_id": "J1-002"}):
        response = api.client.post("/api/cases", json=body)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_samples_leave_out_consent_negative_fixtures(api: Api) -> None:
    samples = api.client.get("/api/samples").json()["samples"]
    ids = {sample["fixture_id"] for sample in samples}
    assert "J1-002" in ids and not any(i.startswith("CN-") for i in ids)
    assert all(sample["is_synthetic"] for sample in samples)


def test_tc_04_3_forbidden_transition_is_refused_unchanged_and_audited(api: Api) -> None:
    """TC-04.3: 409 INVALID_TRANSITION, state unchanged, audit entry written."""
    patient = api.consented()
    before = patient.state()
    response = patient.assess()
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_TRANSITION"
    assert patient.state() == before
    denied = [e for e in api.audit(patient.case_id) if e.event_type == "TRANSITION_DENIED"]
    assert len(denied) == 1 and '"attempted_action": "ASSESS"' in denied[0].details_json


def test_state_is_readable_only_by_its_own_session(api: Api) -> None:
    """AC-14.6 and INV-04: another case's ID is 404, the same as a missing case."""
    mine, other = api.start(), api.start()
    response = mine.get(f"/api/cases/{other.case_id}/state")
    assert response.status_code == 404 and response.json()["error"]["code"] == "NOT_FOUND"
    assert mine.get("/api/cases/SANAD-000000000000/state").status_code == 404
    assert api.anonymous().get(mine.path("/state")).status_code == 401
    assert api.reviewer().get(mine.path("/state")).status_code == 403


def test_closing_a_case_without_referral_ends_the_session(api: Api) -> None:
    patient = api.start()
    assert patient.consent(assessment=False).json()["state"]["state"] == "EDUCATION_ONLY"
    response = patient.post(patient.path("/close"))
    assert response.status_code == 200
    assert response.json()["state"] == "CLOSED" and response.json()["route"] == "/"
    assert patient.get(patient.path("/state")).status_code == 401
    assert api.audit_types(patient.case_id)[-2:] == ["CASE_CLOSED", "SESSION_ENDED"]


def test_version_reports_the_commit(api: Api) -> None:
    assert api.client.get("/version").json() == {"commit_sha": "test-sha"}


def test_every_response_is_no_store(api: Api) -> None:
    """API design section 1. The service worker never caches the API (AC-05.4)."""
    patient = api.start()
    responses = [
        api.client.get("/version"),
        api.client.get("/api/samples"),
        patient.get(patient.path("/state")),
        api.anonymous().get(patient.path("/state")),
        patient.get("/api/no-such-route"),
        api.client.post("/api/cases", json={"start_mode": "NOPE"}),
    ]
    assert all(r.headers["cache-control"] == "no-store" for r in responses)
    assert all(r.headers["x-request-id"].startswith("req-") for r in responses)


def test_malformed_json_is_a_bad_request(api: Api) -> None:
    response = api.client.post(
        "/api/cases", content=b"{not json", headers={"content-type": "application/json"}
    )
    assert response.status_code == 400 and response.json()["error"]["code"] == "BAD_REQUEST"


def test_validation_errors_never_echo_submitted_values(api: Api) -> None:
    marker = "MARKER-VALUE-7731"
    response = api.client.post("/api/cases", json={"start_mode": marker, marker: marker})
    assert response.status_code == 422
    assert marker not in response.text


def test_transition_denied_audit_holds_codes_only(api: Api) -> None:
    patient = api.consented()
    patient.assess()
    with api.db() as db:
        event = db.query(AuditEvent).filter_by(event_type="TRANSITION_DENIED").one()
        assert event.case_id == patient.case_id and event.case_version == 1
        assert event.actor == "PATIENT"
