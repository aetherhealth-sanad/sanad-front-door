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
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-5 sm:py-8">
      {/* Session line */}
      <div className="mb-6 flex items-center justify-between gap-3 font-mono text-[11px] text-[#8A8C84]">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-[#1A1F1C]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3F7D5C] glow-pulse" aria-hidden="true" />
            Session {caseId.slice(0, 8).toUpperCase()}
          </span>
          <span aria-hidden="true">/</span>
          <span>{STEP_DEFINITIONS[currentStepIndex]?.label ?? 'In progress'}</span>
          <span aria-hidden="true" className="hidden sm:inline">/</span>
          <span className="hidden sm:inline">Screening, not diagnosis</span>
        </p>

        <button
          type="button"
          onClick={() => setMobileSheetOpen(true)}
          className="lg:hidden inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-[#D6D0C2] bg-[#FBFAF6] text-[12px] text-[#1A1F1C] active:translate-y-px transition-transform cursor-pointer"
        >
          Recorded
          <span className="font-mono text-[10px] px-1.5 rounded bg-[#1A1F1C] text-[#F4F1EA] tabular">{recordedFacts.length}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-6 xl:gap-10 items-start">
        <section className="min-w-0 w-full" aria-label="Active workspace">
          {children}
        </section>

        {/* Case file */}
        <aside className="hidden lg:block lg:sticky lg:top-24" aria-label="Session summary">
          <div className="index-card overflow-hidden">
            <div className="bg-[#1E2622] text-[#F4F1EA] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#A9B3AC]">Summary status</p>
              <p className="font-serif text-2xl mt-1 leading-tight">{summaryStatus}</p>
              {coreCount && coreCount.total > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between font-mono text-[10px] text-[#A9B3AC] mb-1.5">
                    <span>Core questions</span>
                    <span className="tabular">
                      {coreCount.done} / {coreCount.total}
                    </span>
                  </div>
                  <div className="h-[3px] bg-[#3A4540] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F4F1EA] transition-[width] duration-500 ease-[var(--ease-out)]"
                      style={{ width: `${percentComplete}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[13px] font-medium text-[#1A1F1C]">Recorded so far</h3>
                <span className="font-mono text-[11px] text-[#8A8C84] tabular">{recordedFacts.length}</span>
              </div>

              {recordedFacts.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-[#D6D0C2] px-4 py-5 text-center">
                  <p className="text-[13px] text-[#575C55]">Nothing yet.</p>
                  <p className="font-mono text-[11px] text-[#8A8C84] mt-1">Each answer lands here as you give it.</p>
                </div>
              ) : (
                <ul className="mt-2 max-h-[38vh] overflow-y-auto pr-1 -mr-1 divide-y divide-[#E4DFD3]">
                  {recordedFacts.map(fact => {
                    const source = SOURCE_LABELS[fact.sourceType] ?? fact.sourceType;
                    const soft = fact.status !== 'Answered';
                    return (
                      <li key={fact.id} className="py-2.5 chat-bubble-enter group">
                        <p className="text-[12px] text-[#8A8C84] truncate" title={fact.question}>
                          {fact.question}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className={`text-[14px] ${soft ? 'text-[#575C55] italic' : 'text-[#1A1F1C] font-medium'}`}>
                            {fact.answerLabel}
                          </span>
                          {fact.onEdit && (
                            <button
                              type="button"
                              onClick={fact.onEdit}
                              className="text-[11px] text-[#575C55] hover:text-[#1A1F1C] underline underline-offset-2 decoration-[#D6D0C2] cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-[#8A8C84] mt-0.5">
                          {fact.status} · {source}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {onOpenLab && (
              <div className="px-5 py-4 border-t border-[#E4DFD3] flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1A1F1C]">Lab values</p>
                  <p className="text-[12px] text-[#8A8C84]">Optional, any time</p>
                </div>
                <button type="button" onClick={onOpenLab} className="btn-pill-secondary !min-h-[34px] !py-1 px-3 text-[12px]">
                  Add values
                </button>
              </div>
            )}

            <div className="px-5 py-3 border-t border-[#E4DFD3] bg-[#F7F5EF] flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-[#8A8C84]">Assessment consent · on</p>
              {onOpenPrivacy && (
                <button
                  type="button"
                  onClick={onOpenPrivacy}
                  className="font-mono text-[10px] text-[#1A1F1C] underline underline-offset-2 decoration-[#D6D0C2] cursor-pointer"
                >
                  Manage
                </button>
              )}
            </div>
          </div>
          <p className="mt-3 px-1 font-mono text-[10px] text-[#8A8C84] leading-relaxed">
            Kept for this session only. Quick exit clears it from the tab. Draft rules · CLINICAL_TBD.
          </p>
        </aside>
      </div>

      {/* ── Mobile iOS-style Bottom Sheet for Recorded Facts & Steps ── */}
      {mobileSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          {/* Blurred backdrop */}
          <div
            className="fixed inset-0 bg-[#1A1F1C]/40 backdrop-blur-sm modal-backdrop-animate"
            onClick={() => setMobileSheetOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet panel */}
          <div
            className="relative bg-[#FBFAF6] rounded-t-2xl max-h-[82dvh] flex flex-col overflow-hidden shadow-[var(--shadow-3)] sheet-animate border-t border-[#C8D6CC]"
            style={{ boxShadow: '0 -10px 40px rgba(60,48,30,0.2)' }}
          >
            {/* Grab handle bar */}
            <div className="w-full flex items-center justify-center pt-3 pb-2 cursor-grab">
              <div className="w-10 h-1.5 rounded-full bg-[#D6D0C2]" />
            </div>

            {/* Sheet header */}
            <div className="px-5 py-3 border-b border-[#E4DFD3] flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#1A1F1C]">Your session</h3>
                <p className="text-xs text-[#8A8C84] font-mono">
                  Stage {currentStepIndex + 1} of {STEP_DEFINITIONS.length} · {percentComplete}% complete
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F7F5EF] border border-[#E4DFD3] text-[#575C55] font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
              >
                ✕
              </button>
            </div>

            {/* Sheet content */}
            <div className="overflow-y-auto p-5 space-y-5 no-scrollbar safe-bottom">
              {/* Steps overview */}
              <div className="p-3.5 rounded-2xl bg-[#F7F5EF] border border-[#E4DFD3] space-y-2">
                <span className="text-[11px] font-mono font-bold text-[#8A8C84] uppercase tracking-wider">
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
                            ? 'bg-[#1F4D3F] text-white font-bold'
                            : isPast
                            ? 'bg-[#FBFAF6] text-[#1F4D3F] font-medium border border-[#C8D6CC]'
                            : 'text-[#8A8C84]'
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
                  <h4 className="font-mono text-xs font-bold text-[#1A1F1C] uppercase tracking-wider">
                    Recorded so far ({recordedFacts.length})
                  </h4>
                  {coreCount && (
                    <span className="font-mono text-xs text-[#1F4D3F] bg-[#E8EFEA] px-2 py-0.5 rounded-full font-bold">
                      {coreCount.done}/{coreCount.total} core
                    </span>
                  )}
                </div>

                {recordedFacts.length === 0 ? (
                  <p className="text-xs text-[#8A8C84] py-4 text-center">
                    No answers recorded yet in this round.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
                    {recordedFacts.map(fact => (
                      <div
                        key={fact.id}
                        className="p-3 rounded-xl bg-[#FBFAF6] border border-[#E4DFD3] space-y-1"
                      >
                        <p className="text-xs text-[#8A8C84] truncate">{fact.question}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#1A1F1C]">{fact.answerLabel}</span>
                          {fact.onEdit && (
                            <button
                              type="button"
                              onClick={() => { fact.onEdit?.(); setMobileSheetOpen(false); }}
                              className="text-xs text-[#1F4D3F] font-semibold underline cursor-pointer"
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
                    Add lab values
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  className="btn-pill-primary w-full py-3 text-xs font-bold"
                >
                  Back to questions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
