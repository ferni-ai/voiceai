/**
 * A handoff to a teammate the user hasn't unlocked used to come back as a bare
 * teaser string. The model apologised, then called the same handoff again on
 * the next turn (voice eval, 2026-09-28). The result now says the teammate is
 * unavailable and tells the model not to retry.
 */
import { describe, expect, it } from 'vitest';
import { buildHandoffTools } from '../handoff-factory.js';

type HandoffTool = { execute(args: object, ctx: object): Promise<Record<string, unknown>> };

const newFreeUser = {
  ctx: {
    userData: {
      services: {
        sessionId: 'locked-handoff-test',
        userProfile: { totalConversations: 0, subscription: { tier: 'free' } },
      },
    },
  },
};

describe('handoff to a locked teammate', () => {
  it('says the teammate is unavailable and not to retry', async () => {
    const saved = process.env['BYPASS_TEAM_UNLOCKS'];
    delete process.env['BYPASS_TEAM_UNLOCKS'];
    try {
      // No profile at build time: the tool exists and the check happens when it runs.
      const { tools } = await buildHandoffTools('ferni');
      const result = await (tools['handoffToAlex'] as HandoffTool).execute(
        { reason: 'deadline stress' },
        newFreeUser
      );
      expect(result['unavailable']).toBe(true);
      expect(String(result['instruction'])).toMatch(/Don't retry/);
      expect(result['error']).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env['BYPASS_TEAM_UNLOCKS'] = saved;
    }
  }, 30_000);
});
