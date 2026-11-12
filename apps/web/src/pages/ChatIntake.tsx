import React, { useEffect, useRef, useState } from 'react';
import {
  api,
  type IntakeAnswer,
  type QuestionItem,
} from '../api/client';

interface ChatIntakeProps {
  caseId: string;
  onNavigateToReview: () => void;
  onSwitchToForm: () => void;
  onOpenLab?: () => void;
  onAnswerSaved?: (question: QuestionItem, answer: IntakeAnswer, label: string) => void;
}

type Choice = { label: string; answer: IntakeAnswer };

type Entry =
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'user'; id: string; text: string; note?: string }
  | { kind: 'notice'; id: string; text: string };

const OPT_OUTS: Array<{ label: string; choice: IntakeAnswer['choice'] }> = [
  { label: 'Not sure', choice: 'NOT_SURE' },
  { label: 'Prefer not to say', choice: 'PREFER_NOT_TO_ANSWER' },
];

const buttonBase =
  'px-4 py-2 rounded-full border text-sm cursor-pointer transition-[transform,background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out)] disabled:opacity-50 disabled:cursor-not-allowed';
const answerButton = `${buttonBase} border-[#CBD5E1] bg-white text-[#1E293B] font-semibold hover:border-[#0066EE] hover:bg-[#EBF3FF] hover:text-[#0050CC] shadow-xs active:scale-[0.97]`;
const optOutButton =
  'px-3.5 py-1.5 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] text-xs font-medium hover:bg-[#EDF2F7] hover:text-[#1E293B] transition-[transform,background-color,border-color] duration-160 ease-[var(--ease-out)] cursor-pointer disabled:opacity-50 active:scale-[0.97]';

function answerChoices(question: QuestionItem): Choice[] {
  const choices: Choice[] = [];
  for (const option of question.options) {
    if (option.value === true && question.temporal_options && question.temporal_options.length > 0) {
      for (const temporal of question.temporal_options) {
        choices.push({
          label: temporal.label,
          answer: {
            question_id: question.question_id,
            choice: 'ANSWERED',
            value: true,
            temporal_status: temporal.value as 'CURRENT' | 'PAST',
          },
        });
      }
    } else {
      choices.push({
        label: option.label,
        answer: { question_id: question.question_id, choice: 'ANSWERED', value: option.value },
      });
    }
  }
  return choices;
}

export const ChatIntake: React.FC<ChatIntakeProps> = ({
  caseId,
  onNavigateToReview,
  onSwitchToForm,
  onOpenLab,
  onAnswerSaved,
}) => {
  const [queue, setQueue] = useState<QuestionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [numberText, setNumberText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const push = (entry: { kind: 'assistant' | 'notice'; text: string } | { kind: 'user'; text: string; note?: string }) => {
    setEntries(prev => [...prev, { ...entry, id: `entry-${nextId.current++}` } as Entry]);
  };

  const current = queue[index];

  useEffect(() => {
    let mounted = true;
    api.getQuestions(caseId)
      .then(res => {
        if (!mounted) return;
        setQueue(res.questions);
        setIndex(0);
        if (res.questions.length > 0) {
          setEntries([
            {
              kind: 'assistant',
              id: 'intro',
              text: "Welcome to Sanad. I will guide you through our standard clinical questions one at a time. Take your time: you can choose an answer, select Not sure or Prefer not to say, or skip it. All responses are kept strictly confidential in your private session.",
            },
            {
              kind: 'assistant',
              id: 'q0',
              text: res.questions[0].text,
            },
          ]);
        } else {
          setAllQuestionsAnswered(true);
        }
      })
      .catch(err => {
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load questions.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [caseId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  const moveOn = (nextIdx: number) => {
    setNumberText('');
    if (nextIdx < queue.length) {
      setIndex(nextIdx);
      push({ kind: 'assistant', text: queue[nextIdx].text });
    } else {
      setAllQuestionsAnswered(true);
      push({
        kind: 'assistant',
        text: "That is all the intake questions for now. When you are ready, continue to review your recorded profile before submitting.",
      });
    }
  };

  const saveAnswer = async (choice: Choice) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const state = await api.submitAnswers(caseId, [choice.answer]);
      if (state.route === '/urgent.html') {
        window.location.replace('/urgent.html');
        return;
      }
      push({ kind: 'user', text: choice.label });
      if (onAnswerSaved) {
        onAnswerSaved(current, choice.answer, choice.label);
      }
      moveOn(index + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save answer. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const skipCurrent = () => {
    if (!current) return;
    push({ kind: 'user', text: 'Skip' });
    if (onAnswerSaved) {
      onAnswerSaved(current, { question_id: current.question_id, choice: 'NOT_SURE' }, 'Skipped');
    }
    moveOn(index + 1);
  };

  const saveNumber = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const val = Number(numberText);
    if (numberText.trim() === '' || !Number.isFinite(val)) {
      setError('Please enter a valid number.');
      return;
    }
    const label = current.unit ? `${val} ${current.unit}` : String(val);
    void saveAnswer({
      label,
      answer: { question_id: current.question_id, choice: 'ANSWERED', value: val },
    });
  };

  if (loading) {
    return (
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4 max-w-xl mx-auto animate-reveal-1">
        <div className="flex items-center gap-3 pb-3 border-b border-[#E2ECF8]">
          <div className="w-10 h-10 rounded-full skeleton shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
        <div className="space-y-3 py-3">
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full skeleton shrink-0" />
            <div className="skeleton h-14 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <div className="skeleton h-10 w-2/5 rounded-2xl" />
          </div>
        </div>
        <p className="text-center text-xs text-[#0062FF] font-medium flex items-center justify-center gap-2 pt-2">
          <span className="spinner spinner-sm" />
          <span>Starting your private guided conversation…</span>
        </p>
      </div>
    );
  }

  return (
    <div className="medical-card bg-white flex flex-col min-w-0 rounded-2xl border border-[#E2ECF8] shadow-lg overflow-hidden" aria-label="Intake chat">
      {/* Chat Header */}
      <div className="px-6 py-4.5 border-b border-[#E2ECF8] bg-gradient-to-r from-white to-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <img
              src="/assets/images/medical_doctor_avatar.jpg"
              alt="Clinical Health Companion"
              className="w-11 h-11 rounded-full object-cover border-2 border-[#BCD8FE] shadow-xs"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#12B76A] border-2 border-white" title="Active private session" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#072254]">
                Sanad Health Companion
              </h2>
              <span className="text-[11px] font-mono text-[#0066EE] bg-[#EBF3FF] px-2 py-0.5 rounded-full border border-[#BCD8FE]">
                Guided Session
              </span>
            </div>
            <p className="text-xs text-[#64748B]">
              Private health assessment · Screening, not diagnosis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSwitchToForm}
            className="btn-pill-secondary px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
          >
            Use the form instead
          </button>
          {onOpenLab && (
            <button
              type="button"
              onClick={onOpenLab}
              className="px-4 py-1.5 rounded-full text-xs font-semibold text-[#0050CC] bg-[#EBF3FF] hover:bg-[#D9E9FF] border border-[#BCD8FE] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
            >
              + Lab values
            </button>
          )}
        </div>
      </div>

      {/* Chat Conversation Thread */}
      <div
        role="log"
        aria-live="polite"
        className="px-6 py-5 space-y-4 max-h-[52vh] overflow-y-auto bg-[#FBFDFF]"
      >
        {entries.map(entry => {
          if (entry.kind === 'assistant') {
            return (
              <div key={entry.id} className="flex items-start gap-2.5 max-w-[85%] chat-bubble-enter">
                <img
                  src="/assets/images/medical_doctor_avatar.jpg"
                  alt="Companion Avatar"
                  className="w-7 h-7 rounded-full object-cover border border-[#BCD8FE] shrink-0 mt-0.5 shadow-2xs"
                />
                <div className="rounded-2xl rounded-tl-sm border border-[#DCE9FA] bg-[#F2F7FF] px-4 py-3 text-sm text-[#0F172A] leading-relaxed shadow-2xs">
                  {entry.text}
                </div>
              </div>
            );
          }
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="ml-auto max-w-[85%] text-right chat-bubble-enter">
                <div className="inline-block rounded-2xl rounded-tr-sm bg-gradient-to-r from-[#0066EE] to-[#0050CC] px-4 py-2.5 text-sm text-white font-medium text-left break-words shadow-xs">
                  {entry.text}
                </div>
                {entry.note && (
                  <p className="text-[11px] text-[#64748B] mt-1 font-medium">{entry.note}</p>
                )}
              </div>
            );
          }
          return (
            <p
              key={entry.id}
              className="text-xs font-medium text-[#B54708] bg-[#FFFAEB] border border-[#FEDF89] rounded-xl px-3.5 py-2.5 chat-bubble-enter"
            >
              {entry.text}
            </p>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2.5 max-w-[85%] chat-bubble-enter">
            <img
              src="/assets/images/medical_doctor_avatar.jpg"
              alt="Companion Avatar"
              className="w-7 h-7 rounded-full object-cover border border-[#BCD8FE] shrink-0 shadow-2xs"
            />
            <div className="rounded-2xl rounded-tl-sm border border-[#DCE9FA] bg-[#F2F7FF] px-4 py-3 text-xs text-[#0062FF] flex items-center gap-1.5 shadow-2xs">
              <span className="dot-pulse flex gap-1">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Answer Input Controls */}
      <div className="border-t border-[#E2ECF8] px-6 py-5 space-y-4 bg-white">
        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-xs font-semibold">
            {error}
          </div>
        )}

        {current && !allQuestionsAnswered && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-medium">Question {index + 1} of {queue.length}</span>
              {current.blocking && (
                <span className="font-semibold text-[#D92D20] bg-[#FEF3F2] px-2.5 py-0.5 rounded-full border border-[#FECDCA] text-[11px]">
                  Core required
                </span>
              )}
            </div>

            {/* Conflict Notice if any */}
            {current.conflicting_values && current.conflicting_values.length > 0 && (
              <div className="p-3 rounded-xl bg-[#FFFAEB] border border-[#FEDF89] text-xs text-[#B54708]">
                <strong>More than one answer recorded for this question.</strong> Your selection here updates your record.
              </div>
            )}

            {/* Answer Options */}
            {current.options.length > 0 ? (
              <div className="flex flex-wrap gap-2.5" role="group" aria-label="Answer options">
                {answerChoices(current).map(choice => (
                  <button
                    key={choice.label}
                    type="button"
                    disabled={busy}
                    onClick={() => void saveAnswer(choice)}
                    className={answerButton}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={saveNumber} className="flex flex-wrap items-center gap-2.5">
                <input
                  type="number"
                  inputMode="decimal"
                  step={current.answer_type === 'INTEGER' ? '1' : 'any'}
                  value={numberText}
                  onChange={e => setNumberText(e.target.value)}
                  placeholder={current.unit ? `Value in ${current.unit}` : 'Enter value'}
                  className="w-48 px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0066EE]"
                />
                <button type="submit" disabled={busy || !numberText} className="btn-pill-primary px-5 py-2 text-sm">
                  Save
                </button>
              </form>
            )}

            {/* Opt-Out Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F5F9]">
              {OPT_OUTS.map(opt => (
                <button
                  key={opt.choice}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveAnswer({
                      label: opt.label,
                      answer: { question_id: current.question_id, choice: opt.choice },
                    })
                  }
                  className={optOutButton}
                >
                  {opt.label}
                </button>
              ))}

              <button
                type="button"
                disabled={busy}
                onClick={skipCurrent}
                className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] underline cursor-pointer ml-1"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Transition to Review My Health Profile */}
        {allQuestionsAnswered && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#F2F7FF] to-white border border-[#BCD8FE] space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#12B76A]" />
              <p className="text-sm font-bold text-[#0F172A]">
                You have completed the questions for this round.
              </p>
            </div>
            <p className="text-xs text-[#475467] leading-relaxed">
              Next step: Proceed to <strong>Review My Health Profile</strong> to verify all your recorded answers before submitting for assessment processing.
            </p>
            <button
              type="button"
              onClick={onNavigateToReview}
              className="btn-pill-primary w-full py-3.5 px-6 rounded-full font-bold text-sm text-white shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Continue to profile review</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
