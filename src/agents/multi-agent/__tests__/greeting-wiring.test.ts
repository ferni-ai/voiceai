import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { greetingPlayedOut, wireDeferredHandlers } from '../greeting-wiring.js';

const state = (s: EventEmitter, oldState: string, newState: string): boolean =>
  s.emit('agent_state_changed', { oldState, newState });

afterEach(() => vi.useRealTimers());

describe('wireDeferredHandlers', () => {
  it('wires as the greeting starts when GREETING_WIRE_AFTER is off', async () => {
    const wire = vi.fn(async () => undefined);
    await wireDeferredHandlers(
      { personaId: 'ferni', session: new EventEmitter(), wireHandlers: wire },
      {}
    );
    expect(wire).toHaveBeenCalledOnce();
  });

  it('with the flag on, waits until the greeting has played', async () => {
    const session = new EventEmitter();
    const wire = vi.fn(async () => undefined);
    const done = wireDeferredHandlers(
      { personaId: 'ferni', session, wireHandlers: wire },
      { GREETING_WIRE_AFTER: 'on' }
    );
    state(session, 'listening', 'speaking'); // greeting audio starts
    await Promise.resolve();
    expect(wire).not.toHaveBeenCalled();
    state(session, 'speaking', 'listening'); // greeting played out
    await done;
    expect(wire).toHaveBeenCalledOnce();
    expect(session.listenerCount('agent_state_changed')).toBe(0);
  });

  it('never leaves a call unwired: gives up waiting after the cap', async () => {
    vi.useFakeTimers();
    const wire = vi.fn(async () => undefined);
    const done = wireDeferredHandlers(
      { personaId: 'ferni', session: new EventEmitter(), wireHandlers: wire },
      { GREETING_WIRE_AFTER: 'on', GREETING_WIRE_MAX_WAIT_MS: '500' }
    );
    await vi.advanceTimersByTimeAsync(499);
    expect(wire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(wire).toHaveBeenCalledOnce();
  });

  it('logs a wiring failure instead of rejecting', async () => {
    const wire = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      wireDeferredHandlers({ personaId: 'ferni', session: {}, wireHandlers: wire }, {})
    ).resolves.toBeUndefined();
  });
});

describe('greetingPlayedOut', () => {
  it('resolves at once for a session without events', async () => {
    await expect(greetingPlayedOut({})).resolves.toBeUndefined();
  });
});
