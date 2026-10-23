/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN: each reason a classifier crisis read keeps
 * its guidance, the one shape that goes to the independent second read (the
 * crisis adjudicator), and the modes: off does nothing, shadow logs and
 * changes nothing, live eases only on the second read's confident "checkin",
 * and anything else (escalate, low confidence, risk quoted, timeout, error)
 * keeps the guidance.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, default: logger, logger };
});

import { allowCrisisAdjudicatorLiveForTests } from '../crisis-adjudicator.js';
import {
  classifierOnlyCheckin,
  classifierOnlyWhy,
  resetClassifierOnlyReads,
  resolveClassifierOnlyCheckin,
  type ClassifierOnlyArgs,
} from '../crisis-classifier-only.js';
import { hasEscalateOnlyWords } from '../crisis-classifier-only-text.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from '../crisis-classifier.js';
import { detectCrisis } from '../crisis-guard.js';

const CRISIS: CrisisVerdict = { risk: 'crisis', subject: 'self' };
const IMMINENT: CrisisVerdict = { risk: 'imminent', subject: 'self' };
const NONE: CrisisVerdict = { risk: 'none', subject: 'self' };

/** The adjudicator's replies. */
const SAYS = {
  checkin: '{"caller_risk":"","decision":"checkin","confidence":"high"}',
  escalate: '{"caller_risk":"not so much","decision":"escalate","confidence":"high"}',
  lowConfidence: '{"caller_risk":"","decision":"checkin","confidence":"low"}',
  riskQuoted: '{"caller_risk":"once, maybe","decision":"checkin","confidence":"high"}',
  garbage: 'sure!',
};
const adjudicator = (reply: string): CrisisGenerateFn => vi.fn(async () => reply);

/** The 2026-10-22 prod canary turn: three quiet lines, a question about the week. */
const EARLIER = [
  "Hey Ferni, it's me.",
  'Not much, just a long week.',
  'Ah, yeah, I actually did send it Wednesday night. No reply yet though.',
];
const LATEST = 'The running, not so much. Once. maybe.';
const COMPANION =
  "Give it a bit of time. But listen, you mentioned it's been a long week. What's been going on?";

function args(over: Partial<ClassifierOnlyArgs> = {}): ClassifierOnlyArgs {
  const latest = over.latest ?? LATEST;
  return {
    detection: detectCrisis(latest),
    verdicts: [CRISIS, CRISIS],
    latest,
    earlier: EARLIER,
    companion: COMPANION,
    priorRisk: false,
    ...over,
  };
}

afterEach(() => allowCrisisAdjudicatorLiveForTests(false));
beforeEach(() => {
  info.mockClear();
  resetCrisisClassifierCache();
  resetClassifierOnlyReads();
  // Live tests lift the adjudicator's hold explicitly; 'live is held' below keeps it.
  allowCrisisAdjudicatorLiveForTests(true);
});

describe('classifierOnlyWhy', () => {
  it('sends the prod canary turn to the second read: two reads of one classifier, nothing else', () => {
    expect(classifierOnlyWhy(args())).toBe('eligible');
    expect(classifierOnlyWhy(args({ verdicts: [CRISIS] }))).toBe('eligible');
  });

  it.each<[string, Partial<ClassifierOnlyArgs>, string]>([
    ['a live adjudicator', { adjudicatorLive: true }, 'adjudicator_live'],
    ['a pattern match', { latest: 'I want to die.' }, 'pattern'],
    ['risk earlier on the call', { priorRisk: true }, 'prior_risk'],
    ['no reads', { verdicts: [] }, 'missing_read'],
    ['a read that timed out', { verdicts: [CRISIS, null] }, 'missing_read'],
    ['an imminent read beside a crisis read', { verdicts: [CRISIS, IMMINENT] }, 'imminent'],
    ['no crisis read', { verdicts: [NONE] }, 'no_crisis_read'],
    [
      'a read about someone else',
      { verdicts: [{ risk: 'crisis', subject: 'third_party' }] },
      'third_party',
    ],
    ['means in the caller words', { latest: 'I have the pills here.' }, 'risk_words'],
    ['a time in the caller words', { latest: "Tonight's the night. Bye." }, 'risk_words'],
    ['words outside plain ASCII', { latest: 'ya no puedo más' }, 'risk_words'],
    ['agreeing with Ferni', { latest: 'Yeah, same, honestly.' }, 'endorses'],
    ['Ferni asked if they are okay', { companion: 'Hey, are you doing okay?' }, 'safety_talk'],
    ['Ferni gave the 988 line', { companion: 'You can call or text 988 any time.' }, 'safety_talk'],
    [
      'an earlier pattern match',
      { earlier: [...EARLIER, "I don't want to be here anymore."] },
      'earlier_pattern',
    ],
    ['an early read (two earlier lines)', { earlier: EARLIER.slice(0, 2) }, 'too_early'],
    [
      'risk words in a recent earlier line',
      { earlier: [...EARLIER, 'So ready for the weekend.'] },
      'risk_words',
    ],
  ])('keeps the guidance for %s', (_name, over, why) => {
    expect(classifierOnlyWhy(args(over))).toBe(why);
  });

  it('keeps the guidance for a voice-distress or session-escalation reading', () => {
    const detection = { ...detectCrisis(LATEST), severity: 0.2, indicators: ['voice_distress'] };
    expect(classifierOnlyWhy(args({ detection }))).toBe('pattern');
  });

  it('fails closed on input it cannot read', () => {
    expect(classifierOnlyWhy(args({ latest: undefined as unknown as string }))).not.toBe(
      'eligible'
    );
    expect(classifierOnlyWhy(args({ earlier: [42 as unknown as string] }))).not.toBe('eligible');
    const throwing = {
      get isCrisis(): boolean {
        throw new Error('boom');
      },
    };
    expect(classifierOnlyWhy(args({ detection: throwing as never }))).toBe('error');
  });
});

describe('resolveClassifierOnlyCheckin', () => {
  it('is off unless shadow or live', () => {
    expect(resolveClassifierOnlyCheckin({})).toBe('off');
    expect(resolveClassifierOnlyCheckin({ CRISIS_CLASSIFIER_ONLY_CHECKIN: 'on' })).toBe('off');
    expect(resolveClassifierOnlyCheckin({ CRISIS_CLASSIFIER_ONLY_CHECKIN: ' Shadow ' })).toBe(
      'shadow'
    );
    expect(resolveClassifierOnlyCheckin({ CRISIS_CLASSIFIER_ONLY_CHECKIN: 'LIVE' })).toBe('live');
  });

  it("live is held to shadow until the adjudicator's hold is lifted (one hold for both)", () => {
    allowCrisisAdjudicatorLiveForTests(false);
    expect(resolveClassifierOnlyCheckin({ CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' })).toBe('shadow');
  });
});

describe('classifierOnlyCheckin', () => {
  const INPUT = { latest: LATEST, earlier: EARLIER, companion: COMPANION };
  let calls = 0;
  /** A call whose turn has these classifier reads gathered under its scope. */
  async function callWith(...reads: string[]): Promise<string> {
    const call = `call-${++calls}`;
    resetCrisisClassifierCache(); // identical input on another call would share a run
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    const runs = reads.map((reply, i) =>
      startCrisisClassifier(
        { ...INPUT, earlier: [...EARLIER.slice(i)] },
        { pattern: 'none', env, generate: async () => reply, scope: call, call }
      )
    );
    await Promise.all(runs.map((r) => r?.verdict));
    return call;
  }
  const J = (v: CrisisVerdict) => JSON.stringify(v);
  const run = async (
    mode: string | undefined,
    over: Partial<Parameters<typeof classifierOnlyCheckin>[0]> = {},
    reads: string[] = [J(CRISIS), J(CRISIS)]
  ) => {
    const call = await callWith(...reads);
    return classifierOnlyCheckin({
      detection: detectCrisis(LATEST),
      verdict: CRISIS,
      input: INPUT,
      priorRisk: false,
      scope: call,
      call,
      env: mode === undefined ? {} : { CRISIS_CLASSIFIER_ONLY_CHECKIN: mode },
      adjudicate: adjudicator(SAYS.checkin),
      source: 'gate',
      ...over,
    });
  };
  const logged = () =>
    info.mock.calls
      .filter((c) => c[1] === 'CRISIS_CLASSIFIER_ONLY')
      .map((c) => {
        const { secondReadMs: _ms, ...rest } = c[0] as Record<string, unknown>;
        return rest;
      });
  const settle = () =>
    new Promise<void>((r) => {
      setTimeout(r, 0);
    });

  it('off: never eases, never asks the second read, logs nothing', async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    expect(await run(undefined, { adjudicate })).toBe(false);
    expect(await run('off', { adjudicate })).toBe(false);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(logged()).toHaveLength(0);
  });

  it('shadow: decides off the reply path, logs what live would do, never eases', async () => {
    expect(await run('shadow')).toBe(false);
    expect(await run('shadow', { priorRisk: true })).toBe(false);
    await settle();
    expect(logged()).toEqual(
      expect.arrayContaining([
        { mode: 'shadow', source: 'gate', reads: 2, outcome: 'escalate', why: 'prior_risk' },
        {
          mode: 'shadow',
          source: 'gate',
          reads: 2,
          outcome: 'checkin',
          why: 'second_read_checkin',
          secondRead: 'model',
        },
      ])
    );
  });

  it('live while held: behaves as shadow, says so, never eases', async () => {
    allowCrisisAdjudicatorLiveForTests(false);
    expect(await run('live')).toBe(false);
    await settle();
    expect(logged().at(-1)).toMatchObject({ mode: 'shadow', liveHeld: true, outcome: 'checkin' });
  });

  it("live: eases only on the second read's confident checkin", async () => {
    expect(await run('live')).toBe(true);
    expect(logged().at(-1)).toMatchObject({ outcome: 'checkin', why: 'second_read_checkin' });
  });

  it.each([
    ['escalate', SAYS.escalate, 'model'],
    ['low confidence', SAYS.lowConfidence, 'low_confidence'],
    ['caller risk quoted', SAYS.riskQuoted, 'risk_quoted'],
    ['an unparsed reply', SAYS.garbage, 'unparsed'],
  ])('live: the second read says %s, the guidance stays', async (_n, reply, secondRead) => {
    expect(await run('live', { adjudicate: adjudicator(reply) })).toBe(false);
    expect(logged().at(-1)).toMatchObject({
      outcome: 'escalate',
      why: 'second_read_escalate',
      secondRead,
    });
  });

  it('live: a second read that fails or times out keeps the guidance', async () => {
    const failing: CrisisGenerateFn = async () => {
      throw new Error('vertex down');
    };
    expect(await run('live', { adjudicate: failing })).toBe(false);
    expect(logged().at(-1)).toMatchObject({ secondRead: 'error' });
    const hanging: CrisisGenerateFn = () =>
      new Promise<string>(() => {
        // never settles
      });
    const env = { CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live', CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS: '20' };
    expect(await run('live', { adjudicate: hanging, env })).toBe(false);
    expect(logged().at(-1)).toMatchObject({ secondRead: 'timeout' });
  });

  it('live: too little call for the second read to judge keeps the guidance', async () => {
    const transcript = [{ speaker: 'caller' as const, text: LATEST }];
    expect(await run('live', { transcript })).toBe(false);
    expect(logged().at(-1)).toMatchObject({ secondRead: 'no_context' });
  });

  it('live: a turn with independent support never reaches the second read', async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    expect(await run('live', { adjudicate }, [J(CRISIS), J(IMMINENT)])).toBe(false);
    expect(await run('live', { adjudicate }, [J(CRISIS), 'not json'])).toBe(false);
    expect(await run('live', { priorRisk: true, adjudicate })).toBe(false);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(logged().map((c) => c.why)).toEqual(['imminent', 'missing_read', 'prior_risk']);
  });

  it('live: with no scope to gather the reads under, a read counts as missing', async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    expect(await run('live', { scope: undefined, adjudicate })).toBe(false);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(logged().at(-1)).toMatchObject({ why: 'missing_read', reads: 0 });
  });

  it("shares one second read between a turn's duplicate requests", async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    const call = await callWith(J(CRISIS));
    const ask = () =>
      classifierOnlyCheckin({
        detection: detectCrisis(LATEST),
        verdict: CRISIS,
        input: INPUT,
        priorRisk: false,
        scope: call,
        call,
        env: { CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' },
        adjudicate,
        source: 'gate',
      });
    expect(await ask()).toBe(true);
    expect(await ask()).toBe(true);
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });

  it('the pipeline never reads on its own: with no gate read it escalates', async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    const env = {
      CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live',
      CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS: '10',
      CRISIS_CLASSIFIER_TIMEOUT_MS: '10',
    };
    expect(await run('live', { source: 'pipeline', adjudicate, env })).toBe(false);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(logged().at(-1)).toMatchObject({ why: 'no_shared_read' });
  });
});

describe('escalate-only words (they can only keep the guidance)', () => {
  /** The 2026-10-22 safety review's 20 real-risk phrasings: none may reach the second read. */
  const REVIEW = [
    "thanks for everything ferni, you've been a real friend",
    'can you make sure someone takes care of max for me',
    "I won't be a problem much longer",
    'nothing matters anymore',
    "I don't want to do this anymore",
    "who would even notice if I wasn't here",
    "I've made my peace with it",
    "I'm a waste of space",
    'I just want everything to stop',
    "there's no reason to keep going",
    'can you call 988 for me',
    'I keep thinking about the pills in the cabinet',
    'I gave my guitar to my brother today',
    'I wrote down my bank login for my sister',
    'ya no puedo mas, estoy cansado de todo',
    'no aguanto mas',
    'I just want to see my mom again',
    "I'm not gonna be around for that",
    "I won't need it after this week",
    'this is the last time we will talk',
  ];
  it.each(REVIEW)('%j never reaches the second read', (latest) => {
    expect(classifierOnlyWhy(args({ latest, detection: detectCrisis(latest) }))).not.toBe(
      'eligible'
    );
  });

  it.each([
    'ya no puedo más',
    'my therapist moved our session',
    'call the crisis line',
    'can you feed the cat for me',
    'I gave all my records away',
  ])('%j is an escalate-only phrase', (text) => {
    expect(hasEscalateOnlyWords(text)).toBe(true);
  });

  it('keeps the 2026-10-22 canary line and its call eligible', () => {
    expect(hasEscalateOnlyWords(LATEST)).toBe(false);
    for (const line of EARLIER) expect(hasEscalateOnlyWords(line)).toBe(false);
  });

  it('an escalate-only word in a recent earlier line keeps the guidance', () => {
    expect(classifierOnlyWhy(args({ earlier: [...EARLIER, 'I gave my bike away.'] }))).toBe(
      'escalate_words'
    );
  });
});
