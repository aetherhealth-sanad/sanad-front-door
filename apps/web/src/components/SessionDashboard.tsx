import React, { useState } from 'react';
import { MockBadge } from './MockBadge';

export type SessionStep =
  | 'consent'
  | 'safety'
  | 'questions'
  | 'review'
  | 'submit'
  | 'summary'
  | 'next_step';

export interface RecordedFactItem {
  id: string;
  question: string;
  answerLabel: string;
  sourceType: string;
  status: 'Answered' | 'Not sure' | 'Prefer not to say' | 'Skipped' | 'Unverified';
  onEdit?: () => void;
}

interface SessionDashboardProps {
  currentStep: SessionStep;
  caseId: string;
  coreCount?: { done: number; total: number };
  recordedFacts?: RecordedFactItem[];
  summaryStatus?: string;
  onOpenLab?: () => void;
  onOpenPrivacy?: () => void;
  children: React.ReactNode;
}

const STEP_DEFINITIONS: Array<{ id: SessionStep; label: string }> = [
  { id: 'consent', label: 'Consent' },
  { id: 'safety', label: 'Safety check' },
  { id: 'questions', label: 'Questions' },
  { id: 'review', label: 'Review profile' },
  { id: 'submit', label: 'Submit' },
  { id: 'summary', label: 'Summary' },
  { id: 'next_step', label: 'Next step' },
];

const SOURCE_LABELS: Record<string, string> = {
  PATIENT_REPORTED: 'You',
  USER_ENTERED: 'You',
  SAMPLE_PROFILE: 'Sample profile',
  SAMPLE_FIXTURE: 'Sample profile',
  USER_UPLOADED: 'Uploaded file, unverified',
  OBSERVATION: 'Manual lab',
};

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  currentStep,
  caseId,
  coreCount,
  recordedFacts = [],
  summaryStatus = 'Not ready yet',
  onOpenLab,
  onOpenPrivacy,
  children,
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const currentStepIndex = STEP_DEFINITIONS.findIndex(s => s.id === currentStep);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Session Header / Disclaimer Strip */}
      <div className="mb-6 pb-4 border-b border-[#0B1310] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MockBadge label="SYNTHETIC RESEARCH SESSION" />
          <span className="font-mono text-xs text-[#3F4E48]">
            Screening, not diagnosis
          </span>
          <span className="hidden sm:inline text-[#C5CEC9]">|</span>
          <span className="font-mono text-[11px] text-[#63736C]">
            Session ID: {caseId.slice(0, 16)}…
          </span>
        </div>

        {/* Mobile toggle button for session steps and facts */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="px-3 py-1.5 rounded-[2px] border border-[#0B1310] bg-white font-mono text-xs font-semibold text-[#0B1310] hover:bg-[#E6EAE4] cursor-pointer"
          >
            {mobileDrawerOpen ? 'Close session drawer' : 'View session steps & facts'}
          </button>
        </div>
      </div>

      {/* Main 3-Panel Architectural Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] gap-6 items-start">
        {/* Left Rail: YOUR SESSION STEPS */}
        <aside
          className={`dossier-card bg-white p-4 space-y-4 ${
            mobileDrawerOpen ? 'block' : 'hidden lg:block'
          }`}
          aria-label="Your session progress"
        >
          <div className="border-b border-[#C5CEC9] pb-2.5">
            <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0B1310]">
              Your Session
            </h2>
            <p className="font-mono text-[10px] text-[#63736C] mt-0.5">
              Stage {currentStepIndex + 1} of {STEP_DEFINITIONS.length}
            </p>
          </div>

          <nav className="space-y-1.5" aria-label="Session stages">
            {STEP_DEFINITIONS.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-[2px] font-mono text-xs ${
                    isCurrent
                      ? 'bg-[#0B1310] text-white font-bold'
                      : isPast
                      ? 'text-[#0F523E] font-medium'
                      : 'text-[#63736C]'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 text-[11px] ${
                      isPast
                        ? 'text-[#0F523E] font-bold'
                        : isCurrent
                        ? 'text-white'
                        : 'text-[#C5CEC9]'
                    }`}
                  >
                    {isPast ? '✓' : isCurrent ? '●' : '○'}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-[#C5CEC9] pt-3 text-[11px] font-mono text-[#63736C] space-y-1">
            <p>Protocol: Draft rules</p>
            <p>Clinical status: CLINICAL_TBD</p>
          </div>
        </aside>

        {/* Central Workspace: Active Panel (Chat, Review, Lab, etc.) */}
        <section className="min-w-0 w-full" aria-label="Active workspace">
          {children}
        </section>

        {/* Right Rail: SUPPORTING CARDS & RECORDED FACTS */}
        <aside
          className={`space-y-5 ${
            mobileDrawerOpen ? 'block' : 'hidden lg:block'
          }`}
          aria-label="Recorded information and summary status"
        >
          {/* Summary Status Card */}
          <div className="dossier-card bg-white p-4 space-y-2">
            <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0B1310]">
              Assessment Summary
            </h3>
            <p className="text-xs font-semibold text-[#0B1310]">
              {summaryStatus}
            </p>
            <p className="font-mono text-[11px] text-[#63736C] leading-relaxed">
              Summary releases only after verified review and explicit submit.
            </p>
          </div>

          {/* Optional Lab Card */}
          {onOpenLab && (
            <div className="dossier-card bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0B1310]">
                  Lab Results (J3)
                </h3>
                <span className="font-mono text-[10px] text-[#63736C]">Optional</span>
              </div>
              <p className="text-xs text-[#3F4E48] leading-relaxed">
                Add semen analysis or hormone lab values at any time during your session.
              </p>
              <button
                type="button"
                onClick={onOpenLab}
                className="w-full py-2 px-3 rounded-[2px] border border-[#0B1310] bg-white hover:bg-[#E6F2EE] font-mono text-xs font-bold text-[#0B1310] btn-press cursor-pointer text-center"
              >
                + Add lab values
              </button>
            </div>
          )}

          {/* Privacy Scope Card */}
          <div className="dossier-card bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0B1310]">
                Privacy Scopes
              </h3>
              <span className="font-mono text-[10px] text-[#0F523E] font-semibold">Active</span>
            </div>
            <p className="text-xs text-[#3F4E48] leading-relaxed">
              Assessment scope active for this intake. No external transfer without explicit separate consent.
            </p>
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="font-mono text-[11px] text-[#0F523E] hover:underline cursor-pointer block"
              >
                Manage consent scopes →
              </button>
            )}
          </div>

          {/* Recorded Information Ledger */}
          <div className="dossier-card bg-white p-4 space-y-3">
            <div className="border-b border-[#C5CEC9] pb-2">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#0B1310]">
                Recorded Information
              </h3>
              {coreCount && (
                <p className="font-mono text-xs font-semibold text-[#0F523E] mt-1">
                  Core questions: {coreCount.done} of {coreCount.total} done
                </p>
              )}
            </div>

            {recordedFacts.length === 0 ? (
              <p className="text-xs font-mono text-[#63736C]">
                Your answers in this session will appear here as they are recorded.
              </p>
            ) : (
              <ul className="space-y-3 max-h-[38vh] overflow-y-auto pr-1">
                {recordedFacts.map(fact => {
                  const source = SOURCE_LABELS[fact.sourceType] ?? fact.sourceType;
                  return (
                    <li
                      key={fact.id}
                      className="border-b border-[#E6EAE4] pb-2 last:border-0 space-y-0.5"
                    >
                      <p className="text-xs text-[#3F4E48] line-clamp-1">{fact.question}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-[#0B1310]">
                          {fact.answerLabel}
                        </span>
                        {fact.onEdit && (
                          <button
                            type="button"
                            onClick={fact.onEdit}
                            className="font-mono text-[10px] text-[#0F523E] underline hover:text-[#093B2C] cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-[#63736C]">
                        {fact.status} · from {source}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-[10px] font-mono text-[#63736C] border-t border-[#E6EAE4] pt-2">
              Session-only storage. Answers are cleared upon Quick Exit.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
