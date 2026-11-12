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
  onNavigateToReview,
  onAnswerRecorded,
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner & View Switcher */}
      <div className="dossier-card bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0B1310] pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <MockBadge label="INTAKE QUESTIONNAIRE" />
              <span className="font-mono text-xs text-[#3F4E48]">Screening, not diagnosis</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
              Intake Questions
            </h1>
            <p className="text-sm text-[#3F4E48] mt-1 leading-relaxed">
              Approved clinical questions. Not sure and Prefer not to say are always valid answers and never mean low risk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setView('chat')}
              className="px-3.5 py-2 rounded-[2px] border border-[#0B1310] bg-[#E6F2EE] font-mono text-xs font-bold text-[#0F523E] hover:bg-[#D5EAE2] cursor-pointer btn-press"
            >
              Switch to assistant chat
            </button>
            {onOpenLab && (
              <button
                type="button"
                onClick={onOpenLab}
                className="px-3.5 py-2 rounded-[2px] border border-[#0B1310] bg-white font-mono text-xs font-bold text-[#0B1310] hover:bg-[#E6EAE4] cursor-pointer btn-press"
              >
                + Add lab values
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-xs font-semibold">
            {error}
          </div>
        )}
      </div>

      {loadingCatalogue ? (
        <div className="dossier-card bg-white p-8 text-center font-mono text-sm text-[#3F4E48]">
          Loading catalogue…
        </div>
      ) : (
        <form onSubmit={handleProceedToReview} className="space-y-6">
          <div className="dossier-card bg-white p-6 space-y-6">
            <h2 className="text-base font-extrabold text-[#0B1310] border-b border-[#0B1310] pb-2">
              Clinical Questions
            </h2>

            <div className="space-y-5">
              {catalogue?.questions.map((question, index) => {
                const current = draftAnswers[question.question_id];
                const isConflict = question.conflicting_values && question.conflicting_values.length > 0;

                return (
                  <div
                    key={question.question_id}
                    className={`p-4 rounded-[2px] border ${
                      isConflict ? 'border-[#B45309] bg-[#FFFBEB]' : 'border-[#C5CEC9] bg-white'
                    } space-y-3`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className="font-mono text-xs text-[#63736C]">
                          Question {index + 1} of {catalogue.questions.length}
                          {question.blocking && ' · Core required'}
                        </span>
                        <p className="text-sm font-bold text-[#0B1310] leading-snug">
                          {question.text}
                        </p>
                        {question.reason && (
                          <p className="text-xs text-[#3F4E48] leading-relaxed">
                            {question.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {isConflict && (
                      <p className="text-xs font-mono text-[#78350F]">
                        Conflicting values recorded. Your selection will update this record.
                      </p>
                    )}

                    {renderQuestionInput(question)}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6EAE4]">
                      <button
                        type="button"
                        onClick={() =>
                          setAnswer(question.question_id, { choice: 'NOT_SURE' })
                        }
                        className={`px-3 py-1.5 rounded-[2px] font-mono text-xs border cursor-pointer btn-press ${
                          current?.choice === 'NOT_SURE'
                            ? 'bg-[#0B1310] text-white border-[#0B1310] font-bold'
                            : 'bg-white text-[#0B1310] border-[#0B1310] hover:bg-[#E6EAE4]'
                        }`}
                      >
                        Not sure
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setAnswer(question.question_id, { choice: 'PREFER_NOT_TO_ANSWER' })
                        }
                        className={`px-3 py-1.5 rounded-[2px] font-mono text-xs border cursor-pointer btn-press ${
                          current?.choice === 'PREFER_NOT_TO_ANSWER'
                            ? 'bg-[#0B1310] text-white border-[#0B1310] font-bold'
                            : 'bg-white text-[#0B1310] border-[#0B1310] hover:bg-[#E6EAE4]'
                        }`}
                      >
                        Prefer not to answer
                      </button>

                      {current?.choice && (
                        <button
                          type="button"
                          onClick={() => setAnswer(question.question_id, null)}
                          className="px-3 py-1.5 rounded-[2px] font-mono text-xs text-[#63736C] hover:text-[#0B1310] underline cursor-pointer"
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
            <div className="dossier-card bg-white p-6 space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-[#0B1310]">
                  Wellbeing Context (Optional)
                </h2>
                <p className="font-mono text-xs text-[#63736C] mt-1">
                  Up to three optional questions about how you have been. Self-reported context only, never used for triage.
                </p>
              </div>

              <div className="space-y-4">
                {psychQuestions.map(question => (
                  <div key={question.question_id} className="p-4 rounded-[2px] border border-[#C5CEC9] space-y-2">
                    <p className="text-sm font-semibold text-[#0B1310]">
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
                            className={`px-3 py-1.5 rounded-[2px] font-mono text-xs border cursor-pointer btn-press ${
                              psychAnswers[question.question_id] === stateKey
                                ? 'bg-[#0B1310] text-white border-[#0B1310] font-bold'
                                : 'bg-white text-[#0B1310] border-[#0B1310] hover:bg-[#E6EAE4]'
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
          <div className="dossier-card bg-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#3F4E48] leading-relaxed">
              When ready, proceed to review what Sanad has recorded before submitting.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer text-center"
            >
              {loading ? 'Saving answers…' : 'Proceed to Review Profile →'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
