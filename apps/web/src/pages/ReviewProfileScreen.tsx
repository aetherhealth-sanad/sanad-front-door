import React, { useState } from 'react';
import {
  type QuestionItem,
  type ObservationRecord,
  type PsychosocialQuestion,
} from '../api/client';

export interface FactReviewState {
  confirmed: boolean;
  notSure: boolean;
}

interface ReviewProfileScreenProps {
  caseId: string;
  questions: QuestionItem[];
  answers: Record<string, { choice: string; value?: boolean | number | string | null; temporal_status?: string | null; label: string; source?: string }>;
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
  questions,
  answers,
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

  const toggleConfirm = (id: string) => {
    setFactStates(prev => ({
      ...prev,
      [id]: {
        confirmed: !prev[id]?.confirmed,
        notSure: false,
      },
    }));
  };

  const toggleNotSure = (id: string) => {
    setFactStates(prev => ({
      ...prev,
      [id]: {
        confirmed: false,
        notSure: !prev[id]?.notSure,
      },
    }));
  };

  // Group questions into sections
  const contextItems = questions.filter(q => categorizeQuestion(q.question_id) === 'context');
  const historyItems = questions.filter(q => categorizeQuestion(q.question_id) === 'history');
  const medicationItems = questions.filter(q => categorizeQuestion(q.question_id) === 'medications');
  const lifestyleItems = questions.filter(q => categorizeQuestion(q.question_id) === 'lifestyle');

  // Check for conflicts and blocking items
  const conflictingQuestions = questions.filter(q => q.conflicting_values && q.conflicting_values.length > 0);
  const unAnsweredBlocking = questions.filter(
    q => q.blocking && (!answers[q.question_id] || answers[q.question_id].choice === 'NOT_ASKED')
  );

  const renderFactRow = (
    id: string,
    title: string,
    recordedValueText: string,
    sourceText: string,
    temporalStatus?: string | null,
    onEdit?: () => void,
    isConflict?: boolean
  ) => {
    const state = factStates[id] || { confirmed: false, notSure: false };

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
              {state.confirmed ? '✓ Confirmed' : 'Confirm'}
            </button>

            <button
              type="button"
              onClick={() => toggleNotSure(id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                state.notSure
                  ? 'bg-[#B54708] text-white border-[#B54708] shadow-xs'
                  : 'bg-white text-[#64748B] border-[#CBD5E1] hover:bg-[#F8FAFC]'
              }`}
            >
              {state.notSure ? '? Not sure' : 'Not sure'}
            </button>

            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#1E293B] bg-white border border-[#CBD5E1] hover:border-[#0066EE] hover:bg-[#F8FAFC] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9]">
          <span>Source: {sourceText}</span>
          <span>•</span>
          <span>Status: {state.confirmed ? 'Confirmed as recorded by you' : state.notSure ? 'Uncertain' : 'Unconfirmed'}</span>
          <span>•</span>
          <span>Verification: Unverified</span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
          Please confirm what Sanad recorded for your session before submitting for assessment processing.
          Your confirmation verifies that Sanad captured what you meant. It is not clinical verification.
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
            Please review each item below; your confirmed selection will resolve the record.
          </p>
        </div>
      )}

      {/* Missing Required Information Banner */}
      {unAnsweredBlocking.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Incomplete Core Questions</span>
          </div>
          <p className="text-xs leading-relaxed">
            {unAnsweredBlocking.length} core question(s) are needed for a full summary. You may still submit for a limited assessment, or return to answer them.
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
              const ans = answers[q.question_id];
              return renderFactRow(
                q.question_id,
                q.text,
                ans ? ans.label : 'Not answered',
                ans?.source || 'Intake questionnaire',
                ans?.temporal_status,
                () => onEditQuestion(q.question_id),
                q.conflicting_values && q.conflicting_values.length > 0
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
              const ans = answers[q.question_id];
              return renderFactRow(
                q.question_id,
                q.text,
                ans ? ans.label : 'Not answered',
                ans?.source || 'Intake questionnaire',
                ans?.temporal_status,
                () => onEditQuestion(q.question_id),
                q.conflicting_values && q.conflicting_values.length > 0
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
              const ans = answers[q.question_id];
              return renderFactRow(
                q.question_id,
                q.text,
                ans ? ans.label : 'Not answered',
                ans?.source || 'Intake questionnaire',
                ans?.temporal_status,
                () => onEditQuestion(q.question_id),
                q.conflicting_values && q.conflicting_values.length > 0
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
              const ans = answers[q.question_id];
              return renderFactRow(
                q.question_id,
                q.text,
                ans ? ans.label : 'Not answered',
                ans?.source || 'Intake questionnaire',
                ans?.temporal_status,
                () => onEditQuestion(q.question_id),
                q.conflicting_values && q.conflicting_values.length > 0
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
            This acknowledgment confirms that the recorded items match what you provided. It does not warrant medical certainty.
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
            disabled={!acknowledged || isSubmitting}
            onClick={onSubmitAssessment}
            className={`btn-pill-primary px-8 py-3.5 rounded-full text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 ${
              acknowledged && !isSubmitting
                ? 'cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <span>{isSubmitting ? 'Submitting assessment...' : 'Submit Assessment'}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
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
