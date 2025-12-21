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

  if (easterEgg.type !== 'none' && easterEgg.response) {
    ctx.logger.info({ type: easterEgg.type }, '🎉 Easter egg triggered!');

    // Inject as context hint
    turnCtx.addMessage({
      role: 'user',
      content: `[SPECIAL MOMENT: ${easterEgg.type.toUpperCase()}]\nThis is a special moment! Your response should include or start with:\n"${easterEgg.response}"\nThen continue naturally with your response to what they said.`,
    });

    return { type: easterEgg.type, response: easterEgg.response };
  }

  return undefined;
}
