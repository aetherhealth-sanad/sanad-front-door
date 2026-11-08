/** Typed client for the FastAPI contracts under apps/api/sanad_api. */

const BASE_URL = '/api';

export interface CaseState {
  case_id: string;
  state: string;
  case_version: number;
  route: string;
  allowed_actions: string[];
}

export interface SampleProfile {
  fixture_id: string;
  title: string;
  description: string;
  is_synthetic: boolean;
}

export interface CreateCaseResponse {
  case_id: string;
  session_token: string;
  expires_at: string;
  state: CaseState;
}

export interface ConsentScope {
  scope: string;
  data_covered: string;
  used_for: string;
  who_sees_it: string;
  if_off: string;
  used_in_this_flow: boolean;
}

export interface ConsentCatalogue {
  consent_version: string;
  copy_status: string;
  scopes: ConsentScope[];
}

export interface ConsentGrant {
  granted: boolean;
  captured_at: string | null;
  revoked_at: string | null;
}

export interface CaseConsentRecord {
  case_id: string;
  consent_version: string;
  scopes: Record<string, ConsentGrant>;
  state?: CaseState;
}

export interface QuestionOption {
  value: boolean | number | string;
  label: string;
}

export interface QuestionItem {
  question_id: string;
  text: string;
  answer_type: 'BOOLEAN' | 'SINGLE_CHOICE' | 'INTEGER' | 'NUMBER';
  unit: string | null;
  options: QuestionOption[];
  temporal_options: QuestionOption[];
  opt_out_choices: string[];
  reason: string;
  blocking: boolean;
  conflicting_values: Array<{
    value: boolean | number | string | null;
    unit: string | null;
    temporal_status: string | null;
    source_type: string;
    recorded_at: string;
  }>;
}

export interface QuestionsResponse {
  questions: QuestionItem[];
  catalogue_version: string;
  approval_status: string;
}

export interface IntakeAnswer {
  question_id: string;
  choice: 'ANSWERED' | 'NOT_SURE' | 'PREFER_NOT_TO_ANSWER';
  value?: boolean | number | string | null;
  temporal_status?: 'CURRENT' | 'PAST' | null;
}

export interface PsychosocialQuestion {
  question_id: 'PSY-STRESS-01' | 'PSY-SLEEP-01' | 'PSY-ANXIETY-01';
  concept_code: string;
  draft_text: string;
  source_type: string;
  verification_status: string;
  use: string;
}

export interface PsychosocialCatalogue {
  catalogue_version: string;
  approval_status: string;
  copy_status: string;
  reference_period: string;
  status_note: string;
  questions: PsychosocialQuestion[];
}

export interface PsychosocialAnswer {
  question_id: PsychosocialQuestion['question_id'];
  response_state: 'KNOWN_POSITIVE' | 'KNOWN_NEGATIVE' | 'UNKNOWN' | 'DECLINED';
  response_code?: 'YES' | 'NO' | 'NOT_SURE' | null;
}

export interface AssessmentResponse {
  gatekeeper_status: string | null;
  blocking_question_ids: string[];
  risk_signals: RiskSignal[];
  triage_proposal: TriageProposal | null;
  draft_ready: boolean;
  screening_notice: string;
  state: CaseState;
}

export interface RiskSignal {
  code: string;
  source_field: string;
  status: string;
  rule_id: string;
}

export interface TriageProposal {
  action: string;
  floor: string | null;
  rule_ids: string[];
  rule_version: string;
  approval_status: string;
}

export interface ObservationRecord {
  observation_id: string;
  test_code: string;
  value: number | null;
  unit: string | null;
  collected_on: string | null;
  reference_source: string | null;
  source: string;
  confirmation_status: string;
  issues: string[];
  used_in_assessment: boolean;
}

export interface ObservationInput {
  test_code: string;
  value?: number | null;
  unit?: string | null;
  collected_on?: string | null;
  reference_source?: string | null;
}

export interface EvidenceSelectionItem {
  item_id: string;
  kind: string;
  use: boolean;
  used_in_assessment: boolean;
  concept_codes: string[];
}

export interface EvidenceSelectionResponse {
  items: EvidenceSelectionItem[];
  state: CaseState;
}

export interface ReportData {
  report_type: string;
  draft_label: string;
  screening_notice: string;
  review_status: string;
  is_mock: boolean;
  rule_version: string;
  rule_approval_status: string;
  known: Array<{
    concept_code: string;
    value: boolean | number | string | null;
    unit: string | null;
    polarity: string | null;
    temporal_status: string | null;
    source_type: string;
    verification_status: string;
  }>;
  unknown: Array<{ concept_code: string; state: string }>;
  excluded_items: string[];
  observations: Array<{
    test_code: string;
    value: number | null;
    unit: string | null;
    collected_on: string | null;
    reference_source: string | null;
    source: string;
    confirmation_status: string;
    issues: string[];
    used_in_assessment: boolean;
  }>;
  limits: Array<{ code: string; text: string }>;
  why_next_step: string | null;
  who_approves: string;
  next_step: { action: string; label: string; is_mock: boolean } | null;
  next_step_withheld: string | null;
  evidence: Array<{
    claim_id: string;
    rule_id: string;
    status: string;
    citation: { source_id: string; version: string } | null;
  }>;
  required_statements: string[];
  genetics_support_available: boolean;
  guidance_id: string | null;
  guidance_version: string | null;
  psychosocial_context: Array<Record<string, unknown>>;
  psychosocial_context_use: string;
}

export interface GateDecision {
  decision: 'ALLOW' | 'DENY';
  conditions: {
    user_consent: { passed: boolean; scope: string };
    clinician_approval: { passed: boolean; kind: string | null; case_version: number | null };
    backend_policy: { passed: boolean; target_checked: boolean };
  };
  reason_codes: string[];
  policy_version: string;
  is_mock: boolean;
  evaluated_at: string;
}

export interface MockFacility {
  mock_facility_id: string;
  name: string;
  care_type: string;
  is_mock: boolean;
}

export interface TrackingTimeline {
  case_id: string;
  case_state: string;
  server_time: string;
  is_mock: boolean;
  timeline: Array<{
    kind: string;
    value: string | null;
    occurred_at: string;
    verification_source: string;
    is_mock: boolean;
    mock_appointment: { starts_at: string; label: string } | null;
  }>;
  referral: {
    referral_id: string;
    mock_status: string;
    care_type: string;
    target_mock_facility_id: string;
    is_mock: boolean;
  } | null;
  flag: { flag: string; stage: string; waiting_since: string; threshold_seconds: number; threshold_kind: string } | null;
}

export interface NavigationEpisode {
  episode_id: string;
  case_id: string;
  guidance_id: string;
  guidance_version: string;
  opened_at: string;
  is_synthetic: boolean;
  acknowledged: boolean;
  progress_events: Array<{
    status: string;
    verification_source: string;
    verification_status: string;
    occurred_at: string;
    recorded_at: string;
  }>;
  barrier_reports: Array<{
    barrier_reasons: string[];
    prefer_not_to_say: boolean;
    free_text_opt_in: boolean;
    recorded_at: string;
  }>;
}

export interface NavigationFunnel {
  observed_scope: string;
  synthetic_demo: boolean;
  guidance_episodes: number;
  acknowledgement: { numerator: number; denominator: number; rate: number | null; verification_source: string };
  navigation_started: { numerator: number; denominator: number; rate: number | null; verification_source: string };
  booking_self_reported: { numerator: number; denominator: number; rate: number | null; verification_source: string };
  visit_self_reported: { numerator: number; denominator: number; rate: number | null; verification_source: string };
  provider_verified_visits: 'NOT_AVAILABLE';
  care_completed: 'NOT_AVAILABLE';
}

// In-memory store for a user-selected synthetic upload File (never persisted to storage, wiped on QuickExit).
let pendingUploadFile: File | null = null;

export function setPendingUploadFile(file: File | null): void {
  pendingUploadFile = file;
}

export function getPendingUploadFile(): File | null {
  return pendingUploadFile;
}

export function clearPendingUploadFile(): void {
  pendingUploadFile = null;
}

type AuthMode = 'patient' | 'staff' | 'none';

function getAuthHeader(mode: AuthMode): Record<string, string> {
  const key = mode === 'staff' ? 'sanad_staff_token' : 'sanad_session_token';
  const token = mode === 'none' ? null : sessionStorage.getItem(key);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authMode: AuthMode = 'patient',
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  for (const [key, value] of Object.entries(getAuthHeader(authMode))) headers.set(key, value);

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      const details = Array.isArray(errJson.details) && errJson.details.length > 0
        ? ` (${errJson.details.join(', ')})`
        : '';
      errorDetail = (errJson.message || errJson.detail || JSON.stringify(errJson)) + details;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

const patientPost = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const api = {
  getSamples: () => request<{ samples: SampleProfile[] }>('/samples', {}, 'none'),
  getCurrentConsent: () => request<ConsentCatalogue>('/consent/current', {}, 'none'),
  createCase: (start_mode: 'SAMPLE' | 'UPLOAD' | 'BLANK', fixture_id?: string, preferred_language: 'en' | 'ar' = 'en') =>
    request<CreateCaseResponse>('/cases', {
      method: 'POST',
      body: JSON.stringify({ start_mode, fixture_id: start_mode === 'SAMPLE' ? fixture_id : undefined, preferred_language }),
    }, 'none'),
  getCaseState: (caseId: string) => request<CaseState>(`/cases/${caseId}/state`),
  closeCase: (caseId: string) => patientPost<CaseState>(`/cases/${caseId}/close`),
  getCaseConsent: (caseId: string) => request<CaseConsentRecord>(`/cases/${caseId}/consent`),
  updateCaseConsent: (caseId: string, consent_version: string, decisions: Record<string, boolean>) =>
    request<CaseConsentRecord>(`/cases/${caseId}/consent`, {
      method: 'PUT', body: JSON.stringify({ consent_version, decisions }),
    }),
  applySampleProfile: (caseId: string) => patientPost<CaseState>(`/cases/${caseId}/profile/sample`),
  uploadProfile: (caseId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<CaseState>(`/cases/${caseId}/profile/upload`, {
      method: 'POST',
      body: formData,
    });
  },
  runSafetyCheck: (caseId: string, answers: Array<{ question_id: string; response: 'YES' | 'NO' | 'NOT_SURE' | 'PREFER_NOT_TO_ANSWER' }>, catalogue_version?: string) =>
    patientPost<{ result: string; rule_ids: string[]; catalogue_version: string; approval_status: string; disclosure: string; needs_recheck: boolean; state: CaseState }>(
      `/cases/${caseId}/safety-check`, { answers, catalogue_version },
    ),
  getQuestions: (caseId: string) => request<QuestionsResponse>(`/cases/${caseId}/questions`),
  submitAnswers: (caseId: string, answers: IntakeAnswer[]) =>
    patientPost<CaseState>(`/cases/${caseId}/answers`, { answers }),
  assessCase: (caseId: string, entryPath: 'FULL_INTAKE' | 'LAB_ONLY' = 'FULL_INTAKE') =>
    patientPost<AssessmentResponse>(`/cases/${caseId}/assess`, { entry_path: entryPath }),
  selectEvidence: (caseId: string, items: Array<{ item_id: string; use: boolean }>) =>
    request<EvidenceSelectionResponse>(`/cases/${caseId}/evidence-selection`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  getObservations: (caseId: string) =>
    request<{ observations: ObservationRecord[] }>(`/cases/${caseId}/observations`),
  createObservation: (caseId: string, body: ObservationInput) =>
    patientPost<ObservationRecord>(`/cases/${caseId}/observations`, body),
  replaceObservation: (caseId: string, observationId: string, body: ObservationInput) =>
    request<ObservationRecord>(`/cases/${caseId}/observations/${observationId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteObservation: (caseId: string, observationId: string) =>
    request<void>(`/cases/${caseId}/observations/${observationId}`, {
      method: 'DELETE',
    }),
  confirmObservation: (caseId: string, observationId: string) =>
    patientPost<ObservationRecord>(`/cases/${caseId}/observations/${observationId}/confirm`),
  getPsychosocialQuestions: () => request<PsychosocialCatalogue>('/psychosocial/questions', {}, 'none'),
  savePsychosocial: (caseId: string, answers: PsychosocialAnswer[]) =>
    request(`/cases/${caseId}/psychosocial`, { method: 'PUT', body: JSON.stringify({ answers }) }),
  getReport: (caseId: string) => request<ReportData>(`/cases/${caseId}/report`),
  requestReview: (caseId: string, case_version: number) =>
    patientPost<{ review_request_id: string; is_mock: boolean; state: CaseState }>(`/cases/${caseId}/review-requests`, { case_version }),
  startNavigation: (caseId: string) => patientPost<CaseState>(`/cases/${caseId}/navigation/start`),
  getMockDirectory: (care_type?: string) => request<{ is_mock: boolean; directory_version: string; facilities: MockFacility[] }>(`/mock-directory${care_type ? `?care_type=${encodeURIComponent(care_type)}` : ''}`),
  getReferralGate: (caseId: string, target_mock_facility_id?: string) => request<GateDecision>(
    `/cases/${caseId}/referral-gate${target_mock_facility_id ? `?target_mock_facility_id=${encodeURIComponent(target_mock_facility_id)}` : ''}`,
  ),
  createMockReferral: (caseId: string, target_mock_facility_id: string) =>
    patientPost<{ referral: { referral_id: string; is_mock: boolean }; gate_decision: GateDecision }>(`/cases/${caseId}/mock-referral`, { target_mock_facility_id }),
  getTracking: (caseId: string) => request<TrackingTimeline>(`/cases/${caseId}/tracking`),
  getNavigation: (caseId: string) => request<NavigationEpisode>(`/cases/${caseId}/navigation`),
  acknowledgeNavigation: (caseId: string, guidance_id: string, guidance_version: string) =>
    patientPost<NavigationEpisode>(`/cases/${caseId}/navigation/acknowledgements`, { guidance_id, guidance_version }),
  reportNavigationProgress: (caseId: string, status: string, idempotency_key: string) =>
    patientPost<NavigationEpisode>(`/cases/${caseId}/navigation/progress`, { status, idempotency_key }),
  reportNavigationBarriers: (caseId: string, barrier_reasons: string[], prefer_not_to_say: boolean, idempotency_key: string) =>
    patientPost<NavigationEpisode>(`/cases/${caseId}/navigation/barriers`, {
      barrier_reasons, prefer_not_to_say, free_text_opt_in: false, idempotency_key,
    }),
  login: (username: string, password: string) => request<{ token: string; role: 'REVIEWER' | 'MOCK_FACILITY'; expires_at: string }>(
    '/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }, 'none',
  ),
  logout: () => request<void>('/auth/logout', { method: 'POST' }, 'staff'),
  getReviewQueue: () => request<{ review_mode: 'SIMULATED'; is_mock: boolean; items: Array<{ case_id: string; case_version: number; sent_at: string; triage_action: string | null; tracking_flag: TrackingTimeline['flag'] }> }>('/reviews/queue', {}, 'staff'),
  getReviewCase: (caseId: string) => request<{
    case_id: string; case_version: number; state: string; review_mode: 'SIMULATED'; is_mock: boolean;
    draft_label: string; screening_notice: string; facts: Array<Record<string, unknown>>;
    excluded_items: string[]; observations: Array<Record<string, unknown>>; unknown_fields: Array<{ concept_code: string; state: string }>;
    risk_signals: RiskSignal[]; triage_proposal: TriageProposal | null; evidence: ReportData['evidence']; limits: ReportData['limits'];
    clinician_summary_draft: string | null; decision_history: Array<Record<string, unknown>>; tracking_flag: TrackingTimeline['flag'];
    psychosocial_context: Array<Record<string, unknown>>; psychosocial_context_use: string;
  }>(`/reviews/${caseId}`, {}, 'staff'),
  submitReviewDecision: (caseId: string, decision: Record<string, unknown>) =>
    request(`/reviews/${caseId}/decision`, { method: 'POST', body: JSON.stringify(decision) }, 'staff'),
  getFacilityReferrals: () => request<{ is_mock: boolean; referrals: Array<{ referral_id: string; case_code: string; care_type: string; mock_status: string; created_at: string; is_mock: boolean }> }>('/mock-facility/referrals', {}, 'staff'),
  getNavigationFunnel: () => request<NavigationFunnel>('/evaluation/navigation-funnel', {}, 'staff'),
  getFacilityReferral: (referralId: string) => request<{
    referral_id: string; mock_status: string; is_mock: boolean;
    snapshot: { case_code: string; care_type: string; reviewer_summary: string; limits: string[] } | null;
    events: Array<{ event_id: string; mock_status: string; reason_code: string | null; mock_appointment: { starts_at: string; label: string } | null; occurred_at: string; is_mock: boolean }>;
  }>(`/mock-facility/referrals/${referralId}`, {}, 'staff'),
  postFacilityEvent: (referralId: string, body: { mock_status: string; reason_code?: string; mock_appointment?: { starts_at: string } }) =>
    request(`/mock-facility/referrals/${referralId}/events`, { method: 'POST', body: JSON.stringify(body) }, 'staff'),
};
