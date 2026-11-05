import { useEffect, useState } from 'react';
import { api, type NavigationFunnel } from '../api/client';
import { MockBadge } from '../components/MockBadge';
import questionCatalogue from '../../../../catalogue/questions.draft-0.1.json';

interface QueueItem {
  case_id: string;
  case_version: number;
  sent_at: string;
  triage_action: string | null;
  tracking_flag: { flag: string; stage: string } | null;
}

interface ReviewDetail {
  case_id: string;
  case_version: number;
  state: string;
  draft_label: string;
  screening_notice: string;
  facts: Array<Record<string, unknown>>;
  excluded_items: string[];
  observations: Array<Record<string, unknown>>;
  unknown_fields: Array<{ concept_code: string; state: string }>;
  risk_signals: Array<{ code: string; status: string; rule_id: string }>;
  triage_proposal: { action: string; floor: string | null; rule_ids: string[]; approval_status: string } | null;
  evidence: Array<{ claim_id: string; status: string; citation: { source_id: string; version: string } | null }>;
  limits: Array<{ code: string; text: string }>;
  clinician_summary_draft: string | null;
  decision_history: Array<Record<string, unknown>>;
  psychosocial_context: Array<Record<string, unknown>>;
  psychosocial_context_use: string;
}

type ReviewDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CLARIFICATION';
type RejectReason = 'CONTEXT_UPDATED' | 'INSUFFICIENT_INFORMATION' | 'CONFLICTING_INFORMATION' | 'OUTSIDE_SERVICE_SCOPE' | 'TEST_OR_DUPLICATE_CASE' | 'OTHER';

const rejectionReasons: Array<{ value: RejectReason; label: string }> = [
  { value: 'CONTEXT_UPDATED', label: 'Context updated' },
  { value: 'INSUFFICIENT_INFORMATION', label: 'Insufficient information' },
  { value: 'CONFLICTING_INFORMATION', label: 'Conflicting information' },
  { value: 'OUTSIDE_SERVICE_SCOPE', label: 'Outside service scope' },
  { value: 'TEST_OR_DUPLICATE_CASE', label: 'Test or duplicate case' },
  { value: 'OTHER', label: 'Other' },
];

export const ClinicianPortal: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem('sanad_staff_role') === 'REVIEWER' && Boolean(sessionStorage.getItem('sanad_staff_token')));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [rejectReason, setRejectReason] = useState<RejectReason | ''>('');
  const [clarificationIds, setClarificationIds] = useState<string[]>([]);
  const [funnel, setFunnel] = useState<NavigationFunnel | null>(null);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDetail = async (caseId: string) => {
    setError(null);
    setSelectedCaseId(caseId);
    setDetail(await api.getReviewCase(caseId) as ReviewDetail);
  };

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReviewQueue();
      setQueue(result.items);
      const selected = result.items.some(item => item.case_id === selectedCaseId) ? selectedCaseId : result.items[0]?.case_id ?? '';
      if (selected) await loadDetail(selected);
      else {
        setSelectedCaseId('');
        setDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Mock review queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (authenticated) void loadQueue(); }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    api.getNavigationFunnel().then(setFunnel).catch(err => setFunnelError(err instanceof Error ? err.message : 'Mock funnel is unavailable.'));
  }, [authenticated]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.login(username, password);
      if (result.role !== 'REVIEWER') throw new Error('These credentials do not have the Mock Reviewer role.');
      sessionStorage.setItem('sanad_staff_token', result.token);
      sessionStorage.setItem('sanad_staff_role', result.role);
      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* Local credentials are removed even if the server is unavailable. */ }
    sessionStorage.removeItem('sanad_staff_token');
    sessionStorage.removeItem('sanad_staff_role');
    setAuthenticated(false);
    setQueue([]);
    setDetail(null);
  };

  const handleDecision = async (decision: ReviewDecision) => {
    if (!detail) return;
    if (decision === 'REJECT' && !rejectReason) {
      setError('Choose a reason code before rejecting this Mock draft.');
      return;
    }
    if (decision === 'REQUEST_CLARIFICATION' && clarificationIds.length === 0) {
      setError('Select at least one question for clarification.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const payload: Record<string, unknown> = {
      decision,
      case_version: detail.case_version,
      note: decisionNote.trim() || undefined,
      ...(decision === 'REJECT' ? { reason_code: rejectReason } : {}),
      ...(decision === 'REQUEST_CLARIFICATION' ? { question_ids: clarificationIds } : {}),
    };
    try {
      await api.submitReviewDecision(detail.case_id, payload);
      setNotice(`Mock review decision recorded for case ${detail.case_id}.`);
      setDecisionNote('');
      setRejectReason('');
      setClarificationIds([]);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Mock review decision was not recorded.');
      try { await loadDetail(detail.case_id); } catch { /* Keep the original API error visible. */ }
    } finally {
      setSubmitting(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <MockBadge label="MOCK REVIEWER SIGN-IN" />
          <h1 className="text-2xl font-bold text-slate-900 mt-4">Reviewer access</h1>
          <p className="text-sm text-slate-600 mt-2">Use the seeded demo account configured for the local API. This is a simulated reviewer role.</p>
          {error && <div role="alert" className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-sm">{error}</div>}
          <form onSubmit={handleLogin} className="mt-5 space-y-3">
            <label className="block text-sm font-medium">Username<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <button type="submit" disabled={loading || !username || !password} className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-semibold disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in to Mock Reviewer'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
        <div>
          <MockBadge label="MOCK REVIEWER CONSOLE · SIMULATED ROLE" />
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-3">Draft review queue</h1>
          <p className="text-sm text-slate-600 mt-1">Review synthetic case drafts. A simulated approval is not verified clinical care.</p>
        </div>
        <button type="button" onClick={() => void handleLogout()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">Sign out</button>
      </div>

      {error && <div role="alert" className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">{error}</div>}
      {notice && <div role="status" className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">{notice}</div>}

      <section className="mb-6 bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3"><MockBadge label="MOCK CLOSED-LOOP FUNNEL" /><span className="text-xs text-slate-500">{funnel?.observed_scope ?? 'Loading active synthetic sessions…'}</span></div>
        {funnelError && <p className="text-xs text-amber-800">{funnelError}</p>}
        {funnel && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['Acknowledged', funnel.acknowledgement],
              ['Navigation started', funnel.navigation_started],
              ['Booking self-reported', funnel.booking_self_reported],
              ['Visit self-reported', funnel.visit_self_reported],
            ] as const).map(([label, metric]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-medium text-slate-600">{label}</span><strong className="block text-lg text-slate-900 mt-1">{metric.numerator}/{metric.denominator}</strong><span className="block text-[11px] text-slate-500">{metric.rate === null ? 'No denominator' : `${Math.round(metric.rate * 100)}%`} · {metric.verification_source}</span></div>)}
          </div>
          <p className="text-xs text-slate-500 mt-3">Provider-verified visits: {funnel.provider_verified_visits} · Care completed: {funnel.care_completed}. These metrics describe synthetic demo events, not care outcomes.</p>
        </>}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">Pending Mock cases</h2><button type="button" onClick={() => void loadQueue()} className="text-xs underline">Refresh</button></div>
          {loading && <p className="text-xs text-slate-500">Loading queue…</p>}
          {!loading && queue.length === 0 && <p className="text-sm text-slate-600">No pending Mock cases.</p>}
          {queue.map(item => (
            <button key={item.case_id} type="button" onClick={() => void loadDetail(item.case_id).catch(err => setError(String(err)))} className={`w-full text-left p-3 rounded-xl border ${selectedCaseId === item.case_id ? 'bg-sky-50 border-sky-400' : 'bg-slate-50 border-slate-200'}`}>
              <span className="block font-mono text-xs text-slate-800">{item.case_id} · Mock</span>
              <span className="block text-xs text-slate-600 mt-1">Version {item.case_version} · {item.triage_action ?? 'No action'}</span>
              <span className="block text-[11px] text-slate-500 mt-1">Submitted {new Date(item.sent_at).toLocaleString()}</span>
            </button>
          ))}
        </aside>

        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-6">
          {!detail && <p className="text-sm text-slate-600">Select a case from the Mock queue.</p>}
          {detail && <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div><MockBadge label="MOCK CASE DETAIL" /><h2 className="text-xl font-bold text-slate-900 mt-2">{detail.case_id}</h2><p className="text-xs text-slate-500">Case version {detail.case_version} · {detail.state}</p></div>
              <div className="text-right"><span className="block text-xs text-slate-500">Draft proposal</span><strong className="text-sm text-slate-900">{detail.triage_proposal?.action ?? 'Not available'}</strong><span className="block text-xs text-amber-800">{detail.triage_proposal?.approval_status ?? detail.draft_label}</span></div>
            </div>

            <p className="text-xs text-slate-600">{detail.screening_notice}</p>

            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Recorded facts</h3>
              {detail.facts.length === 0 ? <p className="text-xs text-slate-500">No facts in this draft.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2 pr-3">Concept</th><th className="py-2 pr-3">Value / state</th><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Source</th></tr></thead><tbody>{detail.facts.map((raw, index) => { const fact = raw as { fact_id?: string; concept_code?: string; value?: unknown; state?: string; unit?: string | null; temporal_status?: string | null; source_type?: string; verification_status?: string }; return <tr key={fact.fact_id ?? index} className="border-b border-slate-100"><td className="py-2 pr-3">{fact.concept_code ?? 'Unknown'}</td><td className="py-2 pr-3">{fact.value === null || fact.value === undefined ? fact.state : `${String(fact.value)}${fact.unit ? ` ${fact.unit}` : ''}`}</td><td className="py-2 pr-3">{fact.temporal_status ?? 'Not specified'}</td><td className="py-2 pr-3">{fact.source_type ?? 'Unknown'} · {fact.verification_status ?? 'Unknown'}</td></tr>; })}</tbody></table></div>}
            </div>

            {detail.unknown_fields.length > 0 && <div><h3 className="text-sm font-bold text-slate-800 mb-2">Unknown fields</h3><ul className="flex flex-wrap gap-2">{detail.unknown_fields.map(item => <li key={item.concept_code} className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs">{item.concept_code} · {item.state}</li>)}</ul></div>}
            {detail.observations.length > 0 && <div><h3 className="text-sm font-bold text-slate-800 mb-2">Reported observations · Mock</h3><ul className="space-y-2">{detail.observations.map((raw, index) => { const item = raw as { test_code?: string; value?: unknown; unit?: string | null; confirmation_status?: string; source?: string }; return <li key={`${item.test_code}-${index}`} className="rounded-lg bg-slate-50 p-3 text-xs">{item.test_code}: {String(item.value ?? 'Unknown')} {item.unit ?? ''} · {item.confirmation_status} · {item.source}</li>; })}</ul></div>}
            {detail.risk_signals.length > 0 && <div><h3 className="text-sm font-bold text-slate-800 mb-2">Draft rule signals · Mock</h3><ul className="space-y-1 text-xs">{detail.risk_signals.map((signal, index) => <li key={`${signal.code}-${index}`}>{signal.code} · {signal.status} · {signal.rule_id}</li>)}</ul></div>}
            {detail.psychosocial_context.length > 0 && <div className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-800">Optional self-reported context · not triage</h3><ul className="mt-2 space-y-1 text-xs">{detail.psychosocial_context.map((raw, index) => { const item = raw as { question_id?: string; response_state?: string; source_type?: string; verification_status?: string }; return <li key={`${item.question_id}-${index}`}>{item.question_id}: {item.response_state} · {item.source_type ?? 'Not reported'} · {item.verification_status ?? 'Unverified'}</li>; })}</ul></div>}
            {detail.limits.length > 0 && <div><h3 className="text-sm font-bold text-slate-800 mb-2">Draft limits</h3><ul className="space-y-1 text-xs text-slate-600">{detail.limits.map((item, index) => <li key={`${item.code}-${index}`}>{item.text}</li>)}</ul></div>}

            <div className="space-y-3 border-t border-slate-100 pt-5">
              <label className="block text-xs font-semibold text-slate-700">Optional note for this synthetic review<textarea rows={2} maxLength={500} value={decisionNote} onChange={event => setDecisionNote(event.target.value)} className="mt-1 w-full p-3 rounded-lg border border-slate-300 text-sm" /></label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-700">Rejection reason<select value={rejectReason} onChange={event => setRejectReason(event.target.value as RejectReason | '')} className="mt-1 w-full p-2 rounded-lg border border-slate-300 bg-white"><option value="">Choose only when rejecting</option>{rejectionReasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label>
                <div className="text-xs text-slate-600">Clarification questions<select multiple value={clarificationIds} onChange={event => setClarificationIds(Array.from(event.target.selectedOptions, option => option.value))} className="mt-1 w-full p-2 rounded-lg border border-slate-300 bg-white h-24">{questionCatalogue.questions.map(question => <option key={question.question_id} value={question.question_id}>{question.question_id} · {question.text}</option>)}</select><span className="block mt-1">Use only for a clarification request.</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={submitting} onClick={() => void handleDecision('APPROVE')} className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">Record Mock approval</button>
                <button type="button" disabled={submitting} onClick={() => void handleDecision('REQUEST_CLARIFICATION')} className="px-4 py-2 rounded-lg bg-amber-100 text-amber-950 text-sm font-semibold disabled:opacity-50">Request clarification</button>
                <button type="button" disabled={submitting} onClick={() => void handleDecision('REJECT')} className="px-4 py-2 rounded-lg bg-rose-100 text-rose-950 text-sm font-semibold disabled:opacity-50">Reject Mock draft</button>
              </div>
            </div>
          </>}
        </section>
      </div>
    </div>
  );
};
