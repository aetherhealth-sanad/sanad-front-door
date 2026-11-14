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
  USER_UPLOADED: 'Uploaded file',
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
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const currentStepIndex = STEP_DEFINITIONS.findIndex(s => s.id === currentStep);
  const percentComplete = coreCount && coreCount.total > 0
    ? Math.round((coreCount.done / coreCount.total) * 100)
    : Math.round(((currentStepIndex + 1) / STEP_DEFINITIONS.length) * 100);

  return (
    <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-4 sm:py-6">
      {/* ── Session telemetry strip ── */}
      <div className="mb-5 pb-3 border-b border-[#E2ECF8] flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-[#0062FF] bg-[#EBF4FF] px-2.5 py-0.5 rounded-full border border-[#BAD6FE] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF] glow-pulse" />
            ACTIVE SESSION
          </span>
          <span className="font-mono text-[10px] sm:text-[11px] text-[#829AB8] bg-white px-2 py-0.5 rounded-full border border-[#E2ECF8]">
            Screening, not diagnosis
          </span>
          <span className="hidden sm:inline font-mono text-[11px] text-[#829AB8]">
            ID: {caseId.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Mobile floating toggle button */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#BAD6FE] text-xs font-semibold text-[#0062FF] shadow-xs active:scale-95 transition-transform"
          >
            <span>📋 Facts ({recordedFacts.length})</span>
          </button>
        </div>
      </div>

      {/* ── Main 3-Panel Layout (Desktop) / Workspace (Mobile) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[260px_minmax(0,1fr)_360px] gap-6 xl:gap-8 items-start">

        {/* ── Left Rail: Step Navigator (Desktop) ── */}
        <aside className="medical-card p-4 space-y-4 hidden lg:block" aria-label="Session progress">
          <div className="border-b border-[#E2ECF8] pb-3">
            <h2 className="font-mono font-bold text-[11px] uppercase tracking-wider text-[#07215A]">
              Session Steps
            </h2>
            <div className="flex items-center justify-between mt-1">
              <span className="font-mono text-xs font-semibold text-[#0062FF]">
                {currentStepIndex + 1} of {STEP_DEFINITIONS.length}
              </span>
              <span className="font-mono text-[10px] text-[#829AB8] bg-[#EBF4FF] px-2 py-0.5 rounded-full font-bold">
                {percentComplete}%
              </span>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full bg-[#EBF4FF] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#0062FF] h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          <nav className="space-y-1" aria-label="Session stages">
            {STEP_DEFINITIONS.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'bg-[#0062FF] text-white font-bold shadow-xs'
                      : isPast
                      ? 'bg-[#EBF4FF] text-[#0062FF]'
                      : 'text-[#829AB8]'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-mono shrink-0 ${
                      isPast
                        ? 'bg-[#BAD6FE] text-[#0048C8] font-bold'
                        : isCurrent
                        ? 'bg-white text-[#0062FF] font-bold'
                        : 'border border-[#BAD6FE] text-[#829AB8]'
                    }`}
                  >
                    {isPast ? '✓' : idx + 1}
                  </span>
                  <span className="truncate">{step.label}</span>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-[#E2ECF8] pt-2.5 text-[10px] font-mono text-[#829AB8] space-y-0.5">
            <p>Protocol: Draft rules</p>
            <p>Status: CLINICAL_TBD</p>
          </div>
        </aside>

        {/* ── Center: Active Workspace ── */}
        <section className="min-w-0 w-full" aria-label="Active workspace">
          {children}
        </section>

        {/* ── Right Rail: Recorded Facts & Actions (Desktop) ── */}
        <aside className="space-y-4 hidden lg:block" aria-label="Session summary">
          {/* Status card */}
          <div className="medical-card-sapphire p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-bold text-[10px] uppercase tracking-wider text-[#BAD6FE]">
                Assessment Status
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] glow-pulse" />
            </div>
            <p className="text-sm font-extrabold text-white tracking-tight">
              {summaryStatus}
            </p>
            <p className="font-mono text-[10px] text-[#BAD6FE] leading-relaxed border-t border-white/15 pt-2">
              Summary generated within this private session only.
            </p>
          </div>

          {/* Optional Lab Card */}
          {onOpenLab && (
            <div className="medical-card p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono font-bold text-[11px] uppercase tracking-wider text-[#07215A]">
                  Lab Results
                </h3>
                <span className="font-mono text-[10px] text-[#829AB8] bg-[#F6F9FF] px-2 py-0.5 rounded-full border border-[#E2ECF8]">Optional</span>
              </div>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Add semen analysis values anytime during your session.
              </p>
              <button
                type="button"
                onClick={onOpenLab}
                className="btn-pill-secondary w-full py-2 text-xs font-semibold"
              >
                + Add Lab Values
              </button>
            </div>
          )}

          {/* Privacy Scope Card */}
          <div className="medical-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-bold text-[11px] uppercase tracking-wider text-[#07215A]">
                Privacy Scopes
              </h3>
              <span className="font-mono text-[10px] text-[#0062FF] bg-[#EBF4FF] px-2 py-0.5 rounded-full font-semibold">Active</span>
            </div>
            <p className="text-xs text-[#4A6588] leading-relaxed">
              Assessment scope active for this private session only.
            </p>
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="font-mono text-[11px] text-[#0062FF] font-bold hover:underline cursor-pointer block mt-1"
              >
                Manage consent scopes →
              </button>
            )}
          </div>
          <div className="medical-card p-4 space-y-3">
            <div className="border-b border-[#E2ECF8] pb-2">
              <h3 className="font-mono font-bold text-[11px] uppercase tracking-wider text-[#07215A]">
                Recorded Answers
              </h3>
              {coreCount && (
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-[#4A6588]">Core facts</span>
                  <span className="font-mono font-bold text-[#0062FF] bg-[#EBF4FF] px-2 py-0.5 rounded-full text-[11px]">
                    {coreCount.done} / {coreCount.total}
                  </span>
                </div>
              )}
            </div>

            {recordedFacts.length === 0 ? (
              <p className="text-xs font-mono text-[#829AB8] py-2">
                Answers will appear here as they are recorded.
              </p>
            ) : (
              <ul className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1 no-scrollbar">
                {recordedFacts.map(fact => {
                  const source = SOURCE_LABELS[fact.sourceType] ?? fact.sourceType;
                  return (
                    <li
                      key={fact.id}
                      className="border-b border-[#E2ECF8]/70 pb-2 last:border-0 space-y-0.5 text-xs"
                    >
                      <p className="text-[#829AB8] truncate">{fact.question}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-[#07215A]">
                          {fact.answerLabel}
                        </span>
                        {fact.onEdit && (
                          <button
                            type="button"
                            onClick={fact.onEdit}
                            className="text-[10px] text-[#0062FF] font-semibold hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <p className="font-mono text-[9px] text-[#829AB8]">
                        {fact.status} · {source}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-[9px] font-mono text-[#829AB8] border-t border-[#E2ECF8] pt-2">
              Session storage only · Erased upon Quick Exit.
            </p>
          </div>
        </aside>
      </div>

      {/* ── Mobile iOS-style Bottom Sheet for Recorded Facts & Steps ── */}
      {mobileSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          {/* Blurred backdrop */}
          <div
            className="fixed inset-0 bg-[#07215A]/40 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setMobileSheetOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet panel */}
          <div
            className="relative bg-white rounded-t-3xl max-h-[82dvh] flex flex-col overflow-hidden shadow-2xl sheet-animate border-t border-[#BAD6FE]"
            style={{ boxShadow: '0 -10px 40px rgba(7,33,90,0.2)' }}
          >
            {/* Grab handle bar */}
            <div className="w-full flex items-center justify-center pt-3 pb-2 cursor-grab">
              <div className="w-10 h-1.5 rounded-full bg-[#CBD5E1]" />
            </div>

            {/* Sheet header */}
            <div className="px-5 py-3 border-b border-[#E2ECF8] flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#07215A]">Your Session Snapshot</h3>
                <p className="text-xs text-[#829AB8] font-mono">
                  Stage {currentStepIndex + 1} of {STEP_DEFINITIONS.length} · {percentComplete}% complete
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F6F9FF] border border-[#E2ECF8] text-[#4A6588] font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
              >
                ✕
              </button>
            </div>

            {/* Sheet content */}
            <div className="overflow-y-auto p-5 space-y-5 no-scrollbar safe-bottom">
              {/* Steps overview */}
              <div className="p-3.5 rounded-2xl bg-[#F6F9FF] border border-[#E2ECF8] space-y-2">
                <span className="text-[11px] font-mono font-bold text-[#829AB8] uppercase tracking-wider">
                  Session Steps
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {STEP_DEFINITIONS.map((step, idx) => {
                    const isPast = idx < currentStepIndex;
                    const isCurrent = idx === currentStepIndex;
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-2 p-2 rounded-xl text-xs ${
                          isCurrent
                            ? 'bg-[#0062FF] text-white font-bold'
                            : isPast
                            ? 'bg-white text-[#0062FF] font-medium border border-[#BAD6FE]'
                            : 'text-[#829AB8]'
                        }`}
                      >
                        <span className="text-[10px] font-mono font-bold">
                          {isPast ? '✓' : idx + 1}
                        </span>
                        <span className="truncate">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recorded facts */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono text-xs font-bold text-[#07215A] uppercase tracking-wider">
                    Recorded Answers ({recordedFacts.length})
                  </h4>
                  {coreCount && (
                    <span className="font-mono text-xs text-[#0062FF] bg-[#EBF4FF] px-2 py-0.5 rounded-full font-bold">
                      {coreCount.done}/{coreCount.total} core
                    </span>
                  )}
                </div>

                {recordedFacts.length === 0 ? (
                  <p className="text-xs text-[#829AB8] py-4 text-center">
                    No answers recorded yet in this round.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
                    {recordedFacts.map(fact => (
                      <div
                        key={fact.id}
                        className="p-3 rounded-xl bg-white border border-[#E2ECF8] space-y-1"
                      >
                        <p className="text-xs text-[#829AB8] truncate">{fact.question}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#07215A]">{fact.answerLabel}</span>
                          {fact.onEdit && (
                            <button
                              type="button"
                              onClick={() => { fact.onEdit?.(); setMobileSheetOpen(false); }}
                              className="text-xs text-[#0062FF] font-semibold underline cursor-pointer"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick actions inside sheet */}
              <div className="space-y-2 pt-2">
                {onOpenLab && (
                  <button
                    type="button"
                    onClick={() => { onOpenLab(); setMobileSheetOpen(false); }}
                    className="btn-pill-secondary w-full py-3 text-xs font-bold"
                  >
                    + Enter Semen Analysis Lab Values
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  className="btn-pill-primary w-full py-3 text-xs font-bold"
                >
                  Return to Questionnaire
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
