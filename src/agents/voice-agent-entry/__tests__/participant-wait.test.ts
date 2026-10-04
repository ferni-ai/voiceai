import { describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@livekit/agents';
import type { RemoteParticipant } from '@livekit/rtc-node';
import { roomClosedBeforeParticipant, waitForParticipantWithTimeout } from '../participant-wait.js';

const caller = { identity: 'caller' } as unknown as RemoteParticipant;

/** A JobContext whose room is either closed or open with the given participants. */
function fakeCtx(opts: {
  connected: boolean;
  existing?: RemoteParticipant[];
  wait?: () => Promise<RemoteParticipant>;
}): JobContext {
  return {
    room: { isConnected: opts.connected, remoteParticipants: new Map((opts.existing ?? []).map((p) => [p.identity, p])) },
    waitForParticipant:
      opts.wait ??
      (() => (opts.connected ? new Promise<RemoteParticipant>(() => {}) : Promise.reject(new Error('room is not connected')))),
  } as unknown as JobContext;
}

describe('roomClosedBeforeParticipant', () => {
  it('ends the job when the wait failed because the room closed', () => {
    expect(roomClosedBeforeParticipant({ participant: null, source: 'error' }, false)).toBe(true);
  });

  it('ends the job when the wait timed out and the room is no longer connected', () => {
    expect(roomClosedBeforeParticipant({ participant: null, source: 'timeout' }, false)).toBe(true);
  });

  it('keeps going after a timeout while the room is still open (the caller may still join)', () => {
    expect(roomClosedBeforeParticipant({ participant: null, source: 'timeout' }, true)).toBe(false);
  });

  it('keeps going whenever a participant joined, connected or not', () => {
    expect(roomClosedBeforeParticipant({ participant: caller, source: 'wait' }, true)).toBe(false);
    expect(roomClosedBeforeParticipant({ participant: caller, source: 'existing' }, false)).toBe(false);
  });
});

describe('waitForParticipantWithTimeout', () => {
  it('resolves with source "error" instead of throwing when the room is closed', async () => {
    const result = await waitForParticipantWithTimeout(fakeCtx({ connected: false }), 1000);
    expect(result).toMatchObject({ participant: null, source: 'error' });
  });

  it('returns a participant already in the room without waiting', async () => {
    const wait = vi.fn();
    const result = await waitForParticipantWithTimeout(fakeCtx({ connected: true, existing: [caller], wait }), 1000);
    expect(result).toMatchObject({ participant: caller, source: 'existing' });
    expect(wait).not.toHaveBeenCalled();
  });

  it('resolves with source "timeout" when nobody joins in time', async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForParticipantWithTimeout(fakeCtx({ connected: true }), 500);
      await vi.advanceTimersByTimeAsync(500);
      expect(await pending).toMatchObject({ participant: null, source: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('closed-room wait feeds the predicate to "end the job" (the re-dispatch crash path)', async () => {
    const ctx = fakeCtx({ connected: false });
    const result = await waitForParticipantWithTimeout(ctx, 1000);
    expect(roomClosedBeforeParticipant(result, ctx.room?.isConnected === true)).toBe(true);
  });
});
