import { useEffect, useState } from 'react';
import { api, type SampleProfile } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface StartScreenProps {
  onCaseCreated: (caseId: string, route: string) => void;
  emergencyCacheReady: boolean;
}

export const StartScreen: React.FC<StartScreenProps> = ({ onCaseCreated, emergencyCacheReady }) => {
  const [samples, setSamples] = useState<SampleProfile[]>([]);
  const [samplesUnavailable, setSamplesUnavailable] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<string>('J1-001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSamples()
      .then(res => {
        if (res.samples && res.samples.length > 0) {
          setSamples(res.samples);
          setSelectedFixture(res.samples[0].fixture_id);
        }
      })
      .catch(() => setSamplesUnavailable(true));
  }, []);

  const handleLaunchCase = async (fixtureId?: string) => {
    const targetFixture = fixtureId || selectedFixture;
    setLoading(true);
    setError(null);
    try {
      const res = await api.createCase('SAMPLE', targetFixture);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'SAMPLE');
      sessionStorage.setItem('sanad_case_fixture_id', targetFixture);
      
      onCaseCreated(res.case_id, res.state?.route || '/consent');
    } catch (err: any) {
      setError(err.message || 'Failed to initialize case');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBlank = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.createCase('BLANK');
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'BLANK');
      sessionStorage.removeItem('sanad_case_fixture_id');
      onCaseCreated(res.case_id, res.state?.route || '/consent');
    } catch (err: any) {
      setError(err.message || 'Failed to start blank case');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Editorial Clinical Hero */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <MockBadge label="AETHERHEALTH · RESEARCH PROTOTYPE 2026" />
          <span className="text-xs font-mono text-slate-400">BRD & PRD v0.4 Conformance</span>
        </div>
        <p role="status" className="mb-3 text-xs text-slate-600">{emergencyCacheReady ? 'Emergency guidance is cached for offline access.' : 'Preparing the offline emergency guidance cache…'}</p>

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.15] max-w-3xl mb-4">
          A private research prototype for men's health.
        </h1>

        <p className="text-base sm:text-xl text-slate-600 max-w-2xl font-normal leading-relaxed mb-8">
          Explore the consent, safety, and draft assessment flow with synthetic profiles. This prototype does not connect to a real provider or model.
        </p>

        {/* 4 Trust Pillars (Equal Grid) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 border-t border-slate-200">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Identity Mode
            </span>
            <span className="text-sm font-bold text-slate-900 block">Pseudonymous</span>
            <p className="text-[11px] text-slate-500 mt-0.5">No login, phone, or name needed to start</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Data Handling
            </span>
            <span className="text-sm font-bold text-slate-900 block">Draft rules · Mock</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Unknown and declined answers stay distinct</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Safety Architecture
            </span>
            <span className="text-sm font-bold text-slate-900 block">Mock safety check</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Emergency guidance link stays available</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Referral Gate
            </span>
            <span className="text-sm font-bold text-slate-900 block">Mock-only</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Consent, simulated review, and backend policy gate</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-8 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {samplesUnavailable && (
        <div className="mb-8 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          Synthetic profiles could not be loaded. You can start a blank assessment or retry after reconnecting to the API.
          <button type="button" onClick={() => { setSamplesUnavailable(false); api.getSamples().then(res => { setSamples(res.samples); setSelectedFixture(res.samples[0]?.fixture_id ?? ''); }).catch(() => setSamplesUnavailable(true)); }} className="ml-2 underline font-semibold">Retry</button>
        </div>
      )}

      {/* Main Interactive Stage: Case Scenarios & Pipeline Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
        {/* Left: Scenarios Selector (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Select a Synthetic Profile</h2>
              <p className="text-xs text-slate-500 mt-0.5">Synthetic profiles from <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded">data/synthetic/</code> · Mock</p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
              {samples.length} Profiles
            </span>
          </div>

          <div className="space-y-3">
              {samples.slice(0, 4).map((s) => {
              const isSelected = selectedFixture === s.fixture_id;
              return (
                <button
                  key={s.fixture_id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedFixture(s.fixture_id)}
                  className={`w-full p-4 rounded-xl border text-left cursor-pointer transition-all duration-150 card-hover flex flex-col justify-between ${
                    isSelected
                      ? 'bg-sky-50/40 border-sky-500 shadow-xs ring-1 ring-sky-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-sky-600' : 'bg-slate-300'}`} />
                    <h3 className="text-sm font-bold text-slate-900">{s.title} · Mock</h3>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {s.fixture_id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {s.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              disabled={loading || samples.length === 0 || !selectedFixture}
              onClick={() => handleLaunchCase()}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all btn-press cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? 'Initializing Session...' : 'Launch Assessment with Selected Mock Profile →'}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleStartBlank}
              className="w-full sm:w-auto py-3.5 px-4 rounded-xl font-semibold text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors btn-press cursor-pointer whitespace-nowrap"
            >
              Blank Assessment
            </button>
          </div>
        </div>

        {/* Right: Architecture & Clinical Flow Visualizer (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-xs font-bold font-mono tracking-wider text-sky-400 uppercase">
              Clinical Journey Flow
            </h2>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              E2E WORKFLOW v0.4
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
              Mock journey stages. Draft outputs are not validated care decisions.
          </p>

          <div className="space-y-4 text-xs font-mono">
            {/* Step 1 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                1
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Mock safety questions</strong>
                <span className="text-slate-400 text-[11px]">Draft rule catalogue · CLINICAL_TBD</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                2
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Structured intake</strong>
                <span className="text-slate-400 text-[11px]">Answers keep their source and status.</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                3
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Draft assessment</strong>
                <span className="text-slate-400 text-[11px]">Rule output is simulated and pending review.</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                4
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Mock Reviewer</strong>
                <span className="text-slate-400 text-[11px]">A simulated approval is bound to the draft version.</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-editorial">
            * All facility integrations, referrals, and clinician reviews in this prototype are simulated for research evaluation.
          </div>
        </div>
      </div>
    </div>
  );
};
