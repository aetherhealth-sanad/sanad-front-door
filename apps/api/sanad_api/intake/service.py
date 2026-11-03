"""Orchestrates the intake.

Order of work (HR-01, HR-02): every write of facts is followed at once by the emergency gate,
before anything else runs. The Gatekeeper and the rules run only when the user asks for an
assessment, and a resumed case gets the full rules again (HR-12). No step calls a model.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from jsonschema import Draft202012Validator, ValidationError
from sqlalchemy.orm import Session

from sanad_api.audit.log import AuditType, record
from sanad_api.cases.models import Case
from sanad_api.cases.state_machine import CaseEvent, CaseState, transition
from sanad_api.catalogues import Catalogues
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.facts.evidence import EvidenceItemView, evidence_items, excluded_concepts
from sanad_api.facts.models import Fact
from sanad_api.facts.service import (
    ConceptView,
    Supersede,
    build_views,
    current_facts,
    decode_value,
    from_state,
    from_value,
    mark_facts_changed,
    value_problem,
    write_fact,
)
from sanad_api.gatekeeper.service import GatekeeperResult, GatekeeperStatus
from sanad_api.gatekeeper.service import evaluate as evaluate_gatekeeper
from sanad_api.observations.models import Observation
from sanad_api.observations.service import ObservationFields, is_confirmed
from sanad_api.observations.service import create as create_observation
from sanad_api.observations.service import for_case as observations_for
from sanad_api.reports.drafts import DraftInputs, build_content
from sanad_api.reports.models import Draft
from sanad_api.reports.service import RULES, store_draft
from sanad_api.review.service import open_clarifications
from sanad_api.rules_engine.emergency import EmergencyResult, evaluate_values
from sanad_api.rules_engine.triage import LabValue, TriageInputs, TriageResult
from sanad_api.rules_engine.triage import evaluate as evaluate_triage
from sanad_api.vocab import EntryPath, FieldState, SourceType

MAX_UPLOAD_BYTES = 256 * 1024


def check_profile(data: object, schema: dict[str, Any]) -> dict[str, Any]:
    """Validates an upload against the closed schema. Errors name the rule broken and repeat
    none of the file's content (AC-02.5)."""
    if not isinstance(data, dict):
        raise ApiError(422, ErrorCode.UPLOAD_SCHEMA_INVALID)
    if data.get("is_synthetic") is not True:
        raise ApiError(422, ErrorCode.UPLOAD_NOT_SYNTHETIC)
    errors = list(Draft202012Validator(schema).iter_errors(data))
    if any(_is_unknown_field(error) for error in errors):
        raise ApiError(422, ErrorCode.UPLOAD_UNKNOWN_FIELD)
    if errors:
        raise ApiError(422, ErrorCode.UPLOAD_SCHEMA_INVALID)
    return data


def _is_unknown_field(error: ValidationError) -> bool:
    if error.validator == "additionalProperties":
        return True
    return any(_is_unknown_field(child) for child in error.context or [])


def apply_profile(
    db: Session,
    case: Case,
    profile: dict[str, Any],
    source: SourceType,
    catalogues: Catalogues,
    now: datetime,
) -> None:
    """Loads a checked profile. Rows that disagree are all kept (AC-06.3)."""
    for response in profile["responses"]:
        code = response["concept_code"]
        if "state" in response:
            if response["state"] == FieldState.NOT_ASKED:
                continue  # NOT_ASKED is the absence of a fact
            fact = from_state(code, FieldState(response["state"]))
        else:
            concept = catalogues.concepts[code]
            temporal = response.get("temporal_status")
            problem = value_problem(concept, response["value"], temporal)
            if problem is not None:
                raise ApiError(422, ErrorCode.UPLOAD_SCHEMA_INVALID, [problem])
            fact = from_value(code, concept, response["value"], temporal)
        write_fact(db, case.case_id, fact, source, now, Supersede.NONE)
    for item in profile.get("observations", []):
        create_observation(
            db,
            case.case_id,
            ObservationFields(
                test_code=item["test_code"],
                value=item.get("value"),
                unit=item.get("unit"),
                collected_on=item.get("collected_on"),
                reference_source=item.get("reference_source"),
            ),
            source,
            catalogues.lab_tests,
            now,
        )
    case.profile_applied = True
    mark_facts_changed(case, now)


def emergency_gate(
    db: Session, case: Case, catalogues: Catalogues, actor: str, now: datetime
) -> EmergencyResult:
    """Runs the emergency rules over every current fact. A trigger moves the case at once."""
    values: dict[str, list[object]] = {}
    for fact in current_facts(db, case.case_id):
        if fact.concept_code in catalogues.emergency_concepts:
            value = decode_value(fact)
            if value is not None:
                values.setdefault(fact.concept_code, []).append(value)
    result = evaluate_values(values, catalogues.emergency)
    if result.triggered:
        transition(db, case, CaseEvent.EMERGENCY_TRIGGER, actor, now)
    return result


def record_safety(
    db: Session,
    case: Case,
    result: EmergencyResult,
    outcome: str,
    origin: str,
    actor: str,
    now: datetime,
) -> None:
    """Rule IDs and catalogue version only, never the answers (AC-10.7)."""
    record(
        db,
        AuditType.SAFETY_CHECKED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        rule_ids=list(result.rule_ids),
        catalogue_version=result.catalogue_version,
        result=outcome,
        origin=origin,
    )


@dataclass(frozen=True)
class AssessmentContext:
    facts: list[Fact]
    views: dict[str, ConceptView]
    items: list[EvidenceItemView]
    excluded: frozenset[str]
    observations: list[Observation]
    used_observation_ids: frozenset[str]
    triage_inputs: TriageInputs


def assessment_context(db: Session, case: Case, catalogues: Catalogues) -> AssessmentContext:
    facts = current_facts(db, case.case_id)
    views = build_views(facts, catalogues.concepts)
    items = evidence_items(db, case.case_id, facts, catalogues)
    excluded = frozenset(excluded_concepts(db, case.case_id, facts, catalogues))
    observations = observations_for(db, case.case_id)
    # Only values the user confirmed reach the assessment (AC-15.2).
    used = [o for o in observations if is_confirmed(o) and o.value is not None and o.unit]
    lab_values = tuple(
        LabValue(o.observation_id, o.test_code, float(o.value or 0), o.unit or "") for o in used
    )
    used_views = {code: view for code, view in views.items() if code not in excluded}
    return AssessmentContext(
        facts=facts,
        views=views,
        items=items,
        excluded=excluded,
        observations=observations,
        used_observation_ids=frozenset(o.observation_id for o in used),
        triage_inputs=TriageInputs(views=used_views, lab_values=lab_values),
    )


def gatekeeper_for(
    db: Session,
    case: Case,
    ctx: AssessmentContext,
    catalogues: Catalogues,
    entry_path: EntryPath,
    include_optional: bool,
) -> tuple[GatekeeperResult, TriageResult]:
    triage = evaluate_triage(ctx.triage_inputs, catalogues.triage)
    result = evaluate_gatekeeper(
        questions=catalogues.questions.questions,
        views=ctx.views,
        entry_path=entry_path,
        excluded_concepts=ctx.excluded,
        context_question_ids=triage.context_question_ids,
        clarification_question_ids={c.question_id for c in open_clarifications(db, case.case_id)},
        include_optional=include_optional,
    )
    return result, triage


@dataclass(frozen=True)
class AssessOutcome:
    gatekeeper: GatekeeperResult | None
    triage: TriageResult | None
    draft: Draft | None
    emergency: EmergencyResult | None


def assess(
    db: Session,
    case: Case,
    entry_path: EntryPath,
    catalogues: Catalogues,
    actor: str,
    now: datetime,
) -> AssessOutcome:
    state = CaseState(case.state)
    if state is CaseState.NEEDS_INFORMATION:
        transition(db, case, CaseEvent.INFORMATION_CORRECTED, actor, now)
    elif state is CaseState.REVISION_REQUIRED:
        transition(db, case, CaseEvent.REVISION_UPDATED, actor, now)

    emergency = emergency_gate(db, case, catalogues, actor, now)
    if emergency.triggered:
        record_safety(db, case, emergency, "EMERGENCY_GUIDANCE_ISSUED", "ASSESS", actor, now)
        return AssessOutcome(None, None, None, emergency)

    ctx = assessment_context(db, case, catalogues)
    if entry_path is EntryPath.LAB_ONLY and not ctx.used_observation_ids:
        raise ApiError(409, ErrorCode.BLOCKING_ITEMS_REMAIN, ["NO_CONFIRMED_OBSERVATION"])
    gatekeeper, triage = gatekeeper_for(db, case, ctx, catalogues, entry_path, False)
    if gatekeeper.status is not GatekeeperStatus.READY_FOR_ASSESSMENT:
        transition(db, case, CaseEvent.INFORMATION_MISSING, actor, now)
        return AssessOutcome(gatekeeper, None, None, None)

    listed = {item.item_id: item for item in ctx.items}
    genetics = listed.get("ITEM-GENETICS-RESULT")
    content = build_content(
        DraftInputs(
            case_version=case.case_version,
            entry_path=entry_path,
            views=ctx.views,
            excluded_concepts=ctx.excluded,
            excluded_item_ids=tuple(item.item_id for item in ctx.items if not item.use),
            observations=tuple(ctx.observations),
            used_observation_ids=ctx.used_observation_ids,
            triage=triage,
            gatekeeper_status=gatekeeper.status.value,
            genetics_support_available=(
                genetics is not None
                and genetics.used_in_assessment
                and ctx.views["genetics_result_available"].state is FieldState.KNOWN_POSITIVE
            ),
        ),
        catalogues,
    )
    draft = store_draft(db, case, content, RULES, now)
    record(
        db,
        AuditType.ASSESSED,
        actor=actor,
        now=now,
        case_id=case.case_id,
        case_version=case.case_version,
        rule_ids=list(triage.hit_rule_ids),
        rule_version=triage.rule_version,
        gatekeeper_status=gatekeeper.status.value,
    )
    return AssessOutcome(gatekeeper, triage, draft, None)
