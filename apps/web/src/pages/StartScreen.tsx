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

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Safety Check First',
    subtitle: 'Immediate medical triage',
    description:
      'We check for acute symptoms first. If any severe warning signs are detected, emergency guidance is provided instantly even when offline.',
    image: '/assets/images/medical_urgent_care_3d.jpg',
    alt: 'Immediate safety triage',
  },
  {
    step: '02',
    title: 'Private Questions',
    subtitle: 'Lifestyle & health history',
    description:
      'Answer a few straightforward lifestyle and health questions at your own pace. You can skip any question or choose Not Sure anytime.',
    image: '/assets/images/real_patient_peace_of_mind.jpg',
    alt: 'Private confidential consultation',
  },
  {
    step: '03',
    title: 'Lab Insights',
    subtitle: 'Standard semen analysis',
    description:
      'If you have semen analysis test results, enter your numbers to understand them against official clinical reference ranges without confusing medical jargon.',
    image: '/assets/images/real_clinical_lab.jpg',
    alt: 'Modern clinical lab diagnostics',
  },
  {
    step: '04',
    title: 'You Control Sharing',
    subtitle: 'Care navigation on your terms',
    description:
      'Receive an organized, confidential summary. No data is ever sent to a doctor or clinic unless you explicitly choose to connect.',
    image: '/assets/images/real_doctor_consultation.jpg',
    alt: 'Compassionate doctor consultation',
  },
];

const FAQS = [
  {
    question: 'Do you ask for my name, phone number, or identity?',
    answer:
      'Never. Sanad is anonymous by design. You do not need to register, provide an email address, or give a phone number. All session tokens are temporary and run privately in your browser.',
  },
  {
    question: 'Does this service provide a medical diagnosis?',
    answer:
      'No. Sanad is an informational research prototype. It helps you organize your health facts, compare lab values to reference standards, and prepare for a meaningful discussion with a licensed healthcare professional.',
  },
  {
    question: 'What if I am experiencing pain or an emergency?',
    answer:
      'If you experience sudden severe testicular pain, injury, or swelling with fever, tap Urgent Help at the top right immediately. Emergency care information is saved directly to your device and works even without internet.',
  },
  {
    question: 'How do I erase my session immediately if I need to leave?',
    answer:
      'Click Quick Exit in the top navigation bar at any moment. It will instantly wipe all answers, clear stored session tokens from your browser, and redirect you to a neutral blank page.',
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechAppendix, setShowTechAppendix] = useState<boolean>(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

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
      setError('Select an example profile before continuing.');
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
      setError('Select a synthetic profile JSON file to upload.');
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
    const file = new File([blob], 'synthetic-example-profile.json', {
      type: 'application/json',
    });
    setSelectedFile(file);
    setError(null);
  };

  return (
    <div className="w-full space-y-12 py-6 sm:py-10">
      {/* SECTION 1: ELEGANT, WARM, HUMAN HERO & QUICK START CONSOLE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="medical-canvas p-6 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left 7 Columns: Editorial Warmth, Trust & Reassurance */}
            <div className="lg:col-span-7 space-y-6 animate-reveal-1">
              {/* Trust Indicator & Offline Cache Status */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#EBF3FF] border border-[#BCD8FE] text-[#0066EE]">
                  <span className="w-2 h-2 rounded-full bg-[#0066EE] animate-pulse" />
                  Private & Anonymous Health Front Door
                </span>

                <span
                  role="status"
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#F8FAFD] border border-[#E2ECF8] text-[#4A6588]"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      emergencyCacheReady ? 'bg-[#12B76A]' : 'bg-[#F79009]'
                    }`}
                  />
                  {emergencyCacheReady
                    ? 'Emergency guidance ready offline'
                    : 'Preparing offline guidance...'}
                </span>
              </div>

              {/* Patient-Centric Headline */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#072254] leading-[1.12]">
                Clear, private answers for your reproductive health.
              </h1>

              {/* Empathetic Subtext */}
              <p className="text-base sm:text-lg text-[#4A6588] max-w-[56ch] font-normal leading-relaxed">
                Check symptoms, understand semen analysis results, and discover clear next steps with zero judgment. No account needed, no personal phone numbers, and full control over your privacy.
              </p>

              {/* Main Quick Action CTAs */}
              <div className="flex flex-wrap items-center gap-3.5 pt-1">
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
                  {loading ? 'Starting Assessment...' : 'Start Private Assessment →'}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleStartBlank()}
                  className="btn-pill-secondary px-6 py-3.5 text-sm"
                >
                  Start Fresh
                </button>
              </div>

              {/* Authentic Real-Life Photography Spotlight */}
              <div className="pt-2">
                <div className="medical-card overflow-hidden bg-white border border-[#E2ECF8] shadow-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-12 items-center">
                    <div className="sm:col-span-6 relative min-h-[190px] h-full overflow-hidden bg-[#0A3E8A]">
                      <img
                        src="/assets/images/real_doctor_consultation.jpg"
                        alt="Friendly empathetic doctor having a consultation with a male patient"
                        className="w-full h-full object-cover transform hover:scale-102 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#072254]/50 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute bottom-2.5 left-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/95 text-[#072254] shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0066EE]" />
                          Confidential Consultation
                        </span>
                      </div>
                    </div>
                    <div className="sm:col-span-6 p-5 flex flex-col justify-between bg-white">
                      <div>
                        <span className="text-xs font-bold text-[#0066EE] uppercase tracking-wide">
                          No Personal Identity Asked
                        </span>
                        <h2 className="text-sm font-bold text-[#072254] mt-1.5">
                          Private by Design
                        </h2>
                        <p className="text-xs text-[#4A6588] mt-1 leading-relaxed">
                          We do not ask for your real name, phone number, or government ID. Your session runs safely on your own device and is erased when you leave.
                        </p>
                      </div>
                      <div className="pt-3 mt-3 border-t border-[#E2ECF8] flex items-center justify-between text-xs text-[#4A6588]">
                        <span>Zero Commercial Tracking</span>
                        <span className="font-bold text-[#0066EE]">Confidential</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Compact & Intuitive Case Launchpad */}
            <div className="lg:col-span-5 medical-card p-6 sm:p-7 bg-white space-y-5 animate-reveal-2 border border-[#E2ECF8]">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#E2ECF8]">
                <div>
                  <h2 className="text-lg font-extrabold text-[#072254] tracking-tight">
                    Start Your Session
                  </h2>
                  <p className="text-xs text-[#829AB8] mt-0.5">
                    Choose how you want to begin
                  </p>
                </div>
                {/* Language Selector */}
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
                  Sample profiles are temporarily loading. You can start a fresh session immediately.
                </div>
              )}

              {/* Simplified Mode Tabs */}
              <div
                role="tablist"
                aria-label="Start Mode"
                className="grid grid-cols-3 gap-1 bg-[#EBF3FF] p-1 rounded-full border border-[#BCD8FE] text-xs"
              >
                {(['SAMPLE', 'BLANK', 'UPLOAD'] as StartModeTab[]).map(mode => (
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
                      ? 'Examples'
                      : mode === 'BLANK'
                      ? 'Fresh Start'
                      : 'Upload File'}
                  </button>
                ))}
              </div>

              {/* Tab Panel 1: EXAMPLE PROFILES */}
              {startMode === 'SAMPLE' && (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  <p className="text-xs text-[#4A6588] mb-1">
                    Select a realistic demonstration profile to experience the assessment flow immediately:
                  </p>
                  {samples.map(s => {
                    const isSelected = selectedFixture === s.fixture_id;
                    return (
                      <button
                        key={s.fixture_id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedFixture(s.fixture_id)}
                        className={`w-full p-3.5 rounded-xl border text-left cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.985] ${
                          isSelected
                            ? 'bg-[#EBF3FF] border-[#0066EE] ring-1 ring-[#0066EE] shadow-xs'
                            : 'bg-white border-[#E2ECF8] hover:border-[#BCD8FE]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
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
                          <span className="text-[10px] font-mono text-[#0066EE] bg-white px-2 py-0.5 rounded-full border border-[#BCD8FE]">
                            {s.fixture_id}
                          </span>
                        </div>
                        <p className="text-xs text-[#4A6588] mt-1 leading-relaxed">
                          {s.description}
                        </p>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={loading || samples.length === 0}
                    onClick={() => void handleLaunchSample()}
                    className="btn-pill-primary w-full py-3.5 px-4 text-xs font-bold mt-2"
                  >
                    {loading ? 'Loading Case...' : 'Explore Selected Example →'}
                  </button>
                </div>
              )}

              {/* Tab Panel 2: FRESH START */}
              {startMode === 'BLANK' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
                    <span className="text-xs font-bold text-[#0066EE]">
                      Fresh, Blank Assessment
                    </span>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      Starts a clean assessment from scratch with zero pre-filled data. You will review purpose consent, complete an immediate safety check, and answer questions at your own comfort level.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleStartBlank()}
                    className="btn-pill-primary w-full py-3.5 px-4 text-xs font-bold"
                  >
                    {loading ? 'Creating Assessment...' : 'Begin Blank Assessment →'}
                  </button>
                </div>
              )}

              {/* Tab Panel 3: UPLOAD FILE */}
              {startMode === 'UPLOAD' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-2">
                    <span className="text-xs font-bold text-[#0066EE]">
                      Import Synthetic Record
                    </span>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      Load a structured synthetic test profile in JSON format. Personal identifying fields and contact records are excluded by design.
                    </p>
                  </div>

                  <div>
                    <input
                      id="synthetic-json-upload"
                      type="file"
                      accept=".json,application/json"
                      onChange={e => {
                        const file = e.target.files?.[0] ?? null;
                        setSelectedFile(file);
                        setError(null);
                      }}
                      className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#0066EE] file:text-white file:font-semibold hover:file:bg-[#0050D0] border border-[#E2ECF8] p-2 bg-white rounded-xl"
                    />
                    {selectedFile && (
                      <p className="mt-2 text-xs text-[#0066EE] font-semibold">
                        Ready to load: {selectedFile.name} ({selectedFile.size} bytes)
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      onClick={handleLoadSyntheticTemplateFile}
                      className="btn-pill-secondary flex-1 py-3 px-3 text-xs"
                    >
                      Use Sample JSON
                    </button>
                    <button
                      type="button"
                      disabled={loading || !selectedFile}
                      onClick={() => void handleStartUpload()}
                      className="btn-pill-primary flex-1 py-3 px-3 text-xs disabled:opacity-50"
                    >
                      {loading ? 'Starting...' : 'Continue with File →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: 4 SIMPLE, COMPACT STEPS WITH REAL-LIFE PHOTOGRAPHY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="text-xs font-bold text-[#0066EE] uppercase tracking-wider bg-[#EBF3FF] px-3 py-1 rounded-full border border-[#BCD8FE]">
            How Sanad Works
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight mt-3">
            Four simple steps to clear, confidential guidance.
          </h2>
          <p className="text-sm sm:text-base text-[#4A6588] mt-2">
            Designed for real people: straightforward, respectful, and easy to complete in under 5 minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {HOW_IT_WORKS_STEPS.map(item => (
            <div
              key={item.step}
              className="medical-card overflow-hidden bg-white border border-[#E2ECF8] flex flex-col justify-between"
            >
              <div>
                <div className="h-40 w-full overflow-hidden relative bg-[#EBF3FF]">
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="w-full h-full object-cover transform hover:scale-103 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0066EE] text-white font-bold text-xs shadow-xs">
                      {item.step}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <span className="text-[11px] font-semibold text-[#0066EE] uppercase tracking-wide">
                    {item.subtitle}
                  </span>
                  <h3 className="text-base font-bold text-[#072254] mt-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#4A6588] mt-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: REAL-LIFE LIFESTYLE & PATIENT REASSURANCE BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="medical-card bg-gradient-to-r from-[#0F3D7C] to-[#0A2E62] text-white p-8 sm:p-10 rounded-3xl overflow-hidden relative shadow-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            <div className="lg:col-span-7 space-y-4">
              <span className="text-xs font-semibold text-[#BCD8FE] uppercase tracking-wider bg-white/10 px-3 py-1 rounded-full border border-white/20">
                Peace of Mind
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug">
                Take the first step in the comfort and privacy of your own home.
              </h2>
              <p className="text-sm sm:text-base text-[#D0E1F9] leading-relaxed max-w-xl">
                Men often delay health conversations out of hesitation or privacy concerns. Sanad gives you an unhurried, pressure-free way to understand your situation before talking to anyone.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void handleStartBlank()}
                  className="btn-pill-primary px-6 py-3 text-sm bg-white text-[#0066EE] hover:bg-[#EBF3FF]"
                >
                  Start Your Private Check →
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 h-64 rounded-2xl overflow-hidden border border-white/20 shadow-lg">
              <img
                src="/assets/images/real_patient_peace_of_mind.jpg"
                alt="Man reviewing health insights peacefully at home"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: FREQUENTLY ASKED QUESTIONS (HUMAN, PLAIN LANGUAGE) */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <span className="text-xs font-bold text-[#0066EE] uppercase tracking-wider bg-[#EBF3FF] px-3 py-1 rounded-full border border-[#BCD8FE]">
            Common Questions
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#072254] tracking-tight mt-3">
            Everything you need to know about your privacy.
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={faq.question}
                className="medical-card p-5 sm:p-6 bg-white border border-[#E2ECF8] rounded-2xl transition-[border-color,box-shadow] duration-160 ease-[var(--ease-out)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                >
                  <h3 className="text-sm sm:text-base font-bold text-[#072254]">
                    {faq.question}
                  </h3>
                  <span className="w-6 h-6 rounded-full bg-[#EBF3FF] text-[#0066EE] font-bold text-sm flex items-center justify-center shrink-0">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <p className="text-xs sm:text-sm text-[#4A6588] mt-3 pt-3 border-t border-[#E2ECF8] leading-relaxed">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 5: DISCRETE TECHNICAL & ARCHITECTURAL APPENDIX (COLLAPSIBLE FOR RESEARCHERS & DEVELOPERS) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <div className="border-t border-[#E2ECF8] pt-6 text-center">
          <button
            type="button"
            onClick={() => setShowTechAppendix(!showTechAppendix)}
            className="text-xs font-mono font-semibold text-[#829AB8] hover:text-[#0066EE] transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>{showTechAppendix ? '▲ Hide' : '▼ View'} Technical Specifications & FHIR R4 Conceptual Ledger</span>
          </button>
        </div>

        {showTechAppendix && (
          <div className="medical-canvas p-6 sm:p-8 mt-6 animate-reveal-1">
            <div className="pb-4 border-b border-[#E2ECF8]">
              <h3 className="text-base font-bold text-[#072254]">
                Technical Architecture & Conceptual FHIR R4 Mapping Manifest
              </h3>
              <p className="text-xs text-[#829AB8] font-mono mt-1">
                Manifest sanad-fhir-r4-conceptual v0.1 • Status: Research Specification • Compliance: Evaluated under Golden Rules
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-1.5">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-[#0066EE]">AssessmentCase</span>
                  <span className="text-[#829AB8]">→ Patient</span>
                </div>
                <p className="text-xs text-[#4A6588] leading-relaxed">
                  Uses synthetic pseudonym identifiers only. Direct identity fields omitted by design to guarantee privacy.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-1.5">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-[#0066EE]">ClinicalObservation</span>
                  <span className="text-[#829AB8]">→ Observation</span>
                </div>
                <p className="text-xs text-[#4A6588] leading-relaxed">
                  Preserves semen parameters, test codes, and units without unapproved automatic conversions.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFD] border border-[#E2ECF8] space-y-1.5">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-[#0066EE]">ConsentLedger</span>
                  <span className="text-[#829AB8]">→ Consent</span>
                </div>
                <p className="text-xs text-[#4A6588] leading-relaxed">
                  Dual gatekeeper policy: consent, role, and case version are strictly checked on the backend server.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
