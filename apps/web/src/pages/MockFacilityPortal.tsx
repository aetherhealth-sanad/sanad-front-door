import { useEffect, useState } from 'react';
import { api } from '../api/client';

type ReferralItem = {
  referral_id: string;
  case_code: string;
  care_type: string;
  mock_status: string;
  created_at: string;
  is_mock: boolean;
};
type ReferralDetail = {
  referral_id: string;
  mock_status: string;
  is_mock: boolean;
  snapshot: {
    case_code: string;
    care_type: string;
    reviewer_summary: string;
    limits: string[];
  } | null;
  events: Array<{
    event_id: string;
    mock_status: string;
    reason_code: string | null;
    occurred_at: string;
    is_mock: boolean;
  }>;
};
type EventStatus =
  | 'MOCK_RECEIVED'
  | 'MOCK_ACCEPTED'
  | 'MOCK_REJECTED'
  | 'MOCK_APPOINTMENT_SCHEDULED'
  | 'MOCK_CLOSED';
type RejectReason =
  | 'NO_CAPACITY'
  | 'SERVICE_NOT_OFFERED'
  | 'INFORMATION_INCOMPLETE'
  | 'OTHER';

const rejectReasons: RejectReason[] = [
  'NO_CAPACITY',
  'SERVICE_NOT_OFFERED',
  'INFORMATION_INCOMPLETE',
  'OTHER',
];

export const MockFacilityPortal: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(
    () =>
      sessionStorage.getItem('sanad_staff_role') === 'MOCK_FACILITY' &&
      Boolean(sessionStorage.getItem('sanad_staff_token')),
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ReferralDetail | null>(null);
  const [rejectReason, setRejectReason] = useState<RejectReason>('OTHER');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReferrals = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getFacilityReferrals();
      setReferrals(result.referrals);
      const selected = result.referrals.some(
        item => item.referral_id === selectedId,
      )
        ? selectedId
        : result.referrals[0]?.referral_id ?? '';
      setSelectedId(selected);
      if (selected) {
        setDetail((await api.getFacilityReferral(selected)) as ReferralDetail);
      } else {
        setDetail(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Mock referrals could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    let mounted = true;
    api
      .getFacilityReferrals()
      .then(async result => {
        if (!mounted) return;
        setReferrals(result.referrals);
        const first = result.referrals[0]?.referral_id ?? '';
        setSelectedId(first);
        if (first) {
          const loaded = (await api.getFacilityReferral(first)) as ReferralDetail;
          if (mounted) setDetail(loaded);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Mock referrals could not be loaded.',
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [authenticated]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(username, password);
      if (result.role !== 'MOCK_FACILITY') {
        throw new Error('These credentials do not have the Mock Facility role.');
      }
      sessionStorage.setItem('sanad_staff_token', result.token);
      sessionStorage.setItem('sanad_staff_role', result.role);
      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* Remove the local session even if the server is unavailable. */
    }
    sessionStorage.removeItem('sanad_staff_token');
    sessionStorage.removeItem('sanad_staff_role');
    setAuthenticated(false);
    setReferrals([]);
    setDetail(null);
  };

  const selectReferral = async (referralId: string) => {
    setSelectedId(referralId);
    setError(null);
    try {
      setDetail((await api.getFacilityReferral(referralId)) as ReferralDetail);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Mock referral detail is unavailable.',
      );
    }
  };

  const nextEvents = (): Array<{ status: EventStatus; label: string }> => {
    switch (detail?.mock_status) {
      case 'MOCK_SENT':
        return [{ status: 'MOCK_RECEIVED', label: 'Record Mock receipt' }];
      case 'MOCK_RECEIVED':
        return [
          { status: 'MOCK_ACCEPTED', label: 'Accept Mock referral' },
          { status: 'MOCK_REJECTED', label: 'Reject Mock referral' },
        ];
      case 'MOCK_ACCEPTED':
        return [
          {
            status: 'MOCK_APPOINTMENT_SCHEDULED',
            label: 'Schedule Mock appointment',
          },
          { status: 'MOCK_CLOSED', label: 'Close Mock workflow' },
        ];
      case 'MOCK_APPOINTMENT_SCHEDULED':
        return [{ status: 'MOCK_CLOSED', label: 'Close Mock workflow' }];
      default:
        return [];
    }
  };

  const emitEvent = async (status: EventStatus) => {
    if (!detail) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    if (status === 'MOCK_APPOINTMENT_SCHEDULED' && !appointmentTime) {
      setError('Choose a date and time for the Mock appointment.');
      setLoading(false);
      return;
    }
    try {
      await api.postFacilityEvent(detail.referral_id, {
        mock_status: status,
        ...(status === 'MOCK_REJECTED' ? { reason_code: rejectReason } : {}),
        ...(status === 'MOCK_APPOINTMENT_SCHEDULED'
          ? {
              mock_appointment: {
                starts_at: new Date(appointmentTime).toISOString(),
              },
            }
          : {}),
      });
      setNotice(`Mock event recorded: ${status}.`);
      await loadReferrals();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The Mock event was not recorded.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="medical-card bg-[#FBFAF6] p-8 sm:p-10 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-2)] space-y-4">
          <span className="text-xs font-mono font-bold text-[#1F4D3F] bg-[#E8EFEA] px-2.5 py-0.5 rounded-full border border-[#C8D6CC]">
            FACILITY ACCESS
          </span>
          <h1 className="text-3xl font-semibold text-[#1A1F1C] mt-3">
            Facility access
          </h1>
          <p className="text-sm text-[#575C55] leading-relaxed">
            Use the seeded demo account configured for the local API. This role changes synthetic records only.
          </p>
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#FBEDEA] border border-[#F0C9C2] text-[#B3261E] text-sm font-semibold"
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4 pt-2">
            <label className="block text-xs font-bold text-[#1A1F1C]">
              Username
              <input
                name="username"
                aria-label="Username"
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#D6D0C2] bg-[#FBFAF6] px-4 py-2.5 text-sm text-[#1A1F1C] focus:outline-none focus:ring-2 focus:ring-[#1F4D3F]"
              />
            </label>
            <label className="block text-xs font-bold text-[#1A1F1C]">
              Password
              <input
                type="password"
                name="password"
                aria-label="Password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#D6D0C2] bg-[#FBFAF6] px-4 py-2.5 text-sm text-[#1A1F1C] focus:outline-none focus:ring-2 focus:ring-[#1F4D3F]"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-pill-primary w-full py-3.5 rounded-full text-xs font-bold text-white shadow-[var(--shadow-1)] cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in to Mock Facility'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 pb-6 border-b border-[#E4DFD3]">
        <div>
          <span className="text-xs font-mono font-bold text-[#1F4D3F] bg-[#E8EFEA] px-2.5 py-0.5 rounded-full border border-[#C8D6CC]">
            REFERRAL DISPATCH DESK
          </span>
          <h1 className="text-3xl sm:text-4xl font-semibold text-[#1A1F1C] mt-3 tracking-tight">
            Referral Coordination
          </h1>
          <p className="text-sm text-[#575C55] mt-1">
            Events update synthetic referral records only. They cannot verify care completion.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => void loadReferrals()}
            className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="btn-pill-secondary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FBEDEA] border border-[#F0C9C2] text-[#B3261E] text-sm font-semibold"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="p-4 rounded-xl bg-[#E8EFEA] border border-[#C8D6CC] text-[#163A2F] text-sm font-semibold"
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 medical-card bg-[#FBFAF6] p-6 space-y-3.5 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)]">
          <h2 className="text-sm font-bold text-[#1A1F1C] pb-3 border-b border-[#E4DFD3]">
            Mock referral packets ({referrals.length})
          </h2>
          {loading && (
            <p className="text-xs text-[#575C55]">Loading...</p>
          )}
          {!loading && referrals.length === 0 && (
            <p className="text-sm text-[#575C55]">No Mock referral packets.</p>
          )}
          {referrals.map(referral => (
            <button
              key={referral.referral_id}
              type="button"
              onClick={() => void selectReferral(referral.referral_id)}
              className={`w-full text-left p-4 rounded-xl border cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] ${
                selectedId === referral.referral_id
                  ? 'bg-[#F7F5EF] border-[#C8D6CC] shadow-xs'
                  : 'bg-[#F7F5EF] border-[#E4DFD3] hover:border-[#D6D0C2]'
              }`}
            >
              <span className="block text-xs font-bold text-[#1A1F1C]">
                {referral.case_code} · Mock
              </span>
              <span className="block text-xs font-semibold text-[#1F4D3F] mt-1">
                {referral.care_type} · {referral.mock_status}
              </span>
              <span className="block text-xs text-[#575C55] mt-1">
                {new Date(referral.created_at).toLocaleString()}
              </span>
            </button>
          ))}
        </aside>

        <section className="lg:col-span-8 medical-card bg-[#FBFAF6] p-6 sm:p-8 space-y-6 rounded-2xl border border-[#E4DFD3] shadow-[var(--shadow-1)]">
          {!detail && (
            <p className="text-sm text-[#575C55]">
              Select a Mock packet to inspect its approved summary and record an event.
            </p>
          )}
          {detail && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4DFD3] pb-4">
                <div>
                  <h2 className="text-xl font-bold text-[#1A1F1C]">
                    {detail.snapshot?.case_code ?? detail.referral_id}
                  </h2>
                  <p className="text-xs text-[#575C55] mt-0.5">
                    {detail.snapshot?.care_type ?? 'No approved snapshot'} ·{' '}
                    {detail.mock_status}
                  </p>
                </div>
              </div>

              {detail.snapshot && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-[#F7F5EF] border border-[#E4DFD3]">
                    <h3 className="text-xs font-bold text-[#163A2F] uppercase tracking-wide">
                      Approved summary · Mock
                    </h3>
                    <p className="mt-2 text-sm text-[#1A1F1C] whitespace-pre-wrap leading-relaxed">
                      {detail.snapshot.reviewer_summary}
                    </p>
                  </div>
                  {detail.snapshot.limits.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide">
                        Limits
                      </h3>
                      <ul className="mt-2 space-y-1 text-xs text-[#575C55]">
                        {detail.snapshot.limits.map((limit, index) => (
                          <li key={index}>{limit}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide mb-2.5">
                  Mock events
                </h3>
                {detail.events.length === 0 ? (
                  <p className="text-xs text-[#575C55]">No events recorded.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {detail.events.map(event => (
                      <li
                        key={event.event_id}
                        className="rounded-xl bg-[#F7F5EF] border border-[#E4DFD3] p-3.5 text-xs text-[#575C55]"
                      >
                        <strong className="text-[#1A1F1C] font-semibold">{event.mock_status}</strong> ·{' '}
                        {new Date(event.occurred_at).toLocaleString()}
                        {event.reason_code ? ` · ${event.reason_code}` : ''} · Mock
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {nextEvents().length > 0 && (
                <div className="border-t border-[#E4DFD3] pt-5 space-y-4">
                  <h3 className="text-xs font-bold text-[#1A1F1C] uppercase tracking-wide">
                    Record next Mock event
                  </h3>
                  {nextEvents().some(
                    event => event.status === 'MOCK_APPOINTMENT_SCHEDULED',
                  ) && (
                    <label className="block text-xs font-bold text-[#1A1F1C]">
                      Mock appointment date and time
                      <input
                        type="datetime-local"
                        name="appointment_time"
                        aria-label="Mock appointment date and time"
                        value={appointmentTime}
                        onChange={event =>
                          setAppointmentTime(event.target.value)
                        }
                        className="mt-1.5 block w-full max-w-sm rounded-xl border border-[#D6D0C2] bg-[#FBFAF6] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3F]"
                      />
                    </label>
                  )}
                  {nextEvents().some(
                    event => event.status === 'MOCK_REJECTED',
                  ) && (
                    <label className="block text-xs font-bold text-[#1A1F1C]">
                      Mock rejection reason
                      <select
                        value={rejectReason}
                        onChange={event =>
                          setRejectReason(event.target.value as RejectReason)
                        }
                        className="mt-1.5 block w-full max-w-sm rounded-xl border border-[#D6D0C2] bg-[#FBFAF6] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4D3F]"
                      >
                        {rejectReasons.map(reason => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {nextEvents().map(event => (
                      <button
                        key={event.status}
                        type="button"
                        disabled={loading}
                        onClick={() => void emitEvent(event.status)}
                        className="btn-pill-primary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {event.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
