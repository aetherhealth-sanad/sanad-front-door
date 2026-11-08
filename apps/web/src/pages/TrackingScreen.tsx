import { useEffect, useState } from 'react';
import { api, type TrackingTimeline } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface TrackingScreenProps {
  caseId: string;
  onRouteChange: (route: string) => void;
  onCloseCase?: () => void;
}

export const TrackingScreen: React.FC<TrackingScreenProps> = ({
  caseId,
  onRouteChange,
  onCloseCase,
}) => {
  const [tracking, setTracking] = useState<TrackingTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      setTracking(await api.getTracking(caseId));
      const state = await api.getCaseState(caseId);
      if (state.route !== '/tracking') onRouteChange(state.route);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Tracking information is unavailable.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getTracking(caseId), api.getCaseState(caseId)])
      .then(([timeline, state]) => {
        if (!mounted) return;
        setTracking(timeline);
        if (state.route !== '/tracking') onRouteChange(state.route);
      })
      .catch(err => {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Tracking information is unavailable.',
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [caseId, onRouteChange]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center text-sm font-mono text-[#3F4E48]">
        Loading Mock tracking…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8 pb-5 border-b border-[#0B1310] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <MockBadge label="MOCK CASE TRACKING · SIMULATED LIFECYCLE" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            Case Journey Telemetry
          </h1>
          <p className="text-sm sm:text-base text-[#3F4E48] mt-1.5 leading-relaxed">
            The timeline contains prototype events only. User-reported progress is unverified and does not confirm care.
          </p>
        </div>

        {onCloseCase && (
          <button
            type="button"
            onClick={onCloseCase}
            className="px-4 py-2.5 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
          >
            Close Case Session
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-sm font-medium"
        >
          {error}
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-2 underline font-mono font-bold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {tracking?.flag && (
        <div className="mb-6 p-4 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F]">
          <MockBadge label="MOCK WORKFLOW TIMER" />
          <p className="text-sm mt-2">
            A simulated workflow timer flagged this stage (<code className="font-mono">{tracking.flag.stage}</code>). It is not a clinical response-time measure.
          </p>
        </div>
      )}

      {tracking && (
        <section className="dossier-card bg-white p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#0B1310] mb-6">
            <div>
              <h2 className="text-base font-extrabold text-[#0B1310]">
                Mock timeline
              </h2>
              <span className="font-mono text-xs text-[#0F523E] font-bold">
                STATE: {tracking.case_state}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="px-3 py-1.5 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] text-xs font-mono font-bold text-[#0B1310] hover:bg-[#E6EAE4] cursor-pointer"
            >
              Refresh status
            </button>
          </div>

          {tracking.timeline.length ? (
            <ol className="space-y-4">
              {tracking.timeline.map((event, index) => (
                <li
                  key={`${event.kind}-${event.occurred_at}-${index}`}
                  className="border-l-2 border-[#0F523E] pl-4 py-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#0B1310] font-mono">
                      {event.kind.replace(/_/g, ' ')}
                      {event.value ? ` · ${event.value.replace(/_/g, ' ')}` : ''}
                    </h3>
                    <time className="text-xs font-mono text-[#3F4E48]">
                      {new Date(event.occurred_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-xs font-mono text-[#3F4E48] mt-1">
                    {event.verification_source} · Mock event
                  </p>
                  {event.mock_appointment && (
                    <p className="text-xs font-mono font-semibold text-[#0F523E] mt-1">
                      Mock appointment: {event.mock_appointment.label}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[#3F4E48]">
              No timeline events were returned.
            </p>
          )}

          {tracking.referral && (
            <div className="mt-6 pt-4 border-t border-[#C5CEC9] flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#0B1310]">
              <span>
                Mock referral status: <strong>{tracking.referral.mock_status}</strong> ·{' '}
                {tracking.referral.care_type}
              </span>
              <span>TARGET: {tracking.referral.target_mock_facility_id}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
