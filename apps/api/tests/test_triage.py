"""RF-11 facts, rule floor and draft result. Draft rule conformance only (oracle D)."""

from __future__ import annotations

import itertools
import json
from typing import Any

from sanad_api.catalogues import Catalogues, EvidenceRef, TriageCatalogue
from sanad_api.facts.models import Fact
from sanad_api.facts.service import build_views
from sanad_api.reports.drafts import PLACEHOLDER_SOURCES, _evidence
from sanad_api.reports.models import Draft
from sanad_api.rules_engine.floor import apply_floor
from sanad_api.rules_engine.triage import LabValue, TriageInputs, evaluate
from sanad_api.vocab import TriageAction
from tests.helpers import START, Api

BODY_FAT_NOT_SURE = {"question_id": "Q-BODY-FAT", "choice": "NOT_SURE"}
FORBIDDEN = ("infertil", "probability", "obesity_confirmed", "diagnosed with")
REQUIRED_LAB_STATEMENT = "a result below a reference limit does not mean you cannot have children."


def test_tc_11_1_j1_002_gives_two_signals_and_the_specialist_floor(api: Api) -> None:
    """TC-11.1: two separate signals, SPECIALIST, DRAFT-STEROID-01, CLINICAL_TBD."""
    patient = api.assessing("J1-002")
    patient.answers(BODY_FAT_NOT_SURE)
    body = patient.assess().json()
    assert [s["code"] for s in body["risk_signals"]] == [
        "BMI_CONTEXT_NEEDED",
        "REPORTS_ANABOLIC_STEROID_USE",
    ]
    assert body["triage_proposal"] == {
        "action": "SPECIALIST",
        "floor": "SPECIALIST",
        "rule_ids": ["DRAFT-STEROID-01"],
        "rule_version": "draft-0.1",
        "approval_status": "CLINICAL_TBD",
    }


def test_tc_11_2_past_stays_past_and_negated_stays_negated(api: Api) -> None:
    """TC-11.2 (J1-004): from storage through to the report."""
    patient = api.drafted("J1-004")
    known = {k["concept_code"]: k for k in patient.report().json()["known"]}
    assert known["anabolic_steroid_use"]["temporal_status"] == "PAST"
    assert known["anabolic_steroid_use"]["polarity"] == "AFFIRMED"
    assert known["smoking"]["polarity"] == "NEGATED" and known["smoking"]["value"] is False
    with api.db() as db:
        steroid = db.query(Fact).filter_by(
            case_id=patient.case_id, concept_code="anabolic_steroid_use"
        ).one()
        assert steroid.temporal_status == "PAST"


def test_tc_11_4_claims_without_a_verified_source_are_labelled(catalogues: Catalogues) -> None:
    """TC-11.4: a pending source is labelled, and the placeholder never renders as a citation."""
    rule = catalogues.triage.rules[1]
    assert _evidence(rule) == {
        "claim_id": f"CLAIM-{rule.rule_id}",
        "rule_id": rule.rule_id,
        "status": "INSUFFICIENT_EVIDENCE",
        "citation": None,
    }
    placeholder = rule.model_copy(
        update={
            "evidence_refs": (
                EvidenceRef(source_id="GUIDELINE-TO-BE-REVIEWED", version="1", verification="VERIFIED"),
            )
        }
    )  # fmt: skip
    assert "GUIDELINE-TO-BE-REVIEWED" in PLACEHOLDER_SOURCES
    assert _evidence(placeholder)["citation"] is None
    verified = rule.model_copy(
        update={
            "evidence_refs": (
                EvidenceRef(source_id="TEST-SOURCE-1", version="1", verification="VERIFIED"),
            )
        }
    )
    assert _evidence(verified)["citation"] == {"source_id": "TEST-SOURCE-1", "version": "1"}


def test_tc_11_5_same_fixture_gives_byte_identical_drafts(api: Api) -> None:
    contents = []
    for _ in range(2):
        patient = api.assessing("J1-002")
        patient.answers(BODY_FAT_NOT_SURE)
        patient.assess()
        patient.assess()  # a repeat makes no new draft
        with api.db() as db:
            drafts = db.query(Draft).filter_by(case_id=patient.case_id).all()
            assert len(drafts) == 1
            contents.append((drafts[0].content_json, drafts[0].report_hash))
    assert contents[0] == contents[1]


def test_tc_11_6_the_result_never_sits_below_the_floor(catalogues: Catalogues) -> None:
    """TC-11.6: exhaustive over every set of floors and every proposed action."""
    ranks = catalogues.triage.action_rank
    floors = [a for a in TriageAction if a is not TriageAction.NEEDS_MORE_INFORMATION]
    for size in range(len(floors) + 1):
        for hits in itertools.combinations(floors, size):
            floor = max(hits, key=lambda a: ranks[a]) if hits else None
            for proposed in TriageAction:
                result = apply_floor(proposed, floor, ranks)
                if floor is not None:
                    assert ranks[result.action] >= ranks[floor]
                    assert result.overridden == (ranks[proposed] < ranks[floor])
                else:
                    assert result.action is proposed and not result.overridden


def _inputs(catalogues: Catalogues, *labs: LabValue, **facts: Any) -> TriageInputs:
    rows = [
        Fact(
            fact_id=f"SF-{i}",
            concept_code=code,
            value_json=json.dumps(value),
            state="KNOWN_POSITIVE" if value is not False else "KNOWN_NEGATIVE",
            recorded_at=START,
            superseded_at=None,
        )
        for i, (code, value) in enumerate(facts.items())
    ]
    return TriageInputs(views=build_views(rows, catalogues.concepts), lab_values=labs)


def _with_parameters(catalogues: Catalogues, rule_id: str, **parameters: Any) -> TriageCatalogue:
    """A test copy of the catalogue with explicit TEST-ONLY parameters. Not clinical values."""
    rules = tuple(
        r.model_copy(update={"parameters": parameters}) if r.rule_id == rule_id else r
        for r in catalogues.triage.rules
    )
    return catalogues.triage.model_copy(update={"rules": rules})


def test_lab_values_are_not_compared_while_limits_are_missing(catalogues: Catalogues) -> None:
    lab = LabValue("OBS-1", "MOTILITY_PLACEHOLDER", 1.0, "%")
    result = evaluate(_inputs(catalogues, lab), catalogues.triage)
    assert result.risk_signals == () and result.floor is None
    assert result.action is TriageAction.NEEDS_MORE_INFORMATION
    assert result.limit_codes == ("LAB_REFERENCE_LIMITS_NOT_SUPPLIED",)


def test_lab_below_reference_uses_catalogue_limits_once_supplied(catalogues: Catalogues) -> None:
    limits = {"MOTILITY_PLACEHOLDER": {"unit": "%", "lower_limit": 10.0}}  # TEST-ONLY value
    triage = _with_parameters(catalogues, "DRAFT-LAB-BELOW-REF-01", reference_lower_limits=limits)
    below = evaluate(_inputs(catalogues, LabValue("O", "MOTILITY_PLACEHOLDER", 5.0, "%")), triage)
    assert below.floor is TriageAction.SPECIALIST and below.limit_codes == ()
    above = evaluate(_inputs(catalogues, LabValue("O", "MOTILITY_PLACEHOLDER", 50.0, "%")), triage)
    assert above.floor is None


def test_no_sperm_rule_sets_the_priority_review_floor(catalogues: Catalogues) -> None:
    lab = LabValue("OBS-1", "CONCENTRATION_PLACEHOLDER", 0.0, "million/mL")
    result = evaluate(_inputs(catalogues, lab), catalogues.triage)
    assert result.floor is TriageAction.PRIORITY_REVIEW
    assert [s.code for s in result.risk_signals] == ["LAB_REPORTS_NO_SPERM"]


def test_bmi_cutoff_narrows_the_context_rule_once_supplied(catalogues: Catalogues) -> None:
    assert evaluate(_inputs(catalogues, bmi=21.0), catalogues.triage).context_question_ids
    triage = _with_parameters(catalogues, "DRAFT-BMI-CONTEXT-01", bmi_context_cutoff=25.0)
    assert evaluate(_inputs(catalogues, bmi=21.0), triage).risk_signals == ()
    assert evaluate(_inputs(catalogues, bmi=29.0), triage).risk_signals


def test_steroid_floor_holds_for_past_and_current_use(catalogues: Catalogues) -> None:
    """OD-06: both past and current use trigger the floor."""
    result = evaluate(_inputs(catalogues, anabolic_steroid_use=True), catalogues.triage)
    assert result.floor is TriageAction.SPECIALIST
    negative = evaluate(_inputs(catalogues, anabolic_steroid_use=False), catalogues.triage)
    assert negative.floor is None


def test_api_outputs_hold_no_diagnosis_or_probability(api: Api) -> None:
    """API support for TC-11.3 and TC-INV-06: scan every draft output across fixtures."""
    for fixture in ("J1-002", "J1-003", "J1-004", "J2-001", "J3-001"):
        if fixture == "J3-001":
            patient = api.assessing(fixture)
            observation = patient.get(patient.path("/observations")).json()["observations"][0]
            patient.post(patient.path(f"/observations/{observation['observation_id']}/confirm"))
            patient.assess("LAB_ONLY")
        else:
            patient = api.drafted(fixture, BODY_FAT_NOT_SURE) if fixture == "J1-002" else (
                api.drafted(fixture)
            )
        with api.db() as db:
            draft = db.query(Draft).filter_by(case_id=patient.case_id).one()
        text = (patient.report().text + draft.content_json).lower()
        for phrase in FORBIDDEN:
            assert phrase not in text, (fixture, phrase)
        # The one sentence about children is the exact statement AC-15.3 requires.
        assert "children" not in text.replace(REQUIRED_LAB_STATEMENT, ""), fixture
