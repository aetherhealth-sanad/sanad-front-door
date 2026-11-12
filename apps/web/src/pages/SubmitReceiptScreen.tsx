import React from 'react';
import { MockBadge } from '../components/MockBadge';

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
  statusText = 'Checking your answers with draft rules…',
  onViewSummary,
  isReady = false,
}) => {
  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-6">
      <div className="dossier-card bg-white p-6 sm:p-8 space-y-5 border-2 border-[#0B1310] shadow-[4px_4px_0px_#0B1310]">
        <div className="flex flex-wrap items-center gap-2">
          <MockBadge label="ASSESSMENT RECEIPT" />
          <span className="font-mono text-xs text-[#3F4E48]">Screening, not diagnosis</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            {isReady ? 'Assessment Ready' : 'Processing Assessment'}
          </h1>
          <p className="font-mono text-xs text-[#63736C]">
            Session Ref: {caseId.slice(0, 18)}… · Revision {revision}
          </p>
        </div>

        <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] space-y-3">
          <div className="flex items-center gap-3">
            {!isReady ? (
              <div className="w-4 h-4 rounded-full border-2 border-[#0F523E] border-t-transparent animate-spin shrink-0" />
            ) : (
              <span className="text-[#0F523E] font-bold text-lg">✓</span>
            )}
            <p className="text-sm font-semibold text-[#0B1310]">
              {statusText}
            </p>
          </div>
          <p className="font-mono text-[11px] text-[#3F4E48] leading-relaxed">
            Sanad is evaluating your confirmed facts against the versioned clinical rules catalogue. No medical conclusions are estimated.
          </p>
        </div>

        <div className="space-y-2 border-t border-[#E6EAE4] pt-4 text-xs text-[#3F4E48] leading-relaxed">
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
              className="w-full py-3.5 px-6 rounded-[2px] bg-[#0F523E] hover:bg-[#093B2C] text-white font-mono font-bold text-sm border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer text-center"
            >
              View Assessment Summary →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
