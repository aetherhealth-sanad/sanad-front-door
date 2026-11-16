import { Scene } from './Scene';
import type { SceneKind } from './Scene3D';

/**
 * The patient journey told as six short chapters.
 * Copy is plain and neutral. It frames the step, never interprets the person's answers,
 * and never claims anything clinical. Simulated steps say so.
 */
interface Chapter {
  n: number;
  title: string;
  name: string;
  line: string;
  next: string;
  scene: SceneKind;
  sceneLabel: string;
  mock?: boolean;
}

const TOTAL = 6;

const CHAPTERS: Record<string, Chapter> = {
  '/consent': {
    n: 1,
    name: 'Consent',
    title: 'The key stays with you',
    line: 'Before a single question, you decide what this session may do. You can switch any permission off later.',
    next: 'A short safety check',
    scene: 'vault',
    sceneLabel: 'A padlock that opens as you hover over it. Tap it to open or close.',
  },
  '/safety': {
    n: 2,
    name: 'Safety check',
    title: 'Safety comes first',
    line: 'A few questions about warning signs. If anything sounds urgent, you are pointed to help straight away.',
    next: 'Your questions',
    scene: 'beacon',
    sceneLabel: 'A calm pulse of rings spreading outward. Tap to send another pulse.',
  },
  '/intake': {
    n: 3,
    name: 'Questions',
    title: 'Your story, at your pace',
    line: '"Not sure" and "Prefer not to say" are real answers here. They are recorded as they are.',
    next: 'Review what was recorded',
    scene: 'helix',
    sceneLabel: 'A helix that lights up one step for each core question you answer.',
  },
  '/lab': {
    n: 3,
    name: 'Questions',
    title: 'Bring your lab report',
    line: 'Optional. Each value is kept exactly as printed, with its unit. Nothing is converted.',
    next: 'Back to your questions',
    scene: 'vial',
    sceneLabel: 'A glass vial that fills as you add lab values. Tap to swirl it.',
  },
  '/review': {
    n: 4,
    name: 'Review',
    title: 'Everything, in one place',
    line: 'See what was recorded and where each fact came from. Change anything before you go on.',
    next: 'Your summary',
    scene: 'slabs',
    sceneLabel: 'A stack of layers, one for each recorded fact. Hover to pull them apart.',
  },
  '/result': {
    n: 5,
    name: 'Summary',
    title: 'Something to take with you',
    line: 'A plain-language overview to bring to a professional. It is not a diagnosis.',
    next: 'An optional next step',
    scene: 'orbit',
    sceneLabel: 'Small spheres orbiting a glass core. Tap to speed them up.',
  },
  '/referral': {
    n: 6,
    name: 'Next step',
    title: 'Only if you want one',
    line: 'Everything on this page is simulated. Nothing is sent to a real clinic, and you can stop here.',
    next: 'Follow the simulated request',
    scene: 'path',
    sceneLabel: 'A winding path with five stops. Tap to make the marker hop.',
    mock: true,
  },
  '/tracking': {
    n: 6,
    name: 'Next step',
    title: 'Following along',
    line: 'This is a simulated request. Progress here is a demonstration, not real care.',
    next: 'End the session whenever you like',
    scene: 'orbit',
    sceneLabel: 'Small spheres orbiting a glass core. Tap to speed them up.',
    mock: true,
  },
};

interface StoryBannerProps {
  route: string;
  coreDone: number;
  coreTotal: number;
  factCount: number;
  labCount: number;
}

export function StoryBanner({ route, coreDone, coreTotal, factCount, labCount }: StoryBannerProps) {
  const ch = CHAPTERS[route];
  if (!ch) return null;

  let value = 0;
  let count = 0;
  let status: string | null = null;
  if (route === '/intake') {
    value = coreTotal > 0 ? coreDone / coreTotal : 0;
    status =
      coreTotal === 0
        ? null
        : coreDone >= coreTotal
        ? 'Every core question has an answer.'
        : `${coreDone} of ${coreTotal} core questions answered`;
  } else if (route === '/lab') {
    value = Math.min(1, labCount / 5);
    status = labCount === 0 ? 'No lab values yet. This step is optional.' : `${labCount} lab value${labCount === 1 ? '' : 's'} recorded`;
  } else if (route === '/review') {
    count = Math.max(1, factCount);
    status = `${factCount} fact${factCount === 1 ? '' : 's'} recorded so far`;
  }

  return (
    <section aria-label={`Chapter ${ch.n} of ${TOTAL}: ${ch.title}`} className="w-full px-4 sm:px-8 lg:px-12 pt-4 sm:pt-6">
      <div key={route} className="max-w-[1440px] mx-auto">
        <div className="index-card overflow-hidden grid grid-cols-[minmax(0,1fr)_104px] sm:grid-cols-[minmax(0,1fr)_200px] md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-4 sm:p-6 md:p-7 flex flex-col">
            <p className="story-in font-mono text-[11px] tracking-[0.06em] uppercase text-[#8A8C84] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[#1A1F1C]">
                Chapter {ch.n} of {TOTAL}
              </span>
              <span aria-hidden="true">/</span>
              <span>{ch.name}</span>
              {ch.mock && (
                <span className="tag !text-[10px] !py-0" data-mock="true">
                  Mock
                </span>
              )}
            </p>
            <h2 className="story-in-2 font-serif text-[26px] sm:text-4xl leading-[1.05] text-[#1A1F1C] mt-2">{ch.title}</h2>
            <p className="story-in-3 hidden sm:block mt-3 text-[15px] text-[#575C55] leading-relaxed max-w-[52ch]">{ch.line}</p>

            {status && (
              <p className="story-in-3 mt-3 font-mono text-[12px] text-[#1F4D3F]" aria-live="polite">
                {status}
              </p>
            )}

            <div className="mt-auto pt-4 sm:pt-5">
              <ol className="flex gap-1.5" aria-label="Journey chapters">
                {Array.from({ length: TOTAL }, (_, i) => (
                  <li
                    key={i}
                    className={`story-seg flex-1 ${i + 1 < ch.n ? 'done' : i + 1 === ch.n ? 'now' : ''}`}
                    aria-current={i + 1 === ch.n ? 'step' : undefined}
                  >
                    <i />
                  </li>
                ))}
              </ol>
              <p className="mt-2.5 font-mono text-[11px] text-[#8A8C84]">
                Next <span aria-hidden="true">→</span> <span className="text-[#575C55]">{ch.next}</span>
              </p>
            </div>
          </div>

          <div className="relative border-l border-[#E4DFD3] bg-[#F7F5EF] min-h-[150px] sm:min-h-[190px]">
            <Scene kind={ch.scene} value={value} count={count} label={ch.sceneLabel} className="absolute inset-0" />
            <span className="hidden sm:block absolute bottom-2 left-3 font-mono text-[10px] text-[#8A8C84] pointer-events-none">
              Drag to turn · tap to play
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
