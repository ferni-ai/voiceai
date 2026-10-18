/**
 * The handoff tool's speech is held against interruption while a handoff runs, and let go
 * when the tool ends without one (HANDOFF_TALK_THROUGH, held-handoff-speech.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdHandoffThroughTalk } from '../held-handoff-speech.js';

function runContext() {
  const speechHandle = { allowInterruptions: true, interrupted: false, done: () => false };
  return {
    speechHandle,
    disallowInterruptions: vi.fn(() => {
      speechHandle.allowInterruptions = false;
    }),
  };
}

describe('holdHandoffThroughTalk', () => {
  afterEach(() => vi.unstubAllEnvs());
  const on = () => {
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'on');
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
  };

  it('holds the speech while the tool runs and keeps it held for a handoff', async () => {
    on();
    const ctx = runContext();
    let whileRunning: boolean | undefined;
    const execute = holdHandoffThroughTalk(async () => {
      whileRunning = ctx.speechHandle.allowInterruptions;
      return { agent: {} };
    });
    await execute({}, { ctx });
    expect(whileRunning).toBe(false);
    expect(ctx.speechHandle.allowInterruptions).toBe(false); // the SDK swaps on an uncut handle
  });

  it.each([
    ['a refusal', async () => ({ error: 'Already with Ferni' })],
    [
      'a throw',
      async () => {
        throw new Error('boom');
      },
    ],
  ])('lets go after %s, so the reply that follows can be interrupted', async (_n, fn) => {
    on();
    const ctx = runContext();
    await holdHandoffThroughTalk(fn)({}, { ctx }).catch(() => undefined);
    expect(ctx.disallowInterruptions).toHaveBeenCalledTimes(1);
    expect(ctx.speechHandle.allowInterruptions).toBe(true);
  });

  it('flag off (or one session per persona): touches nothing', async () => {
    for (const [talk, single] of [
      ['off', 'on'],
      ['on', 'off'],
    ]) {
      vi.stubEnv('HANDOFF_TALK_THROUGH', talk);
      vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', single);
      const ctx = runContext();
      const result = await holdHandoffThroughTalk(async () => ({ agent: {} }))({}, { ctx });
      expect(result).toEqual({ agent: {} });
      expect(ctx.disallowInterruptions).not.toHaveBeenCalled();
      expect(ctx.speechHandle.allowInterruptions).toBe(true);
    }
  });

  it('leaves alone a speech that already may not be interrupted', async () => {
    on();
    const ctx = runContext();
    ctx.speechHandle.allowInterruptions = false;
    await holdHandoffThroughTalk(async () => ({ error: 'x' }))({}, { ctx });
    expect(ctx.speechHandle.allowInterruptions).toBe(false); // not ours to let go
  });
});
