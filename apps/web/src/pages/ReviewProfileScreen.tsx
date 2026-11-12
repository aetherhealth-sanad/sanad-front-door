import React, { useState } from 'react';
import {
  type QuestionItem,
  type ObservationRecord,
  type PsychosocialQuestion,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

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
        className={`p-3.5 sm:p-4 rounded-[2px] border ${
          isConflict
            ? 'border-[#B45309] bg-[#FFFBEB]'
            : state.confirmed
            ? 'border-[#0F523E] bg-[#F5FAF8]'
            : 'border-[#C5CEC9] bg-white'
        } space-y-2`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs text-[#3F4E48] leading-tight font-medium">{title}</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm sm:text-base font-extrabold text-[#0B1310]">
                {recordedValueText}
              </span>
              {temporalStatus && (
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-[2px] bg-[#E6EAE4] text-[#0B1310]">
                  {temporalStatus === 'PAST' ? 'Past history' : 'Current'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleConfirm(id)}
              className={`px-2.5 py-1 rounded-[2px] font-mono text-xs font-semibold border cursor-pointer btn-press transition-colors ${
                state.confirmed
                  ? 'bg-[#0F523E] text-white border-[#0F523E]'
                  : 'bg-white text-[#0B1310] border-[#0B1310] hover:bg-[#E6F2EE]'
              }`}
            >
              {state.confirmed ? '✓ Confirmed' : 'Confirm'}
            </button>

            <button
              type="button"
              onClick={() => toggleNotSure(id)}
              className={`px-2.5 py-1 rounded-[2px] font-mono text-xs font-semibold border cursor-pointer btn-press transition-colors ${
                state.notSure
                  ? 'bg-[#B45309] text-white border-[#B45309]'
                  : 'bg-white text-[#0B1310] border-[#C5CEC9] hover:bg-[#E6EAE4]'
              }`}
            >
              {state.notSure ? '? Not sure' : 'Not sure'}
            </button>

            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-2.5 py-1 rounded-[2px] font-mono text-xs font-semibold text-[#0B1310] bg-white border border-[#C5CEC9] hover:border-[#0B1310] hover:bg-[#E6EAE4] cursor-pointer btn-press"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#63736C] pt-1 border-t border-[#E6EAE4]">
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
      <div className="dossier-card bg-white p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <MockBadge label="PRE-SUBMISSION VERIFICATION" />
          <span className="font-mono text-xs text-[#3F4E48]">Screening, not diagnosis</span>
          <span className="text-[#C5CEC9]">|</span>
          <span className="font-mono text-[11px] text-[#63736C]">Ref: {caseId.slice(0, 16)}…</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
          Review My Health Profile
        </h1>
        <p className="text-sm text-[#3F4E48] leading-relaxed">
          Please confirm what Sanad recorded for your session before submitting for assessment processing.
          Your confirmation verifies that Sanad captured what you meant. It is not clinical verification.
          Unknown answers are always accepted and will never be treated as negative.
        </p>
      </div>

      {/* Conflicting Information Warning Banner */}
      {conflictingQuestions.length > 0 && (
        <div className="p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] space-y-2">
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
        <div className="p-4 rounded-[2px] bg-[#FDF2EF] border border-[#C84B31] text-[#7F1D1D] space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Incomplete Core Questions</span>
          </div>
          <p className="text-xs leading-relaxed">
            {unAnsweredBlocking.length} core question(s) are needed for a full summary. You may still submit for a limited assessment, or return to answer them.
          </p>
          <button
            type="button"
            onClick={onReturnToQuestions}
            className="text-xs font-mono font-bold underline cursor-pointer"
          >
            Answer needed questions now →
          </button>
        </div>
      )}

      {/* Section 1: Basic Context */}
      <div className="dossier-card bg-white p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-extrabold text-[#0B1310] border-b border-[#0B1310] pb-2">
          1. Basic Context
        </h2>
        {contextItems.length === 0 ? (
          <p className="font-mono text-xs text-[#63736C]">No basic context questions in this catalogue.</p>
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
      <div className="dossier-card bg-white p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-extrabold text-[#0B1310] border-b border-[#0B1310] pb-2">
          2. Reproductive Concern and Health History
        </h2>
        {historyItems.length === 0 ? (
          <p className="font-mono text-xs text-[#63736C]">No health history items recorded.</p>
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
      <div className="dossier-card bg-white p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-extrabold text-[#0B1310] border-b border-[#0B1310] pb-2">
          3. Medications and Treatments
        </h2>
        {medicationItems.length === 0 ? (
          <p className="font-mono text-xs text-[#63736C]">No medication questions in this catalogue.</p>
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
      <div className="dossier-card bg-white p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-extrabold text-[#0B1310] border-b border-[#0B1310] pb-2">
          4. Lifestyle Factors
        </h2>
        {lifestyleItems.length === 0 ? (
          <p className="font-mono text-xs text-[#63736C]">No lifestyle items recorded.</p>
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
      <div className="dossier-card bg-white p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between border-b border-[#0B1310] pb-2">
          <h2 className="text-base font-extrabold text-[#0B1310]">
            5. Measurements and Lab Results (Optional)
          </h2>
          {onOpenLab && (
            <button
              type="button"
              onClick={onOpenLab}
              className="font-mono text-xs font-bold text-[#0F523E] hover:underline cursor-pointer"
            >
              + Add / edit lab values
            </button>
          )}
        </div>

        {observations.length === 0 ? (
          <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#C5CEC9] text-xs text-[#3F4E48] space-y-2">
            <p>No lab test observations recorded for this session.</p>
            {onOpenLab && (
              <button
                type="button"
                onClick={onOpenLab}
                className="px-3 py-1.5 rounded-[2px] bg-white border border-[#0B1310] font-mono text-xs font-bold text-[#0B1310] hover:bg-[#E6F2EE] cursor-pointer"
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
        <div className="dossier-card bg-white p-5 sm:p-6 space-y-3">
          <h2 className="text-base font-extrabold text-[#0B1310] border-b border-[#0B1310] pb-2">
            6. Wellbeing Context (Optional Self-Reports)
          </h2>
          <p className="font-mono text-[11px] text-[#63736C]">
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
        <div role="alert" className="p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm font-medium">
          {error}
        </div>
      )}

      {/* Final Acknowledgment & Submit Assessment Panel */}
      <div className="dossier-card bg-white p-6 space-y-4 border-2 border-[#0B1310]">
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 rounded-[2px] border-[#0B1310] text-[#0F523E] focus:ring-[#0F523E]"
            />
            <span className="text-sm font-semibold text-[#0B1310] leading-snug">
              I have reviewed the information above to the best of my knowledge.
            </span>
          </label>
          <p className="text-xs text-[#63736C] pl-7">
            This acknowledgment confirms that the recorded items match what you provided. It does not warrant medical certainty.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#0B1310]">
          <button
            type="button"
            onClick={onReturnToQuestions}
            className="px-4 py-2.5 rounded-[2px] border border-[#0B1310] bg-white text-[#0B1310] font-mono text-xs font-bold hover:bg-[#E6EAE4] cursor-pointer text-center"
          >
            ← Return to questions
          </button>

          <button
            type="button"
            disabled={!acknowledged || isSubmitting}
            onClick={onSubmitAssessment}
            className={`px-6 py-3 rounded-[2px] font-mono text-sm font-bold border border-[#0B1310] text-white btn-press transition-all ${
              acknowledged && !isSubmitting
                ? 'bg-[#0F523E] hover:bg-[#093B2C] shadow-[4px_4px_0px_#0B1310] cursor-pointer'
                : 'bg-[#63736C] opacity-50 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Submitting assessment…' : 'Submit Assessment →'}
          </button>
        </div>

        <p className="font-mono text-[11px] text-[#63736C] leading-relaxed">
          <strong>Important:</strong> Submitting sends this data to Sanad for internal rule evaluation only.
          It does not send your information to a doctor, clinic, or third party.
        </p>
      </div>
    </div>
  );
};
