"""Writes audit events.

Each entry holds actor, time, event type, case ID, case version and the other relevant versions
(INV-09). Detail fields are whitelisted per event type, and every value must be a code, a number
or a list of codes, so answers, lab values, notes and other free text cannot be written (INV-03).
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from enum import StrEnum

from sqlalchemy.orm import Session

from sanad_api.audit.models import AuditEvent
from sanad_api.errors import ApiError, ErrorCode


class AuditType(StrEnum):
    CASE_CREATED = "CASE_CREATED"
    CONSENT_CHANGED = "CONSENT_CHANGED"
    CONSENT_DENIED = "CONSENT_DENIED"
    TRANSITION_DENIED = "TRANSITION_DENIED"
    SAFETY_CHECKED = "SAFETY_CHECKED"
    ASSESSED = "ASSESSED"
    REVIEW_REQUESTED = "REVIEW_REQUESTED"
    REVIEW_DECIDED = "REVIEW_DECIDED"
    GATE_EVALUATED = "GATE_EVALUATED"
    SHARE_DENIED = "SHARE_DENIED"
    REFERRAL_EVENT = "REFERRAL_EVENT"
    CASE_CLOSED = "CASE_CLOSED"
    SESSION_ENDED = "SESSION_ENDED"
    PSYCHOSOCIAL_CAPTURED = "PSYCHOSOCIAL_CAPTURED"
    NAVIGATION_ACKNOWLEDGED = "NAVIGATION_ACKNOWLEDGED"
    NAVIGATION_PROGRESS_RECORDED = "NAVIGATION_PROGRESS_RECORDED"
    NAVIGATION_BARRIER_RECORDED = "NAVIGATION_BARRIER_RECORDED"
    INPUT_CHECKED = "INPUT_CHECKED"
    MODEL_TASK_RUN = "MODEL_TASK_RUN"


ALLOWED_DETAILS: dict[AuditType, frozenset[str]] = {
    AuditType.CASE_CREATED: frozenset({"start_mode"}),
    AuditType.CONSENT_CHANGED: frozenset({"scope", "consent_version", "change"}),
    AuditType.CONSENT_DENIED: frozenset({"attempted_action", "scopes", "consent_version"}),
    AuditType.TRANSITION_DENIED: frozenset({"attempted_action", "state"}),
    AuditType.SAFETY_CHECKED: frozenset({"rule_ids", "catalogue_version", "result", "origin"}),
    AuditType.ASSESSED: frozenset({"rule_ids", "rule_version", "gatekeeper_status"}),
    AuditType.REVIEW_REQUESTED: frozenset({"review_request_id"}),
    AuditType.REVIEW_DECIDED: frozenset(
        {"review_id", "decision", "kind", "reason_code", "reviewer_type"}
    ),
    AuditType.GATE_EVALUATED: frozenset({"decision", "reason_codes", "policy_version"}),
    AuditType.SHARE_DENIED: frozenset(),
    AuditType.REFERRAL_EVENT: frozenset({"referral_id", "event_id", "mock_status"}),
    AuditType.CASE_CLOSED: frozenset({"closed_reason"}),
    AuditType.SESSION_ENDED: frozenset(),
    AuditType.PSYCHOSOCIAL_CAPTURED: frozenset({"count", "catalogue_version"}),
    AuditType.NAVIGATION_ACKNOWLEDGED: frozenset({"guidance_version"}),
    AuditType.NAVIGATION_PROGRESS_RECORDED: frozenset({"status", "verification_source"}),
    AuditType.NAVIGATION_BARRIER_RECORDED: frozenset({"count", "prefer_not_to_say"}),
    # Typed chat text (T4.5): reason codes and versions only, never the text (PRD-AC-54).
    AuditType.INPUT_CHECKED: frozenset({"result", "reason_code", "origin", "question_id"}),
    # The bounded task trace (PRD 4.7.2, NFR-21).
    AuditType.MODEL_TASK_RUN: frozenset(
        {
            "request_id",
            "task_id",
            "provider",
            "model_id",
            "prompt_version",
            "schema_version",
            "question_catalogue_version",
            "question_id",
            "status",
            "error_code",
            "outcome",
            "attempts",
            "elapsed_ms",
        }
    ),
}

_CODE = re.compile(r"^[A-Za-z0-9_.:\-]{1,80}$")
Detail = str | int | bool | None | list[str]


def _checked(key: str, value: Detail) -> Detail:
    if value is None or isinstance(value, bool | int):
        return value
    if isinstance(value, str) and _CODE.match(value):
        return value
    if isinstance(value, list) and all(isinstance(v, str) and _CODE.match(v) for v in value):
        return value
    raise ValueError(f"audit field {key} must hold codes only")


def record(
    db: Session,
    event_type: AuditType,
    *,
    actor: str,
    now: datetime,
    case_id: str | None = None,
    case_version: int | None = None,
    **details: Detail,
) -> AuditEvent:
    unknown = set(details) - ALLOWED_DETAILS[event_type]
    if unknown:
        raise ValueError(f"audit fields not allowed for {event_type}: {sorted(unknown)}")
    clean = {key: _checked(key, value) for key, value in details.items()}
    event = AuditEvent(
        event_type=event_type.value,
        case_id=case_id,
        case_version=case_version,
        actor=actor,
        occurred_at=now,
        details_json=json.dumps(clean, sort_keys=True),
    )
    db.add(event)
    return event


def deny_transition(
    db: Session,
    *,
    case_id: str,
    case_version: int,
    state: str,
    attempted_action: str,
    actor: str,
    now: datetime,
) -> ApiError:
    """Discards pending changes, records the refusal and returns the 409 to raise (AC-04.3)."""
    db.rollback()
    record(
        db,
        AuditType.TRANSITION_DENIED,
        actor=actor,
        now=now,
        case_id=case_id,
        case_version=case_version,
        attempted_action=attempted_action,
        state=state,
    )
    db.commit()
    return ApiError(409, ErrorCode.INVALID_TRANSITION)
