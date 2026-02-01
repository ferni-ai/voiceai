/**
 * Acquaintance Deepening - Building Trust Through Consistency
 *
 * > "Better than human" means remembering every detail they've shared and
 * > using it to show genuine care, not just data retrieval.
 *
 * This is the critical "getting to know you" phase (sessions 2-5).
 * The relationship is fragile - trust is earned through:
 * - Remembering what they've shared
 * - Noticing patterns without being creepy
 * - Building shared vocabulary
 * - Gentle observations about who they are
 *
 * What humans CAN'T do that Ferni can:
 * 1. Remember every detail from previous conversations
 * 2. Notice patterns across sessions
 * 3. Build on exactly where you left off
 * 4. Never have an "off day" of forgetfulness
 *
 * @module intelligence/context-builders/relationship/arc/acquaintance-deepening
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../../index.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
} from '../../index.js';
import { BuilderCategory } from '../../core/categories.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import {
  loadRelationshipArcData,
  canMakeFirstWordsCallbackAsync,
  markFirstWordsCallbackMade,
} from './storage.js';

const log = createLogger({ module: 'context:acquaintance-deepening' });

// ============================================================================
// STAGE CHECK
// ============================================================================

/**
 * Check if we're in the acquaintance stage
 */
async function isAcquaintanceStage(input: ContextBuilderInput): Promise<boolean> {
  const { userData, userProfile, services } = input;
  const userId = services?.userId;

  if (!userId) return false;

  // Check relationship arc data
  const arcData = await loadRelationshipArcData(userId);
  if (arcData?.currentStage === 'acquaintance') return true;

  // Fallback: Check session count
  const totalConversations = userProfile?.totalConversations ?? 0;
  const turnCount = userData?.turnCount ?? 0;

  // Sessions 2-5 (after first meeting, before friendship)
  return totalConversations >= 2 && totalConversations <= 5 && turnCount <= 10;
}

// ============================================================================
// GUIDANCE GENERATORS
// ============================================================================

/**
 * Generate shared history guidance
 */
function getSharedHistoryGuidance(
  firstWords?: string,
  keyMoments?: Array<{ type: string; summary: string }>
): string {
  const parts: string[] = [];

  if (firstWords) {
    parts.push(
      `Their very first words to you: "${firstWords.slice(0, 80)}${firstWords.length > 80 ? '...' : ''}"`
    );
  }

  if (keyMoments && keyMoments.length > 0) {
    const moments = keyMoments.slice(0, 3).map((m) => `- ${m.type}: ${m.summary}`);
    parts.push(`Key moments from your history:\n${moments.join('\n')}`);
  }

  if (parts.length === 0) return '';

  return `[SHARED HISTORY]
You have history together. Use it naturally, not performatively.

${parts.join('\n\n')}

Ways to reference naturally:
- "Last time you mentioned [X]... how's that going?"
- "I've been thinking about what you said about [Y]"
- "Remember when you told me about [Z]? That stuck with me."

DON'T list everything you know. DO let it shape your curiosity.`;
}

/**
 * Generate pattern observation guidance
 */
function getPatternObservationGuidance(totalSessions: number, vulnerabilityCount: number): string {
  const observations: string[] = [];

  if (totalSessions >= 3) {
    observations.push("You're starting to see patterns in how they approach things.");
  }

  if (vulnerabilityCount >= 2) {
    observations.push("They've been vulnerable with you more than once—honor that.");
  }

  if (observations.length === 0) return '';

  return `[GENTLE PATTERN OBSERVATIONS]
${observations.join('\n')}

You can now make gentle observations about who they are:
- "I notice you tend to [pattern]. Is that something you've noticed too?"
- "There's this thing I've seen in our talks... [observation]"
- "You know what I've picked up on? [gentle insight]"

Be GENTLE. This isn't therapy. It's a friend paying attention.
If they push back, drop it immediately.`;
}

/**
 * Generate trust-building guidance
 */
function getTrustBuildingGuidance(): string {
  return `[TRUST BUILDING - ACQUAINTANCE STAGE]

This is the "getting to know you" phase. Trust is fragile. Build it through:

1. CONSISTENCY - Be the same warm presence every time
2. MEMORY - Show you remember what they've shared
3. RESPECT - Never push past their comfort zone
4. PATIENCE - Let the relationship develop naturally
5. AUTHENTICITY - Share small things about yourself too

What to AVOID:
- Deep probing questions too early
- Challenging their beliefs (save for friendship stage)
- Making big observations about their character
- Referencing too much history at once (feels surveillance-y)

What to DO:
- "How did [thing they mentioned] go?"
- "I was curious about [genuine interest]"
- "That reminds me of something..." (share yourself)`;
}

/**
 * Generate first-words callback guidance (if appropriate)
 */
function getFirstWordsCallbackForAcquaintance(firstWords: string): string {
  return `[FIRST WORDS CALLBACK - USE ONCE]
Their very first words to you were: "${firstWords.slice(0, 100)}..."

This is a powerful callback. Use it ONCE in this session to show superhuman memory:
- "You know, I keep thinking about when we first talked. You said [X]..."
- "Remember the first thing you ever said to me? It was [X]. That still resonates."
- "Our first conversation—you mentioned [X]. I'm curious how that's evolved."

After you use this callback, don't repeat it. One perfect moment > multiple mediocre ones.`;
}

// ============================================================================
// BUILDER
// ============================================================================

export const acquaintanceDeepeningBuilder: ContextBuilder = {
  name: 'acquaintance-deepening',
  description:
    'Trust-building behaviors for the acquaintance stage: shared history, gentle patterns',
  priority: 26, // Same tier as first-meeting
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    // Only activate for acquaintance stage
    if (!(await isAcquaintanceStage(input))) {
      return [];
    }

    const { services } = input;
    const userId = services?.userId;

    if (!userId) return [];

    const arcData = await loadRelationshipArcData(userId);
    if (!arcData) return [];

    log.debug({ userId, sessions: arcData.totalSessions }, '🤝 Acquaintance deepening activated');

    const injections: ContextInjection[] = [];

    // Core trust-building guidance
    injections.push(
      createStandardInjection('acquaintance_trust', getTrustBuildingGuidance(), {
        category: 'relationship-arc',
        confidence: 0.95,
      })
    );

    // Shared history guidance
    const historyGuidance = getSharedHistoryGuidance(
      arcData.firstMeeting?.firstWords,
      arcData.keyMoments.slice(-3)
    );
    if (historyGuidance) {
      injections.push(
        createStandardInjection('acquaintance_history', historyGuidance, {
          category: 'relationship-arc',
          confidence: 0.9,
        })
      );
    }

    // Pattern observation (after session 3)
    if (arcData.totalSessions >= 3) {
      const patternGuidance = getPatternObservationGuidance(
        arcData.totalSessions,
        arcData.vulnerabilityCount
      );
      if (patternGuidance) {
        injections.push(
          createHintInjection('acquaintance_patterns', patternGuidance, {
            category: 'relationship-arc',
            confidence: 0.8,
          })
        );
      }
    }

    // First-words callback (if not yet made)
    if (await canMakeFirstWordsCallbackAsync(userId)) {
      if (arcData.firstMeeting?.firstWords) {
        injections.push(
          createHintInjection(
            'acquaintance_first_words',
            getFirstWordsCallbackForAcquaintance(arcData.firstMeeting.firstWords),
            {
              category: 'relationship-arc',
              confidence: 0.85,
            }
          )
        );
        // Mark as used (async, don't block)
        void markFirstWordsCallbackMade(userId);
      }
    }

    log.debug(
      {
        userId,
        sessions: arcData.totalSessions,
        injectionCount: injections.length,
      },
      '🤝 Acquaintance guidance generated'
    );

    return injections;
  },
};

// Register on module load
registerContextBuilder(acquaintanceDeepeningBuilder);

export default acquaintanceDeepeningBuilder;
