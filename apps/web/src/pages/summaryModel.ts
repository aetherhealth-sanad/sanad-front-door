import type { ConsentScope, ReportData } from '../api/client';
import questionCatalogue from '../../../../catalogue/questions.draft-0.1.json' with { type: 'json' };

export interface ReadableAnswerItem {
  question: string;
  answer: string;
  status: 'Answered' | 'Skipped' | 'Prefer not to say' | 'Not sure' | 'Needs clarification';
}

export interface ReadableObservationItem {
  label: string;
  valueText: string;
  statusText: string;
}

export interface ReadableSummaryModel {
  pdfFileName: string;
  title: string;
  sessionDate: string;
  screeningNotice: string;
  prototypeNotice: string;
  whatYouToldUs: ReadableAnswerItem[];
  observations: ReadableObservationItem[];
  whatNumbersMeanAndUnclear: string[];
  allowedNextStep: string;
  isWithheld: boolean;
  limits: string[];
  sources: string[];
  emergencyText: string;
  emergencyHref: string;
}

const QUESTION_BY_CONCEPT: Record<
  string,
  {
    text: string;
    options?: Array<{ value: boolean | number | string; label: string }>;
    temporal_options?: Array<{ value: string; label: string }>;
  }
> = Object.fromEntries(
  questionCatalogue.questions.map(q => [
    q.concept_code,
    {
      text: q.text,
      options: q.options,
      temporal_options: q.temporal_options,
    },
  ]),
);

const HUMAN_CONCEPT_LABELS: Record<string, string> = {
  age_years: 'How old are you?',
  bmi: 'What is your body mass index (BMI)?',
  anabolic_steroid_use: 'Have you ever used anabolic steroids?',
  strength_training: 'Do you do strength training, such as lifting weights?',
  body_fat_percent: 'Do you know your body fat percentage?',
  smoking: 'Do you smoke tobacco, or have you smoked in the past?',
  semen_analysis_done: 'Have you had a semen test before?',
  type2_diabetes: 'Have you been told you have type 2 diabetes?',
  family_history_reported: "Do you know of any men's health conditions in your close family?",
  regular_medicines: 'Do you take any medicines regularly?',
  genetics_result_available: 'Genetics test result availability',
};

const HUMAN_LAB_LABELS: Record<string, string> = {
  VOLUME_PLACEHOLDER: 'Ejaculate volume (Mock)',
  CONCENTRATION_PLACEHOLDER: 'Sperm concentration (Mock)',
  TOTAL_COUNT_PLACEHOLDER: 'Total sperm count (Mock)',
  TOTAL_MOTILITY_PLACEHOLDER: 'Total motility (Mock)',
  PROGRESSIVE_MOTILITY_PLACEHOLDER: 'Progressive motility (Mock)',
  MORPHOLOGY_PLACEHOLDER: 'Normal forms / morphology (Mock)',
  MOTILITY_PLACEHOLDER: 'Motility (Mock)',
};

function humanizeConcept(conceptCode: string): string {
  const fromCatalogue = QUESTION_BY_CONCEPT[conceptCode]?.text;
  if (fromCatalogue) return fromCatalogue;
  if (HUMAN_CONCEPT_LABELS[conceptCode]) return HUMAN_CONCEPT_LABELS[conceptCode];
  const words = conceptCode.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatKnownFactAnswer(fact: ReportData['known'][number]): string {
  const qMeta = QUESTION_BY_CONCEPT[fact.concept_code];
  if (fact.value === true && fact.temporal_status && qMeta?.temporal_options) {
    const tempMatch = qMeta.temporal_options.find(opt => opt.value === fact.temporal_status);
    if (tempMatch) return tempMatch.label;
  }
  if (fact.value === true) {
    if (fact.temporal_status === 'CURRENT') return 'Yes, currently';
    if (fact.temporal_status === 'PAST') return 'Yes, in the past';
    return 'Yes';
  }
  if (fact.value === false) {
    return 'No';
  }
  if (fact.value !== null && fact.value !== undefined) {
    const optMatch = qMeta?.options?.find(opt => opt.value === fact.value);
    if (optMatch) return optMatch.label;
    return `${fact.value}${fact.unit ? ` ${fact.unit}` : ''}`;
  }
  return 'Recorded';
}

function formatUnknownState(state: string): {
  answer: string;
  status: ReadableAnswerItem['status'];
} {
  switch (state) {
    case 'NOT_ASKED':
    case 'SKIPPED':
      return { answer: 'Skipped', status: 'Skipped' };
    case 'DECLINED':
    case 'PREFER_NOT_TO_ANSWER':
      return { answer: 'Prefer not to say', status: 'Prefer not to say' };
    case 'UNKNOWN':
    case 'NOT_SURE':
      return { answer: 'Not sure', status: 'Not sure' };
    case 'CONFLICTING':
      return { answer: 'Conflicting answers recorded', status: 'Needs clarification' };
    default:
      return { answer: 'Not provided', status: 'Skipped' };
  }
}

function formatFriendlySource(sourceId: string, version: string, title?: string): string {
  if (title && title.trim()) {
    return `${title.trim()} (version ${version})`;
  }
  const cleanName = sourceId
    .replace(/[-_]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
  return `${cleanName} (version ${version})`;
}

/**
 * Builds the patient-readable screening summary in browser memory without
 * touching storage or making any server request.
 */
export function buildReadableSummary(
  report: ReportData,
  sessionDate: string = new Date().toISOString().slice(0, 10),
): ReadableSummaryModel {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    ? sessionDate
    : new Date().toISOString().slice(0, 10);

  const isWithheld = Boolean(report.next_step_withheld) || !report.next_step;

  const whatYouToldUs: ReadableAnswerItem[] = [
    ...report.known.map(fact => ({
      question: humanizeConcept(fact.concept_code),
      answer: formatKnownFactAnswer(fact),
      status: 'Answered' as const,
    })),
    ...report.unknown.map(item => {
      const mapped = formatUnknownState(item.state);
      return {
        question: humanizeConcept(item.concept_code),
        answer: mapped.answer,
        status: mapped.status,
      };
    }),
  ];

  const observations: ReadableObservationItem[] = report.observations.map(obs => {
    const label =
      HUMAN_LAB_LABELS[obs.test_code] ||
      `${obs.test_code
        .replace(/_PLACEHOLDER$/i, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase())} (Mock)`;
    const valueText =
      obs.value !== null && obs.value !== undefined
        ? `${obs.value}${obs.unit ? ` ${obs.unit}` : ''}`
        : 'Not provided';
    const statusText =
      obs.confirmation_status === 'CONFIRMED_BY_USER'
        ? 'Confirmed by you (unverified against original lab report)'
        : 'Saved as draft (not yet confirmed for use)';
    return { label, valueText, statusText };
  });

  const whatNumbersMeanAndUnclear: string[] = [];
  if (!isWithheld) {
    if (report.why_next_step) {
      whatNumbersMeanAndUnclear.push(report.why_next_step);
    }
    for (const stmt of report.required_statements) {
      if (stmt && !whatNumbersMeanAndUnclear.includes(stmt)) {
        whatNumbersMeanAndUnclear.push(stmt);
      }
    }
    if (report.unknown.length > 0) {
      whatNumbersMeanAndUnclear.push(
        'Some questions were skipped, marked not sure, or preferred not to say. Missing answers are treated as unknown, never as normal or low risk.',
      );
    } else if (whatNumbersMeanAndUnclear.length === 0) {
      whatNumbersMeanAndUnclear.push(
        'Your recorded answers are self-reported and unverified.',
      );
    }
  } else {
    whatNumbersMeanAndUnclear.push(
      'Interpretation of your numbers is withheld until the required review is complete.',
    );
    if (report.unknown.length > 0) {
      whatNumbersMeanAndUnclear.push(
        'Some questions were skipped, marked not sure, or preferred not to say. Missing answers stay unknown and are never treated as "No" or normal.',
      );
    }
  }

  const allowedNextStep =
    !isWithheld && report.next_step
      ? `${report.next_step.label}${report.next_step.is_mock ? ' (Mock)' : ''}`
      : 'A next step is withheld until the required review is complete.';

  const limits = report.limits
    .map(limit => limit.text.trim())
    .filter(Boolean);

  const sources: string[] = [];
  for (const ev of report.evidence) {
    if (ev.citation && ev.status === 'SUPPORTED') {
      const citationWithTitle = ev.citation as {
        source_id: string;
        version: string;
        title?: string;
      };
      sources.push(
        formatFriendlySource(
          citationWithTitle.source_id,
          citationWithTitle.version,
          citationWithTitle.title,
        ),
      );
    } else if (ev.citation && ev.status === 'TEAM_CURATED') {
      const citationWithTitle = ev.citation as {
        source_id: string;
        version: string;
        title?: string;
      };
      sources.push(
        `${formatFriendlySource(
          citationWithTitle.source_id,
          citationWithTitle.version,
          citationWithTitle.title,
        )} — team-selected source, not reviewed by a clinician.`,
      );
    }
  }
  if (
    sources.length === 0 ||
    report.evidence.some(ev => !ev.citation || ev.status === 'INSUFFICIENT_EVIDENCE')
  ) {
    sources.push('No verified source was available for this point.');
  }

  return {
    pdfFileName: `sanad-summary-${safeDate}.pdf`,
    title: 'Sanad screening summary',
    sessionDate: safeDate,
    screeningNotice: 'Screening, not diagnosis',
    prototypeNotice: 'Research prototype, synthetic data only',
    whatYouToldUs,
    observations,
    whatNumbersMeanAndUnclear,
    allowedNextStep,
    isWithheld,
    limits,
    sources,
    emergencyText: 'If symptoms are severe or sudden, call 998',
    emergencyHref: '/urgent.html',
  };
}

export const CANONICAL_CONSENT_SCOPES = [
  'assessment',
  'clinician_review',
  'provider_share',
  'spouse_share',
  'research_use',
] as const;

export type CanonicalConsentScope = (typeof CANONICAL_CONSENT_SCOPES)[number];

export const CONSENT_SCOPE_PLAIN_LABELS: Record<CanonicalConsentScope, string> = {
  assessment: 'Health assessment in this session (assessment)',
  clinician_review: 'Simulated specialist review — Mock (clinician_review)',
  provider_share: 'Simulated care referral — Mock (provider_share)',
  spouse_share: 'Spouse or partner sharing (spouse_share)',
  research_use: 'Research use (research_use)',
};

export function createDefaultConsentDecisions(
  preset: 'assessment_only' | 'education' = 'assessment_only',
): Record<string, boolean> {
  return {
    assessment: preset === 'assessment_only',
    clinician_review: false,
    provider_share: false,
    spouse_share: false,
    research_use: false,
  };
}

export function normalizeConsentDecisions(
  selected: Record<string, boolean>,
  scopesConfig: ConsentScope[] = [],
): Record<string, boolean> {
  const keys = new Set<string>([
    ...CANONICAL_CONSENT_SCOPES,
    ...scopesConfig.map(s => s.scope),
    ...Object.keys(selected),
  ]);
  const assessmentOn = Boolean(selected.assessment);
  const decisions: Record<string, boolean> = {};
  for (const key of keys) {
    if (key === 'spouse_share' || key === 'research_use') {
      decisions[key] = false;
    } else if (key === 'assessment') {
      decisions[key] = assessmentOn;
    } else {
      decisions[key] = assessmentOn ? Boolean(selected[key]) : false;
    }
  }
  return decisions;
}

export function describeConsentSummary(
  selected: Record<string, boolean>,
  scopesConfig: ConsentScope[] = [],
): {
  decisions: Record<string, boolean>;
  enabledScopes: Array<{ scope: string; label: string }>;
  disabledScopes: Array<{ scope: string; label: string }>;
} {
  const decisions = normalizeConsentDecisions(selected, scopesConfig);
  const enabledScopes: Array<{ scope: string; label: string }> = [];
  const disabledScopes: Array<{ scope: string; label: string }> = [];

  for (const scope of CANONICAL_CONSENT_SCOPES) {
    const label = CONSENT_SCOPE_PLAIN_LABELS[scope];
    if (decisions[scope]) {
      enabledScopes.push({ scope, label });
    } else {
      disabledScopes.push({ scope, label });
    }
  }

  return { decisions, enabledScopes, disabledScopes };
}

export const PLAIN_CONNECTION_ERROR =
  'We could not reach Sanad right now. Check your connection and try again.';

export function mapConsentErrorToUserMessage(err: unknown): {
  userMessage: string;
  errorCode: string;
  isConnectionError: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();

  if (raw.includes('Please select a synthetic JSON profile file')) {
    return {
      userMessage: raw,
      errorCode: 'SANAD_ERR_UPLOAD_FILE_MISSING',
      isConnectionError: false,
    };
  }

  const isNetworkOrServerDown =
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('unavailable') ||
    lower.includes('http 500') ||
    lower.includes('http 502') ||
    lower.includes('http 503') ||
    lower.includes('http 504');

  if (isNetworkOrServerDown) {
    return {
      userMessage: PLAIN_CONNECTION_ERROR,
      errorCode: 'SANAD_ERR_API_UNREACHABLE',
      isConnectionError: true,
    };
  }

  return {
    userMessage: PLAIN_CONNECTION_ERROR,
    errorCode: 'SANAD_ERR_CONSENT_REQUEST_FAILED',
    isConnectionError: true,
  };
}
