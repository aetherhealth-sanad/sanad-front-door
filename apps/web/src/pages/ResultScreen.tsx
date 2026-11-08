import { useEffect, useState } from 'react';
import {
  api,
  type CaseConsentRecord,
  type CaseState,
  type ReportData,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

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
      <div className="max-w-md mx-auto px-4 py-20 text-center text-sm font-mono text-[#3F4E48]">
        Loading the current draft…
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div
          role="alert"
          className="p-5 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm"
        >
          <p>{error ?? 'The current draft is unavailable.'}</p>
          <button
            type="button"
            onClick={() => void loadReport()}
            className="mt-3 underline font-mono font-bold cursor-pointer"
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <MockBadge label={`MOCK DRAFT REPORT · ${report.rule_approval_status}`} />
            <span className="font-mono text-xs text-[#3F4E48]">
              VERSION {caseState?.case_version ?? 1} · {report.review_status}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            Assessment Synthesis Draft
          </h1>
          <p className="text-sm sm:text-base text-[#3F4E48] mt-1.5 leading-relaxed">
            {report.screening_notice}
          </p>
        </div>

        {onOpenLab && caseState?.allowed_actions.includes('ENTER_OBSERVATION') && (
          <button
            type="button"
            onClick={onOpenLab}
            className="px-4 py-2.5 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
          >
            Manage Lab Observations (J3) →
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm font-medium"
        >
          {error}
        </div>
      )}

      {/* Recorded Information, Unknown States & Observations */}
      <section className="dossier-card bg-white p-6 sm:p-8 mb-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#0B1310]">
          <div>
            <h2 className="text-base font-extrabold text-[#0B1310]">
              What this draft contains
            </h2>
            <p className="text-xs font-mono text-[#3F4E48] mt-1">
              {report.draft_label}
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-[2px] bg-[#E6EAE4] border border-[#0B1310] text-[#0B1310]">
            {report.review_status}
          </span>
        </div>

        {report.known.length > 0 && (
          <div>
            <h3 className="text-xs font-mono font-bold text-[#0F523E] uppercase mb-2.5">
              Recorded Information ({report.known.length})
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {report.known.map((fact, index) => (
                <li
                  key={`${fact.concept_code}-${index}`}
                  className="rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-3 text-sm"
                >
                  <span className="font-bold text-[#0B1310] capitalize">
                    {fact.concept_code.replace(/_/g, ' ')}
                  </span>
                  :{' '}
                  <span className="font-mono font-semibold">
                    {String(fact.value ?? fact.verification_status)}
                    {fact.unit ? ` ${fact.unit}` : ''}
                  </span>
                  <span className="block text-[11px] font-mono text-[#3F4E48] mt-1">
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
            <h3 className="text-xs font-mono font-bold text-[#B45309] uppercase mb-2.5">
              Unknown or Not Provided ({report.unknown.length})
            </h3>
            <ul className="flex flex-wrap gap-2">
              {report.unknown.map(item => (
                <li
                  key={item.concept_code}
                  className="rounded-[2px] bg-[#FFFBEB] border border-[#B45309] px-3 py-1 text-xs font-mono font-semibold text-[#78350F]"
                >
                  {item.concept_code.replace(/_/g, ' ')} · {item.state}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.observations.length > 0 && (
          <div>
            <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2.5">
              Reported Lab Observations · Mock
            </h3>
            <ul className="space-y-2">
              {report.observations.map((item, index) => (
                <li
                  key={`${item.test_code}-${index}`}
                  className="rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-3 text-sm flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <strong className="font-mono text-xs text-[#0B1310]">
                      {item.test_code.replace(/_/g, ' ')}:
                    </strong>{' '}
                    <span className="font-mono font-bold">
                      {item.value ?? 'Unknown'}
                      {item.unit ? ` ${item.unit}` : ''}
                    </span>
                    <span className="block text-xs font-mono text-[#3F4E48] mt-0.5">
                      {item.source} · {item.confirmation_status}
                      {item.collected_on ? ` · ${item.collected_on}` : ''}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-[2px] border ${
                      item.used_in_assessment
                        ? 'bg-[#E6F2EE] text-[#0F523E] border-[#0F523E]'
                        : 'bg-white text-[#3F4E48] border-[#C5CEC9]'
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
          <div className="p-4 rounded-[2px] bg-[#E6EAE4] border border-[#0B1310]">
            <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase">
              Optional Psychosocial Context (Excluded from Triage)
            </h3>
            <p className="text-xs text-[#3F4E48] mt-1">
              {report.psychosocial_context_use}
            </p>
          </div>
        )}

        {report.excluded_items.length > 0 && (
          <p className="text-xs font-mono text-[#C84B31] font-semibold">
            Excluded from this draft: {report.excluded_items.join(', ')}
          </p>
        )}
      </section>

      {/* J2 Selective Evidence Controls (PUT /cases/{id}/evidence-selection) */}
      {canSelectEvidence && (
        <section className="dossier-card bg-white p-6 sm:p-8 mb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#0B1310]">
            <div>
              <h2 className="text-base font-extrabold text-[#0B1310]">
                Selective Evidence Control (J2 · RF-16)
              </h2>
              <p className="text-xs text-[#3F4E48] mt-0.5">
                Include or exclude optional evidence categories and regenerate the draft immediately.
              </p>
            </div>
            <MockBadge label="MOCK · SELECT_EVIDENCE" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  className="p-3.5 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] flex flex-col justify-between gap-3"
                >
                  <div>
                    <span className="font-mono text-[10px] font-bold text-[#0F523E]">
                      {meta.item_id}
                    </span>
                    <h3 className="text-xs font-bold text-[#0B1310] mt-0.5">
                      {meta.label}
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={updatingEvidence}
                    onClick={() => void handleToggleEvidence(meta.item_id, isExcluded)}
                    className={`w-full py-1.5 px-3 rounded-[2px] font-mono text-xs font-bold border border-[#0B1310] cursor-pointer ${
                      isExcluded
                        ? 'bg-white text-[#0B1310] hover:bg-[#E6F2EE]'
                        : 'bg-[#0B1310] text-white hover:bg-[#0F523E]'
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
      <section className="dossier-card bg-white p-6 sm:p-8 mb-6 space-y-4">
        <div className="pb-3 border-b border-[#0B1310] flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-[#0B1310]">
            Draft rule output
          </h2>
          <span className="font-mono text-xs text-[#3F4E48]">
            Rule version {report.rule_version} · {report.rule_approval_status}
          </span>
        </div>

        {report.required_statements.map((statement, index) => (
          <p key={index} className="text-sm text-[#0B1310] leading-relaxed">
            {statement}
          </p>
        ))}

        {report.limits.length > 0 && (
          <ul className="space-y-2">
            {report.limits.map((limit, index) => (
              <li
                key={`${limit.code}-${index}`}
                className="rounded-[2px] bg-[#FFFBEB] border border-[#B45309] p-3 text-sm text-[#78350F]"
              >
                <strong className="font-mono text-xs mr-1.5">[{limit.code}]</strong>
                {limit.text}
              </li>
            ))}
          </ul>
        )}

        {report.evidence.length > 0 && (
          <div className="pt-2">
            <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
              Evidence status
            </h3>
            <ul className="space-y-1 text-xs font-mono text-[#3F4E48]">
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
        <section className="dossier-card bg-[#E6F2EE] border-[#0F523E] p-6 mb-6">
          <MockBadge label="MOCK GUIDANCE · SIMULATED REVIEW" />
          <h2 className="text-lg font-extrabold text-[#0B1310] mt-3">
            {report.next_step.label}
          </h2>
          {report.why_next_step && (
            <p className="text-sm text-[#0B1310] mt-2 leading-relaxed">
              {report.why_next_step}
            </p>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleStartNavigation()}
            className="mt-4 w-full sm:w-auto px-6 py-3.5 rounded-[2px] font-mono font-bold text-xs bg-[#0F523E] hover:bg-[#093B2C] text-white border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer disabled:opacity-60"
          >
            {submitting ? 'Starting…' : 'Continue to Mock Care Navigation →'}
          </button>
        </section>
      )}

      {report.next_step_withheld && (
        <div className="mb-6 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] p-4 text-sm text-[#78350F] font-medium">
          A next step is withheld until the required review is complete. Current status:{' '}
          <strong className="font-mono">{report.next_step_withheld}</strong>.
        </div>
      )}

      {canRequestReview && (
        <section className="dossier-card bg-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-[#0B1310]">
              Request Mock Reviewer Review
            </h2>
            <p className="text-xs text-[#3F4E48] mt-1">
              A simulated reviewer role will review this synthetic draft. This does not represent verified clinical care.
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleRequestReview()}
            className="w-full sm:w-auto px-6 py-3.5 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Request Mock Review →'}
          </button>
        </section>
      )}

      {report.review_status === 'NOT_SENT' && !reviewGranted && (
        <div className="rounded-[2px] bg-white border border-[#0B1310] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-[#0B1310]">
          <span>
            Reviewer access was not consented to. Return to consent settings to enable this optional step.
          </span>
          {onOpenConsent && (
            <button
              type="button"
              onClick={onOpenConsent}
              className="px-4 py-2 rounded-[2px] font-mono font-bold text-xs bg-[#E6EAE4] hover:bg-[#C5CEC9] border border-[#0B1310] cursor-pointer whitespace-nowrap"
            >
              Open Consent Settings
            </button>
          )}
        </div>
      )}
    </div>
  );
};
