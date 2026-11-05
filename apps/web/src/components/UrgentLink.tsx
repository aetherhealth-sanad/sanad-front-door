interface UrgentLinkProps {
  className?: string;
  variant?: 'nav' | 'banner' | 'inline';
}

export const UrgentLink: React.FC<UrgentLinkProps> = ({
  className = '',
  variant = 'nav'
}) => {
  if (variant === 'banner') {
    return (
      <div 
        data-testid="urgent-banner"
        className={`w-full bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs sm:text-sm text-rose-900 flex items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-rose-600">⚠ Warning:</span>
          <span>Experiencing acute or sudden testicular pain or trauma?</span>
        </div>
        <a
          href="/urgent.html"
          className="font-semibold text-rose-700 hover:text-rose-900 underline whitespace-nowrap btn-press"
        >
          Emergency Guidance →
        </a>
      </div>
    );
  }

  return (
    <a
      href="/urgent.html"
      data-testid="urgent-link"
      title="Access emergency guidance for acute reproductive warning signs"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors duration-150 btn-press no-underline ${className}`}
    >
      <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
      Urgent Help
    </a>
  );
};
