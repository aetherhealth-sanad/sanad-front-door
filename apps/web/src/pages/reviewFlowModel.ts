/**
 * Fixed wording and pure helpers for the Mock Reviewer, Mock Facility and /referral screens.
 * The server decides every action; these helpers only shape what the screens display.
 */
import type { GateDecision } from '../api/client';

/** AC-08.3, PRD Screen 7: exact banner on the reviewer queue, detail and decision views. */
export const SIMULATED_REVIEW_BANNER = 'MOCK — SIMULATED REVIEW — NOT CLINICALLY APPROVED';

/** AC-13.1: permanent banner on the Mock facility console. */
export const MOCK_FACILITY_BANNER = 'Mock facility, not a real provider';

/** AC-13.5: appointment wording. The API sends the same label on each scheduled event. */
export const MOCK_APPOINTMENT_LABEL = 'Mock appointment, not a real booking';

export interface DelayFlagView {
  flag: string;
  stage: string;
  threshold_seconds: number;
}

/** AC-14.3: one wording for the patient timeline and the reviewer detail (AC-14.6). */
export function delayedFlagText(flag: Pick<DelayFlagView, 'threshold_seconds'>): string {
  const seconds = flag.threshold_seconds;
  const span = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
  return `Delayed: no Mock update for ${span}. Mock timer, not a clinical deadline.`;
}

export type FacilityEventStatus =
  | 'MOCK_RECEIVED'
  | 'MOCK_ACCEPTED'
  | 'MOCK_REJECTED'
  | 'MOCK_APPOINTMENT_SCHEDULED'
  | 'MOCK_CLOSED';

/**
 * Next events the facility may record, mirroring the API lifecycle (product spec section 5.3).
 * MOCK_SENT and MOCK_WITHDRAWN are system-only, and end states offer nothing. The API still
 * returns 409 for any other move.
 */
export function facilityNextEvents(
  status: string | undefined,
): Array<{ status: FacilityEventStatus; label: string }> {
  switch (status) {
    case 'MOCK_SENT':
      return [{ status: 'MOCK_RECEIVED', label: 'Record Mock receipt' }];
    case 'MOCK_RECEIVED':
      return [
        { status: 'MOCK_ACCEPTED', label: 'Accept Mock referral' },
        { status: 'MOCK_REJECTED', label: 'Reject Mock referral' },
      ];
    case 'MOCK_ACCEPTED':
      return [
        { status: 'MOCK_APPOINTMENT_SCHEDULED', label: 'Schedule Mock appointment' },
        { status: 'MOCK_CLOSED', label: 'Close Mock workflow' },
      ];
    case 'MOCK_APPOINTMENT_SCHEDULED':
      return [{ status: 'MOCK_CLOSED', label: 'Close Mock workflow' }];
    default:
      return [];
  }
}

type GateConditionKey = 'user_consent' | 'clinician_approval' | 'backend_policy';

export interface GateConditionView {
  key: GateConditionKey;
  label: string;
  passed: boolean;
  /** Plain-language next step when the condition fails (AC-12.6). */
  help: string | null;
}

const CONDITION_LABELS: Record<GateConditionKey, string> = {
  user_consent: 'Your permission to share with the Mock facility (provider_share)',
  clinician_approval: 'Mock reviewer approval of this version',
  backend_policy: 'Case and destination checks',
};

const REASON_CONDITION: Record<string, GateConditionKey> = {
  CONSENT_PROVIDER_SHARE_MISSING: 'user_consent',
  CONSENT_PROVIDER_SHARE_REVOKED: 'user_consent',
  APPROVAL_MISSING: 'clinician_approval',
  APPROVAL_REJECTED: 'clinician_approval',
  APPROVAL_STALE: 'clinician_approval',
  STATE_NOT_ELIGIBLE: 'backend_policy',
  TRIAGE_NOT_ELIGIBLE: 'backend_policy',
  CASE_NOT_SYNTHETIC: 'backend_policy',
  REFERRAL_ALREADY_EXISTS: 'backend_policy',
  TARGET_NOT_IN_MOCK_DIRECTORY: 'backend_policy',
};

const REASON_HELP: Record<string, string> = {
  CONSENT_PROVIDER_SHARE_MISSING:
    'Sharing with the Mock facility is off. You can turn it on here. Nothing is sent until you tap Create Mock referral.',
  CONSENT_PROVIDER_SHARE_REVOKED:
    'You turned sharing with the Mock facility off. You can turn it on again here.',
  APPROVAL_MISSING: 'A Mock reviewer has not approved this draft yet.',
  APPROVAL_REJECTED: 'The Mock reviewer did not approve this draft, so it cannot be referred.',
  APPROVAL_STALE:
    'Your information changed after the Mock approval. The new version needs a new Mock review.',
  STATE_NOT_ELIGIBLE: 'This case is not at the referral step.',
  TRIAGE_NOT_ELIGIBLE:
    'The approved next step does not use a referral. Your result page still shows it.',
  CASE_NOT_SYNTHETIC: 'Only synthetic demo cases can create a Mock referral.',
  REFERRAL_ALREADY_EXISTS:
    'A Mock referral already exists for this case. Its status is on the tracking page.',
  TARGET_NOT_IN_MOCK_DIRECTORY: 'Choose a destination from the Mock directory.',
};

const FALLBACK_HELP: Record<GateConditionKey, string> = {
  user_consent: 'Turn on sharing with the Mock facility to continue.',
  clinician_approval: 'A current Mock reviewer approval is needed.',
  backend_policy: 'This case or destination cannot be used for a Mock referral.',
};

/** AC-12.6: the three gate conditions, whether each passes, and what the user can do. */
export function gateConditionViews(gate: GateDecision): GateConditionView[] {
  return (['user_consent', 'clinician_approval', 'backend_policy'] as const).map(key => {
    const passed = gate.conditions[key].passed;
    const help = gate.reason_codes
      .filter(code => REASON_CONDITION[code] === key)
      .map(code => REASON_HELP[code]);
    return {
      key,
      label: CONDITION_LABELS[key],
      passed,
      help: passed ? null : help.length > 0 ? help.join(' ') : FALLBACK_HELP[key],
    };
  });
}
