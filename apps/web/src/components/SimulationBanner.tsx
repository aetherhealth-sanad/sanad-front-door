interface SimulationBannerProps {
  text: string;
  className?: string;
}

/** Permanent notice for simulated staff screens (AC-08.3, AC-13.1). Text, icon and colour. */
export const SimulationBanner: React.FC<SimulationBannerProps> = ({ text, className = '' }) => (
  <div
    role="note"
    data-testid="simulation-banner"
    data-mock="true"
    className={`flex items-center gap-2.5 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs sm:text-sm font-bold tracking-wide text-[#93370D] ${className}`}
  >
    <svg aria-hidden="true" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
    <span>{text}</span>
  </div>
);

/** AC-14.3 / AC-14.7: the delayed flag, shown with text and an icon, never colour alone. */
export const DelayedFlagNote: React.FC<{ text: string; stage: string; compact?: boolean }> = ({
  text,
  stage,
  compact = false,
}) => (
  <p
    role="status"
    className={`flex items-start gap-1.5 text-[#93370D] ${compact ? 'text-[11px] mt-1' : 'text-xs rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-3.5 py-2.5'}`}
  >
    <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 2" />
    </svg>
    <span>
      {text} <span className="font-mono">({stage})</span>
    </span>
  </p>
);
