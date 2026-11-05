import { useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface IntakeScreenProps {
  caseId: string;
  onAssessmentComplete: () => void;
}

export const IntakeScreen: React.FC<IntakeScreenProps> = ({
  caseId,
  onAssessmentComplete
}) => {
  const [formData, setFormData] = useState({
    age_years: 28,
    bmi: 26.5,
    strength_training: true,
    anabolic_steroids: 'past',
    semen_motility: 38,
    semen_volume: 2.2,
    stress_level: 'moderate',
    sleep_hours: '6_to_7',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Submit answers
      await api.submitAnswers(caseId, {
        age_years: { value: Number(formData.age_years), state: 'KNOWN_POSITIVE' },
        bmi: { value: Number(formData.bmi), state: 'KNOWN_POSITIVE' },
        strength_training: { value: Boolean(formData.strength_training), state: 'KNOWN_POSITIVE' },
        anabolic_steroid_use: { value: formData.anabolic_steroids !== 'never', state: 'KNOWN_POSITIVE' },
        semen_motility: { value: Number(formData.semen_motility), unit: '%', state: 'KNOWN_POSITIVE' },
      });

      // 2. Submit optional psychosocial context (PRD-FR-29)
      await api.reportNavigationBarriers(caseId, [
        `stress_${formData.stress_level}`,
        `sleep_${formData.sleep_hours}`
      ]).catch(() => {});

      // 3. Trigger assessment
      await api.assessCase(caseId);

      onAssessmentComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to submit health facts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label="ADAPTIVE INTAKE · QUESTION CATALOGUE" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Contextual Health Questions
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Sanad evaluates lifestyle and biological factors in context. A high BMI or single lab result is never treated as a diagnosis.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Physical & Lifestyle Factors */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
            Physical Profile & Training
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Age (years)
              </label>
              <input
                type="number"
                min="18"
                max="80"
                value={formData.age_years}
                onChange={(e) => setFormData({ ...formData, age_years: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Body Mass Index (BMI)
              </label>
              <input
                type="number"
                step="0.1"
                min="15"
                max="50"
                value={formData.bmi}
                onChange={(e) => setFormData({ ...formData, bmi: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-sm font-medium"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Contextualized with muscle mass</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Do you participate in regular heavy resistance/strength training?
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="strength_training"
                    checked={formData.strength_training === true}
                    onChange={() => setFormData({ ...formData, strength_training: true })}
                    className="text-sky-600 focus:ring-sky-500"
                  />
                  Yes, regularly
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="strength_training"
                    checked={formData.strength_training === false}
                    onChange={() => setFormData({ ...formData, strength_training: false })}
                    className="text-sky-600 focus:ring-sky-500"
                  />
                  No / Casual only
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                History of anabolic steroid, prohormone, or testosterone use:
              </label>
              <select
                value={formData.anabolic_steroids}
                onChange={(e) => setFormData({ ...formData, anabolic_steroids: e.target.value })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-sm font-medium bg-white"
              >
                <option value="never">Never used</option>
                <option value="past">Past use (discontinued)</option>
                <option value="current">Current or recent use</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
        </div>

        {/* Optional Lab Parameters */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">
              Optional Semen Lab Observation
            </h2>
            <span className="text-xs font-medium text-slate-400">Optional · Self-reported</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Total Motility (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.semen_motility}
                onChange={(e) => setFormData({ ...formData, semen_motility: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-sm font-medium"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">WHO 6th ed reference: 42%</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Volume (mL)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={formData.semen_volume}
                onChange={(e) => setFormData({ ...formData, semen_volume: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-sm font-medium"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">WHO 6th ed reference: 1.4 mL</span>
            </div>
          </div>
        </div>

        {/* Optional Psychosocial Context (PRD-FR-29) */}
        <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Optional Contextual Well-being (Max 3 questions)
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Evidence indicates lifestyle stress and sleep influence reproductive hormones. Completely optional.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Recent Stress Level</label>
              <select
                value={formData.stress_level}
                onChange={(e) => setFormData({ ...formData, stress_level: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="low">Low / Manageable</option>
                <option value="moderate">Moderate</option>
                <option value="high">High / Chronic</option>
                <option value="declined">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Average Sleep per Night</label>
              <select
                value={formData.sleep_hours}
                onChange={(e) => setFormData({ ...formData, sleep_hours: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="less_than_6">Under 6 hours</option>
                <option value="6_to_7">6 to 7 hours</option>
                <option value="7_to_9">7 to 9 hours</option>
                <option value="declined">Prefer not to say</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all btn-press cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? 'Evaluating Rules...' : 'Submit & Generate Assessment →'}
        </button>
      </form>
    </div>
  );
};
