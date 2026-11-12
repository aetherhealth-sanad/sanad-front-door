import React, { useState } from 'react';

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
  const percentComplete = coreCount && coreCount.total > 0
    ? Math.round((coreCount.done / coreCount.total) * 100)
    : Math.round(((currentStepIndex + 1) / STEP_DEFINITIONS.length) * 100);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Session Header / Disclaimer Strip */}
      <div className="mb-6 pb-4 border-b border-[#E2ECF8] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-xs font-bold text-[#0066EE] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full border border-[#BCD8FE]">
            ACTIVE SESSION
          </span>
          <span className="font-mono text-xs text-[#829AB8] bg-white/70 px-2.5 py-0.5 rounded-full border border-[#E2ECF8]">
            Screening, not diagnosis
          </span>
          <span className="hidden sm:inline text-[#BCD8FE]">•</span>
          <span className="font-mono text-[11px] text-[#4A6588] bg-white/70 px-2.5 py-0.5 rounded-full border border-[#E2ECF8]">
            Session ID: {caseId.slice(0, 16)}...
          </span>
        </div>

        {/* Mobile toggle button for session steps and facts */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="btn-pill-secondary px-4 py-1.5 text-xs font-mono font-semibold"
          >
            {mobileDrawerOpen ? 'Close session drawer' : 'View session steps & facts'}
          </button>
        </div>
      </div>

      {/* Main 3-Panel Architectural Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_300px] gap-6 items-start">
        {/* Left Rail: YOUR SESSION STEPS */}
        <aside
          className={`medical-card p-5 space-y-4 ${
            mobileDrawerOpen ? 'block' : 'hidden lg:block'
          }`}
          aria-label="Your session progress"
        >
          <div className="border-b border-[#E2ECF8] pb-3">
            <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[#072254]">
              Your Session
            </h2>
            <div className="flex items-center justify-between mt-1.5">
              <span className="font-mono text-xs font-semibold text-[#0066EE]">
                Stage {currentStepIndex + 1} of {STEP_DEFINITIONS.length}
              </span>
              <span className="font-mono text-[11px] text-[#829AB8] bg-[#EBF3FF] px-2 py-0.5 rounded-full">
                {percentComplete}%
              </span>
            </div>
            {/* Visual Mini Progress Bar */}
            <div className="w-full bg-[#EBF3FF] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-[#0066EE] h-full rounded-full transition-[width] duration-250 ease-[var(--ease-out)]"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          <nav className="space-y-1.5" aria-label="Session stages">
            {STEP_DEFINITIONS.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-full font-mono text-xs transition-[background-color,color,box-shadow] duration-160 ease-[var(--ease-out)] ${
                    isCurrent
                      ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                      : isPast
                      ? 'bg-[#EBF3FF] text-[#0066EE] font-medium'
                      : 'text-[#829AB8] hover:text-[#072254]'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[11px] ${
                      isPast
                        ? 'bg-[#BCD8FE] text-[#0066EE] font-bold'
                        : isCurrent
                        ? 'bg-white text-[#0066EE] font-bold'
                        : 'border border-[#BCD8FE] text-[#829AB8]'
                    }`}
                  >
                    {isPast ? '✓' : isCurrent ? '●' : '○'}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-[#E2ECF8] pt-3 text-[11px] font-mono text-[#829AB8] space-y-1">
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
          {/* Summary Status Card - Deep Sapphire Style */}
          <div className="medical-card-sapphire p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#BCD8FE]">
                Assessment Status
              </h3>
              <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
            </div>
            <p className="text-base font-extrabold text-white tracking-tight">
              {summaryStatus}
            </p>
            <p className="font-mono text-[11px] text-[#BCD8FE] leading-relaxed border-t border-white/15 pt-2">
              Summary releases only after verified clinician review and explicit submit.
            </p>
          </div>

          {/* Optional Lab Card */}
          {onOpenLab && (
            <div className="medical-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#072254]">
                  Lab Results (J3)
                </h3>
                <span className="font-mono text-[10px] text-[#829AB8] bg-[#F8FAFD] px-2 py-0.5 rounded-full border border-[#E2ECF8]">Optional</span>
              </div>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Add semen analysis or hormone lab values at any time during your session.
              </p>
              <button
                type="button"
                onClick={onOpenLab}
                className="btn-pill-primary w-full py-2.5 text-xs text-center"
              >
                + Add Lab Values
              </button>
            </div>
          )}

          {/* Privacy Scope Card */}
          <div className="medical-card p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#072254]">
                Privacy Scopes
              </h3>
              <span className="font-mono text-[10px] text-[#0066EE] bg-[#EBF3FF] px-2 py-0.5 rounded-full font-semibold">Active</span>
            </div>
            <p className="text-xs text-[#4A6588] leading-relaxed">
              Assessment scope active for this intake. No external transfer without explicit separate consent.
            </p>
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="font-mono text-[11px] text-[#0066EE] font-bold hover:underline cursor-pointer block mt-1"
              >
                Manage consent scopes →
              </button>
            )}
          </div>

          {/* Recorded Information Ledger */}
          <div className="medical-card p-5 space-y-3">
            <div className="border-b border-[#E2ECF8] pb-2.5">
              <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-[#072254]">
                Recorded Information
              </h3>
              {coreCount && (
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-xs font-semibold text-[#0066EE]">
                    Core facts confirmed
                  </span>
                  <span className="font-mono text-xs font-bold text-[#072254] bg-[#EBF3FF] px-2.5 py-0.5 rounded-full">
                    {coreCount.done} / {coreCount.total}
                  </span>
                </div>
              )}
            </div>

            {recordedFacts.length === 0 ? (
              <p className="text-xs font-mono text-[#829AB8] py-2">
                Your answers in this session will appear here as they are recorded.
              </p>
            ) : (
              <ul className="space-y-3 max-h-[38vh] overflow-y-auto pr-1">
                {recordedFacts.map(fact => {
                  const source = SOURCE_LABELS[fact.sourceType] ?? fact.sourceType;
                  return (
                    <li
                      key={fact.id}
                      className="border-b border-[#E2ECF8] pb-2.5 last:border-0 space-y-1"
                    >
                      <p className="text-xs text-[#4A6588] line-clamp-1">{fact.question}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold text-[#072254]">
                          {fact.answerLabel}
                        </span>
                        {fact.onEdit && (
                          <button
                            type="button"
                            onClick={fact.onEdit}
                            className="font-mono text-[10px] text-[#0066EE] font-bold underline hover:text-[#004EB8] cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-[#829AB8]">
                        {fact.status} • from {source}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-[10px] font-mono text-[#829AB8] border-t border-[#E2ECF8] pt-2">
              Session-only storage. Answers are cleared upon Quick Exit.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
