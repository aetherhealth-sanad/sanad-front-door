import { useEffect, useRef, useState } from 'react';
import {
  api,
  type AssistantInfo,
  type IntakeAnswer,
  type InterpretResponse,
  type PsychosocialAnswer,
  type PsychosocialQuestion,
  type QuestionItem,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

/**
 * RF-21 chat intake (UX flow v0.3, step 4). The chat presents the approved question catalogue
 * one question at a time. It is not a free diagnostic conversation.
 *
 * - Every answer is saved through POST /answers at once, so the server's emergency gate runs
 *   after each one. Any route to /urgent.html replaces the page.
 * - Typing appears only when the server reports a model and the user has read the disclosure.
 *   The server runs the emergency text check before anything else; a model match is a
 *   proposal the user must confirm, and its wording comes from catalogue labels.
 * - Nothing here is written to browser storage. Quick exit clears it with the page.
 */

interface ChatIntakeProps {
  caseId: string;
  onAssessmentComplete: (route: string) => void;
  onSwitchToForm: () => void;
  onOpenLab?: () => void;
  onNavigateToReview?: () => void;
  onAnswerSaved?: (question: QuestionItem, answer: IntakeAnswer, label: string) => void;
}

type Status = 'Answered' | 'Not sure' | 'Prefer not to say' | 'Skipped';

type Recorded = {
  questionId: string;
  question: string;
  label: string;
  status: Status;
  core: boolean;
  matchedByAi: boolean;
};

type Entry =
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'user'; id: string; text: string; note?: string }
  | { kind: 'notice'; id: string; text: string };

type Phase = 'loading' | 'questions' | 'wellbeing' | 'ready' | 'processing' | 'unavailable';

type Choice = { label: string; answer: IntakeAnswer };

const OPT_OUTS: Array<{ label: string; choice: IntakeAnswer['choice'] }> = [
  { label: 'Not sure', choice: 'NOT_SURE' },
  { label: 'Prefer not to answer', choice: 'PREFER_NOT_TO_ANSWER' },
];

const WELLBEING_CHOICES: Array<{ label: string; answer: Omit<PsychosocialAnswer, 'question_id'> | null }> = [
  { label: 'Yes', answer: { response_state: 'KNOWN_POSITIVE', response_code: 'YES' } },
  { label: 'No', answer: { response_state: 'KNOWN_NEGATIVE', response_code: 'NO' } },
  { label: 'Not sure', answer: { response_state: 'UNKNOWN', response_code: 'NOT_SURE' } },
  { label: 'Prefer not to say', answer: { response_state: 'DECLINED', response_code: null } },
  { label: 'Skip', answer: null },
];

const SOURCE_LABELS: Record<string, string> = {
  PATIENT_REPORTED: 'You',
  SAMPLE_FIXTURE: 'Sample profile',
  USER_UPLOADED: 'Uploaded file, unverified',
  USER_ENTERED: 'You',
};

function answerChoices(question: QuestionItem): Choice[] {
  const choices: Choice[] = [];
  for (const option of question.options) {
    if (option.value === true && question.temporal_options.length > 0) {
      // "Yes, now" and "Yes, in the past" are separate answers and never merged (PRD-FR-17).
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

const WELLBEING_INTRO =
  'Up to three optional questions about how you have been. They are self-reported context only and are not used to choose a next step. You can skip each one.';
const READY_TEXT =
  "That's all the questions for now. When you're ready, I'll check your answers with the draft rules.";

/** The assistant's opening lines for a round of questions, and the phase it starts in. Pass
 * an empty wellbeing list once the optional questions have been asked. */
function roundOpening(
  questions: QuestionItem[],
  wellbeingQuestions: PsychosocialQuestion[],
  first: boolean,
): { phase: Phase; texts: string[] } {
  const intro = first
    ? "I'll ask the questions one at a time. For each one you can answer, choose Not sure or Prefer not to answer, or skip it."
    : 'A few answers are still needed before a draft summary can be prepared.';
  if (questions.length > 0) return { phase: 'questions', texts: [intro, questions[0].text] };
  if (wellbeingQuestions.length > 0) {
    return { phase: 'wellbeing', texts: [intro, WELLBEING_INTRO, wellbeingQuestions[0].draft_text] };
  }
  return { phase: 'ready', texts: [intro, READY_TEXT] };
}

function statusOf(answer: IntakeAnswer): Status {
  if (answer.choice === 'NOT_SURE') return 'Not sure';
  if (answer.choice === 'PREFER_NOT_TO_ANSWER') return 'Prefer not to say';
  return 'Answered';
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('VALUE_OUT_OF_RANGE')) return 'That number looks out of range. Can you check it?';
  if (message.includes('VALUE_TYPE')) return 'Enter the number in the unit shown.';
  if (err instanceof TypeError || message.startsWith('HTTP 5')) {
    return "Can't reach the server. Try again. The emergency link above still works.";
  }
  return message || 'That could not be saved. Try again, or choose another option.';
}

const buttonBase =
  'px-3.5 py-2 rounded-[2px] border text-sm cursor-pointer btn-press disabled:opacity-50 disabled:cursor-not-allowed';
const answerButton = `${buttonBase} border-[#0B1310] bg-white text-[#0B1310] font-semibold hover:bg-[#E6F2EE]`;
const optOutButton = `${buttonBase} border-[#0B1310] bg-[#F3F4F1] text-[#0B1310] font-mono text-xs hover:bg-[#E6EAE4]`;

export const ChatIntake: React.FC<ChatIntakeProps> = ({
  caseId,
  onAssessmentComplete,
  onSwitchToForm,
  onOpenLab,
  onAnswerSaved,
}) => {
  const [assistant, setAssistant] = useState<AssistantInfo | null>(null);
  const [approvalStatus, setApprovalStatus] = useState('CLINICAL_TBD');
  const [queue, setQueue] = useState<QuestionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [coreIds, setCoreIds] = useState<string[]>([]);
  const [wellbeing, setWellbeing] = useState<PsychosocialQuestion[]>([]);
  const [wellbeingIndex, setWellbeingIndex] = useState(0);
  const [wellbeingAnswers, setWellbeingAnswers] = useState<PsychosocialAnswer[]>([]);
  const [wellbeingDone, setWellbeingDone] = useState(false);
  const [typingAcknowledged, setTypingAcknowledged] = useState(false);
  const [typed, setTyped] = useState('');
  const [numberText, setNumberText] = useState('');
  const [proposal, setProposal] = useState<InterpretResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  const push = (entry: { kind: 'assistant' | 'notice'; text: string } | { kind: 'user'; text: string; note?: string }) =>
    setEntries(previous => [...previous, { ...entry, id: `entry-${nextId.current++}` } as Entry]);

  const current = phase === 'questions' ? queue[index] : undefined;
  const currentWellbeing = phase === 'wellbeing' ? wellbeing[wellbeingIndex] : undefined;

  const pendingWellbeing = wellbeingDone ? [] : wellbeing;

  const showReady = () => {
    setPhase('ready');
    push({ kind: 'assistant', text: READY_TEXT });
  };

  const afterQuestions = () => {
    if (pendingWellbeing.length > 0) {
      setPhase('wellbeing');
      setWellbeingIndex(0);
      push({ kind: 'assistant', text: WELLBEING_INTRO });
      push({ kind: 'assistant', text: pendingWellbeing[0].draft_text });
      return;
    }
    showReady();
  };

  const startNextRound = (questions: QuestionItem[]) => {
    const opening = roundOpening(questions, pendingWellbeing, false);
    setQueue(questions);
    setIndex(0);
    setWellbeingIndex(0);
    setPhase(opening.phase);
    for (const text of opening.texts) push({ kind: 'assistant', text });
  };

  useEffect(() => {
    const request = { active: true };
    Promise.all([
      api.getQuestions(caseId),
      api.getAssistant().catch(() => null),
      api.getPsychosocialQuestions().catch(() => null),
    ])
      .then(([questions, assistantInfo, psychosocial]) => {
        if (!request.active) return;
        const optional = psychosocial?.questions ?? [];
        const opening = roundOpening(questions.questions, optional, true);
        setAssistant(assistantInfo);
        setApprovalStatus(questions.approval_status);
        setWellbeing(optional);
        setQueue(questions.questions);
        setIndex(0);
        setCoreIds(questions.questions.filter(q => q.blocking).map(q => q.question_id));
        setEntries(opening.texts.map((text, i) => ({ kind: 'assistant', id: `opening-${i}`, text })));
        setPhase(opening.phase);
      })
      .catch(() => {
        if (request.active) setPhase('unavailable');
      });
    return () => {
      request.active = false;
    };
  }, [caseId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries, proposal]);

  const record = (question: QuestionItem, label: string, status: Status, matchedByAi: boolean) =>
    setRecorded(previous => [
      ...previous.filter(item => item.questionId !== question.question_id),
      {
        questionId: question.question_id,
        question: question.text,
        label,
        status,
        core: coreIds.includes(question.question_id),
        matchedByAi,
      },
    ]);

  const moveOn = () => {
    setProposal(null);
    setTyped('');
    setNumberText('');
    const next = index + 1;
    if (next < queue.length) {
      setIndex(next);
      push({ kind: 'assistant', text: queue[next].text });
    } else {
      afterQuestions();
    }
  };

  const saveAnswer = async (choice: Choice, matchedByAi = false) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const state = await api.submitAnswers(caseId, [choice.answer]);
      if (state.route === '/urgent.html') {
        window.location.replace('/urgent.html');
        return;
      }
      push({
        kind: 'user',
        text: choice.label,
        note: matchedByAi ? 'Matched by AI from your typed text, confirmed by you' : undefined,
      });
      record(current, choice.label, statusOf(choice.answer), matchedByAi);
      if (onAnswerSaved && current) {
        onAnswerSaved(current, choice.answer, choice.label);
      }
      moveOn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (!current) return;
    push({ kind: 'user', text: 'Skip' });
    record(current, 'Skipped', 'Skipped', false);
    moveOn();
  };

  const saveNumber = (event: React.FormEvent) => {
    event.preventDefault();
    if (!current) return;
    const value = Number(numberText);
    if (numberText.trim() === '' || !Number.isFinite(value)) {
      setError('Enter a number.');
      return;
    }
    if (current.answer_type === 'INTEGER' && !Number.isInteger(value)) {
      setError('Enter a whole number.');
      return;
    }
    const label = current.unit ? `${value} ${current.unit}` : String(value);
    void saveAnswer({ label, answer: { question_id: current.question_id, choice: 'ANSWERED', value } });
  };

  const sendTyped = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = typed.trim();
    if (!current || !text) return;
    setBusy(true);
    setError(null);
    push({ kind: 'user', text, note: 'Typed' });
    setTyped('');
    try {
      const result = await api.interpretText(
        caseId,
        current.question_id,
        text,
        assistant?.disclosure_version ?? null,
      );
      if (result.outcome === 'EMERGENCY_GUIDANCE' || result.state.route === '/urgent.html') {
        window.location.replace('/urgent.html');
        return;
      }
      const hidden = (result.redacted_types ?? []).map(t => (t === 'NAME' ? 'a name' : 'a date'));
      if (hidden.length) {
        // RF-27, AC-27.6 (DRAFT copy): say what was hidden, never what it was.
        push({ kind: 'notice', text: `We hid ${hidden.join(' and ')} before checking your answer.` });
      }
      if (result.outcome === 'PROPOSAL' && result.proposal) {
        setProposal(result);
        return;
      }
      push({ kind: 'notice', text: result.message });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmProposal = () => {
    const match = proposal?.proposal;
    if (!match) return;
    void saveAnswer(
      {
        label: match.echo_label,
        answer: {
          question_id: match.question_id,
          choice: match.choice,
          value: match.value,
          temporal_status: match.temporal_status,
        },
      },
      true,
    );
  };

  const rejectProposal = () => {
    setProposal(null);
    push({ kind: 'notice', text: 'Not saved. Please choose an answer with the buttons.' });
  };

  const answerWellbeing = async (choice: (typeof WELLBEING_CHOICES)[number]) => {
    if (!currentWellbeing) return;
    push({ kind: 'user', text: choice.label });
    const answers = choice.answer
      ? [...wellbeingAnswers, { question_id: currentWellbeing.question_id, ...choice.answer }]
      : wellbeingAnswers;
    setWellbeingAnswers(answers);
    const next = wellbeingIndex + 1;
    if (next < wellbeing.length) {
      setWellbeingIndex(next);
      push({ kind: 'assistant', text: wellbeing[next].draft_text });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.savePsychosocial(caseId, answers);
      setWellbeingDone(true);
      showReady();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const runAssessment = async () => {
    setPhase('processing');
    setError(null);
    push({ kind: 'notice', text: 'Checking your answers with the draft rules…' });
    try {
      const result = await api.assessCase(caseId, 'FULL_INTAKE');
      sessionStorage.setItem('sanad_case_entry_path', 'FULL_INTAKE');
      if (result.state.route === '/urgent.html') {
        window.location.replace('/urgent.html');
        return;
      }
      if (result.draft_ready) {
        onAssessmentComplete(result.state.route);
        return;
      }
      const refreshed = await api.getQuestions(caseId);
      if (refreshed.questions.length > 0) {
        startNextRound(refreshed.questions);
      } else {
        push({ kind: 'notice', text: 'The draft summary is not ready yet. The case stays where it is.' });
        setPhase('ready');
      }
    } catch (err) {
      setError(friendlyError(err));
      setPhase('ready');
    }
  };

  const coreDone = recorded.filter(item => item.core && item.status !== 'Skipped').length;
  const typingOn = Boolean(assistant?.typing_enabled && assistant.model);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 pb-5 border-b border-[#0B1310] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <MockBadge label={`MOCK INTAKE QUESTIONS · ${approvalStatus}`} />
            <span className="font-mono text-xs text-[#3F4E48]">Screening, not diagnosis</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            Questions
          </h1>
          <p className="text-sm text-[#3F4E48] mt-1.5 leading-relaxed">
            Draft questions and rules for a research prototype. Not sure, Prefer not to answer and Skip are always kept as they are.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSwitchToForm}
            className="px-4 py-2.5 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
          >
            Use the form instead
          </button>
          {onOpenLab && (
            <button
              type="button"
              onClick={onOpenLab}
              className="px-4 py-2.5 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
            >
              Add lab values
            </button>
          )}
        </div>
      </div>

      {phase === 'unavailable' && (
        <div role="alert" className="p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm">
          The questions could not be loaded. Try again later, or{' '}
          <button type="button" onClick={onSwitchToForm} className="underline font-semibold cursor-pointer">
            use the form
          </button>
          . The emergency link above still works.
        </div>
      )}

      {phase !== 'unavailable' && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <section className="dossier-card bg-white flex flex-col min-w-0" aria-label="Chat">
            <div className="px-5 py-3 border-b border-[#0B1310] flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold text-[#0B1310]">
                  {assistant?.assistant_label ?? 'Sanad assistant'}
                </p>
                <p className="font-mono text-[11px] text-[#3F4E48]">
                  {assistant?.assistant_note ?? 'Scripted questions from a draft catalogue'}
                </p>
              </div>
              {phase === 'questions' && queue.length > 0 && (
                <span className="font-mono text-[11px] text-[#3F4E48]">
                  Question {index + 1} of {queue.length}
                </span>
              )}
            </div>

            <div role="log" aria-live="polite" aria-label="Conversation" className="px-5 py-4 space-y-3 max-h-[52vh] overflow-y-auto">
              {phase === 'loading' && (
                <p className="text-sm font-mono text-[#3F4E48]">Loading draft questions…</p>
              )}
              {entries.map(entry => {
                if (entry.kind === 'assistant') {
                  return (
                    <div key={entry.id} className="max-w-[85%] rounded-[2px] border border-[#C5CEC9] bg-[#F3F4F1] px-3.5 py-2.5 text-sm text-[#0B1310]">
                      {entry.text}
                    </div>
                  );
                }
                if (entry.kind === 'user') {
                  return (
                    <div key={entry.id} className="ml-auto max-w-[85%] text-right">
                      <div className="inline-block rounded-[2px] border border-[#0F523E] bg-[#E6F2EE] px-3.5 py-2.5 text-sm text-[#0B1310] text-left break-words">
                        {entry.text}
                      </div>
                      {entry.note && (
                        <p className="font-mono text-[10px] text-[#3F4E48] mt-1">{entry.note}</p>
                      )}
                    </div>
                  );
                }
                return (
                  <p key={entry.id} className="text-xs font-mono text-[#78350F] bg-[#FFFBEB] border border-[#B45309] rounded-[2px] px-3 py-2">
                    {entry.text}
                  </p>
                );
              })}

              {proposal?.proposal && proposal.produced_by && (
                <div className="rounded-[2px] border border-[#0B1310] bg-white p-4 space-y-3">
                  <p className="font-mono text-[11px] font-bold text-[#0B1310]">
                    {assistant?.model?.match_label ?? 'Matched by AI, not verified'} · {proposal.produced_by.label}
                  </p>
                  <p className="text-sm text-[#0B1310]">
                    I noted: <strong>{proposal.proposal.echo_label}</strong>. Is that right?
                  </p>
                  {proposal.contradiction && proposal.contradiction.earlier.length > 0 && (
                    // RF-30 (DRAFT copy): name the earlier answer and where it came from, never which is right.
                    <div role="note" className="p-3 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm space-y-1">
                      {proposal.contradiction.earlier.map((item, index) => (
                        <p key={index}>
                          Earlier answer{SOURCE_LABELS[item.source_type] ? ` (${SOURCE_LABELS[item.source_type]})` : ''}:{' '}
                          <strong>{item.echo_label}</strong>
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-[#3F4E48]">{proposal.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={confirmProposal} className={`${buttonBase} border-[#0B1310] bg-[#0F523E] text-white font-bold hover:bg-[#093B2C]`}>
                      Yes, save this answer
                    </button>
                    <button type="button" disabled={busy} onClick={rejectProposal} className={optOutButton}>
                      No, I'll choose
                    </button>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-[#0B1310] px-5 py-4 space-y-3 bg-[#FBFBFA]">
              {error && (
                <div role="alert" className="p-3 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm">
                  {error}
                </div>
              )}

              {current && !proposal && (
                <>
                  {current.blocking && (
                    <span className="inline-block font-mono text-[10px] font-bold px-2 py-0.5 bg-[#FFFBEB] border border-[#B45309] text-[#78350F]">
                      Needed for your draft summary
                    </span>
                  )}
                  {current.conflicting_values.length > 0 && (
                    <div className="rounded-[2px] bg-[#FFFBEB] border border-[#B45309] p-3 text-xs text-[#78350F]">
                      <strong>More than one answer is recorded for this.</strong> Your answer here replaces them.
                      <ul className="mt-1 font-mono">
                        {current.conflicting_values.map((item, i) => (
                          <li key={`${item.source_type}-${i}`}>
                            {String(item.value ?? 'Unknown')}
                            {item.unit ? ` ${item.unit}` : ''}
                            {item.temporal_status ? ` · ${item.temporal_status === 'PAST' ? 'past' : 'now'}` : ''}
                            {' · '}
                            {SOURCE_LABELS[item.source_type] ?? item.source_type}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.options.length > 0 ? (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Answers">
                      {answerChoices(current).map(choice => (
                        <button key={choice.label} type="button" disabled={busy} onClick={() => void saveAnswer(choice)} className={answerButton}>
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <form onSubmit={saveNumber} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor="chat-number">
                        {current.text}
                      </label>
                      <input
                        id="chat-number"
                        type="number"
                        inputMode="decimal"
                        step={current.answer_type === 'INTEGER' ? '1' : 'any'}
                        value={numberText}
                        onChange={event => setNumberText(event.target.value)}
                        placeholder={current.unit ? `Value in ${current.unit}` : 'Value'}
                        className="w-44 px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm"
                      />
                      <button type="submit" disabled={busy} className={answerButton}>
                        Save
                      </button>
                    </form>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {OPT_OUTS.map(optOut => (
                      <button
                        key={optOut.choice}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void saveAnswer({
                            label: optOut.label,
                            answer: { question_id: current.question_id, choice: optOut.choice },
                          })
                        }
                        className={optOutButton}
                      >
                        {optOut.label}
                      </button>
                    ))}
                    <button type="button" disabled={busy} onClick={skip} className={`${optOutButton} underline`}>
                      Skip
                    </button>
                  </div>

                  {typingOn && assistant?.model && !typingAcknowledged && (
                    <div className="rounded-[2px] border border-[#C5CEC9] bg-white p-3 text-xs text-[#3F4E48] space-y-2">
                      <p>{assistant.disclosure}</p>
                      <button type="button" onClick={() => setTypingAcknowledged(true)} className={optOutButton}>
                        Use typing for this session
                      </button>
                    </div>
                  )}

                  {typingOn && assistant?.model && typingAcknowledged && (
                    <form onSubmit={sendTyped} className="space-y-1.5">
                      <label htmlFor="chat-text" className="block text-xs font-semibold text-[#0B1310]">
                        Or type your answer
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="chat-text"
                          type="text"
                          autoComplete="off"
                          maxLength={assistant.max_text_chars}
                          value={typed}
                          onChange={event => setTyped(event.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 rounded-[2px] border border-[#0B1310] bg-white text-sm"
                        />
                        <button type="submit" disabled={busy || !typed.trim()} className={answerButton}>
                          Send
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-[#3F4E48]">
                        Sent to {assistant.model.label} to suggest a match. You confirm before anything is saved. English only. {typed.length}/{assistant.max_text_chars}
                      </p>
                    </form>
                  )}
                </>
              )}

              {currentWellbeing && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Optional answers">
                  {WELLBEING_CHOICES.map(choice => (
                    <button key={choice.label} type="button" disabled={busy} onClick={() => void answerWellbeing(choice)} className={choice.answer ? answerButton : `${optOutButton} underline`}>
                      {choice.label}
                    </button>
                  ))}
                </div>
              )}

              {phase === 'ready' && (
                <button
                  type="button"
                  onClick={() => void runAssessment()}
                  className="w-full py-3.5 px-6 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer"
                >
                  Check my answers →
                </button>
              )}
              {phase === 'processing' && (
                <p className="text-sm font-mono text-[#3F4E48]">Checking your answers…</p>
              )}
            </div>
          </section>

          <aside className="dossier-panel bg-white p-5 space-y-4" aria-label="What you've told us">
            <div>
              <h2 className="text-base font-extrabold text-[#0B1310]">What you've told us</h2>
              {coreIds.length > 0 && (
                <p className="font-mono text-xs text-[#3F4E48] mt-1">
                  Needed questions: {coreDone} of {coreIds.length} done
                </p>
              )}
            </div>
            {recorded.length === 0 ? (
              <p className="text-sm text-[#3F4E48]">Your answers in this chat appear here.</p>
            ) : (
              <ul className="space-y-3">
                {recorded.map(item => (
                  <li key={item.questionId} className="border-b border-[#C5CEC9] pb-2 last:border-0">
                    <p className="text-xs text-[#3F4E48]">{item.question}</p>
                    <p className="text-sm font-semibold text-[#0B1310]">{item.label}</p>
                    <p className="font-mono text-[10px] text-[#3F4E48]">
                      {item.status}
                      {item.matchedByAi ? ' · matched by AI, confirmed by you' : ' · from you'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-[#63736C] leading-relaxed border-t border-[#C5CEC9] pt-3">
              Shown for this session only and not saved in your browser. Answers from a sample profile or file are listed on your result page.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
};
