import { useEffect, useState } from 'react';
import { api, type TrackingTimeline } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface TrackingScreenProps {
  caseId: string;
}

export const TrackingScreen: React.FC<TrackingScreenProps> = ({ caseId }) => {
  const [tracking, setTracking] = useState<TrackingTimeline | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState<string>('');
  const [selectedBarriers, setSelectedBarriers] = useState<string[]>([]);
  const [barrierSaved, setBarrierSaved] = useState(false);

  useEffect(() => {
    const fetchTracking = () => {
      api.getTracking(caseId)
        .then(res => setTracking(res))
        .catch(() => {
          // Fallback tracking for synthetic demo
          setTracking({
            case_id: caseId,
            current_status: 'REFERRAL_DISPATCHED',
            is_delayed: false,
            events: [
              {
                event_id: 'EVT-01',
                event_type: 'REFERRAL_DISPATCHED',
                timestamp: new Date().toISOString(),
                description: 'Mock referral packet generated and queued for facility intake.',
                source: 'SYSTEM_EVENT',
              },
              {
                event_id: 'EVT-02',
                event_type: 'FACILITY_ACCEPTED',
                timestamp: new Date(Date.now() + 60000).toISOString(),
                description: 'Specialized Men’s Health Center acknowledged intake packet.',
                source: 'MOCK_FACILITY',
              },
            ],
          });
        });
    };

    fetchTracking();
    const interval = setInterval(fetchTracking, 10000);
    return () => clearInterval(interval);
  }, [caseId]);

  const handleAcknowledge = async () => {
    try {
      await api.acknowledgeNavigation(caseId);
      setAcknowledged(true);
    } catch {
      setAcknowledged(true);
    }
  };

  const handleProgressUpdate = async (status: string) => {
    setSelectedProgress(status);
    try {
      await api.reportNavigationProgress(caseId, status);
    } catch {}
  };

  const handleToggleBarrier = (code: string) => {
    setSelectedBarriers(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleSaveBarriers = async () => {
    try {
      await api.reportNavigationBarriers(caseId, selectedBarriers);
      setBarrierSaved(true);
    } catch {
      setBarrierSaved(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <MockBadge label="CASE TRACKING · SIMULATED LIFECYCLE" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Case Journey & Tracking
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Monitor your referral package status and voluntarily update your care journey progress.
        </p>
      </div>

      {/* Delayed Flag Banner (RF-14) */}
      {tracking?.is_delayed && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-700">⚠ STATUS: DELAYED</span>
            <span className="text-xs">Processing has exceeded the expected SLA threshold.</span>
          </div>
          <span className="text-xs font-mono bg-amber-200/80 px-2 py-0.5 rounded text-amber-800">FLAGGED</span>
        </div>
      )}

      {/* Timeline Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
          <h2 className="text-base font-bold text-slate-900">Referral Milestones</h2>
          <span className="text-xs font-mono text-slate-400">Polls every 10s</span>
        </div>

        <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
          {tracking?.events.map((evt, idx) => (
            <div key={idx} className="relative flex items-start gap-4 pl-1">
              <div className="w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold ring-4 ring-white z-10">
                ✓
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {evt.event_type.replace(/_/g, ' ')}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {evt.description}
                </p>
                <span className="inline-block mt-1 text-[10px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  Source: {evt.source}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Closed-Loop Navigation: Acknowledgement & Progress (J9 & J10) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-1">
            Voluntary Journey Progress (J9)
          </h2>
          <p className="text-xs text-slate-500">
            Tell us if you have accessed your guidance and your current intent. This is self-reported and never claims hospital-verified care.
          </p>
        </div>

        {/* Guidance Acknowledgement */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-semibold text-slate-800">
              Acknowledge guidance receipt
            </span>
            <p className="text-xs text-slate-500">Confirm you have read the clinical synthesis.</p>
          </div>
          <button
            type="button"
            disabled={acknowledged}
            onClick={handleAcknowledge}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              acknowledged
                ? 'bg-emerald-100 text-emerald-800 cursor-default'
                : 'bg-sky-600 hover:bg-sky-700 text-white btn-press cursor-pointer'
            }`}
          >
            {acknowledged ? '✓ Acknowledged' : 'Confirm Read'}
          </button>
        </div>

        {/* Progress Status Radio */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Your Next Step (Self-Reported):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'SEARCHING', label: 'Seeking Clinic' },
              { id: 'BOOKED', label: 'Appointment Set' },
              { id: 'DEFERRED', label: 'Deferred for Now' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleProgressUpdate(opt.id)}
                className={`p-3 rounded-lg border text-xs font-semibold text-left transition-all cursor-pointer ${
                  selectedProgress === opt.id
                    ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Care Barriers (J10) */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Encountering Care Barriers? (Optional, J10)
            </h3>
            <p className="text-xs text-slate-500">
              Select any factors delaying your next step. Non-diagnostic support.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { code: 'COST_AFFORDABILITY', label: 'Financial / Cost' },
              { code: 'PRIVACY_CONCERN', label: 'Privacy / Stigma' },
              { code: 'CLINIC_ACCESS_HOURS', label: 'Distance / Operating Hours' },
              { code: 'NOT_READY', label: 'Emotionally Not Ready' },
              { code: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
            ].map(barrier => {
              const active = selectedBarriers.includes(barrier.code);
              return (
                <button
                  key={barrier.code}
                  type="button"
                  onClick={() => handleToggleBarrier(barrier.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {barrier.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={barrierSaved}
            onClick={handleSaveBarriers}
            className="text-xs font-semibold text-sky-600 hover:text-sky-800 cursor-pointer pt-1"
          >
            {barrierSaved ? '✓ Preferences Saved' : 'Save barrier feedback'}
          </button>
        </div>
      </div>
    </div>
  );
};
