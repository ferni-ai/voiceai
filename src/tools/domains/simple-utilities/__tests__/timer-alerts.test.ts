/**
 * A timer the caller asks for rings in their call.
 *
 * Dev, 2026-09-30: nothing registered a voice-callback handler in live calls,
 * so a finished timer went into a process-wide queue and the caller was never
 * told; a registered handler would have received every caller's timers. And
 * quickTimer called setTimer without the SDK's second argument, so it threw.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerVoiceCallbackHandler,
  triggerVoiceCallback,
  type VoiceCallback,
} from '../voice-callbacks.js';
import { shortcutsToolDefinitions } from '../shortcuts-tools.js';

const call = (session: object, userId: string) => ({ ctx: { session, userData: { userId } } });

describe('voice callbacks reach the call that asked for them', () => {
  afterEach(() => vi.useRealTimers());

  it('routes by session, then user, and drops (never queues) with no live call', async () => {
    const a = vi.fn(async () => undefined);
    const b = vi.fn(async () => undefined);
    const sessionA = {};
    const offA = registerVoiceCallbackHandler('caller-a', a, sessionA);
    const offB = registerVoiceCallbackHandler('caller-b', b, {});
    const cb = (userId: string, session?: object): VoiceCallback => ({
      type: 'timer_complete',
      userId,
      message: 'done',
      priority: 'high',
      session,
    });

    expect(await triggerVoiceCallback(cb('caller-b', sessionA))).toBe(true);
    expect(a).toHaveBeenCalledTimes(1); // the session wins
    expect(await triggerVoiceCallback(cb('caller-b'))).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offB();
    expect(await triggerVoiceCallback(cb('caller-a'))).toBe(false);
    // Registering later must not replay the dropped one into this call.
    const late = vi.fn(async () => undefined);
    const offLate = registerVoiceCallbackHandler('caller-c', late);
    expect(late).not.toHaveBeenCalled();
    offLate();
  });

  it("quickTimer sets a timer that rings in the caller's own call", async () => {
    vi.useFakeTimers();
    const mine = vi.fn(async () => undefined);
    const other = vi.fn(async () => undefined);
    const session = {};
    const off = registerVoiceCallbackHandler('caller-a', mine, session);
    const offOther = registerVoiceCallbackHandler('caller-b', other, {});

    const def = shortcutsToolDefinitions.find((d) => d.id === 'quickTimer')!;
    const tool = def.create({ userId: 'caller-a', agentId: 'ferni' } as never) as unknown as {
      execute: (args: object, opts: object) => Promise<string>;
    };
    const reply = await tool.execute({ duration: '1 minute', label: 'pasta' }, call(session, 'caller-a'));
    expect(reply).not.toMatch(/couldn't|trouble/i);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'timer_complete', userId: 'caller-a', session })
    );
    expect(other).not.toHaveBeenCalled();
    off();
    offOther();
  });
});
