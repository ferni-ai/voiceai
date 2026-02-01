/**
 * Human Personality Context Builder
 *
 * The unified context builder that makes personas feel HUMAN.
 * SUPERHUMAN features through semantic matching and callbacks.
 *
 * FEATURE OWNERSHIP (January 2026):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Feature                │ Owner           │ Notes            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Timing Intelligence    │ personality-context  │ DEFERRED         │
 * │ Anticipation           │ personality-context  │ NEW in v2        │
 * │ Vulnerability Tracking │ personality-context  │ MIGRATED to v2   │
 * │ Pattern Detection      │ personality-context  │ MIGRATED to v2   │
 * │ Growth Milestones      │ personality-context  │ MIGRATED to v2   │
 * │ Callbacks (smile!)     │ human_personality│ UNIQUE HERE      │
 * │ Moment Sharing         │ human_personality│ UNIQUE HERE      │
 * │ Semantic Search        │ human_personality│ UNIQUE HERE      │
 * │ Key Moment Extraction  │ human_personality│ UNIQUE HERE      │
 * └─────────────────────────────────────────────────────────────┘
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
} from '../index.js';

import { extractAndSaveCallbacks } from '../../../personality/callback-persistence.js';
import {
  formatGrowthForPrompt,
  formatPatternForPrompt,
  getGrowthCelebrations,
  getPatternInsights,
  recordEmotionalDataPoint,
} from '../../../personality/emotional-patterns.js';
import {
  extractCallbackKeyMoments,
  findRelevantMomentSemantic,
  formatCallbackForPrompt,
  getPendingCallbacksFromProfile,
  warmUpPersonaEmbeddings,
} from '../../../personality/memory-adapter.js';
import { saveEmotionalDataPoint } from '../../../personality/pattern-persistence.js';
import {
  analyzeMessageTiming,
  formatTimingGuidance,
  shouldSharePersonalMoment,
} from '../../../personality/timing-intelligence.js';
import type { RelationshipStage } from '../../../personality/types.js';
import type { KeyMoment, SharedStory } from '../../../types/user-profile.js';
import { createLogger } from '../../../utils/safe-logger.js';

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
 *
 * Stages progress: stranger → acquaintance → friend → trusted
 * - stranger: 0-2 conversations
 * - acquaintance: 3-10 conversations
 * - friend: 11+ conversations OR has shared vulnerabilities
 * - trusted: 25+ conversations AND 3+ shared vulnerabilities
 */
function calculateRelationshipStage(
  totalConversations: number,
  sharedVulnerabilities = 0
): RelationshipStage {
  // Stranger: 0-2 conversations
  if (totalConversations <= 2) return 'stranger';

  // Acquaintance: 3-10 conversations
  if (totalConversations <= 10) return 'acquaintance';

  // Trusted: Many conversations AND shared vulnerabilities (check BEFORE friend)
  if (totalConversations > 25 && sharedVulnerabilities >= 3) return 'trusted';

  // Friend: 11+ conversations OR has shared vulnerabilities
  if (totalConversations > 10 || sharedVulnerabilities > 0) return 'friend';

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
  // 0. TIMING INTELLIGENCE
  // NOTE: personality-context builder (priority 80) now handles timing intelligence
  // We still analyze for local use but don't inject duplicate guidance
  // ============================================================================

  const timing = analyzeMessageTiming(userText, {
    wordCount: userText.split(/\s+/).length,
  });

  // Don't inject timing guidance - personality-context handles this now
  // Keep the analysis for local decision-making (e.g., callback timing)
  log.debug(
    { intent: timing.intent, confidence: timing.confidence },
    '⏱️ Timing analysis (deferred to v2)'
  );

  // ============================================================================
  // 1. EMOTIONAL DATA RECORDING
  // NOTE: personality-context now handles emotional data recording via recordMoment()
  // We keep the in-memory recording for legacy pattern detection only
  // ============================================================================

  // Extract emotion from analysis if available
  const detectedEmotion = analysis?.emotion?.primary || timing.intent;
  const emotionalIntensity = analysis?.emotion?.intensity || timing.confidence;
  const detectedTopics = analysis?.topics?.detected || [];

  // In-memory only (legacy pattern system) - Firestore persistence moved to v2
  recordEmotionalDataPoint(
    userId,
    detectedEmotion,
    emotionalIntensity,
    detectedTopics,
    userText.slice(0, 100)
  );

  // NOTE: Firestore persistence is now handled by personality-context builder
  // via service.recordMoment() - removed duplicate persistence here

  // ============================================================================
  // 2. CALLBACKS - THE SMILE FACTOR (Highest Priority)
  // ============================================================================

  // Surface callbacks at conversation start OR during natural moments
  // Expanded window: turns 1-5 at start, OR turns 8-12 as natural callback point
  const isCallbackWindow = turnCount <= 5 || (turnCount >= 8 && turnCount <= 12);

  if (
    isCallbackWindow &&
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
          turn: turnCount,
        },
        '💝 Callback surfaced'
      );
    }
  }

  // ============================================================================
  // 3. EMOTIONAL PATTERN INSIGHTS
  // NOTE: Pattern detection and surfacing migrated to personality-context
  // The v2 system uses Clean Architecture with proper persistence
  // ============================================================================
  // DEFERRED TO personality-context builder (priority 80)
  // personality-context handles: pattern detection, evidence tracking, surfacing

  // ============================================================================
  // 4. GROWTH CELEBRATION
  // NOTE: Growth tracking and celebration migrated to personality-context
  // The v2 system tracks milestones with proper baseline comparison
  // ============================================================================
  // DEFERRED TO personality-context builder (priority 80)
  // personality-context handles: milestone creation, progress tracking, celebration timing

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
