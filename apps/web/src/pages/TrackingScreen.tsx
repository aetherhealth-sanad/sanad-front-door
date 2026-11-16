import { useEffect, useState } from 'react';
import { LoadingView } from '../components/LoadingView';
import { api, type TrackingTimeline } from '../api/client';

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
      <div className="max-w-xl mx-auto px-4 py-12 animate-reveal-1">
        <LoadingView
          title="Loading Journey Timeline"
          subtitle="Fetching your session milestones…"
          variant="card"
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 sm:py-12 space-y-8">
      <div className="mb-6 pb-6 border-b border-[#E4DFD3] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-[#1F4D3F] bg-[#E8EFEA] px-2.5 py-0.5 rounded-full border border-[#C8D6CC]">
              CASE JOURNEY
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1F1C] tracking-tight">
            Case progress
          </h1>
          <p className="text-sm sm:text-base text-[#575C55] mt-1 leading-relaxed max-w-2xl">
            Track each milestone of your simulated assessment and referral status. User-reported milestones are stored temporarily in this session.
          </p>
        </div>

        {onCloseCase && (
          <button
            type="button"
            onClick={onCloseCase}
            className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Close Case Session
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FBEDEA] border border-[#F0C9C2] text-[#B3261E] text-sm font-semibold"
        >
          {error}
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-2 underline font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {tracking?.flag && (
        <div className="p-5 rounded-2xl bg-[#FFFAEB] border border-[#FEDF89] text-[#B54708]">
          <span className="text-xs font-mono font-bold text-[#B54708] bg-[#FBFAF6] px-2 py-0.5 rounded-full border border-[#FEDF89]">
            Simulated Workflow Flag
          </span>
          <p className="text-sm mt-2">
            A simulated workflow timer flagged this stage (<code>{tracking.flag.stage}</code>). It is not a clinical response-time measure.
          </p>
        </div>
      )}

      {tracking && (
        <section className="medical-card bg-[#FBFAF6] p-6 sm:p-8 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)] space-y-6">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E4DFD3]">
            <div>
              <h2 className="text-base font-bold text-[#1A1F1C]">
                Mock timeline
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#E8EFEA] text-[#163A2F] mt-1 inline-block">
                STATE: {tracking.case_state}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="btn-pill-secondary px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
            >
              Refresh status
            </button>
          </div>

          {tracking.timeline.length ? (
            <ol className="space-y-0 pl-2">
              {tracking.timeline.map((event, index) => (
                <li
                  key={`${event.kind}-${event.occurred_at}-${index}`}
                  className="relative pl-6 pb-6 border-l-2 border-[#C8D6CC] last:border-l-0 last:pb-0"
                >
                  <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-[#FBFAF6] border-2 border-[#1F4D3F]" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#1A1F1C]">
                      {event.kind.replace(/_/g, ' ')}
                      {event.value ? ` · ${event.value.replace(/_/g, ' ')}` : ''}
                    </h3>
                    <time className="text-xs text-[#8A8C84]">
                      {new Date(event.occurred_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-xs text-[#575C55] mt-1">
                    {event.verification_source} · Mock event
                  </p>
                  {event.mock_appointment && (
                    <p className="text-xs font-semibold text-[#163A2F] mt-1.5 bg-[#E8EFEA] px-2.5 py-1 rounded-lg inline-block border border-[#C8D6CC]">
                      Mock appointment: {event.mock_appointment.label}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[#575C55]">
              No timeline events were returned.
            </p>
          )}

          {tracking.referral && (
            <div className="mt-6 pt-4 border-t border-[#E4DFD3] flex flex-wrap items-center justify-between gap-2 text-xs text-[#575C55] bg-[#F7F5EF] p-4 rounded-xl border border-[#E4DFD3]">
              <span>
                Mock referral status: <strong className="text-[#1A1F1C]">{tracking.referral.mock_status}</strong> ·{' '}
                {tracking.referral.care_type}
              </span>
              <span className="font-semibold text-[#1F4D3F]">TARGET: {tracking.referral.target_mock_facility_id}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
