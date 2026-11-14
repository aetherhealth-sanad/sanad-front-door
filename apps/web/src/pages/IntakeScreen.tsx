import React, { useEffect, useState } from 'react';
import {
  api,
  type IntakeAnswer,
  type PsychosocialQuestion,
  type QuestionsResponse,
  type QuestionItem,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';
import { ChatIntake } from './ChatIntake';

interface IntakeScreenProps {
  caseId: string;
  onAssessmentComplete: (route: string) => void;
  onOpenLab?: () => void;
  onNavigateToReview?: () => void;
  onAnswerRecorded?: (question: QuestionItem, answer: IntakeAnswer, label: string) => void;
}

interface IntakeFormProps extends IntakeScreenProps {
  onSwitchToChat: () => void;
}

/** `/intake`: the chat view (RF-21) by default, with the full form one tap away. Both use
 * the same answer endpoint, so the server checks are identical. */
export const IntakeScreen: React.FC<IntakeScreenProps> = props => {
  const [view, setView] = useState<'chat' | 'form'>('chat');
  return view === 'chat' ? (
    <ChatIntake {...props} onSwitchToForm={() => setView('form')} />
  ) : (
    <IntakeForm {...props} onSwitchToChat={() => setView('chat')} />
  );
};

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

const IntakeForm: React.FC<IntakeFormProps> = ({
  caseId,
  onAssessmentComplete,
  onOpenLab,
  onNavigateToReview,
  onAnswerRecorded,
  onSwitchToChat,
}) => {
  const [view, setView] = useState<'chat' | 'form'>('chat');
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

  const handleProceedToReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!catalogue) throw new Error('The intake question catalogue is unavailable.');
      const submittedAnswers: IntakeAnswer[] = [];
      for (const question of catalogue.questions) {
        const draft = draftAnswers[question.question_id];
        if (!draft || !draft.choice) continue;
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
      if (submittedPsychosocial.length > 0) {
        await api.savePsychosocial(caseId, submittedPsychosocial);
      }

      if (onNavigateToReview) {
        onNavigateToReview();
      } else {
        const assessment = await api.assessCase(caseId, 'FULL_INTAKE');
        sessionStorage.setItem('sanad_case_entry_path', 'FULL_INTAKE');
        if (assessment.draft_ready) {
          onAssessmentComplete(assessment.state.route);
        } else {
          const refreshed = await api.getQuestions(caseId);
          setCatalogue(refreshed);
          setDraftAnswers({});
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The answers could not be saved.',
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
        <div className="space-y-3">
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
            className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
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
                className="w-full px-4 py-2.5 rounded-xl border border-[#BCD8FE] bg-[#EBF3FF] text-sm font-semibold text-[#0050CC] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
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
        className="w-full px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
      />
    );
  };

  // If in Chat view, render ChatIntake with toggle to Form
  if (view === 'chat') {
    return (
      <ChatIntake
        caseId={caseId}
        onNavigateToReview={onNavigateToReview || (() => handleProceedToReview({ preventDefault: () => {} } as React.FormEvent))}
        onSwitchToForm={() => setView('form')}
        onOpenLab={onOpenLab}
        onAnswerSaved={onAnswerRecorded}
      />
    );
  }

  // Otherwise, render full Form view with toggle back to Chat
  return (
    <div className="w-full space-y-6">
      {/* Top Banner & View Switcher */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECF8] pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
                CLINICAL QUESTIONNAIRE
              </span>
              <span className="text-xs text-[#64748B]">Screening, not diagnosis</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
              Intake Questions
            </h1>
            <p className="text-sm text-[#475467] mt-1 leading-relaxed">
              Approved clinical questions. Not sure and Prefer not to say are always valid answers and never mean low risk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setView('chat')}
              className="btn-pill-primary px-4 py-2 rounded-full text-xs font-semibold cursor-pointer shadow-xs"
            >
              Switch to assistant chat
            </button>
            {onOpenLab && (
              <button
                type="button"
                onClick={onOpenLab}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#0050CC] bg-[#EBF3FF] hover:bg-[#D9E9FF] border border-[#BCD8FE] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                + Add lab values
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-xs font-semibold">
            {error}
          </div>
        )}
      </div>

      {loadingCatalogue ? (
        <div className="medical-card bg-white p-12 text-center text-sm text-[#64748B] rounded-2xl shadow-sm">
          <div className="inline-block w-6 h-6 border-2 border-[#0066EE] border-t-transparent rounded-full animate-spin mb-3" />
          <p>Loading catalogue...</p>
        </div>
      ) : (
        <form onSubmit={handleProceedToReview} className="space-y-6">
          <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-6">
            <h2 className="text-base font-bold text-[#0F172A] border-b border-[#E2ECF8] pb-3">
              Clinical Questions
            </h2>

            <div className="space-y-5">
              {catalogue?.questions.map((question, index) => {
                const current = draftAnswers[question.question_id];
                const isConflict = question.conflicting_values && question.conflicting_values.length > 0;

                return (
                  <div
                    key={question.question_id}
                    className={`p-5 rounded-2xl border transition-[background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out)] ${
                      isConflict ? 'border-[#FEDF89] bg-[#FFFAEB]' : 'border-[#E2ECF8] bg-[#FBFDFF] hover:border-[#BCD8FE]'
                    } space-y-3.5`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-xs text-[#64748B] font-medium">
                          Question {index + 1} of {catalogue.questions.length}
                          {question.blocking && ' · Core required'}
                        </span>
                        <p className="text-sm font-bold text-[#0F172A] leading-snug">
                          {question.text}
                        </p>
                        {question.reason && (
                          <p className="text-xs text-[#475467] leading-relaxed">
                            {question.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {isConflict && (
                      <p className="text-xs font-medium text-[#B54708]">
                        Conflicting values recorded. Your selection will update this record.
                      </p>
                    )}

                    {renderQuestionInput(question)}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F5F9]">
                      <button
                        type="button"
                        onClick={() =>
                          setAnswer(question.question_id, { choice: 'NOT_SURE' })
                        }
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                          current?.choice === 'NOT_SURE'
                            ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-xs'
                            : 'bg-white text-[#475467] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        Not sure
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setAnswer(question.question_id, { choice: 'PREFER_NOT_TO_ANSWER' })
                        }
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                          current?.choice === 'PREFER_NOT_TO_ANSWER'
                            ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-xs'
                            : 'bg-white text-[#475467] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        Prefer not to answer
                      </button>

                      {current?.choice && (
                        <button
                          type="button"
                          onClick={() => setAnswer(question.question_id, null)}
                          className="text-xs font-semibold text-[#94A3B8] hover:text-[#0F172A] underline cursor-pointer ml-1"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Psychosocial Questions */}
          {psychQuestions.length > 0 && (
            <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-5">
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">
                  Wellbeing Context (Optional)
                </h2>
                <p className="text-xs text-[#64748B] mt-1">
                  Up to three optional questions about how you have been. Self-reported context only, never used for triage.
                </p>
              </div>

              <div className="space-y-4">
                {psychQuestions.map(question => (
                  <div key={question.question_id} className="p-5 rounded-2xl border border-[#E2ECF8] bg-[#FBFDFF] space-y-3">
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {question.draft_text}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['KNOWN_POSITIVE', 'KNOWN_NEGATIVE', 'UNKNOWN', 'DECLINED'] as const).map(
                        stateKey => (
                          <button
                            key={stateKey}
                            type="button"
                            onClick={() =>
                              setPsychAnswers(prev => ({ ...prev, [question.question_id]: stateKey }))
                            }
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                              psychAnswers[question.question_id] === stateKey
                                ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-xs'
                                : 'bg-white text-[#475467] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            {stateKey === 'KNOWN_POSITIVE'
                              ? 'Yes'
                              : stateKey === 'KNOWN_NEGATIVE'
                              ? 'No'
                              : stateKey === 'UNKNOWN'
                              ? 'Not sure'
                              : 'Prefer not to say'}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit / Proceed to Review CTA */}
          <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#475467] leading-relaxed">
              When ready, proceed to review what Sanad has recorded before submitting.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="btn-pill-primary w-full sm:w-auto px-7 py-3.5 rounded-full font-bold text-sm text-white shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Saving answers...' : 'Proceed to Review Profile'}</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
