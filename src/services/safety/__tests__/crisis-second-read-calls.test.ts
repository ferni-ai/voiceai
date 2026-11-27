/**
 * #2666 round 1: the second read is per call and per turn, a read that failed counts as one about
 * someone else, and no turn waits for v3 longer than the grace. Fake generate functions only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CrisisGenerateFn,
  resetCrisisClassifierCache,
  startCrisisClassifier,
} from '../crisis-classifier.js';
import { resolveCrisisSecondReadGraceMs } from '../crisis-classifier-v3.js';

const PROD = {
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
};
const V3 = /Quiet preparation is often said as plain logistics/;
const reply = (risk: string) => JSON.stringify({ risk, subject: 'self' });

/** Answers the base prompt and the v3 prompt separately; null never answers (a timeout). */
function twoPrompts(base: string | null, v3: string | null) {
  return vi.fn<CrisisGenerateFn>((prompt) => {
    const answer = V3.test(prompt) ? v3 : base;
    return answer === null ? new Promise<string>(() => {}) : Promise.resolve(answer);
  });
}

const turn = {
  latest: 'my neighbor is taking the dog from now on',
  earlier: [],
  companion: 'At this rate mine is going to grow roots.',
};

let calls = 0;
/** A path's options on the call's turn 4: the turn count both paths read from the session. */
const path = (p: 'gate' | 'pipeline', count = 4) => ({ path: p, count, thirdParty: false });

// #2666 round 1: the run cache and the turn ledger are per call and per turn, and a read that
// failed counts as one about someone else.
describe('per call, per turn, and a failed read', () => {
  const env = { ...PROD, CRISIS_CLASSIFIER_SECOND_READ: 'on', CRISIS_CLASSIFIER_TIMEOUT_MS: '300' };
  beforeEach(() => resetCrisisClassifierCache());

  /** Base reads: third party where the read sees an earlier line, none otherwise; v3 imminent. */
  const pipelineSeesWorry = vi.fn<CrisisGenerateFn>(async (prompt, content) => {
    if (V3.test(prompt)) return reply('imminent');
    const { earlier } = JSON.parse(content) as { earlier: string[] };
    return earlier.length
      ? JSON.stringify({ risk: 'crisis', subject: 'third_party' })
      : reply('none');
  });
  const wider = { ...turn, earlier: ['we talked about her brother earlier'] };

  it("a call never reuses another call's run, nor its fill decision", async () => {
    const on = (call: string) => ({
      pattern: 'none' as const,
      env,
      call,
      generate: pipelineSeesWorry,
    });
    // Call A: the gate and the pipeline read the same clean words; the fill stands.
    const a = startCrisisClassifier(turn, { ...on('call-a'), secondRead: path('gate') });
    startCrisisClassifier(turn, { ...on('call-a'), secondRead: path('pipeline') });
    expect(await a?.verdict).toEqual({ risk: 'imminent', subject: 'self' });
    // Call B: the same gate view, but its pipeline reads a worry about someone else.
    const b = startCrisisClassifier(turn, { ...on('call-b'), secondRead: path('gate') });
    const pipe = startCrisisClassifier(wider, { ...on('call-b'), secondRead: path('pipeline') });
    expect(await pipe?.verdict).toEqual({ risk: 'crisis', subject: 'third_party' });
    expect(await b?.verdict).toEqual({ risk: 'none', subject: 'self' });
  });

  it("a turn never reuses an earlier turn's run, nor its fill decision", async () => {
    const options = { pattern: 'none' as const, env, call: 'call-t', generate: pipelineSeesWorry };
    const t3 = startCrisisClassifier(turn, { ...options, secondRead: path('gate', 3) });
    startCrisisClassifier(turn, { ...options, secondRead: path('pipeline', 3) });
    expect(await t3?.verdict).toEqual({ risk: 'imminent', subject: 'self' });
    const t4 = startCrisisClassifier(turn, { ...options, secondRead: path('gate', 4) });
    startCrisisClassifier(wider, { ...options, secondRead: path('pipeline', 4) });
    expect(await t4?.verdict).toEqual({ risk: 'none', subject: 'self' });
  });

  it("a pipeline base read that failed (null) drops the gate's fill about the caller", async () => {
    for (const failure of ['not json', 'throw', 'hang']) {
      resetCrisisClassifierCache();
      const generate = vi.fn<CrisisGenerateFn>(async (prompt, content) => {
        if (V3.test(prompt)) return reply('imminent');
        if (!(JSON.parse(content) as { earlier: string[] }).earlier.length) return reply('none');
        if (failure === 'throw') throw new Error('model down');
        return failure === 'hang' ? new Promise<string>(() => {}) : failure;
      });
      const options = { pattern: 'none' as const, env, call: `call-${failure}`, generate };
      const gate = startCrisisClassifier(turn, { ...options, secondRead: path('gate') });
      const pipe = startCrisisClassifier(wider, { ...options, secondRead: path('pipeline') });
      expect(await pipe?.verdict, failure).toBeNull();
      expect(await gate?.verdict, failure).toEqual({ risk: 'none', subject: 'self' });
    }
  });

  it("the gate's wait for the pipeline is CRISIS_CLASSIFIER_TIMEOUT_MS", async () => {
    vi.useFakeTimers(); // the clock, not the machine's load, decides the 80 ms
    try {
      const generate = vi.fn<CrisisGenerateFn>(async (prompt) =>
        V3.test(prompt) ? reply('imminent') : reply('none')
      );
      const options = { pattern: 'none' as const, env, call: 'call-wait', generate };
      const gate = startCrisisClassifier(turn, { ...options, secondRead: path('gate') });
      // The pipeline reads the turn 80 ms later, well inside the 300 ms timeout.
      setTimeout(() => {
        startCrisisClassifier(turn, { ...options, secondRead: path('pipeline') });
      }, 80);
      const verdict = gate?.verdict;
      await vi.advanceTimersByTimeAsync(1000);
      expect(await verdict).toEqual({ risk: 'imminent', subject: 'self' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('no turn count: no fill', async () => {
    const generate = twoPrompts(reply('none'), reply('imminent'));
    const options = { pattern: 'none' as const, env, call: 'call-nocount', generate };
    const gate = startCrisisClassifier(turn, {
      ...options,
      secondRead: { path: 'gate', thirdParty: false },
    });
    startCrisisClassifier(turn, {
      ...options,
      secondRead: { path: 'pipeline', thirdParty: false },
    });
    expect(await gate?.verdict).toEqual({ risk: 'none', subject: 'self' });
  });
});

// #2666 round 1: the reply waited for v3 on every normal turn (p50 83 ms, p95 416 ms, 1 s when
// v3 hung). After a base read that found nothing, v3 gets the grace (150 ms by default) at most.
// On a fake clock: the grace is asserted to the millisecond, never against a loaded machine.
describe('latency: a turn waits for v3 no longer than the grace', () => {
  const env = {
    ...PROD,
    CRISIS_CLASSIFIER_SECOND_READ: 'on',
    CRISIS_CLASSIFIER_TIMEOUT_MS: '1000',
  };
  /** The default grace, written out rather than read back: a changed grace turns these rows red. */
  const GRACE_MS = 150;
  /** When the base read answers: the grace starts here. */
  const BASE_MS = 20;
  const after = (ms: number, value: string) =>
    new Promise<string>((resolve) => {
      setTimeout(() => resolve(value), ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    resetCrisisClassifierCache();
  });
  afterEach(() => vi.useRealTimers());

  /**
   * Starts one turn whose v3 read answers v3Ms after the base read. Returns its gate verdict and
   * how long after the base read it settled, both unset until it settles: advance the clock first.
   */
  function hold(
    v3Ms: number | 'hang',
    v3 = reply('none'),
    extra: Record<string, string> = {},
    baseMs = BASE_MS
  ) {
    const generate: CrisisGenerateFn = async (prompt) => {
      if (!V3.test(prompt)) return baseMs ? after(baseMs, reply('none')) : reply('none');
      return v3Ms === 'hang' ? new Promise<string>(() => {}) : after(baseMs + v3Ms, v3);
    };
    const options = { pattern: 'none' as const, env: { ...env, ...extra }, call: `lat-${++calls}` };
    const startedAt = Date.now();
    const gate = startCrisisClassifier(turn, { ...options, generate, secondRead: path('gate') });
    startCrisisClassifier(turn, { ...options, generate, secondRead: path('pipeline') });
    const held: { verdict?: unknown; added?: number } = {};
    void gate?.verdict.then((verdict) => {
      held.verdict = verdict;
      held.added = Date.now() - startedAt - baseMs;
    });
    return held;
  }

  it('the grace is 150 ms unless set, clamped to 0..300', () => {
    expect(resolveCrisisSecondReadGraceMs({})).toBe(150);
    expect(resolveCrisisSecondReadGraceMs({ CRISIS_SECOND_READ_GRACE_MS: 'soon' })).toBe(150);
    expect(resolveCrisisSecondReadGraceMs({ CRISIS_SECOND_READ_GRACE_MS: '40' })).toBe(40);
    expect(resolveCrisisSecondReadGraceMs({ CRISIS_SECOND_READ_GRACE_MS: '-5' })).toBe(0);
    expect(resolveCrisisSecondReadGraceMs({ CRISIS_SECOND_READ_GRACE_MS: '5000' })).toBe(300);
  });

  it('a normal turn adds at most the grace, v3 slower or hung', async () => {
    const added: (number | undefined)[] = [];
    for (const v3Ms of [60, 200, 400, 'hang'] as const) {
      resetCrisisClassifierCache();
      const held = hold(v3Ms);
      await vi.advanceTimersByTimeAsync(BASE_MS + 1000);
      expect(held.verdict).toEqual({ risk: 'none', subject: 'self' });
      added.push(held.added);
    }
    // v3 60 ms after the base read: waited for; 200, 400 and hung: the grace exactly, then on.
    expect(added).toEqual([60, GRACE_MS, GRACE_MS, GRACE_MS]);
  });

  it('a v3 read about the caller fills inside the grace, and not after it', async () => {
    // v3 at grace - 1 ms: still waited for at grace - 2, then fills the moment it answers.
    const inside = hold(GRACE_MS - 1, reply('imminent'));
    await vi.advanceTimersByTimeAsync(BASE_MS + GRACE_MS - 2);
    expect(inside.added).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(inside.verdict).toEqual({ risk: 'imminent', subject: 'self' });
    expect(inside.added).toBe(GRACE_MS - 1);
    // v3 at grace + 1 ms: the turn goes on at the grace, without it.
    resetCrisisClassifierCache();
    const outside = hold(GRACE_MS + 1, reply('imminent'));
    await vi.advanceTimersByTimeAsync(BASE_MS + GRACE_MS - 1);
    expect(outside.added).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outside.verdict).toEqual({ risk: 'none', subject: 'self' });
    expect(outside.added).toBe(GRACE_MS);
  });

  it('the grace is the setting: 0 waits for nothing', async () => {
    // The base read answers at once here: a 0 ms timer set while the fake clock is ticking (as
    // after a timed base read) runs 1 ms later, like Node's own clamp, and would hide the setting.
    const zero = hold('hang', reply('none'), { CRISIS_SECOND_READ_GRACE_MS: '0' }, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(zero.verdict).toEqual({ risk: 'none', subject: 'self' });
    expect(zero.added).toBe(0);
  });
});
