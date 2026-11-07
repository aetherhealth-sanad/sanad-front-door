import { MockBadge } from './MockBadge';
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
    <header className="sticky top-0 z-40 w-full bg-[#F3F4F1]/95 backdrop-blur-md border-b border-[#0B1310]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Brand Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <a href="/" className="flex items-center gap-2.5 text-[#0B1310] no-underline group shrink-0">
            <div className="w-9 h-9 rounded-[2px] bg-[#0B1310] text-white border border-[#0B1310] flex items-center justify-center font-bold text-lg group-hover:bg-[#0F523E] transition-colors">
              س
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-[#0B1310] leading-none tracking-tight text-base flex items-center gap-1.5">
                SANAD <span className="text-[#3F4E48] font-normal text-xs font-mono">سند</span>
              </span>
              <span className="text-[10px] text-[#3F4E48] font-mono uppercase tracking-wider mt-0.5">
                Men's Health Front Door
              </span>
            </div>
          </a>
          <MockBadge className="hidden xl:inline-flex" />
        </div>

        {/* Role Switcher, Case Telemetry & Safety Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {caseId && (
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-white rounded-[2px] text-xs font-mono text-[#0B1310] border border-[#0B1310]">
              <span className="w-2 h-2 rounded-[2px] bg-[#0F523E]" />
              <span>CASE: {caseId}</span>
              {onCloseCase && (
                <button
                  type="button"
                  onClick={onCloseCase}
                  title="Close this case without recording failure or non-adherence"
                  className="ml-1 pl-2 border-l border-[#C5CEC9] text-[11px] font-bold text-[#C84B31] hover:underline cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          )}

          {onRoleSelect && (
            <nav
              aria-label="Workspace role selector"
              className="flex items-center bg-[#E6EAE4] p-0.5 rounded-[2px] border border-[#0B1310] text-xs font-mono"
            >
              <button
                type="button"
                onClick={() => onRoleSelect('patient')}
                className={`px-2.5 py-1 rounded-[2px] transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'patient'
                    ? 'bg-[#0B1310] text-white font-bold'
                    : 'text-[#3F4E48] hover:text-[#0B1310]'
                }`}
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => onRoleSelect('clinician')}
                className={`px-2.5 py-1 rounded-[2px] transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'clinician'
                    ? 'bg-[#0B1310] text-white font-bold'
                    : 'text-[#3F4E48] hover:text-[#0B1310]'
                }`}
              >
                Mock Reviewer
              </button>
              <button
                type="button"
                onClick={() => onRoleSelect('facility')}
                className={`px-2.5 py-1 rounded-[2px] transition-all cursor-pointer whitespace-nowrap ${
                  currentRole === 'facility'
                    ? 'bg-[#0B1310] text-white font-bold'
                    : 'text-[#3F4E48] hover:text-[#0B1310]'
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
