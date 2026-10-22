/**
 * CRISIS_CLASSIFIER_ONLY_CHECKIN: each reason a classifier crisis read keeps
 * its guidance, the one shape that goes to the independent second read (the
 * crisis adjudicator), and the modes: off does nothing, shadow logs and
 * changes nothing, live eases only on the second read's confident "checkin",
 * and anything else (escalate, low confidence, risk quoted, timeout, error)
 * keeps the guidance.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, default: logger, logger };
});

import {
  classifierOnlyCheckin,
  classifierOnlyWhy,
  resetClassifierOnlyReads,
  resolveClassifierOnlyCheckin,
  type ClassifierOnlyArgs,
} from '../crisis-classifier-only.js';
import {
  resetCrisisClassifierCache,
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

beforeEach(() => {
  info.mockClear();
  resetCrisisClassifierCache();
  resetClassifierOnlyReads();
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
});

describe('classifierOnlyCheckin', () => {
  const run = (
    mode: string | undefined,
    over: Partial<Parameters<typeof classifierOnlyCheckin>[0]> = {}
  ) =>
    classifierOnlyCheckin({
      detection: detectCrisis(LATEST),
      verdict: CRISIS,
      input: { latest: LATEST, earlier: EARLIER, companion: COMPANION },
      priorRisk: false,
      env: mode === undefined ? {} : { CRISIS_CLASSIFIER_ONLY_CHECKIN: mode },
      adjudicate: adjudicator(SAYS.checkin),
      source: 'gate',
      ...over,
    });
  const logged = () =>
    info.mock.calls
      .filter((c) => c[1] === 'CRISIS_CLASSIFIER_ONLY')
      .map((c) => {
        const { secondReadMs: _ms, ...rest } = c[0] as Record<string, unknown>;
        return rest;
      });
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('off: never eases, never asks the second read, logs nothing', async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    expect(await run(undefined, { adjudicate })).toBe(false);
    expect(await run('off', { adjudicate })).toBe(false);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(logged()).toHaveLength(0);
  });

  it('shadow: runs the second read off the reply path, logs what live would do, never eases', async () => {
    expect(await run('shadow')).toBe(false);
    expect(await run('shadow', { priorRisk: true })).toBe(false);
    await settle();
    expect(logged()).toEqual(
      expect.arrayContaining([
        { mode: 'shadow', source: 'gate', reads: 1, outcome: 'escalate', why: 'prior_risk' },
        {
          mode: 'shadow',
          source: 'gate',
          reads: 1,
          outcome: 'checkin',
          why: 'second_read_checkin',
          secondRead: 'model',
        },
      ])
    );
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
    resetClassifierOnlyReads();
    const hanging: CrisisGenerateFn = () => new Promise(() => undefined);
    expect(
      await run('live', {
        adjudicate: hanging,
        env: { CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live', CRISIS_ADJUDICATOR_TIMEOUT_MS: '20' },
      })
    ).toBe(false);
    expect(logged().at(-1)).toMatchObject({ secondRead: 'timeout' });
  });

  it('live: too little call for the second read to judge keeps the guidance', async () => {
    const transcript = [{ speaker: 'caller' as const, text: LATEST }];
    expect(await run('live', { transcript })).toBe(false);
    expect(logged().at(-1)).toMatchObject({ secondRead: 'no_context' });
  });

  it('live: a turn with independent support never reaches the second read', async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    expect(await run('live', { verdict: IMMINENT, adjudicate })).toBe(false);
    expect(await run('live', { verdict: null, adjudicate })).toBe(false);
    expect(await run('live', { priorRisk: true, adjudicate })).toBe(false);
    expect(adjudicate).not.toHaveBeenCalled();
    expect(logged().map((c) => c.why)).toEqual(['imminent', 'missing_read', 'prior_risk']);
  });

  it("live: weighs every read of the turn under the call's scope", async () => {
    // No read was kept under this scope, so the lookup finds none: a missing read keeps the guidance.
    expect(await run('live', { scope: 'call-with-no-reads' })).toBe(false);
    expect(logged().at(-1)).toMatchObject({ why: 'missing_read', reads: 0 });
  });

  it("shares one second read between a turn's duplicate requests", async () => {
    const adjudicate = adjudicator(SAYS.checkin);
    expect(await run('live', { adjudicate, scope: undefined })).toBe(true);
    expect(await run('live', { adjudicate, scope: undefined })).toBe(true);
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });
});
