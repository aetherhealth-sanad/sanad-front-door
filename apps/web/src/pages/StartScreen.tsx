import { useEffect, useState } from 'react';
import { api, setPendingUploadFile, type SampleProfile } from '../api/client';

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

  const handleLaunchSample = async () => {
    if (!selectedFixture) {
      setError('Select a synthetic profile fixture before continuing.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.createCase('SAMPLE', selectedFixture, preferredLanguage);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'SAMPLE');
      sessionStorage.setItem('sanad_case_fixture_id', selectedFixture);
      onCaseCreated(res.case_id, res.state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create sample case.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBlank = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.createCase('BLANK', undefined, preferredLanguage);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'BLANK');
      onCaseCreated(res.case_id, res.state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create blank case.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) {
      setError('Select a synthetic profile JSON file to queue in memory.');
      return;
    }
    if (selectedFile.size > 256 * 1024) {
      setError('File exceeds maximum upload size (256 KB).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setPendingUploadFile(selectedFile);
      const res = await api.createCase('UPLOAD', undefined, preferredLanguage);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'UPLOAD');
      onCaseCreated(res.case_id, res.state.route);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create upload case.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSyntheticTemplateFile = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_UPLOAD_TEMPLATE, null, 2)], {
      type: 'application/json',
    });
    const file = new File([blob], 'synthetic-j1-j3-template.json', {
      type: 'application/json',
    });
    setSelectedFile(file);
    setError(null);
  };

  const activeStage = PIPELINE_STAGES[activeStageIdx];

  return (
    <div className="w-full space-y-10 py-6 sm:py-10">
      {/* SECTION 1: MASTER FLOATING MEDICAL HERO & CASE LAUNCHPAD */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="medical-canvas p-6 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left 7 Columns: Editorial & Bio-Medical Brand Vision */}
            <div className="lg:col-span-7 space-y-6 animate-reveal-1">
              {/* Brand & Offline Cache Pill Strip */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EBF3FF] border border-[#BCD8FE] text-[#0066EE]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0066EE]" />
                  AetherHealth Research Prototype
                </span>
                <span
                  role="status"
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-[#EBF3FF] border border-[#BCD8FE] text-[#0066EE]"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      emergencyCacheReady ? 'bg-[#0066EE] animate-pulse' : 'bg-[#D92D20]'
                    }`}
                  />
                  {emergencyCacheReady
                    ? 'Emergency guidance precached offline'
                    : 'Preparing offline guidance cache...'}
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold tracking-tight text-[#072254] leading-[1.08]">
                A private research front door for men's health.
              </h1>

              {/* Subtext */}
              <p className="text-base sm:text-lg text-[#4A6588] max-w-[54ch] font-normal leading-relaxed">
                Explore purpose consent, deterministic safety checks, and simulated referral gates with synthetic profiles. Zero external model calls.
              </p>

              {/* Primary & Secondary CTAs */}
              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <button
                  type="button"
                  disabled={loading || (startMode === 'SAMPLE' && (samples.length === 0 || !selectedFixture))}
                  onClick={() => {
                    if (startMode === 'UPLOAD') void handleStartUpload();
                    else if (startMode === 'BLANK') void handleStartBlank();
                    else void handleLaunchSample();
                  }}
                  className="btn-pill-primary px-7 py-3.5 text-sm disabled:opacity-50"
                >
                  {loading ? 'Initializing Case...' : 'Launch Mock Assessment →'}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleStartBlank()}
                  className="btn-pill-secondary px-6 py-3.5 text-sm"
                >
                  Blank Assessment
                </button>
              </div>

              {/* Bio-Medical 3D Science & Trust Card */}
              <div className="pt-3">
                <div className="medical-card overflow-hidden bg-white border border-[#E2ECF8] shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-12 items-center">
                    <div className="sm:col-span-6 relative min-h-[190px] h-full overflow-hidden bg-[#0A3E8A]">
                      <img
                        src="/assets/images/medical_hero_3d.jpg"
                        alt="3D Molecular DNA and Cellular Biology Visualization"
                        className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#072254]/60 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute bottom-2.5 left-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/90 text-[#072254] backdrop-blur-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0066EE]" />
                          RESEARCH PROTOTYPE · 2026
                        </span>
                      </div>
                    </div>
                    <div className="sm:col-span-6 p-5 flex flex-col justify-between bg-white">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-[#0066EE] uppercase bg-[#EBF3FF] px-2.5 py-0.5 rounded-full">
                          PRIVATE & USER-CENTERED
                        </span>
                        <h2 className="text-sm font-bold text-[#072254] mt-2.5">
                          Pseudonymous by Construction
                        </h2>
                        <p className="text-xs text-[#4A6588] mt-1.5 leading-relaxed">
                          No names, email addresses, or phone numbers are ever asked. Your assessment runs in a secure, ephemeral session on your device.
                        </p>
                      </div>
                      <div className="pt-3 mt-3 border-t border-[#E2ECF8] flex items-center justify-between text-[11px] font-mono text-[#072254]">
                        <span className="text-[#829AB8]">Local Storage Only</span>
                        <span className="font-bold text-[#0066EE]">MOCK</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Interactive Case Launchpad Console */}
            <div className="lg:col-span-5 medical-card p-6 sm:p-7 bg-white space-y-5 animate-reveal-2 border border-[#E2ECF8]">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#E2ECF8]">
                <div>
                  <h2 className="text-lg font-extrabold text-[#072254] tracking-tight">
                    Initialize Synthetic Case
                  </h2>
                  <p className="text-xs text-[#829AB8] font-mono mt-0.5">
                    POST /api/cases • Select entry path
                  </p>
                </div>
                <div className="flex items-center border border-[#BCD8FE] rounded-full bg-[#EBF3FF] p-1 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setPreferredLanguage('en')}
                    className={`px-3 py-1 rounded-full cursor-pointer transition-[background-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] ${
                      preferredLanguage === 'en'
                        ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                        : 'text-[#4A6588]'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredLanguage('ar')}
                    className={`px-3 py-1 rounded-full cursor-pointer transition-[background-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] ${
                      preferredLanguage === 'ar'
                        ? 'bg-[#0066EE] text-white font-bold shadow-xs'
                        : 'text-[#4A6588]'
                    }`}
                  >
                    AR
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] text-xs font-medium"
                >
                  {error}
                </div>
              )}

              {samplesUnavailable && (
                <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FEDF89] text-[#B54708] text-xs">
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
                className="grid grid-cols-3 gap-1 bg-[#EBF3FF] p-1.5 rounded-full border border-[#BCD8FE] font-mono text-xs"
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
                    className={`py-2 px-2 rounded-full font-bold transition-[background-color,color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer text-center ${
                      startMode === mode
                        ? 'bg-[#0066EE] text-white shadow-xs'
                        : 'text-[#4A6588] hover:text-[#072254]'
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
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {samples.map(s => {
                    const isSelected = selectedFixture === s.fixture_id;
                    return (
                      <button
                        key={s.fixture_id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedFixture(s.fixture_id)}
                        className={`w-full p-4 rounded-xl border text-left cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] ${
                          isSelected
                            ? 'bg-[#EBF3FF] border-[#0066EE] ring-1 ring-[#0066EE] shadow-xs'
                            : 'bg-white border-[#E2ECF8] hover:border-[#BCD8FE]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isSelected ? 'bg-[#0066EE]' : 'bg-[#829AB8]'
                              }`}
                            />
                            <h3 className="text-xs font-bold text-[#072254]">
                              {s.title}
                            </h3>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-[#0066EE] bg-[#EBF3FF] px-2 py-0.5 rounded-full border border-[#BCD8FE]">
                            {s.fixture_id}
                          </span>
                        </div>
                        <p className="text-xs text-[#4A6588] mt-1.5 leading-relaxed">
                          {s.description}
                        </p>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={loading || samples.length === 0 || !selectedFixture}
                    onClick={() => void handleLaunchSample()}
                    className="btn-pill-primary w-full mt-2 py-3.5 px-4 text-xs font-bold disabled:opacity-50"
                  >
                    {loading
                      ? 'Creating Sample Session...'
                      : `Start with ${selectedFixture || 'Selected'} Mock Profile →`}
                  </button>
                </div>
              )}

              {/* Tab Panel 2: UPLOAD JSON */}
              {startMode === 'UPLOAD' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-[#0066EE]">
                        CLOSED UPLOAD SCHEMA · RF-02
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-white border border-[#BCD8FE] rounded-full text-[#072254]">
                        MAX 256 KB
                      </span>
                    </div>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      Accepts synthetic JSON files conforming to{' '}
                      <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#E2ECF8] text-[#072254]">
                        sanad-profile-0.1
                      </code>
                      . Rejects any free-text notes, names, or contact fields.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="synthetic-json-upload"
                      className="block text-xs font-mono font-bold text-[#072254] mb-2"
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
                      className="w-full text-xs font-mono file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#0066EE] file:text-white file:font-mono file:font-bold hover:file:bg-[#0050D0] border border-[#E2ECF8] p-2 bg-white rounded-xl"
                    />
                    {selectedFile && (
                      <p className="mt-2 text-xs font-mono text-[#0066EE] font-semibold">
                        Queued in memory: {selectedFile.name} ({selectedFile.size} bytes) • Mock
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      onClick={handleLoadSyntheticTemplateFile}
                      className="btn-pill-secondary flex-1 py-3 px-3 text-xs"
                    >
                      Load Synthetic J1+J3 JSON
                    </button>
                    <button
                      type="button"
                      disabled={loading || !selectedFile}
                      onClick={() => void handleStartUpload()}
                      className="btn-pill-primary flex-1 py-3 px-3 text-xs disabled:opacity-50"
                    >
                      {loading ? 'Starting Upload...' : 'Continue to Consent →'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Panel 3: BLANK START */}
              {startMode === 'BLANK' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
                    <span className="font-mono text-[11px] font-bold text-[#0066EE]">
                      CLEAN PSEUDONYMOUS SESSION · J1 / J3 / J4
                    </span>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      Starts a blank case with zero pre-filled facts. After consent and the safety check, you can enter manual lab observations (J3) or answer structured context questions directly.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleStartBlank()}
                    className="btn-pill-primary w-full py-3.5 px-4 text-xs font-bold"
                  >
                    {loading ? 'Creating Blank Case...' : 'Initialize Blank Case →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: ARCHITECTURAL GOVERNANCE STRIP */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="medical-card p-5 flex items-start gap-4">
            <img
              src="/assets/images/medical_shield_3d.jpg"
              alt="Medical Data Shield"
              className="w-12 h-12 rounded-xl object-cover border border-[#BCD8FE] shadow-xs shrink-0"
            />
            <div>
              <h2 className="text-sm font-bold text-[#072254]">Absolute Session Privacy</h2>
              <p className="text-xs text-[#4A6588] mt-1 leading-relaxed">
                Ephemeral token in memory. No registration or cookies, and an instant data wipe via Quick Exit.
              </p>
            </div>
          </div>

          <div className="medical-card p-5 flex items-start gap-4">
            <img
              src="/assets/images/medical_doctor_avatar.jpg"
              alt="Clinical Specialist Guidance"
              className="w-12 h-12 rounded-xl object-cover border border-[#BCD8FE] shadow-xs shrink-0"
            />
            <div>
              <h2 className="text-sm font-bold text-[#072254]">Guided Clinical Intake</h2>
              <p className="text-xs text-[#4A6588] mt-1 leading-relaxed">
                Empathetic, structured questions designed around men's health with clear opt-out options.
              </p>
            </div>
          </div>

          <div className="medical-card p-5 flex items-start gap-4">
            <img
              src="/assets/images/medical_lab_3d.jpg"
              alt="Lab Diagnostics"
              className="w-12 h-12 rounded-xl object-cover border border-[#BCD8FE] shadow-xs shrink-0"
            />
            <div>
              <h2 className="text-sm font-bold text-[#072254]">Objective Lab Observations</h2>
              <p className="text-xs text-[#4A6588] mt-1 leading-relaxed">
                Analyze semen parameters against standard reference ranges without arbitrary predictions.
              </p>
            </div>
          </div>

          <div className="medical-card p-5 flex items-start gap-4">
            <img
              src="/assets/images/medical_urgent_care_3d.jpg"
              alt="Safety and Referral Gate"
              className="w-12 h-12 rounded-xl object-cover border border-[#FECDCA] shadow-xs shrink-0"
            />
            <div>
              <h2 className="text-sm font-bold text-[#072254]">Clinical Referral Gate</h2>
              <p className="text-xs text-[#4A6588] mt-1 leading-relaxed">
                Referrals require active patient consent and clinician approval. Offline emergency care always accessible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: INTERACTIVE CLINICAL STATE MACHINE & PIPELINE EXPLORER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="medical-canvas p-6 sm:p-10">
          <div className="max-w-2xl mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight">
              End-to-End Prototype Architecture
            </h2>
            <p className="text-sm sm:text-base text-[#4A6588] mt-2 leading-relaxed">
              Inspect how each stage of the E2E Workflow v0.4 enforces consent boundaries, epistemic honesty, and simulated clinical oversight.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Stage Selector Buttons */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-3">
              {PIPELINE_STAGES.map((stage, idx) => {
                const active = idx === activeStageIdx;
                return (
                  <button
                    key={stage.code}
                    type="button"
                    onClick={() => setActiveStageIdx(idx)}
                    className={`w-full p-4 rounded-xl border text-left transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] cursor-pointer ${
                      active
                        ? 'bg-[#0066EE] text-white border-[#0066EE] shadow-sm'
                        : 'bg-white text-[#072254] border-[#E2ECF8] hover:bg-[#EBF3FF]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-xs font-bold ${
                          active ? 'text-white' : 'text-[#0066EE]'
                        }`}
                      >
                        {stage.code}
                      </span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${
                          active
                            ? 'bg-white/20 text-white border-white/30'
                            : 'bg-[#EBF3FF] text-[#0066EE] border-[#BCD8FE]'
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

            {/* Active Stage Detail */}
            <div className="lg:col-span-7 medical-card p-6 sm:p-8 flex flex-col justify-between bg-white border border-[#E2ECF8]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#E2ECF8]">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#0066EE]">
                      {activeStage.code} · ACTIVE SPECIFICATION
                    </span>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-[#072254] mt-1">
                      {activeStage.title}
                    </h3>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-[#4A6588] leading-relaxed">
                  {activeStage.summary}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {activeStage.metrics.map(metric => (
                    <div
                      key={metric.label}
                      className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8]"
                    >
                      <span className="block font-mono text-[10px] text-[#829AB8] uppercase">
                        {metric.label}
                      </span>
                      <strong className="block text-xs font-mono font-bold text-[#072254] mt-1">
                        {metric.value}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-[#E2ECF8] grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-5 h-24 rounded-xl overflow-hidden border border-[#BCD8FE] relative">
                  <img
                    src="/assets/images/medical_lab_3d.jpg"
                    alt="Clinical Specification Diagnostics"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#072254]/50 to-transparent flex items-end p-2">
                    <span className="font-mono text-[10px] text-white font-bold bg-[#0066EE]/80 px-2 py-0.5 rounded-full">
                      DETERMINISTIC ENGINE · MOCK
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-7 space-y-1">
                  <span className="font-mono text-[11px] font-bold text-[#0066EE]">
                    INVARIANT GUARANTEE
                  </span>
                  <p className="text-xs text-[#4A6588] leading-relaxed">
                    All clinical rules are tagged <code className="font-mono text-[#0066EE]">CLINICAL_TBD</code>. A passing test suite verifies software behavior against the specification and never claims clinical validity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: CONCEPTUAL FHIR R4 & GOVERNANCE BOUNDARY MANIFEST */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="medical-canvas p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E2ECF8]">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#072254] tracking-tight">
                Conceptual FHIR R4 Mapping & Boundary Ledger
              </h2>
              <p className="text-xs sm:text-sm text-[#4A6588] mt-1">
                Manifest <code className="font-mono text-[#0066EE]">sanad-fhir-r4-conceptual v0.1</code> · Status:{' '}
                <strong className="font-mono text-[#072254]">DESIGN_ONLY</strong> · Compliance:{' '}
                <strong className="font-mono text-[#D92D20]">NOT_EVALUATED</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="p-5 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-[#0066EE]">AssessmentCase</span>
                <span className="text-[#829AB8]">→ Patient</span>
              </div>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Uses a synthetic pseudonymous identifier only. Direct personal identity fields are omitted by design.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-[#0066EE]">ClinicalObservation</span>
                <span className="text-[#829AB8]">→ Observation</span>
              </div>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Preserves test code, value, unit, source, and user confirmation status without automatic unit conversion.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-[#0066EE]">ConsentLedger</span>
                <span className="text-[#829AB8]">→ Consent</span>
              </div>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Conceptual mapping only. The server-side purpose consent ledger remains the active authorization gate.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
