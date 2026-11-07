import { useState, useEffect } from 'react';
import { api, clearPendingUploadFile } from './api/client';
import { Navbar } from './components/Navbar';
import { MockBadge } from './components/MockBadge';
import { StartScreen } from './pages/StartScreen';
import { ConsentScreen } from './pages/ConsentScreen';
import { SafetyScreen } from './pages/SafetyScreen';
import { LabScreen } from './pages/LabScreen';
import { IntakeScreen } from './pages/IntakeScreen';
import { ResultScreen } from './pages/ResultScreen';
import { ReferralScreen } from './pages/ReferralScreen';
import { TrackingScreen } from './pages/TrackingScreen';
import { EducationScreen } from './pages/EducationScreen';
import { ClinicianPortal } from './pages/ClinicianPortal';
import { MockFacilityPortal } from './pages/MockFacilityPortal';
import { UrgentLink } from './components/UrgentLink';
import { StepProgress } from './components/StepProgress';

export function App() {
  const [currentRole, setCurrentRole] = useState<'patient' | 'clinician' | 'facility'>('patient');
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [restoring, setRestoring] = useState(() => Boolean(sessionStorage.getItem('sanad_case_id')));
  const [emergencyCacheReady, setEmergencyCacheReady] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(() => {
    return sessionStorage.getItem('sanad_case_id');
  });

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
      window.location.replace('about:blank');
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

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

  return (
    <div className="min-h-[100dvh] bg-[#F3F4F1] flex flex-col font-sans text-[#0B1310] selection:bg-[#0F523E] selection:text-white">
      {/* Top Banner Alert for Emergency */}
      <UrgentLink variant="banner" />

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
          <div className="max-w-md mx-auto px-4 py-20 text-center text-sm font-mono text-[#3F4E48]">
            Restoring this session…
          </div>
        )}
        {!restoring && currentRole === 'clinician' && <ClinicianPortal />}

        {!restoring && currentRole === 'facility' && <MockFacilityPortal />}

        {!restoring && currentRole === 'patient' && (
          <>
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
                <div className="dossier-card bg-white p-6 sm:p-8">
                  <MockBadge label="SESSION CONSENT STATE" />
                  <h1 className="text-2xl font-extrabold text-[#0B1310] mt-4">
                    Assessment consent is no longer active
                  </h1>
                  <p className="text-sm text-[#3F4E48] mt-2 leading-relaxed">
                    This case cannot continue through the assessment flow. You can close this session or start a new one.
                  </p>
                  <button
                    type="button"
                    onClick={resetSession}
                    className="mt-5 rounded-[2px] bg-[#0B1310] text-white px-5 py-2.5 font-mono text-xs font-bold border border-[#0B1310] cursor-pointer btn-press"
                  >
                    Close session
                  </button>
                </div>
              </section>
            )}

            {currentRoute === '/lab' && caseId && (
              <LabScreen
                caseId={caseId}
                onContinueToIntake={() => navigateTo('/intake')}
                onAssessmentComplete={navigateTo}
              />
            )}

            {currentRoute === '/safety' && caseId && (
              <SafetyScreen caseId={caseId} onSafetyPass={navigateTo} />
            )}

            {currentRoute === '/intake' && caseId && (
              <IntakeScreen
                caseId={caseId}
                onAssessmentComplete={navigateTo}
                onOpenLab={() => navigateTo('/lab')}
              />
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
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#0B1310] bg-white py-6 text-xs text-[#3F4E48]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="font-bold text-[#0B1310]">
              Sanad (سند) · Future Health Digital Innovation Challenge
            </span>
            <span className="hidden sm:inline text-[#C5CEC9]">|</span>
            <span className="font-mono text-[11px] text-[#3F4E48]">
              Research Prototype · Synthetic Data Only · Zero Outbound Transport
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono">
            <a
              href="/urgent.html"
              className="text-[#B91C1C] hover:text-[#7F1D1D] font-bold no-underline"
            >
              Emergency Care (Offline)
            </a>
            <button
              type="button"
              onClick={resetSession}
              className="text-[#0B1310] hover:text-[#0F523E] font-semibold underline cursor-pointer"
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
