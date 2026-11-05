import { MockBadge } from '../components/MockBadge';

interface EducationScreenProps {
  onReconsiderConsent: () => void;
}

export const EducationScreen: React.FC<EducationScreenProps> = ({ onReconsiderConsent }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label="PUBLIC HEALTH EDUCATION · GENERAL ACCESS" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Men's Reproductive Health Guidance
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          General educational information based on published clinical guidelines. No personal data is stored during this session.
        </p>
      </div>

      <div className="space-y-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-2">
            1. Hormonal Balance & Training Context
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Intense physical training is generally beneficial for cardiovascular and metabolic health. However, extreme caloric deficits, overtraining without adequate rest, or use of exogenous anabolic-androgenic steroids can suppress the hypothalamic-pituitary-gonadal (HPG) axis, temporarily or chronically reducing intratesticular testosterone and spermatogenesis.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-2">
            2. Semen Analysis Reference Limits (WHO 6th Edition)
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            Semen analysis values are distribution percentiles from fertile populations, not absolute diagnostic thresholds:
          </p>
          <ul className="text-xs space-y-1.5 text-slate-600 font-mono bg-slate-50 p-4 rounded-xl border border-slate-100">
            <li>• Ejaculate Volume: ≥ 1.4 mL</li>
            <li>• Total Sperm Count: ≥ 39 million per ejaculate</li>
            <li>• Sperm Concentration: ≥ 16 million per mL</li>
            <li>• Total Motility: ≥ 42% (PR + NP)</li>
            <li>• Progressive Motility: ≥ 30%</li>
            <li>• Normal Morphology: ≥ 4.0%</li>
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-2">
            3. When to Seek In-Person Medical Evaluation
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Couples attempting conception for 12 months (or 6 months if the female partner is over 35), or individuals with a history of cryptorchidism, testicular surgery, or severe varicocele, should consult a qualified urologist or reproductive endocrinologist.
          </p>
        </div>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-sky-950">
            Ready to perform a private, confidential assessment?
          </h3>
          <p className="text-xs text-sky-800 mt-1">
            You can grant assessment consent at any time to receive tailored risk signal analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={onReconsiderConsent}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all btn-press cursor-pointer whitespace-nowrap"
        >
          Review Consent Scopes →
        </button>
      </div>
    </div>
  );
};
