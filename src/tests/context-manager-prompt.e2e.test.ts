/**
 * Context Manager Prompt Assembly (E2E)
 *
 * Verifies prompt assembly behavior through real SessionServices wiring.
 *
 * Why this exists:
 * - ContextManager includes "shared content" (which can add a [RELATIONSHIP] block)
 * - ContextManager also injects user-profile relationship history
 * - We want the user-profile section to have a distinct header to avoid ambiguity/duplication
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createUserProfile } from '../types/user-profile.js';

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

describe('ContextManager prompt assembly (E2E)', () => {
  beforeAll(async () => {
    const { initializeServices } = await import('../services/index.js');
    await initializeServices(false);
  }, 60000);

  it('labels returning-user relationship history as [USER PROFILE]', async () => {
    const { createSessionServices, getGlobalServices } = await import('../services/index.js');
    const sessionId = `ctx-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userId = `ctx-e2e-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Seed a returning user profile so SessionServices loads it.
    const profile = createUserProfile(userId, 'Ava');
    profile.totalConversations = 3;
    profile.relationshipStage = 'getting_to_know';
    profile.lastConversationSummary = 'We talked about feeling overwhelmed at work.';

    const globalServices = await getGlobalServices();
    await globalServices.store.saveProfile(profile);

    const services = await createSessionServices(sessionId, userId, true);

    try {
      // Add a turn to make the session feel "real".
      services.addTurn('user', "Hey—I'm back. Can we pick up where we left off?");
      services.analyze("Hey—I'm back. Can we pick up where we left off?");

      const prompt = services.getPromptContext().formattedForPrompt;

      expect(prompt).toContain('[USER PROFILE]');

      // Shared content may or may not include [RELATIONSHIP] depending on triggers.
      // But the prompt should never have multiple [RELATIONSHIP] blocks due to user-profile injection.
      expect(countOccurrences(prompt, '[RELATIONSHIP]')).toBeLessThanOrEqual(1);
    } finally {
      await services.endSession();
    }
  });
});
