import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MockBadge } from '../components/MockBadge';

type ReferralItem = { referral_id: string; case_code: string; care_type: string; mock_status: string; created_at: string; is_mock: boolean };
type ReferralDetail = {
  referral_id: string;
  mock_status: string;
  is_mock: boolean;
  snapshot: { case_code: string; care_type: string; reviewer_summary: string; limits: string[] } | null;
  events: Array<{ event_id: string; mock_status: string; reason_code: string | null; occurred_at: string; is_mock: boolean }>;
};
type EventStatus = 'MOCK_RECEIVED' | 'MOCK_ACCEPTED' | 'MOCK_REJECTED' | 'MOCK_APPOINTMENT_SCHEDULED' | 'MOCK_CLOSED';
type RejectReason = 'NO_CAPACITY' | 'SERVICE_NOT_OFFERED' | 'INFORMATION_INCOMPLETE' | 'OTHER';

const rejectReasons: RejectReason[] = ['NO_CAPACITY', 'SERVICE_NOT_OFFERED', 'INFORMATION_INCOMPLETE', 'OTHER'];

export const MockFacilityPortal: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem('sanad_staff_role') === 'MOCK_FACILITY' && Boolean(sessionStorage.getItem('sanad_staff_token')));
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
      const selected = result.referrals.some(item => item.referral_id === selectedId) ? selectedId : result.referrals[0]?.referral_id ?? '';
      setSelectedId(selected);
      if (selected) setDetail(await api.getFacilityReferral(selected) as ReferralDetail);
      else setDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mock referrals could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (authenticated) void loadReferrals(); }, [authenticated]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(username, password);
      if (result.role !== 'MOCK_FACILITY') throw new Error('These credentials do not have the Mock Facility role.');
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
    try { await api.logout(); } catch { /* Remove the local session even if the server is unavailable. */ }
    sessionStorage.removeItem('sanad_staff_token');
    sessionStorage.removeItem('sanad_staff_role');
    setAuthenticated(false);
    setReferrals([]);
    setDetail(null);
  };

  const selectReferral = async (referralId: string) => {
    setSelectedId(referralId);
    setError(null);
    try { setDetail(await api.getFacilityReferral(referralId) as ReferralDetail); }
    catch (err) { setError(err instanceof Error ? err.message : 'Mock referral detail is unavailable.'); }
  };

  const nextEvents = (): Array<{ status: EventStatus; label: string }> => {
    switch (detail?.mock_status) {
      case 'MOCK_SENT': return [{ status: 'MOCK_RECEIVED', label: 'Record Mock receipt' }];
      case 'MOCK_RECEIVED': return [
        { status: 'MOCK_ACCEPTED', label: 'Accept Mock referral' },
        { status: 'MOCK_REJECTED', label: 'Reject Mock referral' },
      ];
      case 'MOCK_ACCEPTED': return [
        { status: 'MOCK_APPOINTMENT_SCHEDULED', label: 'Schedule Mock appointment' },
        { status: 'MOCK_CLOSED', label: 'Close Mock workflow' },
      ];
      case 'MOCK_APPOINTMENT_SCHEDULED': return [{ status: 'MOCK_CLOSED', label: 'Close Mock workflow' }];
      default: return [];
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
        ...(status === 'MOCK_APPOINTMENT_SCHEDULED' ? { mock_appointment: { starts_at: new Date(appointmentTime).toISOString() } } : {}),
      });
      setNotice(`Mock event recorded: ${status}.`);
      await loadReferrals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Mock event was not recorded.');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <MockBadge label="MOCK FACILITY SIGN-IN" />
          <h1 className="text-2xl font-bold text-slate-900 mt-4">Mock facility access</h1>
          <p className="text-sm text-slate-600 mt-2">Use the seeded demo account configured for the local API. This role changes synthetic records only.</p>
          {error && <div role="alert" className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-sm">{error}</div>}
          <form onSubmit={handleLogin} className="mt-5 space-y-3">
            <label className="block text-sm font-medium">Username<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <button type="submit" disabled={loading || !username || !password} className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-semibold disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in to Mock Facility'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
        <div><MockBadge label="MOCK FACILITY CONSOLE · SIMULATED ROLE" /><h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-3">Mock referral workflow</h1><p className="text-sm text-slate-600 mt-1">Events update synthetic referral records only. They cannot verify care completion.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => void loadReferrals()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">Refresh</button><button type="button" onClick={() => void handleLogout()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">Sign out</button></div>
      </header>

      {error && <div role="alert" className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">{error}</div>}
      {notice && <div role="status" className="mb-5 p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-sm">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">Mock referral packets</h2>
          {loading && <p className="text-xs text-slate-500">Loading…</p>}
          {!loading && referrals.length === 0 && <p className="text-sm text-slate-600">No Mock referral packets.</p>}
          {referrals.map(referral => <button key={referral.referral_id} type="button" onClick={() => void selectReferral(referral.referral_id)} className={`w-full text-left p-3 rounded-xl border ${selectedId === referral.referral_id ? 'bg-sky-50 border-sky-400' : 'bg-slate-50 border-slate-200'}`}><span className="block text-xs font-mono">{referral.case_code} · Mock</span><span className="block text-xs text-slate-600 mt-1">{referral.care_type} · {referral.mock_status}</span><span className="block text-[11px] text-slate-500 mt-1">{new Date(referral.created_at).toLocaleString()}</span></button>)}
        </aside>

        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-6">
          {!detail && <p className="text-sm text-slate-600">Select a Mock packet to inspect its approved summary and record an event.</p>}
          {detail && <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><MockBadge label="MOCK REFERRAL DETAIL" /><h2 className="text-xl font-bold text-slate-900 mt-2">{detail.snapshot?.case_code ?? detail.referral_id}</h2><p className="text-xs text-slate-500">{detail.snapshot?.care_type ?? 'No approved snapshot'} · {detail.mock_status}</p></div><MockBadge label="SIMULATED DATA" /></div>
            {detail.snapshot && <div className="space-y-3"><div><h3 className="text-sm font-semibold text-slate-800">Approved summary · Mock</h3><p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{detail.snapshot.reviewer_summary}</p></div>{detail.snapshot.limits.length > 0 && <div><h3 className="text-sm font-semibold text-slate-800">Limits</h3><ul className="mt-1 list-disc list-inside text-xs text-slate-600">{detail.snapshot.limits.map((limit, index) => <li key={index}>{limit}</li>)}</ul></div>}</div>}
            <div><h3 className="text-sm font-semibold text-slate-800 mb-2">Mock events</h3>{detail.events.length === 0 ? <p className="text-xs text-slate-500">No events recorded.</p> : <ol className="space-y-2">{detail.events.map(event => <li key={event.event_id} className="rounded-lg bg-slate-50 p-3 text-xs">{event.mock_status} · {new Date(event.occurred_at).toLocaleString()}{event.reason_code ? ` · ${event.reason_code}` : ''} · Mock</li>)}</ol>}</div>
            {nextEvents().length > 0 && <div className="border-t border-slate-100 pt-5 space-y-3"><h3 className="text-sm font-bold text-slate-800">Record next Mock event</h3>{nextEvents().some(event => event.status === 'MOCK_APPOINTMENT_SCHEDULED') && <label className="block text-xs font-semibold text-slate-700">Mock appointment date and time<input type="datetime-local" value={appointmentTime} onChange={event => setAppointmentTime(event.target.value)} className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 p-2" /></label>}{nextEvents().some(event => event.status === 'MOCK_REJECTED') && <label className="block text-xs font-semibold text-slate-700">Mock rejection reason<select value={rejectReason} onChange={event => setRejectReason(event.target.value as RejectReason)} className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 bg-white p-2">{rejectReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}<div className="flex flex-wrap gap-2">{nextEvents().map(event => <button key={event.status} type="button" disabled={loading} onClick={() => void emitEvent(event.status)} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">{event.label}</button>)}</div></div>}
          </>}
        </section>
      </div>
    </div>
  );
};
