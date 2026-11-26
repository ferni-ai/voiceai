/**
 * CRISIS_CLASSIFIER_RUN_PER_CALL (#4005): the crisis classifier's shared runs and turn reads,
 * and the adjudicator's shared runs, are kept per call. Each row runs flag off (main) beside on,
 * so the change is visible. Every line is invented; call ids are made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger = {
    debug: () => undefined,
    info: (...args: unknown[]) => logged.push(args),
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return { ...actual, createLogger: () => logger };
});

import { agreementOutcome } from '../crisis-agreement.js';
import {
  resetCrisisAdjudicatorCache,
  startCrisisAdjudicator,
  type AdjudicatorLine,
} from '../crisis-adjudicator.js';
import { resetCrisisCallRisk } from '../crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
  turnVerdicts,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';

/** crisis-read-room.ts CALL_ROOM: entries of calls a cache holds before pushing one out. */
const CALL_ROOM = 1024;
const LIVE = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_CLASSIFIER_TIMEOUT_MS: '2000' };
const OFF = { ...LIVE, CRISIS_CLASSIFIER_RUN_PER_CALL: 'off' };
const ON = { ...LIVE, CRISIS_CLASSIFIER_RUN_PER_CALL: 'on' };
const LINE = { latest: 'an invented caller line', earlier: [], companion: 'an invented reply' };
const CRISIS = '{"risk":"crisis","subject":"self"}';
const IMMINENT = '{"risk":"imminent","subject":"self"}';

const answering = (text: string) => vi.fn<CrisisGenerateFn>(async () => text);
const failing = () =>
  vi.fn<CrisisGenerateFn>(async () => {
    throw new Error('model unavailable');
  });

/** One classifier read of LINE (or `input`) on `call`, its reads kept under the call. */
const read = (
  env: Record<string, string>,
  generate: CrisisGenerateFn,
  call: string | undefined,
  input = LINE
) => startCrisisClassifier(input, { pattern: 'none', generate, env, call, scope: call })?.verdict;

const named = (message: string) => logged.filter(([, m]) => m === message).map(([f]) => f);

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
  logged.length = 0;
});
afterEach(() => {
  resetCrisisCallRisk();
  vi.useRealTimers();
});

describe('CRISIS_CLASSIFIER_RUN_PER_CALL: shared classifier runs', () => {
  it('two calls with the same words: off shares one run, on gives each call its own read', async () => {
    for (const [env, runs] of [
      [OFF, 1],
      [ON, 2],
    ] as const) {
      resetCrisisClassifierCache();
      const generate = answering(CRISIS);
      await read(env, generate, 'call-a');
      await read(env, generate, 'call-b');
      expect(generate).toHaveBeenCalledTimes(runs);
    }
  });

  it('the same call reading one turn twice shares one run, logged as joined with its age', async () => {
    const generate = answering(CRISIS);
    await read(ON, generate, 'call-a');
    expect(await read(ON, generate, 'call-a')).toEqual({ risk: 'crisis', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(named('CRISIS_CLASSIFIER_JOINED')).toEqual([
      { mode: 'live', ageMs: expect.any(Number) },
    ]);
    expect(named('CRISIS_CLASSIFIER').map((f) => (f as { shared?: boolean }).shared)).toEqual([
      false,
    ]);
  });

  it('no call id: off shares the run, on never shares it', async () => {
    for (const [env, runs] of [
      [OFF, 1],
      [ON, 2],
    ] as const) {
      resetCrisisClassifierCache();
      const generate = answering(CRISIS);
      await read(env, generate, undefined);
      await read(env, generate, undefined);
      expect(generate).toHaveBeenCalledTimes(runs);
    }
  });

  it('a failed read is never shared: the next request on the call gets its own read', async () => {
    const off = failing();
    expect(await read(OFF, off, 'call-a')).toBeNull();
    expect(await read(OFF, off, 'call-a')).toBeNull(); // main: the failure is borrowed
    expect(off).toHaveBeenCalledTimes(1);

    resetCrisisClassifierCache();
    let calls = 0;
    const generate = vi.fn<CrisisGenerateFn>(async () => {
      if (calls++ === 0) throw new Error('model unavailable');
      return CRISIS;
    });
    expect(await read(ON, generate, 'call-a')).toBeNull();
    expect(await read(ON, generate, 'call-a')).toEqual({ risk: 'crisis', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('a run is joined only while it has half its deadline left (2000 ms: joined under 1000 ms)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.now();
    const pending = () =>
      vi.fn<CrisisGenerateFn>(
        () =>
          new Promise<string>(() => {
            // never settles
          })
      );
    for (const [after, runs] of [
      [999, 1],
      [1000, 2],
    ] as const) {
      resetCrisisClassifierCache();
      vi.setSystemTime(start);
      const generate = pending();
      void read(ON, generate, 'call-a');
      vi.setSystemTime(start + after);
      void read(ON, generate, 'call-a');
      expect(generate, `${after} ms`).toHaveBeenCalledTimes(runs);
    }
    resetCrisisClassifierCache();
    vi.setSystemTime(start);
    const generate = pending();
    void read(OFF, generate, 'call-a');
    vi.setSystemTime(start + 1500);
    void read(OFF, generate, 'call-a');
    expect(generate).toHaveBeenCalledTimes(1); // main joins any run under 30 s
  });
});

describe('CRISIS_CLASSIFIER_RUN_PER_CALL: turn reads (agreement gate, confirmed-risk ledger)', () => {
  const twinFlood = async (env: Record<string, string>) => {
    for (let i = 0; i < 100; i++) await read(env, answering(CRISIS), `twin-crisis:twin-${i}`);
  };

  it("twin lines never push out a call's turn reads: off loses them, on keeps both", async () => {
    for (const [env, kept] of [
      [OFF, 0],
      [ON, 2],
    ] as const) {
      resetCrisisClassifierCache();
      await read(env, answering(IMMINENT), 'call-a');
      await read({ ...env, CRISIS_CLASSIFIER_TIMEOUT_MS: '2001' }, answering(CRISIS), 'call-a');
      await twinFlood(env);
      const reads = await turnVerdicts('call-a', LINE);
      expect(reads.filter(Boolean), JSON.stringify(env)).toHaveLength(kept);
      expect(reads).not.toContain(null);
    }
  });

  it('a call whose reads were pushed out gets a missing read, so a lone crisis read never eases', async () => {
    await read(ON, answering(IMMINENT), 'call-a');
    for (let i = 0; i < CALL_ROOM; i++) await read(ON, answering(CRISIS), `call-flood-${i}`);
    const lost = await turnVerdicts('call-a', LINE);
    expect(lost).toContain(null);
    const args = { pattern: 'none' as const, latest: LINE.latest, companion: LINE.companion };
    // What the gate sees for call-a: a lone crisis read beside the missing one.
    const crisis = { risk: 'crisis' as const, subject: 'self' as const };
    expect(agreementOutcome({ ...args, verdicts: [crisis, ...lost] })).toBe('escalate');
    expect(await turnVerdicts(`call-flood-${CALL_ROOM - 1}`, LINE)).not.toContain(null);
  });

  it('40 other calls: off pushes out the first call (no missing read added), on keeps it', async () => {
    for (const [env, reads] of [
      [OFF, []],
      [ON, [{ risk: 'imminent', subject: 'self' }]],
    ] as const) {
      resetCrisisClassifierCache();
      await read(env, answering(IMMINENT), 'call-a');
      for (let i = 0; i < 40; i++) await read(env, answering(CRISIS), `call-flood-${i}`);
      expect(await turnVerdicts('call-a', LINE)).toEqual(reads);
    }
  });

  it('more pushed-out calls than can be named: every call gets a missing read', async () => {
    for (let i = 0; i < 2 * CALL_ROOM + 1; i++) await read(ON, answering(CRISIS), `call-${i}`);
    expect(await turnVerdicts('call-never-seen', LINE)).toEqual([null]);
  });

  it('more pushed-out twin turns than can be named: no call gets a missing read', async () => {
    await read(ON, answering(CRISIS), 'call-a');
    const twins = 1100;
    for (let i = 0; i < twins; i++) await read(ON, answering(CRISIS), `twin-crisis:t${i}`);
    expect(await turnVerdicts('call-a', LINE)).toEqual([{ risk: 'crisis', subject: 'self' }]);
    expect(await turnVerdicts('call-never-seen', LINE)).toEqual([]);
    // Twins still fail closed among themselves: a twin never seen gets the missing read.
    expect(await turnVerdicts('twin-crisis:never-seen', LINE)).toEqual([null]);
  });

  it("a call's own reads past the cap mark it missing a read", async () => {
    for (let i = 0; i < 33; i++)
      await read(ON, answering(CRISIS), 'call-a', { ...LINE, latest: `invented line ${i}` });
    expect(await turnVerdicts('call-a', { ...LINE, latest: 'invented line 32' })).toContain(null);
  });
});

describe('CRISIS_CLASSIFIER_RUN_PER_CALL: the adjudicator', () => {
  const LINES: AdjudicatorLine[] = [
    { speaker: 'caller', text: 'an invented opening line' },
    { speaker: 'ferni', text: 'An invented question?' },
    { speaker: 'caller', text: 'an invented caller line' },
  ];
  const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
  const adjudicate = (env: Record<string, string>, generate: CrisisGenerateFn, scope?: string) =>
    startCrisisAdjudicator(LINES, {
      pattern: 'none',
      verdicts: [{ risk: 'crisis', subject: 'self' }],
      env: { ...env, CRISIS_ADJUDICATOR: 'shadow' },
      generate,
      source: 'gate',
      scope,
    })?.result;

  it('no call id: off shares the run, on never shares it', async () => {
    for (const [env, runs] of [
      [OFF, 1],
      [ON, 2],
    ] as const) {
      resetCrisisAdjudicatorCache();
      const generate = answering(CHECKIN);
      await adjudicate(env, generate);
      await adjudicate(env, generate);
      expect(generate).toHaveBeenCalledTimes(runs);
    }
  });

  it('a failed run is never shared: the next request on the call gets its own read', async () => {
    const off = failing();
    await adjudicate(OFF, off, 'call-a');
    await adjudicate(OFF, off, 'call-a');
    expect(off).toHaveBeenCalledTimes(1);

    resetCrisisAdjudicatorCache();
    let calls = 0;
    const generate = vi.fn<CrisisGenerateFn>(async () => {
      if (calls++ === 0) throw new Error('model unavailable');
      return CHECKIN;
    });
    expect((await adjudicate(ON, generate, 'call-a'))?.why).toBe('error');
    expect((await adjudicate(ON, generate, 'call-a'))?.decision).toBe('checkin');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("twin scopes never push out a call's run", async () => {
    const generate = answering(CHECKIN);
    await adjudicate(ON, generate, 'call-a');
    for (let i = 0; i < 40; i++) await adjudicate(ON, answering(CHECKIN), `twin-crisis:t${i}`);
    await adjudicate(ON, generate, 'call-a');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
