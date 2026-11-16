interface StepProgressProps {
  currentRoute: string;
  onNavigate?: (route: string) => void;
  canEnterObservations?: boolean;
}

const STEPS = [
  { id: '/', label: 'Start', shortLabel: 'Start' },
  { id: '/consent', label: 'Privacy', shortLabel: 'Privacy' },
  { id: '/safety', label: 'Safety', shortLabel: 'Safety' },
  { id: '/lab', label: 'Lab Tests', shortLabel: 'Lab' },
  { id: '/intake', label: 'Questions', shortLabel: 'Q&A' },
  { id: '/review', label: 'Review', shortLabel: 'Review' },
  { id: '/result', label: 'Summary', shortLabel: 'Result' },
  { id: '/referral', label: 'Referral', shortLabel: 'Refer' },
  { id: '/tracking', label: 'Status', shortLabel: 'Status' },
];

export const StepProgress: React.FC<StepProgressProps> = ({
  currentRoute,
  onNavigate,
  canEnterObservations = false,
}) => {
  const currentIndex = STEPS.findIndex(s => s.id === currentRoute);
  if (currentIndex === -1) return null;

  const progressPct = Math.round((currentIndex / (STEPS.length - 1)) * 100);

  return (
    <nav aria-label="Assessment progress" className="w-full border-b border-[#E4DFD3] bg-[#F4F1EA]">
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12">
        <div className="flex items-center gap-4 h-11">
          <span className="hidden md:inline font-mono text-[11px] text-[#8A8C84] tabular shrink-0">
            <span className="text-[#1A1F1C]">{String(currentIndex + 1).padStart(2, '0')}</span>
            {' / '}
            {String(STEPS.length).padStart(2, '0')}
          </span>
          <ol className="flex-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            {STEPS.map((step, idx) => {
              const visitedLab =
                typeof window !== 'undefined' && sessionStorage.getItem('sanad_visited_lab') === 'true';
              const isCompleted = step.id === '/lab' ? visitedLab && idx < currentIndex : idx < currentIndex;
              const isSkippedLab = step.id === '/lab' && !visitedLab && idx < currentIndex;
              const isCurrent = idx === currentIndex;
              const isInteractive =
                onNavigate &&
                ((step.id === '/lab' &&
                  (currentRoute === '/intake' || currentRoute === '/result') &&
                  canEnterObservations) ||
                  (step.id === '/intake' && currentRoute === '/lab'));

              const chip = (
                <span
                  className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] whitespace-nowrap transition-colors ${
                    isCurrent
                      ? 'bg-[#1A1F1C] text-[#F4F1EA]'
                      : isCompleted
                      ? 'text-[#1A1F1C]'
                      : isSkippedLab
                      ? 'text-[#8A8C84] line-through decoration-[#BDB8AC]'
                      : isInteractive
                      ? 'text-[#575C55] hover:bg-[#EFEBE2] hover:text-[#1A1F1C]'
                      : 'text-[#BDB8AC]'
                  }`}
                >
                  {isCompleted ? (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#1F4D3F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="font-mono text-[10px] tabular opacity-70">{idx + 1}</span>
                  )}
                  <span className={isCurrent ? 'inline' : 'hidden sm:inline'}>
                    <span className="sm:hidden">{step.shortLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                  {isCompleted && <span className="sr-only">(done)</span>}
                </span>
              );

              return (
                <li key={step.id} className="flex items-center shrink-0" aria-current={isCurrent ? 'step' : undefined}>
                  {isInteractive ? (
                    <button type="button" onClick={() => onNavigate(step.id)} className="cursor-pointer">
                      {chip}
                    </button>
                  ) : (
                    chip
                  )}
                  {idx < STEPS.length - 1 && (
                    <span
                      className={`w-2 sm:w-3 h-px shrink-0 ${idx < currentIndex ? 'bg-[#1A1F1C]/40' : 'bg-[#D6D0C2]'}`}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="step-track" aria-hidden="true">
        <div className="step-fill" style={{ width: `${progressPct}%` }} />
      </div>
    </nav>
  );
};
