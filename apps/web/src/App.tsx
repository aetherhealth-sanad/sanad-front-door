import { useState, useEffect } from 'react';
import {
  api,
  clearPendingUploadFile,
  type QuestionItem,
  type ObservationRecord,
  type IntakeAnswer,
  type PsychosocialQuestion,
} from './api/client';
import { Navbar } from './components/Navbar';
import { StartScreen } from './pages/StartScreen';
import { ConsentScreen } from './pages/ConsentScreen';
import { SafetyScreen } from './pages/SafetyScreen';
import { LabScreen } from './pages/LabScreen';
import { IntakeScreen } from './pages/IntakeScreen';
import { ReviewProfileScreen } from './pages/ReviewProfileScreen';
import { SubmitReceiptScreen } from './pages/SubmitReceiptScreen';
import { ResultScreen } from './pages/ResultScreen';
import { ReferralScreen } from './pages/ReferralScreen';
import { TrackingScreen } from './pages/TrackingScreen';
import { EducationScreen } from './pages/EducationScreen';
import { ClinicianPortal } from './pages/ClinicianPortal';
import { MockFacilityPortal } from './pages/MockFacilityPortal';
import { StepProgress } from './components/StepProgress';
import { StoryBanner } from './components/StoryBanner';
import {
  SessionDashboard,
  type RecordedFactItem,
  type SessionStep,
} from './components/SessionDashboard';

export function App() {
  const [currentRole, setCurrentRole] = useState<'patient' | 'clinician' | 'facility'>('patient');
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [restoring, setRestoring] = useState(() => Boolean(sessionStorage.getItem('sanad_case_id')));
  // Track route changes for page transitions
  const [pageKey, setPageKey] = useState(0);
  const [emergencyCacheReady, setEmergencyCacheReady] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(() => {
    return sessionStorage.getItem('sanad_case_id');
  });

  // Recorded facts & session data
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [recordedAnswers, setRecordedAnswers] = useState<
    Record<
      string,
      {
        choice: string;
        value?: boolean | number | string | null;
        temporal_status?: string | null;
        label: string;
        source?: string;
      }
    >
  >({});
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [psychQuestions, setPsychQuestions] = useState<PsychosocialQuestion[]>([]);
  const [psychAnswers, setPsychAnswers] = useState<Record<string, string>>({});
  const [isSubmittingAssessment, setIsSubmittingAssessment] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [receiptReady, setReceiptReady] = useState(false);

  // Restore session from sessionStorage
  useEffect(() => {
    const storedId = sessionStorage.getItem('sanad_case_id');
    if (!storedId) return;
    let mounted = true;
    api
      .getCaseState(storedId)
      .then(state => {
        if (!mounted) return;
        if (state.route === '/urgent.html') {
          window.location.replace('/urgent.html');
          return;
        }
        setCurrentRoute(state.route);
      })
      .catch(() => {
        clearPendingUploadFile();
        sessionStorage.removeItem('sanad_case_id');
        sessionStorage.removeItem('sanad_session_token');
        sessionStorage.removeItem('sanad_case_start_mode');
        sessionStorage.removeItem('sanad_case_fixture_id');
        if (mounted) {
          setCaseId(null);
          setCurrentRoute('/');
        }
      })
      .finally(() => {
        if (mounted) setRestoring(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch session data (questions, observations, psychosocial) whenever caseId is active
  useEffect(() => {
    if (!caseId) return;
    let mounted = true;
    Promise.all([
      api.getQuestions(caseId).catch(() => null),
      api.getObservations(caseId).catch(() => null),
      api.getPsychosocialQuestions().catch(() => null),
    ]).then(([questionsRes, obsRes, psychRes]) => {
      if (!mounted) return;
      if (questionsRes) setQuestions(questionsRes.questions);
      if (obsRes) setObservations(obsRes.observations);
      if (psychRes) setPsychQuestions(psychRes.questions);
    });

    return () => {
      mounted = false;
    };
  }, [caseId, currentRoute]);

  // Handle pageshow / bfcache wipe for confidential privacy
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      let token: string | null = null;
      try {
        token = sessionStorage.getItem('sanad_session_token');
      } catch {
        /* Still clear the restored page. */
      }
      clearPendingUploadFile();
      document.getElementById('root')?.replaceChildren();
      for (const storageName of ['sessionStorage', 'localStorage'] as const) {
        for (const key of [
          'sanad_session_token',
          'sanad_staff_token',
          'sanad_staff_role',
          'sanad_case_id',
          'sanad_case_start_mode',
          'sanad_case_fixture_id',
        ]) {
          try {
            window[storageName].removeItem(key);
          } catch {
            /* Still redirect without storage access. */
          }
        }
      }
      if (token && navigator.sendBeacon) {
        try {
          navigator.sendBeacon(
            '/api/session/end',
            JSON.stringify({ session_token: token }),
          );
        } catch {
          /* Redirect remains available offline. */
        }
      }
      const target = navigator.onLine ? 'https://www.google.com' : 'about:blank';
      window.location.replace(target);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Service worker registration
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let mounted = true;
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (mounted) setEmergencyCacheReady(true);
      })
      .catch(() => {
        if (mounted) setEmergencyCacheReady(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const navigateTo = (route: string) => {
    if (route === '/urgent.html') {
      window.location.assign('/urgent.html');
      return;
    }
    setPageKey(k => k + 1); // trigger re-mount for page-enter animation
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setCurrentRoute(route || '/');
  };

  const handleCaseCreated = (newCaseId: string, nextRoute: string) => {
    setCaseId(newCaseId);
    navigateTo(nextRoute || '/consent');
  };

  const resetSession = () => {
    const token = sessionStorage.getItem('sanad_session_token');
    clearPendingUploadFile();
    if (token && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/session/end',
        JSON.stringify({ session_token: token }),
      );
    }
    for (const key of [
      'sanad_session_token',
      'sanad_staff_token',
      'sanad_staff_role',
      'sanad_case_id',
      'sanad_case_start_mode',
      'sanad_case_fixture_id',
    ]) {
      sessionStorage.removeItem(key);
    }
    setCaseId(null);
    setRecordedAnswers({});
    setQuestions([]);
    setObservations([]);
    setPsychAnswers({});
    setCurrentRoute('/');
    setCurrentRole('patient');
  };

  const handleCloseCase = async () => {
    if (!caseId) {
      resetSession();
      return;
    }
    try {
      const nextState = await api.closeCase(caseId);
      if (nextState.route === '/') {
        resetSession();
      } else {
        navigateTo(nextState.route);
      }
    } catch {
      resetSession();
    }
  };

  const handleAnswerRecorded = (question: QuestionItem, answer: IntakeAnswer, label: string) => {
    setRecordedAnswers(prev => ({
      ...prev,
      [question.question_id]: {
        choice: answer.choice,
        value: answer.value,
        temporal_status: answer.temporal_status,
        label,
        source: 'Intake chat',
      },
    }));
  };

  const handleSubmitAssessment = async () => {
    if (!caseId) return;
    setIsSubmittingAssessment(true);
    setAssessmentError(null);
    setReceiptReady(false);
    navigateTo('/receipt');

    try {
      const entryPath =
        (sessionStorage.getItem('sanad_case_entry_path') as 'FULL_INTAKE' | 'LAB_ONLY') ||
        'FULL_INTAKE';
      const result = await api.assessCase(caseId, entryPath);
      if (result.state.route === '/urgent.html') {
        window.location.replace('/urgent.html');
        return;
      }
      setReceiptReady(true);
      setTimeout(() => {
        navigateTo(result.state.route || '/result');
        setIsSubmittingAssessment(false);
      }, 1200);
    } catch (err) {
      setAssessmentError(err instanceof Error ? err.message : 'Could not submit assessment.');
      setIsSubmittingAssessment(false);
      navigateTo('/review');
    }
  };

  // Convert recorded facts for dashboard right rail
  const recordedFactsList: RecordedFactItem[] = [
    ...Object.entries(recordedAnswers).map(([qId, ans]) => {
      const q = questions.find(item => item.question_id === qId);
      return {
        id: qId,
        question: q?.text || qId,
        answerLabel: ans.label,
        sourceType: ans.source || 'PATIENT_REPORTED',
        status: (ans.choice === 'NOT_SURE'
          ? 'Not sure'
          : ans.choice === 'PREFER_NOT_TO_ANSWER'
          ? 'Prefer not to say'
          : 'Answered') as RecordedFactItem['status'],
        onEdit: () => navigateTo('/review'),
      };
    }),
    ...observations.map(obs => ({
      id: obs.observation_id,
      question: `Lab: ${obs.test_code.toUpperCase()}`,
      answerLabel: obs.value !== null ? `${obs.value} ${obs.unit || ''}` : 'Recorded',
      sourceType: 'OBSERVATION',
      status: 'Unverified' as RecordedFactItem['status'],
      onEdit: () => navigateTo('/lab'),
    })),
  ];

  // Core questions progress count
  const coreQuestions = questions.filter(q => q.blocking);
  const coreDoneCount = coreQuestions.filter(
    q => recordedAnswers[q.question_id] && recordedAnswers[q.question_id].choice !== 'NOT_ASKED',
  ).length;

  // Determine current session step for the dashboard left rail
  const getSessionStep = (): SessionStep => {
    if (currentRoute === '/consent') return 'consent';
    if (currentRoute === '/safety') return 'safety';
    if (currentRoute === '/intake' || currentRoute === '/lab') return 'questions';
    if (currentRoute === '/review') return 'review';
    if (currentRoute === '/receipt') return 'submit';
    if (currentRoute === '/result') return 'summary';
    return 'next_step';
  };

  const isInsideDashboard =
    Boolean(caseId) &&
    ['/safety', '/intake', '/lab', '/review', '/receipt'].includes(currentRoute);

  return (
    <div className="min-h-[100dvh] bg-[#F4F1EA] flex flex-col font-sans text-[#1A1F1C]">
      {/* Main Navbar */}
      <Navbar
        currentRole={currentRole}
        onRoleSelect={role => setCurrentRole(role)}
        caseId={caseId}
        onCloseCase={caseId ? () => void handleCloseCase() : undefined}
      />

      {/* Step Progress Indicator (Patient Flow) */}
      {currentRole === 'patient' && currentRoute !== '/' && (
        <StepProgress
          currentRoute={currentRoute}
          onNavigate={navigateTo}
          canEnterObservations={Boolean(caseId)}
        />
      )}

      {/* Main Content Viewport */}
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {restoring && (
          <div className="min-h-[60dvh] flex flex-col items-center justify-center px-4 py-20 gap-5" role="status">
            <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true" className="bio-pulse-soft">
              <rect width="32" height="32" rx="7" fill="#1A1F1C" />
              <path d="M9 21.5h14" stroke="#F4F1EA" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="13" r="4.5" fill="none" stroke="#F4F1EA" strokeWidth="2" />
              <circle cx="16" cy="13" r="1.4" fill="#7FB59C" />
            </svg>
            <p className="font-serif text-2xl text-[#1A1F1C]">Picking up where you left off…</p>
            <div className="w-full max-w-xs space-y-2.5">
              <div className="skeleton h-3 w-3/4 mx-auto" />
              <div className="skeleton h-3 w-1/2 mx-auto" />
            </div>
          </div>
        )}

        {!restoring && currentRole === 'clinician' && <ClinicianPortal />}
        {!restoring && currentRole === 'facility' && <MockFacilityPortal />}

        {!restoring && currentRole === 'patient' && (
          /* Page transition wrapper */
          <div key={pageKey} className="page-enter">
            {currentRoute !== '/' && caseId && (
              <StoryBanner
                route={currentRoute}
                coreDone={coreDoneCount}
                coreTotal={coreQuestions.length}
                factCount={recordedFactsList.length}
                labCount={observations.length}
              />
            )}

            {currentRoute === '/' && (
              <StartScreen
                onCaseCreated={handleCaseCreated}
                emergencyCacheReady={emergencyCacheReady}
              />
            )}

            {currentRoute === '/consent' && caseId && (
              <ConsentScreen
                caseId={caseId}
                onConsentComplete={navigateTo}
              />
            )}

            {currentRoute === '/education' && (
              <EducationScreen onNewSession={resetSession} />
            )}

            {currentRoute === '/privacy' && (
              <section className="max-w-2xl mx-auto px-4 py-12">
                <div className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)]">
                  <span className="font-mono text-xs font-bold text-[#B3261E] bg-[#FBEDEA] px-2.5 py-0.5 rounded-full border border-[#F0C9C2]">
                    CONSENT INACTIVE
                  </span>
                  <h1 className="text-2xl font-semibold text-[#1A1F1C] mt-4">
                    Assessment consent is no longer active
                  </h1>
                  <p className="text-sm text-[#575C55] mt-2 leading-relaxed">
                    This case cannot continue through the assessment flow. You can close this session or start a new one.
                  </p>
                  <button
                    type="button"
                    onClick={resetSession}
                    className="mt-5 btn-pill-primary px-5 py-2.5 text-xs font-bold"
                  >
                    Close session
                  </button>
                </div>
              </section>
            )}

            {/* Unified Session Dashboard Workspace */}
            {isInsideDashboard && caseId && (
              <SessionDashboard
                currentStep={getSessionStep()}
                caseId={caseId}
                coreCount={{ done: coreDoneCount, total: coreQuestions.length }}
                recordedFacts={recordedFactsList}
                summaryStatus={
                  currentRoute === '/receipt'
                    ? 'Processing…'
                    : currentRoute === '/review'
                    ? 'Review required'
                    : 'Not ready yet'
                }
                onOpenLab={() => navigateTo('/lab')}
                onOpenPrivacy={() => navigateTo('/privacy')}
              >
                {currentRoute === '/safety' && (
                  <SafetyScreen caseId={caseId} onSafetyPass={navigateTo} />
                )}

                {currentRoute === '/lab' && (
                  <LabScreen
                    caseId={caseId}
                    onContinueToIntake={() => navigateTo('/intake')}
                    onAssessmentComplete={navigateTo}
                  />
                )}

                {currentRoute === '/intake' && (
                  <IntakeScreen
                    caseId={caseId}
                    onAssessmentComplete={navigateTo}
                    onOpenLab={() => navigateTo('/lab')}
                    onNavigateToReview={() => navigateTo('/review')}
                    onAnswerRecorded={handleAnswerRecorded}
                  />
                )}

                {currentRoute === '/review' && (
                  <ReviewProfileScreen
                    caseId={caseId}
                    questions={questions}
                    answers={recordedAnswers}
                    observations={observations}
                    psychQuestions={psychQuestions}
                    psychAnswers={psychAnswers}
                    onEditQuestion={() => navigateTo('/intake')}
                    onOpenLab={() => navigateTo('/lab')}
                    onReturnToQuestions={() => navigateTo('/intake')}
                    onSubmitAssessment={handleSubmitAssessment}
                    isSubmitting={isSubmittingAssessment}
                    error={assessmentError}
                  />
                )}

                {currentRoute === '/receipt' && (
                  <SubmitReceiptScreen
                    caseId={caseId}
                    isReady={receiptReady}
                    onViewSummary={() => navigateTo('/result')}
                  />
                )}
              </SessionDashboard>
            )}

            {currentRoute === '/result' && caseId && (
              <ResultScreen
                caseId={caseId}
                onProceedToReferral={navigateTo}
                onOpenLab={() => navigateTo('/lab')}
                onOpenConsent={() => navigateTo('/consent')}
              />
            )}

            {currentRoute === '/referral' && caseId && (
              <ReferralScreen
                caseId={caseId}
                onReferralDispatched={navigateTo}
                onConsentSettings={() => navigateTo('/consent')}
              />
            )}

            {currentRoute === '/tracking' && caseId && (
              <TrackingScreen
                caseId={caseId}
                onRouteChange={navigateTo}
                onCloseCase={() => void handleCloseCase()}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-[#E4DFD3] bg-[#F4F1EA]">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 py-8 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-end">
          <div className="space-y-1.5">
            <p className="flex items-baseline gap-2">
              <span className="font-serif text-xl text-[#1A1F1C]">Sanad</span>
              <span className="text-sm text-[#8A8C84]" lang="ar">سند</span>
            </p>
            <p className="font-mono text-[11px] text-[#8A8C84] leading-relaxed max-w-[60ch]">
              Research prototype by AetherHealth · Synthetic data only · Not a medical device · Rules are drafts
              (CLINICAL_TBD)
            </p>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <a href="/urgent.html" className="text-[#8F1D17] no-underline inline-flex items-center gap-1.5 hover:underline underline-offset-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B3261E]" aria-hidden="true" />
              Urgent guidance
            </a>
            <button
              type="button"
              onClick={resetSession}
              className="text-[#575C55] hover:text-[#1A1F1C] underline underline-offset-4 decoration-[#D6D0C2] cursor-pointer transition-colors"
            >
              Reset session
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
