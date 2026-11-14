
interface EducationScreenProps {
  onNewSession: () => void;
}

export const EducationScreen: React.FC<EducationScreenProps> = ({ onNewSession }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="medical-canvas p-6 sm:p-10 space-y-6">
        <div className="pb-5 border-b border-[#E2ECF8]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
              HEALTH EDUCATION
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
            Educational Materials
          </h1>
          <p className="text-sm sm:text-base text-[#4A6588] mt-2 leading-relaxed">
            Reviewed educational content for reproductive health will be provided here following clinical advisory sign-off.
          </p>
        </div>

        <div className="medical-card bg-white p-6 border border-[#E2ECF8]">
          <p className="text-sm leading-relaxed text-[#4A6588]">
            This page provides educational resources and does not offer diagnostic guidance.
          </p>
        </div>

        <div className="medical-card bg-[#EBF3FF] border border-[#BCD8FE] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#072254]">
              Start a new session?
            </h2>
            <p className="text-xs text-[#4A6588] mt-1">
              Consent choices can be reconfigured in a fresh anonymous session.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewSession}
            className="btn-pill-primary px-5 py-2.5 text-xs whitespace-nowrap"
          >
            Start a new case →
          </button>
        </div>
      </div>
    </div>
  );
};
