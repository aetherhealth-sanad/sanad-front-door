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
  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-[#E2ECF8] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Brand Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <a href="/" className="flex items-center gap-2.5 text-[#072254] no-underline group shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0066EE] to-[#2589FF] text-white flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform">
              س
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-[#072254] leading-none tracking-tight text-base flex items-center gap-1.5">
                SANAD <span className="text-[#4A6588] font-normal text-xs font-mono">سند</span>
              </span>
              <span className="text-[10px] text-[#4A6588] font-mono uppercase tracking-wider mt-0.5">
                Men's Health Front Door
              </span>
            </div>
          </a>
        </div>

        {/* Role Switcher, Case Telemetry & Safety Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {caseId && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#EBF3FF] rounded-full text-xs font-mono text-[#072254] border border-[#BCD8FE] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#0066EE] animate-pulse" />
              <span>CASE: {caseId}</span>
              {onCloseCase && (
                <button
                  type="button"
                  onClick={onCloseCase}
                  title="Close this case without recording failure or non-adherence"
                  className="ml-1 pl-2 border-l border-[#BCD8FE] text-[11px] font-bold text-[#D92D20] hover:underline cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          )}

          {onRoleSelect && (
            <nav
              aria-label="Workspace role selector"
              className="flex items-center bg-[#EBF3FF] p-1 rounded-full border border-[#BCD8FE] text-xs font-mono"
            >
              <button
                type="button"
                onClick={() => onRoleSelect('patient')}
                className={`px-3 py-1 rounded-full transition-[background-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer whitespace-nowrap ${
                  currentRole === 'patient'
                    ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                    : 'text-[#4A6588] hover:text-[#072254]'
                }`}
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => onRoleSelect('clinician')}
                className={`px-3 py-1 rounded-full transition-[background-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer whitespace-nowrap ${
                  currentRole === 'clinician'
                    ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                    : 'text-[#4A6588] hover:text-[#072254]'
                }`}
              >
                Mock Reviewer
              </button>
              <button
                type="button"
                onClick={() => onRoleSelect('facility')}
                className={`px-3 py-1 rounded-full transition-[background-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer whitespace-nowrap ${
                  currentRole === 'facility'
                    ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                    : 'text-[#4A6588] hover:text-[#072254]'
                }`}
              >
                Mock Facility
              </button>
            </nav>
          )}

          <div className="flex items-center gap-1.5">
            <UrgentLink />
            <QuickExit />
          </div>
        </div>
      </div>
    </header>
  );
};
