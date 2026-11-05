import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface SafetyScreenProps {
  caseId: string;
  onSafetyPass: () => void;
}

export const SafetyScreen: React.FC<SafetyScreenProps> = ({
  caseId,
  onSafetyPass
}) => {
  const [checking, setChecking] = useState(true);
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [triggerRule, setTriggerRule] = useState<string | null>(null);
  const [checkUnavailable, setCheckUnavailable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    setChecking(true);
    setCheckUnavailable(false);
    api.runSafetyCheck(caseId)
      .then(res => {
        if (!mounted) return;
        setChecking(false);
        if (res.emergency_triggered) {
          setEmergencyTriggered(true);
          setTriggerRule(res.trigger_rule || 'DRAFT-EMERG-01');
        }
      })
      .catch(() => {
        if (!mounted) return;
        setChecking(false);
        // Never present an unavailable safety check as a clear result.
        setCheckUnavailable(true);
      });

    return () => { mounted = false; };
  }, [caseId, retryCount]);

  if (checking) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-block w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-slate-900">Running Pre-assessment Safety Rules...</h2>
        <p className="text-xs text-slate-500 mt-1">Verifying absence of acute emergency triggers</p>
      </div>
    );
  }

  if (emergencyTriggered) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-6 sm:p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-rose-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
            !
          </div>
          <span className="text-xs font-mono font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
            RULE TRIGGERED: {triggerRule}
          </span>
          <h1 className="text-2xl font-bold text-rose-950 mt-3 mb-2">
            Acute Warning Signs Detected
          </h1>
          <p className="text-sm text-rose-800 leading-relaxed mb-6">
            The profile indicators suggest acute symptoms (such as severe scrotal pain, fever, or injury). For your safety, online triage cannot proceed.
          </p>

          <div className="space-y-3">
            <a
              href="/urgent.html"
              className="w-full inline-block py-3.5 px-6 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md transition-all btn-press no-underline"
            >
              Open Emergency Care Guidance Now →
            </a>
            <p className="text-xs text-rose-600">
              Emergency guidance works offline and provides verified hospital contact channels.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checkUnavailable) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">Safety check unavailable</h1>
          <p className="text-sm mt-2 leading-relaxed">
            The safety check could not be completed. Please retry before continuing with the assessment.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setRetryCount(count => count + 1)}
              className="w-full py-3 px-5 rounded-xl font-semibold text-white bg-sky-600 hover:bg-sky-700 cursor-pointer"
            >
              Retry safety check
            </button>
            <a
              href="/urgent.html"
              className="text-sm font-semibold text-rose-700 underline"
            >
              Open emergency guidance
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center text-2xl mx-auto mb-5">
        ✓
      </div>
      <div className="inline-flex items-center gap-2 mb-2">
        <MockBadge label="SAFETY PRE-CHECK PASSED" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        Safety Check Clear
      </h1>
      <p className="text-sm text-slate-600 mt-2 mb-8 leading-relaxed">
        No immediate acute red flags were triggered. You may now proceed to answer contextual questions regarding your health history and goals.
      </p>

      <button
        type="button"
        onClick={onSafetyPass}
        className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all btn-press cursor-pointer"
      >
        Continue to Questions →
      </button>
    </div>
  );
};
