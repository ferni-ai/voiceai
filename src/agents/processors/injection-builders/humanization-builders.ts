/**
 * Advanced Humanization & Cross-Persona Injection Builders
 *
 * Coordinates all 10 deep humanization capabilities and cross-persona insights.
 * Also manages advanced humanization session lifecycle.
 *
 * Priority: 25-55 (varies by detection urgency)
 */

import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';

// Static imports for performance
import {
  processAdvancedTurn,
  getResponseModifications,
} from '../../../conversation/advanced-humanization-integration.js';
import {
  buildInsightContext,
  getInsightsToSurface,
  acknowledgeInsight,
} from '../../../services/cross-persona-insights.js';

import { getCachedInjection, setCachedInjection } from './cache.js';
import type {
  AdvancedHumanizationInjectionContext,
  AdvancedHumanizationInjectionResult,
} from './types.js';
import type { SessionServices } from '../../../services/types.js';

// ============================================================================
// CROSS-PERSONA INSIGHTS INJECTION BUILDER
// Priority: 31
// PERFORMANCE: Cached for 60s - insights don't change turn-to-turn
// ============================================================================

/**
 * Build cross-persona insights injection (team intelligence)
 *
 * PERFORMANCE: Cached for 60s - insights don't change turn-to-turn.
 * Static imports used for performance.
 */
export async function buildCrossPersonaInsightsInjection(
  services: SessionServices,
  personaId: string
): Promise<ContextInjection | null> {
  // Check cache first (60s TTL)
  const userId = services.userId || 'anonymous';
  const cacheKey = `${userId}:${personaId}:insights`;
  const cached = getCachedInjection(cacheKey);
  if (cached !== undefined) {
    diag.debug('Cross-persona insights cache hit', { userId, personaId });
    return cached;
  }

  try {
    const validPersonaId = personaId as
      | 'ferni'
      | 'maya'
      | 'peter'
      | 'alex'
      | 'jordan'
      | 'nayan'
      | 'jack';

    const insightContext = buildInsightContext(userId, validPersonaId, {
      maxInsights: 3,
    });

    // Acknowledge insights we're using
    const insightsToSurface = getInsightsToSurface(userId, validPersonaId, 2);
    for (const item of insightsToSurface) {
      void acknowledgeInsight(userId, item.insight.id, validPersonaId).catch((err) => {
        diag.warn('Failed to acknowledge insight', {
          insightId: item.insight.id,
          error: String(err),
        });
      });
    }

    if (insightContext) {
      const result: ContextInjection = {
        category: 'team_insights',
        content: insightContext,
        priority: 31,
      };
      setCachedInjection(cacheKey, result);
      return result;
    }

    setCachedInjection(cacheKey, null);
  } catch {
    setCachedInjection(cacheKey, null);
  }

  return null;
}

// ============================================================================
// ADVANCED HUMANIZATION INJECTION BUILDER
// Priority: 25-55 (varies by detection urgency)
// Coordinates all 10 deep humanization capabilities
// ============================================================================

/**
 * Build advanced humanization injections
 *
 * Coordinates all 10 capabilities:
 * 1. Subtext Detection - Read between the lines
 * 2. Emotional Aftercare - Guide back to equilibrium
 * 3. Conversational Repair - Recover from miscommunication
 * 4. Hope Injection - Subtle forward-looking language
 * 5. Curiosity Engine - Genuine interest in their life
 * 6. Energy Regulation - Lead vs match energy
 * 7. Micro-Affirmations - Tiny validations throughout
 * 8. Temporal Context - Life rhythm awareness
 * 9. Relationship Events - Track milestones
 * 10. Paradoxical Intervention - Know when advice backfires
 */
export async function buildAdvancedHumanizationInjections(
  ctx: AdvancedHumanizationInjectionContext
): Promise<AdvancedHumanizationInjectionResult> {
  const result: AdvancedHumanizationInjectionResult = {
    injections: [],
    stopDirectAdvice: false,
    toneGuidance: 'warm and present',
    lengthGuidance: 'normal',
  };

  try {
    // Process the turn through all 10 capabilities
    const guidance = processAdvancedTurn(ctx.sessionId, ctx.userText, {
      detectedEmotion: ctx.detectedEmotion,
      valence: ctx.valence,
      arousal: ctx.arousal,
      topic: ctx.topic,
      prosodyHints: ctx.prosodyHints,
    });

    // If session not initialized, return early
    if (!guidance) {
      diag.debug('Advanced humanization: session not initialized');
      return result;
    }

    // Transfer core guidance
    result.stopDirectAdvice = guidance.stopDirectAdvice;
    result.toneGuidance = guidance.toneGuidance;
    result.lengthGuidance = guidance.lengthGuidance;

    // Get response modifications (prefixes, suffixes, system prompts)
    const modifications = getResponseModifications(ctx.sessionId);

    if (modifications) {
      // Add system prompt additions as injections
      for (const addition of modifications.systemPromptAdditions) {
        let priority = 35; // Default
        if (addition.includes('PRIORITY')) priority = 55;
        else if (addition.includes('⚠️') || addition.includes('STOP')) priority = 52;
        else if (addition.includes('SUBTEXT')) priority = 48;
        else if (addition.includes('AFTERCARE')) priority = 46;
        else if (addition.includes('HOPE')) priority = 30;
        else if (addition.includes('ENERGY')) priority = 28;
        else if (addition.includes('TONE') || addition.includes('LENGTH')) priority = 25;

        result.injections.push({
          category: 'advanced_humanization',
          content: addition,
          priority,
        });
      }

      // Set prefix and suffix
      result.responsePrefix = modifications.prefix;
      result.responseSuffix = modifications.suffix;
    }

    // Log what was detected
    if (guidance.priorityActions.length > 0 || guidance.subtext || guidance.repair) {
      diag.debug('🌟 Advanced humanization active', {
        priorityActions: guidance.priorityActions.length,
        hasSubtext: !!guidance.subtext,
        hasRepair: !!guidance.repair,
        hasAftercare: !!guidance.aftercare,
        stopAdvice: guidance.stopDirectAdvice,
      });
    }
  } catch (error) {
    diag.warn('Advanced humanization failed (non-fatal)', { error: String(error) });
  }

  return result;
}

/**
 * Initialize advanced humanization for a session
 * Should be called when session starts
 */
export async function initAdvancedHumanizationSession(
  sessionId: string,
  userId: string,
  options?: {
    relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';
    prosodyHints?: {
      speechRate?: number;
      volume?: number;
      pitchVariance?: number;
    };
  }
): Promise<{
  greeting: string | null;
  eventFollowUp: string | null;
  milestoneAcknowledgment: string | null;
} | null> {
  try {
    const { initAdvancedHumanization } =
      await import('../../../conversation/advanced-humanization-integration.js');

    const result = initAdvancedHumanization({
      sessionId,
      userId,
      relationshipDepth: options?.relationshipDepth,
      prosodyHints: options?.prosodyHints,
    });

    diag.info('🌟 Advanced humanization session initialized', {
      sessionId,
      hasGreeting: !!result.greeting,
      hasMilestone: !!result.milestoneAcknowledgment,
    });

    return result;
  } catch (error) {
    diag.warn('Failed to initialize advanced humanization (non-fatal)', { error: String(error) });
    return null;
  }
}

/**
 * Clean up advanced humanization session
 * Should be called when session ends
 */
export async function cleanupAdvancedHumanizationSession(sessionId: string): Promise<void> {
  try {
    const { cleanupAdvancedHumanization } =
      await import('../../../conversation/advanced-humanization-integration.js');

    cleanupAdvancedHumanization(sessionId);
    diag.debug('🧹 Advanced humanization session cleaned up', { sessionId });
  } catch (error) {
    diag.debug('Failed to cleanup advanced humanization (non-fatal)', { error: String(error) });
  }
}

/**
 * Record that advice was given (for resistance tracking)
 */
export async function recordAdviceGivenToSession(sessionId: string): Promise<void> {
  try {
    const { recordAdviceGiven } =
      await import('../../../conversation/advanced-humanization-integration.js');
    recordAdviceGiven(sessionId);
  } catch {
    // Non-fatal
  }
}
