/**
 * Handoffs to teammates the user hasn't unlocked are kept out of the model's
 * request. See locked-handoffs.ts for the live failure this prevents.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { UserProfile } from '../../../types/user-profile.js';
import { lockedHandoffTools, withoutLockedHandoffs } from '../locked-handoffs.js';

const fn = (name: string) =>
  llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });
const toolCtx = () =>
  new llm.ToolContext(['handoffToAlex', 'handoffToMaya', 'handoffToFerni', 'playMusic'].map(fn));

const newUser = { totalConversations: 0 } as UserProfile;
const longtimeUser = {
  totalConversations: 400,
  firstContact: new Date(Date.now() - 2 * 365 * 86_400_000).toISOString(),
} as unknown as UserProfile;

describe('handoffs to locked teammates', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env['BYPASS_TEAM_UNLOCKS'];
    delete process.env['BYPASS_TEAM_UNLOCKS'];
  });
  afterEach(() => {
    if (saved !== undefined) process.env['BYPASS_TEAM_UNLOCKS'] = saved;
  });

  it("drops a new free user's locked teammates, keeps Ferni and other tools", async () => {
    const sent = await withoutLockedHandoffs(toolCtx(), { userProfile: newUser, tier: 'free' });
    expect(Object.keys(sent.functionTools).sort()).toEqual(['handoffToFerni', 'playMusic']);
  });

  it('treats an unknown profile the way the runtime check does: locked', async () => {
    const locked = await lockedHandoffTools(['handoffToAlex', 'handoffToFerni'], {
      userProfile: null,
      tier: 'free',
    });
    expect(locked).toEqual(['handoffToAlex']);
  });

  it('keeps every handoff for a user who has unlocked the team', async () => {
    const ctx = toolCtx();
    const sent = await withoutLockedHandoffs(ctx, { userProfile: longtimeUser, tier: 'partner' });
    expect(sent).toBe(ctx);
  });

  it('drops a handoff to the persona already speaking', async () => {
    const locked = await lockedHandoffTools(['handoffToFerni', 'handoffToMaya'], {
      userProfile: longtimeUser,
      tier: 'partner',
      currentAgentId: 'ferni',
    });
    expect(locked).toEqual(['handoffToFerni']);
    // From Maya, the hand-back to Ferni stays.
    expect(
      await lockedHandoffTools(['handoffToFerni'], {
        userProfile: longtimeUser,
        tier: 'partner',
        currentAgentId: 'maya-santos',
      })
    ).toEqual([]);
  });

  it("keeps every handoff under the dev panel's unlock bypass", async () => {
    const ctx = toolCtx();
    const sent = await withoutLockedHandoffs(ctx, {
      userProfile: newUser,
      tier: 'free',
      bypass: true,
    });
    expect(sent).toBe(ctx);
  });
});
