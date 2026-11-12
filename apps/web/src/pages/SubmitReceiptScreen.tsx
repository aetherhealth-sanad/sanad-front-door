import React from 'react';

interface SubmitReceiptScreenProps {
  caseId: string;
  revision?: number;
  statusText?: string;
  onViewSummary: () => void;
  isReady?: boolean;
}

export const SubmitReceiptScreen: React.FC<SubmitReceiptScreenProps> = ({
  caseId,
  revision = 1,
  statusText = 'Checking your answers with draft rules...',
  onViewSummary,
  isReady = false,
}) => {
  return (
    <div className="max-w-xl mx-auto py-12 px-4 space-y-6">
      <div className="medical-card bg-white p-8 sm:p-10 space-y-6 rounded-3xl border border-[#E2ECF8] shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
            SUBMISSION RECEIPT
          </span>
          <span className="text-xs text-[#64748B]">Screening, not diagnosis</span>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
            {isReady ? 'Assessment Ready' : 'Processing Assessment'}
          </h1>
          <p className="text-xs text-[#94A3B8] font-medium">
            Session Ref: {caseId.slice(0, 18)}... · Revision {revision}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-gradient-to-br from-[#F2F7FF] to-white border border-[#BCD8FE] space-y-3.5">
          <div className="flex items-center gap-3.5">
            {!isReady ? (
              <div className="w-6 h-6 rounded-full border-2 border-[#0066EE] border-t-transparent animate-spin shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-full bg-[#EBF3FF] border border-[#BCD8FE] flex items-center justify-center text-[#0066EE] font-bold text-sm shrink-0">
                ✓
              </span>
            )}
            <p className="text-sm font-bold text-[#0F172A]">
              {statusText}
            </p>
          </div>
          <p className="text-xs text-[#475467] leading-relaxed">
            Sanad is evaluating your confirmed facts against the versioned clinical rules catalogue. No medical conclusions are estimated.
          </p>
        </div>

        <div className="space-y-2.5 border-t border-[#E2ECF8] pt-5 text-xs text-[#64748B] leading-relaxed">
          <p>
            • <strong>Safety first:</strong> Emergency thresholds are checked before any recommendation.
          </p>
          <p>
            • <strong>Unknown stays unknown:</strong> Any items left unanswered or uncertain remain explicit.
          </p>
          <p>
            • <strong>Private session:</strong> Data is evaluated within this session only. Nothing has been sent to a clinic.
          </p>
        </div>

        {isReady && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onViewSummary}
              className="btn-pill-primary w-full py-4 px-8 rounded-full font-bold text-sm text-white shadow-lg cursor-pointer flex items-center justify-center gap-2"
            >
              <span>View Assessment Summary</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
