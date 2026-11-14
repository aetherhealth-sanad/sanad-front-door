"""Response models shared by several routers. They define the generated OpenAPI contract.

The API has no field for a diagnosis, a personal probability or `obesity_confirmed` (INV-06).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

FactValue = bool | int | float | str | None


class CaseStateOut(BaseModel):
    case_id: str
    state: str
    case_version: int
    route: str
    allowed_actions: list[str]


class RiskSignalOut(BaseModel):
    code: str
    source_field: str
    status: str
    rule_id: str


class TriageProposalOut(BaseModel):
    action: str
    floor: str | None
    rule_ids: list[str]
    rule_version: str
    approval_status: str


class CitationOut(BaseModel):
    source_id: str
    version: str
    # RF-22: present only for a TEAM_CURATED claim.
    passage_id: str | None = None
    title: str | None = None
    locator: str | None = None
    url: str | None = None
    license: str | None = None
    excerpt: str | None = None
    review_status: str | None = None
    review_note: str | None = None


class EvidenceOut(BaseModel):
    claim_id: str
    rule_id: str
    status: str
    citation: CitationOut | None


class LimitOut(BaseModel):
    code: str
    text: str


class KnownFactOut(BaseModel):
    concept_code: str
    value: FactValue
    unit: str | None
    polarity: str | None
    temporal_status: str | None
    source_type: str
    verification_status: str


class UnknownFieldOut(BaseModel):
    concept_code: str
    state: str


class ReportObservationOut(BaseModel):
    test_code: str
    value: float | None
    unit: str | None
    collected_on: str | None
    reference_source: str | None
    source: str
    confirmation_status: str
    issues: list[str]
    used_in_assessment: bool


class ObservationOut(BaseModel):
    observation_id: str
    kind: str
    test_code: str
    value: float | None
    unit: str | None
    collected_on: str | None
    reference_source: str | None
    source: str
    confirmation_status: str
    issues: list[str]
    used_in_assessment: bool | None = None


class FactOut(BaseModel):
    fact_id: str
    concept_code: str
    value: FactValue
    unit: str | None
    state: str
    polarity: str | None
    temporal_status: str | None
    source_type: str
    verification_status: str
    recorded_at: datetime


class FlagOut(BaseModel):
    flag: Literal["DELAYED"]
    stage: str
    waiting_since: datetime
    threshold_seconds: int
    threshold_kind: Literal["MOCK_WORKFLOW_TIMER"]


class UserConsentCondition(BaseModel):
    passed: bool
    scope: str


class ApprovalCondition(BaseModel):
    passed: bool
    kind: str | None
    case_version: int | None


class PolicyCondition(BaseModel):
    passed: bool
    target_checked: bool


class GateConditions(BaseModel):
    user_consent: UserConsentCondition
    clinician_approval: ApprovalCondition
    backend_policy: PolicyCondition


class GateDecisionOut(BaseModel):
    decision: Literal["ALLOW", "DENY"]
    conditions: GateConditions
    reason_codes: list[str]
    policy_version: str
    is_mock: bool
    evaluated_at: datetime


class ReferralOut(BaseModel):
    referral_id: str
    case_id: str
    case_version: int
    status: str
    mock_status: str
    care_type: str
    target_mock_facility_id: str
    is_mock: bool
    created_at: datetime


class MockAppointmentOut(BaseModel):
    starts_at: datetime
    label: str


class ReferralEventOut(BaseModel):
    event_id: str
    referral_id: str
    mock_status: str
    reason_code: str | None
    mock_appointment: MockAppointmentOut | None
    occurred_at: datetime
    recorded_at: datetime
    actor: str
    verification_source: str
    verification_status: str
    is_mock: bool
