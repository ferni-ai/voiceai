/**
 * Memory Context Builder
 *
 * Handles memory-related context injections:
 * - Memory callbacks (reference earlier in conversation)
 * - Cross-session memory (reference previous conversations)
 * - Past conversation retrieval (semantic search)
 * - Time since last conversation
 * - Emotional continuity (check on previous feelings)
 * - Key moment retrieval
 * - Enhanced learning context
 * - Proactive insights
 *
 * This makes conversations feel continuous and personalized.
 *
 * Extracted from jack-bogle.ts lines 561-612, 959-1005, 1066-1100, 1241-1259
 */
import type { EmotionResult } from '../../intelligence/emotion-detector.js';
import { getKeyMomentRetrieval } from '../../memory/key-moment-retrieval.js';
import { getConversationManager } from '../../services/conversation-manager.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  type SessionServices,
} from './index.js';

// ============================================================================
// EXTENDED TYPES
// ============================================================================

interface ExtendedSessionServices extends SessionServices {
  getEnhancedPromptContext?: () => string;
  searchPastConversations?: (query: string) => Promise<string | null>;
  learningEngine?: {
    getProactiveInsight: (profile: UserProfile | null, turnCount: number) => string | null;
  };
}

interface FollowUpResult {
  question: string;
  context: string;
}
// ============================================================================
// MEMORY HELPERS
// ============================================================================
/**
 * Generate a memory callback phrase referencing earlier in conversation
 */
function getMemoryCallback(topics: string[], userName?: string): string | null {
  if (topics.length === 0) return null;
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const callbacks = [
    `You know, what you said earlier about ${topic} is still on my mind...`,
    `Going back to what you mentioned about ${topic}...`,
    `I keep thinking about what you said regarding ${topic}...`,
    userName ? `${userName}, you brought up ${topic} earlier—let me come back to that...` : null,
    `That reminds me of something you said about ${topic}...`,
  ].filter(Boolean);
  return callbacks[Math.floor(Math.random() * callbacks.length)];
}
/**
 * Generate cross-session memory reference
 *
 * NOTE: lastConversationSummary is intentionally EXCLUDED here because:
 * 1. It's already handled by the greeting (40% chance in greetings.ts)
 * 2. It's included in priming memories (advanced-memory.ts)
 * Including it here caused the LLM to see the same info 2-3 times,
 * making it repeatedly reference "what we talked about last time".
 *
 * Instead, we reference MORE SPECIFIC things: goals, concerns, key moments.
 * These feel more personal and avoid the repetition problem.
 */
function getCrossSessionMemory(
  services: ExtendedSessionServices,
  userName?: string
): string | null {
  const profile = services.userProfile;
  if (!profile) return null;
  const references = [];

  // NOTE: lastConversationSummary intentionally excluded - handled elsewhere
  // This prevents "what we talked about last time" from being mentioned 3 times

  // Reference goals (more specific than general summary)
  if (profile.goals && profile.goals.length > 0) {
    const goal = profile.goals[0];
    references.push(`I remember you're working on ${goal.name || goal.type}...`);
  }
  // Reference concerns
  if (profile.primaryConcerns && profile.primaryConcerns.length > 0) {
    const concern = profile.primaryConcerns[0];
    references.push(`Last time you mentioned being concerned about ${concern}...`);
  }
  // Reference key moments (emotional, meaningful)
  if (profile.keyMoments && profile.keyMoments.length > 0) {
    const moment = profile.keyMoments[0];
    references.push(
      `I've been thinking about what you shared last time—about ${moment.summary}...`
    );
  }
  if (references.length === 0) return null;
  return references[Math.floor(Math.random() * references.length)];
}
/**
 * Get time since last conversation context
 */
function getTimeSinceContext(lastContact: Date): string | null {
  const daysSince = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince === 0) return null;
  if (daysSince === 1) return "It's good to hear from you again! Just yesterday we were talking...";
  if (daysSince <= 3) return "Good to talk again! It's only been a few days.";
  if (daysSince <= 7) return 'A week already! Time flies. Good to reconnect.';
  if (daysSince <= 14) return "It's been a couple weeks—I was wondering how you were doing.";
  if (daysSince <= 30) return "About a month since we last talked. I'm glad you're back.";
  if (daysSince <= 90) return "It's been a while! A few months. How have things been?";
  return "It's been quite some time! I'm genuinely happy to hear from you again.";
}
/**
 * Get emotional continuity check
 */
function getEmotionalContinuity(profile: UserProfile): string | null {
  if (!profile.emotionalPatterns || profile.emotionalPatterns.length === 0) return null;
  // Find most recent distress pattern
  const recentDistress = profile.emotionalPatterns.find(
    (p) =>
      p.intensity &&
      p.intensity > 0.5 &&
      (p.emotion === 'anxiety' || p.emotion === 'sadness' || p.emotion === 'fear')
  );
  if (!recentDistress) return null;
  const checks = [
    'Last time we talked, you seemed worried. How are you feeling now?',
    'I remember you were going through something difficult. How are things?',
    'You were carrying a lot last time. Has any of that lightened?',
    "I hope things have improved since we last spoke. How's it going?",
  ];
  return checks[Math.floor(Math.random() * checks.length)];
}
/**
 * Generate intelligent follow-up question based on history
 */
function getIntelligentFollowUp(services: ExtendedSessionServices): FollowUpResult | null {
  const profile = services.userProfile;
  if (!profile) return null;
  // Follow up on goals
  if (profile.goals && profile.goals.length > 0) {
    const goal = profile.goals[0];
    return {
      question: `How's progress on ${goal.name || goal.type}?`,
      context: 'goal follow-up',
    };
  }
  // Follow up on open questions
  if (profile.openQuestions && profile.openQuestions.length > 0) {
    const question = profile.openQuestions[0];
    return {
      question: `Did you ever figure out ${question}?`,
      context: 'open question follow-up',
    };
  }
  return null;
}
// ============================================================================
// MEMORY CONTEXT BUILDER
// ============================================================================
/**
 * Build memory-related context injections
 */
async function buildMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { analysis, services, userData, userProfile } = input;
  const extServices = services as ExtendedSessionServices;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  const conversationManager = getConversationManager();
  const topics = conversationManager.getTopicHistory();
  // -----------------------------------------------
  // MEMORY CALLBACKS (reference earlier in conversation)
  // Every 4-6 turns, suggest circling back
  // -----------------------------------------------
  if (topics.length > 0 && turnCount > 3 && turnCount % 5 === 0) {
    const memoryCallback = getMemoryCallback(topics, userData.name);
    if (memoryCallback) {
      injections.push(
        createHintInjection(
          'memory_callback',
          `[MEMORY CALLBACK: Consider saying "${memoryCallback}" to show you're listening and remembering.]`
        )
      );
    }
  }
  // -----------------------------------------------
  // CROSS-SESSION MEMORY (reference previous conversations)
  // Only at turn 3, once per session, and only if not already referenced
  // -----------------------------------------------
  const alreadyReferencedLastConversation = userData.hasReferencedLastConversation === true;
  if (turnCount === 3 && !alreadyReferencedLastConversation && Math.random() < 0.4) {
    const crossSessionMemory = getCrossSessionMemory(extServices, userData.name);
    if (crossSessionMemory) {
      injections.push(
        createHintInjection(
          'cross_session_memory',
          `[CROSS-SESSION MEMORY: IF you haven't already referenced past conversations, consider: "${crossSessionMemory}". Only mention once, don't repeat.]`
        )
      );
    }
  }
  // -----------------------------------------------
  // INTELLIGENT FOLLOW-UP (smart questions based on history)
  // Mid-conversation (turns 6-10)
  // -----------------------------------------------
  if (turnCount >= 6 && turnCount <= 10 && Math.random() < 0.3) {
    const intelligentFollowUp = getIntelligentFollowUp(extServices);
    if (intelligentFollowUp) {
      injections.push(
        createHintInjection(
          'intelligent_followup',
          `[INTELLIGENT FOLLOW-UP: Consider asking "${intelligentFollowUp.question}" (${intelligentFollowUp.context})]`
        )
      );
    }
  }
  // -----------------------------------------------
  // TIME SINCE LAST CONVERSATION (early greeting context)
  // -----------------------------------------------
  if (turnCount <= 2 && userProfile?.lastContact) {
    const timeContext = getTimeSinceContext(userProfile.lastContact);
    if (timeContext) {
      injections.push(
        createHintInjection('time_since', `[TIME AWARENESS: Consider mentioning: "${timeContext}"]`)
      );
    }
  }
  // -----------------------------------------------
  // EMOTIONAL CONTINUITY (check on previous feelings)
  // -----------------------------------------------
  if (turnCount <= 3 && userProfile?.emotionalPatterns) {
    const emotionalContinuity = getEmotionalContinuity(userProfile);
    if (emotionalContinuity) {
      injections.push(
        createStandardInjection(
          'emotional_continuity',
          `[EMOTIONAL CONTINUITY: User had distress in previous conversations. Consider checking in: "${emotionalContinuity}"]`
        )
      );
    }
  }
  // -----------------------------------------------
  // KEY MOMENT RETRIEVAL
  // -----------------------------------------------
  if (userProfile) {
    try {
      const keyMomentRetrieval = getKeyMomentRetrieval();
      if (keyMomentRetrieval.shouldReferenceKeyMoment(turnCount)) {
        const relevantMoment = await keyMomentRetrieval.findRelevantMoments(userProfile, {
          currentTopic: conversationManager.getCurrentTopic() || undefined,
          currentEmotion: analysis.emotion as EmotionResult,
          turnCount,
        });
        if (relevantMoment) {
          const momentReference = keyMomentRetrieval.generateMomentReference(
            relevantMoment,
            userProfile.name
          );
          injections.push(
            createStandardInjection('key_moment', `[KEY MOMENT CALLBACK: "${momentReference}"]`)
          );
        }
      }
    } catch (e) {
      getLogger().debug(`Key moment retrieval error (non-blocking): ${e}`);
    }
  }
  // -----------------------------------------------
  // ENHANCED LEARNING CONTEXT
  // -----------------------------------------------
  try {
    const enhancedContext = extServices.getEnhancedPromptContext?.();
    if (enhancedContext && enhancedContext.trim().length > 0) {
      injections.push(
        createHintInjection(
          'learning_context',
          `[PERSONALIZATION - What You've Learned About This User]\n${enhancedContext}`
        )
      );
    }
  } catch (e) {
    getLogger().debug(`Enhanced context error (non-blocking): ${e}`);
  }
  // -----------------------------------------------
  // PROACTIVE INSIGHTS
  // -----------------------------------------------
  try {
    const proactiveInsight = extServices.learningEngine?.getProactiveInsight(
      userProfile ?? null,
      turnCount
    );
    if (proactiveInsight) {
      injections.push(
        createHintInjection(
          'proactive_insight',
          `[PROACTIVE MEMORY: Consider naturally weaving in: "${proactiveInsight}"]`
        )
      );
    }
  } catch {
    // Non-blocking
  }
  // -----------------------------------------------
  // PAST CONVERSATION RETRIEVAL (semantic search)
  // -----------------------------------------------
  if (analysis.topics.detected.length > 0 && Math.random() < 0.3) {
    try {
      const topTopic = analysis.topics.detected[0];
      const pastContext = await extServices.searchPastConversations?.(topTopic);
      if (pastContext) {
        injections.push(
          createHintInjection('past_conversation', `[MEMORY RETRIEVAL: ${pastContext}]`)
        );
      }
    } catch {
      // Non-blocking
    }
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('memory', buildMemoryContext);
export {
  buildMemoryContext,
  getCrossSessionMemory,
  getEmotionalContinuity,
  getIntelligentFollowUp,
  getMemoryCallback,
  getTimeSinceContext,
};
