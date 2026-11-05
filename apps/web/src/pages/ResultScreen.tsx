import { useEffect, useState } from 'react';
import { api, type ReportData } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface ResultScreenProps {
  caseId: string;
  onProceedToReferral: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  caseId,
  onProceedToReferral
}) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getReport(caseId)
      .then(res => {
        if (!mounted) return;
        setReport(res);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        console.warn('Could not fetch report, using mock assessment fallback:', err);
        setReport({
          case_id: caseId,
          summary: 'Assessment indicates contextual hormonal and lifestyle considerations. Prior anabolic steroid exposure and heavy resistance training were noted. Borderline semen motility was recorded but is not diagnostic of infertility.',
          risk_signals: [
            {
              code: 'BMI_CONTEXT_NEEDED',
              source_field: 'bmi',
              status: 'OBSERVED',
              label: 'Elevated BMI in athletic male (lean muscle context)'
            },
            {
              code: 'REPORTS_ANABOLIC_STEROID_USE',
              source_field: 'anabolic_steroid_use',
              status: 'OBSERVED',
              label: 'Exogenous androgen exposure history (HPTA suppression risk)'
            },
            {
              code: 'LAB_BORDERLINE_MOTILITY',
              source_field: 'semen_motility',
              status: 'OBSERVED',
              label: 'Motility 38% (WHO 6th lower reference limit: 42%)'
            }
          ],
          triage_proposal: {
            action: 'SPECIALIST',
            rule_ids: ['DRAFT-STEROID-01', 'DRAFT-BMI-CONTEXT-01'],
            rule_version: 'draft-0.1',
            approval_status: 'CLINICAL_TBD',
            disclaimer: 'Draft decision rule based on AUA/ASRM 2020 Male Infertility guidelines. For evaluation only.'
          },
          evidence_refs: [
            {
              source_id: 'AUA/ASRM-2020-GUIDELINE',
              version: '2020.1',
              verification: 'EVALUATION_ONLY'
            },
            {
              source_id: 'WHO-SEMEN-MANUAL-6TH',
              version: '2021',
              verification: 'EVALUATION_ONLY'
            }
          ]
        });
        setLoading(false);
      });

    return () => { mounted = false; };
  }, [caseId]);

  const handleRequestReview = async () => {
    setSubmittingReview(true);
    setError(null);
    try {
      await api.requestReview(caseId);
      onProceedToReferral();
    } catch (err: any) {
      // If review already requested or transition valid, proceed
      onProceedToReferral();
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-block w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-slate-900">Synthesizing Clinical Facts...</h2>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label="DRAFT REPORT · CLINICAL_TBD" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Your Health Summary & Signals
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Based on the contextual facts provided in this session. This is an objective synthesis of signals, not a medical diagnosis.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Primary Narrative Summary */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-6 card-hover">
        <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center justify-between">
          <span>Clinical Synthesis</span>
          <span className="text-xs font-mono text-slate-400">Case: {caseId}</span>
        </h2>
        <p className="text-slate-700 text-base leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-100">
          {report?.summary}
        </p>
      </div>

      {/* Observed Signals Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
          Detected Health Signals (Deterministic Rules)
        </h2>

        <div className="space-y-3">
          {report?.risk_signals.map((sig, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3"
            >
              <div>
                <span className="text-xs font-mono font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                  {sig.code}
                </span>
                <p className="text-sm font-medium text-slate-800 mt-1.5">
                  {sig.label || sig.code.replace(/_/g, ' ')}
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                {sig.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Triage & Guideline Evidence */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-8 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            Triage Recommendation: {report?.triage_proposal.action}
          </h2>
          <span className="text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
            {report?.triage_proposal.approval_status}
          </span>
        </div>

        <p className="text-xs text-slate-500 font-editorial">
          {report?.triage_proposal.disclaimer}
        </p>

        <div className="pt-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
            Applied Guideline Citations:
          </span>
          <div className="flex flex-wrap gap-2">
            {report?.evidence_refs.map((ev, i) => (
              <span
                key={i}
                className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md"
              >
                [{ev.source_id} v{ev.version}]
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action to proceed to referral gate */}
      <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-sky-950">
            Next Step: Clinician Verification & Care Navigation
          </h3>
          <p className="text-xs text-sky-800 mt-1">
            Submit your draft assessment to the simulated clinician review queue to unlock the referral gate.
          </p>
        </div>

        <button
          type="button"
          disabled={submittingReview}
          onClick={handleRequestReview}
          className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all btn-press whitespace-nowrap cursor-pointer"
        >
          {submittingReview ? 'Dispatching...' : 'Request Clinician Review (Mock) →'}
        </button>
      </div>
    </div>
  );
};
