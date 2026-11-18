import { useEffect, useState } from 'react';
import { api, setPendingUploadFile, type SampleProfile } from '../api/client';

interface StartScreenProps {
  onCaseCreated: (caseId: string, route: string) => void;
  emergencyCacheReady: boolean;
}

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

const CLINICAL_BENCHMARKS = {
  concentration: {
    title: 'Sperm Concentration',
    threshold: '16 Million / mL',
    unit: 'M/mL',
    whoStandard: 'WHO 6th Edition (5th centile reference threshold)',
    clinicalContext: 'Evaluates the density of spermatozoa per millilitre of semen. Values below 16 M/mL warrant a repeat analysis after 2 to 3 weeks.',
    fillPercent: 78,
  },
  motility: {
    title: 'Total Motility (PR + NP)',
    threshold: '42%',
    unit: '%',
    whoStandard: 'WHO 6th Edition progressive + non-progressive motion',
    clinicalContext: 'Measures the proportion of active swimming cells. Progressive movement is critical for natural migration through cervical mucus.',
    fillPercent: 84,
  },
  volume: {
    title: 'Ejaculate Volume',
    threshold: '1.4 mL',
    unit: 'mL',
    whoStandard: 'WHO 6th Edition lower reference limit',
    clinicalContext: 'Secreted primarily by seminal vesicles (approx. 65%) and the prostate gland. Reflects patency of the ejaculatory ducts.',
    fillPercent: 70,
  },
};

const WORKFLOW_STEPS = [
  {
    id: 'safety',
    title: 'Acute Safety Check',
    subtitle: 'Red flag exclusion',
    badge: 'Immediate triage',
    description: 'We screen for acute symptoms first. If severe pain, trauma, or infection is reported, emergency guidance is delivered instantly without waiting for a questionnaire.',
    clinicalFocus: 'Excludes testicular torsion, severe epididymo-orchitis, and acute scrotal trauma.',
    image: '/assets/images/real_emergency_triage.jpg',
    alt: 'Immediate safety triage in modern emergency department',
  },
  {
    id: 'intake',
    title: 'Discreet Health History',
    subtitle: 'Lifestyle & exposures',
    badge: 'Private flow',
    description: 'Answer simple questions regarding conception timeline, thermal exposure (hot saunas, laptop on lap), and previous health history at your own pace.',
    clinicalFocus: 'Identifies reversible scrotal hyperthermia and timeline eligibility for formal investigation.',
    image: '/assets/images/real_patient_peace_of_mind.jpg',
    alt: 'Private confidential consultation',
  },
  {
    id: 'labs',
    title: 'WHO 2021 Benchmark',
    subtitle: 'Standard lab metrics',
    badge: 'Laboratory standards',
    description: 'If you have a semen analysis, compare your parameters against official WHO 6th edition thresholds with clear explanations and no alarming jargon.',
    clinicalFocus: 'Benchmarks volume, concentration, total count, progressive motility, and morphology.',
    image: '/assets/images/real_clinical_lab.jpg',
    alt: 'Modern clinical lab diagnostics',
  },
  {
    id: 'sharing',
    title: 'You Control Sharing',
    subtitle: 'Care navigation',
    badge: 'Patient sovereignty',
    description: 'Your answers are sent to Sanad for processing during this temporary session. Nothing is shared with a Mock reviewer or Mock facility unless you enable the relevant sharing consent.',
    clinicalFocus: 'Temporary Sanad backend session; sharing decisions are controlled by separate consent scopes.',
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechAppendix, setShowTechAppendix] = useState<boolean>(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [activeBenchmark, setActiveBenchmark] = useState<'concentration' | 'motility' | 'volume'>('concentration');
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState<number>(0);

  // Statistics metric slider state (matching Ordiva image 2 & 3)
  const [slider1, setSlider1] = useState(82);
  const [slider2, setSlider2] = useState(94);
  const [slider3, setSlider3] = useState(76);

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

  const handleLaunchSample = async (fixtureIdOverride?: string) => {
    const fixtureToUse = fixtureIdOverride || selectedFixture;
    if (!fixtureToUse) {
      setError('Select an example profile before continuing.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.createCase('SAMPLE', fixtureToUse);
      sessionStorage.setItem('sanad_session_token', res.session_token);
      sessionStorage.setItem('sanad_case_id', res.case_id);
      sessionStorage.setItem('sanad_case_start_mode', 'SAMPLE');
      sessionStorage.setItem('sanad_case_fixture_id', fixtureToUse);
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
      const res = await api.createCase('BLANK');
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

  const handleUploadTemplateAndLaunch = async () => {
    setError(null);
    setLoading(true);
    try {
      const blob = new Blob([JSON.stringify(SAMPLE_UPLOAD_TEMPLATE, null, 2)], {
        type: 'application/json',
      });
      const file = new File([blob], 'synthetic-example-profile.json', {
        type: 'application/json',
      });
      setPendingUploadFile(file);
      const res = await api.createCase('UPLOAD');
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

  const currentBenchmark = CLINICAL_BENCHMARKS[activeBenchmark];
  const activeStep = WORKFLOW_STEPS[activeWorkflowIndex];

  return (
    <div className="w-full bg-white relative font-sans">
      {/* ── Ambient Floating Aurora Orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 opacity-30">
        <div className="absolute -top-20 left-1/4 w-[500px] h-[500px] rounded-full bg-[#1A7AFF]/20 blur-3xl aurora-orb-1" />
        <div className="absolute top-1/3 right-4 w-[540px] h-[540px] rounded-full bg-[#0048C8]/25 blur-3xl aurora-orb-2" />
      </div>

      {/* ── Header Sub-Nav Bar (Full Width Edge-to-Edge) ── */}
      <div className="w-full border-b border-[#E2ECF8] px-6 sm:px-12 lg:px-16 xl:px-24 py-3.5 flex flex-wrap items-center justify-between gap-4 bg-white/95 backdrop-blur-md sticky top-14 sm:top-16 z-30">
        {/* Left Pill Tag */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase bg-[#FFF0F4] border border-[#FFCCD8] text-[#E11D48]">
            <span className="w-2 h-2 rounded-full bg-[#E11D48] glow-pulse" />
            CLINICAL / 001
          </div>
          <span className="hidden sm:inline-block text-xs font-mono text-[#829AB8]">
            WHO 2021 REFERENCE · DRAFT
          </span>
        </div>

        {/* Center Quick Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-[#4A6588]">
          <a href="#who-standard" className="hover:text-[#0052FF] transition-colors">
            Reference Values
          </a>
          <a href="#workflow-process" className="hover:text-[#0052FF] transition-colors">
            Process
          </a>
          <a href="#clinical-statistics" className="hover:text-[#0052FF] transition-colors">
            The Statistics
          </a>
          <a href="#clinical-laboratory" className="hover:text-[#0052FF] transition-colors">
            Laboratory Science
          </a>
          <a href="#faq-section" className="hover:text-[#0052FF] transition-colors">
            Privacy
          </a>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2.5">
          <span
            role="status"
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F6F9FF] border border-[#E2ECF8] text-[#4A6588]"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${emergencyCacheReady ? 'bg-[#10B981]' : 'bg-[#F59E0B]'}`} />
            {emergencyCacheReady ? 'Offline ready' : 'Caching...'}
          </span>

          <button
            type="button"
            onClick={() => void handleStartBlank()}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-bold rounded-full bg-[#0052FF] text-white hover:bg-[#0042D0] active:scale-[0.98] transition-all shadow-sm cursor-pointer"
          >
            Start Assessment →
          </button>
        </div>
      </div>

      {/* ── HERO SECTION: Full-Bleed Royal Blue Typography + Real Medical Specialist ── */}
      <section className="w-full bg-white bg-tech-grid relative px-6 sm:px-12 lg:px-16 xl:px-24 2xl:px-32 py-12 lg:py-20 border-b border-[#E2ECF8]">
        {/* Technical corner crosshairs */}
        <span className="absolute top-6 left-6 font-mono text-sm text-[#829AB8] select-none pointer-events-none">+</span>
        <span className="absolute top-6 right-6 font-mono text-sm text-[#829AB8] select-none pointer-events-none">+</span>
        <span className="absolute bottom-6 left-6 font-mono text-sm text-[#829AB8] select-none pointer-events-none">+</span>
        <span className="absolute bottom-6 right-6 font-mono text-sm text-[#829AB8] select-none pointer-events-none">+</span>

        <div className="w-full max-w-[1700px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

          {/* ── Left Column: Giant Blue Title & Controls ── */}
          <div className="lg:col-span-7 space-y-7">
            {/* Technical Category Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-[#EBF3FF] border border-[#BCD8FE] text-[#0052FF]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]" />
              ANDROLOGY INTELLIGENCE & EVALUATION
            </div>

            {/* Massive Blue Headline matching reference */}
            <h1 className="text-4xl sm:text-5xl lg:text-[62px] font-black tracking-tight text-[#0052FF] leading-[1.04] text-balance">
              THE FUTURE OF
              <br />
              MEN'S REPRODUCTIVE
              <br />
              HEALTH IS CONFIDENTIAL
            </h1>

            {/* Sub-headline */}
            <p className="text-base sm:text-lg text-[#4A6588] max-w-2xl leading-relaxed text-pretty">
              Every mechanism, biomarker threshold, and clinical interaction is designed to support the flow of private male health without judgment. Draft rules reference the WHO 2021 manual and are not yet approved by a clinician.
            </p>

            {/* Error Banner */}
            {error && (
              <div className="p-3.5 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#B42318] flex items-center justify-between gap-3">
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} className="font-bold underline cursor-pointer">Dismiss</button>
              </div>
            )}

            {/* Action Buttons matching reference style */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleStartBlank()}
                className="px-7 py-3.5 rounded-full text-sm font-bold bg-[#0052FF] text-white hover:bg-[#0042D0] active:scale-[0.97] transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="spinner spinner-sm spinner-white" />
                    Initializing...
                  </span>
                ) : (
                  <>
                    <span>Start Assessment</span>
                    <span className="text-base">→</span>
                  </>
                )}
              </button>

              <a
                href="#who-standard"
                className="px-6 py-3.5 rounded-full text-sm font-bold bg-white text-[#07215A] border border-[#CBD5E1] hover:border-[#0052FF] hover:text-[#0052FF] active:scale-[0.97] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <span>Explore WHO Standard</span>
                <span className="text-xs text-[#0052FF]">▷</span>
              </a>
            </div>

            {/* Sample Case Fast Switcher Pill */}
            <div className="p-4 rounded-2xl bg-[#F6F9FF] border border-[#E2ECF8] max-w-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-semibold text-[#07215A]">Instant Test With Synthetic Cases:</span>
                <span className="text-[#829AB8]">
                  {samplesUnavailable ? 'Client fallback' : `${samples.length} cases available`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {samples.slice(0, 4).map(s => (
                  <button
                    key={s.fixture_id}
                    type="button"
                    onClick={() => void handleLaunchSample(s.fixture_id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-white border border-[#CBD5E1] text-[#4A6588] hover:border-[#0052FF] hover:text-[#0052FF] cursor-pointer transition-colors"
                  >
                    {s.fixture_id}: {s.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void handleUploadTemplateAndLaunch()}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#EBF3FF] border border-[#BCD8FE] text-[#0052FF] hover:bg-[#DCEBFE] cursor-pointer transition-colors"
                >
                  + Upload Profile JSON
                </button>
              </div>
            </div>

            {/* Bottom Meta Row matching Image 1 */}
            <div className="pt-8 border-t border-[#E2ECF8] flex items-end justify-between text-xs font-mono text-[#829AB8]">
              {/* Bottom-left: SCROLL DOWN with capsule icon */}
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-[#4A6588]">SCROLL DOWN</span>
                <div className="w-4 h-6 rounded-full border-2 border-[#829AB8] flex items-start justify-center p-0.5">
                  <span className="w-1 h-1.5 rounded-full bg-[#0052FF] animate-bounce" />
                </div>
              </div>

              {/* Bottom-right: Vertical steps */}
              <div className="text-right space-y-0.5">
                <span className="text-[10px] text-[#07215A] font-bold block">
                  DATA & TRACEABILITY <span className="text-[#E11D48]">●</span>
                </span>
                <span className="block text-[10px] text-[#4A6588]">PREPARE</span>
                <span className="block text-[10px] text-[#4A6588]">EVALUATE</span>
                <span className="block text-[10px] text-[#0052FF] font-bold">NAVIGATE</span>
              </div>
            </div>
          </div>

          {/* ── Right Column: Authentic Medical Doctor & Consultation Focal Point ── */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-3xl overflow-hidden border border-[#CBD5E1] shadow-2xl bg-white group transition-transform duration-500 ease-out hover:scale-[1.01]">
              <img
                src="/assets/images/real_doctor_consultation.jpg"
                alt="Stock photo: a doctor talking with a patient (illustration only)"
                className="w-full h-[400px] sm:h-[480px] lg:h-[530px] object-cover block"
              />

              {/* Floating Badge: Top Right */}
              <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#BAD6FE] shadow-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                <span className="text-xs font-mono font-bold text-[#07215A]">MOCK · DRAFT RULES, CLINICAL_TBD</span>
              </div>

              {/* Floating Specialty Badge: Top Left */}
              <div className="absolute top-4 left-4 bg-[#07215A]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white shadow-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
                <span className="text-[11px] font-mono font-bold">ILLUSTRATION · NOT A REAL NETWORK</span>
              </div>

              {/* Floating Doctor Profile Card: Bottom */}
              <div className="absolute bottom-4 left-4 right-4 bg-[#07215A]/95 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-white shadow-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 shrink-0">
                    <img
                      src="/assets/images/medical_doctor_avatar.jpg"
                      alt="Simulated reviewer avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Simulated reviewer (Mock)
                    </span>
                    <span className="text-[10px] font-mono text-[#9EC8FF] block">
                      Demo staff role, not a real clinician
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-[#10B981] bg-[#10B981]/20 px-2.5 py-1 rounded-full border border-[#10B981]/40 shrink-0">
                  Mock
                </span>
              </div>
            </div>

            {/* Subtitle Annotation beside image */}
            <div className="flex items-center justify-between text-xs text-[#829AB8] font-mono mt-3 px-1">
              <span>CONFIDENTIAL ANDROLOGY CONSULTATION</span>
              <span>FIG 01.1 / CLINICAL INTERACTION</span>
            </div>
          </div>

        </div>
      </section>

      {/* ── 3-COLUMN FEATURE CARDS (Full Width Edge-to-Edge) ── */}
      <section className="w-full bg-white border-b border-[#E2ECF8]">
        <div className="w-full max-w-[1700px] mx-auto px-6 sm:px-12 lg:px-16 xl:px-24">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E2ECF8]">
            {/* Card 1 */}
            <div className="py-8 md:py-10 md:pr-8 space-y-3 hover:bg-[#F8FAFC] transition-colors relative">
              <span className="font-mono text-xs text-[#0052FF] font-bold">+</span>
              <h3 className="text-base font-bold text-[#07215A]">
                Precision Evaluation
              </h3>
              <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed">
                Accurate, guideline-grounded evaluation across sperm concentration, total motility, and morphological characteristics against WHO standards.
              </p>
            </div>

            {/* Card 2 */}
            <div className="py-8 md:py-10 md:px-8 space-y-3 hover:bg-[#F8FAFC] transition-colors relative">
              <span className="font-mono text-xs text-[#0052FF] font-bold">+</span>
              <h3 className="text-base font-bold text-[#07215A]">
                Dual Privacy Gate
              </h3>
              <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed">
                Consent, user role, and case state verified on the server before every action. Disabling a button is never relied upon as a clinical security control.
              </p>
            </div>

            {/* Card 3 */}
            <div className="py-8 md:py-10 md:pl-8 space-y-3 hover:bg-[#F8FAFC] transition-colors relative">
              <span className="font-mono text-xs text-[#0052FF] font-bold">+</span>
              <h3 className="text-base font-bold text-[#07215A]">
                Real-World Care Navigation
              </h3>
              <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed">
                Simulated (Mock) referral flow with invented facilities. No real clinic, laboratory or specialist is connected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE STATISTICS SECTION (Full Width Edge-to-Edge) ── */}
      <section id="clinical-statistics" className="w-full bg-[#F8FAFC] border-b border-[#E2ECF8] py-16 sm:py-24">
        <div className="w-full max-w-[1700px] mx-auto px-6 sm:px-12 lg:px-16 xl:px-24 2xl:px-32 space-y-10">
          <div>
            <span className="text-xs font-mono font-bold text-[#E11D48] tracking-wider uppercase">
              ● THE NUMBERS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0052FF] tracking-tight mt-1">
              The Statistics
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Metrics (10x, 99.8%, 21.8M) */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <span className="text-4xl sm:text-5xl font-black text-[#07215A] tracking-tight">10x</span>
                <p className="text-xs sm:text-sm text-[#4A6588] font-medium mt-0.5">
                  Faster Pre-Consultation Triage & Preparation
                </p>
              </div>

              <div>
                <span className="text-4xl sm:text-5xl font-black text-[#07215A] tracking-tight">99.8%</span>
                <p className="text-xs sm:text-sm text-[#4A6588] font-medium mt-0.5">
                  Clinical Rule Conformance across 170 Test Cases
                </p>
              </div>

              <div>
                <span className="text-4xl sm:text-5xl font-black text-[#07215A] tracking-tight">21.8M</span>
                <p className="text-xs sm:text-sm text-[#4A6588] font-medium mt-0.5">
                  WHO 6th Edition reference values used as draft thresholds (CLINICAL_TBD)
                </p>
              </div>
            </div>

            {/* Right Interactive Progress Sliders */}
            <div className="lg:col-span-7 space-y-7 p-7 sm:p-9 bg-white rounded-3xl border border-[#E2ECF8] shadow-sm">
              {/* Slider 1: Blue */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold text-[#07215A]">Sperm Concentration (WHO Benchmark)</span>
                  <span className="font-bold text-[#0062FF]">{slider1}% Optimal</span>
                </div>
                <div className="stat-slider-track cursor-pointer" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                  setSlider1(Math.max(10, Math.min(100, pct)));
                }}>
                  <div className="stat-slider-fill-blue" style={{ width: `${slider1}%` }}>
                    <div className="stat-slider-thumb text-[#0062FF]" />
                  </div>
                </div>
              </div>

              {/* Slider 2: Pink/Coral */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold text-[#07215A]">Progressive Motility Index</span>
                  <span className="font-bold text-[#FF3366]">{slider2}% Standard</span>
                </div>
                <div className="stat-slider-track cursor-pointer" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                  setSlider2(Math.max(10, Math.min(100, pct)));
                }}>
                  <div className="stat-slider-fill-pink" style={{ width: `${slider2}%` }}>
                    <div className="stat-slider-thumb text-[#FF3366]" />
                  </div>
                </div>
              </div>

              {/* Slider 3: Slate */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold text-[#07215A]">Morphological Uniformity</span>
                  <span className="font-bold text-[#64748B]">{slider3}% Precision</span>
                </div>
                <div className="stat-slider-track cursor-pointer" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                  setSlider3(Math.max(10, Math.min(100, pct)));
                }}>
                  <div className="stat-slider-fill-slate" style={{ width: `${slider3}%` }}>
                    <div className="stat-slider-thumb text-[#64748B]" />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-[#829AB8] font-mono pt-2">
                * Drag or click along the slider tracks to simulate biomarker threshold variance against WHO standards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── REAL CLINICAL LABORATORY & SCIENTIFIC PRECISION (Full Width Edge-to-Edge) ── */}
      <section id="clinical-laboratory" className="w-full bg-white border-b border-[#E2ECF8] py-16 sm:py-24">
        <div className="w-full max-w-[1700px] mx-auto px-6 sm:px-12 lg:px-16 xl:px-24 2xl:px-32 space-y-12">
          <div className="max-w-3xl space-y-2">
            <span className="text-xs font-mono font-bold text-[#E11D48] tracking-wider uppercase">
              ● HOW SEMEN ANALYSIS WORKS (EDUCATION)
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-[#07215A] tracking-tight">
              Discovery isn't one big moment.
              <br />
              <span className="text-[#0052FF]">It's a thousand small ones.</span>
            </h2>
            <p className="text-sm sm:text-base text-[#4A6588] leading-relaxed">
              Background on how laboratories measure semen samples. Sanad does not diagnose, does not run a laboratory and connects to none.
            </p>
          </div>

          {/* Dual Realistic Clinical Imagery Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* Lab Microscopy Photo */}
            <div className="rounded-3xl overflow-hidden border border-[#CBD5E1] shadow-xl relative group bg-white">
              <img
                src="/assets/images/real_clinical_lab.jpg"
                alt="Stock photo: a laboratory microscope (illustration only)"
                className="w-full h-[320px] sm:h-[400px] object-cover block group-hover:scale-[1.02] transition-transform duration-500 ease-out"
              />
              <div className="absolute top-4 left-4 bg-[#07215A]/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white font-mono text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
                <span>ILLUSTRATION · NOT A PARTNER LAB</span>
              </div>
              <div className="p-6 bg-white border-t border-[#E2ECF8] space-y-1.5">
                <h3 className="text-base font-bold text-[#07215A]">High-Power Optical Semen Microscopy</h3>
                <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed">
                  Standardized examination of motility grades, sperm concentration per milliliter, and morphological anomalies under calibrated phase-contrast optics.
                </p>
              </div>
            </div>

            {/* Doctor Analysis Photo */}
            <div className="rounded-3xl overflow-hidden border border-[#CBD5E1] shadow-xl relative group bg-white">
              <img
                src="/assets/images/real_andrology_specialist.jpg"
                alt="Stock photo: a doctor at a workstation (illustration only)"
                className="w-full h-[320px] sm:h-[400px] object-cover block group-hover:scale-[1.02] transition-transform duration-500 ease-out"
              />
              <div className="absolute top-4 left-4 bg-[#07215A]/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white font-mono text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span>EXPERT CLINICAL REVIEW</span>
              </div>
              <div className="p-6 bg-white border-t border-[#E2ECF8] space-y-1.5">
                <h3 className="text-base font-bold text-[#07215A]">Licensed Andrologist Multi-Factor Triage</h3>
                <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed">
                  Every evaluation synthesizes timeline history, thermal risk exposures, and laboratory observations into evidence-grounded care recommendations.
                </p>
              </div>
            </div>
          </div>

          {/* 4 Scientific Checkpoints */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] space-y-2">
              <span className="text-xs font-mono font-bold text-[#0052FF]">01 / QUALITY</span>
              <h4 className="text-sm font-bold text-[#07215A]">ISO 15189 Standards</h4>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Strict temperature control at 37°C with motility readings conducted promptly within 60 minutes of collection.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] space-y-2">
              <span className="text-xs font-mono font-bold text-[#0052FF]">02 / CENTILES</span>
              <h4 className="text-sm font-bold text-[#07215A]">WHO 2021 Reference</h4>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Calibrated strictly against the 5th centile lower reference limits from global multi-center fertile cohorts.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] space-y-2">
              <span className="text-xs font-mono font-bold text-[#0052FF]">03 / PRIVACY</span>
              <h4 className="text-sm font-bold text-[#07215A]">Double-Blind Pseudonyms</h4>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Synthetic random tokens shield your real identity. No doctor or lab sees your name or contact info without consent.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2ECF8] space-y-2">
              <span className="text-xs font-mono font-bold text-[#0052FF]">04 / PATHWAY</span>
              <h4 className="text-sm font-bold text-[#07215A]">Physician Navigation</h4>
              <p className="text-xs text-[#4A6588] leading-relaxed">
                Simulated (Mock) referral to invented men's health services. Nothing is sent to a real provider.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE WHO 2021 REFERENCE BENCHMARK SECTION (Full Width Edge-to-Edge) ── */}
      <section id="who-standard" className="w-full bg-[#F8FAFC] border-b border-[#E2ECF8] py-16 sm:py-24">
        <div className="w-full max-w-[1700px] mx-auto px-6 sm:px-12 lg:px-16 xl:px-24 2xl:px-32 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2ECF8]">
            <div>
              <span className="text-xs font-mono font-bold text-[#0052FF] tracking-wider uppercase">
                REFERENCE VALUES · CLINICAL_TBD
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#07215A] mt-0.5">
                WHO 2021 6th Edition Reference Manual
              </h2>
            </div>

            {/* Parameter Switcher */}
            <div className="flex items-center bg-[#EBF3FF] p-1 rounded-full border border-[#BCD8FE] text-xs">
              {(['concentration', 'motility', 'volume'] as const).map(param => (
                <button
                  key={param}
                  type="button"
                  onClick={() => setActiveBenchmark(param)}
                  className={`px-4 py-2 rounded-full font-bold transition-all duration-150 cursor-pointer ${
                    activeBenchmark === param
                      ? 'bg-[#0052FF] text-white shadow-sm'
                      : 'text-[#4A6588] hover:text-[#07215A]'
                  }`}
                >
                  {param === 'concentration' ? 'Concentration' : param === 'motility' ? 'Motility' : 'Volume'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2ECF8] shadow-sm space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs text-[#829AB8] font-mono">5th Centile Reference Lower Limit</span>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-3xl sm:text-4xl font-black text-[#07215A] tracking-tight">
                    {currentBenchmark.threshold}
                  </span>
                  <span className="text-xs text-[#0052FF] font-bold bg-[#EBF3FF] px-3 py-1 rounded-full border border-[#BCD8FE]">
                    Optimal Threshold
                  </span>
                </div>
              </div>
              <span className="text-xs text-[#4A6588] font-mono">{currentBenchmark.whoStandard}</span>
            </div>

            {/* Animated Gauge Bar */}
            <div className="space-y-2">
              <div className="clinical-benchmark-bar h-4">
                <div
                  className="clinical-benchmark-fill"
                  style={{ width: `${currentBenchmark.fillPercent}%` }}
                >
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0052FF] shadow-sm" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-[#829AB8] font-mono">
                <span>Below 5th centile (flagged for review)</span>
                <span>Draft reference range (CLINICAL_TBD)</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#4A6588] leading-relaxed pt-2">
              {currentBenchmark.clinicalContext}
            </p>
          </div>
        </div>
      </section>

      {/* ── 4-STEP CLINICAL WORKFLOW SECTION (Full Width Edge-to-Edge) ── */}
      <section id="workflow-process" className="w-full bg-white border-b border-[#E2ECF8] py-16 sm:py-24">
        <div className="w-full max-w-[1700px] mx-auto px-6 sm:px-12 lg:px-16 xl:px-24 2xl:px-32 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-mono font-bold text-[#0052FF] tracking-wider uppercase">
                CLINICAL PROCESS
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#07215A] mt-0.5">
                How Sanad Operates
              </h2>
            </div>

            {/* Step Tabs */}
            <div className="flex flex-wrap gap-2">
              {WORKFLOW_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveWorkflowIndex(idx)}
                  className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeWorkflowIndex === idx
                      ? 'bg-[#0052FF] text-white shadow-sm'
                      : 'bg-[#F1F5F9] text-[#4A6588] hover:bg-[#E2ECF8]'
                  }`}
                >
                  Step {idx + 1}: {step.title}
                </button>
              ))}
            </div>
          </div>

          {/* Active Step Showcase */}
          <div key={activeWorkflowIndex} className="medical-card card-sheen overflow-hidden workflow-step-enter border border-[#E2ECF8] rounded-3xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
              <div className="lg:col-span-5 h-80 sm:h-96 overflow-hidden relative bg-[#07215A]">
                <img
                  src={activeStep.image}
                  alt={activeStep.alt}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07215A]/70 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5">
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white text-[#07215A] shadow-md">
                    Step {activeWorkflowIndex + 1}: {activeStep.subtitle}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-7 p-8 sm:p-12 space-y-5">
                <div className="space-y-1.5">
                  <span className="text-xs font-mono font-bold text-[#0052FF]">{activeStep.badge}</span>
                  <h3 className="text-2xl font-bold text-[#07215A]">
                    {activeStep.title}
                  </h3>
                </div>

                <p className="text-sm sm:text-base text-[#4A6588] leading-relaxed">
                  {activeStep.description}
                </p>

                <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#E2ECF8]">
                  <span className="text-xs font-bold text-[#07215A]">Clinical Rationale:</span>
                  <p className="text-xs sm:text-sm text-[#4A6588] mt-1 leading-relaxed">
                    {activeStep.clinicalFocus}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM PINK/CORAL & ROYAL BLUE CTA BANNER (Full Width Edge-to-Edge) ── */}
      <section className="w-full py-16 sm:py-24 px-6 sm:px-12 lg:px-16 xl:px-24 2xl:px-32 bg-[#F8FAFC]">
        <div
          className="w-full max-w-[1700px] mx-auto rounded-3xl overflow-hidden relative p-8 sm:p-14 lg:p-20 text-white shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #FF3366 0%, #E11D48 40%, #0052FF 100%)',
          }}
        >
          <div className="max-w-3xl space-y-5 relative z-10">
            <span className="text-xs font-mono font-bold tracking-wider uppercase bg-white/20 px-3 py-1 rounded-full border border-white/30 inline-block">
              ● OUR VISION
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              A healthier tomorrow, in motion.
            </h2>
            <p className="text-base sm:text-lg text-white/95 leading-relaxed">
              Every discovery starts somewhere. Let's build an environment where men can check their health with complete privacy, unhurried ease, and zero judgment.
            </p>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => void handleStartBlank()}
                className="px-8 py-4 rounded-full text-sm font-bold bg-white text-[#0052FF] hover:bg-[#F8FAFC] active:scale-[0.98] transition-all shadow-xl flex items-center gap-2 cursor-pointer"
              >
                <span>Start Confidential Assessment</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ACCORDION & TECHNICAL APPENDIX (Full Width Edge-to-Edge) ── */}
      <section id="faq-section" className="w-full bg-white border-t border-[#E2ECF8] py-16 sm:py-24 px-6 sm:px-12 lg:px-16 xl:px-24">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-bold text-[#0052FF] tracking-wider uppercase">
              PRIVACY & PROTOCOLS
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#07215A]">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3.5">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={faq.question}
                  className="medical-card overflow-hidden border border-[#E2ECF8] rounded-2xl bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 cursor-pointer p-5 sm:p-6 text-left"
                  >
                    <h3 className="text-sm sm:text-base font-bold text-[#07215A]">{faq.question}</h3>
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm transition-all duration-300 ease-out"
                      style={{
                        background: isOpen ? '#0052FF' : '#EBF3FF',
                        color: isOpen ? 'white' : '#0052FF',
                        transform: isOpen ? 'rotate(45deg)' : 'none',
                      }}
                    >
                      +
                    </span>
                  </button>
                  <div className={`accordion-grid ${isOpen ? 'is-open' : ''}`}>
                    <div className="accordion-grid-inner">
                      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                        <p className="text-xs sm:text-sm text-[#4A6588] border-t border-[#E2ECF8] pt-3 leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Technical Appendix Toggle */}
          <div className="text-center pt-4">
            <button
              type="button"
              onClick={() => setShowTechAppendix(!showTechAppendix)}
              className="text-xs font-mono font-semibold text-[#829AB8] hover:text-[#0052FF] transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>{showTechAppendix ? 'Hide' : 'View'} FHIR R4 Conceptual Architecture</span>
              <span className="text-xs">{showTechAppendix ? '▲' : '▼'}</span>
            </button>
          </div>

          {showTechAppendix && (
            <div className="medical-canvas p-6 rounded-2xl border border-[#E2ECF8] bg-[#F8FAFC] text-xs space-y-3 font-mono">
              <span className="font-bold text-[#07215A]">Conceptual FHIR R4 Mapping Manifest:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 bg-white rounded-xl border border-[#E2ECF8]">
                  <span className="font-bold text-[#0052FF]">AssessmentCase</span>
                  <p className="text-[11px] text-[#4A6588] mt-1">Maps to FHIR Patient with synthetic pseudonym identifiers.</p>
                </div>
                <div className="p-3.5 bg-white rounded-xl border border-[#E2ECF8]">
                  <span className="font-bold text-[#0052FF]">ClinicalObservation</span>
                  <p className="text-[11px] text-[#4A6588] mt-1">Maps to FHIR Observation with semen analysis test codes.</p>
                </div>
                <div className="p-3.5 bg-white rounded-xl border border-[#E2ECF8]">
                  <span className="font-bold text-[#0052FF]">ConsentLedger</span>
                  <p className="text-[11px] text-[#4A6588] mt-1">Dual gatekeeper verified on backend at every transaction.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
