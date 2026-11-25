/**
 * TASK_TOOLS_ALWAYS_ON under TOOLS_SAME_TURN: the to-do tools are on the first
 * agent from its first turn, so a turn that never says "task" or "todo" can
 * still add, list or finish one. Off, they wait for a topic word, as before.
 *
 * The call is built as agent setup builds it (personas/__tests__/first-agent-call.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAN_ALWAYS_ON_TOOLS, leanAlwaysOnTools } from '../../../config/same-turn-tools-config.js';
import { getEssentialTools, isEssentialTool } from '../../../config/tool-config.js';
import { getToolGateway, resetToolGateway } from '../../../tools/gateway/tool-gateway.js';
import { startCall, turn } from '../../personas/__tests__/first-agent-call.js';
import { withLeanAlwaysOnTools } from '../lean-always-on.js';

const TASK_TOOLS = ['addTask', 'getTasks', 'completeTask'];
const NO_TOPIC_WORD = 'Put the dry cleaning on my list.';
const LIMIT = 88; // 64 + MID_SESSION_TOPIC_TOOLS (initial-tools.ts)

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A handed-to persona's tools before the always-on step: the gateway's Tier 0, no productivity. */
async function handedToMayaTools(): Promise<Record<string, unknown>> {
  resetToolGateway();
  const gateway = getToolGateway();
  await gateway.warmup();
  const tier0 = gateway.getSessionTools() as Record<string, unknown>;
  for (const tool of TASK_TOOLS) expect(tier0).not.toHaveProperty(tool);
  const ctx = { userId: 'test-user', sessionId: 'session-1', agentId: 'maya-santos' };
  return withLeanAlwaysOnTools(tier0, { ...ctx, agentDisplayName: 'Maya' });
}

describe('TASK_TOOLS_ALWAYS_ON on', () => {
  it('gives the first agent the to-do tools, and a turn without a topic word carries them', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    vi.stubEnv('TASK_TOOLS_ALWAYS_ON', 'on');
    const call = await startCall('task-tools-on');
    for (const tool of TASK_TOOLS) expect(call.initialNames).toContain(tool);
    const asked = await turn(call, NO_TOPIC_WORD);
    for (const tool of TASK_TOOLS) expect(asked.request).toContain(tool);
    expect(asked.request.length).toBeLessThan(LIMIT);
    // TASK_EDITS is off here: updateTask isn't built, and its slot breaks nothing.
    expect(call.initialNames).not.toContain('updateTask');
    expect(asked.request).not.toContain('updateTask');
  }, 120_000);

  it('builds them for a persona handed the call without them', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    vi.stubEnv('TASK_TOOLS_ALWAYS_ON', 'on');
    const tools = await handedToMayaTools();
    for (const tool of TASK_TOOLS) expect(tools).toHaveProperty(tool);
  }, 120_000);

  it('makes them must-keep tools, so the cap keeps them', () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    vi.stubEnv('TASK_TOOLS_ALWAYS_ON', 'on');
    for (const tool of TASK_TOOLS) {
      expect(isEssentialTool(tool)).toBe(true);
      expect(getEssentialTools()).toContain(tool);
    }
  });
});

describe('TASK_TOOLS_ALWAYS_ON off', () => {
  it('leaves them to a topic word: a turn without one carries no task tool', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('task-tools-off');
    for (const tool of TASK_TOOLS) expect(call.initialNames).not.toContain(tool);
    const asked = await turn(call, NO_TOPIC_WORD);
    for (const tool of TASK_TOOLS) expect(asked.request).not.toContain(tool);
  }, 120_000);

  it('does not build them for a persona handed the call', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const tools = await handedToMayaTools();
    for (const tool of TASK_TOOLS) expect(tools).not.toHaveProperty(tool);
  }, 120_000);

  it('is the lean set exactly as before', () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    expect(leanAlwaysOnTools()).toBe(LEAN_ALWAYS_ON_TOOLS);
    for (const tool of TASK_TOOLS) expect(isEssentialTool(tool)).toBe(false);
  });
});
