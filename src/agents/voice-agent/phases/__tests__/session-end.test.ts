/**
 * How a multi-agent call ends: the wait's finish reasons, the two-hour ceiling
 * telling the web client first, and the job ended once, after cleanup.
 */
import { EventEmitter } from 'node:events';

import type { JobContext } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const events: string[] = [];
/** Delivery takes a moment, like a real publishData: the event marks when it's delivered. */
const sendFrontendSignal = vi.fn(
  async (type: string, _data?: Record<string, unknown>, _id?: string) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    events.push(`signal:${type}`);
    return true;
  }
);

vi.mock('../../../../services/communication/frontend-signal.js', () => ({
  sendFrontendSignal: (type: string, data?: Record<string, unknown>, id?: string) =>
    sendFrontendSignal(type, data, id),
}));
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

const { MAX_SESSION_DURATION_MS, cleanupThenEndJob, waitForSessionEnd } =
  await import('../session-end.js');

interface FakeRoom extends EventEmitter {
  isConnected: boolean;
  remoteParticipants: Map<string, unknown>;
}

function fakeCall(participants: number): {
  ctx: JobContext;
  room: FakeRoom;
  shutdown: ReturnType<typeof vi.fn>;
} {
  const room = Object.assign(new EventEmitter(), {
    isConnected: true,
    remoteParticipants: new Map<string, unknown>(
      Array.from({ length: participants }, (_, i) => [`caller-${i}`, {}])
    ),
  }) as FakeRoom;
  const shutdown = vi.fn((reason: string) => events.push(`shutdown:${reason}`));
  return { ctx: { room, shutdown } as unknown as JobContext, room, shutdown };
}

/** The wait, then cleanup, then the job's end: the order index.ts runs them in. */
async function endCall(ctx: JobContext, wait: Promise<string>): Promise<string> {
  const reason = await wait;
  events.push(`ended:${reason}`);
  await cleanupThenEndJob(ctx, reason, [
    async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      events.push('cleanup');
    },
  ]);
  return reason;
}

beforeEach(() => {
  vi.useFakeTimers();
  events.length = 0;
  sendFrontendSignal.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('waitForSessionEnd + cleanupThenEndJob', () => {
  it('an emptied room ends the job exactly once, after cleanup', async () => {
    const { ctx, shutdown } = fakeCall(0);
    const done = endCall(ctx, waitForSessionEnd(ctx, 's-empty'));
    await vi.advanceTimersByTimeAsync(7_000);
    await expect(done).resolves.toBe('empty_room');
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledWith('empty_room');
    expect(events).toEqual(['ended:empty_room', 'cleanup', 'shutdown:empty_room']);
    expect(sendFrontendSignal).not.toHaveBeenCalled();
  });

  it('a call is not cut off at 10 minutes', async () => {
    const { ctx, shutdown } = fakeCall(1);
    let ended = false;
    void waitForSessionEnd(ctx, 's-long').then(() => {
      ended = true;
    });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(ended).toBe(false);
    expect(shutdown).not.toHaveBeenCalled();
  });

  it('the two-hour ceiling sends conversation_end, then cleanup, then shuts down once', async () => {
    expect(MAX_SESSION_DURATION_MS).toBe(2 * 60 * 60_000);
    const { ctx, shutdown } = fakeCall(1);
    const done = endCall(ctx, waitForSessionEnd(ctx, 's-max'));
    await vi.advanceTimersByTimeAsync(MAX_SESSION_DURATION_MS + 1_000);
    await expect(done).resolves.toBe('timeout');
    expect(sendFrontendSignal).toHaveBeenCalledWith(
      'conversation_end',
      expect.objectContaining({ reason: 'max_duration' }),
      's-max'
    );
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledWith('timeout');
    expect(events).toEqual([
      'signal:conversation_end',
      'ended:timeout',
      'cleanup',
      'shutdown:timeout',
    ]);
  });

  it('a goodbye signal that never settles does not hold the call open', async () => {
    sendFrontendSignal.mockImplementationOnce(
      () =>
        new Promise<boolean>(() => {
          /* never settles */
        })
    );
    const { ctx } = fakeCall(1);
    const wait = waitForSessionEnd(ctx, 's-hang', { maxDurationMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000 + 3_000);
    await expect(wait).resolves.toBe('timeout');
  });

  it('a room that disconnected needs no shutdown; the wait stops listening to it', async () => {
    const { ctx, room, shutdown } = fakeCall(1);
    const done = endCall(ctx, waitForSessionEnd(ctx, 's-gone'));
    room.emit('disconnected');
    await vi.advanceTimersByTimeAsync(100);
    await expect(done).resolves.toBe('room.disconnected');
    expect(shutdown).not.toHaveBeenCalled();
    expect(room.listenerCount('disconnected')).toBe(0);
    expect(room.listenerCount('participantDisconnected')).toBe(0);
  });
});

describe('cleanupThenEndJob', () => {
  it('a failing cleanup step still ends the job, and a second call does not end it again', async () => {
    const { ctx, shutdown } = fakeCall(0);
    const later = vi.fn();
    await cleanupThenEndJob(ctx, 'timeout', [
      () => {
        throw new Error('boom');
      },
      later,
    ]);
    await cleanupThenEndJob(ctx, 'timeout', []);
    expect(later).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
