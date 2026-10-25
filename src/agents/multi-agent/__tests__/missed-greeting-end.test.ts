import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CoordinatorState,
  getSpeechCoordinator,
  resetSpeechCoordinator,
} from '../../../speech/coordination/speech-coordinator.js';
import { watchGreetingEnd } from '../missed-greeting-end.js';

const ON = { HANDOFF_FIRST_FIX: 'on' };

/** A session the coordinator can speak on, with LiveKit's agent state events */
function call() {
  const session = Object.assign(new EventEmitter(), { agentState: 'listening', say: vi.fn() });
  const coordinator = getSpeechCoordinator();
  coordinator.attachSession(session as never, { sessionId: 's', personaId: 'ferni' });
  const state = (oldState: string, newState: string) => {
    session.agentState = newState;
    session.emit('agent_state_changed', { oldState, newState });
  };
  const say = (text: string) => coordinator.requestSpeak({ text, priority: 30, source: 'direct' });
  return { session, coordinator, state, say };
}

afterEach(() => resetSpeechCoordinator());

describe('watchGreetingEnd (HANDOFF_FIRST_FIX)', () => {
  it('off by default: nothing is watched', () => {
    expect(watchGreetingEnd(new EventEmitter(), 'ferni', {})).toBeNull();
  });

  it('frees a coordinator still SPEAKING after the greeting ended before wiring', async () => {
    const { session, coordinator, state, say } = call();
    await say('Hey Sam, good evening.');
    const watch = watchGreetingEnd(session, 'ferni', ON);
    state('listening', 'speaking');
    state('speaking', 'listening'); // nobody else listening: the end is missed
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);

    expect(watch?.settle()).toBe(true);
    expect(coordinator.getState()).toBe(CoordinatorState.COOLDOWN);
    expect(session.listenerCount('agent_state_changed')).toBe(0);
  });

  it('leaves it alone while the agent is still speaking (its end will reach the handlers)', async () => {
    const { session, coordinator, state, say } = call();
    await say('Hey Sam, good evening.');
    const watch = watchGreetingEnd(session, 'ferni', ON);
    state('listening', 'speaking');
    state('speaking', 'listening');
    state('listening', 'speaking'); // a reply has started since

    expect(watch?.settle()).toBe(false);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('leaves it alone when no speech ended during the wiring', async () => {
    const { session, coordinator, say } = call();
    await say('Hey Sam, good evening.');
    const watch = watchGreetingEnd(session, 'ferni', ON);

    expect(watch?.settle()).toBe(false);
    expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
  });

  it('leaves alone a line the coordinator started after the end it saw', async () => {
    vi.useFakeTimers();
    try {
      const { session, coordinator, state, say } = call();
      await say('Hey Sam, good evening.');
      const watch = watchGreetingEnd(session, 'ferni', ON);
      state('listening', 'speaking');
      state('speaking', 'listening');
      coordinator.onSpeechEnded(false, 1000); // the handlers were wired in time after all
      await vi.advanceTimersByTimeAsync(2000); // cooldown over: idle
      await say('Something new.'); // SPEAKING again, a line not yet playing

      expect(watch?.settle()).toBe(false);
      expect(coordinator.getState()).toBe(CoordinatorState.SPEAKING);
    } finally {
      vi.useRealTimers();
    }
  });
});
