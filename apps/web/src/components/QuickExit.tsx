interface QuickExitProps {
  className?: string;
  neutralUrl?: string;
}

export const QuickExit: React.FC<QuickExitProps> = ({
  className = '',
  neutralUrl = 'https://www.google.com'
}) => {
  const handleQuickExit = () => {
    try {
      const token = sessionStorage.getItem('sanad_session_token');
      // Fire-and-forget beacon to end session synchronously
      if (token && navigator.sendBeacon) {
        navigator.sendBeacon('/api/session/end', JSON.stringify({ session_token: token }));
      }
    } catch {
      // Ignore errors on exit
    }

    // Immediately purge state
    sessionStorage.removeItem('sanad_session_token');
    sessionStorage.removeItem('sanad_staff_token');
    sessionStorage.removeItem('sanad_staff_role');
    sessionStorage.removeItem('sanad_case_id');
    sessionStorage.removeItem('sanad_case_start_mode');
    sessionStorage.removeItem('sanad_case_fixture_id');

    // Replace history location immediately
    window.location.replace(neutralUrl);
  };

  return (
    <button
      type="button"
      id="quick-exit-button"
      data-testid="quick-exit"
      onClick={handleQuickExit}
      title="Immediately leaves this page and clears your local browsing data"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all duration-150 btn-press cursor-pointer select-none ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Quick Exit
    </button>
  );
};
