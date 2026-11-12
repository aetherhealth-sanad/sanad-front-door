"""Deterministic input guardrails for the structured, synthetic-only API.

This API currently accepts structured questionnaire/profile data, not conversational free text.
Clinical urgency remains the versioned emergency catalogue in `rules_engine.emergency`; this
module performs only format/schema checks and never classifies clinical scope or urgency.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from jsonschema import Draft202012Validator, ValidationError


class InputDisposition(StrEnum):
    ACCEPTED = "ACCEPTED"
    NEEDS_CORRECTION = "NEEDS_CORRECTION"


@dataclass(frozen=True)
class InputGuardrailDecision:
    disposition: InputDisposition
    reason_codes: tuple[str, ...]


def _has_unknown_field(error: ValidationError) -> bool:
    if error.validator == "additionalProperties":
        return True
    return any(_has_unknown_field(child) for child in error.context or [])


def evaluate_profile_input(data: object, schema: dict[str, Any]) -> InputGuardrailDecision:
    """Checks an already-decoded synthetic profile without echoing its submitted values."""
    if not isinstance(data, dict):
        return InputGuardrailDecision(InputDisposition.NEEDS_CORRECTION, ("PROFILE_NOT_OBJECT",))
    if data.get("is_synthetic") is not True:
        return InputGuardrailDecision(InputDisposition.NEEDS_CORRECTION, ("NOT_SYNTHETIC",))

    errors = list(Draft202012Validator(schema).iter_errors(data))
    if not errors:
        return InputGuardrailDecision(InputDisposition.ACCEPTED, ())
    if any(_has_unknown_field(error) for error in errors):
        return InputGuardrailDecision(InputDisposition.NEEDS_CORRECTION, ("UNKNOWN_FIELD",))
    return InputGuardrailDecision(InputDisposition.NEEDS_CORRECTION, ("SCHEMA_INVALID",))
