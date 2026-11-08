import { useEffect, useState } from 'react';
import {
  api,
  type GateDecision,
  type MockFacility,
  type NavigationEpisode,
  type ReportData,
} from '../api/client';
import { MockBadge } from '../components/MockBadge';

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
      <div className="max-w-md mx-auto px-4 py-20 text-center text-sm font-mono text-[#3F4E48]">
        Loading Mock directory and gate status…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310]">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <MockBadge label="MOCK REFERRAL GATE · EVALUATE_GATE" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
          Mock Care Navigation & Gate Evaluation
        </h1>
        <p className="text-sm sm:text-base text-[#3F4E48] mt-1.5 leading-relaxed">
          The backend evaluates active provider consent, a current simulated review approval, and the policy check for the selected Mock destination.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm font-medium"
        >
          {error}
        </div>
      )}

      <section className="dossier-card bg-white p-6 sm:p-8 mb-6 space-y-4">
        <div className="pb-3 border-b border-[#0B1310] flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#0B1310]">
            Select a Mock destination
          </h2>
          <span className="font-mono text-xs text-[#3F4E48]">
            {facilities.length} ELIGIBLE
          </span>
        </div>

        {facilities.length === 0 && (
          <p className="text-sm text-[#3F4E48]">
            No eligible Mock destinations were returned by the directory.
          </p>
        )}

        <div className="space-y-3">
          {facilities.map(facility => {
            const selected = selectedFacilityId === facility.mock_facility_id;
            return (
              <label
                key={facility.mock_facility_id}
                className={`flex items-start gap-3 rounded-[2px] border p-4 cursor-pointer transition-colors ${
                  selected
                    ? 'border-[#0F523E] bg-[#E6F2EE]'
                    : 'border-[#0B1310] bg-[#F3F4F1] hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="mock-facility"
                  checked={selected}
                  onChange={() => void handleSelectFacility(facility.mock_facility_id)}
                  className="mt-1 accent-[#0F523E]"
                />
                <span>
                  <span className="block text-sm font-bold text-[#0B1310]">
                    {facility.name} · Mock
                  </span>
                  <span className="block text-xs font-mono text-[#3F4E48] mt-1">
                    {facility.care_type} · {facility.mock_facility_id}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {gate && (
        <section className="dossier-card bg-white p-6 sm:p-8 mb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#0B1310]">
            <h2 className="text-base font-extrabold text-[#0B1310]">
              Backend gate result: {gate.decision}
            </h2>
            <span
              className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-[2px] border ${
                gate.decision === 'ALLOW'
                  ? 'bg-[#0F523E] text-white border-[#0B1310]'
                  : 'bg-[#FFFBEB] text-[#78350F] border-[#B45309]'
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
                className="flex items-center justify-between gap-3 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-3 text-sm"
              >
                <span className="font-semibold text-[#0B1310]">{label}</span>
                <span
                  className={`font-mono text-xs font-bold ${
                    passed ? 'text-[#0F523E]' : 'text-[#C84B31]'
                  }`}
                >
                  {passed ? 'Passed' : 'Not passed'}
                </span>
              </div>
            ))}
          </div>

          {gate.reason_codes.length > 0 && (
            <p className="text-xs font-mono text-[#C84B31] font-semibold">
              Gate reasons: {gate.reason_codes.join(', ')}
            </p>
          )}
          <p className="text-xs font-mono text-[#3F4E48]">
            Policy version {gate.policy_version} · evaluated{' '}
            {new Date(gate.evaluated_at).toLocaleString()}
          </p>
        </section>
      )}

      {gate && !gate.conditions.user_consent.passed && (
        <button
          type="button"
          onClick={onConsentSettings}
          className="mb-6 px-4 py-2.5 rounded-[2px] bg-white border border-[#0B1310] text-xs font-mono font-bold text-[#0F523E] underline cursor-pointer btn-press"
        >
          Review provider sharing consent →
        </button>
      )}

      {navigation && (
        <section className="dossier-card bg-white p-6 sm:p-8 mb-6 space-y-5">
          <div>
            <MockBadge label="MOCK CARE NAVIGATION · SESSION SCOPED" />
            <h2 className="text-base font-extrabold text-[#0B1310] mt-3">
              Optional journey feedback (J9 / J10)
            </h2>
            <p className="text-xs text-[#3F4E48] mt-1 leading-relaxed">
              Acknowledgement is separate from booking or a visit. Progress is self-reported and unverified. Session data is deleted when this session ends or expires.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-4">
            <div>
              <span className="text-sm font-bold text-[#0B1310]">
                Acknowledge the displayed guidance
              </span>
              <p className="text-xs text-[#3F4E48]">
                This action records acknowledgement only.
              </p>
            </div>
            <button
              type="button"
              disabled={savingNavigation || navigation.acknowledged}
              onClick={() => void handleAcknowledge()}
              className="px-4 py-2 rounded-[2px] bg-[#0F523E] text-white font-mono text-xs font-bold border border-[#0B1310] cursor-pointer disabled:bg-[#E6EAE4] disabled:text-[#3F4E48]"
            >
              {navigation.acknowledged ? 'Acknowledged' : 'Acknowledge'}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2.5">
              Optional self-reported status
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                  className="p-3 rounded-[2px] border border-[#0B1310] bg-[#F3F4F1] text-sm font-medium text-left hover:bg-[#E6F2EE] cursor-pointer disabled:opacity-60"
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-xs font-mono text-[#3F4E48]">
              {navigation.progress_events.map((event, index) => (
                <li key={`${event.status}-${index}`}>
                  {event.status.replace(/_/g, ' ')} · {event.verification_source} ·{' '}
                  {new Date(event.occurred_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-[#C5CEC9] space-y-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase">
                Optional barriers
              </h3>
              <p className="text-xs text-[#3F4E48] mt-1">
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
                    className={`px-3 py-1.5 rounded-[2px] border font-mono text-xs cursor-pointer ${
                      active
                        ? 'bg-[#0B1310] text-white border-[#0B1310] font-bold'
                        : 'bg-[#F3F4F1] text-[#0B1310] border-[#0B1310] hover:bg-[#E6EAE4]'
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
              className="text-xs font-mono font-bold text-[#0F523E] underline cursor-pointer disabled:opacity-50"
            >
              Save optional barrier feedback
            </button>
            {navigation.barrier_reports.map((item, index) => (
              <p key={index} className="text-xs font-mono text-[#3F4E48]">
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
        className="w-full py-4 px-6 rounded-[2px] font-mono font-bold text-sm bg-[#0F523E] hover:bg-[#093B2C] text-white border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer disabled:bg-[#E6EAE4] disabled:text-[#63736C] disabled:shadow-none disabled:cursor-not-allowed"
      >
        {dispatching ? 'Creating Mock referral…' : 'Create Mock referral →'}
      </button>
      <p className="text-xs font-mono text-center text-[#3F4E48] mt-3">
        This creates a synthetic record inside this prototype. It sends nothing to a real clinic.
      </p>
    </div>
  );
};
