import { useEffect, useState } from 'react';
import { api, type SampleProfile } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface StartScreenProps {
  onCaseCreated: (caseId: string, route: string) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({ onCaseCreated }) => {
  const [samples, setSamples] = useState<SampleProfile[]>([]);
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
      .catch(() => {
        // Fallback fixtures
        setSamples([
          {
            fixture_id: 'J1-001',
            title: 'Sample B · Omar (24yo Athletic)',
            description: 'Heavy strength training with past anabolic steroid use. Explores hormonal context without jumping to infertility conclusions.',
            is_synthetic: true
          },
          {
            fixture_id: 'J3-001',
            title: 'Sample E · Tariq (Semen Lab Holder)',
            description: 'Borderline semen motility (38%) requiring structured explanation against WHO 6th edition reference distributions.',
            is_synthetic: true
          },
          {
            fixture_id: 'J4-001',
            title: 'Sample G · Zayd (Acute Warning Signs)',
            description: 'Sudden scrotal pain and fever. Tests immediate deterministic emergency interception without waiting for a questionnaire.',
            is_synthetic: true
          },
          {
            fixture_id: 'J2-001',
            title: 'Sample J · Hamad (Complex Lifestyle)',
            description: 'Multiple metabolic and dietary observations demonstrating selective consent controls and fact extraction.',
            is_synthetic: true
          }
        ]);
      });
  }, []);

  const handleLaunchCase = async (fixtureId?: string) => {
    const targetFixture = fixtureId || selectedFixture;
    setLoading(true);
    setError(null);
    try {
      const res = await api.createCase('SAMPLE', targetFixture);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      
      // Auto-apply sample profile
      await api.applySampleProfile(res.case_id).catch(() => {});
      
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

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.15] max-w-3xl mb-4">
          Private reproductive and hormonal guidance for men.
        </h1>

        <p className="text-base sm:text-xl text-slate-600 max-w-2xl font-normal leading-relaxed mb-8">
          Assessment-first private entry. Evaluates training context, anabolic history, and semen parameters against published WHO and AUA/ASRM clinical guidelines—without diagnosing or storing personal identifiers.
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
              Clinical Guard
            </span>
            <span className="text-sm font-bold text-slate-900 block">Context-Aware</span>
            <p className="text-[11px] text-slate-500 mt-0.5">High BMI is never conflated with adiposity</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Safety Architecture
            </span>
            <span className="text-sm font-bold text-slate-900 block">Deterministic</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Urgent warnings execute offline with zero delay</p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Referral Gate
            </span>
            <span className="text-sm font-bold text-slate-900 block">Tri-party Lock</span>
            <p className="text-[11px] text-slate-500 mt-0.5">User Consent + Reviewer + Policy Floor</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-8 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Main Interactive Stage: Case Scenarios & Pipeline Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
        {/* Left: Scenarios Selector (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Select a Synthetic Profile</h2>
              <p className="text-xs text-slate-500 mt-0.5">Verified golden fixtures from <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded">data/synthetic/</code></p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
              {samples.length} Profiles
            </span>
          </div>

          <div className="space-y-3">
            {samples.slice(0, 4).map((s) => {
              const isSelected = selectedFixture === s.fixture_id;
              return (
                <div
                  key={s.fixture_id}
                  onClick={() => setSelectedFixture(s.fixture_id)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all duration-150 card-hover flex flex-col justify-between ${
                    isSelected
                      ? 'bg-sky-50/40 border-sky-500 shadow-xs ring-1 ring-sky-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-sky-600' : 'bg-slate-300'}`} />
                      <h3 className="text-sm font-bold text-slate-900">{s.title}</h3>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {s.fixture_id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleLaunchCase()}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all btn-press cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? 'Initializing Session...' : 'Launch Assessment with Selected Case →'}
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
            How your facts move through the system without generating ungrounded claims:
          </p>

          <div className="space-y-4 text-xs font-mono">
            {/* Step 1 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                1
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Pre-check Safety Rules</strong>
                <span className="text-slate-400 text-[11px]">Immediate check for acute testicular torsion or trauma.</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                2
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Semantic Fact Extraction</strong>
                <span className="text-slate-400 text-[11px]">Standardizes units, time polarity, and source verification.</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                3
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Versioned Rule Floor</strong>
                <span className="text-slate-400 text-[11px]">Locks minimum triage action to guideline floor policy.</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                4
              </span>
              <div>
                <strong className="text-white block font-sans text-xs">Authorized Human Review</strong>
                <span className="text-slate-400 text-[11px]">Clinical reviewer verifies findings before referral release.</span>
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
