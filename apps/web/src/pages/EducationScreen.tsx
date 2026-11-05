import { MockBadge } from '../components/MockBadge';

interface EducationScreenProps {
  onNewSession: () => void;
}

export const EducationScreen: React.FC<EducationScreenProps> = ({ onNewSession }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label="MOCK EDUCATION COPY · CLINICAL_TBD" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Education material
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Reviewed education content is not available in this research prototype. No personal assessment was started in this case.
        </p>
      </div>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <p className="text-sm leading-relaxed text-slate-600">
          This page does not provide health guidance. Education material will appear here after the required content review.
        </p>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-sky-950">
            Start a new case?
          </h3>
          <p className="text-xs text-sky-800 mt-1">
            Consent for this case was declined. A new case lets you review its consent choices before entering health information.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewSession}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all btn-press cursor-pointer whitespace-nowrap"
        >
          Start a new case →
        </button>
      </div>
    </div>
  );
};
