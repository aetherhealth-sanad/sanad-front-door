interface MockBadgeProps {
  label?: string;
  className?: string;
}

export const MockBadge: React.FC<MockBadgeProps> = ({
  label = 'MOCK · SIMULATED DATA',
  className = '',
}) => {
  const displayLabel = /mock/i.test(label) ? label : `MOCK · ${label}`;

  return (
    <span
      data-testid="mock-badge"
      data-mock="true"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase bg-[#EBF3FF] text-[#0050CC] border border-[#BCD8FE] select-none shadow-xs ${className}`}
      title="Research prototype simulated element. No real care or clinical provider is connected."
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#0066EE] animate-pulse" />
      {displayLabel}
    </span>
  );
};
