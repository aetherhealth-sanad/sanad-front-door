import { useEffect, useState } from 'react';
import { api, type CaseConsentRecord, type CaseState, type ReportData } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface ResultScreenProps {
  caseId: string;
  onProceedToReferral: (route: string) => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ caseId, onProceedToReferral }) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [consent, setConsent] = useState<CaseConsentRecord | null>(null);
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentReport, currentConsent, currentState] = await Promise.all([
        api.getReport(caseId),
        api.getCaseConsent(caseId),
        api.getCaseState(caseId),
      ]);
      setReport(currentReport);
      setConsent(currentConsent);
      setCaseState(currentState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The draft report is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReport(); }, [caseId]);

  const handleRequestReview = async () => {
    if (!caseState) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.requestReview(caseId, caseState.case_version);
      onProceedToReferral(result.state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The review request was not recorded.');
      await loadReport();
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNavigation = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const state = await api.startNavigation(caseId);
      onProceedToReferral(state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Navigation could not be started.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="max-w-md mx-auto px-4 py-20 text-center text-sm text-slate-600">Loading the current draft…</div>;

  if (!report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div role="alert" className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <p>{error ?? 'The current draft is unavailable.'}</p>
          <button type="button" onClick={() => void loadReport()} className="mt-3 underline font-semibold">Retry</button>
        </div>
      </div>
    );
  }

  const reviewGranted = consent?.scopes.clinician_review?.granted === true;
  const isReleased = report.review_status === 'SIMULATED_APPROVAL';
  const canRequestReview = report.review_status === 'NOT_SENT' && reviewGranted && caseState?.allowed_actions.includes('SEND_FOR_REVIEW');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label={`MOCK DRAFT REPORT · ${report.rule_approval_status}`} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Assessment draft</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{report.screening_notice}</p>
      </div>

      {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">{error}</div>}

      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">What this draft contains</h2>
            <p className="text-sm text-slate-600 mt-1">{report.draft_label}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{report.review_status}</span>
        </div>
        {report.known.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Recorded information</h3>
            <ul className="space-y-2">
              {report.known.map((fact, index) => (
                <li key={`${fact.concept_code}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <span className="font-medium">{fact.concept_code.replace(/_/g, ' ')}</span>: {String(fact.value ?? fact.verification_status)}{fact.unit ? ` ${fact.unit}` : ''}
                  <span className="block text-xs text-slate-500 mt-1">{fact.source_type} · {fact.verification_status}{fact.temporal_status ? ` · ${fact.temporal_status}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.unknown.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Unknown or not provided</h3>
            <ul className="flex flex-wrap gap-2">
              {report.unknown.map(item => <li key={item.concept_code} className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs text-amber-900">{item.concept_code.replace(/_/g, ' ')} · {item.state}</li>)}
            </ul>
          </div>
        )}
        {report.observations.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Reported observations</h3>
            <ul className="space-y-2">
              {report.observations.map((item, index) => (
                <li key={`${item.test_code}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                  {item.test_code.replace(/_/g, ' ')}: {item.value ?? 'Unknown'}{item.unit ? ` ${item.unit}` : ''}
                  <span className="block text-xs text-slate-500 mt-1">{item.source} · {item.confirmation_status}{item.collected_on ? ` · ${item.collected_on}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.excluded_items.length > 0 && <p className="text-xs text-slate-600">Excluded from this draft: {report.excluded_items.join(', ')}</p>}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Draft rule output</h2>
        <p className="text-xs text-slate-600">Rule version {report.rule_version} · {report.rule_approval_status}</p>
        {report.required_statements.map((statement, index) => <p key={index} className="text-sm text-slate-700">{statement}</p>)}
        {report.limits.length > 0 && (
          <ul className="space-y-2">
            {report.limits.map((limit, index) => <li key={`${limit.code}-${index}`} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{limit.text}</li>)}
          </ul>
        )}
        {report.evidence.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Evidence status</h3>
            <ul className="space-y-1 text-xs text-slate-600">
              {report.evidence.map((item, index) => <li key={`${item.claim_id}-${index}`}>{item.claim_id}: {item.status}{item.citation ? ` · ${item.citation.source_id} v${item.citation.version}` : ''}</li>)}
            </ul>
          </div>
        )}
      </section>

      {report.next_step && (
        <section className="bg-sky-50 border border-sky-200 rounded-2xl p-6 mb-6">
          <MockBadge label="MOCK GUIDANCE · SIMULATED REVIEW" />
          <h2 className="text-base font-bold text-sky-950 mt-3">{report.next_step.label}</h2>
          {report.why_next_step && <p className="text-sm text-sky-900 mt-2">{report.why_next_step}</p>}
          <button type="button" disabled={submitting} onClick={handleStartNavigation} className="mt-4 w-full sm:w-auto px-5 py-3 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-semibold disabled:opacity-60">
            {submitting ? 'Starting…' : 'Continue to Mock Care Navigation'}
          </button>
        </section>
      )}

      {report.next_step_withheld && <p className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">A next step is withheld until the required review is complete. Current status: {report.next_step_withheld}.</p>}

      {canRequestReview && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Request Mock Reviewer Review</h2>
            <p className="text-xs text-slate-600 mt-1">A simulated reviewer role will review this synthetic draft. This does not represent verified clinical care.</p>
          </div>
          <button type="button" disabled={submitting} onClick={handleRequestReview} className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60">
            {submitting ? 'Sending…' : 'Request Mock Review'}
          </button>
        </section>
      )}

      {report.review_status === 'NOT_SENT' && !reviewGranted && (
        <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">Reviewer access was not consented to. Return to consent settings to enable this optional step.</p>
      )}
    </div>
  );
};
