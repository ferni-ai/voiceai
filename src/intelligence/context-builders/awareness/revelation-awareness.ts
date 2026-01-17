/**
 * Revelation Awareness Context Builder
 *
 * > "The capability is felt, not explained."
 *
 * Injects guidance to ensure Ferni:
 * 1. Doesn't overwhelm with capabilities
 * 2. Uses human language, not surveillance language
 * 3. Asks permission before going deep
 * 4. Spaces out impressive moments
 *
 * This builder runs on EVERY turn to provide guardrails.
 *
 * @module intelligence/context-builders/revelation-awareness
 */

import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { RelationshipStage } from '../relationship/arc/types.js';

const log = createLogger({ module: 'context:revelation-awareness' });

// ============================================================================
// TRUST LEVEL MAPPING
// ============================================================================

/**
 * Convert relationship stage to trust level (0.0 - 1.0)
 *
 * Trust level gates access to deeper capabilities:
 * - 0.0-0.2: Only basic memory callbacks
 * - 0.2-0.4: Pattern noticing unlocked
 * - 0.4-0.6: Growth reflection unlocked
 * - 0.6-0.8: Gentle challenges unlocked
 * - 0.8-1.0: Life synthesis unlocked
 */
function stageToTrustLevel(stage: RelationshipStage | undefined): number {
  switch (stage) {
    case 'stranger':
      return 0.1;
    case 'acquaintance':
      return 0.3;
    case 'friend':
      return 0.6;
    case 'trusted_advisor':
      return 0.9;
    default:
      return 0.1;
  }
}

// ============================================================================
// BUILDER
// ============================================================================

export const revelationAwarenessBuilder: ContextBuilder = {
  name: 'revelation-awareness',
  description: 'Ensures capabilities feel human: throttling, anti-surveillance, permission prompts',
  priority: 30, // High priority - shapes all responses
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, userProfile } = input;
    const userId = services?.userId;
    const sessionId = services?.sessionId;

    if (!userId || !sessionId) {
      return [];
    }

    const injections: ContextInjection[] = [];

    // Get session context
    const sessionNumber = userProfile?.totalConversations ?? 1;
    const turnCount = userData?.turnCount ?? 0;

    // Get relationship stage for trust level calculation
    const { getCurrentStage } = await import('../relationship/arc/storage.js');
    let trustLevel = 0.1;
    try {
      const currentStage = await getCurrentStage(userId);
      trustLevel = stageToTrustLevel(currentStage);
    } catch {
      // Default to low trust if we can't determine stage
      trustLevel = 0.1;
    }

    // Import revelation system (lazy to avoid circular deps)
    const { getAntiSurveillanceGuidance } =
      await import('../../../services/revelation-moments/anti-surveillance.js');
    const { getThrottleState, getAvailableRevelations } =
      await import('../../../services/revelation-moments/throttling.js');
    const { getPermissionGuidance } =
      await import('../../../services/revelation-moments/permission-prompts.js');

    // =========================================================================
    // ANTI-SURVEILLANCE GUIDANCE (Always inject)
    // =========================================================================
    // Only inject full guidance on turn 1-2, then just reminders
    if (turnCount <= 2) {
      const antiSurveillanceGuidance = getAntiSurveillanceGuidance();
      injections.push(
        createStandardInjection('anti_surveillance', antiSurveillanceGuidance, {
          category: 'revelation',
          confidence: 1.0,
        })
      );
    } else {
      // Brief reminder on later turns
      injections.push(
        createHintInjection(
          'anti_surveillance_reminder',
          '[LANGUAGE] Say "I noticed" not "Our records show". Observations, not data.',
          {
            category: 'revelation',
            confidence: 0.9,
          }
        )
      );
    }

    // =========================================================================
    // THROTTLE STATE (Inform what capabilities are available)
    // =========================================================================
    try {
      const throttleState = await getThrottleState(userId, sessionId, {
        sessionNumber,
        trustLevel,
      });

      // If we've already used capabilities, add guidance
      if (throttleState.usedThisSession.length > 0) {
        const usedList = [...new Set(throttleState.usedThisSession)].join(', ');

        if (throttleState.shouldHoldBack) {
          injections.push(
            createStandardInjection(
              'throttle_holdback',
              `[HOLD BACK]
You've already shown impressive capabilities this session (${usedList}).
Keep it simple for the rest of this conversation.
One perfect moment > multiple mediocre ones.
Just be present and warm. Don't show off.`,
              {
                category: 'revelation',
                confidence: 0.95,
              }
            )
          );
        } else {
          injections.push(
            createHintInjection(
              'throttle_notice',
              `[NOTE] Already used: ${usedList} this session. Space out capabilities.`,
              {
                category: 'revelation',
                confidence: 0.8,
              }
            )
          );
        }
      }

      // Log blocked capabilities for debugging
      if (throttleState.blockedCategories.length > 0) {
        log.debug(
          { userId, blocked: throttleState.blockedCategories },
          'Some capabilities blocked by throttle'
        );
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Throttle check failed (non-critical)');
    }

    // =========================================================================
    // PERMISSION GUIDANCE (Based on session depth)
    // =========================================================================
    try {
      const availableRevelations = await getAvailableRevelations(userId, {
        sessionNumber,
        trustLevel,
      });

      // If we have available revelations, provide permission guidance
      if (availableRevelations.length > 0 && sessionNumber >= 3) {
        // Map revelation types to capability categories
        const { revelationToCategory } = await import('../../../services/revelation-moments/types.js');
        const availableCategories = availableRevelations.map((r) => revelationToCategory(r));

        const permissionGuidance = getPermissionGuidance(availableCategories, trustLevel);

        if (permissionGuidance) {
          injections.push(
            createHintInjection('permission_guidance', permissionGuidance, {
              category: 'revelation',
              confidence: 0.85,
            })
          );
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Permission check failed (non-critical)');
    }

    // =========================================================================
    // FIRST MEETINGS - EXTRA RESTRAINT
    // =========================================================================
    if (sessionNumber <= 2) {
      injections.push(
        createHintInjection(
          'first_meeting_restraint',
          `[EARLY RELATIONSHIP]
This is session ${sessionNumber}. Keep it simple.
Don't show off capabilities. Just be present and warm.
Impressive features come later when trust is earned.`,
          {
            category: 'revelation',
            confidence: 0.9,
          }
        )
      );
    }

    log.debug(
      { userId, sessionNumber, injectionCount: injections.length },
      '🎭 Revelation awareness guidance generated'
    );

    return injections;
  },
};

// Register on module load
registerContextBuilder(revelationAwarenessBuilder);

export default revelationAwarenessBuilder;

// ============================================================================
// HELPER FOR OTHER BUILDERS
// ============================================================================

/**
 * Check if a capability can be used and get guidance
 *
 * Use this in other builders before surfacing patterns, memories, etc.
 */
export async function checkBeforeReveal(
  userId: string,
  sessionId: string,
  capability: 'memory' | 'pattern' | 'anticipation' | 'growth' | 'challenge' | 'synthesis' | 'team',
  context: {
    sessionNumber: number;
    trustLevel?: number;
  }
): Promise<{
  canReveal: boolean;
  reason?: string;
  permissionPrompt?: string;
  isFirstTime: boolean;
}> {
  try {
    const { checkCapabilityUsage } = await import('../../../services/revelation-moments/index.js');

    const result = await checkCapabilityUsage(userId, sessionId, capability, context);

    return {
      canReveal: result.canUse,
      reason: result.reason,
      permissionPrompt: result.permissionPrompt,
      isFirstTime: result.isFirstTime,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Capability check failed');
    // Default to allowing but being conservative
    return {
      canReveal: context.sessionNumber >= 3,
      isFirstTime: false,
    };
  }
}

/**
 * Record that we revealed a capability
 *
 * Call this AFTER successfully using a capability
 */
export async function afterReveal(
  userId: string,
  sessionId: string,
  capability: 'memory' | 'pattern' | 'anticipation' | 'growth' | 'challenge' | 'synthesis' | 'team',
  personaId: string,
  context: string
): Promise<void> {
  try {
    const { recordCapabilityUsage } = await import('../../../services/revelation-moments/index.js');

    await recordCapabilityUsage(userId, sessionId, capability, personaId, context);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to record capability usage');
  }
}
