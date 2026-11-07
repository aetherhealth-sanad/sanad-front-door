import { useEffect, useState } from 'react';
import {
  api,
  type IntakeAnswer,
  type PsychosocialQuestion,
  type QuestionsResponse,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface IntakeScreenProps {
  caseId: string;
  onAssessmentComplete: (route: string) => void;
  onOpenLab?: () => void;
}

type AnswerChoice = IntakeAnswer['choice'] | '';
type DraftAnswer = {
  choice: AnswerChoice;
  value?: boolean | number | string;
  temporal_status?: 'CURRENT' | 'PAST';
};
type PsychosocialState =
  | 'NOT_ASKED'
  | 'KNOWN_POSITIVE'
  | 'KNOWN_NEGATIVE'
  | 'UNKNOWN'
  | 'DECLINED';

const psychResponse: Record<
  Exclude<PsychosocialState, 'NOT_ASKED'>,
  'YES' | 'NO' | 'NOT_SURE' | null
> = {
  KNOWN_POSITIVE: 'YES',
  KNOWN_NEGATIVE: 'NO',
  UNKNOWN: 'NOT_SURE',
  DECLINED: null,
};

export const IntakeScreen: React.FC<IntakeScreenProps> = ({
  caseId,
  onAssessmentComplete,
  onOpenLab,
}) => {
  const [catalogue, setCatalogue] = useState<QuestionsResponse | null>(null);
  const [psychQuestions, setPsychQuestions] = useState<PsychosocialQuestion[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [psychAnswers, setPsychAnswers] = useState<Record<string, PsychosocialState>>({});
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getQuestions(caseId), api.getPsychosocialQuestions()])
      .then(([intakeResponse, psychCat]) => {
        if (!mounted) return;
        setCatalogue(intakeResponse);
        setPsychQuestions(psychCat.questions);
      })
      .catch(err => {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Question catalogues are unavailable.',
          );
        }
      })
      .finally(() => {
        if (mounted) setLoadingCatalogue(false);
      });
    return () => {
      mounted = false;
    };
  }, [caseId]);

  const setAnswer = (questionId: string, answer: DraftAnswer | null) => {
    setDraftAnswers(previous => {
      const next = { ...previous };
      if (answer === null) delete next[questionId];
      else next[questionId] = answer;
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!catalogue) throw new Error('The intake question catalogue is unavailable.');
      const submittedAnswers: IntakeAnswer[] = [];
      for (const question of catalogue.questions) {
        const draft = draftAnswers[question.question_id];
        if (!draft || !draft.choice) continue; // Unanswered remains NOT_ASKED.
        if (draft.choice !== 'ANSWERED') {
          submittedAnswers.push({
            question_id: question.question_id,
            choice: draft.choice,
          });
          continue;
        }
        if (draft.value === undefined || draft.value === '') {
          throw new Error(
            `Enter a value or leave "${question.text}" unanswered.`,
          );
        }
        if (
          question.temporal_options.length &&
          draft.value === true &&
          !draft.temporal_status
        ) {
          throw new Error(
            `Choose whether "${question.text}" is current or past.`,
          );
        }
        const value =
          typeof draft.value === 'string' &&
          ['INTEGER', 'NUMBER'].includes(question.answer_type)
            ? Number(draft.value)
            : draft.value;
        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new Error(`Enter a valid number for "${question.text}".`);
        }
        submittedAnswers.push({
          question_id: question.question_id,
          choice: 'ANSWERED',
          value,
          temporal_status: draft.temporal_status,
        });
      }

      if (submittedAnswers.length > 0) {
        await api.submitAnswers(caseId, submittedAnswers);
      }

      const submittedPsychosocial = psychQuestions.flatMap(question => {
        const state = psychAnswers[question.question_id] ?? 'NOT_ASKED';
        if (state === 'NOT_ASKED') return [];
        return [
          {
            question_id: question.question_id,
            response_state: state,
            response_code: psychResponse[state],
          },
        ];
      });
      await api.savePsychosocial(caseId, submittedPsychosocial);

      const assessment = await api.assessCase(caseId, 'FULL_INTAKE');
      sessionStorage.setItem('sanad_case_entry_path', 'FULL_INTAKE');
      if (assessment.draft_ready) {
        onAssessmentComplete(assessment.state.route);
      } else {
        const refreshed = await api.getQuestions(caseId);
        setCatalogue(refreshed);
        setDraftAnswers({});
        setError(
          refreshed.questions.length
            ? 'More information is needed before a draft can be prepared. Answer the follow-up questions or leave them unknown.'
            : 'The assessment is not ready yet. The case remains in its current state.',
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The assessment could not be submitted.',
      );
    } finally {
      setLoading(false);
    }
  };

  const renderQuestionInput = (question: QuestionsResponse['questions'][number]) => {
    const current = draftAnswers[question.question_id];
    if (question.options.length > 0) {
      const selectedIndex = question.options.findIndex(
        option => option.value === current?.value,
      );
      return (
        <div className="space-y-2.5">
          <select
            value={
              current?.choice === 'ANSWERED' && selectedIndex >= 0
                ? String(selectedIndex)
                : ''
            }
            onChange={event => {
              const option = question.options[Number(event.target.value)];
              setAnswer(
                question.question_id,
                option ? { choice: 'ANSWERED', value: option.value } : null,
              );
            }}
            className="w-full px-3.5 py-2.5 rounded-[2px] border border-[#0B1310] bg-white text-sm text-[#0B1310]"
          >
            <option value="">Choose an answer or leave not asked</option>
            {question.options.map((option, index) => (
              <option key={String(option.value)} value={index}>
                {option.label}
              </option>
            ))}
          </select>
          {question.temporal_options.length > 0 &&
            current?.choice === 'ANSWERED' &&
            current.value === true && (
              <select
                aria-label="Current or past"
                value={current.temporal_status ?? ''}
                onChange={event =>
                  setAnswer(question.question_id, {
                    ...current,
                    temporal_status: (event.target.value || undefined) as DraftAnswer['temporal_status'],
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-[2px] border border-[#0B1310] bg-[#E6F2EE] text-sm font-medium text-[#0B1310]"
              >
                <option value="">Choose current or past</option>
                {question.temporal_options.map(option => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
        </div>
      );
    }
    return (
      <input
        type="number"
        name={question.question_id}
        aria-label={question.text}
        step={question.answer_type === 'INTEGER' ? '1' : 'any'}
        value={
          typeof current?.value === 'string' || typeof current?.value === 'number'
            ? current.value
            : ''
        }
        onChange={event =>
          setAnswer(
            question.question_id,
            event.target.value === ''
              ? null
              : { choice: 'ANSWERED', value: event.target.value },
          )
        }
        placeholder={question.unit ? `Value (${question.unit})` : 'Enter a value'}
        className="w-full px-3.5 py-2.5 rounded-[2px] border border-[#0B1310] bg-white text-sm text-[#0B1310]"
      />
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <MockBadge
              label={`MOCK INTAKE QUESTIONS · ${catalogue?.approval_status ?? 'CLINICAL_TBD'}`}
            />
            {catalogue && (
              <span className="font-mono text-xs text-[#3F4E48]">
                {catalogue.catalogue_version}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            Structured Context Questions
          </h1>
          <p className="text-sm sm:text-base text-[#3F4E48] mt-1.5 leading-relaxed">
            Question wording and rules are draft research content. Skipped, unknown, and declined answers stay distinct.
          </p>
        </div>

        {onOpenLab && (
          <button
            type="button"
            onClick={onOpenLab}
            className="px-4 py-2.5 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
          >
            Open J3 Lab Observations →
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm font-medium"
        >
          {error}
        </div>
      )}
      {loadingCatalogue && (
        <p className="text-sm font-mono text-[#3F4E48]">Loading draft questions…</p>
      )}

      {!loadingCatalogue && catalogue && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="dossier-card bg-white p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B1310]">
              <h2 className="text-base font-extrabold text-[#0B1310]">
                Questions for this case ({catalogue.questions.length})
              </h2>
              <span className="font-mono text-xs text-[#3F4E48]">
                EPISTEMIC HONESTY ENFORCED
              </span>
            </div>

            {catalogue.questions.length === 0 && (
              <p className="text-sm text-[#3F4E48]">
                No follow-up questions are currently requested. You may continue to the draft assessment.
              </p>
            )}

            {catalogue.questions.map(question => (
              <div
                key={question.question_id}
                className="space-y-3 border-b border-[#C5CEC9] pb-5 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-bold text-[#0B1310]">
                    {question.text}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] px-2 py-0.5 bg-[#F3F4F1] border border-[#C5CEC9] text-[#3F4E48]">
                      {question.question_id} · {question.reason}
                    </span>
                    {question.blocking && (
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-[#FFFBEB] border border-[#B45309] text-[#78350F]">
                        Needed for this draft
                      </span>
                    )}
                  </div>
                </div>

                {question.conflicting_values.length > 0 && (
                  <div className="rounded-[2px] bg-[#FFFBEB] border border-[#B45309] p-3 text-xs text-[#78350F] font-mono">
                    <strong>Conflicting recorded values:</strong>
                    <ul className="mt-1 space-y-1">
                      {question.conflicting_values.map((item, index) => (
                        <li key={`${item.source_type}-${index}`}>
                          {String(item.value ?? 'Unknown')}
                          {item.unit ? ` ${item.unit}` : ''} · {item.source_type}
                          {item.temporal_status ? ` · ${item.temporal_status}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {renderQuestionInput(question)}

                <div className="flex flex-wrap gap-2">
                  {question.opt_out_choices.map(choice => {
                    const active = draftAnswers[question.question_id]?.choice === choice;
                    return (
                      <button
                        type="button"
                        key={choice}
                        onClick={() =>
                          setAnswer(question.question_id, {
                            choice: choice as IntakeAnswer['choice'],
                          })
                        }
                        className={`px-3 py-1.5 rounded-[2px] border font-mono text-xs cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#0B1310] border-[#0B1310] text-white font-bold'
                            : 'bg-[#F3F4F1] border-[#0B1310] text-[#0B1310] hover:bg-[#E6EAE4]'
                        }`}
                      >
                        {choice === 'NOT_SURE' ? 'Not sure' : 'Prefer not to answer'}
                      </button>
                    );
                  })}
                  {draftAnswers[question.question_id] && (
                    <button
                      type="button"
                      onClick={() => setAnswer(question.question_id, null)}
                      className="px-3 py-1.5 rounded-[2px] font-mono text-xs text-[#3F4E48] underline cursor-pointer"
                    >
                      Leave not asked
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Optional Psychosocial Micro-Intake (PRD-FR-29/30) */}
          <div className="dossier-card bg-[#E6EAE4] p-6 space-y-4">
            <div>
              <MockBadge label="MOCK OPTIONAL CONTEXT · CLINICAL_TBD" />
              <h2 className="text-base font-extrabold text-[#0B1310] mt-2">
                Optional Psychosocial Self-Reports (Max 3)
              </h2>
              <p className="text-xs text-[#3F4E48] mt-1 leading-relaxed">
                These optional self-reports are unverified context only (<code className="font-mono">PATIENT_REPORTED</code>,{' '}
                <code className="font-mono">UNVERIFIED</code>) and never enter triage rules. You can skip all three.
              </p>
            </div>
            <div className="space-y-3">
              {psychQuestions.map(question => (
                <label
                  key={question.question_id}
                  className="block p-3.5 rounded-[2px] bg-white border border-[#0B1310] text-sm font-semibold text-[#0B1310]"
                >
                  <span className="block mb-1.5">{question.draft_text}</span>
                  <select
                    value={psychAnswers[question.question_id] ?? 'NOT_ASKED'}
                    onChange={event =>
                      setPsychAnswers(previous => ({
                        ...previous,
                        [question.question_id]: event.target.value as PsychosocialState,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-[2px] border border-[#0B1310] bg-[#F3F4F1] text-sm font-normal"
                  >
                    <option value="NOT_ASKED">Skip (not asked)</option>
                    <option value="KNOWN_POSITIVE">Yes</option>
                    <option value="KNOWN_NEGATIVE">No</option>
                    <option value="UNKNOWN">Not sure</option>
                    <option value="DECLINED">Prefer not to say</option>
                  </select>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Preparing draft…' : 'Save answers and prepare draft →'}
          </button>
        </form>
      )}
    </div>
  );
};
