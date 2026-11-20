import { useState, useEffect } from 'react';
import {
  api,
  ApiRequestError,
  type PatientReviewProfile,
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
import {
  SessionDashboard,
  type RecordedFactItem,
  type SessionStep,
} from './components/SessionDashboard';

export function App() {
  const [currentRole, setCurrentRole] = useState<'patient' | 'clinician' | 'facility'>('patient');
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [restoring, setRestoring] = useState(() => Boolean(sessionStorage.getItem('sanad_case_id')));
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [reviewProfile, setReviewProfile] = useState<PatientReviewProfile | null>(null);
  const [reviewProfileError, setReviewProfileError] = useState<string | null>(null);
  const [reviewRefresh, setReviewRefresh] = useState(0);
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
        setRestoreError(null);
        setCurrentRoute(state.route);
      })
      .catch(err => {
        if (!mounted) return;
        if (err instanceof ApiRequestError && [401, 404].includes(err.status)) {
          clearPendingUploadFile();
          sessionStorage.removeItem('sanad_case_id');
          sessionStorage.removeItem('sanad_session_token');
          sessionStorage.removeItem('sanad_case_start_mode');
          sessionStorage.removeItem('sanad_case_fixture_id');
          setCaseId(null);
          setCurrentRoute('/');
        } else {
          setRestoreError('The service could not restore your session. Your local session was kept.');
        }
      })
      .finally(() => {
        if (mounted) setRestoring(false);
      });
    return () => {
      mounted = false;
    };
  }, [restoreAttempt]);

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


  // Patient review always reads current persisted facts, not the open-question list.
  useEffect(() => {
    if (!caseId || currentRoute !== '/review') return;
    let mounted = true;
    setReviewProfile(null);
    setReviewProfileError(null);
    api.getReviewProfile(caseId)
      .then(result => { if (mounted) setReviewProfile(result); })
      .catch(err => {
        if (mounted) setReviewProfileError(
          err instanceof Error ? err.message : 'Could not load saved profile.',
        );
      });
    return () => { mounted = false; };
  }, [caseId, currentRoute, reviewRefresh]);

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
    setReviewProfile(null);
    setRestoreError(null);
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
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-[#F8FAFC] flex flex-col font-sans text-[#0B1310] selection:bg-[#0062FF]/20">
      {/* Main Navbar */}
      <Navbar
        currentRole={currentRole}
        onRoleSelect={role => setCurrentRole(role)}
        caseId={caseId}
        onCloseCase={caseId ? () => void handleCloseCase() : undefined}
      />

      {/* Step Progress Indicator (Patient Flow) */}
      {currentRole === 'patient' && (
        <StepProgress
          currentRoute={currentRoute}
          onNavigate={navigateTo}
          canEnterObservations={Boolean(caseId)}
        />
      )}

      {/* Main Content Viewport */}
      <main className="flex-1">
        {restoring && (
          /* ── Beautiful restore loading state ── */
          <div className="min-h-[60dvh] flex flex-col items-center justify-center px-4 py-20 gap-6">
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-full bg-[#0062FF]/10 scale-150 animate-ping" style={{ animationDuration: '2s' }} />
              {/* Logo mark */}
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0062FF] to-[#4FA8FF] text-white flex items-center justify-center font-bold text-3xl shadow-lg shadow-[#0062FF]/30">
                س
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-semibold text-[#07215A]">Restoring your session…</p>
              <div className="dot-pulse flex gap-1 justify-center text-[#0062FF]">
                <span /><span /><span />
              </div>
            </div>
            {/* Skeleton preview */}
            <div className="w-full max-w-sm space-y-3 opacity-50">
              <div className="skeleton h-4 w-3/4 mx-auto" />
              <div className="skeleton h-3 w-1/2 mx-auto" />
            </div>
          </div>
        )}

        {!restoring && restoreError && (
          <section role="alert" className="max-w-xl mx-auto p-6 my-12 bg-white border rounded-xl">
            <h2 className="font-bold">Connection interrupted</h2>
            <p className="mt-2 text-sm">{restoreError}</p>
            <button type="button" className="mt-4 btn-pill-primary px-4 py-2"
              onClick={() => { setRestoring(true); setRestoreAttempt(a => a + 1); }}>
              Retry session restore
            </button>
            <a href="/urgent.html" className="ml-4 underline text-sm">Emergency Care</a>
          </section>
        )}
        {!restoring && !restoreError && currentRole === 'clinician' && <ClinicianPortal />}
        {!restoring && !restoreError && currentRole === 'facility' && <MockFacilityPortal />}

        {!restoring && !restoreError && currentRole === 'patient' && (
          /* Page transition wrapper */
          <div key={pageKey} className="page-enter">
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
                <div className="medical-card bg-white p-6 sm:p-8 rounded-2xl border border-[#E2ECF8] shadow-md">
                  <span className="font-mono text-xs font-bold text-[#D92D20] bg-[#FFF1F0] px-2.5 py-0.5 rounded-full border border-[#FFCCC7]">
                    CONSENT INACTIVE
                  </span>
                  <h1 className="text-2xl font-extrabold text-[#07215A] mt-4">
                    Assessment consent is no longer active
                  </h1>
                  <p className="text-sm text-[#4A6588] mt-2 leading-relaxed">
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
                    profile={reviewProfile}
                    profileError={reviewProfileError}
                    onRetryProfile={() => setReviewRefresh(i => i + 1)}
                    onCorrectAnswer={async answer => {
                      if (!caseId || !reviewProfile) throw new Error('Profile is still loading.');
                      await api.correctReviewAnswer(caseId, reviewProfile.case_version, answer);
                      setReviewRefresh(i => i + 1);
                    }}
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

      {/* Footer - minimal, mobile-friendly */}
      <footer className="border-t border-[#E2ECF8]/60 bg-white/80 backdrop-blur-sm py-5 text-xs text-[#4A6588]">
        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4 text-center sm:text-left">
            <span className="font-bold text-[#07215A] text-sm">Sanad (سند)</span>
            <span className="font-mono text-[10px] text-[#829AB8] leading-relaxed">
              Research Prototype · Synthetic Data Only · Not a Medical Device
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono">
            <a
              href="/urgent.html"
              className="text-[#D92D20] hover:text-[#B42318] font-bold no-underline transition-colors duration-150 flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D92D20] bio-pulse-soft inline-block" />
              Emergency Care
            </a>
            <button
              type="button"
              onClick={resetSession}
              className="text-[#4A6588] hover:text-[#07215A] font-semibold underline cursor-pointer transition-colors duration-150"
            >
              Reset Session
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
