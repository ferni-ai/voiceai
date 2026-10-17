/**
 * The crisis adjudicator (CRISIS_ADJUDICATOR): a classifier-only crisis gets a
 * second, fuller read; only a confident "checkin" with no risk quoted from the
 * caller turns it into the soft check, and only in live mode. Every failure
 * escalates. Lines are synthetic. No network: every model call is a stub.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) => {
      const logger = real.createLogger(...args);
      return new Proxy(logger, {
        get: (target, prop, receiver) =>
          prop === 'info'
            ? (...a: unknown[]) => {
                logInfo(...a);
                return (target.info as (...x: unknown[]) => unknown).apply(target, a);
              }
            : Reflect.get(target, prop, receiver),
      });
    },
  };
});

import { startCrisisGate } from '../../../agents/personas/crisis-gate.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import {
  adjudicateCrisis,
  allowCrisisAdjudicatorLiveForTests,
  adjudicatedCheckin,
  adjudicatorEligible,
  normalizeTranscript,
  parseAdjudicatorReply,
  resetCrisisAdjudicatorCache,
  resolveCrisisAdjudicatorMode,
  startCrisisAdjudicator,
  transcriptFrom,
  type AdjudicatorLine,
} from '../crisis-adjudicator.js';
import { SOFT_CRISIS_CHECK } from '../crisis-agreement.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from '../crisis-classifier.js';

const CRISIS: CrisisVerdict = { risk: 'crisis', subject: 'self' };
const NONE: CrisisVerdict = { risk: 'none', subject: 'self' };
const IMMINENT: CrisisVerdict = { risk: 'imminent', subject: 'self' };
const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
const ESCALATE = '{"caller_risk":"took something","decision":"escalate","confidence":"high"}';
const CALL: AdjudicatorLine[] = [
  { speaker: 'ferni', text: 'Hey! What can I do for you?' },
  { speaker: 'caller', text: 'Can you call my mom for me?' },
  { speaker: 'ferni', text: "Sure, I don't have her number yet." },
  { speaker: 'caller', text: 'Can I give you her number?' },
];
const reply =
  (text: string): CrisisGenerateFn =>
  async () =>
    text;

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
  logInfo.mockClear();
  // Live is held back in production (see the 'live is held back' test); these tests exercise it.
  allowCrisisAdjudicatorLiveForTests(true);
});
afterEach(() => allowCrisisAdjudicatorLiveForTests(false));

describe('resolveCrisisAdjudicatorMode', () => {
  it('is off unless set to shadow or live, and registered off', () => {
    expect(resolveCrisisAdjudicatorMode({})).toBe('off');
    expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: 'on' })).toBe('off');
    expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: ' Shadow ' })).toBe('shadow');
    expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: 'LIVE' })).toBe('live');
    expect(FLAG_MANIFEST.CRISIS_ADJUDICATOR.default).toBe('off');
  });

  it('live is held back to shadow until a replay passes', () => {
    allowCrisisAdjudicatorLiveForTests(false);
    expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: 'live' })).toBe('shadow');
  });
});

describe('parseAdjudicatorReply', () => {
  it('a checkin needs decision checkin, confidence high and nothing quoted', () => {
    expect(parseAdjudicatorReply(CHECKIN)).toEqual({ decision: 'checkin', why: 'model' });
    expect(parseAdjudicatorReply(`sure: ${CHECKIN}`).decision).toBe('checkin');
  });

  it.each([
    [
      'low confidence',
      '{"caller_risk":"","decision":"checkin","confidence":"low"}',
      'low_confidence',
    ],
    ['no confidence', '{"caller_risk":"","decision":"checkin"}', 'low_confidence'],
    [
      'risk quoted',
      '{"caller_risk":"I set the date","decision":"checkin","confidence":"high"}',
      'risk_quoted',
    ],
    ['quote missing', '{"decision":"checkin","confidence":"high"}', 'risk_quoted'],
    ['escalate', ESCALATE, 'model'],
    ['unknown decision', '{"caller_risk":"","decision":"soft","confidence":"high"}', 'unparsed'],
    ['garbage', 'checkin', 'unparsed'],
    ['broken JSON', '{"decision":"checkin",', 'unparsed'],
    ['empty', '', 'unparsed'],
  ])('%s escalates', (_name, text, why) => {
    expect(parseAdjudicatorReply(text)).toEqual({ decision: 'escalate', why });
  });

  it('a non-string reply escalates', () => {
    expect(parseAdjudicatorReply(undefined as unknown as string).decision).toBe('escalate');
  });
});

describe('adjudicatorEligible: only a classifier-only crisis', () => {
  it('eligible: no pattern, every read present, none imminent, one crisis', () => {
    expect(adjudicatorEligible('none', [CRISIS])).toBe(true);
    expect(adjudicatorEligible('none', [CRISIS, NONE])).toBe(true);
  });

  it.each([
    ['a pattern crisis', 'crisis', [CRISIS]],
    ['a pattern block', 'block', [CRISIS]],
    ['an imminent read', 'none', [CRISIS, IMMINENT]],
    ['a missing read', 'none', [CRISIS, null]],
    ['no reads', 'none', []],
    ['no crisis read', 'none', [NONE]],
  ] as const)('not eligible: %s', (_name, pattern, verdicts) => {
    expect(adjudicatorEligible(pattern, verdicts)).toBe(false);
  });
});

describe('normalizeTranscript: missing context escalates', () => {
  it('keeps a call with Ferni, an earlier caller line and the caller last', () => {
    expect(normalizeTranscript(CALL)).toEqual(CALL);
  });

  it('strips SSML from Ferni, drops empty lines, keeps the last 12', () => {
    const long = Array.from({ length: 20 }, (_, i): AdjudicatorLine => ({
      speaker: i % 2 ? 'caller' : 'ferni',
      text: i % 2 ? `line ${i}` : `<break time="200ms"/>ferni ${i}`,
    }));
    const kept = normalizeTranscript([...long, { speaker: 'caller', text: '  ' }]);
    expect(kept).toHaveLength(12);
    expect(kept?.[0]).toEqual({ speaker: 'ferni', text: 'ferni 8' });
  });

  it.each([
    ['no Ferni line', CALL.filter((l) => l.speaker === 'caller')],
    ['no earlier caller line', CALL.slice(2)],
    ['Ferni speaks last', CALL.slice(0, 3)],
    ['nothing', []],
  ])('%s: null', (_name, lines) => {
    expect(normalizeTranscript(lines)).toBeNull();
  });
});

describe('transcriptFrom: the turn pipeline inputs', () => {
  it('earlier caller lines, then Ferni, then the latest once', () => {
    expect(
      transcriptFrom({
        latest: 'I am waiting.',
        earlier: ['Call my mom.', 'I am waiting.'],
        companion: 'Dialing now.',
      })
    ).toEqual([
      { speaker: 'caller', text: 'Call my mom.' },
      { speaker: 'ferni', text: 'Dialing now.' },
      { speaker: 'caller', text: 'I am waiting.' },
    ]);
  });
});

describe('adjudicateCrisis fails closed', () => {
  it('a confident checkin passes', async () => {
    expect(await adjudicateCrisis(CALL, reply(CHECKIN))).toEqual({
      decision: 'checkin',
      why: 'model',
    });
  });

  it('timeout', async () => {
    const never: CrisisGenerateFn = () => new Promise(() => undefined);
    expect(await adjudicateCrisis(CALL, never, 20)).toEqual({
      decision: 'escalate',
      why: 'timeout',
    });
  });

  it('error', async () => {
    const boom: CrisisGenerateFn = async () => {
      throw new Error('503');
    };
    expect(await adjudicateCrisis(CALL, boom)).toEqual({ decision: 'escalate', why: 'error' });
  });

  it('garbage', async () => {
    expect(await adjudicateCrisis(CALL, reply('ok'))).toEqual({
      decision: 'escalate',
      why: 'unparsed',
    });
  });

  it('missing context: the model is never asked', async () => {
    const generate = vi.fn(reply(CHECKIN));
    expect(await adjudicateCrisis(CALL.slice(2), generate)).toEqual({
      decision: 'escalate',
      why: 'no_context',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('sends the transcript marked by speaker', async () => {
    const generate = vi.fn(reply(CHECKIN));
    await adjudicateCrisis(CALL, generate);
    expect(JSON.parse(generate.mock.calls[0][1])).toEqual(CALL);
  });
});

describe('startCrisisAdjudicator', () => {
  const run = (
    env: Record<string, string>,
    extra: Partial<Parameters<typeof startCrisisAdjudicator>[1]> = {}
  ) =>
    startCrisisAdjudicator(CALL, {
      pattern: 'none',
      verdicts: [CRISIS],
      env,
      generate: reply(CHECKIN),
      source: 'gate',
      ...extra,
    });

  it('off, an imminent read, or a pattern match: no run', () => {
    expect(run({})).toBeNull();
    expect(run({ CRISIS_ADJUDICATOR: 'live' }, { verdicts: [IMMINENT] })).toBeNull();
    expect(run({ CRISIS_ADJUDICATOR: 'live' }, { pattern: 'crisis' })).toBeNull();
  });

  it('shadow never softens, even on a checkin', async () => {
    const shadow = run({ CRISIS_ADJUDICATOR: 'shadow' });
    expect(shadow?.mode).toBe('shadow');
    expect(await adjudicatedCheckin(shadow)).toBe(false);
    expect((await shadow?.result)?.decision).toBe('checkin');
  });

  it('live softens only on a checkin', async () => {
    expect(await adjudicatedCheckin(run({ CRISIS_ADJUDICATOR: 'live' }))).toBe(true);
    resetCrisisAdjudicatorCache();
    expect(
      await adjudicatedCheckin(run({ CRISIS_ADJUDICATOR: 'live' }, { generate: reply(ESCALATE) }))
    ).toBe(false);
    expect(await adjudicatedCheckin(null)).toBe(false);
  });

  it('logs the decision, never the words', async () => {
    await run({ CRISIS_ADJUDICATOR: 'shadow' })?.result;
    const record = logInfo.mock.calls.find((c) => c[1] === 'CRISIS_ADJUDICATOR');
    expect(record?.[0]).toMatchObject({ mode: 'shadow', decision: 'checkin', why: 'model' });
    expect(JSON.stringify(logInfo.mock.calls)).not.toMatch(/number|mom/i);
  });

  it('one turn asked twice shares one model call', async () => {
    const generate = vi.fn(reply(CHECKIN));
    await run({ CRISIS_ADJUDICATOR: 'live' }, { generate })?.result;
    await run({ CRISIS_ADJUDICATOR: 'live' }, { generate })?.result;
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------- the two call sites

const LIVE_CLASSIFIER = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const SESSION = { services: { sessionId: 'call-1' } };
const CLASSIFIER_CRISIS = reply('{"risk":"crisis","subject":"self"}');

function call(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}
const MOM_CALL = call(
  ['assistant', 'Hey! What can I do for you?'],
  ['user', 'Can you call my mom for me?'],
  ['assistant', "Sure, I don't have her number yet."],
  ['user', 'Can I give you her number?']
);

describe('reply gate (crisis-gate.ts)', () => {
  const gate = (
    env: Record<string, string>,
    adjudicate: CrisisGenerateFn,
    ctx = MOM_CALL,
    data: unknown = SESSION
  ) =>
    startCrisisGate(ctx, data, {
      env: { ...LIVE_CLASSIFIER, ...env },
      generate: CLASSIFIER_CRISIS,
      adjudicate,
    });

  it('the classifier-only crisis is real today: crisis guidance with the flag off', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const escalation = await gate({}, adjudicate)?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it('live + checkin: the soft check instead of crisis guidance', async () => {
    expect(await gate({ CRISIS_ADJUDICATOR: 'live' }, reply(CHECKIN))?.escalation).toEqual({
      action: 'guide',
      guidance: SOFT_CRISIS_CHECK,
    });
  });

  it('shadow + checkin: the reply is exactly what it is with the flag off', async () => {
    const off = await gate({}, reply(CHECKIN))?.escalation;
    resetCrisisClassifierCache();
    const adjudicate = vi.fn(reply(CHECKIN));
    const shadow = await gate({ CRISIS_ADJUDICATOR: 'shadow' }, adjudicate)?.escalation;
    expect(off?.action).toBe('guide');
    expect(shadow).toEqual(off);
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });

  it('live held back (production): checkin is only logged, the reply is unchanged', async () => {
    allowCrisisAdjudicatorLiveForTests(false);
    const escalation = await gate({ CRISIS_ADJUDICATOR: 'live' }, reply(CHECKIN))?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
    const record = logInfo.mock.calls.find((c) => c[1] === 'CRISIS_ADJUDICATOR');
    expect(record?.[0]).toMatchObject({ mode: 'shadow', decision: 'checkin', liveHeld: true });
  });

  it.each([
    ['escalate', reply(ESCALATE)],
    ['garbage', reply('nope')],
    [
      'error',
      (async () => {
        throw new Error('x');
      }) as CrisisGenerateFn,
    ],
  ])('live + %s: crisis guidance as before', async (_name, adjudicate) => {
    const escalation = await gate({ CRISIS_ADJUDICATOR: 'live' }, adjudicate)?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });

  it('live + timeout: crisis guidance as before', async () => {
    const never: CrisisGenerateFn = () => new Promise(() => undefined);
    const turn = gate({ CRISIS_ADJUDICATOR: 'live', CRISIS_ADJUDICATOR_TIMEOUT_MS: '20' }, never);
    const escalation = await turn?.escalation;
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
  });

  it('a pattern match is never adjudicated', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const ctx = call(
      ['assistant', 'Hey!'],
      ['user', 'hi'],
      ['assistant', 'What is up?'],
      ['user', 'I want to kill myself.']
    );
    const turn = gate({ CRISIS_ADJUDICATOR: 'live' }, adjudicate, ctx);
    expect(turn?.decision.action).not.toBe('pass');
    await turn?.escalation;
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it('an imminent read is never adjudicated', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const turn = startCrisisGate(MOM_CALL, SESSION, {
      env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live' },
      generate: reply('{"risk":"imminent","subject":"self"}'),
      adjudicate,
    });
    expect((await turn?.escalation)?.action).toBe('replace');
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it("another read of the turn that is missing escalates (the turn's reads are fetched first)", async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const env = { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live' };
    // The pipeline's read of the same caller words timed out: a missing read.
    startTurnCrisis(
      'Can I give you her number?',
      { lastAgentResponse: 'other line' },
      {
        sessionId: 'call-1',
        env: { ...env, CRISIS_CLASSIFIER_TIMEOUT_MS: '10' },
        generate: () => new Promise(() => undefined),
      }
    );
    const escalation = await gate({ CRISIS_ADJUDICATOR: 'live' }, adjudicate)?.escalation;
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it('no session id: the reads cannot be gathered, so it escalates', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const escalation = await gate({ CRISIS_ADJUDICATOR: 'live' }, adjudicate, MOM_CALL, {})
      ?.escalation;
    expect(escalation?.action === 'guide' && escalation.guidance).not.toBe(SOFT_CRISIS_CHECK);
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it('sends the call marked by speaker, the caller last', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    await gate({ CRISIS_ADJUDICATOR: 'live' }, adjudicate)?.escalation;
    expect(JSON.parse(adjudicate.mock.calls[0][1])).toEqual(CALL);
  });
});

describe('turn pipeline (turn-crisis.ts)', () => {
  const turn = (
    env: Record<string, string>,
    adjudicate: CrisisGenerateFn,
    latest = 'Can I give you her number?'
  ) =>
    startTurnCrisis(
      latest,
      {
        recentTranscripts: ['Can you call my mom for me?', latest],
        lastAgentResponse: "Sure, I don't have her number yet.",
      },
      {
        sessionId: 'call-2',
        env: { ...LIVE_CLASSIFIER, ...env },
        generate: CLASSIFIER_CRISIS,
        adjudicate,
      }
    );

  it('live + checkin: a soft check, and the crisis reading is dropped', async () => {
    const t = turn({ CRISIS_ADJUDICATOR: 'live' }, reply(CHECKIN));
    expect(await t.softCheck()).toBe(true);
    expect((await t.resolve()).isCrisis).toBe(false);
  });

  it('shadow + checkin: crisis as before', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const t = turn({ CRISIS_ADJUDICATOR: 'shadow' }, adjudicate);
    expect(await t.softCheck()).toBe(false);
    expect((await t.resolve()).isCrisis).toBe(true);
    expect(adjudicate).toHaveBeenCalledTimes(1);
  });

  it('live + escalate, or the flag off: crisis as before', async () => {
    const live = turn({ CRISIS_ADJUDICATOR: 'live' }, reply(ESCALATE));
    expect(await live.softCheck()).toBe(false);
    expect((await live.resolve()).isCrisis).toBe(true);
    resetCrisisClassifierCache();
    resetCrisisAdjudicatorCache();
    const adjudicate = vi.fn(reply(CHECKIN));
    const off = turn({}, adjudicate);
    expect((await off.resolve()).isCrisis).toBe(true);
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it("another read of the turn that is missing escalates (the turn's reads are fetched first)", async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    // The reply gate's read of the same caller words (after a different Ferni line) timed out.
    const other = call(
      ['user', 'Can you call my mom for me?'],
      ['assistant', 'On it.'],
      ['user', 'Can I give you her number?']
    );
    startCrisisGate(
      other,
      { services: { sessionId: 'call-2' } },
      {
        env: { ...LIVE_CLASSIFIER, CRISIS_ADJUDICATOR: 'live', CRISIS_CLASSIFIER_TIMEOUT_MS: '10' },
        generate: () => new Promise(() => undefined),
        adjudicate,
      }
    );
    const t = turn({ CRISIS_ADJUDICATOR: 'live' }, adjudicate);
    expect(await t.softCheck()).toBe(false);
    expect((await t.resolve()).isCrisis).toBe(true);
    expect(adjudicate).not.toHaveBeenCalled();
  });

  it('a pattern match is never adjudicated', async () => {
    const adjudicate = vi.fn(reply(CHECKIN));
    const t = turn({ CRISIS_ADJUDICATOR: 'live' }, adjudicate, 'I want to kill myself.');
    expect(await t.softCheck()).toBe(false);
    expect((await t.resolve()).isCrisis).toBe(true);
    expect(adjudicate).not.toHaveBeenCalled();
  });
});
