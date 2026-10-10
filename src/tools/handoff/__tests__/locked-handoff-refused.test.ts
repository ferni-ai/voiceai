/**
 * Tapping a teammate who isn't unlocked yet is refused, and the voice never changes.
 *
 * A tap on the team bar during a call reaches HandoffCoordinator.execute with
 * source 'user' and the caller's tier (data-channel-handler.ts handleHandoffRequest).
 * The other coordinator tests skip validation; this one runs it.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHandoffCoordinator } from '../handoff-coordinator.js';
import { AgentDirectory } from '../../../personas/agent-directory.js';

const coordinators: Array<{ dispose: () => void }> = [];

function coordinator() {
  const onVoiceSwitch = vi.fn(async () => undefined);
  const onLLMUpdate = vi.fn(async () => undefined);
  const c = createHandoffCoordinator({
    sessionId: `locked-${Date.now()}-${Math.random()}`,
    handoffTimeoutMs: 8000,
    skipBanter: true,
    onVoiceSwitch,
    onLLMUpdate,
    onUINotify: () => undefined,
  });
  coordinators.push(c);
  return { c, onVoiceSwitch, onLLMUpdate };
}

beforeAll(async () => {
  // Load the alias table so 'maya-santos' resolves (see handoff-progress-heartbeat.test.ts)
  await AgentDirectory.getEntry('maya-santos');
});
afterEach(() => coordinators.splice(0).forEach((c) => c.dispose()));

describe('a tap on a teammate during a call', () => {
  it("is refused for someone who hasn't unlocked them, and the voice stays", async () => {
    const { c, onVoiceSwitch, onLLMUpdate } = coordinator();
    const result = await c.execute({
      targetAgent: 'maya-santos',
      reason: 'User requested via UI tap',
      source: 'user',
      subscriptionTier: 'free',
      userProfile: null,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_UNLOCKED');
    expect(onVoiceSwitch).not.toHaveBeenCalled();
    expect(onLLMUpdate).not.toHaveBeenCalled();
  });

  it('goes through for a subscriber, who has the core team', async () => {
    const { c, onVoiceSwitch } = coordinator();
    const result = await c.execute({
      targetAgent: 'maya-santos',
      reason: 'User requested via UI tap',
      source: 'user',
      subscriptionTier: 'friend',
      userProfile: null,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(onVoiceSwitch).toHaveBeenCalled();
  });
});
