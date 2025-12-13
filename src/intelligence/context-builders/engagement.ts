/**
 * Engagement Context Builder
 *
 * Handles user engagement and connection:
 * - Curiosity moments (ask follow-up questions)
 * - Conversation depth awareness
 * - User engagement detection
 * - Running jokes with returning users
 *
 * These deepen the human connection.
 *
 * Extracted from jack-bogle.ts lines 919-937, 1272-1283, 1332-1356
 */
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { detectUserEngagement, getRunningJokeCallback } from '../human-behaviors.js';

// ============================================================================
// TYPES
// ============================================================================

type ConversationDepth = 'deep' | 'medium' | 'surface';

interface TrackedTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtendedUserData {
  turnCount?: number;
  topics?: string[];
  keyMoments?: Array<{ summary: string }>;
}

interface ExtendedServices {
  historyTracker?: {
    getRecentTurns: (count: number) => TrackedTurn[];
  };
}

// ============================================================================
// ENGAGEMENT HELPERS
// ============================================================================

/**
 * Calculate conversation depth
 */
function getConversationDepth(
  turnCount: number,
  topicsDiscussed: string[],
  emotionalMomentCount: number
): ConversationDepth {
  // Deep: many turns, multiple topics, emotional moments
  if (turnCount > 10 && topicsDiscussed.length >= 3 && emotionalMomentCount >= 1) {
    return 'deep';
  }
  // Medium: some engagement
  if (turnCount > 5 || topicsDiscussed.length >= 2) {
    return 'medium';
  }
  return 'surface';
}
// ============================================================================
// ENGAGEMENT CONTEXT BUILDER
// ============================================================================
/**
 * Build engagement-related context injections
 */
function buildEngagementContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis, services, userData, userProfile } = input;
  const extUserData = userData as ExtendedUserData;
  const extServices = services as unknown as ExtendedServices;
  const injections: ContextInjection[] = [];
  const turnCount = extUserData.turnCount || 0;
  // -----------------------------------------------
  // CURIOSITY MOMENTS
  // Every 3-5 turns when user is confiding
  // -----------------------------------------------
  if (turnCount > 2 && turnCount % 4 === 0 && analysis.intent.primary === 'confiding') {
    const topics = analysis.topics.detected;
    if (topics.length > 0) {
      injections.push(
        createStandardInjection(
          'curiosity',
          `[CURIOSITY MOMENT]
They mentioned "${topics[0]}". Show genuine interest!
Ask ONE follow-up question:
  - "Tell me more about that."
  - "What's that like for you?"
  - "How did that come about?"
This deepens the relationship. Don't skip it.`
        )
      );
    }
  }
  // -----------------------------------------------
  // CONVERSATION DEPTH AWARENESS
  // -----------------------------------------------
  const topicsDiscussed = extUserData.topics || [];
  const emotionalMomentCount = extUserData.keyMoments?.length || 0;
  const depth = getConversationDepth(turnCount, topicsDiscussed, emotionalMomentCount);
  if (depth === 'deep') {
    injections.push(
      createHintInjection(
        'depth_deep',
        `[DEPTH: This is a DEEP conversation. You've built trust. You can be more direct, personal, and vulnerable. Share wisdom from your heart.]`
      )
    );
  } else if (depth === 'surface' && turnCount > 3) {
    injections.push(
      createHintInjection(
        'depth_surface',
        `[DEPTH: Still at SURFACE level. Focus on building connection before diving into advice. Ask about THEM.]`
      )
    );
  }
  // -----------------------------------------------
  // USER ENGAGEMENT DETECTION
  // -----------------------------------------------
  const recentTurns = extServices.historyTracker?.getRecentTurns(8) || [];
  const recentMessages = recentTurns.map((t: TrackedTurn) => ({
    role: t.role,
    content: t.content,
  }));
  const engagement = detectUserEngagement(recentMessages);
  if (engagement.level === 'checked_out' || engagement.level === 'disengaged') {
    injections.push(
      createStandardInjection(
        'engagement_low',
        `[ENGAGEMENT: User seems ${engagement.level}. ${engagement.suggestions.join(' ')}`
      )
    );
  } else if (engagement.level === 'highly_engaged') {
    injections.push(
      createHintInjection(
        'engagement_high',
        `[ENGAGEMENT: User is highly engaged! They're invested in this conversation. Match their energy.]`
      )
    );
  }
  // -----------------------------------------------
  // RUNNING JOKES WITH RETURNING USERS
  // HUMANIZATION FIX: Pass personaId for persona-specific jokes
  // -----------------------------------------------
  if (userProfile && userProfile.totalConversations >= 2) {
    const currentTopic = analysis.topics.detected[0] || '';
    // Get persona ID from input if available
    const personaId = input.persona?.id || input.personaId;
    const joke = getRunningJokeCallback(userProfile, currentTopic, personaId);
    if (joke) {
      const jokeType = joke.isCallback ? 'callback' : 'setup';
      injections.push(
        createHintInjection(
          'running_joke',
          `[RUNNING JOKE (${jokeType}): Consider weaving this in naturally: "${joke.joke}"]`
        )
      );
    }
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('engagement', buildEngagementContext);
export { buildEngagementContext, getConversationDepth };
