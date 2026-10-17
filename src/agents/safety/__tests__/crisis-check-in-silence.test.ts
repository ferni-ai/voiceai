import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_IN_REPEAT, CHECK_IN_RESOURCES } from '../../../services/safety/crisis-soft-check.js';
import { CHECK_IN_QUIET_MS, followCheckInSilence } from '../crisis-check-in-silence.js';

const caller = () => Object.assign(new EventEmitter(), { say: vi.fn() });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('followCheckInSilence', () => {
  it('silence: one gentle repeat, then 988 and 911 softly, then nothing more', () => {
    const session = caller();
    followCheckInSilence(session);
    session.emit('agent_state_changed', { newState: 'speaking' });
    session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS - 1);
    expect(session.say).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(session.say).toHaveBeenLastCalledWith(CHECK_IN_REPEAT, { allowInterruptions: true });

    session.emit('agent_state_changed', { newState: 'speaking' });
    session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS);
    expect(session.say).toHaveBeenLastCalledWith(CHECK_IN_RESOURCES, { allowInterruptions: true });
    expect(CHECK_IN_RESOURCES).toMatch(/988.*911/);

    session.emit('agent_state_changed', { newState: 'speaking' });
    session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS * 5);
    expect(session.say).toHaveBeenCalledTimes(2);
    expect(session.listenerCount('agent_state_changed')).toBe(0);
  });

  it('the caller speaking stops it: their words are the answer', () => {
    const session = caller();
    followCheckInSilence(session);
    session.emit('agent_state_changed', { newState: 'listening' });
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS * 5);
    expect(session.say).not.toHaveBeenCalled();
    expect(session.listenerCount('user_state_changed')).toBe(0);
  });

  it('a quiet spell counts from when Ferni stops speaking', () => {
    const session = caller();
    followCheckInSilence(session);
    session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS - 1_000);
    session.emit('agent_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS * 2);
    expect(session.say).not.toHaveBeenCalled();
  });

  it('the call ending stops it', () => {
    const session = caller();
    followCheckInSilence(session);
    session.emit('close');
    session.emit('agent_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(CHECK_IN_QUIET_MS * 5);
    expect(session.say).not.toHaveBeenCalled();
  });

  it('a session that cannot speak is left alone', () => {
    expect(() => followCheckInSilence({ userData: {} })()).not.toThrow();
  });
});
