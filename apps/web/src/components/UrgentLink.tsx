interface UrgentLinkProps {
  className?: string;
  variant?: 'nav' | 'banner' | 'inline';
}

export const UrgentLink: React.FC<UrgentLinkProps> = ({
  className = '',
  variant = 'nav',
}) => {
  if (variant === 'banner') {
    return (
      <div
        data-testid="urgent-banner"
        className={`w-full bg-[#FEF2F2] border-b border-[#0B1310] px-4 sm:px-6 py-2 text-xs text-[#0B1310] flex items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-[#B91C1C] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
            MOCK · CLINICAL_TBD
          </span>
          <span className="font-medium text-[#0B1310]">
            Experiencing acute or sudden testicular pain or trauma?
          </span>
        </div>
        <a
          href="/urgent.html"
          className="font-mono text-xs font-bold text-[#B91C1C] hover:text-[#7F1D1D] underline whitespace-nowrap btn-press"
        >
          Open Offline Emergency Guidance →
        </a>
      </div>
    );
  }

  return (
    <a
      href="/urgent.html"
      data-testid="urgent-link"
      title="Access emergency guidance for acute reproductive warning signs"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-mono font-bold text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#B91C1C] transition-colors duration-150 btn-press no-underline whitespace-nowrap ${className}`}
    >
      <span className="w-2 h-2 rounded-[2px] bg-[#B91C1C]" />
      Urgent Help
    </a>
  );
};
