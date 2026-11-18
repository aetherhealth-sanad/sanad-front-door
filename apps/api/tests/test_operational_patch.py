"""Patient review persistence and facility list privacy regression (TC-OP-01..04)."""

from __future__ import annotations

from sanad_api.facts.models import Fact
from tests.helpers import Api


def test_tc_op_01_patient_review_shows_saved_sample_values_and_provenance(api: Api) -> None:
    patient = api.assessing('CN-001')
    response = patient.get(patient.path('/review-profile'))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['case_id'] == patient.case_id
    assert body['case_version'] == patient.state()['case_version']
    facts = [fact for item in body['items'] for fact in item['facts']]
    assert facts
    assert any(fact['source_type'] == 'SAMPLE_FIXTURE' for fact in facts)
    assert len(body['items']) >= len(facts) // 2
    assert api.anonymous().get(patient.path('/review-profile')).status_code == 401
    assert api.facility().get(patient.path('/review-profile')).status_code == 403


def test_tc_op_02_review_not_sure_persists_and_overrides_imported_fact(api: Api) -> None:
    patient = api.assessing('J1-004')
    path = patient.path('/review-profile')
    before = patient.get(path).json()
    item = next(item for item in before['items'] if item['question_id'] == 'Q-STEROID-USE')
    assert any(f['source_type'] == 'SAMPLE_FIXTURE' for f in item['facts'])
    corrected = patient.post(patient.path('/answers'), {
        'review_correction': True,
        'expected_case_version': before['case_version'],
        'answers': [{'question_id': 'Q-STEROID-USE', 'choice': 'NOT_SURE'}],
    })
    assert corrected.status_code == 200, corrected.text
    after = patient.get(path).json()
    now = next(item for item in after['items'] if item['question_id'] == 'Q-STEROID-USE')
    assert now['state'] == 'UNKNOWN'
    assert len(now['facts']) == 1
    assert now['facts'][0]['value'] is None
    assert now['facts'][0]['source_type'] == 'PATIENT_REPORTED'
    with api.db() as db:
        facts = db.query(Fact).filter_by(case_id=patient.case_id,
                                         concept_code='anabolic_steroid_use').all()
        assert any(f.source_type == 'SAMPLE_FIXTURE' and f.superseded_at for f in facts)
    assert patient.assess().json()['gatekeeper_status'] != 'CONFLICTING_DATA'


def test_tc_op_03_stale_review_correction_rejects_without_changing_facts(api: Api) -> None:
    patient = api.assessing('J1-004')
    old_version = patient.get(patient.path('/review-profile')).json()['case_version']
    ok = patient.post(patient.path('/answers'), {
        'review_correction': True,
        'expected_case_version': old_version,
        'answers': [{'question_id': 'Q-STEROID-USE', 'choice': 'ANSWERED',
                     'value': True, 'temporal_status': 'CURRENT'}],
    })
    assert ok.status_code == 200
    rejected = patient.post(patient.path('/answers'), {
        'review_correction': True,
        'expected_case_version': old_version,
        'answers': [{'question_id': 'Q-STEROID-USE', 'choice': 'NOT_SURE'}],
    })
    assert rejected.status_code == 409
    assert rejected.json()['error']['code'] == 'CASE_VERSION_CONFLICT'
    updated = patient.get(patient.path('/review-profile')).json()
    item = next(item for item in updated['items'] if item['question_id'] == 'Q-STEROID-USE')
    assert item['facts'][0]['value'] is True
    assert item['facts'][0]['temporal_status'] == 'CURRENT'


def test_tc_op_04_facility_queue_excludes_withdrawn_referrals(api: Api) -> None:
    patient, referral_id = api.referred()
    facility = api.facility()
    path = '/api/mock-facility/referrals'
    assert referral_id in [item['referral_id'] for item in facility.get(path).json()['referrals']]
    revoked = patient.consent(provider_share=False)
    assert revoked.status_code == 200, revoked.text
    listing = facility.get(path)
    assert listing.status_code == 200
    assert referral_id not in [item['referral_id'] for item in listing.json()['referrals']]
    detail = facility.get(f'{path}/{referral_id}')
    assert detail.status_code == 200  # Minimal historical status, but no shared snapshot.
    assert detail.json()['snapshot'] is None
