interface MockBadgeProps {
  label?: string;
  className?: string;
}

export const MockBadge: React.FC<MockBadgeProps> = ({ 
  label = 'MOCK · SIMULATED DATA',
  className = ''
}) => {
  return (
    <span 
      data-testid="mock-badge"
      data-mock="true"
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide bg-slate-100 text-slate-700 border border-slate-300 select-none ${className}`}
      title="Research prototype simulated element. No real care or clinical provider is connected."
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      {label}
    </span>
  );
};
