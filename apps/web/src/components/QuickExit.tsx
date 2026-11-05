interface QuickExitProps {
  className?: string;
  neutralUrl?: string;
}

export const QuickExit: React.FC<QuickExitProps> = ({
  className = '',
  neutralUrl = 'about:blank'
}) => {
  const handleQuickExit = () => {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem('sanad_session_token');
    } catch { /* Storage can be unavailable in restricted browser modes. */ }

    // Clear the rendered page and in-memory form state before any network request.
    document.getElementById('root')?.replaceChildren();

    const appKeys = ['sanad_session_token', 'sanad_staff_token', 'sanad_staff_role', 'sanad_case_id', 'sanad_case_start_mode', 'sanad_case_fixture_id'];
    for (const storageName of ['sessionStorage', 'localStorage'] as const) {
      for (const key of appKeys) {
        try { window[storageName].removeItem(key); } catch { /* Continue clearing other app state. */ }
      }
    }

    // End the session only after the visible page and app storage are cleared.
    if (token && navigator.sendBeacon) {
      try { navigator.sendBeacon('/api/session/end', JSON.stringify({ session_token: token })); } catch { /* Exit still works offline. */ }
    }

    // A blank local document is neutral and works without a network connection.
    window.location.replace(neutralUrl);
  };

  return (
    <button
      type="button"
      id="quick-exit-button"
      data-testid="quick-exit"
      onClick={handleQuickExit}
      title="Leave this page and clear this Sanad session from the tab"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all duration-150 btn-press cursor-pointer select-none ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Quick Exit
    </button>
  );
};
