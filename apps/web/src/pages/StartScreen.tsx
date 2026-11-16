import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { api, setPendingUploadFile, type SampleProfile } from '../api/client';
import { Scene } from '../components/Scene';

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

/* What leaves this tab: the privacy ledger */
const LEDGER = [
  {
    item: 'Your name',
    status: 'Never asked',
    tone: 'never',
    detail: 'There is no sign-up, no account and no name field anywhere in the flow.',
  },
  {
    item: 'Phone or email',
    status: 'Never asked',
    tone: 'never',
    detail: 'Sanad has no contact field and no outbound email or SMS client.',
  },
  {
    item: 'Camera or photos of you',
    status: 'Never used',
    tone: 'never',
    detail: 'No camera prompt, no video and no face or emotion analysis.',
  },
  {
    item: 'Your answers',
    status: 'This session only',
    tone: 'session',
    detail: 'Stored against a temporary session token. Ending the session or Quick exit clears it from this tab.',
  },
  {
    item: 'A referral',
    status: 'Only if you say yes',
    tone: 'gated',
    detail: 'Needs your consent, a reviewer approval and a server-side policy check. Facilities are invented (Mock) and nothing is sent to a real clinic.',
  },
] as const;

/* The session path */
const PATH = [
  {
    key: 'consent',
    label: 'Consent',
    title: 'You choose what this session may do',
    body: 'Each permission is shown separately and can be withdrawn later. Without assessment consent, the questions do not open.',
    note: 'Checked on the server at every action, not just in the browser.',
  },
  {
    key: 'safety',
    label: 'Safety check',
    title: 'Warning signs are checked first',
    body: 'A few questions about sudden pain, injury or swelling with fever come before anything else. If one applies, urgent guidance opens straight away.',
    note: 'Draft rules · CLINICAL_TBD. Urgent guidance works offline and without consent.',
  },
  {
    key: 'questions',
    label: 'Questions',
    title: 'Answer at your own pace',
    body: '"Not sure" and "Prefer not to say" are real answers. They stay recorded as they are and are never treated as "no".',
    note: 'Unknown stays unknown.',
  },
  {
    key: 'review',
    label: 'Review',
    title: 'See exactly what was recorded',
    body: 'Every fact sits in one list with where it came from: you, a sample file, or a lab value you typed. Edit anything before you submit.',
    note: 'Lab values are stored as entered. Units are never converted.',
  },
  {
    key: 'summary',
    label: 'Summary',
    title: 'A summary to take to a professional',
    body: 'A plain-language overview of what you shared and what may be worth discussing. It is not a diagnosis and gives no personal probability.',
    note: 'Research prototype, not a medical device.',
  },
  {
    key: 'referral',
    label: 'Next step',
    title: 'Optional, simulated referral',
    body: 'If you want, you can ask for a referral to an invented service. A simulated reviewer looks at it first. Every part of this step is labelled Mock.',
    note: 'No real provider, clinic or hospital is connected.',
  },
] as const;

/* A lab report, read slowly */
const REPORT_ROWS = [
  {
    code: 'VOLUME',
    label: 'Semen volume',
    value: '2.4',
    unit: 'mL',
    explain: 'How much fluid the sample contained. Collection details, such as days since last ejaculation, can change it.',
  },
  {
    code: 'CONC',
    label: 'Sperm concentration',
    value: '11.5',
    unit: 'million/mL',
    explain: 'How many sperm cells are in each millilitre. Results often vary between samples, which is why labs may ask for a repeat.',
  },
  {
    code: 'MOT',
    label: 'Total motility',
    value: '-',
    unit: '%',
    explain: 'The share of cells that are moving. A dash means the value was not reported, and Sanad keeps it as "not reported".',
  },
  {
    code: 'PR',
    label: 'Progressive motility',
    value: '-',
    unit: '%',
    explain: 'The share of cells moving forward. Many reports list it separately from total motility.',
  },
  {
    code: 'MORPH',
    label: 'Normal forms',
    value: '-',
    unit: '%',
    explain: 'The share of cells with a typical shape under the microscope. Labs use different methods, so compare like with like.',
  },
] as const;

const PROMISES = [
  ['Tell you what you have.', 'No diagnosis, no personal probability, no verdict from a single habit, BMI or lab value.'],
  ['Turn "not sure" into "no".', 'Unknown, declined and not-asked answers stay exactly that, and never count as low risk.'],
  ['Make waiting the price of safety.', 'Warning-sign rules run before everything else, and urgent guidance never sits behind consent.'],
  ['Dress up a simulation.', 'Every simulated reviewer, facility and referral is marked Mock, on screen and in the data.'],
  ['Assume anything about your life.', 'Nothing here assumes marriage, religion or plans for children.'],
] as const;

const FAQS = [
  {
    q: 'Do you ask for my name, phone number or identity?',
    a: 'No. There is no registration, email or phone field. The session runs on a temporary token in this browser tab.',
  },
  {
    q: 'Is this a diagnosis?',
    a: 'No. Sanad is a research prototype. It helps you organise what you know and prepare for a conversation with a licensed professional. It does not diagnose and gives no personal probability.',
  },
  {
    q: 'What if I am in pain right now?',
    a: 'If you have sudden severe testicular pain, an injury, or painful swelling with fever, open Urgent help at the top of the page. That page is saved to this device and works without a connection.',
  },
  {
    q: 'How do I leave quickly?',
    a: 'Press Quick exit at the top right. It clears the page and this session from the tab, then opens a neutral website.',
  },
  {
    q: 'Who sees my answers?',
    a: 'Only this session. A simulated reviewer sees a case only if you consent to a referral. Reviewers, facilities and referrals in this prototype are all Mock.',
  },
] as const;

type StartMode = 'blank' | 'sample' | 'upload';

function Kicker({ children, tone = 'light' }: { children: React.ReactNode; tone?: 'light' | 'dark' }) {
  const color = tone === 'dark' ? 'text-[#A9B3AC]' : 'text-[#8A8C84]';
  const bar = tone === 'dark' ? 'bg-[#A9B3AC]' : 'bg-[#8A8C84]';
  return (
    <p className={`font-mono text-[11px] tracking-[0.08em] uppercase ${color} flex items-center gap-2`}>
      <span className={`inline-block w-5 h-px ${bar}`} aria-hidden="true" />
      {children}
    </p>
  );
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onCaseCreated,
  emergencyCacheReady,
}) => {
  const [samples, setSamples] = useState<SampleProfile[]>([]);
  const [samplesUnavailable, setSamplesUnavailable] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<string>('J1-001');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ar'>('en');
  const [loading, setLoading] = useState<StartMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [openLedger, setOpenLedger] = useState<number | null>(3);
  const [activeStep, setActiveStep] = useState(0);
  const [activeRow, setActiveRow] = useState(1);
  const [activeFaq, setActiveFaq] = useState(0);
  const [startMode, setStartMode] = useState<StartMode>('blank');
  const [showAppendix, setShowAppendix] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const heroRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  // Scroll progress hairline (transform only, no re-render)
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    const frame = { id: 0 };
    const update = () => {
      frame.id = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => {
      if (!frame.id) frame.id = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.id) cancelAnimationFrame(frame.id);
    };
  }, []);

  // Warm light that follows the pointer across the hero
  const onHeroMove = (e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  // Gentle tilt for the privacy ledger card
  const onTilt = (e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`);
    e.currentTarget.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
  };
  const onTiltEnd = (e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
  };

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

  const persistAndContinue = (
    res: { session_token: string; case_id: string; state: { route: string } },
    mode: 'SAMPLE' | 'UPLOAD' | 'BLANK',
    fixtureId?: string,
  ) => {
    sessionStorage.setItem('sanad_session_token', res.session_token);
    sessionStorage.setItem('sanad_case_id', res.case_id);
    sessionStorage.setItem('sanad_case_start_mode', mode);
    if (fixtureId) sessionStorage.setItem('sanad_case_fixture_id', fixtureId);
    onCaseCreated(res.case_id, res.state.route);
  };

  const handleLaunchSample = async () => {
    if (!selectedFixture) {
      setError('Pick an example profile before continuing.');
      return;
    }
    setError(null);
    setLoading('sample');
    try {
      const res = await api.createCase('SAMPLE', selectedFixture, preferredLanguage);
      persistAndContinue(res, 'SAMPLE', selectedFixture);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the sample case.');
    } finally {
      setLoading(null);
    }
  };

  const handleStartBlank = async () => {
    setError(null);
    setLoading('blank');
    try {
      const res = await api.createCase('BLANK', undefined, preferredLanguage);
      persistAndContinue(res, 'BLANK');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new session.');
    } finally {
      setLoading(null);
    }
  };

  const handleUploadTemplateAndLaunch = async () => {
    setError(null);
    setLoading('upload');
    try {
      const blob = new Blob([JSON.stringify(SAMPLE_UPLOAD_TEMPLATE, null, 2)], {
        type: 'application/json',
      });
      const file = new File([blob], 'synthetic-example-profile.json', {
        type: 'application/json',
      });
      setPendingUploadFile(file);
      const res = await api.createCase('UPLOAD', undefined, preferredLanguage);
      persistAndContinue(res, 'UPLOAD');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the upload case.');
    } finally {
      setLoading(null);
    }
  };

  const handleChosenStart = () => {
    if (startMode === 'blank') void handleStartBlank();
    else if (startMode === 'sample') void handleLaunchSample();
    else void handleUploadTemplateAndLaunch();
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = idx;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % PATH.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + PATH.length) % PATH.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = PATH.length - 1;
    else return;
    e.preventDefault();
    setActiveStep(next);
    tabRefs.current[next]?.focus();
  };

  const step = PATH[activeStep];
  const row = REPORT_ROWS[activeRow];
  const busy = loading !== null;

  const scrollToStart = () =>
    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="w-full relative">
      <div className="scroll-progress" aria-hidden="true">
        <div ref={progressRef} />
      </div>
      {/* HERO */}
      <section
        ref={heroRef}
        onPointerMove={onHeroMove}
        className="hero-light relative w-full px-4 sm:px-8 lg:px-12 overflow-hidden"
        aria-labelledby="hero-title"
      >
        <svg className="hero-trace" viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 150 H300 L340 150 L370 60 L410 190 L440 110 L470 150 H760 L790 150 L815 95 L845 170 L870 150 H1200" />
        </svg>
        <div className="max-w-[1240px] mx-auto pt-10 sm:pt-16 lg:pt-20 pb-14 lg:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10">
          <div className="lg:col-span-7 lg:pr-6">
            <div className="animate-reveal-1 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Kicker>Research prototype · synthetic data only</Kicker>
              <span role="status" className="font-mono text-[11px] text-[#575C55] inline-flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${emergencyCacheReady ? 'bg-[#3F7D5C]' : 'bg-[#B8860B] bio-pulse-soft'}`}
                  aria-hidden="true"
                />
                {emergencyCacheReady ? 'Urgent guidance saved for offline use' : 'Saving urgent guidance for offline use…'}
              </span>
            </div>

            <h1
              id="hero-title"
              className="font-serif text-[46px] leading-[0.98] sm:text-[68px] lg:text-[88px] text-[#1A1F1C] mt-6 tracking-[-0.025em]"
            >
              {['A', 'private', 'first', 'step', 'for'].map((w, i) => (
                <span key={w}>
                  <span className="word" style={{ ['--i' as string]: i }}>
                    <span>{w}</span>
                  </span>{' '}
                </span>
              ))}
              <span className="word" style={{ ['--i' as string]: 5 }}>
                <span>
                  <em className="italic text-[#1F4D3F]">men's</em>
                </span>
              </span>{' '}
              <span className="word" style={{ ['--i' as string]: 6 }}>
                <span>
                  <em className="italic text-[#1F4D3F]">health</em>.
                </span>
              </span>
            </h1>

            <p className="animate-reveal-3 mt-6 text-[17px] sm:text-lg leading-relaxed text-[#575C55] max-w-[34rem]">
              Sort out what you know, check for warning signs first, and leave with a summary you can take to a
              professional. No account, no name, nothing sent anywhere unless you ask.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-6 max-w-[34rem] px-4 py-3 rounded-lg bg-[#FBEDEA] border border-[#F0C9C2] text-sm text-[#8F1D17] flex items-start justify-between gap-3"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="font-mono text-xs underline underline-offset-2 shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="animate-reveal-4 mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStartBlank()}
                className="btn-pill-primary px-6 text-[15px]"
              >
                {loading === 'blank' ? (
                  <>
                    <span className="spinner spinner-sm spinner-white" />
                    Opening a session…
                  </>
                ) : (
                  <>
                    Begin privately
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
              <button type="button" onClick={scrollToStart} className="ink-link text-[15px] font-medium cursor-pointer">
                Other ways to start
              </button>
            </div>

            <div className="animate-reveal-5 mt-8 flex items-center gap-3">
              <span id="lang-label" className="font-mono text-[11px] text-[#8A8C84]">
                Session language
              </span>
              <div
                role="radiogroup"
                aria-labelledby="lang-label"
                className="inline-flex p-0.5 rounded-lg border border-[#D6D0C2] bg-[#FBFAF6]"
              >
                {([
                  ['en', 'English'],
                  ['ar', 'العربية'],
                ] as const).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={preferredLanguage === code}
                    onClick={() => setPreferredLanguage(code)}
                    lang={code}
                    className={`px-3 py-1 rounded-md text-[13px] transition-colors cursor-pointer ${
                      preferredLanguage === code ? 'bg-[#1A1F1C] text-[#F4F1EA]' : 'text-[#575C55] hover:text-[#1A1F1C]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3D stage */}
          <div className="lg:col-span-5 animate-reveal-3">
            <div className="hero-stage relative h-[380px] sm:h-[460px] lg:h-[580px]">
              <Scene
                kind="hero"
                label="A rotating double helix with glass spheres drifting around it. Drag to turn it, tap to send a ripple of light along it."
                className="absolute inset-0"
              />
              <span className="stage-tick tl" aria-hidden="true" />
              <span className="stage-tick tr" aria-hidden="true" />
              <span className="stage-tick bl" aria-hidden="true" />
              <span className="stage-tick br" aria-hidden="true" />
              <p className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-center justify-between font-mono text-[11px] text-[#8A8C84]">
                <span>Drag to turn · tap to play</span>
                <span>Illustration</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* URGENT RULE */}
      <section aria-label="Urgent help" className="w-full border-y border-[#F0C9C2] bg-[#FBEDEA]">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-8 lg:px-12 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[15px] text-[#1A1F1C] flex items-start sm:items-center gap-3">
            <span className="mt-1.5 sm:mt-0 w-2 h-2 rounded-full bg-[#B3261E] shrink-0" aria-hidden="true" />
            <span>
              Sudden severe testicular pain, an injury, or painful swelling with fever?
              <span className="text-[#575C55]"> Don't wait for a questionnaire.</span>
            </span>
          </p>
          <a href="/urgent.html" className="btn-pill-ruby px-4 text-sm no-underline self-start sm:self-auto whitespace-nowrap">
            Open urgent guidance
          </a>
        </div>
      </section>

      {/* CHAPTER 1: THE KEY STAYS WITH YOU */}
      <section className="w-full px-4 sm:px-8 lg:px-12" aria-labelledby="ledger-heading">
        <div className="max-w-[1240px] mx-auto py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-5">
            <Kicker>Chapter 1 · The key stays with you</Kicker>
            <h2 id="ledger-heading" className="font-serif text-4xl sm:text-5xl text-[#1A1F1C] mt-4 leading-[1.02]">
              What leaves this tab.
            </h2>
            <p className="mt-5 text-[#575C55] leading-relaxed max-w-[38ch]">
              Almost nothing, and only when you say so. Open the lock, then read the ledger line by line.
            </p>
            <div className="hero-stage relative mt-8 h-[300px] sm:h-[340px]">
              <Scene
                kind="vault"
                label="A padlock that opens as you hover over it. Tap it to open or close it."
                className="absolute inset-0"
              />
              <p className="pointer-events-none absolute bottom-3 left-4 font-mono text-[11px] text-[#8A8C84]">Hover or tap the lock</p>
            </div>
          </div>
          {/* Ledger card */}
          <aside className="lg:col-span-7 tilt-scene" aria-labelledby="ledger-title" onPointerMove={onTilt} onPointerLeave={onTiltEnd}>
            <div className="relative tilt-card">
              <div
                className="absolute inset-0 translate-x-2 translate-y-2 rounded-[14px] border border-[#D6D0C2] bg-[#EFEBE2]"
                aria-hidden="true"
              />
              <div className="relative index-card overflow-hidden">
                <div className="px-5 pt-4 pb-3 flex items-baseline justify-between border-b border-[#E4DFD3]">
                  <h2 id="ledger-title" className="font-serif text-2xl text-[#1A1F1C]">
                    What leaves this tab
                  </h2>
                  <span className="font-mono text-[11px] text-[#8A8C84]">tap a line</span>
                </div>
                <ul className="divide-y divide-[#E4DFD3]">
                  {LEDGER.map((entry, idx) => {
                    const open = openLedger === idx;
                    return (
                      <li key={entry.item}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenLedger(open ? null : idx)}
                          className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-[#F7F5EF] transition-colors"
                        >
                          <span className="flex items-center gap-3">
                            <span className="font-mono text-[11px] text-[#8A8C84] tabular w-4">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[15px] text-[#1A1F1C]">{entry.item}</span>
                          </span>
                          <span
                            className={`font-mono text-[11px] px-2 py-0.5 rounded border whitespace-nowrap ${
                              entry.tone === 'never'
                                ? 'border-[#D6D0C2] text-[#575C55]'
                                : entry.tone === 'session'
                                ? 'border-[#C8D6CC] bg-[#E8EFEA] text-[#1F4D3F]'
                                : 'border-[#E8D9B5] bg-[#FBF3E0] text-[#8A5A00]'
                            }`}
                          >
                            {entry.status}
                          </span>
                        </button>
                        <div className={`accordion-grid ${open ? 'is-open' : ''}`}>
                          <div className="accordion-grid-inner">
                            <p className="px-5 pb-4 pl-12 text-sm text-[#575C55] leading-relaxed">{entry.detail}</p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-5 py-3 bg-[#F7F5EF] border-t border-[#E4DFD3] font-mono text-[11px] text-[#8A8C84]">
                  Enforced on the server, not by hiding buttons
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* SESSION PATH */}
      <section className="w-full px-4 sm:px-8 lg:px-12" aria-labelledby="path-title">
        <div className="max-w-[1240px] mx-auto py-20 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end mb-10 lg:mb-14">
            <div className="lg:col-span-6">
              <Kicker>How a session moves</Kicker>
              <h2 id="path-title" className="font-serif text-4xl sm:text-5xl text-[#1A1F1C] mt-4 leading-[1.02]">
                Six steps. You can stop after any of them.
              </h2>
            </div>
            <p className="lg:col-span-5 lg:col-start-8 text-[#575C55] leading-relaxed">
              Nothing advances on its own. Use the list, or the arrow keys, to see what each step does and what it
              deliberately doesn't do.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label="Session steps"
              className="lg:col-span-4 flex lg:flex-col overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 gap-1.5 lg:gap-0 lg:border-l lg:border-[#D6D0C2]"
            >
              {PATH.map((s, idx) => {
                const selected = idx === activeStep;
                return (
                  <button
                    key={s.key}
                    ref={el => {
                      tabRefs.current[idx] = el;
                    }}
                    role="tab"
                    id={`path-tab-${s.key}`}
                    aria-selected={selected}
                    aria-controls="path-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActiveStep(idx)}
                    onKeyDown={e => onTabKey(e, idx)}
                    className={`relative shrink-0 text-left cursor-pointer transition-colors px-4 py-3 lg:pl-6 rounded-lg lg:rounded-none border lg:border-0 ${
                      selected
                        ? 'bg-[#FBFAF6] border-[#1A1F1C] lg:bg-transparent text-[#1A1F1C]'
                        : 'border-[#E4DFD3] text-[#8A8C84] hover:text-[#1A1F1C]'
                    }`}
                  >
                    <span
                      className={`hidden lg:block absolute -left-px top-0 bottom-0 w-[2px] transition-transform duration-300 origin-top bg-[#1A1F1C] ${
                        selected ? 'scale-y-100' : 'scale-y-0'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-[11px] tabular">{String(idx + 1).padStart(2, '0')}</span>
                      <span className={`text-[15px] lg:text-lg whitespace-nowrap ${selected ? 'font-medium' : ''}`}>{s.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div id="path-panel" role="tabpanel" aria-labelledby={`path-tab-${step.key}`} className="lg:col-span-8">
              <div key={step.key} className="workflow-step-enter index-card p-6 sm:p-10 min-h-[320px] flex flex-col">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-[11px] text-[#8A8C84]">
                    Step {activeStep + 1} of {PATH.length}
                  </span>
                  {step.key === 'referral' && (
                    <span className="tag" data-mock="true">
                      Mock
                    </span>
                  )}
                  {step.key === 'safety' && <span className="tag">CLINICAL_TBD</span>}
                </div>
                <h3 className="font-serif text-3xl sm:text-4xl text-[#1A1F1C] mt-5 leading-tight max-w-[22ch]">
                  {step.title}
                </h3>
                <p className="mt-4 text-[#575C55] leading-relaxed max-w-[52ch]">{step.body}</p>
                <div className="mt-auto pt-8">
                  <div className="flex gap-1.5 mb-4" aria-hidden="true">
                    {PATH.map((p, i) => (
                      <span
                        key={p.key}
                        className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
                          i <= activeStep ? 'bg-[#1A1F1C]' : 'bg-[#E4DFD3]'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="font-mono text-xs text-[#575C55] flex items-start gap-2">
                    <span className="text-[#1F4D3F]" aria-hidden="true">
                      ↳
                    </span>
                    {step.note}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(i => Math.max(0, i - 1))}
                  disabled={activeStep === 0}
                  className="font-mono text-xs text-[#575C55] hover:text-[#1A1F1C] disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(i => Math.min(PATH.length - 1, i + 1))}
                  disabled={activeStep === PATH.length - 1}
                  className="font-mono text-xs text-[#575C55] hover:text-[#1A1F1C] disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* READING A REPORT */}
      <section className="w-full px-4 sm:px-8 lg:px-12 bg-[#EFEBE2] border-y border-[#E4DFD3]" aria-labelledby="report-title">
        <div className="max-w-[1240px] mx-auto py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-5 lg:sticky lg:top-32 self-start">
            <Kicker>If you already have a lab report</Kicker>
            <h2 id="report-title" className="font-serif text-4xl sm:text-5xl text-[#1A1F1C] mt-4 leading-[1.02]">
              Read it one line at a time.
            </h2>
            <p className="mt-5 text-[#575C55] leading-relaxed max-w-[40ch]">
              Sanad records each value exactly as printed, with its unit. It never converts units, and it never draws
              a conclusion from one number.
            </p>

            <div key={row.code} className="mt-8 border-l-2 border-[#1A1F1C] pl-5 workflow-step-enter" aria-live="polite">
              <p className="font-mono text-[11px] text-[#8A8C84]">
                {row.code} · {row.unit}
              </p>
              <p className="text-xl text-[#1A1F1C] mt-1 font-medium">{row.label}</p>
              <p className="mt-2 text-[#575C55] leading-relaxed">{row.explain}</p>
              <p className="mt-3 font-mono text-[11px] text-[#8A8C84]">Education draft · CLINICAL_TBD</p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <figure className="bg-[#FBFAF6] border border-[#D6D0C2] rounded-[4px] shadow-[var(--shadow-3)] lg:rotate-[0.6deg] transition-transform duration-500 hover:rotate-0">
              <div className="px-5 sm:px-8 pt-6 pb-4 border-b-2 border-[#1A1F1C] flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-[#8A8C84]">Specimen report</p>
                  <p className="font-serif text-2xl text-[#1A1F1C] mt-1">Synthetic Lab No. 4</p>
                </div>
                <span className="tag" data-mock="true">
                  Mock · synthetic
                </span>
              </div>
              <div className="px-5 sm:px-8 py-3 grid grid-cols-3 gap-4 font-mono text-[11px] text-[#575C55] border-b border-[#E4DFD3]">
                <span>Collected 2026-10-15</span>
                <span>Abstinence 3 d</span>
                <span className="text-right">Ref: synthetic</span>
              </div>
              <table className="w-full text-left">
                <caption className="sr-only">Synthetic semen analysis report. Select a row to read what it measures.</caption>
                <thead>
                  <tr className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#8A8C84]">
                    <th scope="col" className="px-5 sm:px-8 py-3 font-normal">
                      Measure
                    </th>
                    <th scope="col" className="py-3 font-normal text-right">
                      Result
                    </th>
                    <th scope="col" className="px-5 sm:px-8 py-3 font-normal">
                      Unit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {REPORT_ROWS.map((r, idx) => {
                    const on = idx === activeRow;
                    return (
                      <tr
                        key={r.code}
                        onMouseEnter={() => setActiveRow(idx)}
                        className={`border-t border-[#E4DFD3] transition-colors ${on ? 'bg-[#E8EFEA]' : ''}`}
                      >
                        <th scope="row" className="px-5 sm:px-8 py-0 font-normal">
                          <button
                            type="button"
                            onClick={() => setActiveRow(idx)}
                            onFocus={() => setActiveRow(idx)}
                            aria-pressed={on}
                            className="w-full py-3.5 text-left text-[15px] text-[#1A1F1C] cursor-pointer flex items-center gap-2"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full transition-colors ${on ? 'bg-[#1F4D3F]' : 'bg-transparent'}`}
                              aria-hidden="true"
                            />
                            {r.label}
                          </button>
                        </th>
                        <td
                          className={`py-3.5 text-right font-mono tabular text-[15px] ${
                            r.value === '-' ? 'text-[#8A8C84]' : 'text-[#1A1F1C]'
                          }`}
                        >
                          {r.value === '-' ? <span title="Not reported">-</span> : r.value}
                        </td>
                        <td className="px-5 sm:px-8 py-3.5 font-mono text-xs text-[#575C55]">{r.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <figcaption className="px-5 sm:px-8 py-4 border-t border-[#E4DFD3] font-mono text-[11px] text-[#8A8C84] leading-relaxed">
                Invented values for illustration. No reference limits are shown because none are approved for this
                prototype (CLINICAL_TBD).
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* GROUND RULES */}
      <section className="w-full px-4 sm:px-8 lg:px-12" aria-labelledby="never-title">
        <div className="max-w-[1240px] mx-auto py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <Kicker>Ground rules</Kicker>
            <h2 id="never-title" className="font-serif text-4xl sm:text-5xl text-[#1A1F1C] mt-4 leading-[1.02]">
              Things Sanad won't do.
            </h2>
          </div>
          <ol className="lg:col-span-8 border-t border-[#1A1F1C]">
            {PROMISES.map(([head, body], i) => (
              <li
                key={head}
                className="group grid grid-cols-[2.5rem_1fr] sm:grid-cols-[3.5rem_minmax(0,17rem)_1fr] gap-x-4 gap-y-1 py-6 border-b border-[#D6D0C2] reveal"
              >
                <span className="font-mono text-xs text-[#8A8C84] tabular pt-1.5">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-lg text-[#1A1F1C] font-medium leading-snug transition-transform duration-300 group-hover:translate-x-1">
                  {head}
                </p>
                <p className="col-start-2 sm:col-start-3 text-[#575C55] leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* START CHOOSER */}
      <section id="start" className="w-full px-4 sm:px-8 lg:px-12 scroll-mt-28" aria-labelledby="start-title">
        <div className="max-w-[1240px] mx-auto pb-20 lg:pb-28">
          <div className="medical-card-sapphire !rounded-[18px] p-6 sm:p-10 lg:p-14 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <Kicker tone="dark">Start a session</Kicker>
              <h2 id="start-title" className="font-serif text-4xl sm:text-5xl text-[#F4F1EA] mt-4 leading-[1.02]">
                Pick a starting point.
              </h2>
              <p className="mt-5 text-[#C9CFC9] leading-relaxed max-w-[38ch]">
                Every path opens the same consent and safety steps. Sample and upload cases use synthetic data only.
              </p>
            </div>

            <div className="lg:col-span-7">
              <fieldset>
                <legend className="sr-only">Starting point</legend>
                <div className="space-y-2">
                  {([
                    { mode: 'blank', title: 'Answer for yourself', body: 'An empty session. You answer the questions.' },
                    {
                      mode: 'sample',
                      title: 'Walk through a synthetic case',
                      body: samplesUnavailable
                        ? 'The sample list is unavailable right now.'
                        : samples.length > 0
                        ? `${samples.length} invented profiles, pre-filled.`
                        : 'Invented profiles, pre-filled.',
                    },
                    {
                      mode: 'upload',
                      title: 'Load an example profile file',
                      body: 'A synthetic JSON profile with two lab values attached.',
                    },
                  ] as const).map(opt => {
                    const checked = startMode === opt.mode;
                    return (
                      <div
                        key={opt.mode}
                        className={`rounded-xl border transition-colors ${
                          checked ? 'border-[#F4F1EA] bg-[#F4F1EA]/[0.05]' : 'border-[#3A4540] hover:border-[#6B766F]'
                        }`}
                      >
                        <label className="flex items-start gap-4 p-4 sm:p-5 cursor-pointer">
                          <input
                            type="radio"
                            name="start-mode"
                            value={opt.mode}
                            checked={checked}
                            onChange={() => setStartMode(opt.mode)}
                            className="peer sr-only"
                          />
                          <span
                            className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#F4F1EA] ${
                              checked ? 'border-[#F4F1EA]' : 'border-[#6B766F]'
                            }`}
                            aria-hidden="true"
                          >
                            <span
                              className={`w-2 h-2 rounded-full bg-[#F4F1EA] transition-transform duration-200 ${
                                checked ? 'scale-100' : 'scale-0'
                              }`}
                            />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[#F4F1EA] font-medium">{opt.title}</span>
                            <span className="block text-sm text-[#A9B3AC] mt-0.5">{opt.body}</span>
                          </span>
                        </label>
                        {opt.mode === 'sample' && checked && samples.length > 0 && (
                          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pl-12 sm:pl-[3.25rem] flex flex-wrap gap-1.5" role="group" aria-label="Synthetic profiles">
                            {samples.map(s => (
                              <button
                                key={s.fixture_id}
                                type="button"
                                onClick={() => setSelectedFixture(s.fixture_id)}
                                aria-pressed={selectedFixture === s.fixture_id}
                                title={s.description}
                                className={`px-2.5 py-1 rounded-md font-mono text-[11px] border transition-colors cursor-pointer ${
                                  selectedFixture === s.fixture_id
                                    ? 'bg-[#F4F1EA] text-[#1A1F1C] border-[#F4F1EA]'
                                    : 'text-[#C9CFC9] border-[#3A4540] hover:border-[#A9B3AC]'
                                }`}
                              >
                                {s.fixture_id} · {s.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p className="font-mono text-[11px] text-[#A9B3AC]">
                  Language: {preferredLanguage === 'en' ? 'English' : 'العربية'}
                </p>
                <button
                  type="button"
                  disabled={busy || (startMode === 'sample' && samplesUnavailable)}
                  onClick={handleChosenStart}
                  className="inline-flex items-center gap-2 min-h-[44px] px-6 rounded-[10px] bg-[#F4F1EA] text-[#1A1F1C] font-semibold shadow-[0_2px_0_#A9B3AC] hover:bg-[#FFFFFF] active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow,background-color] duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? (
                    <>
                      <span className="spinner spinner-sm" />
                      Opening…
                    </>
                  ) : (
                    <>Continue to consent →</>
                  )}
                </button>
              </div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-[#F0C9C2]">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* QUESTIONS */}
      <section className="w-full px-4 sm:px-8 lg:px-12 border-t border-[#E4DFD3]" aria-labelledby="faq-title">
        <div className="max-w-[1240px] mx-auto py-20 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <Kicker>Questions people ask first</Kicker>
            <h2 id="faq-title" className="sr-only">
              Frequently asked questions
            </h2>
            <ul className="mt-6">
              {FAQS.map((f, idx) => (
                <li key={f.q} className="border-b border-[#E4DFD3]">
                  <button
                    type="button"
                    aria-expanded={activeFaq === idx}
                    onClick={() => setActiveFaq(idx)}
                    className={`w-full text-left py-3.5 pr-4 flex items-start gap-3 cursor-pointer transition-colors ${
                      activeFaq === idx ? 'text-[#1A1F1C]' : 'text-[#8A8C84] hover:text-[#1A1F1C]'
                    }`}
                  >
                    <span className="font-mono text-[11px] pt-1.5 tabular w-5 shrink-0">Q{idx + 1}</span>
                    <span className="text-[17px] leading-snug">{f.q}</span>
                  </button>
                  <div className={`lg:hidden accordion-grid ${activeFaq === idx ? 'is-open' : ''}`}>
                    <div className="accordion-grid-inner">
                      <p className="pb-4 pl-8 text-[#575C55] leading-relaxed">{f.a}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden lg:block lg:col-span-6 lg:col-start-7">
            <div key={activeFaq} className="workflow-step-enter lg:sticky lg:top-32 pt-6" aria-live="polite">
              <p className="font-serif text-3xl text-[#1A1F1C] leading-tight">{FAQS[activeFaq].q}</p>
              <p className="mt-5 text-lg text-[#575C55] leading-relaxed max-w-[48ch]">{FAQS[activeFaq].a}</p>
            </div>
          </div>
        </div>
      </section>

      {/* APPENDIX */}
      <section className="w-full px-4 sm:px-8 lg:px-12 pb-16" aria-label="Technical appendix">
        <div className="max-w-[1240px] mx-auto">
          <button
            type="button"
            onClick={() => setShowAppendix(v => !v)}
            aria-expanded={showAppendix}
            className="font-mono text-xs text-[#575C55] hover:text-[#1A1F1C] cursor-pointer inline-flex items-center gap-2"
          >
            <span className={`inline-block transition-transform duration-200 ${showAppendix ? 'rotate-90' : ''}`}>›</span>
            Technical appendix: conceptual FHIR R4 mapping
          </button>
          <div className={`accordion-grid ${showAppendix ? 'is-open' : ''}`}>
            <div className="accordion-grid-inner">
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 border border-[#D6D0C2] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-[#D6D0C2] bg-[#FBFAF6]">
                {[
                  ['AssessmentCase', 'Patient, synthetic pseudonym identifiers'],
                  ['ClinicalObservation', 'Observation, placeholder test codes'],
                  ['ConsentLedger', 'Consent, checked on the server per action'],
                ].map(([name, maps]) => (
                  <div key={name} className="p-4">
                    <p className="font-mono text-xs text-[#1A1F1C]">{name}</p>
                    <p className="text-sm text-[#575C55] mt-1">→ {maps}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[11px] text-[#8A8C84]">
                Conceptual only · NOT_EVALUATED. This does not claim interoperability or conformance.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
