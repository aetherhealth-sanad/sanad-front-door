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


export interface PatientReviewFact {
  fact_id: string;
  concept_code: string;
  value: boolean | number | string | null;
  unit: string | null;
  state: string;
  polarity: string | null;
  temporal_status: string | null;
  source_type: string;
  verification_status: string;
  recorded_at: string;
}

export interface PatientReviewItem {
  question_id: string;
  concept_code: string;
  text: string;
  answer_type: 'BOOLEAN' | 'SINGLE_CHOICE' | 'INTEGER' | 'NUMBER';
  unit: string | null;
  options: QuestionOption[];
  temporal_options: QuestionOption[];
  state: string;
  discrepancy_kind: 'NONE' | 'VALUE_CONFLICT' | 'TEMPORAL_CLARIFICATION';
  facts: PatientReviewFact[];
}

export interface PatientReviewProfile {
  case_id: string;
  case_version: number;
  catalogue_version: string;
  items: PatientReviewItem[];
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

/** RF-21: how to label the assistant and whether typing is on (server config). */
export interface AssistantInfo {
  assistant_label: string;
  assistant_note: string;
  copy_status: string;
  typing_enabled: boolean;
  max_text_chars: number;
  model: { provider: string; label: string; match_label: string } | null;
  disclosure: string | null;
  disclosure_version: string | null;
}

export interface InterpretResponse {
  outcome: 'EMERGENCY_GUIDANCE' | 'NEEDS_CORRECTION' | 'PROPOSAL' | 'FALLBACK';
  reason_code: string | null;
  message: string;
  /** RF-27: what was hidden before the model saw the text; never the hidden value. */
  redacted_types?: ('DATE' | 'NAME')[];
  /** RF-30: earlier answers that confirming the proposal would contradict. Labels come from the catalogue. */
  contradiction?: {
    question_id: string;
    earlier: {
      echo_label: string;
      source_type: 'PATIENT_REPORTED' | 'SAMPLE_FIXTURE' | 'USER_UPLOADED' | 'USER_ENTERED' | string;
      change: 'VALUE_DIFFERS' | 'TIME_DIFFERS' | 'BECOMES_UNKNOWN';
    }[];
  } | null;
  proposal: {
    question_id: string;
    choice: IntakeAnswer['choice'];
    value: boolean | number | string | null;
    temporal_status: 'CURRENT' | 'PAST' | null;
    echo_label: string;
  } | null;
  produced_by: {
    provider: string;
    model_id: string;
    label: string;
    is_ai_generated: boolean;
    verification_status: string;
    needs_user_confirmation: boolean;
  } | null;
  emergency: {
    rule_ids: string[];
    catalogue_version: string;
    approval_status: string;
    is_simulated: boolean;
    disclosure: string;
  } | null;
  state: CaseState;
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

/** T-60: read-only OCR response. All fields remain unconfirmed; never auto-post observations. */
export interface OcrLabField {
  field_id: string;
  value: number | string | null;
  unit: string | null;
  raw_text: string | null;
  bbox: { page: number; x: number; y: number; width: number; height: number } | null;
  confidence: number;
  scores: { ocr: number; parse: number; plausibility: number };
  flags: string[];
  status: 'UNCONFIRMED' | 'NEEDS_CONFIRMATION';
  method: 'TEXT_LAYER' | 'OCR' | null;
  target_test_code: string | null;
}

export interface OcrLabDraft {
  status: 'EXTRACTED' | 'REJECTED';
  reason: string | null;
  is_synthetic: boolean;
  extractor_version: string;
  catalogue_version: string;
  ocr_engine: string | null;
  fields: OcrLabField[];
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

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
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
    if (authMode === 'staff' && res.status === 401) {
      sessionStorage.removeItem('sanad_staff_token');
      sessionStorage.removeItem('sanad_staff_role');
      window.dispatchEvent(new Event('sanad-staff-session-expired'));
    }
    throw new ApiRequestError(errorDetail, res.status);
  }
  return res.json() as Promise<T>;
}

export interface ModelRunTask {
  task_id: string;
  calls: number;
  by_status: Record<string, number>;
  by_outcome: Record<string, number>;
  budget_refusals: number;
  attempts_mean: number | null;
  latency_ms: { p50: number | null; p95: number | null };
  tokens: { input: number; output: number };
}

export interface ModelRunsSummary {
  observed_scope: string;
  synthetic_demo: boolean;
  tasks: ModelRunTask[];
}

/** RF-28: fetches the user's summary file and hands it to the browser as a download. */
async function downloadSummary(caseId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/cases/${caseId}/summary-file`, {
    headers: getAuthHeader('patient'),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: the summary could not be prepared.`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name ?? 'sanad-summary.json';
  link.click();
  URL.revokeObjectURL(url);
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
  getReviewProfile: (caseId: string) => request<PatientReviewProfile>(`/cases/${caseId}/review-profile`),
  correctReviewAnswer: (caseId: string, expected_case_version: number, answer: IntakeAnswer) =>
    patientPost<CaseState>(`/cases/${caseId}/answers`, {
      answers: [answer], review_correction: true, expected_case_version,
    }),
  submitAnswers: (caseId: string, answers: IntakeAnswer[]) =>
    patientPost<CaseState>(`/cases/${caseId}/answers`, { answers }),
  getAssistant: () => request<AssistantInfo>('/chat/assistant', {}, 'none'),
  interpretText: (caseId: string, question_id: string, text: string, disclosure_version: string | null) =>
    patientPost<InterpretResponse>(`/cases/${caseId}/chat/interpret`, { question_id, text, disclosure_version }),
  assessCase: (caseId: string, entryPath: 'FULL_INTAKE' | 'LAB_ONLY' = 'FULL_INTAKE') =>
    patientPost<AssessmentResponse>(`/cases/${caseId}/assess`, { entry_path: entryPath }),
  selectEvidence: (caseId: string, items: Array<{ item_id: string; use: boolean }>) =>
    request<EvidenceSelectionResponse>(`/cases/${caseId}/evidence-selection`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  readLabReport: (caseId: string, file: File) =>
    request<OcrLabDraft>(`/cases/${caseId}/profile/document`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
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
  downloadSummary,
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
  getModelRuns: () => request<ModelRunsSummary>('/evaluation/model-runs', {}, 'staff'),
  getFacilityReferral: (referralId: string) => request<{
    referral_id: string; mock_status: string; is_mock: boolean;
    snapshot: { case_code: string; care_type: string; reviewer_summary: string; limits: string[] } | null;
    events: Array<{ event_id: string; mock_status: string; reason_code: string | null; mock_appointment: { starts_at: string; label: string } | null; occurred_at: string; is_mock: boolean }>;
  }>(`/mock-facility/referrals/${referralId}`, {}, 'staff'),
  postFacilityEvent: (referralId: string, body: { mock_status: string; reason_code?: string; mock_appointment?: { starts_at: string } }) =>
    request(`/mock-facility/referrals/${referralId}/events`, { method: 'POST', body: JSON.stringify(body) }, 'staff'),
};
