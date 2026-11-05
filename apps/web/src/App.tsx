import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
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
  const [caseId, setCaseId] = useState<string | null>(() => {
    return sessionStorage.getItem('sanad_case_id');
  });

  useEffect(() => {
    // If case ID exists in storage, stay aligned
    const storedId = sessionStorage.getItem('sanad_case_id');
    if (storedId && !caseId) {
      setCaseId(storedId);
    }
  }, [caseId]);

  const handleCaseCreated = (newCaseId: string, nextRoute: string) => {
    setCaseId(newCaseId);
    setCurrentRoute(nextRoute || '/consent');
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
        {currentRole === 'clinician' && (
          <ClinicianPortal
            currentCaseId={caseId}
            onDecisionSubmitted={() => {}}
          />
        )}

        {currentRole === 'facility' && (
          <MockFacilityPortal
            currentCaseId={caseId}
            onEventEmitted={() => {}}
          />
        )}

        {currentRole === 'patient' && (
          <>
            {currentRoute === '/' && (
              <StartScreen onCaseCreated={handleCaseCreated} />
            )}

            {currentRoute === '/consent' && caseId && (
              <ConsentScreen
                caseId={caseId}
                onConsentComplete={(nextRoute) => setCurrentRoute(nextRoute)}
              />
            )}

            {currentRoute === '/education' && (
              <EducationScreen
                onReconsiderConsent={() => setCurrentRoute('/consent')}
              />
            )}

            {currentRoute === '/safety' && caseId && (
              <SafetyScreen
                caseId={caseId}
                onSafetyPass={() => setCurrentRoute('/intake')}
              />
            )}

            {currentRoute === '/intake' && caseId && (
              <IntakeScreen
                caseId={caseId}
                onAssessmentComplete={() => setCurrentRoute('/result')}
              />
            )}

            {currentRoute === '/result' && caseId && (
              <ResultScreen
                caseId={caseId}
                onProceedToReferral={() => setCurrentRoute('/referral')}
              />
            )}

            {currentRoute === '/referral' && caseId && (
              <ReferralScreen
                caseId={caseId}
                onReferralDispatched={() => setCurrentRoute('/tracking')}
              />
            )}

            {currentRoute === '/tracking' && caseId && (
              <TrackingScreen caseId={caseId} />
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
                sessionStorage.clear();
                localStorage.clear();
                setCaseId(null);
                setCurrentRoute('/');
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
