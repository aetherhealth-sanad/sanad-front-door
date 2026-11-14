"""RF-15 lab observations (J3) and RF-16 selective evidence (J2)."""

from __future__ import annotations

import json

from tests.helpers import Api


def test_tc_15_1_valid_lab_entry_is_held_until_user_confirms_then_used(api: Api) -> None:
    """TC-15.1 (J3-001): Lab values start at NEEDS_USER_CONFIRMATION with issues: []
    and only enter the assessment after explicit confirmation."""
    patient = api.assessing("J3-001")
    obs_list = patient.get(patient.path("/observations")).json()["observations"]
    assert len(obs_list) == 1
    obs = obs_list[0]
    assert obs["test_code"] == "MOTILITY_PLACEHOLDER"
    assert obs["confirmation_status"] == "NEEDS_USER_CONFIRMATION"
    assert obs["issues"] == []

    # Before confirmation, LAB_ONLY assessment blocks with NO_CONFIRMED_OBSERVATION.
    unconfirmed = patient.assess("LAB_ONLY")
    assert unconfirmed.status_code == 409
    assert unconfirmed.json()["error"]["code"] == "BLOCKING_ITEMS_REMAIN"
    assert unconfirmed.json()["error"]["details"] == ["NO_CONFIRMED_OBSERVATION"]

    # Confirm the observation.
    confirmed = patient.post(patient.path(f"/observations/{obs['observation_id']}/confirm"))
    assert confirmed.status_code == 200
    assert confirmed.json()["confirmation_status"] == "CONFIRMED_BY_USER"

    # Now LAB_ONLY assessment succeeds and uses the confirmed observation.
    assessed = patient.assess("LAB_ONLY")
    assert assessed.status_code == 200
    assert assessed.json()["draft_ready"] is True
    report = patient.report().json()
    assert len(report["observations"]) == 1
    assert report["observations"][0]["used_in_assessment"] is True
    assert any(
        "result below a reference limit does not mean you cannot have children" in s.lower()
        for s in report["required_statements"]
    )


def test_tc_15_2_lab_entry_with_missing_or_invalid_unit_or_date_cannot_be_confirmed(
    api: Api,
) -> None:
    """TC-15.2 (J3-002): Missing unit or invalid date is held at NEEDS_USER_CONFIRMATION
    with issue codes, cannot be confirmed (422 OBSERVATION_INVALID), is never converted,
    and is excluded from assessment calculations."""
    patient = api.assessing("J3-002")
    obs_list = patient.get(patient.path("/observations")).json()["observations"]
    by_code = {o["test_code"]: o for o in obs_list}

    motility = by_code["MOTILITY_PLACEHOLDER"]
    assert motility["issues"] == ["UNIT_MISSING"]
    assert motility["confirmation_status"] == "NEEDS_USER_CONFIRMATION"

    conc = by_code["CONCENTRATION_PLACEHOLDER"]
    assert conc["issues"] == ["DATE_INVALID"]

    # Attempting to confirm either fails with 422 OBSERVATION_INVALID.
    for obs in (motility, conc):
        res = patient.post(patient.path(f"/observations/{obs['observation_id']}/confirm"))
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "OBSERVATION_INVALID"
        assert res.json()["error"]["details"] == obs["issues"]

    # Also test manual entry with an unaccepted unit (e.g., 'mg/dL') -> held with UNIT_NOT_ACCEPTED.
    bad_unit = patient.observe(
        test_code="VOLUME_PLACEHOLDER",
        value=2.5,
        unit="mg/dL",
        collected_on="2026-10-20",
        reference_source="Synthetic report",
    )
    assert bad_unit.status_code == 201
    assert bad_unit.json()["issues"] == ["UNIT_NOT_ACCEPTED"]
    assert bad_unit.json()["value"] == 2.5  # never converted

    # Fix the motility unit via PUT and confirm it, leaving concentration unconfirmed.
    fixed = patient.put(
        patient.path(f"/observations/{motility['observation_id']}"),
        {
            "test_code": "MOTILITY_PLACEHOLDER",
            "value": 40,
            "unit": "%",
            "collected_on": "2026-10-20",
            "reference_source": "Synthetic report",
        },
    )
    assert fixed.status_code == 200 and fixed.json()["issues"] == []
    assert (
        patient.post(
            patient.path(f"/observations/{motility['observation_id']}/confirm")
        ).status_code
        == 200
    )

    assert patient.assess("LAB_ONLY").status_code == 200
    rep_obs = {
        o["test_code"]: o for o in patient.report().json()["observations"]
    }
    assert rep_obs["MOTILITY_PLACEHOLDER"]["used_in_assessment"] is True
    assert rep_obs["CONCENTRATION_PLACEHOLDER"]["used_in_assessment"] is False


def test_tc_15_4_lab_result_requires_clinician_review_before_referral(api: Api) -> None:
    """TC-15.4: A lab-only case cannot send a referral until clinician review approves it."""
    patient = api.assessing("J3-001")
    obs_id = patient.get(patient.path("/observations")).json()["observations"][0]["observation_id"]
    patient.post(patient.path(f"/observations/{obs_id}/confirm"))
    patient.assess("LAB_ONLY")
    patient.consent(provider_share=True)

    denied = patient.refer("MOCK-CLINIC-A")
    assert denied.status_code == 403
    assert "APPROVAL_MISSING" in denied.json()["error"]["details"]
    assert "STATE_NOT_ELIGIBLE" in denied.json()["error"]["details"]


def test_tc_15_5_lab_only_path_reaches_draft_without_required_intake_questions(api: Api) -> None:
    """TC-15.5: Starting a BLANK case, entering and confirming a lab value, and running
    assess(entry_path='LAB_ONLY') produces a draft without requiring Q-BMI or Q-STEROID-USE."""
    patient = api.start("BLANK")
    patient.consent(assessment=True)
    patient.safety()
    obs = patient.observe(
        test_code="CONCENTRATION_PLACEHOLDER",
        value=0.0,
        unit="million/mL",
        collected_on="2026-10-20",
        reference_source="Synthetic report",
    ).json()
    patient.post(patient.path(f"/observations/{obs['observation_id']}/confirm"))

    assessed = patient.assess("LAB_ONLY")
    assert assessed.status_code == 200
    body = assessed.json()
    assert body["gatekeeper_status"] == "READY_FOR_ASSESSMENT"
    assert body["blocking_question_ids"] == []
    assert body["draft_ready"] is True
    assert body["triage_proposal"]["action"] == "PRIORITY_REVIEW"


def test_tc_15_6_confirmed_lab_contradicting_self_report_flags_conflicting(api: Api) -> None:
    """TC-15.6: Saying 'No' to Q-SEMEN-TEST-DONE and confirming a lab observation
    causes semen_analysis_done to become CONFLICTING and block FULL_INTAKE until resolved."""
    patient = api.start("BLANK")
    patient.consent(assessment=True)
    patient.safety()
    patient.answers(
        {"question_id": "Q-BMI", "choice": "ANSWERED", "value": 24.0},
        {"question_id": "Q-BODY-FAT", "choice": "NOT_SURE"},
        {"question_id": "Q-STEROID-USE", "choice": "ANSWERED", "value": False},
        {"question_id": "Q-SEMEN-TEST-DONE", "choice": "ANSWERED", "value": False},
    )
    obs = patient.observe(
        test_code="MOTILITY_PLACEHOLDER",
        value=40.0,
        unit="%",
        collected_on="2026-10-20",
        reference_source="Synthetic report",
    ).json()
    patient.post(patient.path(f"/observations/{obs['observation_id']}/confirm"))

    assessed = patient.assess("FULL_INTAKE").json()
    assert assessed["gatekeeper_status"] == "CONFLICTING_DATA"
    assert "Q-SEMEN-TEST-DONE" in assessed["blocking_question_ids"]


def test_tc_16_1_excluded_evidence_item_is_omitted_from_signals_and_drafts(api: Api) -> None:
    """TC-16.1: Excluding ITEM-HISTORY omits type2_diabetes and family_history_reported
    from known facts and reviewer facts, while listing ITEM-HISTORY in excluded_items."""
    patient = api.assessing("J2-001")
    sel = patient.put(
        patient.path("/evidence-selection"),
        {"items": [{"item_id": "ITEM-HISTORY", "use": False}]},
    )
    assert sel.status_code == 200
    items = {i["item_id"]: i for i in sel.json()["items"]}
    assert items["ITEM-HISTORY"]["use"] is False
    assert items["ITEM-HISTORY"]["used_in_assessment"] is False

    patient.assess()
    report = patient.report().json()
    known_codes = {k["concept_code"] for k in report["known"]}
    assert "type2_diabetes" not in known_codes
    assert "family_history_reported" not in known_codes
    assert "ITEM-HISTORY" in report["excluded_items"]

    patient.consent(clinician_review=True)
    patient.send_for_review()
    rev_detail = api.reviewer().get(f"/api/reviews/{patient.case_id}").json()
    rev_codes = {f["concept_code"] for f in rev_detail["facts"]}
    assert "type2_diabetes" not in rev_codes
    assert "family_history_reported" not in rev_codes
    assert "ITEM-HISTORY" in rev_detail["excluded_items"]


def test_tc_16_2_j2_001_never_infers_a_genetic_condition_from_family_history(api: Api) -> None:
    """TC-16.2: J2-001 with family_history_reported=true never names or implies a
    genetic condition or carrier status."""
    patient = api.drafted("J2-001")
    report = patient.report().json()
    text = json.dumps(report).lower()
    for forbidden in ("carrier", "chromosom", "klinefelter", "microdeletion", "diagnosed"):
        assert forbidden not in text


def test_tc_16_3_genetics_support_requires_result_inclusion_and_clinician_review_consent(
    api: Api,
) -> None:
    """TC-16.3: ITEM-GENETICS-RESULT is hidden until clinician_review consent is active,
    defaults to use=false, and sets genetics_support_available=true only when included."""
    patient = api.assessing("J2-001")

    # Without clinician_review consent, ITEM-GENETICS-RESULT is not even selectable.
    patient.assess()
    assert patient.report().json()["genetics_support_available"] is False

    # Grant clinician_review -> ITEM-GENETICS-RESULT becomes selectable, default use=False.
    patient.consent(clinician_review=True)
    patient.assess()
    assert patient.report().json()["genetics_support_available"] is False

    # Explicitly opt in to ITEM-GENETICS-RESULT.
    sel = patient.put(
        patient.path("/evidence-selection"),
        {"items": [{"item_id": "ITEM-GENETICS-RESULT", "use": True}]},
    )
    assert sel.status_code == 200
    patient.assess()
    assert patient.report().json()["genetics_support_available"] is True

    # Revoking clinician_review invalidates genetics consent and clears genetics_support_available.
    patient.consent(clinician_review=False)
    patient.assess()
    assert patient.report().json()["genetics_support_available"] is False


def test_tc_16_4_j2_requires_clinician_review_before_referral(api: Api) -> None:
    """TC-16.4: J2-001 cannot create a referral without clinician review and approval."""
    patient = api.drafted("J2-001")
    patient.consent(clinician_review=True, provider_share=True)
    denied = patient.refer("MOCK-CLINIC-A")
    assert denied.status_code == 403
    assert "APPROVAL_MISSING" in denied.json()["error"]["details"]

