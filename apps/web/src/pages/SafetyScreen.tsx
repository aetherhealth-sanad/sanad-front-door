import { useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';
import emergencyCatalogue from '../../../../rules/emergency.draft-0.1.json';

type SafetyResponse = 'YES' | 'NO' | 'NOT_SURE' | 'PREFER_NOT_TO_ANSWER';

interface SafetyScreenProps {
  caseId: string;
  onSafetyPass: (route: string) => void;
}

export const SafetyScreen: React.FC<SafetyScreenProps> = ({ caseId, onSafetyPass }) => {
  const [answers, setAnswers] = useState<Record<string, SafetyResponse | ''>>({});
  const [checking, setChecking] = useState(false);
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [checkUnavailable, setCheckUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCheckUnavailable(false);
    const unanswered = emergencyCatalogue.questions.filter(question => !answers[question.question_id]);
    if (unanswered.length) {
      setError('Choose an answer, “Not sure,” or “Prefer not to answer” for each draft question.');
      return;
    }

    const submitted = Object.entries(answers).map(([question_id, response]) => ({
      question_id,
      response: response as SafetyResponse,
    }));

    // Apply the bundled draft rule before waiting on the API, so this path also works offline.
    const localTrigger = emergencyCatalogue.rules.some(rule => {
      const question = emergencyCatalogue.questions.find(item => item.concept_code === rule.concept_code);
      const response = question ? answers[question.question_id] : undefined;
      if (!question || !response) return false;
      const mappedValue = emergencyCatalogue.response_values[response].value;
      return rule.trigger_values.some(value => value === mappedValue);
    });
    if (localTrigger) {
      setEmergencyTriggered(true);
      void api.runSafetyCheck(caseId, submitted, emergencyCatalogue.catalogue_version).catch(() => undefined);
      return;
    }

    setChecking(true);
    try {
      const result = await api.runSafetyCheck(caseId, submitted, emergencyCatalogue.catalogue_version);
      if (result.result === 'EMERGENCY_GUIDANCE_ISSUED' || result.state.route === '/urgent.html') {
        setEmergencyTriggered(true);
      } else if (result.needs_recheck || result.result === 'NEEDS_RECHECK') {
        setCheckUnavailable(true);
        setError('The draft safety check needs another pass. You can retry or open the emergency guidance.');
      } else {
        onSafetyPass(result.state.route);
      }
    } catch (err) {
      setCheckUnavailable(true);
      setError(err instanceof Error ? err.message : 'The draft safety check could not be completed.');
    } finally {
      setChecking(false);
    }
  };

  if (emergencyTriggered) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-6 sm:p-8 text-center shadow-sm">
          <MockBadge label="MOCK EMERGENCY RULE · CLINICAL_TBD" />
          <h1 className="text-2xl font-bold text-rose-950 mt-4 mb-2">Draft emergency rule triggered</h1>
          <p className="text-sm text-rose-800 leading-relaxed mb-6">
            This simulated rule set is not clinically approved. The online assessment is stopped for this session.
          </p>
          <a href="/urgent.html" className="w-full inline-block py-3.5 px-6 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md no-underline">
            Open emergency guidance now →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label={`MOCK SAFETY QUESTIONS · ${emergencyCatalogue.approval_status}`} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Safety check</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">These draft questions and rules are simulated and not clinically approved. Emergency guidance is available at any time.</p>
      </div>

      {error && (
        <div role="alert" className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          {error}
          {checkUnavailable && <a className="ml-2 font-semibold underline" href="/urgent.html">Open emergency guidance</a>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {emergencyCatalogue.questions.map(question => (
          <fieldset key={question.question_id} className="bg-white rounded-xl border border-slate-200 p-5">
            <legend className="px-1 text-sm font-semibold text-slate-900">{question.text}</legend>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {([
                ['YES', 'Yes'],
                ['NO', 'No'],
                ['NOT_SURE', 'Not sure'],
                ['PREFER_NOT_TO_ANSWER', 'Prefer not to answer'],
              ] as const).map(([value, label]) => (
                <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${answers[question.question_id] === value ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}>
                  <input
                    type="radio"
                    name={question.question_id}
                    value={value}
                    checked={answers[question.question_id] === value}
                    onChange={() => setAnswers(previous => ({ ...previous, [question.question_id]: value }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <button type="submit" disabled={checking} className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60">
          {checking ? 'Checking draft rules…' : 'Continue after draft safety check'}
        </button>
      </form>
    </div>
  );
};
