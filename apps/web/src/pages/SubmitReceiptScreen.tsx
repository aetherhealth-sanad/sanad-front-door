import { useEffect, useState } from 'react';

interface SubmitReceiptScreenProps {
  caseId: string;
  revision?: number;
  statusText?: string;
  onViewSummary: () => void;
  isReady?: boolean;
}

const PROCESSING_STAGES = [
  { label: 'Safety thresholds verified', delay: 400 },
  { label: 'Lifestyle factors evaluated', delay: 900 },
  { label: 'Lab values cross-referenced', delay: 1500 },
  { label: 'Generating confidential summary', delay: 2100 },
];

export const SubmitReceiptScreen: React.FC<SubmitReceiptScreenProps> = ({
  caseId,
  revision = 1,
  onViewSummary,
  isReady = false,
}) => {
  const [internalStages, setInternalStages] = useState<number>(0);

  // Progressively reveal stages for visual engagement
  useEffect(() => {
    if (isReady) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    PROCESSING_STAGES.forEach((stage, idx) => {
      const t = setTimeout(() => {
        setInternalStages(v => Math.max(v, idx + 1));
      }, stage.delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [isReady]);

  const visibleStages = isReady ? PROCESSING_STAGES.length : internalStages;

  // Animated ring progress (SVG)
  const circumference = 2 * Math.PI * 20; // r=20
  const progressFraction = isReady ? 1 : visibleStages / PROCESSING_STAGES.length;
  const strokeDashoffset = circumference * (1 - progressFraction);

  return (
    <div className="max-w-lg mx-auto py-10 px-4 sm:px-6 animate-reveal-1">
      <div
        className="medical-canvas p-7 sm:p-10 space-y-7"
        style={{ background: 'rgba(255,255,255,0.99)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{
                  background: isReady ? '#ECFDF5' : '#EBF4FF',
                  color: isReady ? '#065F46' : '#0048C8',
                  border: `1px solid ${isReady ? '#A7F3D0' : '#BAD6FE'}`,
                }}
              >
                {isReady ? 'Complete' : 'Processing'}
              </span>
              <span className="text-[10px] font-mono text-[#829AB8]">
                Not a diagnosis
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-[#07215A] tracking-tight">
              {isReady ? 'Assessment Complete' : 'Analysing your answers…'}
            </h1>
            <p className="text-xs text-[#829AB8] font-mono">
              Ref: {caseId.slice(0, 8).toUpperCase()} · Rev {revision}
            </p>
          </div>

          {/* Animated progress ring */}
          <div className="relative shrink-0 w-14 h-14">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48" fill="none">
              {/* Track */}
              <circle
                cx="24" cy="24" r="20"
                stroke="#E2ECF8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Fill */}
              <circle
                cx="24" cy="24" r="20"
                stroke={isReady ? '#10B981' : '#0062FF'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.5s var(--ease-out), stroke 0.3s ease' }}
              />
            </svg>
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isReady ? (
                <svg
                  className="w-5 h-5 text-[#10B981]"
                  style={{ animation: 'completePop 0.4s var(--ease-spring) both' }}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <div className="spinner spinner-sm" />
              )}
            </div>
          </div>
        </div>

        {/* ── Processing stages ── */}
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{
            background: 'linear-gradient(145deg, #F4F8FF 0%, #FAFCFF 100%)',
            border: '1px solid #E2ECF8',
          }}
        >
          <p className="text-[11px] font-mono font-bold text-[#829AB8] uppercase tracking-wider mb-1">
            Assessment stages
          </p>

          {PROCESSING_STAGES.map((stage, idx) => {
            const done = idx < visibleStages;
            const active = idx === visibleStages - 1 && !isReady;

            return (
              <div
                key={stage.label}
                className={`flex items-center gap-3 transition-all duration-300 ease-out ${
                  done ? 'opacity-100' : 'opacity-25'
                }`}
                style={{
                  transform: done ? 'translateX(0)' : 'translateX(-4px)',
                }}
              >
                {/* Stage indicator */}
                <div
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                    ${isReady || (done && !active)
                      ? 'bg-[#10B981] text-white'
                      : active
                      ? 'bg-[#EBF4FF] border-2 border-[#0062FF]'
                      : 'bg-[#E2ECF8]'
                    }
                  `}
                >
                  {isReady || (done && !active) ? (
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  ) : active ? (
                    <span className="w-2 h-2 rounded-full bg-[#0062FF] bio-pulse-soft" />
                  ) : null}
                </div>

                <span className={`text-xs font-medium ${done ? 'text-[#07215A]' : 'text-[#829AB8]'}`}>
                  {stage.label}
                </span>

                {active && (
                  <span className="ml-auto">
                    <span className="dot-pulse flex gap-0.5 text-[#0062FF]">
                      <span style={{ width: 4, height: 4 }} />
                      <span style={{ width: 4, height: 4 }} />
                      <span style={{ width: 4, height: 4 }} />
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Privacy notes ── */}
        <div className="space-y-2 text-xs text-[#829AB8] leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-1 h-1 rounded-full bg-[#829AB8] shrink-0" />
            <span><strong className="text-[#4A6588]">Emergency first.</strong> Severe warning signs are always checked before any summary.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-1 h-1 rounded-full bg-[#829AB8] shrink-0" />
            <span><strong className="text-[#4A6588]">Unknown stays unknown.</strong> Unanswered items remain clearly uncertain - never assumed normal.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-1 h-1 rounded-full bg-[#829AB8] shrink-0" />
            <span><strong className="text-[#4A6588]">Private session.</strong> Nothing has been sent anywhere. This runs locally on your device.</span>
          </div>
        </div>

        {/* ── CTA - only when ready ── */}
        {isReady && (
          <div className="animate-reveal-1">
            <button
              type="button"
              onClick={onViewSummary}
              className="btn-pill-primary w-full py-4 px-6 text-sm font-bold gap-2.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Your Assessment Summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
