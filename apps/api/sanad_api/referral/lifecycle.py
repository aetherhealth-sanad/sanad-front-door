"""Mock referral lifecycle (product spec section 5.3, CC-003).

The case waits in REFERRAL_REQUESTED while this runs, and moves to CLOSED when the referral
reaches an end state. MOCK_CLOSED means the mock facility finished with the demo case. It does
not mean care took place. No status here, or anywhere, claims verified care (AC-13.3).
"""

from enum import StrEnum


class MockStatus(StrEnum):
    MOCK_SENT = "MOCK_SENT"
    MOCK_RECEIVED = "MOCK_RECEIVED"
    MOCK_ACCEPTED = "MOCK_ACCEPTED"
    MOCK_REJECTED = "MOCK_REJECTED"
    MOCK_APPOINTMENT_SCHEDULED = "MOCK_APPOINTMENT_SCHEDULED"
    MOCK_CLOSED = "MOCK_CLOSED"
    MOCK_WITHDRAWN = "MOCK_WITHDRAWN"


M = MockStatus

LIFECYCLE: dict[MockStatus, frozenset[MockStatus]] = {
    M.MOCK_SENT: frozenset({M.MOCK_RECEIVED, M.MOCK_WITHDRAWN}),
    M.MOCK_RECEIVED: frozenset({M.MOCK_ACCEPTED, M.MOCK_REJECTED, M.MOCK_WITHDRAWN}),
    M.MOCK_ACCEPTED: frozenset({M.MOCK_APPOINTMENT_SCHEDULED, M.MOCK_CLOSED, M.MOCK_WITHDRAWN}),
    M.MOCK_APPOINTMENT_SCHEDULED: frozenset({M.MOCK_CLOSED, M.MOCK_WITHDRAWN}),
    M.MOCK_REJECTED: frozenset(),
    M.MOCK_CLOSED: frozenset(),
    M.MOCK_WITHDRAWN: frozenset(),
}

END_STATES = frozenset({M.MOCK_REJECTED, M.MOCK_CLOSED, M.MOCK_WITHDRAWN})
LIVE_STATES = frozenset(set(M) - END_STATES)
# The facility may post these. MOCK_SENT and MOCK_WITHDRAWN are set by the system only.
FACILITY_STATUSES = frozenset(
    {M.MOCK_RECEIVED, M.MOCK_ACCEPTED, M.MOCK_REJECTED, M.MOCK_APPOINTMENT_SCHEDULED, M.MOCK_CLOSED}
)


def can_move(current: MockStatus, target: MockStatus) -> bool:
    return target in LIFECYCLE[current]
