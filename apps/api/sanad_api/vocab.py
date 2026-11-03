"""Shared vocabularies from the PRD and the referral-flow specs.

Changing a value here changes the label taxonomy, which needs change control (BRD section 17).
"""

from enum import StrEnum

SCREENING_NOTICE = "Screening, not diagnosis"
DRAFT_LABEL = "Draft, generated from draft rules"
WHO_APPROVES = "A simulated reviewer. No licensed clinician has approved this."


class FieldState(StrEnum):
    KNOWN_POSITIVE = "KNOWN_POSITIVE"
    KNOWN_NEGATIVE = "KNOWN_NEGATIVE"
    UNKNOWN = "UNKNOWN"
    NOT_ASKED = "NOT_ASKED"
    DECLINED = "DECLINED"
    CONFLICTING = "CONFLICTING"


KNOWN_STATES = frozenset({FieldState.KNOWN_POSITIVE, FieldState.KNOWN_NEGATIVE})


class Polarity(StrEnum):
    AFFIRMED = "AFFIRMED"
    NEGATED = "NEGATED"


class TemporalStatus(StrEnum):
    CURRENT = "CURRENT"
    PAST = "PAST"


class SourceType(StrEnum):
    SAMPLE_FIXTURE = "SAMPLE_FIXTURE"
    USER_UPLOADED = "USER_UPLOADED"
    PATIENT_REPORTED = "PATIENT_REPORTED"
    USER_ENTERED = "USER_ENTERED"


class VerificationStatus(StrEnum):
    UNVERIFIED = "UNVERIFIED"


class TriageAction(StrEnum):
    EMERGENCY_GUIDANCE = "EMERGENCY_GUIDANCE"
    PRIORITY_REVIEW = "PRIORITY_REVIEW"
    SPECIALIST = "SPECIALIST"
    PRIMARY_CARE = "PRIMARY_CARE"
    EDUCATION = "EDUCATION"
    NEEDS_MORE_INFORMATION = "NEEDS_MORE_INFORMATION"


class ConsentScope(StrEnum):
    ASSESSMENT = "assessment"
    CLINICIAN_REVIEW = "clinician_review"
    PROVIDER_SHARE = "provider_share"
    SPOUSE_SHARE = "spouse_share"
    RESEARCH_USE = "research_use"


class Role(StrEnum):
    PATIENT = "PATIENT"
    REVIEWER = "REVIEWER"
    MOCK_FACILITY = "MOCK_FACILITY"


class EntryPath(StrEnum):
    FULL_INTAKE = "FULL_INTAKE"
    LAB_ONLY = "LAB_ONLY"
