import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { LoadingView } from '../components/LoadingView';
import {
  api,
  type CaseConsentRecord,
  type CaseState,
  type ReportData,
} from '../api/client';
import { buildReadableSummary } from './summaryModel';

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
  const [showPrintView, setShowPrintView] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingEvidence, setUpdatingEvidence] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleQuickExit = () => {
      setShowPrintView(false);
      setReport(null);
      try {
        document.title = 'Sanad';
      } catch {
        /* Ignore title errors in restricted environments. */
      }
    };
    window.addEventListener('sanad:quick-exit', handleQuickExit);
    return () => {
      window.removeEventListener('sanad:quick-exit', handleQuickExit);
    };
  }, []);

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

  const readableSummary = buildReadableSummary(report);

  const handleOpenPrintSummary = () => {
    setSummaryError(null);
    const previousTitle = typeof document !== 'undefined' ? document.title : 'Sanad';
    try {
      if (typeof document !== 'undefined') {
        document.title = `sanad-summary-${readableSummary.sessionDate}`;
      }
      flushSync(() => {
        setShowPrintView(true);
      });
    } catch {
      setShowPrintView(true);
    }
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      try {
        window.print();
      } finally {
        if (typeof document !== 'undefined') {
          document.title = previousTitle || 'Sanad';
        }
      }
    }
  };

  const handleClosePrintSummary = () => {
    setShowPrintView(false);
    if (typeof document !== 'undefined') {
      document.title = 'Sanad';
    }
  };

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 sm:py-12 space-y-8">
      <div className="no-print space-y-8">
      <div className="mb-6 pb-6 border-b border-[#E2ECF8] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
                SYNTHESIS REPORT
              </span>
              <span className="text-xs text-[#64748B] font-medium">
                VERSION {caseState?.case_version ?? 1} · {report.review_status}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
              Clinical Assessment Synthesis
            </h1>
            <p className="text-sm sm:text-base text-[#4A6588] mt-1 leading-relaxed max-w-2xl">
              {report.screening_notice}
            </p>
          </div>
          <img
            src="/assets/images/real_andrology_specialist.jpg"
            alt="Clinical Synthesis"
            className="w-24 h-16 rounded-xl object-cover border border-[#BCD8FE] shadow-2xs hidden sm:block shrink-0"
          />
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
          className="p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-semibold"
        >
          {error}
        </div>
      )}

      {/* Recorded Information, Unknown States & Observations */}
      <section className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#E2ECF8]">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              What this draft contains
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              {report.draft_label}
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#EBF3FF] border border-[#BCD8FE] text-[#0050CC]">
            {report.review_status}
          </span>
        </div>

        {report.known.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[#0050CC] uppercase tracking-wide mb-3">
              Recorded Information ({report.known.length})
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.known.map((fact, index) => (
                <li
                  key={`${fact.concept_code}-${index}`}
                  className="rounded-xl bg-[#F8FAFC] border border-[#E2ECF8] p-4 text-sm hover:border-[#BCD8FE] transition-[border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] hover:-translate-y-0.5"
                >
                  <span className="font-bold text-[#0F172A] capitalize">
                    {fact.concept_code.replace(/_/g, ' ')}
                  </span>
                  :{' '}
                  <span className="font-semibold text-[#0050CC]">
                    {String(fact.value ?? fact.verification_status)}
                    {fact.unit ? ` ${fact.unit}` : ''}
                  </span>
                  <span className="block text-xs text-[#64748B] mt-1">
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
            <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wide mb-3">
              Reported Lab Observations · Mock
            </h3>
            <ul className="space-y-2.5">
              {report.observations.map((item, index) => (
                <li
                  key={`${item.test_code}-${index}`}
                  className="rounded-xl bg-[#F8FAFC] border border-[#E2ECF8] p-4 text-sm flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <strong className="text-xs text-[#0F172A] font-semibold">
                      {item.test_code.replace(/_/g, ' ')}:
                    </strong>{' '}
                    <span className="font-bold text-[#0050CC]">
                      {item.value ?? 'Unknown'}
                      {item.unit ? ` ${item.unit}` : ''}
                    </span>
                    <span className="block text-xs text-[#64748B] mt-0.5">
                      {item.source} · {item.confirmation_status}
                      {item.collected_on ? ` · ${item.collected_on}` : ''}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-0.5 rounded-full border ${
                      item.used_in_assessment
                        ? 'bg-[#EBF3FF] text-[#0050CC] border-[#BCD8FE]'
                        : 'bg-white text-[#64748B] border-[#CBD5E1]'
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
          <div className="p-5 rounded-2xl bg-[#F2F7FF] border border-[#BCD8FE]">
            <h3 className="text-xs font-bold text-[#0050CC] uppercase tracking-wide">
              Optional Psychosocial Context (Excluded from Triage)
            </h3>
            <p className="text-xs text-[#475467] mt-1.5 leading-relaxed">
              {report.psychosocial_context_use}
            </p>
          </div>
        )}

        {report.excluded_items.length > 0 && (
          <p className="text-xs text-[#D92D20] font-semibold">
            Excluded from this draft: {report.excluded_items.join(', ')}
          </p>
        )}
      </section>

      {/* J2 Selective Evidence Controls (PUT /cases/{id}/evidence-selection) */}
      {canSelectEvidence && (
        <section className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2ECF8]">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Selective Evidence Control (J2 · RF-16)
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
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
                  className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] flex flex-col justify-between gap-3.5 hover:border-[#BCD8FE] transition-[border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] hover:-translate-y-0.5"
                >
                  <div>
                    <span className="text-[11px] font-bold text-[#0066EE]">
                      {meta.item_id}
                    </span>
                    <h3 className="text-xs font-bold text-[#0F172A] mt-0.5">
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
                        : 'bg-[#0066EE] text-white hover:bg-[#0050CC] shadow-xs'
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
      <section className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-5">
        <div className="pb-3 border-b border-[#E2ECF8] flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#0F172A]">
            Draft rule output
          </h2>
          <span className="text-xs text-[#64748B] font-medium">
            Rule version {report.rule_version} · {report.rule_approval_status}
          </span>
        </div>

        {report.required_statements.map((statement, index) => (
          <p key={index} className="text-sm text-[#0F172A] leading-relaxed">
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
            <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wide mb-2">
              Evidence status
            </h3>
            <ul className="space-y-1.5 text-xs text-[#64748B]">
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
        <section className="medical-card-sapphire p-8 rounded-3xl space-y-4 shadow-xl">
          <span className="text-xs font-mono font-bold text-white bg-white/20 px-3 py-1 rounded-full border border-white/30 inline-block">
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
            className="mt-4 btn-pill-primary w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-sm text-white shadow-lg cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
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

      <section className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <h2 className="text-base font-bold text-[#0F172A]">Keep a summary for your next visit</h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Open a printable summary you can read, print, or save as a PDF to show a doctor.
              Sanad builds this summary in your browser and does not store a server copy.
            </p>
            {summaryError && <p className="text-xs text-[#B54708] mt-1">{summaryError}</p>}
          </div>
          <button
            type="button"
            data-testid="download-summary-pdf"
            onClick={handleOpenPrintSummary}
            className="btn-pill-primary w-full sm:w-auto px-6 py-3 rounded-full text-xs font-bold text-white shadow-md cursor-pointer whitespace-nowrap"
          >
            Download my summary (PDF)
          </button>
        </div>

        <div className="pt-4 border-t border-[#E2ECF8] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <p className="text-[#64748B]">
            For &ldquo;Upload profile&rdquo; on a future visit — this technical file is not meant to be read.
          </p>
          <button
            type="button"
            data-testid="download-summary-json"
            onClick={() => {
              setSummaryError(null);
              api.downloadSummary(caseId).catch(err =>
                setSummaryError(err instanceof Error ? err.message : 'Download failed.'),
              );
            }}
            className="text-xs font-semibold text-[#0050CC] hover:text-[#003E99] underline cursor-pointer text-left sm:text-right whitespace-nowrap"
          >
            Save my answers to reuse next time (.json)
          </button>
        </div>
      </section>

      {canRequestReview && (
        <section className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#BCD8FE] shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              Request Mock Reviewer Review
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              A simulated reviewer role will review this synthetic draft. This does not represent verified clinical care.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleRequestReview()}
            className="btn-pill-primary w-full sm:w-auto px-7 py-3 rounded-full text-xs font-bold text-white shadow-md cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <span>{submitting ? 'Sending...' : 'Request Mock Review'}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </section>
      )}

      {report.review_status === 'NOT_SENT' && !reviewGranted && (
        <div className="rounded-2xl bg-white border border-[#E2ECF8] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-[#0F172A] shadow-xs">
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

      {showPrintView && (
        <article
          data-testid="printable-summary"
          aria-label="Sanad screening summary"
          className="sanad-print-summary bg-white text-[#0F172A] p-6 sm:p-10 rounded-2xl border border-[#CBD5E1] shadow-lg space-y-6"
        >
          <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2ECF8]">
            <span className="text-xs font-semibold text-[#475467]">
              Print-friendly preview · File name: <code className="font-mono">{readableSummary.pdfFileName}</code>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenPrintSummary}
                className="btn-pill-primary px-4 py-2 rounded-full text-xs font-bold text-white cursor-pointer"
              >
                Print / Save as PDF
              </button>
              <button
                type="button"
                data-testid="close-print-summary"
                onClick={handleClosePrintSummary}
                className="btn-pill-secondary px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
              >
                Close summary
              </button>
            </div>
          </div>

          <header className="sanad-print-section pb-4 border-b border-[#CBD5E1] space-y-1">
            <h1 className="text-2xl font-extrabold text-[#0F172A]">
              {readableSummary.title}
            </h1>
            <p className="text-sm text-[#334155]">
              Session date: {readableSummary.sessionDate}
            </p>
            <p className="text-sm font-bold text-[#0F172A]">
              {readableSummary.screeningNotice}
            </p>
            <p className="text-xs font-semibold text-[#475467]">
              {readableSummary.prototypeNotice}
            </p>
          </header>

          <section className="sanad-print-section space-y-3">
            <h2 className="text-lg font-bold text-[#0F172A]">What you told us</h2>
            {readableSummary.whatYouToldUs.length === 0 ? (
              <p className="text-sm text-[#334155]">No health questions were answered in this session.</p>
            ) : (
              <ul className="space-y-2 text-sm text-[#0F172A]">
                {readableSummary.whatYouToldUs.map((item, idx) => (
                  <li key={idx} className="py-1.5 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                    <span className="font-semibold">{item.question}</span>
                    <span className="text-[#1E293B]">
                      <strong>{item.answer}</strong>{' '}
                      <span className="text-xs text-[#475467]">({item.status})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {readableSummary.observations.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Reported lab values (Mock)
                </h3>
                <ul className="space-y-1.5 text-sm text-[#0F172A]">
                  {readableSummary.observations.map((obs, idx) => (
                    <li key={idx} className="py-1 border-b border-[#E2E8F0]">
                      <span className="font-semibold">{obs.label}:</span>{' '}
                      <strong>{obs.valueText}</strong> —{' '}
                      <span className="text-xs text-[#475467]">{obs.statusText}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="sanad-print-section space-y-2">
            <h2 className="text-lg font-bold text-[#0F172A]">
              What your numbers mean, and what is unclear
            </h2>
            {readableSummary.whatNumbersMeanAndUnclear.map((line, idx) => (
              <p key={idx} className="text-sm text-[#1E293B] leading-relaxed">
                {line}
              </p>
            ))}
          </section>

          <section className="sanad-print-section space-y-2">
            <h2 className="text-lg font-bold text-[#0F172A]">Your allowed next step</h2>
            <p className="text-sm font-semibold text-[#0F172A] leading-relaxed">
              {readableSummary.allowedNextStep}
            </p>
          </section>

          <section className="sanad-print-section space-y-2">
            <h2 className="text-lg font-bold text-[#0F172A]">Limits and sources</h2>
            {readableSummary.limits.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-sm text-[#1E293B]">
                {readableSummary.limits.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            )}
            <div className="pt-1 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#475467]">
                Cited sources
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-[#1E293B]">
                {readableSummary.sources.map((src, idx) => (
                  <li key={idx}>{src}</li>
                ))}
              </ul>
            </div>
          </section>

          <footer className="sanad-print-section pt-4 border-t border-[#CBD5E1] text-sm text-[#0F172A] space-y-1">
            <p className="font-bold text-[#B42318]">
              {readableSummary.emergencyText}
            </p>
            <p className="text-xs text-[#334155]">
              Emergency guidance (Mock):{' '}
              <a href={readableSummary.emergencyHref} className="underline text-[#0050CC]">
                {readableSummary.emergencyHref}
              </a>
            </p>
          </footer>
        </article>
      )}
    </div>
  );
};
