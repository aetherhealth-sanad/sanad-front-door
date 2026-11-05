import { useEffect, useState } from 'react';
import { api, type TrackingTimeline } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface TrackingScreenProps {
  caseId: string;
}

export const TrackingScreen: React.FC<TrackingScreenProps> = ({ caseId }) => {
  const [tracking, setTracking] = useState<TrackingTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      setTracking(await api.getTracking(caseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tracking information is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [caseId]);

  if (loading) return <div className="max-w-md mx-auto px-4 py-20 text-center text-sm text-slate-600">Loading Mock tracking…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2"><MockBadge label="MOCK CASE TRACKING · SIMULATED LIFECYCLE" /></div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Case journey</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">The timeline contains prototype events only. User-reported progress is unverified and does not confirm care.</p>
      </div>

      {error && <div role="alert" className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">{error}<button type="button" onClick={() => void refresh()} className="ml-2 underline font-semibold">Retry</button></div>}
      {tracking?.flag && <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900"><MockBadge label="MOCK WORKFLOW TIMER" /><p className="text-sm mt-2">A simulated workflow timer flagged this stage. It is not a clinical response-time measure.</p></div>}

      {tracking && <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-5"><h2 className="text-base font-bold text-slate-900">Mock timeline</h2><span className="text-xs text-slate-500">{tracking.case_state}</span></div>
        {tracking.timeline.length ? <ol className="space-y-4">{tracking.timeline.map((event, index) => <li key={`${event.kind}-${event.occurred_at}-${index}`} className="border-l-2 border-sky-200 pl-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{event.kind.replace(/_/g, ' ')}{event.value ? ` · ${event.value.replace(/_/g, ' ')}` : ''}</h3><time className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString()}</time></div><p className="text-xs text-slate-500 mt-1">{event.verification_source} · Mock event</p>{event.mock_appointment && <p className="text-xs text-slate-600 mt-1">Mock appointment: {event.mock_appointment.label}</p>}</li>)}</ol> : <p className="text-sm text-slate-600">No timeline events were returned.</p>}
        {tracking.referral && <p className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">Mock referral status: {tracking.referral.mock_status} · {tracking.referral.care_type}</p>}
      </section>}
    </div>
  );
};
