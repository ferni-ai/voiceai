/**
 * A crisis escalation that rejects is counted (crisis-gate-failure.ts) and the gate
 * behaves as before: the held reply is released and the escalation still rejects.
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
import { gatedReply, startCrisisGate } from '../crisis-gate.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
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

async function replyTo(text: string, options: Parameters<typeof gatedReply>[4]) {
  const model = vi.fn(async (_ctx: llm.ChatContext) => streamOf(['Sounds good.']));
  const out = await collect(
    (await gatedReply(
      request(text),
      { userData: undefined },
      model as never,
      opener as never,
      options
    )) as never
  );
  return { out, asked: model.mock.calls.length };
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
