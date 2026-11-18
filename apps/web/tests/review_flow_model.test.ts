/**
 * Reviewer, Mock facility and /referral display rules (RF-08, RF-12, RF-13, RF-14).
 * These are unit and source checks. The browser walk-through is still a manual check.
 * Passing tests show the software behaves as specified on synthetic data. They are not
 * evidence of clinical safety or validity.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  delayedFlagText,
  facilityNextEvents,
  gateConditionViews,
  MOCK_APPOINTMENT_LABEL,
  MOCK_FACILITY_BANNER,
  SIMULATED_REVIEW_BANNER,
} from '../src/pages/reviewFlowModel.ts';
import type { GateDecision } from '../src/api/client.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.resolve(__dirname, '..', 'src', 'pages');
const source = (name: string) => fs.readFileSync(path.join(PAGES, name), 'utf8');

function gate(overrides: Partial<GateDecision> = {}): GateDecision {
  return {
    decision: 'DENY',
    conditions: {
      user_consent: { passed: false, scope: 'provider_share' },
      clinician_approval: { passed: true, kind: 'SIMULATED_APPROVAL', case_version: 4 },
      backend_policy: { passed: true, target_checked: true },
    },
    reason_codes: ['CONSENT_PROVIDER_SHARE_MISSING'],
    policy_version: 'gate-0.1',
    is_mock: true,
    evaluated_at: '2026-11-18T09:00:00Z',
    ...overrides,
  };
}

describe('TC-08.3 reviewer banner', () => {
  it('uses the exact spec text', () => {
    assert.equal(SIMULATED_REVIEW_BANNER, 'MOCK — SIMULATED REVIEW — NOT CLINICALLY APPROVED');
  });

  it('is rendered on the reviewer page and above the decision controls', () => {
    const page = source('ClinicianPortal.tsx');
    const uses = page.match(/<SimulationBanner text=\{SIMULATED_REVIEW_BANNER\} \/>/g) ?? [];
    assert.equal(uses.length, 2);
    assert.ok(
      page.indexOf('<SimulationBanner text={SIMULATED_REVIEW_BANNER} />', page.indexOf('Reviewer Decision Controls')) > 0,
    );
  });
});

describe('TC-08.2 reviewer detail shows evidence status and rule version', () => {
  it('renders evidence status, rule version and decision history', () => {
    const page = source('ClinicianPortal.tsx');
    assert.match(page, /Evidence status/);
    assert.match(page, /'no verified source'/);
    assert.match(page, /triage_proposal\.rule_version/);
    assert.match(page, /Decision history · Mock/);
  });
});

describe('TC-13.1 Mock facility banner', () => {
  it('uses the exact spec text on both the sign-in and console views', () => {
    assert.equal(MOCK_FACILITY_BANNER, 'Mock facility, not a real provider');
    const page = source('MockFacilityPortal.tsx');
    const uses = page.match(/<SimulationBanner text=\{MOCK_FACILITY_BANNER\} \/>/g) ?? [];
    assert.equal(uses.length, 2);
  });
});

describe('TC-13.5 Mock appointment wording', () => {
  it('matches the API label and is shown on scheduled events', () => {
    assert.equal(MOCK_APPOINTMENT_LABEL, 'Mock appointment, not a real booking');
    const apiSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'api', 'sanad_api', 'referral', 'service.py'),
      'utf8',
    );
    assert.ok(apiSource.includes(`MOCK_APPOINTMENT_LABEL = "${MOCK_APPOINTMENT_LABEL}"`));
    assert.match(source('MockFacilityPortal.tsx'), /event\.mock_appointment\.label/);
  });
});

describe('TC-13.3 facility actions never claim verified care', () => {
  const forbidden = ['PROVIDER_VERIFIED', 'CARE_COMPLETED', 'BOOKING_SELF_REPORTED', 'VISIT_SELF_REPORTED'];
  const states = [
    'MOCK_SENT',
    'MOCK_RECEIVED',
    'MOCK_ACCEPTED',
    'MOCK_APPOINTMENT_SCHEDULED',
    'MOCK_REJECTED',
    'MOCK_CLOSED',
    'MOCK_WITHDRAWN',
  ];

  it('offers only lifecycle moves and nothing from end states', () => {
    assert.deepEqual(
      Object.fromEntries(states.map(s => [s, facilityNextEvents(s).map(e => e.status)])),
      {
        MOCK_SENT: ['MOCK_RECEIVED'],
        MOCK_RECEIVED: ['MOCK_ACCEPTED', 'MOCK_REJECTED'],
        MOCK_ACCEPTED: ['MOCK_APPOINTMENT_SCHEDULED', 'MOCK_CLOSED'],
        MOCK_APPOINTMENT_SCHEDULED: ['MOCK_CLOSED'],
        MOCK_REJECTED: [],
        MOCK_CLOSED: [],
        MOCK_WITHDRAWN: [],
      },
    );
    for (const s of states) {
      for (const e of facilityNextEvents(s)) assert.ok(!forbidden.includes(e.status));
    }
  });
});

describe('TC-14.3 delayed flag wording', () => {
  it('reads the exact text for the 120 second default', () => {
    assert.equal(
      delayedFlagText({ threshold_seconds: 120 }),
      'Delayed: no Mock update for 2 min. Mock timer, not a clinical deadline.',
    );
  });

  it('does not attribute the delay to the user (TC-14.4)', () => {
    assert.doesNotMatch(delayedFlagText({ threshold_seconds: 90 }), /\byou\b|\byour\b/i);
  });
});

describe('TC-14.6 reviewer detail shows the same flag as the patient timeline', () => {
  it('both screens use the shared flag text', () => {
    assert.match(source('ClinicianPortal.tsx'), /delayedFlagText\(detail\.tracking_flag\)/);
    assert.match(source('TrackingScreen.tsx'), /delayedFlagText\(tracking\.flag\)/);
  });
});

describe('TC-12.6 /referral explains each gate condition', () => {
  it('lists three conditions with plain-language help for the failing one', () => {
    const views = gateConditionViews(gate());
    assert.deepEqual(views.map(v => [v.key, v.passed]), [
      ['user_consent', false],
      ['clinician_approval', true],
      ['backend_policy', true],
    ]);
    assert.match(views[0].help ?? '', /turn it on here/);
    assert.equal(views[1].help, null);
    assert.equal(views[2].help, null);
  });

  it('groups each reason code under its condition', () => {
    const views = gateConditionViews(
      gate({
        conditions: {
          user_consent: { passed: true, scope: 'provider_share' },
          clinician_approval: { passed: false, kind: null, case_version: null },
          backend_policy: { passed: false, target_checked: true },
        },
        reason_codes: ['APPROVAL_STALE', 'TRIAGE_NOT_ELIGIBLE'],
      }),
    );
    assert.match(views[1].help ?? '', /new Mock review/);
    assert.match(views[2].help ?? '', /does not use a referral/);
  });

  it('falls back to a plain message for an unknown code', () => {
    const views = gateConditionViews(gate({ reason_codes: ['SOMETHING_NEW'] }));
    assert.match(views[0].help ?? '', /Turn on sharing/);
  });

  it('lets the user grant provider_share on the screen', () => {
    const page = source('ReferralScreen.tsx');
    assert.match(page, /provider_share: true/);
    assert.match(page, /getReferralGate\(caseId, selectedFacilityId\)/);
  });
});
