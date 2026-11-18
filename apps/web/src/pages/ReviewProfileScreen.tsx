import React, { useState } from 'react';
import {
  type PatientReviewProfile,
  type PatientReviewItem,
  type IntakeAnswer,
  type ObservationRecord,
  type PsychosocialQuestion,
} from '../api/client';

export interface FactReviewState {
  confirmed: boolean;
}

interface ReviewProfileScreenProps {
  caseId: string;
  profile: PatientReviewProfile | null;
  profileError?: string | null;
  onRetryProfile?: () => void;
  onCorrectAnswer: (answer: IntakeAnswer) => Promise<void>;
  observations?: ObservationRecord[];
  psychQuestions?: PsychosocialQuestion[];
  psychAnswers?: Record<string, string>;
  onEditQuestion: (questionId: string) => void;
  onOpenLab?: () => void;
  onReturnToQuestions: () => void;
  onSubmitAssessment: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

// Categorization helper for catalogue questions into the 6 UX-flow sections
function categorizeQuestion(questionId: string, conceptCode: string = ''): string {
  const code = (questionId + ' ' + conceptCode).toLowerCase();
  if (code.includes('age') || code.includes('dob') || code.includes('birth')) {
    return 'context';
  }
  if (
    code.includes('steroid') ||
    code.includes('medication') ||
    code.includes('testosterone') ||
    code.includes('chemo')
  ) {
    return 'medications';
  }
  if (
    code.includes('smoke') ||
    code.includes('tobacco') ||
    code.includes('alcohol') ||
    code.includes('heat') ||
    code.includes('sauna')
  ) {
    return 'lifestyle';
  }
  return 'history';
}

export const ReviewProfileScreen: React.FC<ReviewProfileScreenProps> = ({
  caseId,
  profile,
  profileError = null,
  onRetryProfile,
  onCorrectAnswer,
  observations = [],
  psychQuestions = [],
  psychAnswers = {},
  onEditQuestion,
  onOpenLab,
  onReturnToQuestions,
  onSubmitAssessment,
  isSubmitting = false,
  error = null,
}) => {
  const [factStates, setFactStates] = useState<Record<string, FactReviewState>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editTemporal, setEditTemporal] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleConfirm = (id: string) => {
    setFactStates(prev => ({
      ...prev,
      [id]: {
        confirmed: !prev[id]?.confirmed,
      },
    }));
  };

  // The saved profile is authoritative; only the explicit versioned correction API
  // may replace active facts. Checklist marks remain local to this screen.
  const reviewItems = profile?.items ?? [];
  const contextItems = reviewItems.filter(q => categorizeQuestion(q.question_id, q.concept_code) === 'context');
  const historyItems = reviewItems.filter(q => categorizeQuestion(q.question_id, q.concept_code) === 'history');
  const medicationItems = reviewItems.filter(q => categorizeQuestion(q.question_id, q.concept_code) === 'medications');
  const lifestyleItems = reviewItems.filter(q => categorizeQuestion(q.question_id, q.concept_code) === 'lifestyle');
  const conflictingQuestions = reviewItems.filter(q => q.discrepancy_kind !== 'NONE');

  const factSummary = (item: PatientReviewItem) => {
    if (!item.facts.length) return 'Not answered';
    return item.facts.map(f => {
      const value = f.state === 'UNKNOWN' ? 'Not sure'
        : f.state === 'DECLINED' ? 'Prefer not to answer'
        : String(f.value ?? 'Not recorded');
      return `${value}${f.unit ? ` ${f.unit}` : ''}${f.temporal_status ? ` (${f.temporal_status})` : ''}`;
    }).join(' | ');
  };
  const factSources = (item: PatientReviewItem) =>
    item.facts.length ? [...new Set(item.facts.map(f => f.source_type))].join(', ') : 'Not recorded';

  const saveReviewAnswer = async (answer: IntakeAnswer) => {
    setSavingId(answer.question_id);
    setSaveError(null);
    try {
      await onCorrectAnswer(answer);
      setEditingId(null);
      setAcknowledged(false);
      setFactStates({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the correction.');
      onRetryProfile?.();
    } finally {
      setSavingId(null);
    }
  };

  const saveEdited = (item: PatientReviewItem) => {
    let value: boolean | number | string;
    if (item.answer_type === 'BOOLEAN') value = editValue === 'true';
    else if (item.answer_type === 'INTEGER' || item.answer_type === 'NUMBER') {
      value = Number(editValue);
      if (!editValue.trim() || !Number.isFinite(value)) {
        setSaveError('Enter a valid number before saving.');
        return;
      }
    } else value = editValue;
    if (editValue === '') {
      setSaveError('Choose or enter a value.');
      return;
    }
    const temporal_status = value === true && item.temporal_options.length
      ? (editTemporal as 'PAST' | 'CURRENT') || null : null;
    if (value === true && item.temporal_options.length && !temporal_status) {
      setSaveError('Select whether this is past or current.');
      return;
    }
    void saveReviewAnswer({question_id: item.question_id, choice: 'ANSWERED', value,
      temporal_status});
  };

  const beginEdit = (item: PatientReviewItem) => {
    setSaveError(null);
    const current = item.facts[item.facts.length - 1];
    setEditValue(current?.value == null ? '' : String(current.value));
    setEditTemporal(current?.temporal_status ?? '');
    setEditingId(item.question_id);
  };

  const renderFactRow = (
    id: string,
    title: string,
    recordedValueText: string,
    sourceText: string,
    temporalStatus?: string | null,
    onEdit?: () => void,
    isConflict?: boolean,
    item?: PatientReviewItem
  ) => {
    const state = factStates[id] || { confirmed: false };

    return (
      <div
        key={id}
        className={`p-4 sm:p-5 rounded-2xl border transition-[background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out)] ${
          isConflict
            ? 'border-[#FEDF89] bg-[#FFFAEB]'
            : state.confirmed
            ? 'border-[#BCD8FE] bg-[#F2F7FF]'
            : 'border-[#E2ECF8] bg-[#FBFDFF]'
        } space-y-2.5`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs text-[#64748B] leading-tight font-medium">{title}</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm sm:text-base font-bold text-[#0F172A]">
                {recordedValueText}
              </span>
              {temporalStatus && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#EBF3FF] text-[#0050CC] font-semibold border border-[#BCD8FE]">
                  {temporalStatus === 'PAST' ? 'Past history' : 'Current'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleConfirm(id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                state.confirmed
                  ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-xs'
                  : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:border-[#0066EE] hover:bg-[#EBF3FF] hover:text-[#0050CC]'
              }`}
            >
              {state.confirmed ? '✓ Reviewed' : 'Mark reviewed'}
            </button>

            {item && (
              <button type="button" disabled={savingId !== null}
                onClick={() => void saveReviewAnswer({ question_id: id, choice: 'NOT_SURE' })}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold border bg-white text-[#B54708] border-[#CBD5E1] hover:bg-[#FFFAEB] disabled:opacity-40">
                {savingId === id ? 'Saving…' : 'Save as Not sure'}
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={() => item ? beginEdit(item) : onEdit?.()}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#1E293B] bg-white border border-[#CBD5E1] hover:border-[#0066EE] hover:bg-[#F8FAFC] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {item && editingId === id && (
          <div className="p-3 border rounded-xl bg-white space-y-2">
            <label className="block text-xs font-semibold" htmlFor={`edit-${id}`}>Revised answer</label>
            {item.answer_type === 'BOOLEAN' || item.answer_type === 'SINGLE_CHOICE' ? (
              <select id={`edit-${id}`} value={editValue} onChange={e => setEditValue(e.target.value)}
                className="block w-full p-2 border rounded-md text-sm">
                <option value="">Select…</option>
                {(item.options.length ? item.options : [
                  {value: true, label: 'Yes'}, {value: false, label: 'No'},
                ]).map(option => (
                  <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input id={`edit-${id}`} type="number" value={editValue}
                onChange={e => setEditValue(e.target.value)}
                step={item.answer_type === 'INTEGER' ? '1' : 'any'}
                className="block w-full p-2 border rounded-md text-sm" />
            )}
            {item.temporal_options.length > 0 && editValue === 'true' && (
              <select aria-label="Time context" value={editTemporal}
                onChange={e => setEditTemporal(e.target.value)}
                className="block w-full p-2 border rounded-md text-sm">
                <option value="">Select past/current…</option>
                {item.temporal_options.map(opt => (
                  <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={savingId !== null} onClick={() => saveEdited(item)}
                className="btn-pill-primary px-4 py-2 text-xs">Save revised answer</button>
              <button type="button" onClick={() => setEditingId(null)}
                className="btn-pill-secondary px-4 py-2 text-xs">Cancel</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9]">
          <span>Source: {sourceText}</span>
          <span>•</span>
          <span>Status: {state.confirmed ? 'Reviewed on this screen' : 'Not reviewed on this screen'}</span>
          <span>•</span>
          <span>Verification: Unverified</span>
        </div>
      </div>
    );
  };

  if (!profile) {
    return (
      <section role="status" className="p-6 rounded-xl bg-white border space-y-3">
        <h2 className="font-bold">Saved profile is not available yet</h2>
        <p className="text-sm">{profileError || 'Loading the information saved in your session…'}</p>
        {profileError && onRetryProfile && (
          <button type="button" className="btn-pill-secondary px-4 py-2" onClick={onRetryProfile}>
            Retry loading profile
          </button>
        )}
      </section>
    );
  }
  return (
    <div className="w-full space-y-6">
      {/* Title & Screen Header */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
            PRE-SUBMISSION CHECK
          </span>
          <span className="text-xs text-[#64748B]">Screening, not diagnosis</span>
          <span className="text-[#CBD5E1]">|</span>
          <span className="text-xs text-[#94A3B8] font-medium">Ref: {caseId.slice(0, 16)}...</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
          Review My Health Profile
        </h1>
        <p className="text-sm text-[#475467] leading-relaxed">
          Review the values stored by Sanad. "Mark reviewed" is only a checklist marker;
          only "Save revised answer" and "Save as Not sure" update the backend. Nothing here is clinical verification.
          Unknown answers are always accepted and will never be treated as negative.
        </p>
      </div>

      {/* Conflicting Information Warning Banner */}
      {conflictingQuestions.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#FFFAEB] border border-[#FEDF89] text-[#B54708] space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Discrepancy / Conflicting Information Detected</span>
          </div>
          <p className="text-xs leading-relaxed">
            More than one answer was recorded for {conflictingQuestions.length} item(s) across your profile and questionnaire.
            Review each item below; use Edit to submit a revised answer. A checklist mark does not resolve the discrepancy.
          </p>
        </div>
      )}

      {/* Missing Required Information Banner */}
      {reviewItems.length > 0 && reviewItems.some(q => q.state === 'NOT_ASKED') && (
        <div className="p-5 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Unanswered Profile Questions</span>
          </div>
          <p className="text-xs leading-relaxed">
Some profile questions have not been answered. The backend will determine whether more information is required; you can enter or revise answers here.
          </p>
          <button
            type="button"
            onClick={onReturnToQuestions}
            className="text-xs font-semibold text-[#D92D20] hover:underline cursor-pointer"
          >
            Answer needed questions now →
          </button>
        </div>
      )}

      {/* Section 1: Basic Context */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <h2 className="text-base font-bold text-[#0F172A] border-b border-[#E2ECF8] pb-3">
          1. Basic Context
        </h2>
        {contextItems.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No basic context questions in this catalogue.</p>
        ) : (
          <div className="space-y-3">
            {contextItems.map(q => {
              return renderFactRow(
                q.question_id,
                q.text,
                factSummary(q),
                factSources(q),
                q.facts.length === 1 ? q.facts[0].temporal_status : null,
                () => onEditQuestion(q.question_id),
                q.discrepancy_kind !== 'NONE',
                q
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Reproductive Concern & Health History */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <h2 className="text-base font-bold text-[#0F172A] border-b border-[#E2ECF8] pb-3">
          2. Reproductive Concern and Health History
        </h2>
        {historyItems.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No health history items recorded.</p>
        ) : (
          <div className="space-y-3">
            {historyItems.map(q => {
              return renderFactRow(
                q.question_id,
                q.text,
                factSummary(q),
                factSources(q),
                q.facts.length === 1 ? q.facts[0].temporal_status : null,
                () => onEditQuestion(q.question_id),
                q.discrepancy_kind !== 'NONE',
                q
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Medications & Treatments */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <h2 className="text-base font-bold text-[#0F172A] border-b border-[#E2ECF8] pb-3">
          3. Medications and Treatments
        </h2>
        {medicationItems.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No medication questions in this catalogue.</p>
        ) : (
          <div className="space-y-3">
            {medicationItems.map(q => {
              return renderFactRow(
                q.question_id,
                q.text,
                factSummary(q),
                factSources(q),
                q.facts.length === 1 ? q.facts[0].temporal_status : null,
                () => onEditQuestion(q.question_id),
                q.discrepancy_kind !== 'NONE',
                q
              );
            })}
          </div>
        )}
      </div>

      {/* Section 4: Lifestyle Factors */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <h2 className="text-base font-bold text-[#0F172A] border-b border-[#E2ECF8] pb-3">
          4. Lifestyle Factors
        </h2>
        {lifestyleItems.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">No lifestyle items recorded.</p>
        ) : (
          <div className="space-y-3">
            {lifestyleItems.map(q => {
              return renderFactRow(
                q.question_id,
                q.text,
                factSummary(q),
                factSources(q),
                q.facts.length === 1 ? q.facts[0].temporal_status : null,
                () => onEditQuestion(q.question_id),
                q.discrepancy_kind !== 'NONE',
                q
              );
            })}
          </div>
        )}
      </div>

      {/* Section 5: Measurements and Lab Values (J3 Observations) */}
      <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2ECF8] pb-3">
          <h2 className="text-base font-bold text-[#0F172A]">
            5. Measurements and Lab Results (Optional)
          </h2>
          {onOpenLab && (
            <button
              type="button"
              onClick={onOpenLab}
              className="text-xs font-semibold text-[#0066EE] hover:underline cursor-pointer"
            >
              + Add / edit lab values
            </button>
          )}
        </div>

        {observations.length === 0 ? (
          <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] text-xs text-[#64748B] space-y-3">
            <p>No lab test observations recorded for this session.</p>
            {onOpenLab && (
              <button
                type="button"
                onClick={onOpenLab}
                className="px-4 py-1.5 rounded-full bg-white border border-[#BCD8FE] text-xs font-semibold text-[#0050CC] hover:bg-[#EBF3FF] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                Add lab values now
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {observations.map(obs => {
              const valText = obs.value !== null ? `${obs.value} ${obs.unit || ''}` : 'Unknown value';
              return renderFactRow(
                obs.observation_id,
                `Lab Test: ${obs.test_code.toUpperCase()}`,
                valText,
                obs.source || 'Manual lab entry',
                obs.collected_on ? `Collected: ${obs.collected_on}` : null,
                onOpenLab
              );
            })}
          </div>
        )}
      </div>

      {/* Section 6: Optional Wellbeing Context */}
      {psychQuestions.length > 0 && (
        <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md space-y-4">
          <h2 className="text-base font-bold text-[#0F172A] border-b border-[#E2ECF8] pb-3">
            6. Wellbeing Context (Optional Self-Reports)
          </h2>
          <p className="text-xs text-[#64748B]">
            Self-reported context only. These responses are never used for clinical triage rules.
          </p>
          <div className="space-y-3">
            {psychQuestions.map(pq => {
              const res = psychAnswers[pq.question_id] || 'Not answered';
              return renderFactRow(
                pq.question_id,
                pq.draft_text,
                res,
                'Self-reported wellbeing context'
              );
            })}
          </div>
        </div>
      )}

      {saveError && (
        <div role="alert" className="p-4 rounded-xl bg-[#FFFAEB] border border-[#FEDF89] text-sm text-[#B54708]">
          {saveError} Check the latest saved profile and try again.
        </div>
      )}
      {/* Error Alert */}
      {error && (
        <div role="alert" className="p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Final Acknowledgment & Submit Assessment Panel */}
      <div className="medical-card bg-gradient-to-br from-white to-[#F8FAFC] p-6 sm:p-8 rounded-2xl border border-[#BCD8FE] shadow-lg space-y-5">
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded-md border-[#CBD5E1] text-[#0066EE] focus:ring-[#0066EE]"
            />
            <span className="text-sm font-semibold text-[#0F172A] leading-snug">
              I have reviewed the information above to the best of my knowledge.
            </span>
          </label>
          <p className="text-xs text-[#64748B] pl-8">
            This acknowledgment is for this screen only. To change an answer, select Edit and save your correction here. "Save as Not sure" updates the stored fact. It does not verify the data medically.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-[#E2ECF8]">
          <button
            type="button"
            onClick={onReturnToQuestions}
            className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer text-center"
          >
            ← Return to questions
          </button>

          <button
            type="button"
            disabled={!acknowledged || isSubmitting || savingId !== null || editingId !== null || Boolean(saveError)}
            onClick={onSubmitAssessment}
            className={`btn-pill-primary px-8 py-3.5 rounded-full text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 ${
              acknowledged && !isSubmitting && savingId === null && editingId === null && !saveError
                ? 'cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="spinner spinner-sm spinner-white" />
                <span>Submitting assessment…</span>
              </span>
            ) : (
              <>
                <span>Submit Assessment</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-[#64748B] leading-relaxed">
          <strong>Important:</strong> Submitting sends this data to Sanad for internal rule evaluation only.
          It does not send your information to a doctor, clinic, or third party.
        </p>
      </div>
    </div>
  );
};
