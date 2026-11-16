import { useEffect, useState } from 'react';
import { LoadingView } from '../components/LoadingView';
import {
  api,
  type GateDecision,
  type MockFacility,
  type NavigationEpisode,
  type ReportData,
} from '../api/client';

interface ReferralScreenProps {
  caseId: string;
  onReferralDispatched: (route: string) => void;
  onConsentSettings: () => void;
}

type ProgressStatus =
  | 'BOOKING_SELF_REPORTED'
  | 'VISIT_SELF_REPORTED'
  | 'UNABLE_TO_PROCEED'
  | 'DEFERRED'
  | 'DECLINED'
  | 'NO_UPDATE';
type BarrierCode =
  | 'PRIVACY_CONCERN'
  | 'LANGUAGE_BARRIER'
  | 'COST_CONCERN'
  | 'SERVICE_UNCLEAR'
  | 'SCHEDULE_CONSTRAINT'
  | 'NOT_READY'
  | 'OTHER';
type BarrierChoice = BarrierCode | 'PREFER_NOT_TO_SAY';

const idempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `nav-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const ReferralScreen: React.FC<ReferralScreenProps> = ({
  caseId,
  onReferralDispatched,
  onConsentSettings,
}) => {
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
        const rep = await api.getReport(caseId);
        const directory = await api.getMockDirectory(rep.next_step?.action);
        if (!mounted) return;
        setReport(rep);
        setFacilities(directory.facilities);
        const first = directory.facilities[0]?.mock_facility_id ?? '';
        setSelectedFacilityId(first);
        if (first) setGate(await api.getReferralGate(caseId, first));
        else setGate(null);
        if (rep.guidance_id && rep.guidance_version) {
          setNavigation(await api.getNavigation(caseId));
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Mock referral information is unavailable.',
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [caseId]);

  const handleSelectFacility = async (facilityId: string) => {
    setSelectedFacilityId(facilityId);
    setGate(null);
    setError(null);
    try {
      setGate(await api.getReferralGate(caseId, facilityId));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The Mock referral gate could not be read.',
      );
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
      setError(
        err instanceof Error
          ? err.message
          : 'The Mock referral was not created.',
      );
      try {
        setGate(await api.getReferralGate(caseId, selectedFacilityId));
      } catch {
        /* Preserve the action error. */
      }
    } finally {
      setDispatching(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!report?.guidance_id || !report.guidance_version) return;
    setSavingNavigation(true);
    setError(null);
    try {
      setNavigation(
        await api.acknowledgeNavigation(
          caseId,
          report.guidance_id,
          report.guidance_version,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Mock acknowledgement was not recorded.',
      );
    } finally {
      setSavingNavigation(false);
    }
  };

  const handleProgress = async (status: ProgressStatus) => {
    setSavingNavigation(true);
    setError(null);
    try {
      setNavigation(
        await api.reportNavigationProgress(caseId, status, idempotencyKey()),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Mock progress was not recorded.',
      );
    } finally {
      setSavingNavigation(false);
    }
  };

  const toggleBarrier = (code: BarrierChoice) => {
    if (code === 'PREFER_NOT_TO_SAY') {
      setSelectedBarriers([]);
      setPreferNotToSay(value => !value);
    } else {
      setPreferNotToSay(false);
      setSelectedBarriers(previous =>
        previous.includes(code)
          ? previous.filter(item => item !== code)
          : [...previous, code],
      );
    }
  };

  const handleSaveBarriers = async () => {
    if (!selectedBarriers.length && !preferNotToSay) return;
    setSavingNavigation(true);
    setError(null);
    try {
      setNavigation(
        await api.reportNavigationBarriers(
          caseId,
          selectedBarriers,
          preferNotToSay,
          idempotencyKey(),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Mock barrier feedback was not recorded.',
      );
    } finally {
      setSavingNavigation(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-reveal-1">
        <LoadingView
          title="Loading Care Directory & Referral Gate"
          subtitle="Verifying provider gate rules and consent scopes…"
          variant="card"
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 sm:py-12 space-y-8">
      <div className="mb-6 pb-6 border-b border-[#E4DFD3]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-mono font-bold text-[#1F4D3F] bg-[#E8EFEA] px-2.5 py-0.5 rounded-full border border-[#C8D6CC]">
            CARE NAVIGATION
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1F1C] tracking-tight">
          Optional referral
        </h1>
        <p className="text-sm sm:text-base text-[#575C55] mt-1.5 leading-relaxed">
          The backend evaluates active provider consent, a current simulated review approval, and the policy check for the selected Mock destination.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FBEDEA] border border-[#F0C9C2] text-[#B3261E] text-sm font-semibold"
        >
          {error}
        </div>
      )}

      <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-4">
        <div className="pb-3 border-b border-[#E4DFD3] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1A1F1C]">
            Select a Mock destination
          </h2>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#E8EFEA] text-[#163A2F]">
            {facilities.length} ELIGIBLE
          </span>
        </div>

        {facilities.length === 0 && (
          <p className="text-sm text-[#575C55]">
            No eligible Mock destinations were returned by the directory.
          </p>
        )}

        <div className="space-y-3">
          {facilities.map(facility => {
            const selected = selectedFacilityId === facility.mock_facility_id;
            return (
              <label
                key={facility.mock_facility_id}
                className={`flex items-start gap-3.5 rounded-2xl border p-4 sm:p-5 cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] ${
                  selected
                    ? 'border-[#C8D6CC] bg-[#F7F5EF] shadow-xs'
                    : 'border-[#E4DFD3] bg-[#F7F5EF] hover:border-[#D6D0C2]'
                }`}
              >
                <input
                  type="radio"
                  name="mock-facility"
                  checked={selected}
                  onChange={() => void handleSelectFacility(facility.mock_facility_id)}
                  className="mt-1 accent-[#1F4D3F] h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-bold text-[#1A1F1C]">
                    {facility.name} · Mock
                  </span>
                  <span className="block text-xs text-[#575C55] mt-1">
                    {facility.care_type} · {facility.mock_facility_id}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {gate && (
        <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E4DFD3]">
            <h2 className="text-base font-bold text-[#1A1F1C]">
              Backend gate result: {gate.decision}
            </h2>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                gate.decision === 'ALLOW'
                  ? 'bg-[#E8EFEA] text-[#163A2F] border-[#C8D6CC]'
                  : 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]'
              }`}
            >
              {gate.decision}
            </span>
          </div>

          <div className="space-y-2.5">
            {(
              [
                ['Active provider consent', gate.conditions.user_consent.passed],
                [
                  'Current simulated reviewer approval',
                  gate.conditions.clinician_approval.passed,
                ],
                [
                  'Backend policy and destination',
                  gate.conditions.backend_policy.passed,
                ],
              ] as const
            ).map(([label, passed]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 rounded-xl bg-[#F7F5EF] border border-[#E4DFD3] p-3.5 text-sm"
              >
                <span className="font-semibold text-[#1A1F1C]">{label}</span>
                <span
                  className={`text-xs font-bold ${
                    passed ? 'text-[#163A2F]' : 'text-[#B3261E]'
                  }`}
                >
                  {passed ? '✓ Passed' : '✕ Not passed'}
                </span>
              </div>
            ))}
          </div>

          {gate.reason_codes.length > 0 && (
            <p className="text-xs text-[#B3261E] font-semibold">
              Gate reasons: {gate.reason_codes.join(', ')}
            </p>
          )}
          <p className="text-xs text-[#575C55]">
            Policy version {gate.policy_version} · evaluated{' '}
            {new Date(gate.evaluated_at).toLocaleString()}
          </p>
        </section>
      )}

      {gate && !gate.conditions.user_consent.passed && (
        <button
          type="button"
          onClick={onConsentSettings}
          className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold text-[#1F4D3F] cursor-pointer"
        >
          Review provider sharing consent →
        </button>
      )}

      {navigation && (
        <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#1A1F1C]">
              Optional journey feedback (J9 / J10)
            </h2>
            <p className="text-xs text-[#575C55] mt-1 leading-relaxed">
              Acknowledgement is separate from booking or a visit. Progress is self-reported and unverified. Session data is deleted when this session ends or expires.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-[#F7F5EF] border border-[#E4DFD3] p-5">
            <div>
              <span className="text-sm font-bold text-[#1A1F1C]">
                Acknowledge the displayed guidance
              </span>
              <p className="text-xs text-[#575C55]">
                This action records acknowledgement only.
              </p>
            </div>
            <button
              type="button"
              disabled={savingNavigation || navigation.acknowledged}
              onClick={() => void handleAcknowledge()}
              className="btn-pill-primary px-5 py-2 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {navigation.acknowledged ? '✓ Acknowledged' : 'Acknowledge'}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide mb-3">
              Optional self-reported status
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ['BOOKING_SELF_REPORTED', 'I booked an appointment'],
                  ['VISIT_SELF_REPORTED', 'I attended a visit'],
                  ['UNABLE_TO_PROCEED', 'I could not proceed'],
                  ['DEFERRED', 'I am deferring'],
                  ['DECLINED', 'I do not want to continue'],
                  ['NO_UPDATE', 'No update'],
                ] as const
              ).map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  disabled={savingNavigation}
                  onClick={() => void handleProgress(status)}
                  className="p-3.5 rounded-xl border border-[#E4DFD3] bg-[#F7F5EF] text-sm font-medium text-left hover:border-[#1F4D3F] hover:bg-[#E8EFEA] cursor-pointer transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-60"
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-[#575C55]">
              {navigation.progress_events.map((event, index) => (
                <li key={`${event.status}-${index}`}>
                  {event.status.replace(/_/g, ' ')} · {event.verification_source} ·{' '}
                  {new Date(event.occurred_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-[#E4DFD3] space-y-3">
            <div>
              <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide">
                Optional barriers
              </h3>
              <p className="text-xs text-[#575C55] mt-1">
                Choose any that apply, or leave unanswered.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['PRIVACY_CONCERN', 'Privacy concern'],
                  ['LANGUAGE_BARRIER', 'Language barrier'],
                  ['COST_CONCERN', 'Cost concern'],
                  ['SERVICE_UNCLEAR', 'Service unclear'],
                  ['SCHEDULE_CONSTRAINT', 'Schedule constraint'],
                  ['NOT_READY', 'Not ready'],
                  ['OTHER', 'Other'],
                  ['PREFER_NOT_TO_SAY', 'Prefer not to say'],
                ] as const
              ).map(([code, label]) => {
                const active =
                  code === 'PREFER_NOT_TO_SAY'
                    ? preferNotToSay
                    : selectedBarriers.includes(code as BarrierCode);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={active}
                    disabled={savingNavigation}
                    onClick={() => toggleBarrier(code)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-[background-color,border-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer ${
                      active
                        ? 'bg-[#1F4D3F] text-white border-[#1F4D3F] shadow-xs'
                        : 'bg-[#FBFAF6] text-[#575C55] border-[#D6D0C2] hover:bg-[#F7F5EF]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={savingNavigation || (!selectedBarriers.length && !preferNotToSay)}
              onClick={() => void handleSaveBarriers()}
              className="btn-pill-secondary px-5 py-2 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50 mt-2"
            >
              Save optional barrier feedback
            </button>
            {navigation.barrier_reports.map((item, index) => (
              <p key={index} className="text-xs text-[#575C55]">
                Mock barrier response:{' '}
                {item.prefer_not_to_say
                  ? 'PREFER_NOT_TO_SAY'
                  : item.barrier_reasons.join(', ')}
              </p>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        disabled={gate?.decision !== 'ALLOW' || dispatching || !selectedFacilityId}
        onClick={() => void handleDispatchReferral()}
        className="btn-pill-primary w-full py-4 px-8 rounded-full font-bold text-sm text-white shadow-[var(--shadow-2)] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{dispatching ? 'Creating Mock referral...' : 'Create Mock referral'}</span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>
      <p className="text-xs text-center text-[#575C55] mt-3">
        This creates a synthetic record inside this prototype. It sends nothing to a real clinic.
      </p>
    </div>
  );
};
