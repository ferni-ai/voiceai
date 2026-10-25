import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const armPromptCacheWarm = vi.fn();
vi.mock('../cache-warm.js', () => ({ armPromptCacheWarm }));

const { run } = await import('../after-greeting.js');
const cascade = await import('../cartesia-cascade.js');

/** A session whose STT stream still has the old patch's refresh(). */
function fakeSession() {
  const refreshed: number[] = [];
  let n = 0;
  const stt = cascade.logStreamOpens({
    stream: () => {
      const id = ++n;
      return { refresh: () => (refreshed.push(id), true) };
    },
  });
  stt.stream();
  return { session: Object.assign(new EventEmitter(), { stt }), refreshed };
}

describe('after-greeting run', () => {
  beforeEach(() => armPromptCacheWarm.mockClear());

  it('arms the prompt-cache warm with the same session and env', () => {
    const { session } = fakeSession();
    const env = { CASCADE_CACHE_WARM: 'on' };
    run(session, env);
    expect(armPromptCacheWarm).toHaveBeenCalledTimes(1);
    expect(armPromptCacheWarm).toHaveBeenCalledWith(session, env);
  });

  it('no longer refreshes the STT socket when the greeting ends', () => {
    const { session, refreshed } = fakeSession();
    run(session, {});
    expect(session.listenerCount('agent_state_changed')).toBe(0);
    session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
    expect(refreshed).toEqual([]);
  });

  it('the cascade no longer exports the refresh helper', () => {
    expect('refreshSttStream' in cascade).toBe(false);
  });
});
