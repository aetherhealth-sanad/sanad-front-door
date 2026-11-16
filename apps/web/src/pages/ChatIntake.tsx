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
  onAnswerRecorded?: (question: QuestionItem, answer: IntakeAnswer, label: string) => void;
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

export const ChatIntake: React.FC<ChatIntakeProps> = ({
  caseId,
  onAssessmentComplete,
  onSwitchToForm,
  onOpenLab,
  onAnswerSaved,
  onAnswerRecorded,
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
  const [showRecordedDrawer, setShowRecordedDrawer] = useState(false);
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
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries, proposal, busy]);

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
        note: matchedByAi ? 'Matched by AI from your note, confirmed by you' : undefined,
      });
      record(current, choice.label, statusOf(choice.answer), matchedByAi);

      if (onAnswerRecorded && current) {
        onAnswerRecorded(current, choice.answer, choice.label);
      }
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
      setError('Enter a valid number.');
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
    push({ kind: 'user', text, note: 'Typed response' });
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
    push({ kind: 'notice', text: 'Suggestion dismissed. Please select an answer below.' });
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
    push({ kind: 'notice', text: 'Checking your answers with the draft rules...' });
    try {
      const result = await api.assessCase(caseId, 'FULL_INTAKE');
      sessionStorage.setItem('sanad_case_entry_path', 'FULL_INTAKE');
      if (result.state.route === '/urgent.html') {
        window.location.replace('/urgent.html');
        return;
      }
      if (result.draft_ready) {
        if (onAssessmentComplete) {
          onAssessmentComplete(result.state.route);
        }
        if (onNavigateToReview) {
          onNavigateToReview();
        }
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
    <div className="w-full space-y-4">
      {/* ── Sub-header / Mode Control Strip ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2ECF8]">
        <div>
          <div className="flex items-center gap-2">
            <MockBadge label={`MOCK QUESTIONS · ${approvalStatus}`} />
            <span className="font-mono text-[11px] text-[#829AB8]">Screening, not diagnosis</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#07215A] tracking-tight mt-1">
            Clinical Health Intake
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Segmented Mode Switcher */}
          <div className="inline-flex p-1 rounded-full bg-[#EBF4FF] border border-[#BAD6FE] text-xs font-semibold shadow-2xs">
            <span className="px-3 py-1 rounded-full bg-white text-[#0062FF] shadow-xs flex items-center gap-1.5 font-bold">
              <span>💬</span>
              <span>Chat Assistant</span>
            </span>
            <button
              type="button"
              onClick={onSwitchToForm}
              className="px-3 py-1 rounded-full text-[#4A6588] hover:text-[#07215A] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>Full Form</span>
            </button>
          </div>

          {/* Optional Lab Action */}
          {onOpenLab && (
            <button
              type="button"
              onClick={onOpenLab}
              className="btn-pill-secondary px-3.5 py-1 text-xs font-semibold shrink-0"
            >
              Add lab values
            </button>
          )}
        </div>
      </div>

      {phase === 'unavailable' && (
        <div role="alert" className="p-4 rounded-xl bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm">
          The questions could not be loaded. Try again later, or{' '}
          <button type="button" onClick={onSwitchToForm} className="underline font-semibold cursor-pointer">
            use the form
          </button>
          . The emergency link above still works.
        </div>
      )}

      {phase !== 'unavailable' && (
        <div className="space-y-4">
          {/* ── Master Conversational Assistant Card ── */}
          <section className="medical-card overflow-hidden flex flex-col" aria-label="Clinical Conversation">
            {/* ── Header Strip ── */}
            <div className="px-5 py-4 border-b border-[#E2ECF8] bg-gradient-to-r from-white via-[#F8FAFC] to-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Clinical Stethoscope Icon Avatar with pulsing indicator */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0062FF] to-[#0A3E92] flex items-center justify-center text-white shadow-sm ring-2 ring-[#EBF4FF]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#10B981] ring-2 ring-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[#07215A]">
                      {assistant?.assistant_label ?? 'Sanad Clinical Guide'}
                    </h2>
                    <span className="font-mono text-[10px] text-[#0062FF] bg-[#EBF4FF] px-2 py-0.5 rounded-full border border-[#BAD6FE] font-semibold">
                      Scripted AI
                    </span>
                  </div>
                  <p className="text-xs text-[#829AB8] line-clamp-1">
                    {assistant?.assistant_note ?? 'Scripted questions from approved draft catalogue'}
                  </p>
                </div>
              </div>

              {/* Progress Count Badge */}
              {phase === 'questions' && queue.length > 0 && (
                <div className="text-right shrink-0">
                  <span className="font-mono text-xs font-bold text-[#0062FF] bg-[#EBF4FF] px-2.5 py-1 rounded-full border border-[#BAD6FE]">
                    Question {index + 1} of {queue.length}
                  </span>
                </div>
              )}
            </div>

            {/* ── Progress Track ── */}
            {phase === 'questions' && queue.length > 0 && (
              <div className="w-full bg-[#EBF4FF] h-1 overflow-hidden">
                <div
                  className="bg-[#0062FF] h-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(((index + 1) / queue.length) * 100)}%` }}
                />
              </div>
            )}

            {/* ── Message Conversation Area ── */}
            <div
              role="log"
              aria-live="polite"
              aria-label="Conversation"
              className="px-5 py-6 space-y-4 min-h-[340px] max-h-[500px] overflow-y-auto bg-gradient-to-b from-[#FAFDFE] to-white"
            >
              {phase === 'loading' && (
                <div className="flex items-center gap-2 text-sm font-mono text-[#829AB8]">
                  <span className="w-2 h-2 rounded-full bg-[#0062FF] glow-pulse" />
                  <span>Loading draft catalogue questions...</span>
                </div>
              )}

              {entries.map(entry => {
                if (entry.kind === 'assistant') {
                  return (
                    <div key={entry.id} className="flex items-start gap-3 max-w-[90%] sm:max-w-[82%]">
                      <div className="w-7 h-7 rounded-full bg-[#EBF4FF] border border-[#BAD6FE] text-[#0062FF] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="rounded-2xl rounded-tl-sm bg-white border border-[#E2ECF8] shadow-xs px-4 py-3 text-sm text-[#07215A] leading-relaxed">
                        {entry.text}
                      </div>
                    </div>
                  );
                }

                if (entry.kind === 'user') {
                  return (
                    <div key={entry.id} className="ml-auto max-w-[90%] sm:max-w-[78%] text-right space-y-1">
                      <div className="inline-block rounded-2xl rounded-tr-sm bg-gradient-to-r from-[#0062FF] to-[#0048C8] text-white shadow-xs px-4 py-2.5 text-sm font-medium text-left break-words">
                        {entry.text}
                      </div>
                      {entry.note && (
                        <p className="font-mono text-[10px] text-[#829AB8] pr-1">{entry.note}</p>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={entry.id} className="mx-auto max-w-lg rounded-xl bg-[#F0F6FF] border border-[#BAD6FE] px-3.5 py-2 text-xs text-[#0A479D] font-mono text-center">
                    {entry.text}
                  </div>
                );
              })}

              {/* ── Bouncing Typing Indicator ── */}
              {busy && (
                <div className="flex items-center gap-3 animate-in fade-in duration-150">
                  <div className="w-7 h-7 rounded-full bg-[#EBF4FF] border border-[#BAD6FE] text-[#0062FF] flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="bg-white border border-[#E2ECF8] rounded-2xl rounded-tl-sm px-4 py-3 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0062FF] animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 rounded-full bg-[#0062FF] animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-[#0062FF] animate-bounce" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── AI Suggestion Proposal Card ── */}
              {proposal?.proposal && proposal.produced_by && (
                <div className="rounded-2xl border-2 border-[#0062FF] bg-[#EBF4FF] p-5 space-y-3 shadow-md animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[#0062FF] bg-white px-2.5 py-1 rounded-full border border-[#BAD6FE] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF] glow-pulse" />
                      AI SUGGESTED MATCH
                    </span>
                    <span className="font-mono text-[10px] text-[#4A6588]">{proposal.produced_by.label}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-[#4A6588]">Based on your note, did you mean:</p>
                    <p className="text-base font-bold text-[#07215A]">
                      "{proposal.proposal.echo_label}"
                    </p>
                    {proposal.message && (
                      <p className="text-xs text-[#4A6588] leading-relaxed">{proposal.message}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmProposal}
                      className="btn-pill-primary px-4 py-2 text-xs font-bold"
                    >
                      Yes, save this answer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={rejectProposal}
                      className="btn-pill-secondary px-4 py-2 text-xs font-semibold"
                    >
                      No, choose manually
                    </button>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* ── Interactive Answer Deck (Bottom Controls) ── */}
            <div className="border-t border-[#E2ECF8] bg-[#F8FAFC] p-4 sm:p-5 space-y-3.5">
              {error && (
                <div role="alert" className="p-3 rounded-xl bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-xs font-medium">
                  {error}
                </div>
              )}

              {current && !proposal && (
                <>
                  {current.blocking && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309]">
                        <span>⚠️</span>
                        <span>Needed for your draft summary</span>
                      </span>
                    </div>
                  )}

                  {current.conflicting_values.length > 0 && (
                    <div className="rounded-xl bg-[#FFFBEB] border border-[#B45309] p-3 text-xs text-[#78350F]">
                      <strong>More than one answer is recorded for this.</strong> Your answer here replaces them.
                      <ul className="mt-1 font-mono space-y-0.5">
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

                  {/* Multiple Choice Grid */}
                  {current.options.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="group" aria-label="Answers">
                      {answerChoices(current).map(choice => (
                        <button
                          key={choice.label}
                          type="button"
                          disabled={busy}
                          onClick={() => void saveAnswer(choice)}
                          className="group p-3.5 rounded-xl border border-[#CBD5E1] bg-white text-[#07215A] font-semibold text-sm transition-all duration-150 hover:border-[#0062FF] hover:bg-[#EBF4FF] hover:text-[#0048C8] active:scale-[0.98] shadow-2xs cursor-pointer flex items-center justify-between gap-3 text-left disabled:opacity-50"
                        >
                          <span>{choice.label}</span>
                          <span className="w-5 h-5 rounded-full border border-[#CBD5E1] group-hover:border-[#0062FF] group-hover:bg-[#0062FF] group-hover:text-white flex items-center justify-center text-[10px] text-transparent transition-all shrink-0">
                            ✓
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* Number Input Form */
                    <form onSubmit={saveNumber} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <label className="sr-only" htmlFor="chat-number">
                        {current.text}
                      </label>
                      <div className="relative flex-1">
                        <input
                          id="chat-number"
                          type="number"
                          inputMode="decimal"
                          step={current.answer_type === 'INTEGER' ? '1' : 'any'}
                          value={numberText}
                          onChange={event => setNumberText(event.target.value)}
                          placeholder={current.unit ? `e.g. 24 (${current.unit})` : 'Enter value'}
                          className="w-full px-4 py-3 rounded-xl border border-[#CBD5E1] bg-white text-[#07215A] text-sm font-medium focus:outline-none focus:border-[#0062FF] focus:ring-2 focus:ring-[#0062FF]/20 shadow-xs"
                        />
                        {current.unit && (
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-[#829AB8] bg-[#F6F9FF] px-2 py-0.5 rounded-md border border-[#E2ECF8]">
                            {current.unit}
                          </span>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={busy || !numberText.trim()}
                        className="btn-pill-primary px-6 py-3 text-sm font-bold shrink-0 disabled:opacity-50"
                      >
                        Save answer
                      </button>
                    </form>
                  )}

                  {/* Opt-out & Skip Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2ECF8]/70">
                    <div className="flex flex-wrap items-center gap-2">
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
                          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#4A6588] bg-white border border-[#CBD5E1] hover:border-[#829AB8] hover:bg-[#F1F5F9] hover:text-[#07215A] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {optOut.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={skip}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#829AB8] hover:text-[#D92D20] hover:bg-[#FFF1F0] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Skip question →
                    </button>
                  </div>

                  {/* Free-text Typing Notice & Opt-in */}
                  {typingOn && assistant?.model && !typingAcknowledged && (
                    <div className="rounded-xl border border-[#BAD6FE] bg-[#EBF4FF] p-3 text-xs text-[#0A479D] space-y-2">
                      <p>{assistant.disclosure}</p>
                      <button
                        type="button"
                        onClick={() => setTypingAcknowledged(true)}
                        className="btn-pill-secondary px-3 py-1.5 text-xs font-semibold"
                      >
                        Enable typing for this session
                      </button>
                    </div>
                  )}

                  {/* Free-text Form */}
                  {typingOn && assistant?.model && typingAcknowledged && (
                    <form onSubmit={sendTyped} className="space-y-2 pt-2 border-t border-[#E2ECF8]">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#07215A]">
                        <span>Or describe in your own words:</span>
                        <span className="font-mono text-[11px] text-[#829AB8]">{typed.length}/{assistant.max_text_chars}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          id="chat-text"
                          type="text"
                          autoComplete="off"
                          maxLength={assistant.max_text_chars}
                          value={typed}
                          onChange={event => setTyped(event.target.value)}
                          placeholder="Type your answer in plain English..."
                          className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm focus:outline-none focus:border-[#0062FF] focus:ring-2 focus:ring-[#0062FF]/20 shadow-xs"
                        />
                        <button
                          type="submit"
                          disabled={busy || !typed.trim()}
                          className="btn-pill-primary px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                        >
                          <span>Send</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-[#829AB8]">
                        Interpreted by {assistant.model.label} to suggest an answer. You confirm before anything is saved.
                      </p>
                    </form>
                  )}
                </>
              )}

              {/* Optional Wellbeing Questions */}
              {currentWellbeing && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-[#07215A]">Select your response:</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Optional answers">
                    {WELLBEING_CHOICES.map(choice => (
                      <button
                        key={choice.label}
                        type="button"
                        disabled={busy}
                        onClick={() => void answerWellbeing(choice)}
                        className={
                          choice.answer
                            ? 'px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[#07215A] font-semibold text-xs hover:border-[#0062FF] hover:bg-[#EBF4FF] hover:text-[#0048C8] transition-all cursor-pointer'
                            : 'px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#829AB8] hover:text-[#07215A] underline cursor-pointer'
                        }
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Ready Phase */}
              {phase === 'ready' && (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-[#EBF4FF] to-white border border-[#BAD6FE] space-y-3.5">
                  <div>
                    <h3 className="text-sm font-bold text-[#07215A]">Intake Questions Complete</h3>
                    <p className="text-xs text-[#4A6588] mt-0.5 leading-relaxed">
                      All required questions have been reviewed. Check your profile with the draft rules to see your summary.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runAssessment()}
                    className="btn-pill-primary w-full py-3.5 text-sm font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Check my answers with draft rules</span>
                    <span className="font-mono">→</span>
                  </button>
                </div>
              )}

              {phase === 'processing' && (
                <div className="flex items-center gap-2 p-3 text-sm font-mono text-[#0062FF]">
                  <span className="w-2 h-2 rounded-full bg-[#0062FF] glow-pulse" />
                  <span>Checking your answers with draft rules...</span>
                </div>
              )}
            </div>
          </section>

          {/* ── Collapsible Recent Chat Answers Drawer (Clean & Non-Intrusive) ── */}
          {recorded.length > 0 && (
            <div className="medical-card p-4 transition-all duration-200">
              <button
                type="button"
                onClick={() => setShowRecordedDrawer(prev => !prev)}
                className="w-full flex items-center justify-between text-xs font-bold text-[#07215A] hover:text-[#0062FF] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>📋 Answers recorded in this chat ({recorded.length})</span>
                  {coreIds.length > 0 && (
                    <span className="font-mono text-[10px] text-[#0062FF] bg-[#EBF4FF] px-2 py-0.5 rounded-full font-semibold border border-[#BAD6FE]">
                      {coreDone} of {coreIds.length} required
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-[#829AB8]">{showRecordedDrawer ? 'Hide ▲' : 'View recorded ▼'}</span>
              </button>

              {showRecordedDrawer && (
                <div className="mt-3 pt-3 border-t border-[#E2ECF8] space-y-2 max-h-56 overflow-y-auto">
                  {recorded.map(item => (
                    <div
                      key={item.questionId}
                      className="flex items-start justify-between gap-3 text-xs py-1.5 border-b border-[#F1F5F9] last:border-0"
                    >
                      <div>
                        <p className="text-[#829AB8] text-[11px]">{item.question}</p>
                        <p className="font-semibold text-[#07215A]">{item.label}</p>
                      </div>
                      <span className="font-mono text-[10px] text-[#4A6588] shrink-0 bg-[#F6F9FF] px-2 py-0.5 rounded border border-[#E2ECF8]">
                        {item.status}
                        {item.matchedByAi ? ' · AI match' : ''}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-[#829AB8] font-mono pt-1">
                    Recorded answers update your session profile automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
