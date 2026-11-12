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
        className={`w-full bg-[#FEF3F2] border-b border-[#FECDCA] px-4 sm:px-6 py-2.5 text-xs text-[#072254] flex items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#D92D20] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
            MOCK · CLINICAL_TBD
          </span>
          <span className="font-semibold text-[#072254]">
            Experiencing acute or sudden testicular pain or trauma?
          </span>
        </div>
        <a
          href="/urgent.html"
          className="font-mono text-xs font-bold text-[#D92D20] hover:text-[#B42318] underline whitespace-nowrap"
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
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold text-[#D92D20] bg-[#FEF3F2] hover:bg-[#FEE4E2] border border-[#FECDCA] transition-[transform,background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out)] active:scale-[0.97] no-underline whitespace-nowrap shadow-xs ${className}`}
    >
      <span className="w-2 h-2 rounded-[2px] bg-[#B91C1C]" />
      Urgent Help
    </a>
  );
};
