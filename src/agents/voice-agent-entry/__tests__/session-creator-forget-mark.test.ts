/**
 * FORGET_EVERY_READER and a single-agent call (createAgentSession, also the
 * multi-agent path's fallback): the call is marked as it starts, as agent
 * setup marks a multi-agent one, and the mark ends with the call's cleanup.
 * Without it a reader whose read is late or failed trusted nothing read during
 * the call past 60 s (#2662). The real createAgentSession, stopped just after
 * the mark by a model provider that fails.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const marks = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../model-provider/index.js', async (original) => ({
  ...(await original<typeof import('../../model-provider/index.js')>()),
  getModelProvider: () => {
    throw new Error('stop after the mark');
  },
}));
vi.mock('../../../memory/recall/forget-every-reader.js', async (original) => {
  const real = await original<typeof import('../../../memory/recall/forget-every-reader.js')>();
  return {
    ...real,
    prefetchForgotten: (...args: Parameters<typeof real.prefetchForgotten>) => {
      marks.calls.push(args);
      return real.prefetchForgotten(...args);
    },
  };
});

const { createAgentSession } = await import('../session-creator.js');

afterEach(() => vi.unstubAllEnvs());

describe('a single-agent call and the forget mark', () => {
  it('marks the call for its caller and ends the mark with its cleanup', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    marks.calls = [];
    const cleanupHandlers: Array<() => void> = [];
    await expect(
      createAgentSession({ userId: 'member-single-agent', cleanupHandlers, voiceDeps: {} } as never)
    ).rejects.toThrow('stop after the mark');
    expect(marks.calls.map((c) => c[0])).toEqual(['member-single-agent']);
    expect(cleanupHandlers).toHaveLength(1); // endCallMark, run by the call's cleanup
  });
});
