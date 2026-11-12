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
    <nav
      aria-label="Assessment progress"
      className="w-full bg-white/80 backdrop-blur-md border-b border-[#E2ECF8]/80"
      style={{ boxShadow: '0 1px 0 rgba(7,33,90,0.04)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-5">

        {/* ── Thin progress track (always visible) ── */}
        <div className="step-track mt-0 relative">
          <div
            className="step-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* ── Step chips ── */}
        <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar py-2">
          {STEPS.map((step, idx) => {
            const visitedLab =
              typeof window !== 'undefined' &&
              sessionStorage.getItem('sanad_visited_lab') === 'true';

            const isCompleted = step.id === '/lab'
              ? visitedLab && idx < currentIndex
              : idx < currentIndex;

            const isSkippedLab = step.id === '/lab' && !visitedLab && idx < currentIndex;
            const isCurrent = idx === currentIndex;

            const isInteractive =
              onNavigate &&
              ((step.id === '/lab' &&
                (currentRoute === '/intake' || currentRoute === '/result') &&
                canEnterObservations) ||
                (step.id === '/intake' && currentRoute === '/lab'));

            const stepContent = (
              <div
                className={`
                  flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold
                  transition-all duration-200 ease-out shrink-0
                  ${isCurrent
                    ? 'bg-[#0062FF] text-white shadow-sm'
                    : isCompleted
                    ? 'bg-[#EBF4FF] text-[#0062FF]'
                    : isSkippedLab
                    ? 'text-[#829AB8]'
                    : isInteractive
                    ? 'text-[#4A6588] hover:bg-[#EBF4FF] hover:text-[#07215A]'
                    : 'text-[#C4D4E8]'
                  }
                `}
                style={isCurrent ? { boxShadow: '0 2px 8px -2px rgba(0,98,255,0.4)' } : {}}
              >
                {/* Step indicator */}
                {isCompleted ? (
                  <span
                    className="w-3.5 h-3.5 rounded-full bg-[#0062FF] text-white flex items-center justify-center shrink-0"
                    style={{ fontSize: '8px' }}
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className={`
                      w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0
                      text-[8px] font-mono font-bold
                      ${isCurrent ? 'bg-white text-[#0062FF]' : 'bg-[#E2ECF8] text-[#829AB8]'}
                    `}
                  >
                    {idx + 1}
                  </span>
                )}

                {/* Label - hidden on smallest screens for non-current */}
                <span className={isCurrent ? 'inline' : 'hidden sm:inline'}>
                  <span className="sm:hidden">{step.shortLabel}</span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
                {/* Always show current label on mobile */}
                {isCurrent && (
                  <span className="sm:hidden">{step.shortLabel}</span>
                )}
              </div>
            );

            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                {isInteractive ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(step.id)}
                    className="cursor-pointer active:scale-95 transition-transform duration-100"
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {stepContent}
                  </button>
                ) : (
                  <div aria-current={isCurrent ? 'step' : undefined}>
                    {stepContent}
                  </div>
                )}

                {/* Connector line */}
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-2 sm:w-3 h-px rounded-full shrink-0 ${
                      idx < currentIndex ? 'bg-[#0062FF]/40' : 'bg-[#E2ECF8]'
                    }`}
                  />
                )}
              </div>
            );
          })}

          {/* Step count - right edge */}
          <div className="hidden md:flex items-center ml-auto pl-4 border-l border-[#E2ECF8] text-[11px] font-mono text-[#829AB8] whitespace-nowrap shrink-0 gap-1">
            <span className="font-bold text-[#07215A]">{currentIndex + 1}</span>
            <span>/ {STEPS.length}</span>
          </div>
        </div>
      </div>
    </nav>
  );
};
