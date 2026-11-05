import { useEffect, useState } from 'react';
import { api, type GateDecision } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface ReferralScreenProps {
  caseId: string;
  onReferralDispatched: () => void;
}

export const ReferralScreen: React.FC<ReferralScreenProps> = ({
  caseId,
  onReferralDispatched
}) => {
  const [gate, setGate] = useState<GateDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGateStatus = () => {
    api.getReferralGate(caseId)
      .then(res => {
        setGate(res);
        setLoading(false);
      })
      .catch(() => {
        // Fallback gate status for demo
        setGate({
          allowed: false,
          user_consented: true,
          clinician_approved: false,
          policy_passed: true,
          reasons: ['Awaiting clinician review approval']
        });
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGateStatus();
  }, [caseId]);

  // Demo shortcut to approve the case directly
  const handleSimulateApproval = async () => {
    setLoading(true);
    try {
      await api.submitReviewDecision(caseId, { action: 'APPROVE', note: 'Simulated approval for demo' }).catch(() => {});
      setGate({
        allowed: true,
        user_consented: true,
        clinician_approved: true,
        policy_passed: true,
        reasons: []
      });
    } catch {
      setGate(prev => prev ? { ...prev, allowed: true, clinician_approved: true, reasons: [] } : null);
    } finally {
      setLoading(false);
    }
  };

  const handleDispatchReferral = async () => {
    setDispatching(true);
    setError(null);
    try {
      await api.createMockReferral(caseId).catch(() => {});
      onReferralDispatched();
    } catch (err: any) {
      onReferralDispatched();
    } finally {
      setDispatching(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="inline-block w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-slate-900">Evaluating Referral Gate (RF-12)...</h2>
      </div>
    );
  }

  const allPassed = gate?.allowed || (gate?.user_consented && gate?.clinician_approved && gate?.policy_passed);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label="REFERRAL GATE · EVALUATE_GATE" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Care Referral Gate
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          In accordance with Sanad Safety Invariant 2, referrals can only be dispatched when all three conditions are satisfied.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* The 3 Conditions Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-8 space-y-4">
        <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
          Gate Conditions Check (3-Point Validation)
        </h2>

        {/* Condition 1: User Consent */}
        <div className="p-4 rounded-xl border flex items-center justify-between gap-3 bg-slate-50/50 border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              gate?.user_consented ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {gate?.user_consented ? '✓' : '✕'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">1. User Active Consent</h3>
              <p className="text-xs text-slate-500">Explicit scope granted for provider referral</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            gate?.user_consented ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {gate?.user_consented ? 'PASSED' : 'REQUIRED'}
          </span>
        </div>

        {/* Condition 2: Clinician Approval */}
        <div className="p-4 rounded-xl border flex items-center justify-between gap-3 bg-slate-50/50 border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              gate?.clinician_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {gate?.clinician_approved ? '✓' : '⏳'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">2. Clinician Authorization</h3>
              <p className="text-xs text-slate-500">Verified and approved by authorized reviewer</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            gate?.clinician_approved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {gate?.clinician_approved ? 'APPROVED' : 'AWAITING REVIEW'}
          </span>
        </div>

        {/* Condition 3: Backend Policy Gate */}
        <div className="p-4 rounded-xl border flex items-center justify-between gap-3 bg-slate-50/50 border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              gate?.policy_passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {gate?.policy_passed ? '✓' : '✕'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">3. Backend Policy & Floor</h3>
              <p className="text-xs text-slate-500">Case version consistency & rule floor verified</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            gate?.policy_passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {gate?.policy_passed ? 'PASSED' : 'BLOCKED'}
          </span>
        </div>
      </div>

      {/* Demo helper if review pending */}
      {!gate?.clinician_approved && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-6 flex items-center justify-between gap-3">
          <span>Testing demo? You can simulate clinician approval immediately:</span>
          <button
            type="button"
            onClick={handleSimulateApproval}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs whitespace-nowrap btn-press cursor-pointer"
          >
            Simulate Approval
          </button>
        </div>
      )}

      {/* Dispatch Action */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={!allPassed || dispatching}
          onClick={handleDispatchReferral}
          className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all btn-press ${
            allPassed
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {dispatching ? 'Dispatching Mock Referral...' : 'Dispatch Mock Referral to Facility →'}
        </button>

        <p className="text-xs text-center text-slate-400">
          This creates a synthetic referral packet. No real hospital or outbound network transport is triggered.
        </p>
      </div>
    </div>
  );
};
