import { useEffect, useState } from 'react';
import { api, type IntakeAnswer, type PsychosocialQuestion, type QuestionsResponse } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface IntakeScreenProps {
  caseId: string;
  onAssessmentComplete: (route: string) => void;
}

type AnswerChoice = IntakeAnswer['choice'] | '';
type DraftAnswer = {
  choice: AnswerChoice;
  value?: boolean | number | string;
  temporal_status?: 'CURRENT' | 'PAST';
};
type PsychosocialState = 'NOT_ASKED' | 'KNOWN_POSITIVE' | 'KNOWN_NEGATIVE' | 'UNKNOWN' | 'DECLINED';

const psychResponse: Record<Exclude<PsychosocialState, 'NOT_ASKED'>, 'YES' | 'NO' | 'NOT_SURE' | null> = {
  KNOWN_POSITIVE: 'YES',
  KNOWN_NEGATIVE: 'NO',
  UNKNOWN: 'NOT_SURE',
  DECLINED: null,
};

export const IntakeScreen: React.FC<IntakeScreenProps> = ({ caseId, onAssessmentComplete }) => {
  const [catalogue, setCatalogue] = useState<QuestionsResponse | null>(null);
  const [psychQuestions, setPsychQuestions] = useState<PsychosocialQuestion[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({});
  const [psychAnswers, setPsychAnswers] = useState<Record<string, PsychosocialState>>({});
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = async () => {
    setLoadingCatalogue(true);
    setError(null);
    try {
      const [intakeResponse, psychResponse] = await Promise.all([
        api.getQuestions(caseId),
        api.getPsychosocialQuestions(),
      ]);
      setCatalogue(intakeResponse);
      setPsychQuestions(psychResponse.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Question catalogues are unavailable.');
    } finally {
      setLoadingCatalogue(false);
    }
  };

  useEffect(() => { void loadQuestions(); }, [caseId]);

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
          submittedAnswers.push({ question_id: question.question_id, choice: draft.choice });
          continue;
        }
        if (draft.value === undefined || draft.value === '') {
          throw new Error(`Enter a value or leave “${question.text}” unanswered.`);
        }
        if (question.temporal_options.length && draft.value === true && !draft.temporal_status) {
          throw new Error(`Choose whether “${question.text}” is current or past.`);
        }
        const value = typeof draft.value === 'string' && ['INTEGER', 'NUMBER'].includes(question.answer_type)
          ? Number(draft.value)
          : draft.value;
        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new Error(`Enter a valid number for “${question.text}”.`);
        }
        submittedAnswers.push({
          question_id: question.question_id,
          choice: 'ANSWERED',
          value,
          temporal_status: draft.temporal_status,
        });
      }

      if (submittedAnswers.length > 0) await api.submitAnswers(caseId, submittedAnswers);

      const submittedPsychosocial = psychQuestions.flatMap(question => {
        const state = psychAnswers[question.question_id] ?? 'NOT_ASKED';
        if (state === 'NOT_ASKED') return [];
        return [{
          question_id: question.question_id,
          response_state: state,
          response_code: psychResponse[state],
        }];
      });
      await api.savePsychosocial(caseId, submittedPsychosocial);

      const assessment = await api.assessCase(caseId);
      if (assessment.draft_ready) {
        onAssessmentComplete(assessment.state.route);
      } else {
        const refreshed = await api.getQuestions(caseId);
        setCatalogue(refreshed);
        setDraftAnswers({});
        setError(refreshed.questions.length
          ? 'More information is needed before a draft can be prepared. Answer the follow-up questions or leave them unknown.'
          : 'The assessment is not ready yet. The case remains in its current state.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assessment could not be submitted.');
    } finally {
      setLoading(false);
    }
  };

  const renderQuestionInput = (question: QuestionsResponse['questions'][number]) => {
    const current = draftAnswers[question.question_id];
    if (question.options.length > 0) {
      const selectedIndex = question.options.findIndex(option => option.value === current?.value);
      return (
        <div className="space-y-2">
          <select
            value={current?.choice === 'ANSWERED' && selectedIndex >= 0 ? String(selectedIndex) : ''}
            onChange={event => {
              const option = question.options[Number(event.target.value)];
              setAnswer(question.question_id, option ? { choice: 'ANSWERED', value: option.value } : null);
            }}
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value="">Choose an answer or leave not asked</option>
            {question.options.map((option, index) => <option key={String(option.value)} value={index}>{option.label}</option>)}
          </select>
          {question.temporal_options.length > 0 && current?.choice === 'ANSWERED' && current.value === true && (
            <select
              aria-label="Current or past"
              value={current.temporal_status ?? ''}
              onChange={event => setAnswer(question.question_id, { ...current, temporal_status: (event.target.value || undefined) as DraftAnswer['temporal_status'] })}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm"
            >
              <option value="">Choose current or past</option>
              {question.temporal_options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
            </select>
          )}
        </div>
      );
    }
    return (
      <input
        type="number"
        step={question.answer_type === 'INTEGER' ? '1' : 'any'}
        value={typeof current?.value === 'string' || typeof current?.value === 'number' ? current.value : ''}
        onChange={event => setAnswer(question.question_id, event.target.value === '' ? null : { choice: 'ANSWERED', value: event.target.value })}
        placeholder={question.unit ? `Value (${question.unit})` : 'Enter a value'}
        className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
      />
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label={`MOCK INTAKE QUESTIONS · ${catalogue?.approval_status ?? 'CLINICAL_TBD'}`} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Context questions</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">Question wording and rules are draft research content. Skipped, unknown, and declined answers stay distinct.</p>
      </div>

      {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">{error}</div>}
      {loadingCatalogue && <p className="text-sm text-slate-500">Loading draft questions…</p>}

      {!loadingCatalogue && catalogue && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
            <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">Questions for this case</h2>
            {catalogue.questions.length === 0 && <p className="text-sm text-slate-600">No follow-up questions are currently requested. You may continue to the draft assessment.</p>}
            {catalogue.questions.map(question => (
              <div key={question.question_id} className="space-y-2 border-b border-slate-100 pb-4 last:border-0">
                <label className="block text-sm font-semibold text-slate-800">
                  {question.text}{question.blocking && <span className="ml-2 text-xs text-amber-700">Needed for this draft</span>}
                </label>
                {question.conflicting_values.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950"><strong>Conflicting recorded values:</strong><ul className="mt-1 space-y-1">{question.conflicting_values.map((item, index) => <li key={`${item.source_type}-${index}`}>{String(item.value ?? 'Unknown')}{item.unit ? ` ${item.unit}` : ''} · {item.source_type}{item.temporal_status ? ` · ${item.temporal_status}` : ''}</li>)}</ul></div>}
                {renderQuestionInput(question)}
                <div className="flex flex-wrap gap-2">
                  {question.opt_out_choices.map(choice => (
                    <button
                      type="button"
                      key={choice}
                      onClick={() => setAnswer(question.question_id, { choice: choice as IntakeAnswer['choice'] })}
                      className={`px-3 py-1.5 rounded-lg border text-xs ${draftAnswers[question.question_id]?.choice === choice ? 'bg-sky-100 border-sky-400 text-sky-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                    >
                      {choice === 'NOT_SURE' ? 'Not sure' : 'Prefer not to answer'}
                    </button>
                  ))}
                  {draftAnswers[question.question_id] && (
                    <button type="button" onClick={() => setAnswer(question.question_id, null)} className="px-3 py-1.5 rounded-lg text-xs text-slate-500 underline">Leave not asked</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <MockBadge label="MOCK OPTIONAL CONTEXT · CLINICAL_TBD" />
              <p className="text-xs text-slate-600 mt-2">These optional self-reports are unverified context only and do not enter triage. You can skip all three.</p>
            </div>
            {psychQuestions.map(question => (
              <label key={question.question_id} className="block text-sm font-medium text-slate-800">
                {question.draft_text}
                <select
                  value={psychAnswers[question.question_id] ?? 'NOT_ASKED'}
                  onChange={event => setPsychAnswers(previous => ({ ...previous, [question.question_id]: event.target.value as PsychosocialState }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
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

          <button type="submit" disabled={loading} className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60">
            {loading ? 'Preparing draft…' : 'Save answers and prepare draft'}
          </button>
        </form>
      )}
    </div>
  );
};
