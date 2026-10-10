/**
 * A tap on a teammate during a multi-agent call (the production path) is held to the same
 * unlock rules as the LLM's handoff tools. Before, handleHandoffFromDataChannel went
 * straight to the orchestrator: any persona, paid-only Nayan included, could be reached
 * by sending a handoff_request from the browser.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleHandoffFromDataChannel } from '../multi-agent-entry.js';
import { AgentDirectory } from '../../../personas/agent-directory.js';

type Orchestrator = Parameters<typeof handleHandoffFromDataChannel>[0];
type Services = Parameters<typeof handleHandoffFromDataChannel>[3];

function orchestrator() {
  const handoff = vi.fn(async () => ({ success: true }));
  const o = {
    isHandoffInProgress: () => false,
    getCurrentPersonaId: () => 'ferni',
    handoff,
  } as unknown as Orchestrator;
  return { o, handoff };
}
const services = (profile: unknown, userId: string | undefined = 'u1') =>
  ({ sessionId: 's1', userId, userProfile: profile }) as unknown as Services;
const subscriber = { id: 'u1', subscription: { tier: 'friend' } };
const newcomer = { id: 'u1', totalConversations: 0 };

beforeAll(async () => {
  await AgentDirectory.getEntry('maya-santos'); // the alias table, for canonical ids
});
afterEach(() => vi.useRealTimers());

describe('a tap on a teammate during a call', () => {
  it("is refused for a teammate the person hasn't unlocked, and nothing switches", async () => {
    const { o, handoff } = orchestrator();
    const result = await handleHandoffFromDataChannel(o, 'maya-santos', 'tap', services(newcomer));
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(handoff).not.toHaveBeenCalled();
  });

  it('is refused for paid-only Nayan without the Partner tier, even for a subscriber', async () => {
    const { o, handoff } = orchestrator();
    const result = await handleHandoffFromDataChannel(
      o,
      'nayan-patel',
      'tap',
      services(subscriber)
    );
    expect(result.success).toBe(false);
    expect(handoff).not.toHaveBeenCalled();
  });

  it('goes through for an unlocked teammate', async () => {
    const { o, handoff } = orchestrator();
    const result = await handleHandoffFromDataChannel(
      o,
      'maya-santos',
      'tap',
      services(subscriber)
    );
    expect(result.success).toBe(true);
    expect(handoff).toHaveBeenCalledWith(
      expect.objectContaining({ targetPersonaId: 'maya-santos' })
    );
  });

  it('waits for a profile still loading, rather than refusing a subscriber', async () => {
    const { o, handoff } = orchestrator();
    const s = services(null);
    vi.useFakeTimers();
    const pending = handleHandoffFromDataChannel(o, 'maya-santos', 'tap', s);
    await vi.advanceTimersByTimeAsync(300);
    (s as { userProfile: unknown }).userProfile = subscriber; // arrives 300ms into the call
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.success).toBe(true);
    expect(handoff).toHaveBeenCalled();
  });

  it('refuses an id nobody knows, rather than treating it as Ferni, and nothing switches', async () => {
    const { o, handoff } = orchestrator();
    const result = await handleHandoffFromDataChannel(
      o,
      'not-a-persona-x9',
      'tap',
      services(subscriber)
    );
    expect(result.success).toBe(false);
    expect(handoff).not.toHaveBeenCalled();
  });

  it('hands the orchestrator the id the check decided on, not the one from the browser', async () => {
    const { o, handoff } = orchestrator();
    await handleHandoffFromDataChannel(o, '  MAYA-Santos ', 'tap', services(subscriber));
    expect(handoff).toHaveBeenCalledWith(
      expect.objectContaining({ targetPersonaId: 'maya-santos' })
    );
  });

  it("doesn't wait for a missing profile when the answer is yes anyway (Ferni)", async () => {
    const { o } = orchestrator();
    (o as { getCurrentPersonaId: () => string }).getCurrentPersonaId = () => 'maya-santos';
    const started = Date.now();
    await handleHandoffFromDataChannel(o, 'ferni', 'tap', services(null));
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('waits for a profile that never arrives only once per call', async () => {
    vi.useFakeTimers();
    const { o } = orchestrator();
    const s = services(null);
    const first = handleHandoffFromDataChannel(o, 'maya-santos', 'tap', s);
    await vi.advanceTimersByTimeAsync(3100);
    expect((await first).success).toBe(false);
    // The second tap decides at once: no timers needed
    const second = await handleHandoffFromDataChannel(o, 'maya-santos', 'tap', s);
    expect(second.success).toBe(false);
  });

  it('refuses a target that is not a string, without throwing', async () => {
    const { o, handoff } = orchestrator();
    const result = await handleHandoffFromDataChannel(
      o,
      { not: 'a string' } as never,
      'tap',
      services(subscriber)
    );
    expect(result.success).toBe(false);
    expect(handoff).not.toHaveBeenCalled();
  });

  it('after a tap, the handoff tools know who the person is talking to now', async () => {
    const { getCurrentAgent, setCurrentAgent } = await import('../../../tools/handoff/state.js');
    setCurrentAgent('ferni');
    const { o } = orchestrator();
    await handleHandoffFromDataChannel(o, 'maya-santos', 'tap', services(subscriber));
    // So Maya's own handoff back to Ferni isn't refused as "Already with Ferni"
    expect(getCurrentAgent()).toBe('maya-santos');
  });

  it('Ferni is always open', async () => {
    const { o, handoff } = orchestrator();
    (o as { getCurrentPersonaId: () => string }).getCurrentPersonaId = () => 'maya-santos';
    const result = await handleHandoffFromDataChannel(o, 'ferni', 'tap', services(newcomer));
    expect(result.success).toBe(true);
    expect(handoff).toHaveBeenCalled();
  });
});
