import { clearPendingUploadFile } from '../api/client';

interface QuickExitProps {
  className?: string;
  neutralUrl?: string;
}

export const QuickExit: React.FC<QuickExitProps> = ({
  className = '',
  neutralUrl = 'https://www.google.com',
}) => {
  const handleQuickExit = () => {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem('sanad_session_token');
    } catch {
      /* Storage can be unavailable in restricted browser modes. */
    }

    // Clear the rendered page and in-memory form/upload state before any network request.
    clearPendingUploadFile();
    document.getElementById('root')?.replaceChildren();

    const appKeys = [
      'sanad_session_token',
      'sanad_staff_token',
      'sanad_staff_role',
      'sanad_case_id',
      'sanad_case_start_mode',
      'sanad_case_fixture_id',
    ];
    for (const storageName of ['sessionStorage', 'localStorage'] as const) {
      for (const key of appKeys) {
        try {
          window[storageName].removeItem(key);
        } catch {
          /* Continue clearing other app state. */
        }
      }
    }

    // End the session only after the visible page and app storage are cleared.
    if (token && navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/session/end', JSON.stringify({ session_token: token }));
      } catch {
        /* Exit still works offline. */
      }
    }

    // A neutral URL when online; blank local document fallback when offline.
    const target = typeof navigator !== 'undefined' && navigator.onLine ? neutralUrl : 'about:blank';
    window.location.replace(target);
  };

  return (
    <button
      type="button"
      id="quick-exit-button"
      data-testid="quick-exit"
      onClick={handleQuickExit}
      title="Leave this page and clear this Sanad session from the tab"
      aria-label="Quick Exit"
      className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-[#D92D20] hover:bg-[#B42318] text-white shadow-xs transition-[transform,background-color,box-shadow] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer select-none whitespace-nowrap ${className}`}
    >
      <svg className="w-3.5 h-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      <span className="max-[379px]:hidden">Quick&nbsp;</span>Exit
    </button>
  );
};
