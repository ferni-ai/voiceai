/**
 * The call-end summary's timeout and source reporting.
 *
 * 2026-10-11 07:57Z: endSession's summarizeWithLLM finished via the LLM in
 * 3.2 s, then the uncleared timeout timer logged "Operation timed out, using
 * fallback" at exactly 10.0 s, which read as a failed summary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() };
  // createLogger: the module-level loggers summarizer's imports create (session-recall.ts).
  const quiet = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { getLogger: () => ({ ...logger, child: () => logger }), createLogger: () => quiet };
});

import { trackJsonReply, withTimeout } from '../utils.js';
import { summarizeWithLLM } from '../../../memory/operations/summarizer.js';

const TIMED_OUT = 'Operation timed out, using fallback';
const timeoutLogs = () => info.mock.calls.filter((c) => c[1] === TIMED_OUT);

describe('withTimeout', () => {
  beforeEach(() => {
    info.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('a call that finishes in time leaves no timer behind and never reports a timeout', async () => {
    const work = new Promise<string>((resolve) => {
      setTimeout(() => resolve('summary'), 3_200);
    });
    const result = withTimeout(work, 10_000, 'summarizeWithLLM', 'session-1');
    expect(vi.getTimerCount()).toBe(2); // the work and the timeout, both pending

    await vi.advanceTimersByTimeAsync(3_200);
    expect(await result).toBe('summary');
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(timeoutLogs()).toHaveLength(0);
  });

  it('a call that really overruns still returns null and reports the timeout once', async () => {
    const result = withTimeout(new Promise(() => {}), 10_000, 'summarizeWithLLM', 'session-1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBeNull();
    expect(timeoutLogs()).toHaveLength(1);
    expect(timeoutLogs()[0][0]).toMatchObject({ operation: 'summarizeWithLLM', timeoutMs: 10_000 });
  });

  it('a call that rejects clears its timer too', async () => {
    const result = withTimeout(Promise.reject(new Error('boom')), 10_000, 'op');
    await expect(result).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('trackJsonReply', () => {
  const JSON_REPLY =
    '{"mainTopics":["the coast trip"],"keyPoints":["brother visiting"],"emotionalArc":"calm",' +
    '"openThreads":[],"followUps":[],"userConcerns":[],"relationshipProgress":"easy"}';

  it.each([
    ['a JSON reply', true, JSON_REPLY],
    ['JSON inside a code fence', true, '```json\n' + JSON_REPLY + '\n```'],
    ['prose', false, 'Sure! The user talked about the coast.'],
    ['a broken brace span', false, '{"mainTopics": ['],
    ['an empty reply', false, ''],
  ])('reports %s as gotJson=%s, passing the reply through', async (_n, expected, reply) => {
    const tracked = trackJsonReply(async () => reply);
    expect(tracked.gotJson()).toBe(false);
    expect(await tracked.call('prompt')).toBe(reply);
    expect(tracked.gotJson()).toBe(expected);
  });

  it('agrees with summarizeWithLLM about which source produced the summary', async () => {
    const turns = [
      { role: 'user' as const, content: 'my brother is coming to the coast next week' },
      { role: 'assistant' as const, content: 'oh nice, how long is he staying?' },
    ];
    const run = async (reply: string) => {
      const tracked = trackJsonReply(async () => reply);
      const summary = await summarizeWithLLM('s1', turns, tracked.call, {
        generateEmbedding: false,
      });
      return { summary, gotJson: tracked.gotJson() };
    };

    const llm = await run(JSON_REPLY);
    expect(llm.gotJson).toBe(true);
    expect(llm.summary.mainTopics).toEqual(['the coast trip']);

    // Prose: summarizeWithLLM still returns a summary, built by extraction.
    const fallback = await run('Sure! The user talked about the coast.');
    expect(fallback.gotJson).toBe(false);
    expect(fallback.summary).toBeTruthy();
    expect(fallback.summary.mainTopics).not.toEqual(['the coast trip']);
  });
});
