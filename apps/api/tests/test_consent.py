"""RF-03 consent and CC-009 revocation effects."""

from __future__ import annotations

import json

from sanad_api.cases.models import Case
from sanad_api.facts.models import Fact
from tests.helpers import Api

SCOPES = ["assessment", "clinician_review", "provider_share", "spouse_share", "research_use"]


def test_consent_text_states_four_things_per_scope(api: Api) -> None:
    """API support for TC-03.1: each scope says what, why, who and what happens if off."""
    body = api.client.get("/api/consent/current").json()
    assert body["consent_version"] == "CONSENT-0.1"
    assert [scope["scope"] for scope in body["scopes"]] == SCOPES
    for scope in body["scopes"]:
        for field in ("data_covered", "used_for", "who_sees_it", "if_off"):
            assert scope[field].strip()
    unused = {s["scope"] for s in body["scopes"] if not s["used_in_this_flow"]}
    assert unused == {"spouse_share", "research_use"}


def test_tc_03_2_grant_saves_version_and_timestamp(api: Api) -> None:
    patient = api.start()
    response = patient.consent(assessment=True)
    assert response.status_code == 200
    body = response.json()
    assert body["state"]["state"] == "CONSENTED" and body["state"]["route"] == "/safety"
    assessment = body["scopes"]["assessment"]
    assert assessment["granted"] and assessment["captured_at"] == "2026-11-10T09:00:00Z"
    assert body["consent_version"] == "CONSENT-0.1"
    assert patient.get(patient.path("/consent")).json()["scopes"] == body["scopes"]


def test_tc_03_3_decline_gives_education_only_and_stores_nothing(api: Api) -> None:
    patient = api.start("SAMPLE", "J1-002")
    body = patient.consent(assessment=False).json()
    assert body["state"]["state"] == "EDUCATION_ONLY" and body["state"]["route"] == "/education"
    assert not any(scope["granted"] for scope in body["scopes"].values())
    with api.db() as db:
        case = db.get(Case, patient.case_id)
        assert case is not None and case.start_mode is None and case.fixture_id is None
        assert db.query(Fact).filter_by(case_id=patient.case_id).count() == 0
    assert patient.load_sample().status_code == 403


def test_tc_03_4_granting_assessment_leaves_every_other_scope_off(api: Api) -> None:
    scopes = api.start().consent(assessment=True).json()["scopes"]
    assert scopes["assessment"]["granted"]
    assert not any(scopes[name]["granted"] for name in SCOPES[1:])


def test_tc_03_5_revoking_clinician_review_denies_the_send(api: Api) -> None:
    patient = api.drafted()
    patient.consent(clinician_review=True)
    revoked = patient.consent(clinician_review=False).json()["scopes"]["clinician_review"]
    assert not revoked["granted"] and revoked["revoked_at"] is not None
    response = patient.send_for_review()
    assert response.status_code == 403
    assert response.json()["error"]["details"] == ["clinician_review"]


def test_tc_03_5_revoking_provider_share_denies_the_referral(api: Api) -> None:
    patient = api.navigating()
    patient.consent(provider_share=True)
    patient.consent(provider_share=False)
    response = patient.refer()
    assert response.status_code == 403
    assert response.json()["error"]["details"] == ["CONSENT_PROVIDER_SHARE_REVOKED"]


def test_tc_03_5_revoking_assessment_stops_the_case(api: Api) -> None:
    patient = api.assessing()
    body = patient.consent(assessment=False).json()
    assert body["state"]["state"] == "CONSENT_REVOKED" and body["state"]["route"] == "/privacy"
    response = patient.answers({"question_id": "Q-SMOKING", "choice": "NOT_SURE"})
    assert response.status_code == 403
    changes = [e for e in api.audit(patient.case_id) if e.event_type == "CONSENT_CHANGED"]
    for event in changes:
        assert set(json.loads(event.details_json)) <= {"scope", "consent_version", "change"}


def test_tc_03_6_patient_data_writes_need_assessment_consent(api: Api) -> None:
    """TC-03.6: each write without `assessment` returns 403 and stores nothing."""
    patient = api.start("UPLOAD")
    calls = [
        lambda: patient.load_sample(),
        lambda: patient.upload({"profile_format": "sanad-profile-0.1", "is_synthetic": True}),
        lambda: patient.safety(),
        lambda: patient.answers({"question_id": "Q-SMOKING", "choice": "NOT_SURE"}),
        lambda: patient.observe(test_code="MOTILITY_PLACEHOLDER", value=40),
        lambda: patient.put(patient.path("/evidence-selection"), {"items": []}),
        lambda: patient.assess(),
    ]
    for call in calls:
        response = call()
        assert response.status_code == 403, response.text
        assert response.json()["error"]["code"] == "CONSENT_REQUIRED"
    with api.db() as db:
        assert db.query(Fact).filter_by(case_id=patient.case_id).count() == 0
    assert patient.state()["state"] == "DRAFT"


def test_stale_consent_version_is_refused(api: Api) -> None:
    patient = api.start()
    response = patient.put(
        patient.path("/consent"),
        {"consent_version": "CONSENT-0.0", "decisions": {"assessment": True}},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONSENT_VERSION_OUTDATED"
    assert patient.state()["state"] == "DRAFT"


def test_other_scopes_need_assessment_first(api: Api) -> None:
    patient = api.start()
    response = patient.consent(clinician_review=True)
    assert response.status_code == 403 and response.json()["error"]["details"] == ["assessment"]
    assert not patient.get(patient.path("/consent")).json()["scopes"]["clinician_review"]["granted"]


def test_scopes_can_be_granted_with_assessment_in_one_request(api: Api) -> None:
    scopes = api.start().consent(assessment=True, clinician_review=True).json()["scopes"]
    assert scopes["assessment"]["granted"] and scopes["clinician_review"]["granted"]
    assert not scopes["provider_share"]["granted"]


def test_g3_revoking_clinician_review_while_pending_returns_the_case(api: Api) -> None:
    """CC-009 (G3): the case goes back to ASSESSING with its draft, and leaves the queue."""
    patient = api.pending()
    state = patient.consent(clinician_review=False).json()["state"]
    assert state["state"] == "ASSESSING" and state["route"] == "/result"
    assert patient.report().status_code == 200
    assert api.reviewer().get("/api/reviews/queue").json()["items"] == []


def test_g4_revoking_assessment_withdraws_a_live_referral(api: Api) -> None:
    """CC-009 (G4): every scope is revoked and the referral becomes MOCK_WITHDRAWN."""
    patient, referral_id = api.referred()
    body = patient.consent(assessment=False).json()
    assert body["state"]["state"] == "CONSENT_REVOKED"
    assert not any(scope["granted"] for scope in body["scopes"].values())
    detail = api.facility().get(f"/api/mock-facility/referrals/{referral_id}").json()
    assert detail["mock_status"] == "MOCK_WITHDRAWN" and detail["snapshot"] is None


def test_decline_after_draft_is_a_no_op_not_an_error(api: Api) -> None:
    patient = api.start()
    patient.consent(assessment=False)
    response = patient.consent(assessment=False)
    assert response.status_code == 200 and response.json()["state"]["state"] == "EDUCATION_ONLY"
    assert patient.consent(assessment=True).status_code == 409
