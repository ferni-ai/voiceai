/**
 * Human Personality Context Builder
 *
 * The unified context builder that makes personas feel HUMAN.
 * Now with SUPERHUMAN features:
 *
 * 1. Semantic search for relevance (not keywords)
 * 2. Callbacks (the smile factor - "you remembered!")
 * 3. Timing intelligence (know when to share vs listen)
 * 4. Emotional pattern recognition (notice what they don't)
 * 5. Growth celebration (remember where they started)
 *
 * Philosophy:
 * - Personality through relevance, not repetition
 * - Sometimes the most loving thing is silence
 * - Notice patterns they don't notice themselves
 * - Celebrate growth - humans take it for granted
 *
 * @module intelligence/context-builders/human-personality
 */

import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

import { extractAndSaveCallbacks } from '../../personality/callback-persistence.js';
import {
  formatGrowthForPrompt,
  formatPatternForPrompt,
  getGrowthCelebrations,
  getPatternInsights,
  recordEmotionalDataPoint,
} from '../../personality/emotional-patterns.js';
import {
  extractCallbackKeyMoments,
  findRelevantMomentSemantic,
  formatCallbackForPrompt,
  getPendingCallbacksFromProfile,
  warmUpPersonaEmbeddings,
} from '../../personality/memory-adapter.js';
import { saveEmotionalDataPoint } from '../../personality/pattern-persistence.js';
import {
  analyzeMessageTiming,
  formatTimingGuidance,
  shouldSharePersonalMoment,
} from '../../personality/timing-intelligence.js';
import type { RelationshipStage } from '../../personality/types.js';
import type { KeyMoment, SharedStory } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HumanPersonality' });

// ============================================================================
// TYPES
// ============================================================================

interface HumanPersonalityUserData {
  // From existing UserProfile
  sharedStories?: SharedStory[];
  keyMoments?: KeyMoment[];

  // Session tracking
  callbackSurfacedThisSession?: boolean;
  momentSharedThisSession?: boolean;
  patternInsightThisSession?: boolean;
  growthCelebrationThisSession?: boolean;

  // Relationship
  relationshipStage?: RelationshipStage;
  totalConversations?: number;
}

// ============================================================================
// RELATIONSHIP STAGE CALCULATION
// ============================================================================

/**
 * Calculate relationship stage from user data
 */
function calculateRelationshipStage(
  totalConversations: number,
  sharedVulnerabilities = 0
): RelationshipStage {
  // Stranger: 0-2 conversations
  if (totalConversations <= 2) return 'stranger';

  // Acquaintance: 3-10 conversations
  if (totalConversations <= 10) return 'acquaintance';

  // Friend: 11+ conversations OR has shared vulnerabilities
  if (totalConversations > 10 || sharedVulnerabilities > 0) return 'friend';

  // Trusted: Many conversations AND shared vulnerabilities
  if (totalConversations > 25 && sharedVulnerabilities >= 3) return 'trusted';

  return 'acquaintance';
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build human personality context
 *
 * Priority order:
 * 1. TIMING INTELLIGENCE - Know how to respond first
 * 2. Callbacks (makes users feel remembered)
 * 3. Emotional patterns (notice what they don't)
 * 4. Growth celebration (remember where they started)
 * 5. Relevant personal moments (when contextually appropriate)
 * 6. Extract callback-worthy moments from user message
 */
async function buildHumanPersonalityContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, persona, userData, services, analysis } = input;
  const injections: ContextInjection[] = [];

  // Get user data
  const personalityData = userData as HumanPersonalityUserData;
  const turnCount = userData?.turnCount || 0;
  const totalConversations = services?.userProfile?.totalConversations || 0;
  const userId = services?.userProfile?.id || 'unknown';

  // Don't inject on very first turn (let natural greeting happen)
  if (turnCount === 0) {
    return injections;
  }

  // Calculate relationship stage
  const vulnerabilityCount =
    services?.userProfile?.keyMoments?.filter((m) => m.type === 'shared_vulnerability').length || 0;

  const relationshipStage =
    personalityData.relationshipStage ||
    calculateRelationshipStage(totalConversations, vulnerabilityCount);

  // Get shared stories from profile
  const sharedStories = services?.userProfile?.sharedStories || personalityData.sharedStories || [];

  // ============================================================================
  // 0. TIMING INTELLIGENCE - Always analyze first
  // ============================================================================

  const timing = analyzeMessageTiming(userText, {
    wordCount: userText.split(/\s+/).length,
  });

  // Always inject timing guidance
  injections.push(
    createHintInjection('human_personality_timing', formatTimingGuidance(timing), {
      category: 'personality',
    })
  );

  log.debug({ intent: timing.intent, confidence: timing.confidence }, '⏱️ Timing analysis');

  // ============================================================================
  // 1. RECORD EMOTIONAL DATA (for pattern detection)
  // ============================================================================

  // Extract emotion from analysis if available
  const detectedEmotion = analysis?.emotion?.primary || timing.intent;
  const emotionalIntensity = analysis?.emotion?.intensity || timing.confidence;
  const detectedTopics = analysis?.topics?.detected || [];

  // Record for pattern detection (in-memory for quick access)
  recordEmotionalDataPoint(
    userId,
    detectedEmotion,
    emotionalIntensity,
    detectedTopics,
    userText.slice(0, 100)
  );

  // Also persist to Firestore for cross-session patterns (fire and forget)
  saveEmotionalDataPoint(userId, {
    timestamp: new Date(),
    emotion: detectedEmotion,
    intensity: emotionalIntensity,
    topics: detectedTopics,
    context: userText.slice(0, 100),
  }).catch(() => {}); // Ignore errors - don't block on persistence

  // ============================================================================
  // 2. CALLBACKS - THE SMILE FACTOR (Highest Priority)
  // ============================================================================

  // Only surface callbacks at conversation start (turns 1-3) and when timing is right
  if (
    turnCount <= 3 &&
    timing.callbackAppropriate &&
    !personalityData.callbackSurfacedThisSession &&
    services?.userProfile
  ) {
    const pendingCallbacks = getPendingCallbacksFromProfile(services.userProfile);

    if (pendingCallbacks.length > 0) {
      const callback = pendingCallbacks[0];
      const callbackInjection = formatCallbackForPrompt(callback);

      injections.push(
        createHintInjection('human_personality_callback', callbackInjection, {
          category: 'personality',
        })
      );

      // Mark as surfaced
      if (userData) {
        (userData as HumanPersonalityUserData).callbackSurfacedThisSession = true;
      }

      log.info(
        {
          personaId: persona.id,
          momentType: callback.moment.type,
        },
        '💝 Callback surfaced'
      );
    }
  }

  // ============================================================================
  // 3. EMOTIONAL PATTERN INSIGHTS (Superhuman observation)
  // ============================================================================

  if (
    timing.patternInsightAppropriate &&
    !personalityData.patternInsightThisSession &&
    relationshipStage !== 'stranger'
  ) {
    const patterns = getPatternInsights(userId, { maxCount: 1 });

    if (patterns.length > 0) {
      injections.push(
        createHintInjection('human_personality_pattern', formatPatternForPrompt(patterns[0]), {
          category: 'personality',
        })
      );

      if (userData) {
        (userData as HumanPersonalityUserData).patternInsightThisSession = true;
      }

      log.info({ pattern: patterns[0].pattern }, '🔮 Pattern insight surfaced');
    }
  }

  // ============================================================================
  // 4. GROWTH CELEBRATION (Superhuman memory)
  // ============================================================================

  if (
    !personalityData.growthCelebrationThisSession &&
    relationshipStage !== 'stranger' &&
    Math.random() < 0.2 // 20% chance per conversation
  ) {
    const growthMoments = getGrowthCelebrations(userId, { onlyUnsurfaced: true });

    if (growthMoments.length > 0) {
      injections.push(
        createHintInjection('human_personality_growth', formatGrowthForPrompt(growthMoments[0]), {
          category: 'personality',
        })
      );

      if (userData) {
        (userData as HumanPersonalityUserData).growthCelebrationThisSession = true;
      }

      log.info({ area: growthMoments[0].area }, '🌱 Growth celebration surfaced');
    }
  }

  // ============================================================================
  // 5. RELEVANT PERSONAL MOMENT (When contextually appropriate)
  // ============================================================================

  // Only consider personal moments when timing is right
  if (
    turnCount >= 2 &&
    !personalityData.momentSharedThisSession &&
    !personalityData.callbackSurfacedThisSession
  ) {
    try {
      const relevantMoment = await findRelevantMomentSemantic(persona.id, userText, {
        relationshipStage,
        sharedStories,
        minSimilarity: 0.35,
      });

      if (relevantMoment && relevantMoment.relevanceScore > 0.4) {
        // Check timing intelligence
        const timingCheck = shouldSharePersonalMoment(userText, relevantMoment.relevanceScore);

        if (timingCheck.should) {
          // IMPORTANT: Don't inject literal content - the LLM copies it verbatim
          // Just indicate the type of moment that might fit
          const depthDesc =
            relevantMoment.moment.depth === 'surface'
              ? 'light personal observation'
              : relevantMoment.moment.depth === 'medium'
                ? 'relatable personal story'
                : 'meaningful vulnerable moment';
          const momentInjection = [
            '[✨ PERSONAL MOMENT OPPORTUNITY]',
            '',
            `If the moment feels right, you could share a ${depthDesc}.`,
            `(Relevance: ${Math.round(relevantMoment.relevanceScore * 100)}% | Timing: ${timingCheck.reason})`,
            '',
            "IMPORTANT: Only share if it feels NATURAL. Craft your own words - don't script it.",
            relevantMoment.previouslyShared
              ? "(Note: You've shared something like this before - maybe approach it differently)"
              : '',
          ]
            .filter(Boolean)
            .join('\n');

          injections.push(
            createHintInjection('human_personality_moment', momentInjection, {
              category: 'personality',
            })
          );

          if (userData) {
            (userData as HumanPersonalityUserData).momentSharedThisSession = true;
          }

          log.debug(
            {
              personaId: persona.id,
              momentId: relevantMoment.moment.id,
              relevance: relevantMoment.relevanceScore,
            },
            '✨ Personal moment suggested'
          );
        } else {
          log.debug(
            { reason: timingCheck.reason },
            '⏱️ Personal moment skipped - timing not right'
          );
        }
      }
    } catch (error) {
      log.warn({ error }, 'Failed to find relevant moment');
    }
  }

  // ============================================================================
  // 6. EXTRACT CALLBACK-WORTHY MOMENTS FROM USER MESSAGE
  // ============================================================================

  // Always look for callback-worthy moments in user's message
  const callbackMoments = extractCallbackKeyMoments(userText);

  if (callbackMoments.length > 0) {
    log.debug(
      {
        count: callbackMoments.length,
        types: callbackMoments.map((m) => m.type),
      },
      '📝 Callback-worthy moments detected'
    );

    // 🔥 PERSIST CALLBACKS TO FIRESTORE (fire and forget)
    extractAndSaveCallbacks(userId, userText).catch((error) => {
      log.warn({ error }, 'Failed to persist callbacks');
    });

    // Add a hint for heavy emotional moments
    if (callbackMoments.some((m) => m.emotionalWeight === 'heavy')) {
      injections.push(
        createHintInjection(
          'human_personality_remember',
          [
            '[📝 REMEMBER THIS]',
            '',
            'The user just shared something important.',
            'This is callback-worthy. Make sure to follow up later.',
            '',
            `What they shared: "${userText.slice(0, 150)}..."`,
            `Why it matters: ${callbackMoments[0].type}`,
          ].join('\n'),
          { category: 'personality' }
        )
      );
    }
  }

  return injections;
}

// ============================================================================
// WARM-UP HOOK
// ============================================================================

/**
 * Warm up embeddings when a session starts
 * Call this from session initialization
 */
async function warmUpHumanPersonality(personaId: string): Promise<void> {
  try {
    await warmUpPersonaEmbeddings(personaId);
  } catch (error) {
    log.warn({ error, personaId }, 'Failed to warm up personality embeddings');
  }
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'human_personality',
  description: 'Human personality through relevance and callbacks - the smile factor',
  priority: 75, // High priority - personality matters
  build: buildHumanPersonalityContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildHumanPersonalityContext, warmUpHumanPersonality };
