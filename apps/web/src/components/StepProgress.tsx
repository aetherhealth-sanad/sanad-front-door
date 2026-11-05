interface StepProgressProps {
  currentRoute: string;
}

const STEPS = [
  { id: '/', label: 'Start' },
  { id: '/consent', label: 'Consent' },
  { id: '/safety', label: 'Safety' },
  { id: '/intake', label: 'Questions' },
  { id: '/result', label: 'Synthesis' },
  { id: '/referral', label: 'Gate' },
  { id: '/tracking', label: 'Tracking' },
];

export const StepProgress: React.FC<StepProgressProps> = ({ currentRoute }) => {
  const currentIndex = STEPS.findIndex(s => s.id === currentRoute);
  if (currentIndex === -1) return null;

  return (
    <div className="w-full bg-white border-b border-slate-200 py-3 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-1 sm:gap-3 w-full overflow-x-auto no-scrollbar">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;

            return (
              <div key={step.id} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      isCurrent
                        ? 'bg-slate-900 text-white shadow-xs'
                        : isCompleted
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-xs transition-colors ${
                      isCurrent
                        ? 'font-bold text-slate-900'
                        : isCompleted
                        ? 'font-medium text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-3 sm:w-6 h-px transition-colors ${
                      idx < currentIndex ? 'bg-emerald-300' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-200 text-[11px] font-mono text-slate-400 whitespace-nowrap">
          <span>Step {currentIndex + 1} of {STEPS.length}</span>
        </div>
      </div>
    </div>
  );
};
