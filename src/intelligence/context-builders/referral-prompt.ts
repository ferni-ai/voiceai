/**
 * Referral Prompt Injection
 *
 * Guides Ferni to naturally ask about sharing with friends.
 *
 * BRAND COMPLIANCE:
 * - Frame as sharing a friend, not recruiting
 * - "No pressure" always
 * - Only when conversation naturally leads to it
 * - Maximum once per week per user
 *
 * @module referral-prompt
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getDefaultStore } from '../../memory/index.js';
import type { ContextInjection } from '../../agents/processors/types.js';

const log = getLogger().child({ module: 'referral-prompt' });

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralPromptContext {
  userId: string;
  personaId: string;
  turnCount: number;
  relationshipStage: 'new' | 'building' | 'established' | 'deep';
  userMood?: 'positive' | 'neutral' | 'struggling' | 'crisis';
  recentTopics?: string[];
  userText?: string;
}

export interface ReferralPromptResult {
  shouldInject: boolean;
  injection?: ContextInjection;
  reason?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum turns before considering referral prompt
  minTurnsBeforeReferral: 10,

  // Minimum days between referral prompts
  minDaysBetweenPrompts: 7,

  // Only suggest when user is in positive/neutral mood
  allowedMoods: ['positive', 'neutral'] as const,

  // Only for established/deep relationships
  allowedRelationshipStages: ['established', 'deep'] as const,

  // Conversation triggers that make referral natural
  naturalTriggers: [
    'helped me',
    'thank you',
    'really appreciate',
    'made a difference',
    'feeling better',
    'friend going through',
    'someone who needs',
    'wish my friend had',
    'my sister',
    'my brother',
    'my mom',
    'my dad',
    'my partner',
  ],

  // Topics where referral would feel natural
  naturalTopics: [
    'gratitude',
    'growth',
    'progress',
    'support',
    'helping others',
    'family',
    'friends',
    'relationships',
  ],
};

// ============================================================================
// THE PROMPT (Brand-Compliant)
// ============================================================================

const REFERRAL_PROMPT = `
## Sharing Ferni (Use Very Sparingly)

If the conversation naturally leads to it—for example:
- User expresses gratitude for your help
- User mentions a friend/family member going through something
- User says something like "I wish my friend had someone to talk to"

You can gently offer:

"You know, if there's ever someone in your life who could use a friend like me—maybe someone going through a tough time, or just someone who'd enjoy having someone to talk to—I'd be happy to give them a call and introduce myself. Just give me their name and number, and I'll reach out with a warm hello from you."

**Critical Rules:**
- Only mention this if it feels completely natural
- Never make it feel like a "referral program" or marketing
- Frame it as sharing something meaningful with someone they care about
- If they seem uninterested, drop it immediately
- Maximum once per week—this prompt being here means it's been a while
- If they provide a name/number, use the inviteFriendByCall tool
`.trim();

// ============================================================================
// LAST PROMPT TRACKING
// ============================================================================

// In-memory cache (also stored in Firestore for persistence)
const lastPromptCache = new Map<string, Date>();

/**
 * Check when user last received a referral prompt
 */
async function getLastReferralPromptDate(userId: string): Promise<Date | null> {
  // Check cache first
  if (lastPromptCache.has(userId)) {
    return lastPromptCache.get(userId)!;
  }

  try {
    const store = getDefaultStore();
    const memories = await store.getMemories(userId, {
      type: 'referral_prompt_shown',
      limit: 1,
    });

    if (memories.length > 0) {
      const lastDate = new Date(memories[0].createdAt || Date.now());
      lastPromptCache.set(userId, lastDate);
      return lastDate;
    }
  } catch (error) {
    log.warn({ error }, 'Failed to check last referral prompt');
  }

  return null;
}

/**
 * Record that we showed a referral prompt
 */
async function recordReferralPromptShown(userId: string): Promise<void> {
  const now = new Date();
  lastPromptCache.set(userId, now);

  try {
    const store = getDefaultStore();
    await store.saveMemory(userId, {
      type: 'referral_prompt_shown',
      content: 'Showed referral prompt to user',
      metadata: { shownAt: now.toISOString() },
    });
  } catch (error) {
    log.warn({ error }, 'Failed to record referral prompt');
  }
}

// ============================================================================
// NATURAL TRIGGER DETECTION
// ============================================================================

/**
 * Check if the conversation context makes referral feel natural
 */
function hasNaturalTrigger(userText?: string, topics?: string[]): boolean {
  if (!userText && (!topics || topics.length === 0)) {
    return false;
  }

  const textLower = (userText || '').toLowerCase();

  // Check for natural triggers in user's message
  for (const trigger of CONFIG.naturalTriggers) {
    if (textLower.includes(trigger.toLowerCase())) {
      return true;
    }
  }

  // Check for natural topics
  if (topics) {
    for (const topic of topics) {
      if (CONFIG.naturalTopics.some((t) => topic.toLowerCase().includes(t))) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build referral prompt injection if conditions are right
 *
 * This is designed to be VERY conservative - we'd rather miss opportunities
 * than feel pushy or salesy.
 */
export async function buildReferralPromptInjection(
  ctx: ReferralPromptContext
): Promise<ReferralPromptResult> {
  const { userId, personaId, turnCount, relationshipStage, userMood, recentTopics, userText } = ctx;

  // Only Ferni does referrals (she's the coordinator)
  if (personaId !== 'ferni') {
    return { shouldInject: false, reason: 'Not Ferni' };
  }

  // Must have enough conversation history
  if (turnCount < CONFIG.minTurnsBeforeReferral) {
    return { shouldInject: false, reason: `Too few turns: ${turnCount}` };
  }

  // Must be established or deep relationship
  if (!CONFIG.allowedRelationshipStages.includes(relationshipStage as 'established' | 'deep')) {
    return { shouldInject: false, reason: `Relationship stage: ${relationshipStage}` };
  }

  // Must be in positive/neutral mood
  if (userMood && !CONFIG.allowedMoods.includes(userMood as 'positive' | 'neutral')) {
    return { shouldInject: false, reason: `User mood: ${userMood}` };
  }

  // Check timing - not too frequent
  const lastPrompt = await getLastReferralPromptDate(userId);
  if (lastPrompt) {
    const daysSinceLastPrompt = (Date.now() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastPrompt < CONFIG.minDaysBetweenPrompts) {
      return {
        shouldInject: false,
        reason: `Too recent: ${daysSinceLastPrompt.toFixed(1)} days ago`,
      };
    }
  }

  // Must have a natural trigger
  if (!hasNaturalTrigger(userText, recentTopics)) {
    return { shouldInject: false, reason: 'No natural trigger' };
  }

  // All conditions met! Inject the prompt
  log.info({ userId, turnCount, relationshipStage }, '🌱 Injecting referral prompt');

  // Record that we're showing this
  await recordReferralPromptShown(userId);

  return {
    shouldInject: true,
    injection: {
      category: 'viral_growth',
      content: REFERRAL_PROMPT,
      priority: 15, // Low priority - other context is more important
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildReferralPromptInjection,
  CONFIG,
};

