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
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="dossier-card bg-white p-6 sm:p-8">
          <MockBadge label="MOCK REVIEWER SIGN-IN" />
          <h1 className="text-2xl font-extrabold text-[#0B1310] mt-4">
            Reviewer access
          </h1>
          <p className="text-sm text-[#3F4E48] mt-2 leading-relaxed">
            Use the seeded demo account configured for the local API. This is a simulated reviewer role.
          </p>
          {error && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-sm"
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <label className="block text-xs font-mono font-bold text-[#0B1310]">
              Username
              <input
                name="username"
                aria-label="Username"
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-[2px] border border-[#0B1310] bg-white px-3 py-2 text-sm font-sans"
              />
            </label>
            <label className="block text-xs font-mono font-bold text-[#0B1310]">
              Password
              <input
                type="password"
                name="password"
                aria-label="Password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-[2px] border border-[#0B1310] bg-white px-3 py-2 text-sm font-sans"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-[2px] bg-[#0F523E] hover:bg-[#093B2C] text-white border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] py-3 font-mono text-xs font-bold btn-press cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in to Mock Reviewer'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-5 border-b border-[#0B1310]">
        <div>
          <MockBadge label="MOCK REVIEWER CONSOLE · SIMULATED ROLE" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] mt-3 tracking-tight">
            Draft Review Queue
          </h1>
          <p className="text-sm text-[#3F4E48] mt-1">
            Review synthetic case drafts. A simulated approval is bound to the current <code className="font-mono">case_version</code> and is not verified clinical care.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="px-4 py-2 rounded-[2px] border border-[#0B1310] bg-white hover:bg-[#E6EAE4] text-xs font-mono font-bold cursor-pointer"
        >
          Sign out
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 p-4 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-sm font-medium"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 p-4 rounded-[2px] bg-[#E6F2EE] border border-[#0F523E] text-[#0F523E] text-sm font-medium"
        >
          {notice}
        </div>
      )}

      {/* Closed-Loop Evaluation Funnel */}
      <section className="mb-8 dossier-card bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#0B1310]">
          <div className="flex items-center gap-2">
            <MockBadge label="MOCK CLOSED-LOOP FUNNEL" />
            <span className="text-xs font-mono text-[#3F4E48]">
              {funnel?.observed_scope ?? 'Loading active synthetic sessions…'}
            </span>
          </div>
          {funnel && (
            <span className="font-mono text-xs font-bold text-[#0F523E]">
              EPISODES: {funnel.guidance_episodes}
            </span>
          )}
        </div>
        {funnelError && (
          <p className="text-xs font-mono text-[#78350F]">{funnelError}</p>
        )}
        {funnel && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                  className="rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-3.5"
                >
                  <span className="block text-xs font-mono font-bold text-[#0B1310]">
                    {label}
                  </span>
                  <strong className="block text-xl font-extrabold font-mono text-[#0F523E] mt-1">
                    {metric.numerator}/{metric.denominator}
                  </strong>
                  <span className="block text-[11px] font-mono text-[#3F4E48] mt-0.5">
                    {metric.rate === null
                      ? 'No denominator'
                      : `${Math.round(metric.rate * 100)}%`}{' '}
                    · {metric.verification_source}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs font-mono text-[#3F4E48] mt-3">
              Provider-verified visits: <strong>{funnel.provider_verified_visits}</strong> · Care completed:{' '}
              <strong>{funnel.care_completed}</strong>. These metrics describe synthetic demo events, not care outcomes.
            </p>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 dossier-card bg-white p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-[#0B1310]">
            <h2 className="text-sm font-extrabold text-[#0B1310]">
              Pending Mock cases ({queue.length})
            </h2>
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="text-xs font-mono font-bold underline text-[#0F523E] cursor-pointer"
            >
              Refresh
            </button>
          </div>
          {loading && (
            <p className="text-xs font-mono text-[#3F4E48]">Loading queue…</p>
          )}
          {!loading && queue.length === 0 && (
            <p className="text-sm text-[#3F4E48]">No pending Mock cases.</p>
          )}
          {queue.map(item => (
            <button
              key={item.case_id}
              type="button"
              onClick={() =>
                void loadDetail(item.case_id).catch(err => setError(String(err)))
              }
              className={`w-full text-left p-3.5 rounded-[2px] border cursor-pointer transition-colors ${
                selectedCaseId === item.case_id
                  ? 'bg-[#E6F2EE] border-[#0F523E]'
                  : 'bg-[#F3F4F1] border-[#0B1310] hover:bg-white'
              }`}
            >
              <span className="block font-mono text-xs font-bold text-[#0B1310]">
                {item.case_id} · Mock
              </span>
              <span className="block text-xs font-mono text-[#0F523E] mt-1">
                Version {item.case_version} · {item.triage_action ?? 'No action'}
              </span>
              <span className="block text-[11px] font-mono text-[#3F4E48] mt-1">
                Submitted {new Date(item.sent_at).toLocaleString()}
              </span>
            </button>
          ))}
        </aside>

        <section className="lg:col-span-8 dossier-card bg-white p-6 sm:p-7 space-y-6">
          {!detail && (
            <p className="text-sm text-[#3F4E48]">
              Select a case from the Mock queue.
            </p>
          )}
          {detail && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#0B1310] pb-4">
                <div>
                  <MockBadge label="MOCK CASE DETAIL" />
                  <h2 className="text-xl font-extrabold text-[#0B1310] mt-2 font-mono">
                    {detail.case_id}
                  </h2>
                  <p className="text-xs font-mono text-[#3F4E48]">
                    Case version {detail.case_version} · {detail.state}
                  </p>
                </div>
                <div className="text-right p-3 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310]">
                  <span className="block text-[10px] font-mono text-[#3F4E48] uppercase">
                    Draft proposal (Floor: {detail.triage_proposal?.floor ?? 'None'})
                  </span>
                  <strong className="text-sm font-mono text-[#0B1310]">
                    {detail.triage_proposal?.action ?? 'Not available'}
                  </strong>
                  <span className="block text-xs font-mono text-[#C84B31]">
                    {detail.triage_proposal?.approval_status ?? detail.draft_label}
                  </span>
                </div>
              </div>

              <p className="text-xs text-[#3F4E48]">{detail.screening_notice}</p>

              <div>
                <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
                  Recorded facts
                </h3>
                {detail.facts.length === 0 ? (
                  <p className="text-xs text-[#3F4E48]">No facts in this draft.</p>
                ) : (
                  <div className="overflow-x-auto border border-[#0B1310] rounded-[2px]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#0B1310] bg-[#E6EAE4] text-[#0B1310]">
                          <th className="py-2 px-3">Concept</th>
                          <th className="py-2 px-3">Value / state</th>
                          <th className="py-2 px-3">Time</th>
                          <th className="py-2 px-3">Source</th>
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
                              className="border-b border-[#C5CEC9] last:border-0"
                            >
                              <td className="py-2 px-3 font-bold">
                                {fact.concept_code ?? 'Unknown'}
                              </td>
                              <td className="py-2 px-3">
                                {fact.value === null || fact.value === undefined
                                  ? fact.state
                                  : `${String(fact.value)}${
                                      fact.unit ? ` ${fact.unit}` : ''
                                    }`}
                              </td>
                              <td className="py-2 px-3">
                                {fact.temporal_status ?? 'Not specified'}
                              </td>
                              <td className="py-2 px-3">
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
                  <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
                    Unknown fields
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {detail.unknown_fields.map(item => (
                      <li
                        key={item.concept_code}
                        className="rounded-[2px] bg-[#FFFBEB] border border-[#B45309] px-3 py-1 text-xs font-mono text-[#78350F]"
                      >
                        {item.concept_code} · {item.state}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.observations.length > 0 && (
                <div>
                  <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
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
                          className="rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-3 text-xs font-mono"
                        >
                          {item.test_code}: {String(item.value ?? 'Unknown')}{' '}
                          {item.unit ?? ''} · {item.confirmation_status} ·{' '}
                          {item.source}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {detail.risk_signals.length > 0 && (
                <div>
                  <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
                    Draft rule signals · Mock
                  </h3>
                  <ul className="space-y-1 text-xs font-mono">
                    {detail.risk_signals.map((signal, index) => (
                      <li key={`${signal.code}-${index}`}>
                        {signal.code} · {signal.status} · {signal.rule_id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.psychosocial_context.length > 0 && (
                <div className="rounded-[2px] bg-[#E6EAE4] border border-[#0B1310] p-4">
                  <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase">
                    Optional self-reported context · not triage
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs font-mono">
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
                  <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
                    Draft limits
                  </h3>
                  <ul className="space-y-1 text-xs text-[#3F4E48]">
                    {detail.limits.map((item, index) => (
                      <li key={`${item.code}-${index}`}>{item.text}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reviewer Decision Controls (APPROVE / EDIT / REQUEST_CLARIFICATION / REJECT) */}
              <div className="space-y-4 border-t border-[#0B1310] pt-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-mono font-bold text-[#0B1310]">
                    Optional note for this synthetic review
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={decisionNote}
                      onChange={event => setDecisionNote(event.target.value)}
                      className="mt-1 w-full p-2.5 rounded-[2px] border border-[#0B1310] bg-white text-sm font-sans"
                    />
                  </label>
                  <label className="block text-xs font-mono font-bold text-[#0B1310]">
                    Clinician summary draft (for EDIT decision)
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={editSummary}
                      onChange={event => setEditSummary(event.target.value)}
                      className="mt-1 w-full p-2.5 rounded-[2px] border border-[#0B1310] bg-white text-sm font-sans"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-xs font-mono font-bold text-[#0B1310]">
                    Override triage action (EDIT)
                    <select
                      value={editTriageAction}
                      onChange={event =>
                        setEditTriageAction(
                          event.target.value as ReviewableAction | '',
                        )
                      }
                      className="mt-1 w-full p-2 rounded-[2px] border border-[#0B1310] bg-white text-xs font-mono"
                    >
                      <option value="">Keep current proposal</option>
                      {reviewableActions.map(act => (
                        <option key={act} value={act}>
                          {act}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-mono font-bold text-[#0B1310]">
                    Rejection reason
                    <select
                      value={rejectReason}
                      onChange={event =>
                        setRejectReason(event.target.value as RejectReason | '')
                      }
                      className="mt-1 w-full p-2 rounded-[2px] border border-[#0B1310] bg-white text-xs font-sans"
                    >
                      <option value="">Choose only when rejecting</option>
                      {rejectionReasons.map(reason => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="text-xs font-mono font-bold text-[#0B1310]">
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
                      className="mt-1 w-full p-2 rounded-[2px] border border-[#0B1310] bg-white h-20 text-xs font-sans"
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

                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('APPROVE')}
                    className="px-4 py-2.5 rounded-[2px] bg-[#0F523E] hover:bg-[#093B2C] text-white border border-[#0B1310] font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Record Mock approval
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('EDIT')}
                    className="px-4 py-2.5 rounded-[2px] bg-[#0B1310] hover:bg-[#3F4E48] text-white border border-[#0B1310] font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Save Draft Edit
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('REQUEST_CLARIFICATION')}
                    className="px-4 py-2.5 rounded-[2px] bg-[#FFFBEB] text-[#78350F] border border-[#B45309] font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Request clarification
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('REJECT')}
                    className="px-4 py-2.5 rounded-[2px] bg-[#FEF2F2] text-[#7F1D1D] border border-[#B91C1C] font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
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
