import { useState } from 'react';
import { QuickExit } from './QuickExit';
import { UrgentLink } from './UrgentLink';

interface NavbarProps {
  currentRole?: 'patient' | 'clinician' | 'facility';
  onRoleSelect?: (role: 'patient' | 'clinician' | 'facility') => void;
  caseId?: string | null;
  onCloseCase?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole = 'patient',
  onRoleSelect,
  caseId,
  onCloseCase,
}) => {
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const roleLabel = currentRole === 'patient'
    ? 'Patient'
    : currentRole === 'clinician'
    ? 'Reviewer'
    : 'Facility';

  return (
    <header className="sticky top-0 z-40 w-full">
      <div
        className="relative z-50 w-full bg-white/88 backdrop-blur-xl border-b border-white/60"
        style={{ boxShadow: '0 1px 0 rgba(7,33,90,0.07), 0 2px 12px -4px rgba(7,33,90,0.08)' }}
      >
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-20 h-14 sm:h-16 flex items-center justify-between gap-3">

          {/* ── Brand ── */}
          <a href="/" className="flex items-center gap-2.5 text-[#07215A] no-underline group shrink-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-white flex items-center justify-center font-bold text-lg transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95"
              style={{
                background: 'linear-gradient(145deg, #1A7AFF 0%, #0048C8 100%)',
                boxShadow: '0 2px 8px -2px rgba(0,98,255,0.4), 0 1px 2px rgba(255,255,255,0.3) inset',
              }}
            >
              س
            </div>
            <div className="flex flex-col leading-none gap-0.5">
              <span className="font-extrabold text-[#07215A] text-sm sm:text-[15px] tracking-tight flex items-center gap-1.5">
                SANAD
                <span className="text-[#829AB8] font-normal text-xs font-mono">سند</span>
              </span>
              <span className="text-[9px] sm:text-[10px] text-[#829AB8] font-mono uppercase tracking-wider hidden sm:block">
                Men's Health Front Door
              </span>
            </div>
          </a>

          {/* ── Right side ── */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">

            {/* Active session pill - desktop */}
            {caseId && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-[#EBF4FF] rounded-full text-[11px] font-mono text-[#07215A] border border-[#BAD6FE]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF] glow-pulse" />
                <span>Session Active</span>
                {onCloseCase && (
                  <button
                    type="button"
                    onClick={onCloseCase}
                    className="ml-1.5 pl-2 border-l border-[#BAD6FE] font-bold text-[#D92D20] hover:text-[#B42318] cursor-pointer transition-colors duration-100"
                  >
                    End
                  </button>
                )}
              </div>
            )}

            {/* Role switcher - desktop inline pill */}
            {onRoleSelect && (
              <>
                <nav
                  aria-label="Workspace role"
                  className="hidden sm:flex items-center bg-[#EBF4FF] p-1 rounded-full border border-[#BAD6FE] text-[11px] font-mono gap-0.5"
                >
                  {(['patient', 'clinician', 'facility'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => onRoleSelect(role)}
                      className={`px-2.5 py-1 rounded-full cursor-pointer whitespace-nowrap transition-all duration-150 ease-out active:scale-95 ${
                        currentRole === role
                          ? 'bg-[#0062FF] text-white font-bold'
                          : 'text-[#4A6588] hover:text-[#07215A] hover:bg-white/70'
                      }`}
                      style={currentRole === role ? { boxShadow: '0 1px 4px rgba(0,98,255,0.3)' } : {}}
                    >
                      {role === 'patient' ? 'Patient' : role === 'clinician' ? 'Reviewer' : 'Facility'}
                    </button>
                  ))}
                </nav>

                {/* Mobile: compact dropdown */}
                <div className="relative sm:hidden">
                  <button
                    type="button"
                    onClick={() => setRoleMenuOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#EBF4FF] border border-[#BAD6FE] text-[11px] font-mono font-semibold text-[#07215A] cursor-pointer active:scale-95 transition-transform duration-100"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF]" />
                    {roleLabel}
                    <svg
                      className={`w-3 h-3 text-[#4A6588] transition-transform duration-200 ${roleMenuOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 12 12" fill="currentColor"
                    >
                      <path d="M6 8L2 4h8L6 8z" />
                    </svg>
                  </button>

                  {roleMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 py-1.5 rounded-2xl bg-white border border-[#E2ECF8] min-w-[150px] z-50 modal-dialog-animate"
                      style={{ boxShadow: '0 12px 32px -6px rgba(7,33,90,0.18), 0 2px 8px rgba(7,33,90,0.06)' }}
                    >
                      {(['patient', 'clinician', 'facility'] as const).map(role => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => { onRoleSelect(role); setRoleMenuOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono cursor-pointer transition-colors duration-100 flex items-center gap-2 ${
                            currentRole === role
                              ? 'text-[#0062FF] font-bold bg-[#EBF4FF]'
                              : 'text-[#4A6588] hover:bg-[#F6F9FF] hover:text-[#07215A]'
                          }`}
                        >
                          {currentRole === role && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF] shrink-0" />
                          )}
                          {role === 'patient' ? '👤 Patient' : role === 'clinician' ? '🩺 Reviewer' : '🏥 Facility'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Safety actions */}
            <div className="flex items-center gap-1">
              <UrgentLink />
              <QuickExit />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay to close role menu */}
      {roleMenuOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setRoleMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </header>
  );
};
