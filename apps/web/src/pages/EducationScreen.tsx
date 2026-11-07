import { MockBadge } from '../components/MockBadge';

interface EducationScreenProps {
  onNewSession: () => void;
}

export const EducationScreen: React.FC<EducationScreenProps> = ({ onNewSession }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310]">
        <div className="flex items-center gap-2 mb-3">
          <MockBadge label="MOCK EDUCATION COPY · CLINICAL_TBD" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
          Education Material
        </h1>
        <p className="text-sm sm:text-base text-[#3F4E48] mt-2 leading-relaxed">
          Reviewed education content is not available in this research prototype. No personal assessment was started in this case.
        </p>
      </div>

      <div className="mb-8 dossier-card bg-white p-6">
        <p className="text-sm leading-relaxed text-[#0B1310]">
          This page does not provide health guidance. Education material will appear here after the required content review.
        </p>
      </div>

      <div className="dossier-card bg-[#E6F2EE] border-[#0F523E] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-[#0B1310]">
            Start a new case?
          </h2>
          <p className="text-xs text-[#3F4E48] mt-1">
            Consent for this case was declined. A new case lets you review its consent choices before entering health information.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewSession}
          className="w-full sm:w-auto px-5 py-3 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer whitespace-nowrap"
        >
          Start a new case →
        </button>
      </div>
    </div>
  );
};
