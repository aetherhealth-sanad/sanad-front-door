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
    const unanswered = emergencyCatalogue.questions.filter(
      question => !answers[question.question_id],
    );
    if (unanswered.length) {
      setError(
        'Choose an answer, "Not sure," or "Prefer not to answer" for each draft question.',
      );
      return;
    }

    const submitted = Object.entries(answers).map(([question_id, response]) => ({
      question_id,
      response: response as SafetyResponse,
    }));

    // Apply the bundled draft rule before waiting on the API, so this path also works offline.
    const localTrigger = emergencyCatalogue.rules.some(rule => {
      const question = emergencyCatalogue.questions.find(
        item => item.concept_code === rule.concept_code,
      );
      const response = question ? answers[question.question_id] : undefined;
      if (!question || !response) return false;
      const mappedValue = emergencyCatalogue.response_values[response].value;
      return rule.trigger_values.some(value => value === mappedValue);
    });
    if (localTrigger) {
      setEmergencyTriggered(true);
      void api
        .runSafetyCheck(caseId, submitted, emergencyCatalogue.catalogue_version)
        .catch(() => undefined);
      return;
    }

    setChecking(true);
    try {
      const result = await api.runSafetyCheck(
        caseId,
        submitted,
        emergencyCatalogue.catalogue_version,
      );
      if (
        result.result === 'EMERGENCY_GUIDANCE_ISSUED' ||
        result.state.route === '/urgent.html'
      ) {
        setEmergencyTriggered(true);
      } else if (result.needs_recheck || result.result === 'NEEDS_RECHECK') {
        setCheckUnavailable(true);
        setError(
          'The draft safety check needs another pass. You can retry or open the emergency guidance.',
        );
      } else {
        onSafetyPass(result.state.route);
      }
    } catch (err) {
      setCheckUnavailable(true);
      setError(
        err instanceof Error
          ? err.message
          : 'The draft safety check could not be completed.',
      );
    } finally {
      setChecking(false);
    }
  };

  if (emergencyTriggered) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="dossier-card bg-[#FEF2F2] border-2 border-[#B91C1C] p-6 sm:p-8 text-center">
          <MockBadge label="MOCK EMERGENCY RULE · CLINICAL_TBD" />
          <h1 className="text-2xl font-extrabold text-[#7F1D1D] mt-4 mb-2">
            Draft emergency rule triggered
          </h1>
          <p className="text-sm text-[#7F1D1D] leading-relaxed mb-6">
            This simulated rule set is not clinically approved. The online assessment is stopped for this session.
          </p>
          <a
            href="/urgent.html"
            className="w-full inline-block py-3.5 px-6 rounded-[2px] font-mono font-bold text-sm text-white bg-[#B91C1C] hover:bg-[#991B1B] border border-[#0B1310] no-underline btn-press"
          >
            Open emergency guidance now →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <MockBadge label={`MOCK SAFETY QUESTIONS · ${emergencyCatalogue.approval_status}`} />
          <span className="font-mono text-xs text-[#3F4E48]">
            {emergencyCatalogue.catalogue_version}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
          Deterministic Safety Check
        </h1>
        <p className="text-sm sm:text-base text-[#3F4E48] mt-2 leading-relaxed">
          These draft questions and rules are simulated and not clinically approved. Emergency guidance is available at any time without waiting on the network.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm font-medium"
        >
          {error}
          {checkUnavailable && (
            <a
              className="ml-2 font-mono font-bold underline text-[#B91C1C]"
              href="/urgent.html"
            >
              Open emergency guidance
            </a>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {emergencyCatalogue.questions.map((question, idx) => (
          <fieldset
            key={question.question_id}
            className="dossier-card bg-white p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-mono text-xs font-bold text-[#0F523E]">
                0{idx + 1} · {question.question_id}
              </span>
              <span className="font-mono text-[11px] text-[#3F4E48]">
                {question.concept_code}
              </span>
            </div>
            <legend className="text-base font-bold text-[#0B1310]">
              {question.text}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
              {(
                [
                  ['YES', 'Yes'],
                  ['NO', 'No'],
                  ['NOT_SURE', 'Not sure'],
                  ['PREFER_NOT_TO_ANSWER', 'Prefer not to answer'],
                ] as const
              ).map(([value, label]) => {
                const selected = answers[question.question_id] === value;
                return (
                  <label
                    key={value}
                    className={`flex items-center gap-2.5 rounded-[2px] border px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${
                      selected
                        ? 'border-[#0F523E] bg-[#E6F2EE] font-bold text-[#0B1310]'
                        : 'border-[#0B1310] bg-[#F3F4F1] hover:bg-white text-[#0B1310]'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.question_id}
                      value={value}
                      checked={selected}
                      onChange={() =>
                        setAnswers(previous => ({
                          ...previous,
                          [question.question_id]: value,
                        }))
                      }
                      className="accent-[#0F523E]"
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <button
          type="submit"
          disabled={checking}
          className="w-full py-4 px-6 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer disabled:opacity-60"
        >
          {checking ? 'Checking draft rules…' : 'Continue after draft safety check →'}
        </button>
      </form>
    </div>
  );
};
