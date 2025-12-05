/**
 * Conversation Recap Context Builder
 *
 * Helps personas remember and reference what's been discussed:
 * - "Where were we?" - Resume conversation naturally
 * - Reference earlier topics when relevant
 * - Create continuity across conversation turns
 *
 * This makes the AI feel like it has a coherent memory
 * of the conversation rather than just responding to the last message.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// RECAP TRIGGER PATTERNS
// ============================================================================

const RECAP_PATTERNS = [
  /where (were|was) (we|I)/i,
  /what (were|was) (we|I) (talking|discussing)/i,
  /remind me/i,
  /catch me up/i,
  /what did (we|I) (say|talk|discuss)/i,
  /back to (what|where)/i,
  /continue from/i,
  /picking up/i,
  /where did we leave off/i,
];

const TOPIC_CALLBACK_PATTERNS = [
  /earlier (you|we) (said|mentioned|talked)/i,
  /going back to/i,
  /remember when/i,
  /you mentioned/i,
  /we discussed/i,
  /about that.*thing/i,
];

// ============================================================================
// RECAP CONTEXT BUILDER
// ============================================================================

async function buildConversationRecap(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, userData, services } = input;
  const injections: ContextInjection[] = [];

  // Check if user is explicitly asking for a recap
  const isRecapRequest = RECAP_PATTERNS.some((pattern) => pattern.test(userText));
  const isTopicCallback = TOPIC_CALLBACK_PATTERNS.some((pattern) => pattern.test(userText));

  // Gather conversation history
  const recentTopics = userData?.recentTopics || [];
  const keyMoments = userData?.keyMoments || [];
  const turnCount = userData?.turnCount || 0;
  const lastConversationSummary = services?.userProfile?.lastConversationSummary;

  // If user explicitly asks for recap
  if (isRecapRequest) {
    let recapContent = '[CONVERSATION RECAP REQUESTED]\n\n';

    // Current session info
    if (turnCount > 0 && recentTopics.length > 0) {
      recapContent += `This session:\n`;
      recapContent += `- We've had ${turnCount} exchanges\n`;
      recapContent += `- Topics covered: ${recentTopics.slice(-5).join(', ')}\n`;

      if (keyMoments.length > 0) {
        recapContent += `- Key moments: ${keyMoments.slice(-3).join('; ')}\n`;
      }
    }

    // Previous session info
    if (lastConversationSummary) {
      recapContent += `\nLast time we spoke:\n${lastConversationSummary}\n`;
    }

    recapContent += `\nProvide a warm, natural recap of what you've discussed. Don't list bullet points - summarize conversationally.`;

    injections.push(createStandardInjection('conversation_recap', recapContent));

    getLogger().debug({ turnCount, topicCount: recentTopics.length }, 'Conversation recap requested');
    return injections;
  }

  // If user is referencing something from earlier
  if (isTopicCallback && recentTopics.length > 0) {
    const callbackHint = `[TOPIC CALLBACK: User is referencing something discussed earlier. Topics from this session: ${recentTopics.join(', ')}. Connect naturally to what was said before.]`;

    injections.push(createHintInjection('topic_callback', callbackHint));

    getLogger().debug({ recentTopics }, 'Topic callback detected');
    return injections;
  }

  // Proactive continuity hints (occasional, for natural flow)
  // Only trigger if we have enough context and haven't done it recently
  if (turnCount > 5 && recentTopics.length >= 2 && Math.random() < 0.08) {
    const continuityHint = `[CONTINUITY HINT: You've been discussing ${recentTopics.slice(-2).join(' and ')}. If relevant, you can naturally reference earlier parts of the conversation to create continuity.]`;

    injections.push(createHintInjection('continuity_hint', continuityHint));
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('conversation_recap', buildConversationRecap);

export { buildConversationRecap, RECAP_PATTERNS, TOPIC_CALLBACK_PATTERNS };

