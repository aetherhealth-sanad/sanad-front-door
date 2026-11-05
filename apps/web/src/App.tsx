import { useState, useEffect } from 'react';
import { api } from './api/client';
import { Navbar } from './components/Navbar';
import { MockBadge } from './components/MockBadge';
import { StartScreen } from './pages/StartScreen';
import { ConsentScreen } from './pages/ConsentScreen';
import { SafetyScreen } from './pages/SafetyScreen';
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
    setCaseId(storedId);
    api.getCaseState(storedId)
      .then(state => {
        if (!mounted) return;
        if (state.route === '/urgent.html') {
          window.location.replace('/urgent.html');
          return;
        }
        setCurrentRoute(state.route);
      })
      .catch(() => {
        sessionStorage.removeItem('sanad_case_id');
        sessionStorage.removeItem('sanad_session_token');
        sessionStorage.removeItem('sanad_case_start_mode');
        sessionStorage.removeItem('sanad_case_fixture_id');
        if (mounted) {
          setCaseId(null);
          setCurrentRoute('/');
        }
      })
      .finally(() => { if (mounted) setRestoring(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      let token: string | null = null;
      try { token = sessionStorage.getItem('sanad_session_token'); } catch { /* Still clear the restored page. */ }
      document.getElementById('root')?.replaceChildren();
      for (const storageName of ['sessionStorage', 'localStorage'] as const) {
        for (const key of ['sanad_session_token', 'sanad_staff_token', 'sanad_staff_role', 'sanad_case_id', 'sanad_case_start_mode', 'sanad_case_fixture_id']) {
          try { window[storageName].removeItem(key); } catch { /* Still redirect without storage access. */ }
        }
      }
      if (token && navigator.sendBeacon) {
        try { navigator.sendBeacon('/api/session/end', JSON.stringify({ session_token: token })); } catch { /* Redirect remains available offline. */ }
      }
      window.location.replace('about:blank');
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let mounted = true;
    navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => { if (mounted) setEmergencyCacheReady(true); })
      .catch(() => { if (mounted) setEmergencyCacheReady(false); });
    return () => { mounted = false; };
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
    if (token && navigator.sendBeacon) navigator.sendBeacon('/api/session/end', JSON.stringify({ session_token: token }));
    for (const key of ['sanad_session_token', 'sanad_staff_token', 'sanad_staff_role', 'sanad_case_id', 'sanad_case_start_mode', 'sanad_case_fixture_id']) {
      sessionStorage.removeItem(key);
    }
    setCaseId(null);
    setCurrentRoute('/');
    setCurrentRole('patient');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-sky-100 selection:text-sky-900">
      {/* Top Banner Alert for Emergency */}
      <UrgentLink variant="banner" />

      {/* Main Navbar */}
      <Navbar
        currentRole={currentRole}
        onRoleSelect={(role) => setCurrentRole(role)}
        caseId={caseId}
      />

      {/* Step Progress Indicator (Patient Flow) */}
      {currentRole === 'patient' && (
        <StepProgress currentRoute={currentRoute} />
      )}

      {/* Main Content Viewport */}
      <main className="flex-1">
        {restoring && <div className="max-w-md mx-auto px-4 py-20 text-center text-sm text-slate-600">Restoring this session…</div>}
        {!restoring && currentRole === 'clinician' && (
          <ClinicianPortal />
        )}

        {!restoring && currentRole === 'facility' && (
          <MockFacilityPortal />
        )}

        {!restoring && currentRole === 'patient' && (
          <>
            {currentRoute === '/' && (
              <StartScreen onCaseCreated={handleCaseCreated} emergencyCacheReady={emergencyCacheReady} />
            )}

            {currentRoute === '/consent' && caseId && (
              <ConsentScreen
                caseId={caseId}
                onConsentComplete={navigateTo}
              />
            )}

            {currentRoute === '/education' && (
              <EducationScreen
                onNewSession={resetSession}
              />
            )}

            {currentRoute === '/privacy' && (
              <section className="max-w-2xl mx-auto px-4 py-12">
                <MockBadge label="SESSION CONSENT STATE" />
                <h1 className="text-2xl font-bold text-slate-900 mt-4">Assessment consent is no longer active</h1>
                <p className="text-sm text-slate-600 mt-2">This case cannot continue through the assessment flow. You can close this session or start a new one.</p>
                <button type="button" onClick={resetSession} className="mt-5 rounded-lg bg-slate-900 text-white px-4 py-2 font-semibold">Close session</button>
              </section>
            )}

            {currentRoute === '/lab' && (
              <section className="max-w-2xl mx-auto px-4 py-12">
                <MockBadge label="MOCK CASE OBSERVATIONS" />
                <h1 className="text-2xl font-bold text-slate-900 mt-4">Lab entry is a P1 feature</h1>
                <p className="text-sm text-slate-600 mt-2">Manual lab entry is outside the current P0 flow. This Mock case may include synthetic observations; you can continue to the structured questions.</p>
                <button type="button" onClick={() => navigateTo('/intake')} className="mt-5 rounded-lg bg-sky-700 text-white px-4 py-2 font-semibold">Continue to questions</button>
              </section>
            )}

            {currentRoute === '/safety' && caseId && (
              <SafetyScreen
                caseId={caseId}
                onSafetyPass={navigateTo}
              />
            )}

            {currentRoute === '/intake' && caseId && (
              <IntakeScreen
                caseId={caseId}
                onAssessmentComplete={navigateTo}
              />
            )}

            {currentRoute === '/result' && caseId && (
              <ResultScreen
                caseId={caseId}
                onProceedToReferral={navigateTo}
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
              <TrackingScreen caseId={caseId} onRouteChange={navigateTo} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="font-semibold text-slate-700">Sanad (سند) · Future Health 2026</span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="font-mono text-[11px] text-slate-400">Prototype v0.4 · Synthetic Fixtures</span>
          </div>

          <div className="flex items-center gap-4">
            <a href="/urgent.html" className="text-rose-600 hover:text-rose-800 font-semibold no-underline">
              Emergency Care (Offline)
            </a>
            <button
              type="button"
              onClick={() => {
                resetSession();
              }}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
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
