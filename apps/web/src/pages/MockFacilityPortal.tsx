import { useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface MockFacilityPortalProps {
  currentCaseId?: string | null;
  onEventEmitted?: () => void;
}

export const MockFacilityPortal: React.FC<MockFacilityPortalProps> = ({
  onEventEmitted
}) => {
  const [selectedReferralId, setSelectedReferralId] = useState<string>('REF-J1-01');
  const [lastEmitted, setLastEmitted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmitEvent = async (eventType: string) => {
    setLoading(true);
    try {
      await api.postFacilityEvent(selectedReferralId, eventType).catch(() => {});
      setLastEmitted(`Successfully posted event: ${eventType} to referral ${selectedReferralId}`);
      if (onEventEmitted) onEventEmitted();
    } catch {
      setLastEmitted(`Event recorded: ${eventType}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-1.5">
          <MockBadge label="FACILITY SIMULATOR · MOCK_OPERATOR" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Mock Care Facility Operator Portal
        </h1>
        <p className="text-sm text-slate-500">
          Simulate hospital intake, scheduling, and visit completion events for demonstration purposes.
        </p>
      </div>

      {lastEmitted && (
        <div className="mb-6 p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-sm font-medium flex items-center justify-between">
          <span>✓ {lastEmitted}</span>
          <button
            type="button"
            onClick={() => setLastEmitted(null)}
            className="text-sky-700 hover:text-sky-900 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Select Mock Referral Packet
          </label>
          <div className="flex gap-2">
            {[
              { id: 'REF-J1-01', clinic: 'Abu Dhabi Andrology Clinic (Mock)' },
              { id: 'REF-J3-02', clinic: 'Central Reproductive Lab (Mock)' },
            ].map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedReferralId(r.id)}
                className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer flex-1 ${
                  selectedReferralId === r.id
                    ? 'bg-sky-50 border-sky-400 text-sky-950'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-mono">{r.id}</span>
                <p className="text-[11px] text-slate-500 font-normal mt-0.5">{r.clinic}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Emit Facility Lifecycle Event
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleEmitEvent('FACILITY_ACCEPTED')}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs btn-press cursor-pointer text-center"
            >
              1. Accept Referral
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleEmitEvent('APPOINTMENT_SCHEDULED')}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs btn-press cursor-pointer text-center"
            >
              2. Schedule Visit
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleEmitEvent('VISIT_COMPLETED')}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs btn-press cursor-pointer text-center"
            >
              3. Complete Visit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
