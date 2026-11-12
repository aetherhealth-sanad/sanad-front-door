import React, { useEffect, useRef, useState } from 'react';
import {
  api,
  type IntakeAnswer,
  type QuestionItem,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

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
  'px-3.5 py-2 rounded-[2px] border text-sm cursor-pointer btn-press disabled:opacity-50 disabled:cursor-not-allowed';
const answerButton = `${buttonBase} border-[#0B1310] bg-white text-[#0B1310] font-semibold hover:bg-[#E6F2EE]`;
const optOutButton = `${buttonBase} border-[#0B1310] bg-[#F3F4F1] text-[#0B1310] font-mono text-xs hover:bg-[#E6EAE4]`;

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
              text: "I'll ask the approved intake questions one at a time. For each one you can choose an answer, select Not sure or Prefer not to say, or skip it.",
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
      <div className="dossier-card bg-white p-8 text-center font-mono text-sm text-[#3F4E48]">
        Loading intake questions…
      </div>
    );
  }

  return (
    <div className="dossier-card bg-white flex flex-col min-w-0" aria-label="Intake chat">
      {/* Chat Header */}
      <div className="px-5 py-3.5 border-b border-[#0B1310] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-[#0B1310]">
              Sanad assistant
            </h2>
            <MockBadge label="SCRIPTED QUESTIONS" />
          </div>
          <p className="font-mono text-[11px] text-[#3F4E48]">
            Scripted questions from a draft catalogue · Screening, not diagnosis
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSwitchToForm}
            className="px-3 py-1.5 rounded-[2px] font-mono text-xs font-semibold text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] cursor-pointer btn-press"
          >
            Use the form instead
          </button>
          {onOpenLab && (
            <button
              type="button"
              onClick={onOpenLab}
              className="px-3 py-1.5 rounded-[2px] font-mono text-xs font-semibold text-[#0F523E] bg-[#E6F2EE] hover:bg-[#D5EAE2] border border-[#0F523E] cursor-pointer btn-press"
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
        className="px-5 py-4 space-y-3.5 max-h-[50vh] overflow-y-auto bg-white"
      >
        {entries.map(entry => {
          if (entry.kind === 'assistant') {
            return (
              <div
                key={entry.id}
                className="max-w-[85%] rounded-[2px] border border-[#C5CEC9] bg-[#F3F4F1] px-4 py-3 text-sm text-[#0B1310] leading-relaxed"
              >
                {entry.text}
              </div>
            );
          }
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="ml-auto max-w-[85%] text-right">
                <div className="inline-block rounded-[2px] border border-[#0F523E] bg-[#E6F2EE] px-4 py-2.5 text-sm text-[#0B1310] font-semibold text-left break-words">
                  {entry.text}
                </div>
                {entry.note && (
                  <p className="font-mono text-[10px] text-[#3F4E48] mt-1">{entry.note}</p>
                )}
              </div>
            );
          }
          return (
            <p
              key={entry.id}
              className="text-xs font-mono text-[#78350F] bg-[#FFFBEB] border border-[#B45309] rounded-[2px] px-3 py-2"
            >
              {entry.text}
            </p>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Answer Input Controls */}
      <div className="border-t border-[#0B1310] px-5 py-4 space-y-3 bg-[#FBFBFA]">
        {error && (
          <div role="alert" className="p-3 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-xs font-semibold">
            {error}
          </div>
        )}

        {current && !allQuestionsAnswered && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#3F4E48]">
              <span>Question {index + 1} of {queue.length}</span>
              {current.blocking && (
                <span className="font-bold text-[#C84B31] bg-[#FDF2EF] px-2 py-0.5 border border-[#C84B31]">
                  Core required
                </span>
              )}
            </div>

            {/* Conflict Notice if any */}
            {current.conflicting_values && current.conflicting_values.length > 0 && (
              <div className="p-2.5 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-xs text-[#78350F]">
                <strong>More than one answer recorded for this question.</strong> Your selection here updates your record.
              </div>
            )}

            {/* Answer Options */}
            {current.options.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Answer options">
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
              <form onSubmit={saveNumber} className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step={current.answer_type === 'INTEGER' ? '1' : 'any'}
                  value={numberText}
                  onChange={e => setNumberText(e.target.value)}
                  placeholder={current.unit ? `Value in ${current.unit}` : 'Enter value'}
                  className="w-44 px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm"
                />
                <button type="submit" disabled={busy || !numberText} className={answerButton}>
                  Save
                </button>
              </form>
            )}

            {/* Opt-Out Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#E6EAE4]">
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
                className={`${optOutButton} underline`}
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Transition to Review My Health Profile */}
        {allQuestionsAnswered && (
          <div className="p-4 rounded-[2px] bg-[#E6F2EE] border border-[#0F523E] space-y-3">
            <p className="text-sm font-bold text-[#0B1310]">
              You have completed the questions for this round.
            </p>
            <p className="text-xs text-[#3F4E48] leading-relaxed">
              Next step: Proceed to <strong>Review My Health Profile</strong> to verify all your recorded answers before submitting for assessment processing.
            </p>
            <button
              type="button"
              onClick={onNavigateToReview}
              className="w-full py-3 px-4 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer text-center"
            >
              Continue to profile review →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
