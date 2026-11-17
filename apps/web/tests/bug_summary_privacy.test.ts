import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');

import {
  buildReadableSummary,
  CANONICAL_CONSENT_SCOPES,
  createDefaultConsentDecisions,
  describeConsentSummary,
  mapConsentErrorToUserMessage,
  normalizeConsentDecisions,
  PLAIN_CONNECTION_ERROR,
} from '../src/pages/summaryModel.ts';
import type { ReportData } from '../src/api/client.ts';

function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    report_type: 'PATIENT',
    draft_label: 'Draft — not reviewed by a clinician',
    screening_notice: 'Screening, not diagnosis',
    review_status: 'SIMULATED_APPROVAL',
    is_mock: true,
    rule_version: 'triage-draft-0.1',
    rule_approval_status: 'CLINICAL_TBD',
    known: [
      {
        concept_code: 'age_years',
        value: 34,
        unit: 'years',
        polarity: 'AFFIRMED',
        temporal_status: null,
        source_type: 'PATIENT_REPORTED',
        verification_status: 'UNVERIFIED',
      },
      {
        concept_code: 'bmi',
        value: 28.5,
        unit: 'kg/m2',
        polarity: 'AFFIRMED',
        temporal_status: null,
        source_type: 'PATIENT_REPORTED',
        verification_status: 'UNVERIFIED',
      },
      {
        concept_code: 'anabolic_steroid_use',
        value: true,
        unit: null,
        polarity: 'AFFIRMED',
        temporal_status: 'PAST',
        source_type: 'PATIENT_REPORTED',
        verification_status: 'UNVERIFIED',
      },
    ],
    unknown: [
      { concept_code: 'smoking', state: 'NOT_ASKED' },
      { concept_code: 'type2_diabetes', state: 'DECLINED' },
      { concept_code: 'family_history_reported', state: 'UNKNOWN' },
    ],
    excluded_items: [],
    observations: [
      {
        test_code: 'CONCENTRATION_PLACEHOLDER',
        value: 14.2,
        unit: 'million/mL',
        collected_on: '2026-10-15',
        reference_source: 'Synthetic lab',
        source: 'PATIENT_ENTERED',
        confirmation_status: 'CONFIRMED_BY_USER',
        issues: [],
        used_in_assessment: true,
      },
    ],
    limits: [
      {
        code: 'DRAFT_RULES',
        text: 'These results come from draft rules that no clinician has approved.',
      },
      {
        code: 'NO_VERIFIED_EVIDENCE',
        text: 'No verified source supports these statements yet.',
      },
    ],
    why_next_step: 'Prior steroid use and BMI warrant a routine primary-care discussion.',
    who_approves: 'A simulated reviewer in this demo.',
    next_step: {
      action: 'PRIMARY_CARE',
      label: 'Discuss with a primary care doctor',
      is_mock: true,
    },
    next_step_withheld: null,
    evidence: [
      {
        claim_id: 'CLAIM-DRAFT-BMI-CONTEXT-01',
        rule_id: 'DRAFT-BMI-CONTEXT-01',
        status: 'INSUFFICIENT_EVIDENCE',
        citation: null,
      },
    ],
    required_statements: [
      'A result below a reference limit does not mean you cannot have children.',
    ],
    genetics_support_available: false,
    guidance_id: 'GUIDE-1',
    guidance_version: 'hash-1',
    psychosocial_context: [],
    psychosocial_context_use: 'CONTEXT_ONLY_NOT_TRIAGE',
    ...overrides,
  };
}

describe('Bug 1: Readable summary (TC-BUG-SUM-01..07)', () => {
  it('TC-BUG-SUM-01: Clicking the primary button opens the print view; no .json file is downloaded', () => {
    const resultSrc = fs.readFileSync(
      path.join(WEB_ROOT, 'src/pages/ResultScreen.tsx'),
      'utf-8',
    );
    assert.match(resultSrc, /data-testid="download-summary-pdf"/);
    assert.match(resultSrc, /Download my summary \(PDF\)/);
    assert.match(resultSrc, /onClick=\{handleOpenPrintSummary\}/);
    assert.match(resultSrc, /window\.print\(\)/);
    assert.match(resultSrc, /data-testid="printable-summary"/);

    // Ensure handleOpenPrintSummary does NOT call api.downloadSummary
    const handlerBlock = resultSrc.slice(
      resultSrc.indexOf('const handleOpenPrintSummary'),
      resultSrc.indexOf('const handleClosePrintSummary'),
    );
    assert.ok(!handlerBlock.includes('downloadSummary'));
  });

  it('TC-BUG-SUM-02: The JSON link still downloads the same JSON as before, and has help text for Upload profile', () => {
    const resultSrc = fs.readFileSync(
      path.join(WEB_ROOT, 'src/pages/ResultScreen.tsx'),
      'utf-8',
    );
    assert.match(resultSrc, /data-testid="download-summary-json"/);
    assert.match(resultSrc, /Save my answers to reuse next time \(\.json\)/);
    assert.match(resultSrc, /Upload profile/);
    assert.match(resultSrc, /not meant to be read/);
    assert.match(resultSrc, /api\.downloadSummary\(caseId\)/);
  });

  it('TC-BUG-SUM-03: A case in PENDING_REVIEW produces a summary with no level, judgment or level-specific next step', () => {
    const pendingReport = makeReport({
      review_status: 'NOT_SENT',
      why_next_step: null,
      next_step: null,
      next_step_withheld: 'PENDING_REVIEW',
    });
    const summary = buildReadableSummary(pendingReport, '2026-11-16');
    assert.equal(summary.isWithheld, true);
    assert.equal(
      summary.allowedNextStep,
      'A next step is withheld until the required review is complete.',
    );
    const serialized = JSON.stringify(summary);
    assert.ok(!serialized.includes('PENDING_REVIEW'));
    assert.ok(!serialized.includes('PRIMARY_CARE'));
    assert.ok(!serialized.includes('SPECIALIST'));
    assert.ok(!serialized.includes('PRIORITY_REVIEW'));
    assert.ok(!serialized.includes('Discuss with a primary care doctor'));
    assert.ok(!serialized.includes('Prior steroid use and BMI warrant'));
  });

  it('TC-BUG-SUM-04: A skipped or declined answer is printed as skipped or "Prefer not to say", never "No"', () => {
    const summary = buildReadableSummary(makeReport(), '2026-11-16');
    const byQuestion = Object.fromEntries(
      summary.whatYouToldUs.map(item => [item.question, item]),
    );
    const smoking = byQuestion['Do you smoke tobacco, or have you smoked in the past?'];
    const diabetes = byQuestion['Have you been told you have type 2 diabetes?'];
    const family =
      byQuestion["Do you know of any men's health conditions in your close family?"];

    assert.equal(smoking.answer, 'Skipped');
    assert.equal(smoking.status, 'Skipped');
    assert.notEqual(smoking.answer, 'No');

    assert.equal(diabetes.answer, 'Prefer not to say');
    assert.equal(diabetes.status, 'Prefer not to say');
    assert.notEqual(diabetes.answer, 'No');

    assert.equal(family.answer, 'Not sure');
    assert.equal(family.status, 'Not sure');
    assert.notEqual(family.answer, 'No');
  });

  it('TC-BUG-SUM-05: The summary contains "Screening, not diagnosis" and the synthetic-data line', () => {
    const summary = buildReadableSummary(makeReport(), '2026-11-16');
    assert.equal(summary.title, 'Sanad screening summary');
    assert.equal(summary.screeningNotice, 'Screening, not diagnosis');
    assert.equal(summary.prototypeNotice, 'Research prototype, synthetic data only');
    assert.equal(summary.pdfFileName, 'sanad-summary-2026-11-16.pdf');
    assert.equal(
      summary.emergencyText,
      'If symptoms are severe or sudden, call 998',
    );
  });

  it('TC-BUG-SUM-06: No internal codes appear in the summary', () => {
    const summary = buildReadableSummary(makeReport(), '2026-11-16');
    const text = JSON.stringify(summary);
    for (const forbidden of [
      'NO_VERIFIED_EVIDENCE',
      'CLAIM-DRAFT-',
      'INSUFFICIENT_EVIDENCE',
      'DRAFT_RULES',
      'SIMULATED_REVIEW',
      'PATIENT_REPORTED',
      'CONFIRMED_BY_USER',
      'CONCENTRATION_PLACEHOLDER',
      'PENDING_REVIEW',
      'CLINICAL_TBD',
    ]) {
      assert.ok(
        !text.includes(forbidden),
        `Expected summary not to contain internal code ${forbidden}`,
      );
    }
    assert.ok(summary.sources.includes('No verified source was available for this point.'));
  });

  it('TC-BUG-SUM-07: Nothing new is written to localStorage, sessionStorage or IndexedDB', () => {
    const summaryModelSrc = fs.readFileSync(
      path.join(WEB_ROOT, 'src/pages/summaryModel.ts'),
      'utf-8',
    );
    assert.ok(!summaryModelSrc.includes('localStorage'));
    assert.ok(!summaryModelSrc.includes('sessionStorage'));
    assert.ok(!summaryModelSrc.includes('indexedDB'));

    const writes: string[] = [];
    const fakeStorage = {
      setItem: (k: string) => writes.push(k),
      getItem: () => null,
      removeItem: () => {},
    };
    const origLocal = globalThis.localStorage;
    const origSession = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeStorage,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: fakeStorage,
      configurable: true,
    });
    try {
      buildReadableSummary(makeReport(), '2026-11-16');
      assert.deepEqual(writes, []);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: origLocal,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: origSession,
        configurable: true,
      });
    }
  });
});

describe('Bug 2: Privacy and consent screen (TC-BUG-PRIV-01..06)', () => {
  const consentSrc = fs.readFileSync(
    path.join(WEB_ROOT, 'src/pages/ConsentScreen.tsx'),
    'utf-8',
  );

  it('TC-BUG-PRIV-01: With the API down, shows plain error text and Try again button; "Failed to fetch" never appears', () => {
    const mapped = mapConsentErrorToUserMessage(new TypeError('Failed to fetch'));
    assert.equal(mapped.userMessage, PLAIN_CONNECTION_ERROR);
    assert.ok(!mapped.userMessage.includes('Failed to fetch'));
    assert.equal(mapped.isConnectionError, true);

    assert.match(consentSrc, /data-testid="consent-try-again"/);
    assert.match(consentSrc, /Try again/);
    assert.ok(!consentSrc.includes('err.message'));
  });

  it('TC-BUG-PRIV-02: With the API down, assessment cannot start; general education still works; Urgent Help link is visible', () => {
    assert.match(consentSrc, /const isAssessmentBlockedByConnection =\s*isAssessmentEnabled && \(loadingCopy \|\| connectionError \|\| !consentCatalogue\)/);
    assert.match(consentSrc, /Waiting for the connection/);
    assert.match(consentSrc, /onConsentComplete\('\/education'\)/);
    assert.match(consentSrc, /<UrgentLink \/>/);
    assert.match(consentSrc, /href="\/urgent\.html"/);
  });

  it('TC-BUG-PRIV-03: No broken image or alt text box is rendered', () => {
    assert.ok(!consentSrc.includes('<img'));
    assert.ok(!consentSrc.includes('Confidential Patient Session'));
    assert.ok(!consentSrc.includes('real_patient_peace_of_mind.jpg'));
  });

  it('TC-BUG-PRIV-04: Primary button label matches the selected option in both cases and hides duplicate education link', () => {
    assert.match(consentSrc, /'Continue to health assessment'/);
    assert.match(consentSrc, /'Continue to general education'/);
    assert.match(consentSrc, /\{isAssessmentEnabled && \(\s*<button[^>]*data-testid="skip-to-education"/s);
    assert.match(consentSrc, /Skip to general education/);
  });

  it('TC-BUG-PRIV-05: Selected option has aria-pressed and keyboard users can change it', () => {
    assert.match(consentSrc, /data-testid="preset-health-assessment"/);
    assert.match(consentSrc, /aria-pressed=\{isAssessmentEnabled\}/);
    assert.match(consentSrc, /data-testid="preset-education-only"/);
    assert.match(consentSrc, /aria-pressed=\{!isAssessmentEnabled\}/);
    assert.match(consentSrc, /handlePresetKeyDown/);
    assert.match(consentSrc, /ArrowRight/);
    assert.match(consentSrc, /ArrowLeft/);
  });

  it('TC-BUG-PRIV-06: List of what is on and off matches the consent payload sent to the API', () => {
    const assessmentPreset = createDefaultConsentDecisions('assessment_only');
    const summaryAssessment = describeConsentSummary(assessmentPreset);
    const payloadAssessment = normalizeConsentDecisions(assessmentPreset);

    assert.deepEqual(summaryAssessment.decisions, payloadAssessment);
    assert.deepEqual(summaryAssessment.decisions, {
      assessment: true,
      clinician_review: false,
      provider_share: false,
      spouse_share: false,
      research_use: false,
    });
    assert.deepEqual(
      summaryAssessment.enabledScopes.map(s => s.scope),
      ['assessment'],
    );
    assert.deepEqual(
      summaryAssessment.disabledScopes.map(s => s.scope),
      ['clinician_review', 'provider_share', 'spouse_share', 'research_use'],
    );

    const educationPreset = createDefaultConsentDecisions('education');
    const summaryEducation = describeConsentSummary(educationPreset);
    const payloadEducation = normalizeConsentDecisions(educationPreset);
    assert.deepEqual(summaryEducation.decisions, payloadEducation);
    assert.equal(summaryEducation.enabledScopes.length, 0);
    assert.deepEqual(
      summaryEducation.disabledScopes.map(s => s.scope),
      [...CANONICAL_CONSENT_SCOPES],
    );
  });
});

