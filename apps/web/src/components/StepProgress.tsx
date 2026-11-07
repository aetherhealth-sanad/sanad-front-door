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
  { id: '/result', label: '06 Synthesis' },
  { id: '/referral', label: '07 Gate' },
  { id: '/tracking', label: '08 Tracking' },
];

export const StepProgress: React.FC<StepProgressProps> = ({
  currentRoute,
  onNavigate,
  canEnterObservations = false,
}) => {
  const currentIndex = STEPS.findIndex(s => s.id === currentRoute);
  if (currentIndex === -1) return null;

  return (
    <div className="w-full bg-white border-b border-[#0B1310] py-2.5 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2.5 w-full overflow-x-auto no-scrollbar">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const isInteractive =
              onNavigate &&
              ((step.id === '/lab' && (currentRoute === '/intake' || currentRoute === '/result') && canEnterObservations) ||
                (step.id === '/intake' && currentRoute === '/lab'));

            const badgeContent = (
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-[2px] border text-xs font-mono transition-colors ${
                  isCurrent
                    ? 'bg-[#0B1310] text-white border-[#0B1310] font-bold'
                    : isCompleted
                    ? 'bg-[#E6F2EE] text-[#0F523E] border-[#0F523E] font-semibold'
                    : isInteractive
                    ? 'bg-white text-[#0B1310] border-[#0B1310] hover:bg-[#E6EAE4] font-semibold'
                    : 'bg-[#F3F4F1] text-[#63736C] border-[#C5CEC9]'
                }`}
              >
                <span>{isCompleted ? '✓' : step.label}</span>
                {isCompleted && <span>{step.label.slice(3)}</span>}
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
