import { useEffect, useState } from 'react';
import { LoadingView } from '../components/LoadingView';
import {
  api,
  type CaseConsentRecord,
  type CaseState,
  type ReportData,
} from '../api/client';

interface ResultScreenProps {
  caseId: string;
  onProceedToReferral: (route: string) => void;
  onOpenLab?: () => void;
  onOpenConsent?: () => void;
}

const EVIDENCE_ITEMS_META: Array<{
  item_id: string;
  label: string;
  concepts: string[];
}> = [
  {
    item_id: 'ITEM-HISTORY',
    label: 'Personal & Family Health History',
    concepts: ['type2_diabetes', 'family_history_reported'],
  },
  {
    item_id: 'ITEM-MEDICINES',
    label: 'Regular Medicines',
    concepts: ['regular_medicines'],
  },
  {
    item_id: 'ITEM-GENETICS-RESULT',
    label: 'Genetics Result Availability',
    concepts: ['genetics_result_available'],
  },
];

export const ResultScreen: React.FC<ResultScreenProps> = ({
  caseId,
  onProceedToReferral,
  onOpenLab,
  onOpenConsent,
}) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [consent, setConsent] = useState<CaseConsentRecord | null>(null);
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingEvidence, setUpdatingEvidence] = useState(false);
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
      setError(
        err instanceof Error ? err.message : 'The draft report is unavailable.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.getReport(caseId),
      api.getCaseConsent(caseId),
      api.getCaseState(caseId),
    ])
      .then(([currentReport, currentConsent, currentState]) => {
        if (!mounted) return;
        setReport(currentReport);
        setConsent(currentConsent);
        setCaseState(currentState);
      })
      .catch(err => {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'The draft report is unavailable.',
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [caseId]);

  const handleRequestReview = async () => {
    if (!caseState) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.requestReview(caseId, caseState.case_version);
      onProceedToReferral(result.state.route);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The review request was not recorded.',
      );
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
      setError(
        err instanceof Error ? err.message : 'Navigation could not be started.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEvidence = async (itemId: string, currentlyExcluded: boolean) => {
    setUpdatingEvidence(true);
    setError(null);
    try {
      await api.selectEvidence(caseId, [{ item_id: itemId, use: currentlyExcluded }]);
      const entryPath =
        (sessionStorage.getItem('sanad_case_entry_path') as
          | 'FULL_INTAKE'
          | 'LAB_ONLY') || 'FULL_INTAKE';
      await api.assessCase(caseId, entryPath);
      await loadReport();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Evidence selection could not be updated.',
      );
    } finally {
      setUpdatingEvidence(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-reveal-1">
        <LoadingView
          title="Synthesizing Your Clinical Assessment"
          subtitle="Cross-referencing confirmed health facts against clinical reference standards…"
          variant="card"
        />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div
          role="alert"
          className="p-6 rounded-2xl bg-[#FFFAEB] border border-[#FEDF89] text-[#B54708] text-sm shadow-sm"
        >
          <p>{error ?? 'The current draft is unavailable.'}</p>
          <button
            type="button"
            onClick={() => void loadReport()}
            className="mt-3 underline font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const reviewGranted = consent?.scopes.clinician_review?.granted === true;
  const canRequestReview =
    report.review_status === 'NOT_SENT' &&
    reviewGranted &&
    caseState?.allowed_actions.includes('SEND_FOR_REVIEW');
  const canSelectEvidence = caseState?.allowed_actions.includes('SELECT_EVIDENCE');

  const presentConcepts = new Set([
    ...report.known.map(f => f.concept_code),
    ...report.unknown.map(u => u.concept_code),
  ]);

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 sm:py-12 space-y-8">
      <div className="mb-6 pb-6 border-b border-[#E4DFD3] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold text-[#1F4D3F] bg-[#E8EFEA] px-2.5 py-0.5 rounded-full border border-[#C8D6CC]">
                SYNTHESIS REPORT
              </span>
              <span className="text-xs text-[#575C55] font-medium">
                VERSION {caseState?.case_version ?? 1} · {report.review_status}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1F1C] tracking-tight">
              Your summary
            </h1>
            <p className="text-sm sm:text-base text-[#575C55] mt-1 leading-relaxed max-w-2xl">
              {report.screening_notice}
            </p>
          </div>
        </div>

        {onOpenLab && caseState?.allowed_actions.includes('ENTER_OBSERVATION') && (
          <button
            type="button"
            onClick={onOpenLab}
            className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Manage Lab Observations (J3) →
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FBEDEA] border border-[#F0C9C2] text-[#B3261E] text-sm font-semibold"
        >
          {error}
        </div>
      )}

      {/* Recorded Information, Unknown States & Observations */}
      <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E4DFD3]">
          <div>
            <h2 className="text-base font-bold text-[#1A1F1C]">
              What this draft contains
            </h2>
            <p className="text-xs text-[#575C55] mt-1">
              {report.draft_label}
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#E8EFEA] border border-[#C8D6CC] text-[#163A2F]">
            {report.review_status}
          </span>
        </div>

        {report.known.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[#163A2F] uppercase tracking-wide mb-3">
              Recorded Information ({report.known.length})
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.known.map((fact, index) => (
                <li
                  key={`${fact.concept_code}-${index}`}
                  className="rounded-xl bg-[#F7F5EF] border border-[#E4DFD3] p-4 text-sm hover:border-[#C8D6CC] transition-[border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] hover:-translate-y-0.5"
                >
                  <span className="font-bold text-[#1A1F1C] capitalize">
                    {fact.concept_code.replace(/_/g, ' ')}
                  </span>
                  :{' '}
                  <span className="font-semibold text-[#163A2F]">
                    {String(fact.value ?? fact.verification_status)}
                    {fact.unit ? ` ${fact.unit}` : ''}
                  </span>
                  <span className="block text-xs text-[#575C55] mt-1">
                    {fact.source_type} · {fact.verification_status}
                    {fact.temporal_status ? ` · ${fact.temporal_status}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.unknown.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[#B54708] uppercase tracking-wide mb-3">
              Unknown or Not Provided ({report.unknown.length})
            </h3>
            <ul className="flex flex-wrap gap-2">
              {report.unknown.map(item => (
                <li
                  key={item.concept_code}
                  className="rounded-full bg-[#FFFAEB] border border-[#FEDF89] px-3.5 py-1 text-xs font-medium text-[#B54708]"
                >
                  {item.concept_code.replace(/_/g, ' ')} · {item.state}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.observations.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide mb-3">
              Reported Lab Observations · Mock
            </h3>
            <ul className="space-y-2.5">
              {report.observations.map((item, index) => (
                <li
                  key={`${item.test_code}-${index}`}
                  className="rounded-xl bg-[#F7F5EF] border border-[#E4DFD3] p-4 text-sm flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <strong className="text-xs text-[#1A1F1C] font-semibold">
                      {item.test_code.replace(/_/g, ' ')}:
                    </strong>{' '}
                    <span className="font-bold text-[#163A2F]">
                      {item.value ?? 'Unknown'}
                      {item.unit ? ` ${item.unit}` : ''}
                    </span>
                    <span className="block text-xs text-[#575C55] mt-0.5">
                      {item.source} · {item.confirmation_status}
                      {item.collected_on ? ` · ${item.collected_on}` : ''}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-0.5 rounded-full border ${
                      item.used_in_assessment
                        ? 'bg-[#E8EFEA] text-[#163A2F] border-[#C8D6CC]'
                        : 'bg-[#FBFAF6] text-[#575C55] border-[#D6D0C2]'
                    }`}
                  >
                    {item.used_in_assessment ? 'USED IN DRAFT' : 'NOT USED'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.psychosocial_context.length > 0 && (
          <div className="p-5 rounded-2xl bg-[#F7F5EF] border border-[#C8D6CC]">
            <h3 className="text-xs font-bold text-[#163A2F] uppercase tracking-wide">
              Optional Psychosocial Context (Excluded from Triage)
            </h3>
            <p className="text-xs text-[#575C55] mt-1.5 leading-relaxed">
              {report.psychosocial_context_use}
            </p>
          </div>
        )}

        {report.excluded_items.length > 0 && (
          <p className="text-xs text-[#B3261E] font-semibold">
            Excluded from this draft: {report.excluded_items.join(', ')}
          </p>
        )}
      </section>

      {/* J2 Selective Evidence Controls (PUT /cases/{id}/evidence-selection) */}
      {canSelectEvidence && (
        <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E4DFD3]">
            <div>
              <h2 className="text-base font-bold text-[#1A1F1C]">
                Selective Evidence Control (J2 · RF-16)
              </h2>
              <p className="text-xs text-[#575C55] mt-0.5">
                Include or exclude optional evidence categories and regenerate the draft immediately.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {EVIDENCE_ITEMS_META.map(meta => {
              const isExcluded = report.excluded_items.includes(meta.item_id);
              const hasRelevantFact =
                meta.concepts.some(c => presentConcepts.has(c)) || isExcluded;
              if (!hasRelevantFact) {
                return null;
              }
              return (
                <div
                  key={meta.item_id}
                  className="p-4 rounded-2xl bg-[#F7F5EF] border border-[#E4DFD3] flex flex-col justify-between gap-3.5 hover:border-[#C8D6CC] transition-[border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] hover:-translate-y-0.5"
                >
                  <div>
                    <span className="text-[11px] font-bold text-[#1F4D3F]">
                      {meta.item_id}
                    </span>
                    <h3 className="text-xs font-bold text-[#1A1F1C] mt-0.5">
                      {meta.label}
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={updatingEvidence}
                    onClick={() => void handleToggleEvidence(meta.item_id, isExcluded)}
                    className={`w-full py-2 px-3.5 rounded-full text-xs font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                      isExcluded
                        ? 'btn-pill-secondary'
                        : 'bg-[#1F4D3F] text-white hover:bg-[#163A2F] shadow-xs'
                    }`}
                  >
                    {isExcluded ? 'Include in Draft' : 'Included (Click to Exclude)'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Draft Rule Output & Limits */}
      <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-5">
        <div className="pb-3 border-b border-[#E4DFD3] flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#1A1F1C]">
            Draft rule output
          </h2>
          <span className="text-xs text-[#575C55] font-medium">
            Rule version {report.rule_version} · {report.rule_approval_status}
          </span>
        </div>

        {report.required_statements.map((statement, index) => (
          <p key={index} className="text-sm text-[#1A1F1C] leading-relaxed">
            {statement}
          </p>
        ))}

        {report.limits.length > 0 && (
          <ul className="space-y-2.5">
            {report.limits.map((limit, index) => (
              <li
                key={`${limit.code}-${index}`}
                className="rounded-xl bg-[#FFFAEB] border border-[#FEDF89] p-4 text-sm text-[#B54708]"
              >
                <strong className="text-xs mr-1.5 font-bold">[{limit.code}]</strong>
                {limit.text}
              </li>
            ))}
          </ul>
        )}

        {report.evidence.length > 0 && (
          <div className="pt-2">
            <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide mb-2">
              Evidence status
            </h3>
            <ul className="space-y-1.5 text-xs text-[#575C55]">
              {report.evidence.map((item, index) => (
                <li key={`${item.claim_id}-${index}`}>
                  {item.claim_id}: {item.status}
                  {item.citation
                    ? ` · ${item.citation.source_id} v${item.citation.version}`
                    : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {report.next_step && (
        <section className="medical-card-sapphire p-8 rounded-2xl space-y-4 shadow-[var(--shadow-2)]">
          <span className="text-xs font-mono font-bold text-white bg-[#FBFAF6]/20 px-3 py-1 rounded-full border border-white/30 inline-block">
            RECOMMENDED NEXT STEP
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-3">
            {report.next_step.label}
          </h2>
          {report.why_next_step && (
            <p className="text-sm text-[#C5D8F6] leading-relaxed">
              {report.why_next_step}
            </p>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleStartNavigation()}
            className="mt-4 btn-pill-primary w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-sm text-white shadow-[var(--shadow-2)] cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <span>{submitting ? 'Starting...' : 'Continue to Mock Care Navigation'}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </section>
      )}

      {report.next_step_withheld && (
        <div className="rounded-2xl bg-[#FFFAEB] border border-[#FEDF89] p-5 text-sm text-[#B54708] font-medium">
          A next step is withheld until the required review is complete. Current status:{' '}
          <strong className="font-bold">{report.next_step_withheld}</strong>.
        </div>
      )}

      <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#1A1F1C]">Keep a summary for your next visit</h2>
          <p className="text-xs text-[#575C55] mt-1">
            The file holds your answers to these health questions. Sanad does not keep a copy, so
            store it somewhere private. Next time, start with "Upload profile" to skip repeating
            them; you can still change any answer.
          </p>
          {summaryError && <p className="text-xs text-[#B54708] mt-1">{summaryError}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            setSummaryError(null);
            api.downloadSummary(caseId).catch(err =>
              setSummaryError(err instanceof Error ? err.message : 'Download failed.'),
            );
          }}
          className="w-full sm:w-auto px-6 py-3 rounded-full text-xs font-bold border border-[#C8D6CC] text-[#163A2F] bg-[#FBFAF6] cursor-pointer whitespace-nowrap"
        >
          Download my summary
        </button>
      </section>

      {canRequestReview && (
        <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#C8D6CC] shadow-[var(--shadow-1)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#1A1F1C]">
              Request Mock Reviewer Review
            </h2>
            <p className="text-xs text-[#575C55] mt-1">
              A simulated reviewer role will review this synthetic draft. This does not represent verified clinical care.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleRequestReview()}
            className="btn-pill-primary w-full sm:w-auto px-7 py-3 rounded-full text-xs font-bold text-white shadow-[var(--shadow-1)] cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <span>{submitting ? 'Sending...' : 'Request Mock Review'}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </section>
      )}

      {report.review_status === 'NOT_SENT' && !reviewGranted && (
        <div className="rounded-2xl bg-[#FBFAF6] border border-[#E4DFD3] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-[#1A1F1C] shadow-xs">
          <span>
            Reviewer access was not consented to. Return to consent settings to enable this optional step.
          </span>
          {onOpenConsent && (
            <button
              type="button"
              onClick={onOpenConsent}
              className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Open Consent Settings
            </button>
          )}
        </div>
      )}
    </div>
  );
};
