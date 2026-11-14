"""PRD v0.4 optional psychosocial micro-intake tests (TC-18.1 to TC-18.4)."""

from __future__ import annotations

import json

from tests.helpers import Api


def test_tc_18_1_optional_psychosocial_accepts_zero_to_three_answers_and_preserves_states(
    api: Api,
) -> None:
    """TC-18.1: 0 to 3 optional answers are accepted, omitted questions stay NOT_ASKED,
    and DECLINED/UNKNOWN remain distinct from KNOWN_NEGATIVE."""
    patient = api.assessing("CN-001")

    # Catalogue endpoint returns the 3 draft questions with CONTEXT_ONLY_NOT_TRIAGE use.
    cat = api.client.get("/api/psychosocial/questions")
    assert cat.status_code == 200
    questions = cat.json()["questions"]
    assert [q["question_id"] for q in questions] == [
        "PSY-STRESS-01",
        "PSY-SLEEP-01",
        "PSY-ANXIETY-01",
    ]
    assert all(q["use"] == "CONTEXT_ONLY_NOT_TRIAGE" for q in questions)

    # Zero answers: all three remain NOT_ASKED.
    empty = patient.put(patient.path("/psychosocial"), {"answers": []})
    assert empty.status_code == 200
    assert empty.json()["diagnostic_label"] is None
    assert [a["response_state"] for a in empty.json()["answers"]] == [
        "NOT_ASKED",
        "NOT_ASKED",
        "NOT_ASKED",
    ]

    # Two answers (UNKNOWN and DECLINED), one omitted (NOT_ASKED).
    partial = patient.put(
        patient.path("/psychosocial"),
        {
            "answers": [
                {
                    "question_id": "PSY-STRESS-01",
                    "response_state": "UNKNOWN",
                    "response_code": "NOT_SURE",
                },
                {
                    "question_id": "PSY-SLEEP-01",
                    "response_state": "DECLINED",
                    "response_code": None,
                },
            ]
        },
    )
    assert partial.status_code == 200
    by_id = {a["question_id"]: a for a in partial.json()["answers"]}
    assert by_id["PSY-STRESS-01"]["response_state"] == "UNKNOWN"
    assert by_id["PSY-STRESS-01"]["response_code"] == "NOT_SURE"
    assert by_id["PSY-SLEEP-01"]["response_state"] == "DECLINED"
    assert by_id["PSY-SLEEP-01"]["response_code"] is None
    assert by_id["PSY-ANXIETY-01"]["response_state"] == "NOT_ASKED"
    assert by_id["PSY-ANXIETY-01"]["response_code"] is None
    assert by_id["PSY-ANXIETY-01"]["source_type"] is None

    # More than 3 or mismatched response_code/response_state is rejected.
    mismatch = patient.put(
        patient.path("/psychosocial"),
        {
            "answers": [
                {
                    "question_id": "PSY-STRESS-01",
                    "response_state": "DECLINED",
                    "response_code": "NO",
                }
            ]
        },
    )
    assert mismatch.status_code == 422


def test_tc_18_2_psychosocial_requires_assessment_consent_and_marks_unverified(api: Api) -> None:
    """TC-18.2: Submitting without assessment consent returns 403 CONSENT_REQUIRED;
    with consent, answered items carry PATIENT_REPORTED, UNVERIFIED, and assessment scope."""
    unconsented = api.start("BLANK")
    denied = unconsented.put(
        unconsented.path("/psychosocial"),
        {
            "answers": [
                {
                    "question_id": "PSY-STRESS-01",
                    "response_state": "KNOWN_POSITIVE",
                    "response_code": "YES",
                }
            ]
        },
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "CONSENT_REQUIRED"
    assert denied.json()["error"]["details"] == ["assessment"]

    patient = api.assessing("CN-001")
    saved = patient.put(
        patient.path("/psychosocial"),
        {
            "answers": [
                {
                    "question_id": "PSY-STRESS-01",
                    "response_state": "KNOWN_POSITIVE",
                    "response_code": "YES",
                },
                {
                    "question_id": "PSY-SLEEP-01",
                    "response_state": "KNOWN_NEGATIVE",
                    "response_code": "NO",
                },
            ]
        },
    )
    assert saved.status_code == 200
    by_id = {a["question_id"]: a for a in saved.json()["answers"]}
    for qid in ("PSY-STRESS-01", "PSY-SLEEP-01"):
        assert by_id[qid]["source_type"] == "PATIENT_REPORTED"
        assert by_id[qid]["verification_status"] == "UNVERIFIED"
        assert by_id[qid]["consent_scope"] == "assessment"
        assert by_id[qid]["reference_period"] == "LAST_4_WEEKS"
        assert by_id[qid]["collected_at"] is not None


def test_tc_18_3_psychosocial_never_changes_triage_signals_floor_or_action(api: Api) -> None:
    """TC-18.3: Identical clinical facts with and without positive psychosocial answers
    produce identical risk_signals, triage floor, and triage action."""
    p_without = api.assessing("CN-001")
    res_without = p_without.assess().json()

    p_with = api.assessing("CN-001")
    p_with.put(
        p_with.path("/psychosocial"),
        {
            "answers": [
                {
                    "question_id": "PSY-STRESS-01",
                    "response_state": "KNOWN_POSITIVE",
                    "response_code": "YES",
                },
                {
                    "question_id": "PSY-SLEEP-01",
                    "response_state": "KNOWN_POSITIVE",
                    "response_code": "YES",
                },
                {
                    "question_id": "PSY-ANXIETY-01",
                    "response_state": "KNOWN_POSITIVE",
                    "response_code": "YES",
                },
            ]
        },
    )
    res_with = p_with.assess().json()

    assert res_with["risk_signals"] == res_without["risk_signals"]
    assert res_with["triage_proposal"] == res_without["triage_proposal"]
    assert res_with["gatekeeper_status"] == res_without["gatekeeper_status"]

    rep_with = p_with.report().json()
    assert rep_with["psychosocial_context_use"] == "CONTEXT_ONLY_NOT_TRIAGE"
    assert len(rep_with["psychosocial_context"]) == 3


def test_tc_18_4_reviewer_access_to_psychosocial_requires_clinician_review_and_audit_stays_thin(
    api: Api,
) -> None:
    """TC-18.4: Reviewer sees psychosocial context only while clinician_review is active,
    and PSYCHOSOCIAL_CAPTURED audit events record count and version only (never answers)."""
    patient = api.assessing("CN-001")
    patient.put(
        patient.path("/psychosocial"),
        {
            "answers": [
                {
                    "question_id": "PSY-STRESS-01",
                    "response_state": "KNOWN_POSITIVE",
                    "response_code": "YES",
                }
            ]
        },
    )
    patient.assess()

    # Before sending / granting clinician_review, reviewer cannot read the case (404).
    assert api.reviewer().get(f"/api/reviews/{patient.case_id}").status_code == 404

    patient.consent(clinician_review=True)
    patient.send_for_review()
    detail = api.reviewer().get(f"/api/reviews/{patient.case_id}")
    assert detail.status_code == 200
    assert detail.json()["psychosocial_context_use"] == "CONTEXT_ONLY_NOT_TRIAGE"
    by_qid = {row["question_id"]: row for row in detail.json()["psychosocial_context"]}
    assert by_qid["PSY-STRESS-01"]["response_state"] == "KNOWN_POSITIVE"
    assert by_qid["PSY-ANXIETY-01"]["response_state"] == "NOT_ASKED"

    # Revoking clinician_review immediately blocks reviewer access (404).
    patient.consent(clinician_review=False)
    assert api.reviewer().get(f"/api/reviews/{patient.case_id}").status_code == 404

    # Audit log holds count and catalogue_version only, never response codes.
    events = [e for e in api.audit(patient.case_id) if e.event_type == "PSYCHOSOCIAL_CAPTURED"]
    assert len(events) == 1
    details = json.loads(events[0].details_json)
    assert details == {"catalogue_version": "psychosocial-context-0.1", "count": 1}
    assert "YES" not in events[0].details_json
    assert "KNOWN_POSITIVE" not in events[0].details_json
