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
        className={`w-full bg-[#FBEDEA] border-b border-[#F0C9C2] px-4 sm:px-6 py-2.5 text-xs text-[#1A1F1C] flex items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#B3261E] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
            MOCK · CLINICAL_TBD
          </span>
          <span className="font-semibold text-[#1A1F1C]">
            Experiencing acute or sudden testicular pain or trauma?
          </span>
        </div>
        <a
          href="/urgent.html"
          className="font-mono text-xs font-bold text-[#B3261E] hover:text-[#8F1D17] underline whitespace-nowrap"
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
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-[12px] font-medium text-[#8F1D17] bg-[#FBEDEA] hover:bg-[#F6DDD8] border border-[#F0C9C2] transition-[transform,background-color] duration-150 active:translate-y-px no-underline whitespace-nowrap ${className}`}
    >
      <svg className="hidden sm:block w-3.5 h-3.5 text-[#B3261E] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="hidden sm:inline">Urgent help</span>
      <span className="sm:hidden">Urgent</span>
    </a>
  );
};
