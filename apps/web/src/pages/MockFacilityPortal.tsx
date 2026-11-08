import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';

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
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="dossier-card bg-white p-6 sm:p-8">
          <MockBadge label="MOCK FACILITY SIGN-IN" />
          <h1 className="text-2xl font-extrabold text-[#0B1310] mt-4">
            Mock facility access
          </h1>
          <p className="text-sm text-[#3F4E48] mt-2 leading-relaxed">
            Use the seeded demo account configured for the local API. This role changes synthetic records only.
          </p>
          {error && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-sm"
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <label className="block text-xs font-mono font-bold text-[#0B1310]">
              Username
              <input
                name="username"
                aria-label="Username"
                autoComplete="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-[2px] border border-[#0B1310] bg-white px-3 py-2 text-sm font-sans"
              />
            </label>
            <label className="block text-xs font-mono font-bold text-[#0B1310]">
              Password
              <input
                type="password"
                name="password"
                aria-label="Password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-[2px] border border-[#0B1310] bg-white px-3 py-2 text-sm font-sans"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-[2px] bg-[#0F523E] hover:bg-[#093B2C] text-white border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] py-3 font-mono text-xs font-bold btn-press cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in to Mock Facility'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-5 border-b border-[#0B1310]">
        <div>
          <MockBadge label="MOCK FACILITY CONSOLE · SIMULATED ROLE" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] mt-3 tracking-tight">
            Mock Referral Workflow
          </h1>
          <p className="text-sm text-[#3F4E48] mt-1">
            Events update synthetic referral records only. They cannot verify care completion.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadReferrals()}
            className="px-4 py-2 rounded-[2px] border border-[#0B1310] bg-white hover:bg-[#E6EAE4] text-xs font-mono font-bold cursor-pointer"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="px-4 py-2 rounded-[2px] border border-[#0B1310] bg-white hover:bg-[#E6EAE4] text-xs font-mono font-bold cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-5 p-4 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-sm font-medium"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 p-4 rounded-[2px] bg-[#E6F2EE] border border-[#0F523E] text-[#0F523E] text-sm font-medium"
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 dossier-card bg-white p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-[#0B1310] pb-3 border-b border-[#0B1310]">
            Mock referral packets ({referrals.length})
          </h2>
          {loading && (
            <p className="text-xs font-mono text-[#3F4E48]">Loading…</p>
          )}
          {!loading && referrals.length === 0 && (
            <p className="text-sm text-[#3F4E48]">No Mock referral packets.</p>
          )}
          {referrals.map(referral => (
            <button
              key={referral.referral_id}
              type="button"
              onClick={() => void selectReferral(referral.referral_id)}
              className={`w-full text-left p-3.5 rounded-[2px] border cursor-pointer transition-colors ${
                selectedId === referral.referral_id
                  ? 'bg-[#E6F2EE] border-[#0F523E]'
                  : 'bg-[#F3F4F1] border-[#0B1310] hover:bg-white'
              }`}
            >
              <span className="block text-xs font-mono font-bold text-[#0B1310]">
                {referral.case_code} · Mock
              </span>
              <span className="block text-xs font-mono text-[#0F523E] mt-1">
                {referral.care_type} · {referral.mock_status}
              </span>
              <span className="block text-[11px] font-mono text-[#3F4E48] mt-1">
                {new Date(referral.created_at).toLocaleString()}
              </span>
            </button>
          ))}
        </aside>

        <section className="lg:col-span-8 dossier-card bg-white p-6 sm:p-7 space-y-6">
          {!detail && (
            <p className="text-sm text-[#3F4E48]">
              Select a Mock packet to inspect its approved summary and record an event.
            </p>
          )}
          {detail && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#0B1310] pb-4">
                <div>
                  <MockBadge label="MOCK REFERRAL DETAIL" />
                  <h2 className="text-xl font-extrabold text-[#0B1310] mt-2 font-mono">
                    {detail.snapshot?.case_code ?? detail.referral_id}
                  </h2>
                  <p className="text-xs font-mono text-[#3F4E48]">
                    {detail.snapshot?.care_type ?? 'No approved snapshot'} ·{' '}
                    {detail.mock_status}
                  </p>
                </div>
                <MockBadge label="MOCK · SIMULATED DATA" />
              </div>

              {detail.snapshot && (
                <div className="space-y-4">
                  <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310]">
                    <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase">
                      Approved summary · Mock
                    </h3>
                    <p className="mt-1.5 text-sm text-[#0B1310] whitespace-pre-wrap leading-relaxed">
                      {detail.snapshot.reviewer_summary}
                    </p>
                  </div>
                  {detail.snapshot.limits.length > 0 && (
                    <div>
                      <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase">
                        Limits
                      </h3>
                      <ul className="mt-1.5 space-y-1 text-xs text-[#3F4E48]">
                        {detail.snapshot.limits.map((limit, index) => (
                          <li key={index}>{limit}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase mb-2">
                  Mock events
                </h3>
                {detail.events.length === 0 ? (
                  <p className="text-xs text-[#3F4E48]">No events recorded.</p>
                ) : (
                  <ol className="space-y-2">
                    {detail.events.map(event => (
                      <li
                        key={event.event_id}
                        className="rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] p-3 text-xs font-mono"
                      >
                        {event.mock_status} ·{' '}
                        {new Date(event.occurred_at).toLocaleString()}
                        {event.reason_code ? ` · ${event.reason_code}` : ''} · Mock
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {nextEvents().length > 0 && (
                <div className="border-t border-[#0B1310] pt-5 space-y-4">
                  <h3 className="text-xs font-mono font-bold text-[#0B1310] uppercase">
                    Record next Mock event
                  </h3>
                  {nextEvents().some(
                    event => event.status === 'MOCK_APPOINTMENT_SCHEDULED',
                  ) && (
                    <label className="block text-xs font-mono font-bold text-[#0B1310]">
                      Mock appointment date and time
                      <input
                        type="datetime-local"
                        name="appointment_time"
                        aria-label="Mock appointment date and time"
                        value={appointmentTime}
                        onChange={event =>
                          setAppointmentTime(event.target.value)
                        }
                        className="mt-1 block w-full max-w-sm rounded-[2px] border border-[#0B1310] bg-white p-2 text-sm"
                      />
                    </label>
                  )}
                  {nextEvents().some(
                    event => event.status === 'MOCK_REJECTED',
                  ) && (
                    <label className="block text-xs font-mono font-bold text-[#0B1310]">
                      Mock rejection reason
                      <select
                        value={rejectReason}
                        onChange={event =>
                          setRejectReason(event.target.value as RejectReason)
                        }
                        className="mt-1 block w-full max-w-sm rounded-[2px] border border-[#0B1310] bg-white p-2 text-sm"
                      >
                        {rejectReasons.map(reason => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2.5">
                    {nextEvents().map(event => (
                      <button
                        key={event.status}
                        type="button"
                        disabled={loading}
                        onClick={() => void emitEvent(event.status)}
                        className="px-4 py-2.5 rounded-[2px] bg-[#0F523E] hover:bg-[#093B2C] text-white border border-[#0B1310] font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
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
