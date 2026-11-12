import { useState } from 'react';
import { api } from '../api/client';
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
      if (result.result === 'EMERGENCY_GUIDANCE_ISSUED') {
        setEmergencyTriggered(true);
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
        <div className="medical-canvas p-6 sm:p-8 text-center border-2 border-[#FECDCA] shadow-xl space-y-4">
          <img
            src="/assets/images/medical_urgent_care_3d.jpg"
            alt="Emergency Care Icon"
            className="w-20 h-20 rounded-2xl object-cover mx-auto shadow-md border border-[#FECDCA]"
          />
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20]">
              Immediate Clinical Safety Triage
            </span>
            <h1 className="text-2xl font-extrabold text-[#D92D20] mt-3 mb-2 tracking-tight">
              Draft Emergency Rule Triggered
            </h1>
            <p className="text-sm text-[#7A271A] leading-relaxed max-w-[48ch] mx-auto">
              This simulated rule set is not clinically approved. The online assessment has been stopped for your safety. Please seek immediate medical evaluation.
            </p>
          </div>
          <div className="pt-2">
            <a
              href="/urgent.html"
              className="btn-pill-ruby w-full py-4 px-6 text-sm no-underline inline-block"
            >
              Open Emergency Guidance Now →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="medical-canvas p-6 sm:p-8">
        <div className="mb-8 pb-5 border-b border-[#E2ECF8]">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="font-mono text-xs text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE] font-bold">
              SAFETY SCREENING
            </span>
            <span className="font-mono text-xs text-[#829AB8]">
              {emergencyCatalogue.catalogue_version}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
            Deterministic Safety Check
          </h1>
          <p className="text-sm sm:text-base text-[#4A6588] mt-2 leading-relaxed">
            These draft questions and rules are simulated and not clinically approved. Emergency guidance is available at any time without waiting on the network.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-medium flex items-center justify-between"
          >
            <span>{error}</span>
            {checkUnavailable && (
              <a
                className="font-mono font-bold underline text-[#D92D20] ml-3 shrink-0"
                href="/urgent.html"
              >
                Open emergency guidance
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {emergencyCatalogue.questions.map((question, idx) => (
            <fieldset
              key={question.question_id}
              className="medical-card p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full">
                  0{idx + 1} · {question.question_id}
                </span>
                <span className="font-mono text-[11px] text-[#829AB8]">
                  {question.concept_code}
                </span>
              </div>
              <legend className="text-base font-bold text-[#072254] mt-1">
                {question.text}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
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
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] ${
                        selected
                          ? 'border-[#0066EE] bg-[#EBF3FF] font-bold text-[#072254] shadow-xs'
                          : 'border-[#E2ECF8] bg-[#F8FAFD] hover:bg-white text-[#4A6588]'
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
                        className="accent-[#0066EE] w-4 h-4 cursor-pointer"
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
            className="btn-pill-primary w-full py-4 px-6 text-sm disabled:opacity-60"
          >
            {checking ? 'Checking safety rules...' : 'Continue After Safety Check →'}
          </button>
        </form>
      </div>
    </div>
  );
};
