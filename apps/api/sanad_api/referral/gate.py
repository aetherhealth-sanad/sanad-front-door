"""Referral gate as policy-as-code (RF-12, HR-10, HR-11).

`evaluate_gate` is a pure function: no I/O and no early return, so it collects every failing
code and can be driven through the whole truth table, including combinations the state machine
never reaches (plan section 4.3). It denies by default: ALLOW needs all three conditions.

1. User consent: `provider_share` is active at this moment.
2. Clinician approval: the latest decision is a simulated approval on the current case version
   and the current report hash, and it has not expired (HR-11). Anything else is
   APPROVAL_MISSING, APPROVAL_REJECTED or APPROVAL_STALE.
3. Backend policy: the case is NAVIGATION_STARTED, the triage is eligible, the case is
   synthetic, it has no referral yet and the target is in the mock directory.

The caller's role is checked before the gate runs (API design section 2, checks 1 to 3), so a
caller without access never sees gate details. That is the RBAC part of HR-10.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sanad_api.cases.state_machine import CaseState
from sanad_api.consent.service import ScopeStatus
from sanad_api.vocab import TriageAction

POLICY_VERSION = "gate-0.1"
ELIGIBLE_TRIAGE = frozenset(
    {TriageAction.PRIMARY_CARE, TriageAction.SPECIALIST, TriageAction.PRIORITY_REVIEW}
)


@dataclass(frozen=True)
class DecisionSnapshot:
    decision: str  # APPROVE, EDIT, REJECT or REQUEST_CLARIFICATION
    kind: str | None
    case_version: int
    report_hash: str | None
    expires_at: datetime | None


@dataclass(frozen=True)
class GateInputs:
    provider_share: ScopeStatus
    latest_decision: DecisionSnapshot | None
    case_version: int
    report_hash: str | None
    case_state: str
    triage_action: str | None
    is_synthetic: bool
    referral_exists: bool
    target_mock_facility_id: str | None
    mock_directory_ids: frozenset[str]
    now: datetime


@dataclass(frozen=True)
class GateDecision:
    allow: bool
    reason_codes: tuple[str, ...]
    user_consent_passed: bool
    approval_passed: bool
    approval_kind: str | None
    approval_case_version: int | None
    policy_passed: bool
    target_checked: bool
    evaluated_at: datetime
    policy_version: str = POLICY_VERSION

    def to_json(self) -> dict[str, Any]:
        return {
            "decision": "ALLOW" if self.allow else "DENY",
            "conditions": {
                "user_consent": {"passed": self.user_consent_passed, "scope": "provider_share"},
                "clinician_approval": {
                    "passed": self.approval_passed,
                    "kind": self.approval_kind,
                    "case_version": self.approval_case_version,
                },
                "backend_policy": {
                    "passed": self.policy_passed,
                    "target_checked": self.target_checked,
                },
            },
            "reason_codes": list(self.reason_codes),
            "policy_version": self.policy_version,
            "is_mock": True,
            "evaluated_at": self.evaluated_at,
        }


def evaluate_gate(g: GateInputs) -> GateDecision:
    consent_codes: list[str] = []
    if g.provider_share is ScopeStatus.REVOKED:
        consent_codes.append("CONSENT_PROVIDER_SHARE_REVOKED")
    elif g.provider_share is not ScopeStatus.ACTIVE:
        consent_codes.append("CONSENT_PROVIDER_SHARE_MISSING")

    approval_codes: list[str] = []
    decision = g.latest_decision
    if decision is None or decision.decision not in ("APPROVE", "REJECT"):
        approval_codes.append("APPROVAL_MISSING")  # never reviewed, or edited or sent back since
    elif decision.decision == "REJECT":
        approval_codes.append("APPROVAL_REJECTED")
    elif (
        decision.case_version != g.case_version
        or decision.report_hash is None
        or decision.report_hash != g.report_hash
        or decision.expires_at is None
        or g.now > decision.expires_at
    ):
        approval_codes.append("APPROVAL_STALE")
    approval = decision if decision is not None and decision.decision == "APPROVE" else None

    policy_codes: list[str] = []
    if g.case_state != CaseState.NAVIGATION_STARTED:
        policy_codes.append("STATE_NOT_ELIGIBLE")
    if g.triage_action not in ELIGIBLE_TRIAGE:
        policy_codes.append("TRIAGE_NOT_ELIGIBLE")
    if not g.is_synthetic:
        policy_codes.append("CASE_NOT_SYNTHETIC")
    if g.referral_exists:
        policy_codes.append("REFERRAL_ALREADY_EXISTS")
    target_checked = g.target_mock_facility_id is not None
    if target_checked and g.target_mock_facility_id not in g.mock_directory_ids:
        policy_codes.append("TARGET_NOT_IN_MOCK_DIRECTORY")

    codes = (*consent_codes, *approval_codes, *policy_codes)
    return GateDecision(
        allow=not codes,
        reason_codes=codes,
        user_consent_passed=not consent_codes,
        approval_passed=not approval_codes,
        approval_kind=approval.kind if approval else None,
        approval_case_version=approval.case_version if approval else None,
        policy_passed=not policy_codes,
        target_checked=target_checked,
        evaluated_at=g.now,
    )
