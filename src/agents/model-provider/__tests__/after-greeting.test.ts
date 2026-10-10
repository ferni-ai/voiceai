import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { armSttRefresh } from '../after-greeting.js';
import { logStreamOpens, refreshSttStream } from '../cartesia-cascade.js';

function fakeStt() {
  const refreshed: number[] = [];
  let n = 0;
  const stt = logStreamOpens({
    stream: () => {
      const id = ++n;
      return { refresh: () => (refreshed.push(id), true) };
    },
  });
  return { stt, refreshed };
}

describe('refreshSttStream', () => {
  it("refreshes the STT's latest stream, and nothing without one", () => {
    const { stt, refreshed } = fakeStt();
    expect(refreshSttStream(stt)).toBe(false);
    stt.stream();
    stt.stream();
    expect(refreshSttStream(stt)).toBe(true);
    expect(refreshed).toEqual([2]);
    expect(refreshSttStream(undefined)).toBe(false);
    const unpatched = logStreamOpens({ stream: () => ({}) });
    unpatched.stream();
    expect(refreshSttStream(unpatched)).toBe(false);
  });
});

describe('armSttRefresh', () => {
  const ON = { STT_REFRESH_AFTER_GREETING: 'on' };

  it('does nothing unless STT_REFRESH_AFTER_GREETING=on', () => {
    const { stt, refreshed } = fakeStt();
    stt.stream();
    const session = Object.assign(new EventEmitter(), { stt });
    armSttRefresh(session, {});
    session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
    expect(refreshed).toEqual([]);
  });

  it('refreshes once, when the greeting stops playing', () => {
    const { stt, refreshed } = fakeStt();
    stt.stream();
    const session = Object.assign(new EventEmitter(), { stt });
    armSttRefresh(session, ON);
    session.emit('agent_state_changed', { oldState: 'initializing', newState: 'listening' });
    session.emit('agent_state_changed', { oldState: 'listening', newState: 'speaking' });
    expect(refreshed).toEqual([]);
    session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
    expect(refreshed).toEqual([1]);
    // Later replies end the same way; only the greeting's end refreshes.
    session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
    expect(refreshed).toEqual([1]);
    expect(session.listenerCount('agent_state_changed')).toBe(0);
  });

  it('stops listening if the greeting never ends', () => {
    vi.useFakeTimers();
    try {
      const { stt, refreshed } = fakeStt();
      stt.stream();
      const session = Object.assign(new EventEmitter(), { stt });
      armSttRefresh(session, ON, 1000);
      vi.advanceTimersByTime(1001);
      expect(session.listenerCount('agent_state_changed')).toBe(0);
      session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
      expect(refreshed).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
