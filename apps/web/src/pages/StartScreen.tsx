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
    <div className="w-full space-y-10 py-5 sm:py-8 pb-8">
      {/* ══ HERO: Mobile-first, two-column on large screens ══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-5">
        <div className="medical-canvas p-5 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">

            {/* ── Left: Trust copy & CTAs ── */}
            <div className="lg:col-span-7 space-y-5 animate-reveal-1">
              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EBF4FF] border border-[#BAD6FE] text-[#0062FF]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF] glow-pulse" />
                  Private & Anonymous
                </span>
                <span
                  role="status"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#F6F9FF] border border-[#E2ECF8] text-[#4A6588]"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      emergencyCacheReady ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
                    }`}
                  />
                  {emergencyCacheReady
                    ? 'Emergency guidance cached offline'
                    : 'Preparing offline cache…'}
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-[28px] sm:text-4xl lg:text-[44px] font-extrabold tracking-tight text-[#07215A] leading-[1.1] text-balance">
                Clear, private answers for your men's health.
              </h1>

              {/* Sub-copy */}
              <p className="text-base sm:text-lg text-[#4A6588] max-w-[52ch] leading-relaxed text-pretty">
                Check symptoms, understand semen analysis results, and find clear next steps - with zero judgment. No account, no phone number, full control.
              </p>

              {/* Primary CTAs */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={loading || (startMode === 'SAMPLE' && (samples.length === 0 || !selectedFixture))}
                  onClick={() => {
                    if (startMode === 'UPLOAD') void handleStartUpload();
                    else if (startMode === 'BLANK') void handleStartBlank();
                    else void handleLaunchSample();
                  }}
                  className="btn-pill-primary px-7 py-3.5 text-sm"
                >
                  {loading ? (
                    <span className="flex items-center gap-2.5">
                      <span className="spinner spinner-sm spinner-white" />
                      Starting…
                    </span>
                  ) : (
                    'Start Private Assessment →'
                  )}
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

              {/* Trust card - private by design */}
              <div className="medical-card overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch">
                  {/* Photo side */}
                  <div className="relative h-40 sm:h-full overflow-hidden" style={{ background: '#0A3882', minHeight: 160 }}>
                    <img
                      src="/assets/images/real_doctor_consultation.jpg"
                      alt="Compassionate doctor in a private consultation"
                      className="w-full h-full object-cover"
                      style={{ transition: 'transform 0.6s var(--ease-out)' }}
                      onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.04)'; }}
                      onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07215A]/55 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/95 text-[#07215A]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0062FF]" />
                        Confidential
                      </span>
                    </div>
                  </div>
                  {/* Text side */}
                  <div className="p-5 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#0062FF] uppercase tracking-wide">No identity required</span>
                      <h2 className="text-sm font-bold text-[#07215A] mt-1.5">Private by Design</h2>
                      <p className="text-xs text-[#4A6588] mt-1.5 leading-relaxed">
                        No real name, phone number, or ID ever asked. Your session runs privately on your device and is erased when you leave.
                      </p>
                    </div>
                    <div className="pt-3 mt-3 border-t border-[#E2ECF8] flex items-center justify-between text-xs text-[#829AB8]">
                      <span>Zero commercial tracking</span>
                      <span className="font-bold text-[#0062FF]">Session-only</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right: Session Launchpad ── */}
            <div className="lg:col-span-5 medical-card p-5 sm:p-6 space-y-4 animate-reveal-2">
              {/* Card header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#E2ECF8]">
                <div>
                  <h2 className="text-[17px] font-extrabold text-[#07215A] tracking-tight">Start Your Session</h2>
                  <p className="text-xs text-[#829AB8] mt-0.5">Choose how you want to begin</p>
                </div>
                {/* Language toggle */}
                <div className="flex items-center bg-[#EBF4FF] border border-[#BAD6FE] rounded-full p-1 text-[11px] font-mono gap-0.5">
                  {(['en', 'ar'] as const).map(lang => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setPreferredLanguage(lang)}
                      className={`px-2.5 py-1 rounded-full cursor-pointer transition-all duration-150 active:scale-95 uppercase font-bold ${
                        preferredLanguage === lang
                          ? 'bg-[#0062FF] text-white'
                          : 'text-[#4A6588] hover:text-[#07215A]'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl text-xs font-medium animate-reveal-1"
                  style={{ background: '#FFF1F0', border: '1px solid #FFCCC7', color: '#D92D20' }}
                >
                  {error}
                </div>
              )}

              {samplesUnavailable && (
                <div className="p-3 rounded-xl text-xs" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                  Sample profiles temporarily loading. You can start fresh immediately.
                </div>
              )}

              {/* Mode tabs */}
              <div
                role="tablist"
                aria-label="Start mode"
                className="grid grid-cols-3 gap-1 bg-[#EBF4FF] p-1 rounded-full border border-[#BAD6FE] text-xs"
              >
                {(['SAMPLE', 'BLANK', 'UPLOAD'] as StartModeTab[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={startMode === mode}
                    onClick={() => { setStartMode(mode); setError(null); }}
                    className={`py-2 px-1 rounded-full font-bold cursor-pointer text-center transition-all duration-150 active:scale-95 ${
                      startMode === mode
                        ? 'bg-[#0062FF] text-white'
                        : 'text-[#4A6588] hover:text-[#07215A]'
                    }`}
                    style={startMode === mode ? { boxShadow: '0 2px 8px -2px rgba(0,98,255,0.4)' } : {}}
                  >
                    {mode === 'SAMPLE' ? 'Examples' : mode === 'BLANK' ? 'Fresh Start' : 'Upload'}
                  </button>
                ))}
              </div>

              {/* Tab Panel: SAMPLE */}
              {startMode === 'SAMPLE' && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-0.5 no-scrollbar">
                  <p className="text-xs text-[#4A6588]">Select a demonstration profile:</p>

                  {/* Skeleton while loading */}
                  {samples.length === 0 && !samplesUnavailable && (
                    <div className="space-y-2.5">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="rounded-xl border border-[#E2ECF8] p-3.5 space-y-2">
                          <div className="skeleton h-3 w-2/3" />
                          <div className="skeleton h-2.5 w-full" />
                          <div className="skeleton h-2.5 w-4/5" />
                        </div>
                      ))}
                    </div>
                  )}

                  {samples.map(s => {
                    const isSelected = selectedFixture === s.fixture_id;
                    return (
                      <button
                        key={s.fixture_id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedFixture(s.fixture_id)}
                        className={`w-full p-3.5 rounded-xl border text-left cursor-pointer interactive-option ${
                          isSelected
                            ? 'bg-[#EBF4FF] border-[#0062FF] ring-1 ring-[#0062FF]'
                            : 'bg-white border-[#E2ECF8] hover:border-[#BAD6FE]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isSelected ? 'bg-[#0062FF]' : 'bg-[#C4D4E8]'
                              }`}
                            />
                            <h3 className="text-xs font-bold text-[#07215A]">{s.title}</h3>
                          </div>
                          <span className="text-[10px] font-mono text-[#0062FF] bg-white px-2 py-0.5 rounded-full border border-[#BAD6FE] shrink-0">
                            {s.fixture_id}
                          </span>
                        </div>
                        <p className="text-xs text-[#4A6588] mt-1.5 leading-relaxed">{s.description}</p>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={loading || samples.length === 0}
                    onClick={() => void handleLaunchSample()}
                    className="btn-pill-primary w-full py-3.5 px-4 text-xs font-bold mt-1"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2 justify-center">
                        <span className="spinner spinner-sm spinner-white" />
                        Loading…
                      </span>
                    ) : 'Explore Selected Example →'}
                  </button>
                </div>
              )}

              {/* Tab Panel: BLANK */}
              {startMode === 'BLANK' && (
                <div className="space-y-4 animate-reveal-1">
                  <div className="p-4 rounded-xl space-y-1.5" style={{ background: '#F4F8FF', border: '1px solid #E2ECF8' }}>
                    <span className="text-xs font-bold text-[#0062FF]">Fresh, Blank Assessment</span>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      Starts clean with zero pre-filled data. You'll consent, complete a safety check, and answer questions at your pace.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleStartBlank()}
                    className="btn-pill-primary w-full py-3.5 px-4 text-xs font-bold"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2 justify-center">
                        <span className="spinner spinner-sm spinner-white" />
                        Creating…
                      </span>
                    ) : 'Begin Blank Assessment →'}
                  </button>
                </div>
              )}

              {/* Tab Panel: UPLOAD */}
              {startMode === 'UPLOAD' && (
                <div className="space-y-4 animate-reveal-1">
                  <div className="p-4 rounded-xl space-y-1.5" style={{ background: '#F4F8FF', border: '1px solid #E2ECF8' }}>
                    <span className="text-xs font-bold text-[#0062FF]">Import Synthetic Record</span>
                    <p className="text-xs text-[#4A6588] leading-relaxed">
                      Load a structured synthetic test profile in JSON format. No personal identifiers.
                    </p>
                  </div>
                  <input
                    id="synthetic-json-upload"
                    type="file"
                    accept=".json,application/json"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      setError(null);
                    }}
                    className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#0062FF] file:text-white file:font-semibold hover:file:bg-[#004ED9] border border-[#E2ECF8] p-2 bg-white rounded-xl transition-colors"
                  />
                  {selectedFile && (
                    <p className="text-xs text-[#0062FF] font-semibold animate-reveal-1">
                      Ready: {selectedFile.name} ({selectedFile.size}B)
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleLoadSyntheticTemplateFile}
                      className="btn-pill-secondary flex-1 py-3 text-xs"
                    >
                      Use Sample JSON
                    </button>
                    <button
                      type="button"
                      disabled={loading || !selectedFile}
                      onClick={() => void handleStartUpload()}
                      className="btn-pill-primary flex-1 py-3 text-xs font-bold"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2 justify-center">
                          <span className="spinner spinner-sm spinner-white" />
                          Starting…
                        </span>
                      ) : 'Continue with File →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS: 4 steps with photos ══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-5 animate-reveal-3">
        <div className="text-center max-w-xl mx-auto mb-7">
          <span className="text-[11px] font-bold text-[#0062FF] uppercase tracking-wider bg-[#EBF4FF] px-3 py-1 rounded-full border border-[#BAD6FE]">
            How Sanad Works
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#07215A] tracking-tight mt-3">
            Four steps to clear, confidential guidance.
          </h2>
          <p className="text-sm text-[#4A6588] mt-2">
            Straightforward, respectful, and done in under 5 minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IT_WORKS_STEPS.map((item, idx) => (
            <div
              key={item.step}
              className="medical-card overflow-hidden flex flex-col"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Photo */}
              <div className="relative h-36 w-full overflow-hidden" style={{ background: '#0A3882' }}>
                <img
                  src={item.image}
                  alt={item.alt}
                  className="w-full h-full object-cover"
                  style={{ transition: 'transform 0.5s var(--ease-out)' }}
                  onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.06)'; }}
                  onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                {/* Step badge */}
                <div className="absolute top-3 left-3">
                  <span
                    className="w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(145deg, #1A7AFF, #0048C8)',
                      boxShadow: '0 2px 8px rgba(0,98,255,0.4)',
                    }}
                  >
                    {item.step}
                  </span>
                </div>
              </div>
              {/* Content */}
              <div className="p-4 flex-1">
                <span className="text-[10px] font-bold text-[#0062FF] uppercase tracking-wider">{item.subtitle}</span>
                <h3 className="text-sm font-bold text-[#07215A] mt-1">{item.title}</h3>
                <p className="text-xs text-[#4A6588] mt-1.5 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ PEACE OF MIND BANNER ══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-5 animate-reveal-4">
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{
            background: 'linear-gradient(145deg, #0D3E7E 0%, #0A2D60 100%)',
            boxShadow: '0 20px 60px -12px rgba(5,20,60,0.5)',
          }}
        >
          {/* Subtle pattern overlay */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.4) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 50%)',
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center p-7 sm:p-10 relative z-10">
            <div className="lg:col-span-7 space-y-4">
              <span className="text-xs font-semibold text-[#9EC8FF] uppercase tracking-wider bg-white/10 px-3 py-1 rounded-full border border-white/20 inline-block">
                Peace of Mind
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug text-balance">
                Take the first step in the comfort and privacy of your own home.
              </h2>
              <p className="text-sm text-[#C8DFFF] leading-relaxed max-w-lg">
                Men often delay health conversations out of hesitation. Sanad gives you an unhurried, pressure-free way to understand your situation before talking to anyone.
              </p>
              <button
                type="button"
                onClick={() => void handleStartBlank()}
                className="btn-pill-primary px-6 py-3 text-sm"
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  color: '#0062FF',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                }}
              >
                Start Your Private Check →
              </button>
            </div>

            <div className="lg:col-span-5 h-56 rounded-2xl overflow-hidden border border-white/15">
              <img
                src="/assets/images/real_patient_peace_of_mind.jpg"
                alt="Man reviewing health insights peacefully at home"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-5">
        <div className="text-center mb-7">
          <span className="text-[11px] font-bold text-[#0062FF] uppercase tracking-wider bg-[#EBF4FF] px-3 py-1 rounded-full border border-[#BAD6FE]">
            Common Questions
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#07215A] tracking-tight mt-3">
            Everything about your privacy.
          </h2>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={faq.question}
                className={`medical-card overflow-hidden transition-all duration-300 ease-out ${
                  isOpen ? 'shadow-md border-[#BAD6FE]' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 cursor-pointer p-5 text-left"
                >
                  <h3 className="text-sm font-bold text-[#07215A] text-pretty">{faq.question}</h3>
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-sm transition-all duration-200"
                    style={{
                      background: isOpen ? '#0062FF' : '#EBF4FF',
                      color: isOpen ? 'white' : '#0062FF',
                      transform: isOpen ? 'rotate(45deg)' : 'none',
                    }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 animate-reveal-1">
                    <p className="text-xs sm:text-sm text-[#4A6588] border-t border-[#E2ECF8] pt-4 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ Technical Appendix (collapsible) ══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-5">
        <div className="border-t border-[#E2ECF8] pt-5 text-center">
          <button
            type="button"
            onClick={() => setShowTechAppendix(!showTechAppendix)}
            className="text-xs font-mono font-semibold text-[#829AB8] hover:text-[#0062FF] transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${showTechAppendix ? 'rotate-180' : ''}`}
              viewBox="0 0 12 12" fill="currentColor"
            >
              <path d="M6 8L2 4h8L6 8z" />
            </svg>
            {showTechAppendix ? 'Hide' : 'View'} Technical Specifications & FHIR R4 Conceptual Ledger
          </button>
        </div>

        {showTechAppendix && (
          <div className="medical-canvas p-6 sm:p-8 mt-5 animate-reveal-1">
            <div className="pb-4 border-b border-[#E2ECF8]">
              <h3 className="text-base font-bold text-[#07215A]">
                Technical Architecture & Conceptual FHIR R4 Mapping
              </h3>
              <p className="text-xs text-[#829AB8] font-mono mt-1">
                sanad-fhir-r4-conceptual v0.1 · Status: Research Specification · NOT_EVALUATED
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
              {[
                { label: 'AssessmentCase', maps: 'Patient', desc: 'Synthetic pseudonym identifiers only. Direct identity fields omitted.' },
                { label: 'ClinicalObservation', maps: 'Observation', desc: 'Preserves semen parameters and test codes without automatic conversions.' },
                { label: 'ConsentLedger', maps: 'Consent', desc: 'Dual gatekeeper: consent, role, and case version checked on the backend.' },
              ].map(item => (
                <div key={item.label} className="p-4 rounded-xl space-y-1.5" style={{ background: '#F4F8FF', border: '1px solid #E2ECF8' }}>
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="font-bold text-[#0062FF]">{item.label}</span>
                    <span className="text-[#829AB8]">→ {item.maps}</span>
                  </div>
                  <p className="text-xs text-[#4A6588] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
