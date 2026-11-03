"""RF-07 send to care facility (Mock) and RF-08 clinician review."""

from __future__ import annotations

import json

from sanad_api.referral.models import Referral
from sanad_api.review.models import ReviewDecision, ReviewRequest
from tests.helpers import Api

REVIEW_PATHS = ("/api/reviews/queue", "/api/reviews/{case_id}", "/api/reviews/{case_id}/decision")


def test_tc_07_3_send_without_clinician_review_is_refused(api: Api) -> None:
    patient = api.drafted()
    response = patient.send_for_review()
    assert response.status_code == 403
    assert response.json()["error"] == {
        "code": "CONSENT_REQUIRED",
        "message": "This step needs your permission first.",
        "details": ["clinician_review"],
        "request_id": response.headers["x-request-id"],
    }
    assert patient.state()["state"] == "ASSESSING"


def test_tc_07_4_send_moves_to_pending_once(api: Api) -> None:
    patient = api.drafted()
    patient.consent(clinician_review=True)
    first = patient.send_for_review()
    assert first.status_code == 201 and first.json()["is_mock"] is True
    assert first.json()["state"]["state"] == "PENDING_CLINICIAN_REVIEW"
    again = patient.send_for_review()
    assert again.status_code == 200
    assert again.json()["review_request_id"] == first.json()["review_request_id"]
    queue = api.reviewer().get("/api/reviews/queue").json()
    assert [item["case_id"] for item in queue["items"]] == [patient.case_id]
    assert api.audit_types(patient.case_id).count("REVIEW_REQUESTED") == 1
    with api.db() as db:
        assert db.query(ReviewRequest).filter_by(case_id=patient.case_id).count() == 1


def test_tc_07_5_send_creates_no_referral_and_needs_no_provider_share(api: Api) -> None:
    patient = api.pending()
    scopes = patient.get(patient.path("/consent")).json()["scopes"]
    assert not scopes["provider_share"]["granted"]
    with api.db() as db:
        assert db.query(Referral).count() == 0


def test_tc_07_6_education_only_cases_are_refused(api: Api) -> None:
    patient = api.start()
    patient.consent(assessment=False)
    response = patient.send_for_review(case_version=1)
    assert response.status_code in (403, 409)
    assert patient.state()["state"] == "EDUCATION_ONLY"
    assert "SEND_FOR_REVIEW" not in patient.state()["allowed_actions"]


def test_send_with_an_old_version_conflicts(api: Api) -> None:
    patient = api.drafted()
    patient.consent(clinician_review=True)
    response = patient.send_for_review(case_version=1)
    assert response.status_code == 409 and response.json()["error"]["code"] == "CASE_VERSION_CONFLICT"


def test_send_without_a_current_draft_is_refused(api: Api) -> None:
    patient = api.assessing()
    patient.consent(clinician_review=True)
    response = patient.send_for_review()
    assert response.status_code == 409 and response.json()["error"]["code"] == "DRAFT_NOT_CURRENT"


def test_tc_08_1_reviewer_endpoints_refuse_every_other_caller(api: Api) -> None:
    patient = api.pending()
    callers = {401: api.anonymous(), 403: patient}
    facility = api.facility()
    for path in REVIEW_PATHS:
        url = path.format(case_id=patient.case_id)
        for status, caller in [*callers.items(), (403, facility)]:
            if url.endswith("/decision"):
                response = caller.post(url, {"decision": "APPROVE", "case_version": 1})
            else:
                response = caller.get(url)
            assert response.status_code == status, (url, status)
    assert patient.state()["state"] == "PENDING_CLINICIAN_REVIEW"


def test_tc_08_4_approve_releases_guidance_as_a_simulated_approval(api: Api) -> None:
    patient = api.pending()
    response = api.decide(patient, "APPROVE")
    assert response.json() == {
        "review_id": response.json()["review_id"],
        "kind": "SIMULATED_APPROVAL",
        "is_mock": True,
        "case_version": patient.state()["case_version"],
        "state": "GUIDANCE_AVAILABLE",
    }
    with api.db() as db:
        decision = db.query(ReviewDecision).filter_by(case_id=patient.case_id).one()
        assert decision.actor == "REVIEWER:demo-reviewer" and decision.reviewer_type == "SIMULATED"
        assert decision.report_hash and decision.expires_at is not None


def test_tc_08_4_reject_needs_a_reason(api: Api) -> None:
    patient = api.pending()
    missing = api.decide(patient, "REJECT")
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "REASON_REQUIRED"
    assert patient.state()["state"] == "PENDING_CLINICIAN_REVIEW"
    rejected = api.decide(patient, "REJECT", reason_code="OUTSIDE_SERVICE_SCOPE")
    assert rejected.status_code == 200 and rejected.json()["state"] == "REJECTED"
    report = patient.report().json()
    assert report["review_status"] == "REJECTED" and report["next_step"] is None


def test_tc_08_4_clarification_returns_the_case_to_the_form(api: Api) -> None:
    patient = api.pending()
    response = api.decide(patient, "REQUEST_CLARIFICATION", question_ids=["Q-SMOKING"])
    assert response.json()["state"] == "REVISION_REQUIRED"
    assert patient.state()["route"] == "/intake"
    questions = patient.get(patient.path("/questions")).json()["questions"]
    assert [(q["question_id"], q["reason"], q["blocking"]) for q in questions] == [
        ("Q-SMOKING", "CLARIFICATION_REQUESTED", True)
    ]
    blocked = patient.assess().json()
    assert blocked["blocking_question_ids"] == ["Q-SMOKING"]
    patient.answers({"question_id": "Q-SMOKING", "choice": "ANSWERED", "value": False})
    assert patient.assess().json()["draft_ready"]
    assert patient.send_for_review().status_code == 201  # a new request for the new version


def test_tc_08_4_decisions_are_audited_without_the_note(api: Api) -> None:
    patient = api.pending()
    api.decide(patient, "REJECT", reason_code="OTHER", note="MARKER-NOTE-4410 free text")
    event = [e for e in api.audit(patient.case_id) if e.event_type == "REVIEW_DECIDED"][-1]
    details = json.loads(event.details_json)
    assert details["decision"] == "REJECT" and details["reason_code"] == "OTHER"
    assert details["reviewer_type"] == "SIMULATED"
    assert "MARKER-NOTE" not in event.details_json
    history = api.reviewer().get(f"/api/reviews/{patient.case_id}").json()["decision_history"]
    assert history[-1]["note"] == "MARKER-NOTE-4410 free text"


def test_tc_08_5_a_stale_version_decision_overwrites_nothing(api: Api) -> None:
    patient = api.pending()
    version = patient.state()["case_version"]
    edited = api.decide(patient, "EDIT", edits={"clinician_summary": "Edited summary."})
    assert edited.json()["case_version"] == version + 1
    stale = api.reviewer().post(
        f"/api/reviews/{patient.case_id}/decision", {"decision": "APPROVE", "case_version": version}
    )
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "CASE_VERSION_CONFLICT"
    assert patient.state()["state"] == "PENDING_CLINICIAN_REVIEW"


def test_tc_08_6_a_revoked_case_leaves_the_queue_and_decisions_are_denied(api: Api) -> None:
    patient = api.pending()
    patient.consent(clinician_review=False)
    reviewer = api.reviewer()
    assert reviewer.get("/api/reviews/queue").json()["items"] == []
    assert reviewer.get(f"/api/reviews/{patient.case_id}").status_code == 404
    assert api.decide(patient, "APPROVE").status_code == 404


def test_tc_08_7_an_edit_below_the_floor_is_rejected_and_above_is_accepted(api: Api) -> None:
    patient = api.pending()
    below = api.decide(patient, "EDIT", edits={"triage_action": "PRIMARY_CARE"})
    assert below.status_code == 422 and below.json()["error"]["code"] == "TRIAGE_BELOW_FLOOR"
    nmi = api.decide(patient, "EDIT", edits={"triage_action": "NEEDS_MORE_INFORMATION"})
    assert nmi.status_code == 422
    above = api.decide(patient, "EDIT", edits={"triage_action": "PRIORITY_REVIEW"})
    assert above.status_code == 200 and above.json()["state"] == "PENDING_CLINICIAN_REVIEW"
    detail = api.reviewer().get(f"/api/reviews/{patient.case_id}").json()
    assert detail["triage_proposal"]["action"] == "PRIORITY_REVIEW"
    assert detail["triage_proposal"]["floor"] == "SPECIALIST"


def test_reviewers_cannot_issue_emergency_guidance(api: Api) -> None:
    patient = api.pending()
    response = api.decide(patient, "EDIT", edits={"triage_action": "EMERGENCY_GUIDANCE"})
    assert response.status_code == 422


def test_g5_an_edit_needs_approval_on_the_new_version(api: Api) -> None:
    patient = api.pending()
    api.decide(patient, "EDIT", edits={"triage_action": "PRIORITY_REVIEW"})
    approved = api.decide(patient, "APPROVE")
    assert approved.status_code == 200
    report = patient.report().json()
    assert report["next_step"]["action"] == "PRIORITY_REVIEW"
    assert report["why_next_step"] == "A simulated reviewer changed the suggested next step."


def test_pending_report_withholds_the_next_step(api: Api) -> None:
    """API support for TC-08.9 and AC-08.9."""
    patient = api.pending()
    report = patient.report().json()
    assert report["next_step"] is None and report["why_next_step"] is None
    assert report["next_step_withheld"] == "PENDING_REVIEW"
    assert report["review_status"] == "PENDING_CLINICIAN_REVIEW"
    api.decide(patient, "APPROVE")
    released = patient.report().json()
    assert released["next_step"]["action"] == "SPECIALIST" and released["next_step"]["is_mock"]
    assert released["review_status"] == "SIMULATED_APPROVAL"


def test_reviewer_detail_shows_what_a_decision_needs(api: Api) -> None:
    """API support for TC-08.2: facts with source and time, unknowns, rules and evidence."""
    patient = api.pending()
    detail = api.reviewer().get(f"/api/reviews/{patient.case_id}").json()
    assert detail["review_mode"] == "SIMULATED" and detail["is_mock"] is True
    assert all(f["source_type"] and f["recorded_at"] for f in detail["facts"])
    assert detail["triage_proposal"]["rule_ids"] == ["DRAFT-STEROID-01"]
    assert detail["triage_proposal"]["approval_status"] == "CLINICAL_TBD"
    assert {e["status"] for e in detail["evidence"]} == {"INSUFFICIENT_EVIDENCE"}
    assert {"concept_code": "body_fat_percent", "state": "UNKNOWN"} in detail["unknown_fields"]
    assert detail["clinician_summary_draft"].startswith("Draft, generated from draft rules.")
