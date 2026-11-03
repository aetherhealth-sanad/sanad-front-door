"""Versioned catalogues: rules, questions, lab tests, consent text, mock directory, upload schema
and synthetic samples.

Rule logic reads its thresholds and wording from these files and never from code (HR-04). The
loader checks that the files agree with each other, so a broken catalogue stops the API at
start-up instead of surfacing mid-journey.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from sanad_api.vocab import ConsentScope, FieldState, TriageAction

EMERGENCY_FILE = "rules/emergency.draft-0.1.json"
TRIAGE_FILE = "rules/triage.draft-0.1.json"
QUESTIONS_FILE = "catalogue/questions.draft-0.1.json"
LAB_TESTS_FILE = "catalogue/lab-tests.draft-0.1.json"
CONSENT_FILE = "catalogue/consent-0.1.json"
MOCK_DIRECTORY_FILE = "catalogue/mock-directory-0.1.json"
UPLOAD_SCHEMA_FILE = "schemas/upload-profile.schema.json"
FIXTURES_DIR = "data/synthetic/assessments"
FIXTURE_MANIFEST_FILE = "data/synthetic/fixture-manifest.v0.4.json"

SAFETY_RESPONSES = frozenset({"YES", "NO", "NOT_SURE", "PREFER_NOT_TO_ANSWER"})


class CatalogueError(ValueError):
    pass


class _Frozen(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ResponseValue(_Frozen):
    state: FieldState
    value: bool | None


class EmergencyQuestion(_Frozen):
    question_id: str
    concept_code: str
    text: str


class EmergencyRule(_Frozen):
    rule_id: str
    version: str
    approval_status: str
    concept_code: str
    trigger_values: tuple[bool, ...]
    source: str


class EmergencyCatalogue(_Frozen):
    catalogue_id: Literal["emergency"]
    catalogue_version: str
    approval_status: str
    is_simulated: bool
    status_note: str
    disclosure: str
    response_values: dict[str, ResponseValue]
    questions: tuple[EmergencyQuestion, ...]
    rules: tuple[EmergencyRule, ...]


class EvidenceRef(_Frozen):
    source_id: str
    version: str
    verification: Literal["VERIFIED", "PENDING"]


class TriageRule(_Frozen):
    rule_id: str
    kind: Literal["FACT_STATE", "BMI_CONTEXT", "LAB_BELOW_REFERENCE", "LAB_EQUALS"]
    concept_code: str | None = None
    match_states: tuple[FieldState, ...] = ()
    test_codes: tuple[str, ...] = ()
    equals: float | None = None
    parameters: dict[str, Any] = {}
    parameters_status: str | None = None
    parameters_note: str | None = None
    signal: str
    floor: TriageAction | None
    context_question_ids: tuple[str, ...] = ()
    patient_explanation: str
    evidence_refs: tuple[EvidenceRef, ...]
    source: str


class TriageCatalogue(_Frozen):
    catalogue_id: Literal["triage"]
    rule_version: str
    approval_status: str
    status_note: str
    action_rank: dict[TriageAction, int]
    action_rank_note: str
    default_action: TriageAction
    action_labels: dict[TriageAction, str]
    rules: tuple[TriageRule, ...]


class ConceptDef(_Frozen):
    value_type: Literal["BOOLEAN", "INTEGER", "NUMBER", "CHOICE"]
    unit: str | None = None
    minimum: float | None = None
    maximum: float | None = None
    temporal: bool = False
    options: dict[str, Literal["AFFIRMED", "NEGATED"]] = {}
    evidence_item: str | None = None


class AnswerOption(_Frozen):
    value: bool | str
    label: str


class QuestionDef(_Frozen):
    question_id: str
    concept_code: str
    text: str
    required: bool = False
    options: tuple[AnswerOption, ...] = ()
    temporal_options: tuple[AnswerOption, ...] = ()


class EvidenceItemDef(_Frozen):
    kind: Literal["HISTORY", "MEDICINES", "GENETICS_RESULT"]
    default_use: bool
    requires_scopes: tuple[ConsentScope, ...] = ()


class QuestionCatalogue(_Frozen):
    catalogue_id: Literal["questions"]
    catalogue_version: str
    approval_status: str
    copy_status: str
    status_note: str
    concepts: dict[str, ConceptDef]
    evidence_items: dict[str, EvidenceItemDef]
    questions: tuple[QuestionDef, ...]


class LabTestDef(_Frozen):
    label: str
    accepted_units: tuple[str, ...]
    maximum: float | None = None


class DerivedFact(_Frozen):
    concept_code: str
    value: bool


class LabCatalogue(_Frozen):
    catalogue_id: Literal["lab-tests"]
    catalogue_version: str
    approval_status: str
    status_note: str
    tests: dict[str, LabTestDef]
    reference_sources: tuple[str, ...]
    derived_fact: DerivedFact


class ConsentScopeText(_Frozen):
    scope: ConsentScope
    data_covered: str
    used_for: str
    who_sees_it: str
    if_off: str
    used_in_this_flow: bool


class ConsentCatalogue(_Frozen):
    consent_version: str
    copy_status: str
    status_note: str
    scopes: tuple[ConsentScopeText, ...]


class MockFacilityDef(_Frozen):
    mock_facility_id: str
    name: str
    care_type: TriageAction


class MockDirectory(_Frozen):
    directory_version: str
    is_mock: Literal[True]
    status_note: str
    facilities: tuple[MockFacilityDef, ...]


class FixtureMetadata(_Frozen):
    fixture_id: str
    scenario: str
    is_synthetic: Literal[True]
    title: str
    description: str
    listed_as_sample: bool
    notes: str = ""
    journey: dict[str, Any] = {}


class FixtureMeasurement(_Frozen):
    test_code: str | None
    unit: str | None
    value_source: Literal["SYNTHETIC_FIXTURE"]
    reference_range_status: Literal["NOT_PROVIDED"]
    reference_source_status: Literal["NOT_VERIFIED"]


class FixtureManifestEntry(_Frozen):
    fixture_id: str
    scenario: str
    is_synthetic: Literal[True]
    source_files: tuple[str, ...]
    generator_version: str
    generator_seed: int | None
    reproducibility: str
    clinical_review_status: Literal["NOT_CLINICALLY_REVIEWED"]
    clinical_truth_status: Literal["NOT_EVALUATED"]
    clinical_range_source: str | None
    measurements: tuple[FixtureMeasurement, ...]


class FixtureManifest(_Frozen):
    manifest_version: str
    manifest_status: Literal["SYNTHETIC_PROVENANCE_ONLY"]
    fixture_count: int
    clinical_truth_status: Literal["NOT_EVALUATED"]
    fixtures: tuple[FixtureManifestEntry, ...]


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@dataclass(frozen=True)
class Sample:
    metadata: FixtureMetadata
    directory: Path

    def profile(self) -> dict[str, Any]:
        """The sample in upload-profile form: intake.json plus observations.json if present."""
        profile: dict[str, Any] = read_json(self.directory / "intake.json")
        observations = self.directory / "observations.json"
        if observations.exists():
            profile = {**profile, "observations": read_json(observations)["observations"]}
        return profile


@dataclass(frozen=True)
class Catalogues:
    emergency: EmergencyCatalogue
    triage: TriageCatalogue
    questions: QuestionCatalogue
    lab_tests: LabCatalogue
    consent: ConsentCatalogue
    mock_directory: MockDirectory
    upload_schema: dict[str, Any]
    samples: dict[str, Sample]
    fixture_manifest: FixtureManifest
    # Intake concepts and emergency concepts together, and every question an answer may cite.
    concepts: dict[str, ConceptDef]
    answerable: dict[str, QuestionDef]

    @property
    def emergency_concepts(self) -> frozenset[str]:
        return frozenset(q.concept_code for q in self.emergency.questions)

    def intake_question(self, question_id: str) -> QuestionDef | None:
        for question in self.questions.questions:
            if question.question_id == question_id:
                return question
        return None


def load_catalogues(repo_root: Path) -> Catalogues:
    emergency = EmergencyCatalogue.model_validate(read_json(repo_root / EMERGENCY_FILE))
    triage = TriageCatalogue.model_validate(read_json(repo_root / TRIAGE_FILE))
    questions = QuestionCatalogue.model_validate(read_json(repo_root / QUESTIONS_FILE))
    lab_tests = LabCatalogue.model_validate(read_json(repo_root / LAB_TESTS_FILE))
    consent = ConsentCatalogue.model_validate(read_json(repo_root / CONSENT_FILE))
    mock_directory = MockDirectory.model_validate(read_json(repo_root / MOCK_DIRECTORY_FILE))
    upload_schema: dict[str, Any] = read_json(repo_root / UPLOAD_SCHEMA_FILE)
    fixture_manifest = FixtureManifest.model_validate(read_json(repo_root / FIXTURE_MANIFEST_FILE))

    yes_no = (AnswerOption(value=True, label="Yes"), AnswerOption(value=False, label="No"))
    concepts = dict(questions.concepts)
    answerable = {q.question_id: q for q in questions.questions}
    for eq in emergency.questions:
        concepts[eq.concept_code] = ConceptDef(value_type="BOOLEAN")
        answerable[eq.question_id] = QuestionDef(
            question_id=eq.question_id, concept_code=eq.concept_code, text=eq.text, options=yes_no
        )

    samples = _load_samples(repo_root / FIXTURES_DIR)
    manifest_ids = {entry.fixture_id for entry in fixture_manifest.fixtures}
    if manifest_ids != set(samples) or fixture_manifest.fixture_count != len(samples):
        raise CatalogueError("synthetic fixture manifest does not match fixture directories")
    for entry in fixture_manifest.fixtures:
        fixture_dir = repo_root / FIXTURES_DIR / entry.fixture_id
        expected_files = {
            path.relative_to(repo_root).as_posix() for path in fixture_dir.rglob("*.json")
        }
        if set(entry.source_files) != expected_files:
            raise CatalogueError(
                f"synthetic fixture manifest file list is stale: {entry.fixture_id}"
            )

    catalogues = Catalogues(
        emergency=emergency,
        triage=triage,
        questions=questions,
        lab_tests=lab_tests,
        consent=consent,
        mock_directory=mock_directory,
        upload_schema=upload_schema,
        samples=samples,
        fixture_manifest=fixture_manifest,
        concepts=concepts,
        answerable=answerable,
    )
    _check_consistency(catalogues)
    return catalogues


def _load_samples(fixtures_dir: Path) -> dict[str, Sample]:
    samples: dict[str, Sample] = {}
    if not fixtures_dir.exists():
        return samples
    for directory in sorted(p for p in fixtures_dir.iterdir() if p.is_dir()):
        metadata = FixtureMetadata.model_validate(read_json(directory / "metadata.json"))
        if metadata.fixture_id != directory.name:
            raise CatalogueError(f"fixture folder {directory.name} holds {metadata.fixture_id}")
        samples[metadata.fixture_id] = Sample(metadata=metadata, directory=directory)
    return samples


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise CatalogueError(message)


def _check_consistency(c: Catalogues) -> None:
    q = c.questions
    question_ids = {question.question_id for question in q.questions}
    for question in q.questions:
        _require(question.concept_code in q.concepts, f"{question.question_id}: unknown concept")
    for code, concept in q.concepts.items():
        _require(
            concept.evidence_item is None or concept.evidence_item in q.evidence_items,
            f"{code}: unknown evidence item",
        )
        _require(concept.value_type != "CHOICE" or bool(concept.options), f"{code}: no options")

    e = c.emergency
    _require(set(e.response_values) == SAFETY_RESPONSES, "emergency response values incomplete")
    emergency_concepts = {question.concept_code for question in e.questions}
    _require(not emergency_concepts & set(q.concepts), "emergency and intake concepts overlap")
    for rule in e.rules:
        _require(rule.concept_code in emergency_concepts, f"{rule.rule_id}: unknown concept")

    t = c.triage
    _require(set(t.action_rank) == set(TriageAction), "action_rank must rank every action")
    _require(set(t.action_labels) == set(TriageAction), "action_labels must label every action")
    for triage_rule in t.rules:
        _check_triage_rule(triage_rule, c, question_ids)

    lab = c.lab_tests
    derived = q.concepts.get(lab.derived_fact.concept_code)
    _require(derived is not None and derived.value_type == "BOOLEAN", "derived lab fact concept")

    scopes = [text.scope for text in c.consent.scopes]
    _require(sorted(scopes) == sorted(ConsentScope), "consent text must cover the five scopes")

    ids = [f.mock_facility_id for f in c.mock_directory.facilities]
    _require(len(ids) == len(set(ids)), "mock facility ids must be unique")
    for facility in c.mock_directory.facilities:
        _require("Mock" in facility.name, f"{facility.mock_facility_id}: name must say Mock")

    defs = c.upload_schema["$defs"]
    _require(set(defs["concept_code"]["enum"]) == set(c.concepts), "schema concepts drifted")
    test_codes = defs["observation"]["properties"]["test_code"]["enum"]
    _require(set(test_codes) == set(lab.tests), "schema test codes drifted")


def _check_triage_rule(rule: TriageRule, c: Catalogues, question_ids: set[str]) -> None:
    if rule.kind in ("FACT_STATE", "BMI_CONTEXT"):
        _require(rule.concept_code in c.concepts, f"{rule.rule_id}: unknown concept")
    for question_id in rule.context_question_ids:
        _require(question_id in question_ids, f"{rule.rule_id}: unknown context question")
    if rule.kind == "BMI_CONTEXT":
        cutoff = rule.parameters.get("bmi_context_cutoff", "missing")
        _require(cutoff is None or isinstance(cutoff, int | float), f"{rule.rule_id}: cutoff")
    if rule.kind == "LAB_BELOW_REFERENCE":
        limits = rule.parameters.get("reference_lower_limits")
        _require(isinstance(limits, dict), f"{rule.rule_id}: reference_lower_limits")
        assert isinstance(limits, dict)
        for test_code, limit in limits.items():
            test = c.lab_tests.tests.get(test_code)
            _require(test is not None, f"{rule.rule_id}: unknown test {test_code}")
            assert test is not None
            _require(limit.get("unit") in test.accepted_units, f"{rule.rule_id}: unit")
            _require(isinstance(limit.get("lower_limit"), int | float), f"{rule.rule_id}: limit")
    if rule.kind == "LAB_EQUALS":
        _require(rule.equals is not None and bool(rule.test_codes), f"{rule.rule_id}: equals")
        for test_code in rule.test_codes:
            _require(test_code in c.lab_tests.tests, f"{rule.rule_id}: unknown test {test_code}")
