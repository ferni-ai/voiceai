import { EventEmitter } from 'node:events';

import { DisconnectReason } from '@livekit/rtc-node';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyCallEnd } from '../../../../services/analytics/call-end-reason.js';
import { IDLE_MS, MAX_CALL_MS, waitForSessionEnd, type WatchedRoom } from '../session-end-watch.js';

class FakeRoom extends EventEmitter implements WatchedRoom {
  isConnected = true;
  remoteParticipants = { size: 1 };
}

const MINUTE = 60_000;

/** Settles to the end reason, or 'still-open' if the call hasn't ended yet. */
async function state(p: Promise<string>): Promise<string> {
  return Promise.race([p, Promise.resolve('still-open')]);
}

describe('waitForSessionEnd', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps an active call open past 10 minutes (it used to hang up at 10:00)', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    for (let minute = 0; minute < 11; minute++) {
      room.emit('activeSpeakersChanged', [{ identity: 'caller' }]);
      await vi.advanceTimersByTimeAsync(MINUTE);
    }
    expect(await state(ended)).toBe('still-open');
  });

  it('ends a call nobody has spoken in for IDLE_MS', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    await vi.advanceTimersByTimeAsync(IDLE_MS - 5_000);
    expect(await state(ended)).toBe('still-open');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await ended).toBe('idle');
  });

  it('restarts the idle clock on a data message, not on an empty speakers list', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    await vi.advanceTimersByTimeAsync(IDLE_MS - MINUTE);
    room.emit('activeSpeakersChanged', []); // nobody speaking: not activity
    room.emit('dataReceived', new Uint8Array());
    await vi.advanceTimersByTimeAsync(IDLE_MS - MINUTE);
    expect(await state(ended)).toBe('still-open');
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(await ended).toBe('idle');
  });

  it('a phone hang-up (caller leaves, then LiveKit closes the room) is natural', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    room.remoteParticipants.size = 0;
    room.emit('participantDisconnected', {});
    await vi.advanceTimersByTimeAsync(2_800); // prod: room deleted 2.5-3 s after the caller left
    room.isConnected = false;
    room.emit('disconnected');
    const reason = await ended;
    expect(reason).toBe('caller_left');
    expect(classifyCallEnd(reason)).toBe('natural');
  });

  it("losing the agent's connection with the caller still there is a disconnect", async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    await vi.advanceTimersByTimeAsync(30_000);
    room.isConnected = false;
    room.emit('disconnected');
    const reason = await ended;
    expect(reason).toBe('room.disconnected');
    expect(classifyCallEnd(reason)).toBe('disconnect');
  });

  it('a room closed on purpose is room.closed with the caller there, caller_left once they left', async () => {
    const withCaller = new FakeRoom();
    const ended = waitForSessionEnd(withCaller);
    withCaller.emit('disconnected', DisconnectReason.ROOM_DELETED);
    expect(await ended).toBe('room.closed');
    expect(classifyCallEnd('room.closed')).toBe('natural');

    const empty = new FakeRoom();
    const ended2 = waitForSessionEnd(empty);
    empty.remoteParticipants.size = 0;
    empty.emit('participantDisconnected', {});
    empty.emit('disconnected', DisconnectReason.ROOM_DELETED);
    expect(await ended2).toBe('caller_left');
  });

  it('the poll seeing the connection gone after the caller left is natural too', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    room.remoteParticipants.size = 0;
    room.emit('participantDisconnected', {});
    room.isConnected = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await ended).toBe('caller_left');
  });

  it('ends once the caller has left for the grace period', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    room.remoteParticipants.size = 0;
    room.emit('participantDisconnected', {});
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await ended).toBe('empty_room');
  });

  it('ends when the room disconnects', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    room.emit('disconnected');
    expect(await ended).toBe('room.disconnected');
    expect(room.listenerCount('activeSpeakersChanged')).toBe(0); // cleaned up
  });

  it('still ends a constantly active call at the hard cap', async () => {
    const room = new FakeRoom();
    const ended = waitForSessionEnd(room);
    const talk = setInterval(
      () => room.emit('activeSpeakersChanged', [{ identity: 'caller' }]),
      MINUTE
    );
    await vi.advanceTimersByTimeAsync(MAX_CALL_MS + 1_000);
    clearInterval(talk);
    expect(await ended).toBe('max_duration');
  });
});
