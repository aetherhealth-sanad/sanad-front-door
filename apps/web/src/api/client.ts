/**
 * Sanad Front Door — Typed API Client
 * Follows specs/referal-flows/api-design.md
 */

const BASE_URL = '/api';

export interface SampleProfile {
  fixture_id: string;
  title: string;
  description: string;
  is_synthetic: boolean;
}

export interface CaseState {
  case_id: string;
  state: string;
  case_version: number;
  route: string;
  allowed_actions: string[];
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
  status_note: string;
  scopes: ConsentScope[];
}

export interface CaseConsentRecord {
  case_id: string;
  consent_version: string;
  scopes: Record<string, boolean>;
  captured_at: string;
}

export interface QuestionItem {
  question_id: string;
  concept_code: string;
  text: string;
  field_name: string;
  options?: Array<{ label: string; value: any }>;
  unit?: string;
}

export interface ReportData {
  case_id: string;
  summary: string;
  risk_signals: Array<{
    code: string;
    source_field: string;
    status: string;
    label?: string;
  }>;
  triage_proposal: {
    action: string;
    rule_ids: string[];
    rule_version: string;
    approval_status: string;
    disclaimer: string;
  };
  evidence_refs: Array<{
    source_id: string;
    version: string;
    verification: string;
  }>;
}

export interface GateDecision {
  allowed: boolean;
  user_consented: boolean;
  clinician_approved: boolean;
  policy_passed: boolean;
  reasons: string[];
}

export interface TrackingTimeline {
  case_id: string;
  current_status: string;
  is_delayed: boolean;
  events: Array<{
    event_id: string;
    event_type: string;
    timestamp: string;
    description: string;
    source: string;
  }>;
}

function getAuthHeader(): Record<string, string> {
  const token = sessionStorage.getItem('sanad_session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = 'API Request failed';
    try {
      const errJson = await res.json();
      errorDetail = errJson.message || errJson.detail || JSON.stringify(errJson);
    } catch {
      errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorDetail);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Public
  getSamples: () => request<{ samples: SampleProfile[] }>('/samples'),
  
  createCase: (start_mode: 'SAMPLE' | 'UPLOAD' | 'BLANK', fixture_id?: string) =>
    request<CreateCaseResponse>('/cases', {
      method: 'POST',
      body: JSON.stringify({
        start_mode,
        fixture_id: start_mode === 'SAMPLE' ? fixture_id : undefined,
        preferred_language: 'en',
      }),
    }),

  getCurrentConsent: () => request<ConsentCatalogue>('/consent/current'),

  // Patient Case Endpoints
  getCaseState: (caseId: string) => request<CaseState>(`/cases/${caseId}/state`),

  getCaseConsent: (caseId: string) => request<CaseConsentRecord>(`/cases/${caseId}/consent`),

  updateCaseConsent: (caseId: string, scopes: Record<string, boolean>) =>
    request<CaseConsentRecord>(`/cases/${caseId}/consent`, {
      method: 'PUT',
      body: JSON.stringify({ scopes }),
    }),

  applySampleProfile: (caseId: string) =>
    request<any>(`/cases/${caseId}/profile/sample`, {
      method: 'POST',
    }),

  runSafetyCheck: (caseId: string) =>
    request<{ emergency_triggered: boolean; trigger_rule?: string; guidance_route?: string }>(
      `/cases/${caseId}/safety-check`,
      { method: 'POST' }
    ),

  getQuestions: (caseId: string) =>
    request<{ questions: QuestionItem[] }>(`/cases/${caseId}/questions`),

  submitAnswers: (caseId: string, answers: Record<string, any>) =>
    request<any>(`/cases/${caseId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  assessCase: (caseId: string) =>
    request<any>(`/cases/${caseId}/assess`, {
      method: 'POST',
    }),

  getReport: (caseId: string) =>
    request<ReportData>(`/cases/${caseId}/report`),

  requestReview: (caseId: string) =>
    request<any>(`/cases/${caseId}/review-requests`, {
      method: 'POST',
    }),

  getReferralGate: (caseId: string) =>
    request<GateDecision>(`/cases/${caseId}/referral-gate`),

  createMockReferral: (caseId: string) =>
    request<any>(`/cases/${caseId}/mock-referral`, {
      method: 'POST',
    }),

  getTracking: (caseId: string) =>
    request<TrackingTimeline>(`/cases/${caseId}/tracking`),

  // Navigation & Closed-Loop
  acknowledgeNavigation: (caseId: string) =>
    request<any>(`/cases/${caseId}/navigation/acknowledgements`, {
      method: 'POST',
    }),

  reportNavigationProgress: (caseId: string, status: string) =>
    request<any>(`/cases/${caseId}/navigation/progress`, {
      method: 'POST',
      body: JSON.stringify({ progress_status: status }),
    }),

  reportNavigationBarriers: (caseId: string, barrier_codes: string[]) =>
    request<any>(`/cases/${caseId}/navigation/barriers`, {
      method: 'POST',
      body: JSON.stringify({ barrier_codes }),
    }),

  // Clinician / Staff
  login: (username: string, password: string) =>
    request<{ token: string; role: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getReviewQueue: () =>
    request<{ queue: any[] }>('/reviews/queue'),

  getReviewCase: (caseId: string) =>
    request<any>(`/reviews/${caseId}`),

  submitReviewDecision: (caseId: string, decision: { action: 'APPROVE' | 'REJECT' | 'REQUEST_CLARIFICATION'; note?: string }) =>
    request<any>(`/reviews/${caseId}/decision`, {
      method: 'POST',
      body: JSON.stringify(decision),
    }),

  // Mock Facility
  getFacilityReferrals: () =>
    request<{ referrals: any[] }>('/mock-facility/referrals'),

  postFacilityEvent: (referralId: string, event_type: string) =>
    request<any>(`/mock-facility/referrals/${referralId}/events`, {
      method: 'POST',
      body: JSON.stringify({ event_type }),
    }),
};
