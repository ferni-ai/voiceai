/**
 * A crisis escalation that rejects is counted (crisis-gate-failure.ts) and the gate
 * behaves as before: the held reply is released and the escalation still rejects.
 * With CRISIS_GATE_FAIL_CLOSED on it fails closed instead: the classifier's decision
 * stands after its verdict, the timeout check-in decides before it, and the held
 * reply never goes out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream, TransformStream } from 'node:stream/web';

// Every log call from every logger, with its level: [level, fields, message].
const logged = vi.hoisted(() => [] as Array<[string, unknown, unknown]>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record = <T extends object>(logger: T): T =>
    new Proxy(logger, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || typeof prop !== 'string') return value;
        return (...args: unknown[]) => {
          logged.push([prop, args[0], args[1]]);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) =>
      record(real.createLogger(...args)),
  };
});

// The last easing step of an escalation, made to reject in the rows that ask for it.
const ease = vi.hoisted(() => ({ reject: undefined as unknown }));
vi.mock('../../../services/safety/crisis-confirmed-risk.js', async (importOriginal) => {
  type Real = typeof import('../../../services/safety/crisis-confirmed-risk.js');
  const real = await importOriginal<Real>();
  return {
    ...real,
    afterCheckLoneRead: (...args: Parameters<typeof real.afterCheckLoneRead>) =>
      ease.reject === undefined ? real.afterCheckLoneRead(...args) : Promise.reject(ease.reject),
  };
});

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { TALK_TO_988 } from '../../../services/safety/crisis-guard-replies.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const FAIL_CLOSED = { ...LIVE, CRISIS_GATE_FAIL_CLOSED: 'on' };
// Safety words the patterns read as nothing: only a read, or a failed one, can act on them.
const UNSAFE = 'i feel unsafe with myself tonight';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const MISSED = 'im parked on the bridge, engine off, just sitting here deciding';
const ORDINARY = 'what should I cook tonight?';
const SENTINEL = 'sentinel-6d1f the caller said this';

const IMMINENT = '{"risk":"imminent","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';

const verdict =
  (reply: string): CrisisGenerateFn =>
  async () =>
    reply;
// Every model option the gate can call, stubbed: no real model client is asked.
const models = (classifier: string) => ({
  generate: verdict(classifier),
  adjudicate: verdict(NONE),
  groundedReads: [verdict('{"release":false}')],
});

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

function streamOf(chunks: string[]): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<unknown> | null): Promise<unknown[]> {
  const out: unknown[] = [];
  if (!stream) return out;
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out.push(chunk);
  return out;
}

/** Marks every chunk it passes, so the rows can see the model's reply went out. */
const opener = {
  wrap: (stream: ReadableStream<unknown>) =>
    stream.pipeThrough(
      new TransformStream<unknown, unknown>({
        transform: (chunk, controller) => controller.enqueue(`~${String(chunk)}`),
      })
    ),
};

/** The model's first reply is the one the gate holds; any later one is a replacement. */
const HELD = 'Sounds good.';
const REPLACEMENT = 'Checking in with you.';

async function replyTo(text: string, options: Parameters<typeof gatedReply>[4]) {
  const model = vi.fn(async (_ctx: llm.ChatContext) =>
    streamOf([model.mock.calls.length === 1 ? HELD : REPLACEMENT])
  );
  const out = await collect(
    (await gatedReply(
      request(text),
      { userData: undefined },
      model as never,
      opener as never,
      options
    )) as never
  );
  const lastAsked = model.mock.calls.map(
    ([ctx]) => (ctx.items.at(-1) as llm.ChatMessage).textContent ?? ''
  );
  return { out, asked: model.mock.calls.length, lastAsked };
}

const failures = () =>
  logged.filter(
    ([, fields, message]) =>
      message === 'CRISIS_GATE' && (fields as { action?: string })?.action === 'escalation_failed'
  );

const network = vi.fn();
beforeEach(() => {
  resetCrisisClassifierCache();
  logged.length = 0;
  ease.reject = undefined;
  network.mockClear();
  vi.stubGlobal('fetch', async (...args: unknown[]) => {
    network(...args);
    throw new Error('network refused in this test');
  });
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('a rejected crisis escalation', () => {
  it('after the verdict: one line, stage after_verdict; the escalation still rejects', async () => {
    const error = new TypeError(SENTINEL);
    ease.reject = error;
    const gate = startCrisisGate(request(MISSED), undefined, { env: LIVE, ...models(IMMINENT) });
    expect(gate?.decision.action).toBe('pass');
    await expect(gate?.escalation).rejects.toBe(error);
    expect(failures().map(([level, fields]) => [level, fields])).toEqual([
      ['warn', { action: 'escalation_failed', stage: 'after_verdict', errorClass: 'TypeError' }],
    ]);
  });

  it('after the verdict: the held reply goes out exactly as on a cleared turn', async () => {
    const cleared = await replyTo(MISSED, { env: LIVE, ...models(NONE) });
    resetCrisisClassifierCache(); // the second turn gets its own read, not the first one's
    ease.reject = new TypeError(SENTINEL);
    const rejected = await replyTo(MISSED, { env: LIVE, ...models(IMMINENT) });
    expect(rejected.out).toEqual(['~Sounds good.']);
    expect(rejected.out).toEqual(cleared.out);
    expect(rejected.asked).toBe(1); // no replacement asked for
    expect(failures()).toHaveLength(1);
  });

  it('before the verdict: a rejected wait for the read logs stage before_verdict', async () => {
    const error = new RangeError(SENTINEL);
    const generate = vi.fn(verdict(NONE));
    const gate = startCrisisGate(request(ORDINARY), undefined, {
      env: LIVE,
      ...models(NONE),
      generate,
      readAfter: () => Promise.reject(error),
    });
    await expect(gate?.escalation).rejects.toBe(error);
    expect(generate).not.toHaveBeenCalled(); // the classifier never ran: no verdict
    expect(failures().map(([level, fields]) => [level, fields])).toEqual([
      ['warn', { action: 'escalation_failed', stage: 'before_verdict', errorClass: 'RangeError' }],
    ]);
  });

  it('logs only the stage and the class: the error message is in no logged field', async () => {
    ease.reject = new Error(SENTINEL);
    await replyTo(MISSED, { env: LIVE, ...models(IMMINENT) });
    const [line] = failures();
    expect(Object.keys(line?.[1] as object).sort()).toEqual(['action', 'errorClass', 'stage']);
    expect((line?.[1] as { errorClass: string }).errorClass).toBe('Error');
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(JSON.stringify(logged)).not.toContain('sentinel-6d1f');
  });

  it('an error name that is not a class name, a sentence or a lone word, is logged as Error: the name is in no logged field', async () => {
    for (const name of [SENTINEL, 'sentinel6d1fword']) {
      logged.length = 0;
      resetCrisisClassifierCache(); // each turn gets its own read
      const error = new Error('boom');
      error.name = name; // name is writable: a thrower can put any text there
      ease.reject = error;
      await replyTo(MISSED, { env: LIVE, ...models(IMMINENT) });
      expect(failures().map(([level, fields]) => [level, fields])).toEqual([
        ['warn', { action: 'escalation_failed', stage: 'after_verdict', errorClass: 'Error' }],
      ]);
      expect(JSON.stringify(logged)).not.toContain('sentinel-6d1f');
      expect(JSON.stringify(logged)).not.toContain('sentinel6d1f');
    }
  });
});

describe('an escalation that settles', () => {
  it('a cleared turn logs no failure line', async () => {
    const gate = startCrisisGate(request(MISSED), undefined, { env: LIVE, ...models(NONE) });
    expect(await gate?.escalation).toBeNull();
    expect(failures()).toEqual([]);
  });

  it('a normal escalation logs no failure line', async () => {
    const gate = startCrisisGate(request(MISSED), undefined, { env: LIVE, ...models(IMMINENT) });
    expect((await gate?.escalation)?.action).toBe('replace');
    expect(failures()).toEqual([]);
  });
});

describe('CRISIS_GATE_FAIL_CLOSED on: a rejected escalation fails closed', () => {
  it.each([
    ['imminent', IMMINENT, 'replace'],
    ['crisis', CRISIS, 'guide'],
  ])(
    '(a) an easing step throws after a %s read: the decision stands, no held chunk goes out',
    async (_read, classifier, action) => {
      // Pre: the decision the same read gives with no throw.
      const settled = startCrisisGate(request(MISSED), undefined, {
        env: FAIL_CLOSED,
        ...models(classifier),
      });
      const decision = await settled?.escalation;
      expect(decision?.action).toBe(action);
      const cleared = await replyTo(MISSED, { env: FAIL_CLOSED, ...models(classifier) });

      resetCrisisClassifierCache(); // each turn gets its own read
      ease.reject = new TypeError(SENTINEL);
      const gate = startCrisisGate(request(MISSED), undefined, {
        env: FAIL_CLOSED,
        ...models(classifier),
      });
      expect(gate?.decision.action).toBe('pass'); // the patterns read nothing
      expect(await gate?.escalation).toEqual(decision);
      expect(failures().map(([level, fields]) => [level, fields])).toEqual([
        ['warn', { action: 'escalation_failed', stage: 'after_verdict', errorClass: 'TypeError' }],
      ]);

      resetCrisisClassifierCache();
      const rejected = await replyTo(MISSED, { env: FAIL_CLOSED, ...models(classifier) });
      expect(rejected.out).not.toContain(`~${HELD}`);
      expect(rejected.out).toEqual(cleared.out);
      expect(rejected.out.length).toBeGreaterThan(0);
      expect(JSON.stringify(logged)).not.toContain('sentinel-6d1f');
    }
  );

  it('(b) a rejection before any verdict: the check-in with 988, no held chunk goes out', async () => {
    const error = new RangeError(SENTINEL);
    const generate = vi.fn(verdict(NONE));
    const options = { env: FAIL_CLOSED, ...models(NONE), generate };
    // CRISIS_TIMEOUT_CHECKIN is unset: fail-closed turns the check-in on for a failed read.
    expect(options.env).not.toHaveProperty('CRISIS_TIMEOUT_CHECKIN');
    const gate = startCrisisGate(request(UNSAFE), undefined, {
      ...options,
      readAfter: () => Promise.reject(error),
    });
    expect(gate?.decision.action).toBe('pass'); // the patterns read nothing
    expect(await gate?.escalation).toMatchObject({ action: 'guide' });
    expect(failures().map(([level, fields]) => [level, fields])).toEqual([
      ['warn', { action: 'escalation_failed', stage: 'before_verdict', errorClass: 'RangeError' }],
    ]);

    const turn = await replyTo(UNSAFE, { ...options, readAfter: () => Promise.reject(error) });
    expect(generate).not.toHaveBeenCalled(); // no verdict, ever
    expect(turn.out).not.toContain(`~${HELD}`);
    expect(turn.asked).toBe(2); // the check-in reply was asked for
    expect(turn.lastAsked[1]).toContain('[SAFETY - CHECK-IN]');
    const spoken = turn.out.join(' ');
    expect(spoken).toContain(`~${REPLACEMENT}`);
    expect(spoken).toContain('Are you safe right now?');
    expect(spoken).toContain(TALK_TO_988);
  });

  it('a rejection before the verdict on an ordinary line: the timeout path, its reply released', async () => {
    const turn = await replyTo(ORDINARY, {
      env: FAIL_CLOSED,
      ...models(NONE),
      readAfter: () => Promise.reject(new RangeError(SENTINEL)),
    });
    expect(turn.out).toEqual([`~${HELD}`]); // a failed read with no safety words, as on a timeout
    expect(turn.asked).toBe(1);
  });
});

describe('CRISIS_GATE_FAIL_CLOSED off or unset: main', () => {
  for (const env of [LIVE, { ...LIVE, CRISIS_GATE_FAIL_CLOSED: 'off' }]) {
    const label = 'CRISIS_GATE_FAIL_CLOSED' in env ? 'off' : 'unset';
    it(`${label}: the rejected turns of (a) and (b) release the held reply and reject`, async () => {
      ease.reject = new TypeError(SENTINEL);
      const after = startCrisisGate(request(MISSED), undefined, { env, ...models(IMMINENT) });
      await expect(after?.escalation).rejects.toBe(ease.reject);
      resetCrisisClassifierCache();
      expect((await replyTo(MISSED, { env, ...models(IMMINENT) })).out).toEqual([`~${HELD}`]);

      ease.reject = undefined;
      const error = new RangeError(SENTINEL);
      const before = await replyTo(UNSAFE, {
        env,
        ...models(NONE),
        readAfter: () => Promise.reject(error),
      });
      expect(before.out).toEqual([`~${HELD}`]);
      expect(before.asked).toBe(1);
    });
  }

  it('turns that settle read the same with the flag on as off', async () => {
    // The turn reminder picks its style lines at random: the same picks on every turn compared.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    for (const [line, classifier] of [
      [MISSED, IMMINENT],
      [MISSED, CRISIS],
      [MISSED, NONE],
      [ORDINARY, NONE],
      [UNSAFE, NONE],
    ] as const) {
      resetCrisisClassifierCache();
      const off = await replyTo(line, { env: LIVE, ...models(classifier) });
      resetCrisisClassifierCache();
      const on = await replyTo(line, { env: FAIL_CLOSED, ...models(classifier) });
      expect(on, `${line} / ${classifier}`).toEqual(off);
    }
    random.mockRestore();
    expect(failures()).toEqual([]);
  });
});
