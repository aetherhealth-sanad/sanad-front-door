interface MockBadgeProps {
  label?: string;
  className?: string;
}

export const MockBadge: React.FC<MockBadgeProps> = ({
  label = 'MOCK · SIMULATED DATA',
  className = '',
}) => {
  return (
    <span
      data-testid="mock-badge"
      data-mock="true"
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[2px] text-[11px] font-mono font-bold tracking-wider uppercase bg-[#E6EAE4] text-[#0B1310] border border-[#0B1310] select-none ${className}`}
      title="Research prototype simulated element. No real care or clinical provider is connected."
    >
      <span className="w-1.5 h-1.5 rounded-[2px] bg-[#C84B31]" />
      {label}
    </span>
  );
};
