/**
 * SINGLE_AGENT_IDLE_WAIT (#4157): the single-agent call wait ends the way a multi-agent call
 * does, on the idle clock or the long cap, never at a fixed 10 minutes mid-conversation.
 * Off: the fixed 10-minute wait, exactly as before.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, MAX_CALL_MS } from '../../voice-agent/phases/session-end-watch.js';
import { runUntilCallEnds } from '../run-until-call-ends.js';

const MINUTE = 60_000;
const ON = { SINGLE_AGENT_IDLE_WAIT: 'on' };
const OFF = { SINGLE_AGENT_IDLE_WAIT: 'off' };
const ACTIVITY = [
  'activeSpeakersChanged',
  'dataReceived',
  'participantConnected',
  'trackSubscribed',
];

/** A room with Riley Test still in it. */
function callJob() {
  const room = Object.assign(new EventEmitter(), {
    isConnected: true,
    remoteParticipants: new Map([['riley-test', {}]]),
  });
  return { room, shutdown: vi.fn(), addShutdownCallback: vi.fn() };
}

function wait(env: Record<string, string>) {
  const job = callJob();
  const onDisconnect = vi.fn();
  let ended: string | null = null;
  void runUntilCallEnds({
    ctx: job as never,
    session: null,
    sessionId: 's',
    onDisconnect,
    env,
  }).then((reason) => {
    ended = reason;
  });
  const speak = (): boolean => job.room.emit('activeSpeakersChanged', [{ identity: 'riley-test' }]);
  return { job, onDisconnect, speak, ended: (): string | null => ended };
}

/** Riley Test says something every minute for `minutes` minutes. */
async function talkFor(minutes: number, speak: () => boolean): Promise<void> {
  const minute = async (): Promise<void> => {
    speak();
    await vi.advanceTimersByTimeAsync(MINUTE);
  };
  await Array.from({ length: minutes }).reduce<Promise<void>>(
    (done) => done.then(minute),
    Promise.resolve()
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SINGLE_AGENT_IDLE_WAIT on', () => {
  it('a call with someone talking past 10 minutes stays open', async () => {
    const call = wait(ON);
    await talkFor(25, call.speak);
    expect(call.ended()).toBeNull();
    expect(call.job.shutdown).not.toHaveBeenCalled();
  });

  it('a quiet call ends on the idle clock, IDLE_MS after the last sign of life', async () => {
    const call = wait(ON);
    await talkFor(12, call.speak); // the last word came at minute 11
    await vi.advanceTimersByTimeAsync(IDLE_MS - 2 * MINUTE);
    expect(call.ended()).toBeNull();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(call.ended()).toBe('idle');
    expect(call.onDisconnect).toHaveBeenCalledWith('idle');
    expect(call.job.shutdown).toHaveBeenCalledWith('idle');
  });

  it('the cap still ends a call that never goes quiet', async () => {
    const call = wait(ON);
    await talkFor(MAX_CALL_MS / MINUTE - 1, call.speak);
    expect(call.ended()).toBeNull();
    await talkFor(1, call.speak);
    expect(call.ended()).toBe('max_duration');
    expect(call.job.shutdown).toHaveBeenCalledWith('max_duration');
  });

  it.each(ACTIVITY.slice(1))('%s restarts the idle clock', async (event) => {
    const call = wait(ON);
    await vi.advanceTimersByTimeAsync(IDLE_MS - MINUTE);
    call.job.room.emit(event, {});
    await vi.advanceTimersByTimeAsync(IDLE_MS - MINUTE);
    expect(call.ended()).toBeNull();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(call.ended()).toBe('idle');
  });

  it('an empty speaker list is not a sign of life', async () => {
    const call = wait(ON);
    await vi.advanceTimersByTimeAsync(IDLE_MS - MINUTE);
    call.job.room.emit('activeSpeakersChanged', []);
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(call.ended()).toBe('idle');
  });

  it('the activity listeners are removed when the call ends', async () => {
    const call = wait(ON);
    for (const event of ACTIVITY) expect(call.job.room.listenerCount(event)).toBe(1);
    call.job.room.emit('disconnected', 'CLIENT_INITIATED');
    await vi.advanceTimersByTimeAsync(0);
    expect(call.ended()).not.toBeNull();
    for (const event of ACTIVITY) expect(call.job.room.listenerCount(event)).toBe(0);
  });

  it('an emptied room still ends on its grace, and is not also logged as idle', async () => {
    const call = wait(ON);
    // The room empties so its grace runs out on the same poll the idle clock does.
    await vi.advanceTimersByTimeAsync(IDLE_MS - 5_500);
    call.job.room.remoteParticipants.clear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(call.ended()).toBe('empty_room');
    expect(call.onDisconnect.mock.calls).toEqual([['empty_room']]);
  });
});

describe('SINGLE_AGENT_IDLE_WAIT off: exactly as before', () => {
  it.each([
    ['off', OFF],
    ['unset', {}],
  ])('%s: the wait settles timeout at 10:00, even mid-conversation', async (_name, env) => {
    const call = wait(env);
    await talkFor(9, call.speak);
    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(call.ended()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(call.ended()).toBe('timeout');
    expect(call.onDisconnect).toHaveBeenCalledWith('disconnect_wait_timeout');
    expect(call.job.shutdown).toHaveBeenCalledWith('timeout');
  });

  it('adds no activity listeners', () => {
    const call = wait(OFF);
    for (const event of ACTIVITY) expect(call.job.room.listenerCount(event)).toBe(0);
  });
});
