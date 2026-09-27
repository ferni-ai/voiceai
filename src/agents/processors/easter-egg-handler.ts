/**
 * Easter Egg Handler
 *
 * Checks for easter eggs in user messages and injects special responses.
 */

import type { llm } from '@livekit/agents';
import { getEasterEggChecker } from './cached-modules.js';
import type { TurnContext } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Easter egg result
 */
export interface EasterEggResult {
  type: string;
  response: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Check for easter eggs in user message
 */
export async function checkEasterEggs(
  ctx: TurnContext,
  turnCtx: llm.ChatContext
): Promise<EasterEggResult | undefined> {
  const { userText, persona, services } = ctx;

  const checkForEasterEgg = await getEasterEggChecker();
  const easterEgg = checkForEasterEgg(userText, persona.id, {
    conversationCount: services.userProfile?.totalConversations || 0,
    userSinceDate: services.userProfile?.createdAt,
  });

  // Random personality quirks are scripted lines with no cause in the
  // conversation; dropping one into a turn reads as a non sequitur.
  if (easterEgg.type === 'personality_quirk') {
    return undefined;
  }

  if (easterEgg.type !== 'none' && easterEgg.response) {
    ctx.logger.info({ type: easterEgg.type }, '🎉 Easter egg triggered!');

    // A hint, not a script: the user may be sharing this news with any
    // feeling (a wedding they dread, a retirement they didn't choose), so the
    // model reads how they feel and answers in its own words.
    const topic = easterEgg.type.replace(/_/g, ' ');
    turnCtx.addMessage({
      role: 'user',
      content: `[CONTEXT: They may be sharing something significant (${topic}). Notice how they feel about it and respond to that, in your own words. Don't assume it's good or bad news.]`,
    });

    return { type: easterEgg.type, response: easterEgg.response };
  }

  return undefined;
}
