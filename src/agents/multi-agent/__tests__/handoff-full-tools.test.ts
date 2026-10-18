/**
 * The tools a persona the caller is handed to starts with.
 *
 * The handoff path (agent-setup.ts) took the Tool Gateway's Tier 0 as they are:
 * memory, handoff, entertainment, awareness and behavior, ~56 tools. On a prod
 * call (2026-10-17) every teammate offered 55 tools, without the crisis, safety
 * planning and human-transfer tools, and Tier 0's handoff domain (built for no
 * one) offered Peter a handoff to himself and to teammates the user hasn't
 * unlocked. HANDOFF_FULL_TOOLS=on gives a teammate the first agent's essential
 * set instead (buildEssentialToolSet, then the same initial cap).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getToolGateway, resetToolGateway } from '../../../tools/gateway/tool-gateway.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { buildEssentialToolSet, handoffGetsEssentialSet } from '../essential-tool-set.js';

const SAFETY_TOOLS = ['provideCrisisResources', 'createSafetyPlan', 'connectToHumanExpert'];

/** A free person who has met Peter and Maya, nobody else. */
const user = {
  totalConversations: 12,
  unlockedPersonas: ['ferni', 'peter-john', 'maya-santos'],
} as unknown as UserProfile;

async function tier0(): Promise<string[]> {
  resetToolGateway();
  const gateway = getToolGateway();
  await gateway.warmup();
  return Object.keys(gateway.getSessionTools());
}

async function essentialSetForPeter(): Promise<string[]> {
  const { tools } = await buildEssentialToolSet({
    personaId: 'peter-john',
    userId: 'signed-in-person',
    services: { userProfile: user },
  });
  return Object.keys(tools);
}

describe('a handed-to persona', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetToolGateway();
  });

  it('starts from the gateway Tier 0 by default, which has no crisis or human-transfer tool', async () => {
    expect(handoffGetsEssentialSet()).toBe(false);
    const tools = await tier0();
    for (const name of SAFETY_TOOLS) expect(tools).not.toContain(name);
    expect(tools).toContain('handoffToPeter'); // Peter offered a handoff to himself
  }, 60_000);

  it('HANDOFF_FULL_TOOLS=on starts from the essential set: safety tools, no handoff to itself', async () => {
    vi.stubEnv('HANDOFF_FULL_TOOLS', 'on');
    expect(handoffGetsEssentialSet()).toBe(true);

    const started = Date.now();
    const tools = await essentialSetForPeter();
    const coldMs = Date.now() - started;
    const warmStart = Date.now();
    await essentialSetForPeter();
    const warmMs = Date.now() - warmStart;
    process.stderr.write(
      `HANDOFF_FULL_TOOLS essential set: cold ${coldMs} ms, warm ${warmMs} ms\n`
    );

    expect(tools).toEqual(expect.arrayContaining(SAFETY_TOOLS));
    expect(tools).not.toContain('handoffToPeter');
    expect(tools).not.toContain('handoffToNate'); // not unlocked
  }, 60_000);
});
