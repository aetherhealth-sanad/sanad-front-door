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
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-mono font-medium tracking-[0.04em] uppercase bg-[#EFEBE2] text-[#1A1F1C] border border-[#D6D0C2] select-none ${className}`}
      title="Research prototype simulated element. No real care or clinical provider is connected."
    >
      <span className="w-1.5 h-1.5 rotate-45 bg-[#1A1F1C]" aria-hidden="true" />
      {displayLabel}
    </span>
  );
};
