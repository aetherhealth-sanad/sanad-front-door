import { useEffect, useRef, useState } from 'react';
import { QuickExit } from './QuickExit';
import { UrgentLink } from './UrgentLink';

interface NavbarProps {
  currentRole?: 'patient' | 'clinician' | 'facility';
  onRoleSelect?: (role: 'patient' | 'clinician' | 'facility') => void;
  caseId?: string | null;
  onCloseCase?: () => void;
}

const ROLES = [
  { id: 'patient', label: 'Patient', hint: 'Your session' },
  { id: 'clinician', label: 'Reviewer', hint: 'Mock staff view' },
  { id: 'facility', label: 'Facility', hint: 'Mock staff view' },
] as const;

export const Navbar: React.FC<NavbarProps> = ({
  currentRole = 'patient',
  onRoleSelect,
  caseId,
  onCloseCase,
}) => {
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!roleMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setRoleMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setRoleMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [roleMenuOpen]);

  const current = ROLES.find(r => r.id === currentRole) ?? ROLES[0];

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-[background-color,border-color] duration-200 border-b ${
        scrolled ? 'bg-[#F4F1EA]/92 backdrop-blur-md border-[#E4DFD3]' : 'bg-[#F4F1EA] border-transparent'
      }`}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 h-14 sm:h-16 flex items-center justify-between gap-3">
        {/* Brand */}
        <a href="/" className="flex items-center gap-2 sm:gap-2.5 text-[#1A1F1C] no-underline group shrink-0" aria-label="Sanad home">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" className="transition-transform duration-300 group-hover:-rotate-6">
            <rect width="32" height="32" rx="7" fill="#1A1F1C" />
            <path d="M9 21.5h14" stroke="#F4F1EA" strokeWidth="2" strokeLinecap="round" />
            <circle cx="16" cy="13" r="4.5" fill="none" stroke="#F4F1EA" strokeWidth="2" />
            <circle cx="16" cy="13" r="1.4" fill="#7FB59C" />
          </svg>
          <span className="flex items-baseline gap-1.5">
            <span className="font-serif text-[22px] leading-none tracking-[-0.01em]">Sanad</span>
            <span className="hidden sm:inline text-[13px] text-[#8A8C84]" lang="ar">
              سند
            </span>
          </span>
          <span className="hidden md:inline font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8C84] border-l border-[#D6D0C2] pl-2.5 ml-1">
            Prototype
          </span>
        </a>

        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          {caseId && (
            <div className="hidden lg:flex items-center gap-2 h-8 pl-3 pr-1 rounded-lg border border-[#D6D0C2] bg-[#FBFAF6] font-mono text-[11px] text-[#575C55]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3F7D5C] glow-pulse" aria-hidden="true" />
              Session open
              {onCloseCase && (
                <button
                  type="button"
                  onClick={onCloseCase}
                  className="h-6 px-2 rounded-md text-[#1A1F1C] hover:bg-[#EFEBE2] cursor-pointer transition-colors"
                >
                  End
                </button>
              )}
            </div>
          )}

          {onRoleSelect && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={roleMenuOpen}
                onClick={() => setRoleMenuOpen(v => !v)}
                className="h-8 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 rounded-lg border border-[#D6D0C2] bg-[#FBFAF6] text-[12px] text-[#1A1F1C] cursor-pointer hover:border-[#1A1F1C] transition-colors"
              >
                <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] text-[#8A8C84]">View</span>
                <span className="font-medium">{current.label}</span>
                {currentRole !== 'patient' && (
                  <span className="font-mono text-[10px] px-1 rounded bg-[#EFEBE2] text-[#575C55]" data-mock="true">
                    Mock
                  </span>
                )}
                <svg
                  className={`w-3 h-3 text-[#575C55] transition-transform duration-200 ${roleMenuOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {roleMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-56 p-1 rounded-xl bg-[#FBFAF6] border border-[#D6D0C2] z-50 modal-dialog-animate shadow-[var(--shadow-3)]"
                >
                  {ROLES.map(role => (
                    <button
                      key={role.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={currentRole === role.id}
                      onClick={() => {
                        onRoleSelect(role.id);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        currentRole === role.id ? 'bg-[#EFEBE2]' : 'hover:bg-[#F4F1EA]'
                      }`}
                    >
                      <span>
                        <span className="block text-sm text-[#1A1F1C]">{role.label}</span>
                        <span className="block font-mono text-[10px] text-[#8A8C84]">{role.hint}</span>
                      </span>
                      {currentRole === role.id && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M3 7.5L5.5 10L11 4" stroke="#1F4D3F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <span className="hidden sm:block w-px h-5 bg-[#D6D0C2]" aria-hidden="true" />

          <div className="flex items-center gap-1 sm:gap-1.5">
            <UrgentLink />
            <QuickExit />
          </div>
        </div>
      </div>
    </header>
  );
};
