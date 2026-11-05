import { useEffect, useState } from 'react';
import { api, type GateDecision, type MockFacility, type NavigationEpisode, type ReportData } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface ReferralScreenProps {
  caseId: string;
  onReferralDispatched: (route: string) => void;
  onConsentSettings: () => void;
}

type ProgressStatus = 'BOOKING_SELF_REPORTED' | 'VISIT_SELF_REPORTED' | 'UNABLE_TO_PROCEED' | 'DEFERRED' | 'DECLINED' | 'NO_UPDATE';
type BarrierCode = 'PRIVACY_CONCERN' | 'LANGUAGE_BARRIER' | 'COST_CONCERN' | 'SERVICE_UNCLEAR' | 'SCHEDULE_CONSTRAINT' | 'NOT_READY' | 'OTHER';
type BarrierChoice = BarrierCode | 'PREFER_NOT_TO_SAY';
const idempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `nav-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const ReferralScreen: React.FC<ReferralScreenProps> = ({ caseId, onReferralDispatched, onConsentSettings }) => {
  const [facilities, setFacilities] = useState<MockFacility[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [navigation, setNavigation] = useState<NavigationEpisode | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [gate, setGate] = useState<GateDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [savingNavigation, setSavingNavigation] = useState(false);
  const [selectedBarriers, setSelectedBarriers] = useState<BarrierCode[]>([]);
  const [preferNotToSay, setPreferNotToSay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const report = await api.getReport(caseId);
        const directory = await api.getMockDirectory(report.next_step?.action);
        if (!mounted) return;
        setReport(report);
        setFacilities(directory.facilities);
        const first = directory.facilities[0]?.mock_facility_id ?? '';
        setSelectedFacilityId(first);
        if (first) setGate(await api.getReferralGate(caseId, first));
        else setGate(null);
        if (report.guidance_id && report.guidance_version) setNavigation(await api.getNavigation(caseId));
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Mock referral information is unavailable.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [caseId]);

  const handleSelectFacility = async (facilityId: string) => {
    setSelectedFacilityId(facilityId);
    setGate(null);
    setError(null);
    try {
      setGate(await api.getReferralGate(caseId, facilityId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Mock referral gate could not be read.');
    }
  };

  const handleDispatchReferral = async () => {
    if (!selectedFacilityId || gate?.decision !== 'ALLOW') return;
    setDispatching(true);
    setError(null);
    try {
      await api.createMockReferral(caseId, selectedFacilityId);
      const state = await api.getCaseState(caseId);
      onReferralDispatched(state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Mock referral was not created.');
      try { setGate(await api.getReferralGate(caseId, selectedFacilityId)); } catch { /* Preserve the action error. */ }
    } finally {
      setDispatching(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!report?.guidance_id || !report.guidance_version) return;
    setSavingNavigation(true);
    setError(null);
    try {
      setNavigation(await api.acknowledgeNavigation(caseId, report.guidance_id, report.guidance_version));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock acknowledgement was not recorded.');
    } finally { setSavingNavigation(false); }
  };

  const handleProgress = async (status: ProgressStatus) => {
    setSavingNavigation(true);
    setError(null);
    try {
      setNavigation(await api.reportNavigationProgress(caseId, status, idempotencyKey()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock progress was not recorded.');
    } finally { setSavingNavigation(false); }
  };

  const toggleBarrier = (code: BarrierChoice) => {
    if (code === 'PREFER_NOT_TO_SAY') {
      setSelectedBarriers([]);
      setPreferNotToSay(value => !value);
    } else {
      setPreferNotToSay(false);
      setSelectedBarriers(previous => previous.includes(code) ? previous.filter(item => item !== code) : [...previous, code]);
    }
  };

  const handleSaveBarriers = async () => {
    if (!selectedBarriers.length && !preferNotToSay) return;
    setSavingNavigation(true);
    setError(null);
    try {
      setNavigation(await api.reportNavigationBarriers(caseId, selectedBarriers, preferNotToSay, idempotencyKey()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock barrier feedback was not recorded.');
    } finally { setSavingNavigation(false); }
  };

  if (loading) return <div className="max-w-md mx-auto px-4 py-20 text-center text-sm text-slate-600">Loading Mock directory and gate status…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2"><MockBadge label="MOCK REFERRAL GATE · EVALUATE_GATE" /></div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Mock care navigation</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">The backend evaluates active provider consent, a current simulated review approval, and the policy check for the selected Mock destination.</p>
      </div>

      {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">{error}</div>}

      <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Select a Mock destination</h2>
        {facilities.length === 0 && <p className="text-sm text-slate-600">No eligible Mock destinations were returned by the directory.</p>}
        {facilities.map(facility => (
          <label key={facility.mock_facility_id} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${selectedFacilityId === facility.mock_facility_id ? 'border-sky-400 bg-sky-50' : 'border-slate-200'}`}>
            <input type="radio" name="mock-facility" checked={selectedFacilityId === facility.mock_facility_id} onChange={() => void handleSelectFacility(facility.mock_facility_id)} />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{facility.name} · Mock</span>
              <span className="block text-xs text-slate-500 mt-1">{facility.care_type} · {facility.mock_facility_id}</span>
            </span>
          </label>
        ))}
      </section>

      {gate && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Backend gate result: {gate.decision}</h2>
          {[
            ['Active provider consent', gate.conditions.user_consent.passed],
            ['Current simulated reviewer approval', gate.conditions.clinician_approval.passed],
            ['Backend policy and destination', gate.conditions.backend_policy.passed],
          ].map(([label, passed]) => (
            <div key={String(label)} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <span>{label}</span>
              <span className={passed ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-800'}>{passed ? 'Passed' : 'Not passed'}</span>
            </div>
          ))}
          {gate.reason_codes.length > 0 && <p className="text-xs text-slate-600">Gate reasons: {gate.reason_codes.join(', ')}</p>}
          <p className="text-xs text-slate-500">Policy version {gate.policy_version} · evaluated {new Date(gate.evaluated_at).toLocaleString()}</p>
        </section>
      )}

      {gate && !gate.conditions.user_consent.passed && (
        <button type="button" onClick={onConsentSettings} className="mb-6 text-sm font-semibold text-sky-700 underline">Review provider sharing consent</button>
      )}

      {navigation && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-6 space-y-5">
          <div><MockBadge label="MOCK CARE NAVIGATION · SESSION SCOPED" /><h2 className="text-base font-bold text-slate-900 mt-3">Optional journey feedback</h2><p className="text-xs text-slate-600 mt-1">Acknowledgement is separate from booking or a visit. Progress is self-reported and unverified. Session data is deleted when this session ends or expires.</p></div>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
            <div><span className="text-sm font-semibold">Acknowledge the displayed guidance</span><p className="text-xs text-slate-500">This action records acknowledgement only.</p></div>
            <button type="button" disabled={savingNavigation || navigation.acknowledged} onClick={() => void handleAcknowledge()} className="px-4 py-2 rounded-lg bg-sky-700 text-white text-xs font-bold disabled:bg-slate-200 disabled:text-slate-600">{navigation.acknowledged ? 'Acknowledged' : 'Acknowledge'}</button>
          </div>
          <div><h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Optional self-reported status</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{([
            ['BOOKING_SELF_REPORTED', 'I booked an appointment'], ['VISIT_SELF_REPORTED', 'I attended a visit'], ['UNABLE_TO_PROCEED', 'I could not proceed'], ['DEFERRED', 'I am deferring'], ['DECLINED', 'I do not want to continue'], ['NO_UPDATE', 'No update'],
          ] as const).map(([status, label]) => <button key={status} type="button" disabled={savingNavigation} onClick={() => void handleProgress(status)} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-left hover:border-sky-400 disabled:opacity-60">{label}</button>)}</div>
            <ul className="mt-3 space-y-1 text-xs text-slate-500">{navigation.progress_events.map((event, index) => <li key={`${event.status}-${index}`}>{event.status.replace(/_/g, ' ')} · {event.verification_source} · {new Date(event.occurred_at).toLocaleString()}</li>)}</ul>
          </div>
          <div className="pt-4 border-t border-slate-100 space-y-3"><div><h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Optional barriers</h3><p className="text-xs text-slate-500 mt-1">Choose any that apply, or leave unanswered.</p></div><div className="flex flex-wrap gap-2">{([
            ['PRIVACY_CONCERN', 'Privacy concern'], ['LANGUAGE_BARRIER', 'Language barrier'], ['COST_CONCERN', 'Cost concern'], ['SERVICE_UNCLEAR', 'Service unclear'], ['SCHEDULE_CONSTRAINT', 'Schedule constraint'], ['NOT_READY', 'Not ready'], ['OTHER', 'Other'], ['PREFER_NOT_TO_SAY', 'Prefer not to say'],
          ] as const).map(([code, label]) => { const active = code === 'PREFER_NOT_TO_SAY' ? preferNotToSay : selectedBarriers.includes(code as BarrierCode); return <button key={code} type="button" aria-pressed={active} disabled={savingNavigation} onClick={() => toggleBarrier(code)} className={`px-3 py-1.5 rounded-lg border text-xs ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{label}</button>; })}</div><button type="button" disabled={savingNavigation || (!selectedBarriers.length && !preferNotToSay)} onClick={() => void handleSaveBarriers()} className="text-xs text-sky-700 underline disabled:opacity-50">Save optional barrier feedback</button>{navigation.barrier_reports.map((item, index) => <p key={index} className="text-xs text-slate-500">Mock barrier response: {item.prefer_not_to_say ? 'PREFER_NOT_TO_SAY' : item.barrier_reasons.join(', ')}</p>)}</div>
        </section>
      )}

      <button
        type="button"
        disabled={gate?.decision !== 'ALLOW' || dispatching || !selectedFacilityId}
        onClick={() => void handleDispatchReferral()}
        className="w-full py-4 px-6 rounded-xl font-bold text-base bg-emerald-700 hover:bg-emerald-800 text-white disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
      >
        {dispatching ? 'Creating Mock referral…' : 'Create Mock referral'}
      </button>
      <p className="text-xs text-center text-slate-500 mt-3">This creates a synthetic record inside this prototype. It sends nothing to a real clinic.</p>
    </div>
  );
};
