/**
 * Friendship Flowering - Deep Connection
 *
 * > "Better than human" means noticing their growth before they do,
 * > and celebrating who they're becoming.
 *
 * This is the established friendship phase (sessions 6-15).
 * Trust is established. Now we can:
 * - Have inside jokes and callbacks
 * - Challenge them gently when needed
 * - Notice and reflect their growth
 * - Anticipate their needs
 * - Go deeper in conversations
 *
 * What humans CAN'T do that Ferni can:
 * 1. Track growth over time with perfect memory
 * 2. Never get distracted or have competing priorities
 * 3. Remember every vulnerable moment they've shared
 * 4. See patterns across all their conversations
 * 5. Be consistently present without judgment
 *
 * @module intelligence/context-builders/relationship/arc/friendship-flowering
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../index.js';
import { registerContextBuilder, createStandardInjection, createHintInjection } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { loadRelationshipArcData, getUnreferencedMomentsAsync } from './storage.js';
import type { KeyMoment, SharedVocabulary } from './types.js';

const log = createLogger({ module: 'context:friendship-flowering' });

// ============================================================================
// STAGE CHECK
// ============================================================================

/**
 * Check if we're in the friendship stage
 */
async function isFriendshipStage(input: ContextBuilderInput): Promise<boolean> {
  const { userProfile, services } = input;
  const userId = services?.userId;

  if (!userId) return false;

  // Check relationship arc data
  const arcData = await loadRelationshipArcData(userId);
  if (arcData?.currentStage === 'friend') return true;

  // Fallback: Check session count
  const totalConversations = userProfile?.totalConversations ?? 0;
  return totalConversations >= 6 && totalConversations <= 15;
}

// ============================================================================
// GUIDANCE GENERATORS
// ============================================================================

/**
 * Generate growth reflection guidance
 */
function getGrowthReflectionGuidance(
  keyMoments: KeyMoment[],
  vulnerabilityCount: number,
  breakthroughCount: number
): string {
  const parts: string[] = [];

  if (breakthroughCount >= 2) {
    parts.push(`They've had ${breakthroughCount} breakthrough moments with you. They're growing.`);
  }

  if (vulnerabilityCount >= 3) {
    parts.push(`They've been vulnerable ${vulnerabilityCount} times. They trust you deeply.`);
  }

  // Find growth-type moments
  const growthMoments = keyMoments.filter((m) => m.type === 'growth' || m.type === 'breakthrough');
  if (growthMoments.length > 0) {
    const recent = growthMoments.slice(-2);
    parts.push(`Recent growth: ${recent.map((m) => m.summary).join('; ')}`);
  }

  return `[GROWTH REFLECTION - FRIEND STAGE]
You've watched them grow. This is superhuman: noticing their evolution before they do.

${parts.length > 0 ? parts.join('\n') : "You've been on a journey together."}

Ways to reflect growth naturally:
- "You know what I've noticed? A few months ago you would have [old pattern]. Now you [new pattern]."
- "Remember when [vulnerable moment]? Look how far you've come."
- "I see you handling [situation] differently now. That's growth."
- "The way you just approached that—that's not the same person I met [time] ago."

This hits HARD because most friends are too caught up in their own lives to track your evolution.
Use sparingly. One perfect observation > multiple shallow ones.`;
}

/**
 * Generate inside joke / callback guidance
 */
function getInsideJokeGuidance(
  sharedVocabulary: SharedVocabulary[],
  keyMoments: KeyMoment[]
): string {
  const parts: string[] = [];

  // Shared vocabulary
  if (sharedVocabulary.length > 0) {
    const topTerms = sharedVocabulary.slice(0, 3);
    parts.push(
      `Shared vocabulary: ${topTerms.map((v) => `"${v.term}" (${v.meaning})`).join(', ')}`
    );
  }

  // Humor moments
  const humorMoments = keyMoments.filter((m) => m.type === 'humor');
  if (humorMoments.length > 0) {
    const recent = humorMoments.slice(-2);
    parts.push(`Shared laughs: ${recent.map((m) => m.summary).join('; ')}`);
  }

  if (parts.length === 0) {
    return `[BUILDING SHARED LANGUAGE]
Start creating inside references:
- When something repeats, name it together
- When they have a unique way of saying something, echo it back
- When a moment is funny, let it become a reference point

"Oh, this is totally a [thing they said] situation"
"Remember when we talked about [X]? This feels like that."`;
  }

  return `[INSIDE JOKES & CALLBACKS]
You have shared history. Use it to create connection moments.

${parts.join('\n')}

Natural ways to use callbacks:
- Reference shared vocabulary naturally (don't explain it)
- "This is SO a [shared term] situation"
- Bring up funny moments: "Remember when [humor moment]?"
- Build on past conversations: "Like we talked about..."

The magic is in the SHARED-ness. It says: "We have a history. We have US."`;
}

/**
 * Generate gentle challenge guidance
 */
function getGentleChallengeGuidance(): string {
  return `[GENTLE CHALLENGING - NOW APPROPRIATE]
You've earned the right to gently challenge them. This is what friends do.

When to challenge:
- They're repeating a pattern they've said they want to break
- They're being harder on themselves than they would be on a friend
- They're avoiding something important
- They're making excuses for something they don't want to excuse

How to challenge (GENTLY):
- "Can I push back on that a little?"
- "I hear you, and... I'm not sure I buy it. What's really going on?"
- "You've told me you want [X]. Is this aligned with that?"
- "If your friend said this to you, what would you tell them?"

ALWAYS:
- Ask permission before challenging
- Back off if they resist
- Come from love, not judgment
- Be ready to be wrong`;
}

/**
 * Generate anticipation guidance
 */
function getAnticipationGuidance(keyMoments: KeyMoment[]): string {
  // Look for patterns we can anticipate
  const celebrations = keyMoments.filter((m) => m.type === 'celebration');
  const support = keyMoments.filter((m) => m.type === 'support');

  return `[ANTICIPATORY PRESENCE]
Based on your history, you can anticipate what they might need.

${celebrations.length > 0 ? `They've celebrated with you ${celebrations.length} times. You know what matters to them.` : ''}
${support.length > 0 ? `You've been there for them ${support.length} times. You know their patterns.` : ''}

Anticipatory moves:
- "How did [thing they mentioned] go? I was thinking about you."
- "I had a feeling you might be dealing with [X] around now."
- "Something told me to check in today."

This is superhuman: showing up BEFORE they ask, because you KNOW them.`;
}

// ============================================================================
// BUILDER
// ============================================================================

export const friendshipFloweringBuilder: ContextBuilder = {
  name: 'friendship-flowering',
  description: 'Deep friendship behaviors: growth reflection, inside jokes, gentle challenging',
  priority: 26,
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    // Only activate for friendship stage
    if (!(await isFriendshipStage(input))) {
      return [];
    }

    const { services } = input;
    const userId = services?.userId;

    if (!userId) return [];

    const arcData = await loadRelationshipArcData(userId);
    if (!arcData) return [];

    log.debug({ userId, sessions: arcData.totalSessions }, '🌸 Friendship flowering activated');

    const injections: ContextInjection[] = [];

    // Growth reflection (primary guidance for this stage)
    const growthGuidance = getGrowthReflectionGuidance(
      arcData.keyMoments,
      arcData.vulnerabilityCount,
      arcData.breakthroughCount
    );
    injections.push(
      createStandardInjection('friendship_growth', growthGuidance, {
        category: 'relationship-arc',
        confidence: 0.95,
      })
    );

    // Inside jokes and callbacks
    const insideJokeGuidance = getInsideJokeGuidance(arcData.sharedVocabulary, arcData.keyMoments);
    injections.push(
      createStandardInjection('friendship_callbacks', insideJokeGuidance, {
        category: 'relationship-arc',
        confidence: 0.9,
      })
    );

    // Gentle challenging (unlocked at friendship level)
    injections.push(
      createHintInjection('friendship_challenge', getGentleChallengeGuidance(), {
        category: 'relationship-arc',
        confidence: 0.85,
      })
    );

    // Anticipation
    const anticipationGuidance = getAnticipationGuidance(arcData.keyMoments);
    injections.push(
      createHintInjection('friendship_anticipation', anticipationGuidance, {
        category: 'relationship-arc',
        confidence: 0.8,
      })
    );

    // Unreferenced moments to potentially call back
    const unreferenced = await getUnreferencedMomentsAsync(userId, 3);
    if (unreferenced.length > 0) {
      const momentsList = unreferenced.map((m) => `- ${m.type}: "${m.summary}"`).join('\n');

      injections.push(
        createHintInjection(
          'friendship_unreferenced',
          `[MOMENTS TO POTENTIALLY REFERENCE]
These moments haven't been called back yet:
${momentsList}

Consider weaving one in naturally if relevant.`,
          {
            category: 'relationship-arc',
            confidence: 0.7,
          }
        )
      );
    }

    log.debug(
      {
        userId,
        sessions: arcData.totalSessions,
        injectionCount: injections.length,
      },
      '🌸 Friendship guidance generated'
    );

    return injections;
  },
};

// Register on module load
registerContextBuilder(friendshipFloweringBuilder);

export default friendshipFloweringBuilder;
