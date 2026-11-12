interface StepProgressProps {
  currentRoute: string;
  onNavigate?: (route: string) => void;
  canEnterObservations?: boolean;
}

const STEPS = [
  { id: '/', label: '01 Start' },
  { id: '/consent', label: '02 Consent' },
  { id: '/safety', label: '03 Safety' },
  { id: '/lab', label: '04 Lab (J3)' },
  { id: '/intake', label: '05 Intake' },
  { id: '/review', label: '06 Review' },
  { id: '/result', label: '07 Synthesis' },
  { id: '/referral', label: '08 Gate' },
  { id: '/tracking', label: '09 Tracking' },
];

export const StepProgress: React.FC<StepProgressProps> = ({
  currentRoute,
  onNavigate,
  canEnterObservations = false,
}) => {
  const currentIndex = STEPS.findIndex(s => s.id === currentRoute);
  if (currentIndex === -1) return null;

  return (
    <div className="w-full bg-white/70 backdrop-blur-md border-b border-[#E2ECF8] py-2.5 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2.5 w-full overflow-x-auto no-scrollbar">
          {STEPS.map((step, idx) => {
            const visitedLab =
              typeof window !== 'undefined' &&
              sessionStorage.getItem('sanad_visited_lab') === 'true';
            const isCompleted =
              step.id === '/lab'
                ? visitedLab && idx < currentIndex
                : idx < currentIndex;
            const isSkippedLab =
              step.id === '/lab' && !visitedLab && idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const isInteractive =
              onNavigate &&
              ((step.id === '/lab' && (currentRoute === '/intake' || currentRoute === '/result') && canEnterObservations) ||
                (step.id === '/intake' && currentRoute === '/lab'));

            const badgeContent = (
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.98] ${
                  isCurrent
                    ? 'bg-[#0066EE] text-white border-[#0066EE] font-bold shadow-xs'
                    : isCompleted
                    ? 'bg-[#EBF3FF] text-[#0066EE] border-[#BCD8FE] font-semibold'
                    : isSkippedLab
                    ? 'bg-[#F8FAFD] text-[#829AB8] border-[#E2ECF8]'
                    : isInteractive
                    ? 'bg-white text-[#072254] border-[#BCD8FE] hover:bg-[#EBF3FF] font-semibold'
                    : 'bg-[#F8FAFD] text-[#829AB8] border-[#E2ECF8]'
                }`}
              >
                <span>{isCompleted ? '✓' : isSkippedLab ? '-' : step.label}</span>
                {isCompleted && <span>{step.label.slice(3)}</span>}
                {isSkippedLab && <span>Lab (Optional)</span>}
              </div>
            );

            return (
              <div key={step.id} className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                {isInteractive ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(step.id)}
                    className="cursor-pointer btn-press"
                  >
                    {badgeContent}
                  </button>
                ) : (
                  badgeContent
                )}
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-2 sm:w-4 h-px ${
                      idx < currentIndex ? 'bg-[#0F523E]' : 'bg-[#C5CEC9]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-[#C5CEC9] text-[11px] font-mono text-[#3F4E48] whitespace-nowrap">
          <span>STAGE {currentIndex + 1}/{STEPS.length}</span>
        </div>
      </div>
    </div>
  );
};
