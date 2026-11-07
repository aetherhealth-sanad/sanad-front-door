import { useEffect, useState } from 'react';
import { api, setPendingUploadFile, type SampleProfile } from '../api/client';
import { MockBadge } from '../components/MockBadge';

interface StartScreenProps {
  onCaseCreated: (caseId: string, route: string) => void;
  emergencyCacheReady: boolean;
}

type StartModeTab = 'SAMPLE' | 'UPLOAD' | 'BLANK';

const SAMPLE_UPLOAD_TEMPLATE = {
  profile_format: 'sanad-profile-0.1',
  is_synthetic: true,
  responses: [
    { concept_code: 'age_years', value: 33 },
    { concept_code: 'bmi', value: 27.4 },
    { concept_code: 'anabolic_steroid_use', value: true, temporal_status: 'PAST' },
    { concept_code: 'strength_training', value: 'REGULAR' },
    { concept_code: 'smoking', value: false },
    { concept_code: 'semen_analysis_done', value: true },
    { concept_code: 'type2_diabetes', value: false },
    { concept_code: 'family_history_reported', state: 'UNKNOWN' },
    { concept_code: 'regular_medicines', value: false },
    { concept_code: 'genetics_result_available', value: false },
    { concept_code: 'sudden_severe_scrotal_pain', value: false },
    { concept_code: 'fever_with_painful_scrotal_swelling', value: false },
    { concept_code: 'scrotal_trauma', value: false },
  ],
  observations: [
    {
      test_code: 'VOLUME_PLACEHOLDER',
      value: 2.4,
      unit: 'mL',
      collected_on: '2026-10-15',
      reference_source: 'Synthetic report',
    },
    {
      test_code: 'CONCENTRATION_PLACEHOLDER',
      value: 11.5,
      unit: 'million/mL',
      collected_on: '2026-10-15',
      reference_source: 'Synthetic report',
    },
  ],
};

const PIPELINE_STAGES = [
  {
    code: 'STAGE 01',
    title: 'Deterministic Safety Gate',
    badge: 'MOCK · DRAFT-EMERG-01..03 · CLINICAL_TBD',
    summary:
      'Runs before any intake question or network wait. Acute red flags route immediately to offline-cached emergency guidance.',
    metrics: [
      { label: 'Execution Mode', value: 'Browser + Server Dual Gate' },
      { label: 'Offline Target', value: '/urgent.html (Precached)' },
      { label: 'Consent Requirement', value: 'None (Always Reachable)' },
    ],
  },
  {
    code: 'STAGE 02',
    title: 'Structured Intake & Lab Observations (J3)',
    badge: 'MOCK · GATEKEEPER · SEMANTIC FACTS',
    summary:
      'Preserves UNKNOWN, NOT_ASKED, and DECLINED as distinct epistemic states. Supports manual lab entry without unit conversion.',
    metrics: [
      { label: 'Epistemic States', value: 'KNOWN / UNKNOWN / DECLINED' },
      { label: 'Psychosocial Context', value: 'Max 3 · Excluded from Triage' },
      { label: 'Lab Entry Path', value: 'Needs User Confirmation (AC-15.2)' },
    ],
  },
  {
    code: 'STAGE 03',
    title: 'Draft Synthesis & Selective Evidence (J2)',
    badge: 'MOCK · TEMPLATE DRAFTS · MOCK REVIEWER',
    summary:
      'Generates deterministic patient and clinician drafts. Patients control evidence selection and optional simulated clinician review.',
    metrics: [
      { label: 'Model Calls', value: 'Zero LLM Calls (INV-01)' },
      { label: 'Version Binding', value: 'Bound to case_version' },
      { label: 'Review Role', value: 'Simulated Reviewer (Mock)' },
    ],
  },
  {
    code: 'STAGE 04',
    title: 'Tri-Condition Referral Gate & Closed-Loop',
    badge: 'MOCK · EVALUATE_GATE · SESSION SCOPED',
    summary:
      'A Mock referral is created only when active provider consent, version-matched clinician approval, and backend policy all pass.',
    metrics: [
      { label: 'Gate Function', value: 'Pure evaluate_gate() Check' },
      { label: 'Outbound Transport', value: 'None (Local SQLite Only)' },
      { label: 'Completion Claim', value: 'CARE_COMPLETED Prohibited' },
    ],
  },
];

export const StartScreen: React.FC<StartScreenProps> = ({
  onCaseCreated,
  emergencyCacheReady,
}) => {
  const [samples, setSamples] = useState<SampleProfile[]>([]);
  const [samplesUnavailable, setSamplesUnavailable] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<string>('J1-001');
  const [startMode, setStartMode] = useState<StartModeTab>('SAMPLE');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ar'>('en');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeStageIdx, setActiveStageIdx] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSamples()
      .then(res => {
        if (res.samples && res.samples.length > 0) {
          setSamples(res.samples);
          setSelectedFixture(res.samples[0].fixture_id);
        }
      })
      .catch(() => setSamplesUnavailable(true));
  }, []);

  const handleLaunchSample = async (fixtureOverride?: string) => {
    const targetFixture = fixtureOverride || selectedFixture;
    setLoading(true);
    setError(null);
    try {
      setPendingUploadFile(null);
      const res = await api.createCase('SAMPLE', targetFixture, preferredLanguage);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'SAMPLE');
      sessionStorage.setItem('sanad_case_fixture_id', targetFixture);
      onCaseCreated(res.case_id, res.state?.route || '/consent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initialize sample case');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBlank = async () => {
    setLoading(true);
    setError(null);
    try {
      setPendingUploadFile(null);
      const res = await api.createCase('BLANK', undefined, preferredLanguage);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'BLANK');
      sessionStorage.removeItem('sanad_case_fixture_id');
      onCaseCreated(res.case_id, res.state?.route || '/consent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start blank case');
    } finally {
      setLoading(false);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) {
      setError('Select a synthetic JSON profile file or load the synthetic template first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPendingUploadFile(selectedFile);
      const res = await api.createCase('UPLOAD', undefined, preferredLanguage);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'UPLOAD');
      sessionStorage.removeItem('sanad_case_fixture_id');
      onCaseCreated(res.case_id, res.state?.route || '/consent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initialize upload case');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSyntheticTemplateFile = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_UPLOAD_TEMPLATE, null, 2)], {
      type: 'application/json',
    });
    const file = new File([blob], 'synthetic-profile-j1-j3.json', {
      type: 'application/json',
    });
    setSelectedFile(file);
    setStartMode('UPLOAD');
    setError(null);
  };

  const activeStage = PIPELINE_STAGES[activeStageIdx];

  return (
    <div className="bg-architectural-grid">
      {/* SECTION 1: ASYMMETRIC ARCHITECTURAL DOSSIER HERO & CASE LAUNCHPAD */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 lg:pt-12 pb-12 border-b border-[#0B1310]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 7 Columns: Editorial Manifesto & Real Photography */}
          <div className="lg:col-span-7 space-y-6 animate-reveal-1">
            {/* Element 1: Brand & Offline Cache Strip */}
            <div className="flex flex-wrap items-center gap-2.5">
              <MockBadge label="MOCK · AETHERHEALTH RESEARCH PROTOTYPE 2026" />
              <span
                role="status"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[2px] text-[11px] font-mono bg-white border border-[#0B1310] text-[#0B1310]"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-[2px] ${
                    emergencyCacheReady ? 'bg-[#0F523E]' : 'bg-[#B45309]'
                  }`}
                />
                {emergencyCacheReady
                  ? 'Emergency guidance is cached for offline access.'
                  : 'Preparing the offline emergency guidance cache…'}
              </span>
            </div>

            {/* Element 2: Headline (<= 2 lines on desktop) */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tighter text-[#0B1310] leading-[1.04]">
              A private research front door for men's health.
            </h1>

            {/* Element 3: Subtext (<= 20 words) */}
            <p className="text-base sm:text-lg text-[#3F4E48] max-w-[54ch] font-normal leading-relaxed">
              Explore consent, deterministic safety checks, and simulated referral gates with synthetic profiles. Zero external model calls.
            </p>

            {/* Element 4: Primary & Secondary CTAs (Single line on desktop) */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={loading || (startMode === 'SAMPLE' && (samples.length === 0 || !selectedFixture))}
                onClick={() => {
                  if (startMode === 'UPLOAD') void handleStartUpload();
                  else if (startMode === 'BLANK') void handleStartBlank();
                  else void handleLaunchSample();
                }}
                className="px-6 py-3.5 rounded-[2px] font-mono font-bold text-sm text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] shadow-[4px_4px_0px_#0B1310] btn-press cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {loading ? 'Initializing Case...' : 'Launch Mock Assessment →'}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleStartBlank()}
                className="px-5 py-3.5 rounded-[2px] font-mono font-semibold text-sm text-[#0B1310] bg-white hover:bg-[#E6EAE4] border border-[#0B1310] btn-press cursor-pointer whitespace-nowrap"
              >
                Blank Assessment
              </button>
            </div>

            {/* Architectural Blueprint Dossier Frame */}
            <div className="pt-2">
              <div className="dossier-card overflow-hidden bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-12">
                  <div className="sm:col-span-7 relative min-h-[220px] bg-[#E6EAE4] border-b sm:border-b-0 sm:border-r border-[#0B1310] flex items-center justify-center p-4 select-none overflow-hidden">
                    <svg viewBox="0 0 320 180" className="w-full h-full text-[#0B1310]" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <defs>
                        <pattern id="arch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#C5CEC9" strokeWidth="0.5" strokeDasharray="2 2" />
                        </pattern>
                      </defs>
                      <rect width="320" height="180" fill="url(#arch-grid)" />
                      <rect x="25" y="20" width="270" height="140" fill="#FFFFFF" fillOpacity="0.85" stroke="#0B1310" strokeWidth="1.8" />
                      <rect x="40" y="35" width="115" height="110" fill="#E6F2EE" fillOpacity="0.7" stroke="#0F523E" strokeWidth="1.4" />
                      <text x="50" y="55" fill="#0F523E" fontSize="9" fontFamily="monospace" fontWeight="bold">SANCTUARY ZONE A</text>
                      <text x="50" y="70" fill="#3F4E48" fontSize="8" fontFamily="monospace">Acoustic Baffle: 48 dB</text>
                      <text x="50" y="85" fill="#3F4E48" fontSize="8" fontFamily="monospace">Pseudonymous Node</text>
                      <circle cx="97" cy="115" r="14" fill="#0F523E" fillOpacity="0.15" stroke="#0F523E" strokeWidth="1" />
                      <circle cx="97" cy="115" r="3" fill="#0F523E" />
                      <rect x="175" y="35" width="105" height="50" fill="#FFFFFF" stroke="#0B1310" strokeWidth="1.2" />
                      <text x="185" y="55" fill="#0B1310" fontSize="9" fontFamily="monospace" fontWeight="bold">LOCAL CORE</text>
                      <text x="185" y="70" fill="#3F4E48" fontSize="8" fontFamily="monospace">Zero External Calls</text>
                      <rect x="175" y="95" width="105" height="50" fill="#FEF2F2" stroke="#B91C1C" strokeWidth="1.2" strokeDasharray="3 2" />
                      <text x="185" y="115" fill="#B91C1C" fontSize="9" fontFamily="monospace" fontWeight="bold">REFERRAL GATE</text>
                      <text x="185" y="130" fill="#7F1D1D" fontSize="8" fontFamily="monospace">Tri-Condition Gate</text>
                    </svg>
                  </div>
                  <div className="sm:col-span-5 p-4 sm:p-5 flex flex-col justify-between bg-white">
                    <div>
                      <span className="font-mono text-[11px] font-bold text-[#0F523E] uppercase">
                        DOSSIER · BRD & PRD v0.4
                      </span>
                      <h2 className="text-sm font-bold text-[#0B1310] mt-1">
                        Pseudonymous By Construction
                      </h2>
                      <p className="text-xs text-[#3F4E48] mt-1.5 leading-relaxed">
                        No name, phone number, or account registration is collected. Every rule and referral stays inside this local synthetic workspace.
                      </p>
                    </div>
                    <div className="pt-3 mt-3 border-t border-[#C5CEC9] flex items-center justify-between text-[11px] font-mono text-[#0B1310]">
                      <span>SCHEMA: sanad-profile-0.1</span>
                      <span className="font-bold text-[#C84B31]">MOCK</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Interactive Case Launchpad Console */}
          <div className="lg:col-span-5 dossier-card p-5 sm:p-6 bg-white space-y-5 animate-reveal-2">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B1310]">
              <div>
                <h2 className="text-base font-extrabold text-[#0B1310] tracking-tight">
                  Initialize Synthetic Case
                </h2>
                <p className="text-xs text-[#3F4E48] font-mono">
                  POST /api/cases · Select entry path
                </p>
              </div>
              <div className="flex items-center border border-[#0B1310] rounded-[2px] bg-[#F3F4F1] p-0.5 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setPreferredLanguage('en')}
                  className={`px-2 py-0.5 rounded-[2px] cursor-pointer ${
                    preferredLanguage === 'en'
                      ? 'bg-[#0B1310] text-white font-bold'
                      : 'text-[#3F4E48]'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setPreferredLanguage('ar')}
                  className={`px-2 py-0.5 rounded-[2px] cursor-pointer ${
                    preferredLanguage === 'ar'
                      ? 'bg-[#0B1310] text-white font-bold'
                      : 'text-[#3F4E48]'
                  }`}
                >
                  AR
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-[2px] bg-[#FEF2F2] border border-[#B91C1C] text-[#7F1D1D] text-xs font-medium"
              >
                {error}
              </div>
            )}

            {samplesUnavailable && (
              <div className="p-3.5 rounded-[2px] bg-[#FFFBEB] border border-[#B45309] text-[#78350F] text-xs">
                Synthetic profiles could not be loaded. Start a blank assessment or retry.
                <button
                  type="button"
                  onClick={() => {
                    setSamplesUnavailable(false);
                    api
                      .getSamples()
                      .then(res => {
                        setSamples(res.samples);
                        setSelectedFixture(res.samples[0]?.fixture_id ?? '');
                      })
                      .catch(() => setSamplesUnavailable(true));
                  }}
                  className="ml-2 underline font-bold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Mode Switcher Tabs: SAMPLE | UPLOAD | BLANK */}
            <div
              role="tablist"
              aria-label="Case start mode"
              className="grid grid-cols-3 gap-1 bg-[#E6EAE4] p-1 rounded-[2px] border border-[#0B1310] font-mono text-xs"
            >
              {(['SAMPLE', 'UPLOAD', 'BLANK'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={startMode === mode}
                  onClick={() => {
                    setStartMode(mode);
                    setError(null);
                  }}
                  className={`py-2 px-2 rounded-[2px] font-bold transition-colors cursor-pointer ${
                    startMode === mode
                      ? 'bg-[#0B1310] text-white'
                      : 'text-[#3F4E48] hover:text-[#0B1310]'
                  }`}
                >
                  {mode === 'SAMPLE'
                    ? `Samples (${samples.length})`
                    : mode === 'UPLOAD'
                    ? 'Upload JSON'
                    : 'Blank Start'}
                </button>
              ))}
            </div>

            {/* Tab Panel 1: SAMPLE */}
            {startMode === 'SAMPLE' && (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {samples.map(s => {
                  const isSelected = selectedFixture === s.fixture_id;
                  return (
                    <button
                      key={s.fixture_id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedFixture(s.fixture_id)}
                      className={`w-full p-3.5 rounded-[2px] border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#E6F2EE] border-[#0F523E] ring-1 ring-[#0F523E]'
                          : 'bg-white border-[#C5CEC9] hover:border-[#0B1310]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-[2px] ${
                              isSelected ? 'bg-[#0F523E]' : 'bg-[#63736C]'
                            }`}
                          />
                          <h3 className="text-xs font-bold text-[#0B1310]">
                            {s.title} · Mock
                          </h3>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-[#0B1310] bg-[#E6EAE4] px-1.5 py-0.5 rounded-[2px] border border-[#0B1310]">
                          {s.fixture_id}
                        </span>
                      </div>
                      <p className="text-xs text-[#3F4E48] mt-1.5 leading-relaxed">
                        {s.description}
                      </p>
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={loading || samples.length === 0 || !selectedFixture}
                  onClick={() => void handleLaunchSample()}
                  className="w-full mt-2 py-3 px-4 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0B1310] hover:bg-[#0F523E] border border-[#0B1310] btn-press cursor-pointer disabled:opacity-50"
                >
                  {loading
                    ? 'Creating Sample Session...'
                    : `Start with ${selectedFixture || 'Selected'} Mock Profile →`}
                </button>
              </div>
            )}

            {/* Tab Panel 2: UPLOAD JSON (RF-02 / T1.7 / T1.10) */}
            {startMode === 'UPLOAD' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[#0B1310]">
                      CLOSED UPLOAD SCHEMA · RF-02
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-[#0B1310]">
                      MAX 256 KB
                    </span>
                  </div>
                  <p className="text-xs text-[#3F4E48] leading-relaxed">
                    Accepts synthetic JSON files conforming to{' '}
                    <code className="font-mono bg-white px-1 border border-[#C5CEC9]">
                      sanad-profile-0.1
                    </code>
                    . Rejects any free-text notes, names, or contact fields. The file is applied only after you grant assessment consent.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="synthetic-json-upload"
                    className="block text-xs font-mono font-bold text-[#0B1310] mb-1.5"
                  >
                    Select Synthetic Profile (.json)
                  </label>
                  <input
                    id="synthetic-json-upload"
                    type="file"
                    accept=".json,application/json"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      setError(null);
                    }}
                    className="w-full text-xs font-mono file:mr-3 file:py-2 file:px-3 file:rounded-[2px] file:border file:border-[#0B1310] file:bg-[#E6EAE4] file:text-[#0B1310] file:font-mono file:font-bold hover:file:bg-[#C5CEC9] border border-[#0B1310] p-2 bg-white rounded-[2px]"
                  />
                  {selectedFile && (
                    <p className="mt-1.5 text-xs font-mono text-[#0F523E] font-semibold">
                      Queued in memory: {selectedFile.name} ({selectedFile.size} bytes) · Mock
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleLoadSyntheticTemplateFile}
                    className="flex-1 py-2.5 px-3 rounded-[2px] font-mono font-bold text-xs text-[#0B1310] bg-[#E6EAE4] hover:bg-[#C5CEC9] border border-[#0B1310] btn-press cursor-pointer"
                  >
                    Load Synthetic J1+J3 JSON
                  </button>
                  <button
                    type="button"
                    disabled={loading || !selectedFile}
                    onClick={() => void handleStartUpload()}
                    className="flex-1 py-2.5 px-3 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] btn-press cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Starting Upload Flow...' : 'Continue to Consent →'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab Panel 3: BLANK START */}
            {startMode === 'BLANK' && (
              <div className="space-y-4">
                <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] space-y-2">
                  <span className="font-mono text-[11px] font-bold text-[#0F523E]">
                    CLEAN PSEUDONYMOUS SESSION · J1 / J3 / J4
                  </span>
                  <p className="text-xs text-[#3F4E48] leading-relaxed">
                    Starts a blank case with zero pre-filled facts. After consent and the safety check, you can enter manual lab observations (J3) or answer structured context questions directly.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleStartBlank()}
                  className="w-full py-3 px-4 rounded-[2px] font-mono font-bold text-xs text-white bg-[#0F523E] hover:bg-[#093B2C] border border-[#0B1310] btn-press cursor-pointer"
                >
                  {loading ? 'Creating Blank Case...' : 'Initialize Blank Case →'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: ARCHITECTURAL GOVERNANCE & INVARIANT STRIP (SVG MARKS) */}
      <section className="border-b border-[#0B1310] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#C5CEC9] border border-[#0B1310] rounded-[2px]">
            <div className="p-5 flex items-start gap-3.5">
              <svg className="w-6 h-6 text-[#0F523E] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="10" rx="1" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <h2 className="text-sm font-bold text-[#0B1310]">Pseudonymous Identity</h2>
                <p className="text-xs text-[#3F4E48] mt-1 leading-relaxed">
                  Per-tab session token in memory. Instant DOM and storage purge via Quick Exit.
                </p>
              </div>
            </div>

            <div className="p-5 flex items-start gap-3.5">
              <svg className="w-6 h-6 text-[#0F523E] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <div>
                <h2 className="text-sm font-bold text-[#0B1310]">Deterministic Rules First</h2>
                <p className="text-xs text-[#3F4E48] mt-1 leading-relaxed">
                  Draft safety checks run before intake. Unknown and declined answers never become normal.
                </p>
              </div>
            </div>

            <div className="p-5 flex items-start gap-3.5">
              <svg className="w-6 h-6 text-[#0F523E] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 3" />
              </svg>
              <div>
                <h2 className="text-sm font-bold text-[#0B1310]">Version-Bound Review</h2>
                <p className="text-xs text-[#3F4E48] mt-1 leading-relaxed">
                  Every simulated reviewer decision binds to a specific <code className="font-mono">case_version</code>.
                </p>
              </div>
            </div>

            <div className="p-5 flex items-start gap-3.5">
              <svg className="w-6 h-6 text-[#C84B31] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16v16H4z" />
                <path d="M9 9h6v6H9z" />
              </svg>
              <div>
                <h2 className="text-sm font-bold text-[#0B1310]">Tri-Condition Referral Gate</h2>
                <p className="text-xs text-[#3F4E48] mt-1 leading-relaxed">
                  <code className="font-mono">evaluate_gate</code> enforces user consent, reviewer approval, and policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: INTERACTIVE CLINICAL STATE MACHINE & PIPELINE EXPLORER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14 border-b border-[#0B1310]">
        <div className="max-w-2xl mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B1310] tracking-tight">
            End-to-End Prototype Architecture
          </h2>
          <p className="text-sm sm:text-base text-[#3F4E48] mt-2 leading-relaxed">
            Inspect how each stage of the E2E Workflow v0.4 enforces consent boundaries, epistemic honesty, and simulated clinical oversight.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Stage Selector Buttons (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-2.5">
            {PIPELINE_STAGES.map((stage, idx) => {
              const active = idx === activeStageIdx;
              return (
                <button
                  key={stage.code}
                  type="button"
                  onClick={() => setActiveStageIdx(idx)}
                  className={`w-full p-4 rounded-[2px] border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-[#0B1310] text-white border-[#0B1310] shadow-[4px_4px_0px_#0F523E]'
                      : 'bg-white text-[#0B1310] border-[#0B1310] hover:bg-[#E6EAE4]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-xs font-bold ${
                        active ? 'text-[#E6F2EE]' : 'text-[#0F523E]'
                      }`}
                    >
                      {stage.code}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-[2px] border ${
                        active
                          ? 'bg-[#0F523E] text-white border-white/30'
                          : 'bg-[#F3F4F1] text-[#3F4E48] border-[#C5CEC9]'
                      }`}
                    >
                      {stage.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold mt-1.5">{stage.title}</h3>
                </button>
              );
            })}
          </div>

          {/* Active Stage Dossier Detail (7 cols) */}
          <div className="lg:col-span-7 dossier-card bg-white p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#0B1310]">
                <div>
                  <span className="font-mono text-xs font-bold text-[#0F523E]">
                    {activeStage.code} · ACTIVE SPECIFICATION
                  </span>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0B1310] mt-1">
                    {activeStage.title}
                  </h3>
                </div>
                <MockBadge label={activeStage.badge} />
              </div>

              <p className="text-sm sm:text-base text-[#3F4E48] leading-relaxed">
                {activeStage.summary}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {activeStage.metrics.map(metric => (
                  <div
                    key={metric.label}
                    className="p-3.5 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310]"
                  >
                    <span className="block font-mono text-[10px] text-[#3F4E48] uppercase">
                      {metric.label}
                    </span>
                    <strong className="block text-xs font-mono font-bold text-[#0B1310] mt-1">
                      {metric.value}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-[#C5CEC9] grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-5 h-28 rounded-[2px] overflow-hidden border border-[#0B1310] bg-[#E6EAE4] flex items-center justify-center p-3 select-none">
                <svg viewBox="0 0 200 90" className="w-full h-full text-[#0B1310]" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="15" y="15" width="170" height="60" rx="2" fill="#FFFFFF" stroke="#0B1310" strokeWidth="1.5" />
                  <path d="M 35 45 L 75 45" stroke="#0F523E" strokeWidth="2" strokeDasharray="3 1" />
                  <circle cx="95" cy="45" r="14" fill="#E6F2EE" stroke="#0F523E" strokeWidth="1.4" />
                  <circle cx="95" cy="45" r="5" fill="#0F523E" />
                  <path d="M 115 45 L 165 45" stroke="#0F523E" strokeWidth="2" />
                  <rect x="160" y="30" width="10" height="30" fill="#0B1310" />
                  <text x="35" y="32" fill="#3F4E48" fontSize="7" fontFamily="monospace">SAMPLE FLOW</text>
                  <text x="80" y="72" fill="#0F523E" fontSize="7" fontFamily="monospace" fontWeight="bold">SYNTHETIC CORE</text>
                  <text x="140" y="72" fill="#3F4E48" fontSize="7" fontFamily="monospace">SENSOR</text>
                </svg>
              </div>
              <div className="sm:col-span-7 space-y-1">
                <span className="font-mono text-[11px] font-bold text-[#C84B31]">
                  INVARIANT GUARANTEE
                </span>
                <p className="text-xs text-[#3F4E48] leading-relaxed">
                  All clinical rules are tagged <code className="font-mono">CLINICAL_TBD</code>. A passing test suite verifies software behavior against the specification and never claims clinical validity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: CONCEPTUAL FHIR R4 & GOVERNANCE BOUNDARY MANIFEST */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="dossier-card bg-white p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#0B1310]">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0B1310] tracking-tight">
                Conceptual FHIR R4 Mapping & Boundary Ledger
              </h2>
              <p className="text-xs sm:text-sm text-[#3F4E48] mt-1">
                Manifest <code className="font-mono">sanad-fhir-r4-conceptual v0.1</code> · Status:{' '}
                <strong className="font-mono text-[#0B1310]">DESIGN_ONLY</strong> · Compliance:{' '}
                <strong className="font-mono text-[#C84B31]">NOT_EVALUATED</strong>
              </p>
            </div>
            <MockBadge label="MOCK · EXPORT DISABLED · NOT_EVALUATED" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] space-y-1.5">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-[#0F523E]">AssessmentCase</span>
                <span className="text-[#3F4E48]">→ Patient</span>
              </div>
              <p className="text-xs text-[#3F4E48] leading-relaxed">
                Uses a synthetic pseudonymous identifier only. Direct personal identity fields are omitted by design.
              </p>
            </div>

            <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] space-y-1.5">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-[#0F523E]">ClinicalObservation</span>
                <span className="text-[#3F4E48]">→ Observation</span>
              </div>
              <p className="text-xs text-[#3F4E48] leading-relaxed">
                Preserves test code, value, unit, source, and user confirmation status without automatic unit conversion.
              </p>
            </div>

            <div className="p-4 rounded-[2px] bg-[#F3F4F1] border border-[#0B1310] space-y-1.5">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-[#0F523E]">ConsentLedger</span>
                <span className="text-[#3F4E48]">→ Consent</span>
              </div>
              <p className="text-xs text-[#3F4E48] leading-relaxed">
                Conceptual mapping only. The server-side purpose consent ledger remains the active authorization gate.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
