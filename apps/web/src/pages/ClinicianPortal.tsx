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
  triage_proposal: {
    action: string;
    floor: string | null;
    rule_ids: string[];
    approval_status: string;
  } | null;
  evidence: Array<{
    claim_id: string;
    status: string;
    citation: { source_id: string; version: string } | null;
  }>;
  limits: Array<{ code: string; text: string }>;
  clinician_summary_draft: string | null;
  decision_history: Array<Record<string, unknown>>;
  psychosocial_context: Array<Record<string, unknown>>;
  psychosocial_context_use: string;
}

type ReviewDecision = 'APPROVE' | 'EDIT' | 'REJECT' | 'REQUEST_CLARIFICATION';
type RejectReason =
  | 'CONTEXT_UPDATED'
  | 'INSUFFICIENT_INFORMATION'
  | 'CONFLICTING_INFORMATION'
  | 'OUTSIDE_SERVICE_SCOPE'
  | 'TEST_OR_DUPLICATE_CASE'
  | 'OTHER';
type ReviewableAction =
  | 'PRIORITY_REVIEW'
  | 'SPECIALIST'
  | 'PRIMARY_CARE'
  | 'EDUCATION'
  | 'NEEDS_MORE_INFORMATION';

const rejectionReasons: Array<{ value: RejectReason; label: string }> = [
  { value: 'CONTEXT_UPDATED', label: 'Context updated' },
  { value: 'INSUFFICIENT_INFORMATION', label: 'Insufficient information' },
  { value: 'CONFLICTING_INFORMATION', label: 'Conflicting information' },
  { value: 'OUTSIDE_SERVICE_SCOPE', label: 'Outside service scope' },
  { value: 'TEST_OR_DUPLICATE_CASE', label: 'Test or duplicate case' },
  { value: 'OTHER', label: 'Other' },
];

const reviewableActions: ReviewableAction[] = [
  'PRIORITY_REVIEW',
  'SPECIALIST',
  'PRIMARY_CARE',
  'EDUCATION',
  'NEEDS_MORE_INFORMATION',
];

export const ClinicianPortal: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(
    () =>
      sessionStorage.getItem('sanad_staff_role') === 'REVIEWER' &&
      Boolean(sessionStorage.getItem('sanad_staff_token')),
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [rejectReason, setRejectReason] = useState<RejectReason | ''>('');
  const [clarificationIds, setClarificationIds] = useState<string[]>([]);
  const [editTriageAction, setEditTriageAction] = useState<ReviewableAction | ''>('');
  const [editSummary, setEditSummary] = useState('');
  const [funnel, setFunnel] = useState<NavigationFunnel | null>(null);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDetail = async (caseId: string) => {
    setError(null);
    setSelectedCaseId(caseId);
    const loaded = (await api.getReviewCase(caseId)) as ReviewDetail;
    setDetail(loaded);
    setEditSummary(loaded.clinician_summary_draft ?? '');
    setEditTriageAction('');
  };

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReviewQueue();
      setQueue(result.items);
      const selected = result.items.some(item => item.case_id === selectedCaseId)
        ? selectedCaseId
        : result.items[0]?.case_id ?? '';
      if (selected) await loadDetail(selected);
      else {
        setSelectedCaseId('');
        setDetail(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The Mock review queue could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    let mounted = true;
    api
      .getReviewQueue()
      .then(async result => {
        if (!mounted) return;
        setQueue(result.items);
        const first = result.items[0]?.case_id ?? '';
        if (first) {
          const loaded = (await api.getReviewCase(first)) as ReviewDetail;
          if (!mounted) return;
          setSelectedCaseId(first);
          setDetail(loaded);
          setEditSummary(loaded.clinician_summary_draft ?? '');
        }
      })
      .catch(err => {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'The Mock review queue could not be loaded.',
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    api
      .getNavigationFunnel()
      .then(setFunnel)
      .catch(err =>
        setFunnelError(
          err instanceof Error ? err.message : 'Mock funnel is unavailable.',
        ),
      );
  }, [authenticated]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.login(username, password);
      if (result.role !== 'REVIEWER') {
        throw new Error('These credentials do not have the Mock Reviewer role.');
      }
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
    try {
      await api.logout();
    } catch {
      /* Local credentials are removed even if the server is unavailable. */
    }
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
    if (
      decision === 'EDIT' &&
      !editTriageAction &&
      (!editSummary.trim() || editSummary.trim() === (detail.clinician_summary_draft ?? ''))
    ) {
      setError(
        'Provide an updated triage action or edited clinician summary before saving an edit.',
      );
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
      ...(decision === 'REQUEST_CLARIFICATION'
        ? { question_ids: clarificationIds }
        : {}),
      ...(decision === 'EDIT'
        ? {
            edits: {
              ...(editTriageAction ? { triage_action: editTriageAction } : {}),
              ...(editSummary.trim()
                ? { clinician_summary: editSummary.trim() }
                : {}),
            },
          }
        : {}),
    };
    try {
      await api.submitReviewDecision(detail.case_id, payload);
      setNotice(
        decision === 'EDIT'
          ? `Mock draft edited for case ${detail.case_id} (version incremented). Record Mock approval when ready.`
          : `Mock review decision (${decision}) recorded for case ${detail.case_id}.`,
      );
      setDecisionNote('');
      setRejectReason('');
      setClarificationIds([]);
      await loadQueue();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The Mock review decision was not recorded.',
      );
      try {
        await loadDetail(detail.case_id);
      } catch {
        /* Keep the original API error visible. */
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="medical-card bg-white p-8 sm:p-10 rounded-3xl border border-[#E2ECF8] shadow-xl space-y-4">
          <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
            CLINICAL REVIEWER ACCESS
          </span>
          <h1 className="text-2xl font-extrabold text-[#072254] mt-3">
            Reviewer access
          </h1>
          <p className="text-sm text-[#475467] leading-relaxed">
            Use the seeded demo account configured for the local API. This is a simulated reviewer role.
          </p>
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-semibold"
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4 pt-2">
            <label className="block text-xs font-bold text-[#0F172A]">
              Username
              <input
                name="username"
                aria-label="Username"
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
              />
            </label>
            <label className="block text-xs font-bold text-[#0F172A]">
              Password
              <input
                type="password"
                name="password"
                aria-label="Password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-pill-primary w-full py-3.5 rounded-full text-xs font-bold text-white shadow-md cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in to Mock Reviewer'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 pb-6 border-b border-[#E2ECF8]">
        <div>
          <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
            CLINICAL REVIEW QUEUE
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] mt-3 tracking-tight">
            Draft Review Queue
          </h1>
          <p className="text-sm text-[#475467] mt-1">
            Review synthetic case drafts. A simulated approval is bound to the current <code>case_version</code> and is not verified clinical care.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer"
        >
          Sign out
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-semibold"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="p-4 rounded-xl bg-[#EBF3FF] border border-[#BCD8FE] text-[#0050CC] text-sm font-semibold"
        >
          {notice}
        </div>
      )}

      {/* Closed-Loop Evaluation Funnel */}
      <section className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2ECF8]">
          <div className="flex items-center gap-2">
            <MockBadge label="MOCK CLOSED-LOOP FUNNEL" />
            <span className="text-xs text-[#64748B]">
              {funnel?.observed_scope ?? 'Loading active synthetic sessions...'}
            </span>
          </div>
          {funnel && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#EBF3FF] text-[#0050CC] border border-[#BCD8FE]">
              EPISODES: {funnel.guidance_episodes}
            </span>
          )}
        </div>
        {funnelError && (
          <p className="text-xs text-[#B54708] font-medium">{funnelError}</p>
        )}
        {funnel && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {(
                [
                  ['Acknowledged', funnel.acknowledgement],
                  ['Navigation started', funnel.navigation_started],
                  ['Booking self-reported', funnel.booking_self_reported],
                  ['Visit self-reported', funnel.visit_self_reported],
                ] as const
              ).map(([label, metric]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] p-4 text-center sm:text-left hover:border-[#BCD8FE] transition-[border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] hover:-translate-y-0.5"
                >
                  <span className="block text-xs font-bold text-[#0F172A]">
                    {label}
                  </span>
                  <strong className="block text-2xl font-extrabold text-[#0066EE] mt-1">
                    {metric.numerator}/{metric.denominator}
                  </strong>
                  <span className="block text-xs text-[#64748B] mt-1">
                    {metric.rate === null
                      ? 'No denominator'
                      : `${Math.round(metric.rate * 100)}%`}{' '}
                    · {metric.verification_source}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#64748B] mt-3">
              Provider-verified visits: <strong className="text-[#0F172A]">{funnel.provider_verified_visits}</strong> · Care completed:{' '}
              <strong className="text-[#0F172A]">{funnel.care_completed}</strong>. These metrics describe synthetic demo events, not care outcomes.
            </p>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 medical-card bg-white p-6 space-y-3.5 rounded-2xl border border-[#E2ECF8] shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2ECF8]">
            <h2 className="text-sm font-bold text-[#0F172A]">
              Pending Mock cases ({queue.length})
            </h2>
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="text-xs font-semibold text-[#0066EE] hover:underline cursor-pointer"
            >
              Refresh
            </button>
          </div>
          {loading && (
            <p className="text-xs text-[#64748B]">Loading queue...</p>
          )}
          {!loading && queue.length === 0 && (
            <p className="text-sm text-[#64748B]">No pending Mock cases.</p>
          )}
          {queue.map(item => (
            <button
              key={item.case_id}
              type="button"
              onClick={() =>
                void loadDetail(item.case_id).catch(err => setError(String(err)))
              }
              className={`w-full text-left p-4 rounded-xl border cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] ${
                selectedCaseId === item.case_id
                  ? 'bg-[#F2F7FF] border-[#BCD8FE] shadow-xs'
                  : 'bg-[#F8FAFC] border-[#E2ECF8] hover:border-[#CBD5E1]'
              }`}
            >
              <span className="block text-xs font-bold text-[#0F172A]">
                {item.case_id} · Mock
              </span>
              <span className="block text-xs font-semibold text-[#0066EE] mt-1">
                Version {item.case_version} · {item.triage_action ?? 'No action'}
              </span>
              <span className="block text-xs text-[#64748B] mt-1">
                Submitted {new Date(item.sent_at).toLocaleString()}
              </span>
            </button>
          ))}
        </aside>

        <section className="lg:col-span-8 medical-card bg-white p-6 sm:p-8 space-y-6 rounded-2xl border border-[#E2ECF8] shadow-md">
          {!detail && (
            <p className="text-sm text-[#64748B]">
              Select a case from the Mock queue.
            </p>
          )}
          {detail && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2ECF8] pb-4">
                <div>
                  <MockBadge label="MOCK CASE DETAIL" />
                  <h2 className="text-xl font-bold text-[#0F172A] mt-2">
                    {detail.case_id}
                  </h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Case version {detail.case_version} · {detail.state}
                  </p>
                </div>
                <div className="text-right p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8]">
                  <span className="block text-xs text-[#64748B]">
                    Draft proposal (Floor: {detail.triage_proposal?.floor ?? 'None'})
                  </span>
                  <strong className="text-sm font-bold text-[#0066EE]">
                    {detail.triage_proposal?.action ?? 'Not available'}
                  </strong>
                  <span className="block text-xs text-[#D92D20] font-medium mt-0.5">
                    {detail.triage_proposal?.approval_status ?? detail.draft_label}
                  </span>
                </div>
              </div>

              <p className="text-xs text-[#475467]">{detail.screening_notice}</p>

              <div>
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wide mb-2.5">
                  Recorded facts
                </h3>
                {detail.facts.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No facts in this draft.</p>
                ) : (
                  <div className="overflow-x-auto border border-[#E2ECF8] rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E2ECF8] bg-[#F8FAFC] text-[#0F172A] font-bold">
                          <th className="py-2.5 px-3.5">Concept</th>
                          <th className="py-2.5 px-3.5">Value / state</th>
                          <th className="py-2.5 px-3.5">Time</th>
                          <th className="py-2.5 px-3.5">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.facts.map((raw, index) => {
                          const fact = raw as {
                            fact_id?: string;
                            concept_code?: string;
                            value?: unknown;
                            state?: string;
                            unit?: string | null;
                            temporal_status?: string | null;
                            source_type?: string;
                            verification_status?: string;
                          };
                          return (
                            <tr
                              key={fact.fact_id ?? index}
                              className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                            >
                              <td className="py-2.5 px-3.5 font-bold text-[#0F172A]">
                                {fact.concept_code ?? 'Unknown'}
                              </td>
                              <td className="py-2.5 px-3.5 font-semibold text-[#0066EE]">
                                {fact.value === null || fact.value === undefined
                                  ? fact.state
                                  : `${String(fact.value)}${
                                      fact.unit ? ` ${fact.unit}` : ''
                                    }`}
                              </td>
                              <td className="py-2.5 px-3.5 text-[#64748B]">
                                {fact.temporal_status ?? 'Not specified'}
                              </td>
                              <td className="py-2.5 px-3.5 text-[#64748B]">
                                {fact.source_type ?? 'Unknown'} ·{' '}
                                {fact.verification_status ?? 'Unknown'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {detail.unknown_fields.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#B54708] uppercase tracking-wide mb-2">
                    Unknown fields
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {detail.unknown_fields.map(item => (
                      <li
                        key={item.concept_code}
                        className="rounded-full bg-[#FFFAEB] border border-[#FEDF89] px-3.5 py-1 text-xs font-medium text-[#B54708]"
                      >
                        {item.concept_code} · {item.state}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.observations.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wide mb-2">
                    Reported observations · Mock
                  </h3>
                  <ul className="space-y-2">
                    {detail.observations.map((raw, index) => {
                      const item = raw as {
                        test_code?: string;
                        value?: unknown;
                        unit?: string | null;
                        confirmation_status?: string;
                        source?: string;
                      };
                      return (
                        <li
                          key={`${item.test_code}-${index}`}
                          className="rounded-xl bg-[#F8FAFC] border border-[#E2ECF8] p-3.5 text-xs"
                        >
                          <strong className="text-[#0F172A]">{item.test_code}:</strong> <span className="font-semibold text-[#0066EE]">{String(item.value ?? 'Unknown')} {item.unit ?? ''}</span> · {item.confirmation_status} ·{' '}
                          {item.source}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {detail.risk_signals.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wide mb-2">
                    Draft rule signals · Mock
                  </h3>
                  <ul className="space-y-1 text-xs text-[#64748B]">
                    {detail.risk_signals.map((signal, index) => (
                      <li key={`${signal.code}-${index}`}>
                        {signal.code} · {signal.status} · {signal.rule_id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.psychosocial_context.length > 0 && (
                <div className="rounded-2xl bg-[#F2F7FF] border border-[#BCD8FE] p-5">
                  <h3 className="text-xs font-bold text-[#0050CC] uppercase tracking-wide">
                    Optional self-reported context · not triage
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-[#475467]">
                    {detail.psychosocial_context.map((raw, index) => {
                      const item = raw as {
                        question_id?: string;
                        response_state?: string;
                        source_type?: string;
                        verification_status?: string;
                      };
                      return (
                        <li key={`${item.question_id}-${index}`}>
                          {item.question_id}: {item.response_state} ·{' '}
                          {item.source_type ?? 'Not reported'} ·{' '}
                          {item.verification_status ?? 'Unverified'}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {detail.limits.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wide mb-2">
                    Draft limits
                  </h3>
                  <ul className="space-y-1 text-xs text-[#64748B]">
                    {detail.limits.map((item, index) => (
                      <li key={`${item.code}-${index}`}>{item.text}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reviewer Decision Controls (APPROVE / EDIT / REQUEST_CLARIFICATION / REJECT) */}
              <div className="space-y-4 border-t border-[#E2ECF8] pt-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <label className="block text-xs font-bold text-[#0F172A]">
                    Optional note for this synthetic review
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={decisionNote}
                      onChange={event => setDecisionNote(event.target.value)}
                      className="mt-1 w-full p-3 rounded-xl border border-[#CBD5E1] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#0F172A]">
                    Clinician summary draft (for EDIT decision)
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={editSummary}
                      onChange={event => setEditSummary(event.target.value)}
                      className="mt-1 w-full p-3 rounded-xl border border-[#CBD5E1] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <label className="text-xs font-bold text-[#0F172A]">
                    Override triage action (EDIT)
                    <select
                      value={editTriageAction}
                      onChange={event =>
                        setEditTriageAction(
                          event.target.value as ReviewableAction | '',
                        )
                      }
                      className="mt-1 w-full p-2.5 rounded-xl border border-[#CBD5E1] bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
                    >
                      <option value="">Keep current proposal</option>
                      {reviewableActions.map(act => (
                        <option key={act} value={act}>
                          {act}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold text-[#0F172A]">
                    Rejection reason
                    <select
                      value={rejectReason}
                      onChange={event =>
                        setRejectReason(event.target.value as RejectReason | '')
                      }
                      className="mt-1 w-full p-2.5 rounded-xl border border-[#CBD5E1] bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
                    >
                      <option value="">Choose only when rejecting</option>
                      {rejectionReasons.map(reason => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="text-xs font-bold text-[#0F172A]">
                    Clarification questions
                    <select
                      multiple
                      value={clarificationIds}
                      onChange={event =>
                        setClarificationIds(
                          Array.from(
                            event.target.selectedOptions,
                            option => option.value,
                          ),
                        )
                      }
                      className="mt-1 w-full p-2.5 rounded-xl border border-[#CBD5E1] bg-white h-20 text-xs focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
                    >
                      {questionCatalogue.questions.map(question => (
                        <option
                          key={question.question_id}
                          value={question.question_id}
                        >
                          {question.question_id} · {question.text}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('APPROVE')}
                    className="btn-pill-primary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Record Mock approval
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('EDIT')}
                    className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Save Draft Edit
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('REQUEST_CLARIFICATION')}
                    className="px-5 py-2.5 rounded-full bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] text-xs font-semibold hover:bg-[#FEF0C7] transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer disabled:opacity-50"
                  >
                    Request clarification
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('REJECT')}
                    className="px-5 py-2.5 rounded-full bg-[#FEF3F2] text-[#D92D20] border border-[#FECDCA] text-xs font-semibold hover:bg-[#FEE4E2] transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer disabled:opacity-50"
                  >
                    Reject Mock draft
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
