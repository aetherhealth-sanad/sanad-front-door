import { MockBadge } from './MockBadge';
import { QuickExit } from './QuickExit';
import { UrgentLink } from './UrgentLink';

interface NavbarProps {
  currentRole?: 'patient' | 'clinician' | 'facility';
  onRoleSelect?: (role: 'patient' | 'clinician' | 'facility') => void;
  caseId?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole = 'patient',
  onRoleSelect,
  caseId
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 text-slate-900 no-underline group">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-sky-400 flex items-center justify-center font-bold text-base shadow-xs group-hover:bg-slate-800 transition-colors">
              س
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 leading-tight tracking-tight text-base sm:text-lg flex items-center gap-1.5">
                Sanad <span className="text-slate-400 font-normal text-sm">سند</span>
              </span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                Men's Health Front Door
              </span>
            </div>
          </a>
          <MockBadge className="hidden md:inline-flex" />
        </div>

        {/* Role Switcher & Case ID Indicator */}
        <div className="flex items-center gap-2 sm:gap-4">
          {caseId && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-xs font-mono text-slate-600 border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Case: {caseId}</span>
            </div>
          )}

          {onRoleSelect && (
            <nav className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600">
              <button
                type="button"
                onClick={() => onRoleSelect('patient')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  currentRole === 'patient'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => onRoleSelect('clinician')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  currentRole === 'clinician'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mock Reviewer
              </button>
              <button
                type="button"
                onClick={() => onRoleSelect('facility')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  currentRole === 'facility'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mock Facility
              </button>
            </nav>
          )}

          {/* Safety Buttons */}
          <div className="flex items-center gap-2">
            <UrgentLink />
            <QuickExit />
          </div>
        </div>
      </div>
    </header>
  );
};
