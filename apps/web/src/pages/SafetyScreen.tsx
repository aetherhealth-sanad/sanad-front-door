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
        'Please answer each question before continuing, or select "Not sure" or "Prefer not to answer".',
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
      <div className="max-w-xl mx-auto px-4 py-8 sm:py-12 animate-reveal-1">
        <div
          className="medical-canvas p-6 sm:p-8 text-center space-y-5"
          style={{
            border: '2px solid #FFCCC7',
            boxShadow: '0 16px 40px -10px rgba(217, 45, 32, 0.15)',
          }}
        >
          <div className="relative inline-block mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#FFF1F0] border border-[#FFCCC7] flex items-center justify-center text-2xl text-[#D92D20] shadow-sm">
              🚨
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#D92D20] bio-pulse-soft border-2 border-white" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FFF1F0] border border-[#FFCCC7] text-[#D92D20]">
              Immediate Medical Priority
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#D92D20] tracking-tight">
              Urgent Medical Evaluation Recommended
            </h1>
            <p className="text-xs sm:text-sm text-[#7A271A] leading-relaxed max-w-[46ch] mx-auto">
              Your responses indicate symptoms that require prompt clinical examination by a physician. The routine questionnaire has been paused for your safety.
            </p>
          </div>

          <div className="pt-2">
            <a
              href="/urgent.html"
              className="btn-pill-ruby w-full py-4 px-6 text-sm no-underline inline-flex items-center justify-center gap-2 shadow-md"
            >
              <span>Open Emergency Care Guidance →</span>
            </a>
            <p className="text-[11px] text-[#829AB8] mt-2">Available offline on your device at any time</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-reveal-1">
      <div className="medical-canvas p-6 sm:p-8 lg:p-10 space-y-6">
        {/* Header */}
        <div className="pb-5 border-b border-[#E2ECF8]">
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className="font-mono text-[11px] text-[#0062FF] bg-[#EBF4FF] px-2.5 py-0.5 rounded-full border border-[#BAD6FE] font-bold">
              SAFETY FIRST
            </span>
            <span className="font-mono text-[11px] text-[#829AB8]">
              {emergencyCatalogue.catalogue_version}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#07215A] tracking-tight">
            Quick Health & Safety Check
          </h1>
          <p className="text-xs sm:text-sm text-[#4A6588] mt-1.5 leading-relaxed">
            Before we begin, we check for acute symptoms that need immediate medical attention. Your answers are private and run locally in this session.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-[#FFF1F0] border border-[#FFCCC7] text-[#D92D20] text-xs font-medium flex items-center justify-between gap-3 animate-reveal-1"
          >
            <span>{error}</span>
            {checkUnavailable && (
              <a
                className="font-mono font-bold underline text-[#D92D20] shrink-0"
                href="/urgent.html"
              >
                Emergency help
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {emergencyCatalogue.questions.map((question, idx) => (
            <fieldset
              key={question.question_id}
              className="medical-card p-4 sm:p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold text-[#0062FF] bg-[#EBF4FF] px-2 py-0.5 rounded-full">
                  Step {idx + 1} of {emergencyCatalogue.questions.length}
                </span>
                <span className="font-mono text-[10px] text-[#829AB8]">
                  {question.concept_code}
                </span>
              </div>

              <legend className="text-sm sm:text-base font-bold text-[#07215A] leading-snug">
                {question.text}
              </legend>

              {/* Touch-first answer cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {(
                  [
                    ['YES', 'Yes'],
                    ['NO', 'No'],
                    ['NOT_SURE', 'Not sure'],
                    ['PREFER_NOT_TO_ANSWER', 'Prefer not to say'],
                  ] as const
                ).map(([value, label]) => {
                  const selected = answers[question.question_id] === value;
                  return (
                    <label
                      key={value}
                      className={`
                        flex items-center gap-3 rounded-xl border px-3.5 py-3 text-xs sm:text-sm
                        cursor-pointer transition-all duration-150 ease-out active:scale-[0.98] select-none
                        min-h-[46px]
                        ${selected
                          ? 'border-[#0062FF] bg-[#EBF4FF] font-bold text-[#07215A] shadow-xs ring-1 ring-[#0062FF]'
                          : 'border-[#E2ECF8] bg-[#F6F9FF] hover:bg-white hover:border-[#BAD6FE] text-[#4A6588]'
                        }
                      `}
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
                        className="accent-[#0062FF] w-4 h-4 cursor-pointer shrink-0"
                      />
                      <span className="flex-1">{label}</span>
                      {selected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF] shrink-0" />
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {/* Sticky mobile CTA in thumb zone */}
          <div className="pt-2 sticky bottom-4 z-20">
            <button
              type="submit"
              disabled={checking}
              className="btn-pill-primary w-full py-4 px-6 text-sm font-bold shadow-lg gap-2"
            >
              {checking ? (
                <>
                  <div className="spinner spinner-sm spinner-white" />
                  <span>Verifying safety rules…</span>
                </>
              ) : (
                <>
                  <span>Continue to Assessment</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
