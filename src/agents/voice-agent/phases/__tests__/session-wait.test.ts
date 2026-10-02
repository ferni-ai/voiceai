/**
 * The session wait must not end a live conversation on a fixed timer
 * (it used to end every multi-agent call at 10 minutes).
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForSessionEnd, type WaitableRoom } from '../session-wait.js';
import {
  getMemoryCaptureMetrics,
  resetMemoryCaptureMetrics,
} from '../../../../services/memory/memory-capture-metrics.js';

const MIN = 60_000;

class FakeRoom extends EventEmitter implements WaitableRoom {
  isConnected = true;
  remoteParticipants = { size: 1 };
}

function track<T>(p: Promise<T>): { settled: () => T | undefined } {
  let value: T | undefined;
  void p.then((v) => {
    value = v;
  });
  return { settled: () => value };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetMemoryCaptureMetrics();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForSessionEnd', () => {
  it('keeps an active 45-minute conversation going past the old 10-minute limit', async () => {
    const room = new FakeRoom();
    let lastActivity = Date.now();
    const wait = track(
      waitForSessionEnd({
        room,
        sessionId: 's1',
        idleTimeoutMs: 30 * MIN,
        maxDurationMs: 120 * MIN,
        getLastActivityAt: () => lastActivity,
      })
    );

    for (let minute = 1; minute <= 45; minute++) {
      await vi.advanceTimersByTimeAsync(MIN);
      lastActivity = Date.now(); // someone spoke this minute
    }
    expect(wait.settled()).toBeUndefined();

    room.emit('disconnected');
    await vi.advanceTimersByTimeAsync(0);
    expect(wait.settled()).toBe('room.disconnected');
  });

  it('ends a session that has been silent for the idle window and counts it', async () => {
    const room = new FakeRoom();
    const start = Date.now();
    const wait = track(
      waitForSessionEnd({
        room,
        sessionId: 's2',
        idleTimeoutMs: 30 * MIN,
        maxDurationMs: 120 * MIN,
        getLastActivityAt: () => start + 5 * MIN,
      })
    );
    await vi.advanceTimersByTimeAsync(34 * MIN);
    expect(wait.settled()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(wait.settled()).toBe('idle_timeout');
    expect(getMemoryCaptureMetrics().sessionWaitEnds.idle_timeout).toBe(1);
  });

  it('does not idle out while something keeps the session busy (music)', async () => {
    const room = new FakeRoom();
    const wait = track(
      waitForSessionEnd({
        room,
        sessionId: 's3',
        idleTimeoutMs: 30 * MIN,
        maxDurationMs: 120 * MIN,
        getLastActivityAt: () => undefined,
        isBusy: () => true,
      })
    );
    await vi.advanceTimersByTimeAsync(90 * MIN);
    expect(wait.settled()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(31 * MIN);
    expect(wait.settled()).toBe('max_duration');
  });

  it('ends after the empty-room grace period', async () => {
    const room = new FakeRoom();
    const wait = track(waitForSessionEnd({ room, sessionId: 's4', emptyRoomGraceMs: 5_000 }));
    room.remoteParticipants.size = 0;
    room.emit('participantDisconnected');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wait.settled()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wait.settled()).toBe('empty_room');
  });

  it('ends when the room is no longer connected', async () => {
    const room = new FakeRoom();
    const wait = track(waitForSessionEnd({ room, sessionId: 's5' }));
    room.isConnected = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(wait.settled()).toBe('room.!isConnected');
  });
});
