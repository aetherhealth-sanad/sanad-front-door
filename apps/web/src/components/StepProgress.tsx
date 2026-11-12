interface StepProgressProps {
  currentRoute: string;
  onNavigate?: (route: string) => void;
  canEnterObservations?: boolean;
}

const STEPS = [
  { id: '/', label: 'Start' },
  { id: '/consent', label: 'Privacy' },
  { id: '/safety', label: 'Safety' },
  { id: '/lab', label: 'Lab Tests' },
  { id: '/intake', label: 'Questions' },
  { id: '/review', label: 'Review' },
  { id: '/result', label: 'Summary' },
  { id: '/referral', label: 'Referral' },
  { id: '/tracking', label: 'Status' },
];

export const StepProgress: React.FC<StepProgressProps> = ({
  currentRoute,
  onNavigate,
  canEnterObservations = false,
}) => {
  const currentIndex = STEPS.findIndex(s => s.id === currentRoute);
  if (currentIndex === -1) return null;

  return (
    <nav
      aria-label="Assessment progress"
      className="w-full bg-white/70 backdrop-blur-md border-b border-[#E2ECF8] py-2 px-4 sm:px-6"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 sm:gap-2 w-full overflow-x-auto no-scrollbar py-0.5">
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

            const content = (
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.98] ${
                  isCurrent
                    ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                    : isCompleted
                    ? 'bg-[#EBF3FF] text-[#0066EE] font-semibold hover:bg-[#D9E9FE]'
                    : isSkippedLab
                    ? 'text-[#829AB8] bg-transparent'
                    : isInteractive
                    ? 'text-[#072254] hover:bg-[#EBF3FF] font-medium'
                    : 'text-[#829AB8] bg-transparent'
                }`}
              >
                {isCompleted ? (
                  <span className="w-4 h-4 rounded-full bg-[#0066EE] text-white flex items-center justify-center text-[10px] font-bold">✓</span>
                ) : (
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono ${isCurrent ? 'bg-white text-[#0066EE] font-bold' : 'bg-[#E2ECF8] text-[#4A6588]'}`}>
                    {idx + 1}
                  </span>
                )}
                <span>{step.label}</span>
              </div>
            );

            return (
              <div key={step.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
                {isInteractive ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(step.id)}
                    className="cursor-pointer"
                  >
                    {content}
                  </button>
                ) : (
                  content
                )}
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-3 sm:w-5 h-0.5 rounded-full ${
                      idx < currentIndex ? 'bg-[#0066EE]' : 'bg-[#E2ECF8]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden md:flex items-center pl-4 border-l border-[#E2ECF8] text-xs font-medium text-[#4A6588] whitespace-nowrap">
          <span>Step {currentIndex + 1} of {STEPS.length}</span>
        </div>
      </div>
    </nav>
  );
};
