/**
 * Safety & Coaching Injection Builders
 *
 * Handles safety checks, scientific coaching, and life coaching injections.
 * Safety is the highest priority (98-99), coaching follows (65-95).
 */

import {
  EMOTION_THRESHOLDS,
  DISTRESS_NEGATIVE_SENTIMENT,
  ENERGY_HIGH_INTENSITY,
  ENERGY_LOW_INTENSITY,
  DEEP_MOMENT_DISTRESS,
  DEEP_MOMENT_INTENSITY,
} from '../../../config/emotion-thresholds.js';
import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';
import {
  mapToLegacyPhase,
  updateSessionDynamics,
} from '../../integrations/session-dynamics-integration.js';

// Static imports for performance (TIER 1-2)
import { performSafetyCheck } from '../../../services/safety/index.js';
import { buildScientificCoachingContext } from '../../../intelligence/context-builders/coaching/scientific-coaching.js';
import { getCoachingContextForLLM, analyzeForCoaching } from '../../../services/coaching/index.js';

import type { InjectionBuilderContext, ScientificCoachingInjectionResult } from './types.js';

// ============================================================================
// COACHING PERSONA MAP
// ============================================================================

/** Persona mapping for coaching module - uses canonical IDs */
const COACHING_PERSONA_MAP: Record<
  string,
  'ferni' | 'maya-santos' | 'alex-chen' | 'peter-john' | 'jordan-taylor' | 'nayan-patel' | 'joel-dickson'
> = {
  ferni: 'ferni',
  'maya-santos': 'maya-santos',
  'alex-chen': 'alex-chen',
  'peter-john': 'peter-john',
  'jordan-taylor': 'jordan-taylor',
  'nayan-patel': 'nayan-patel',
  'joel-dickson': 'joel-dickson',
  // Legacy aliases
  maya: 'maya-santos',
  alex: 'alex-chen',
  peter: 'peter-john',
  jordan: 'jordan-taylor',
  nayan: 'nayan-patel',
  joel: 'joel-dickson',
};

// ============================================================================
// SAFETY INJECTION BUILDER
// Priority: 98-99 (highest - safety first)
// ============================================================================

/**
 * Build safety-related context injections (crisis detection)
 * User safety is non-negotiable - check for crisis signals before anything else.
 */
export async function buildSafetyInjections(
  ctx: InjectionBuilderContext
): Promise<ContextInjection[]> {
  const { userText, services, userData, persona } = ctx;
  const injections: ContextInjection[] = [];

  try {
    // Map relationship stage to safety module's expected values
    const relationshipMap: Record<string, 'new' | 'building' | 'established' | 'deep'> = {
      stranger: 'new',
      acquaintance: 'building',
      friend: 'established',
      trusted_advisor: 'deep',
      building: 'building',
    };
    const safetyRelationship =
      relationshipMap[userData.relationshipStage || 'building'] || 'building';

    const safetyResult = performSafetyCheck(userText, {
      userId: services.userId || 'unknown',
      personaId: persona.id,
      relationshipStage: safetyRelationship,
      userName: services.userProfile?.name,
    });

    if (safetyResult.crisisDetected) {
      diag.warn('🛡️ Crisis signal detected', {
        type: safetyResult.detection.primary?.type,
        severity: safetyResult.detection.primary?.severity,
        requiresAction: safetyResult.shouldInterrupt,
      });

      // Add crisis context at highest priority
      if (safetyResult.contextInjection) {
        injections.push({
          category: 'safety',
          content: safetyResult.contextInjection,
          priority: 99,
        });
      }

      // If crisis response is generated, add it
      if (safetyResult.response) {
        const resourceName = safetyResult.response.primaryResource?.name || 'professional support';
        injections.push({
          category: 'crisis_response',
          content: `[CRISIS SUPPORT]\nValidate first: "${safetyResult.response.validation}"\nResource if appropriate: ${resourceName}`,
          priority: 98,
        });
      }
    }
  } catch (safetyError) {
    diag.error('Safety check failed (CRITICAL)', { error: String(safetyError) });
  }

  return injections;
}

// ============================================================================
// SCIENTIFIC COACHING INJECTION BUILDER
// Priority: 65-95 (varies by urgency)
// ============================================================================

/**
 * Build scientific coaching context injections
 * Includes: cognitive distortions, wellbeing, nudges, wisdom
 */
export async function buildScientificCoachingInjections(
  ctx: InjectionBuilderContext
): Promise<ScientificCoachingInjectionResult> {
  const { userText, services, userData, persona, currentTopic, emotionalState, sessionId } = ctx;
  const injections: ContextInjection[] = [];
  let endpointingRecommendation: { minDelay: number; maxDelay: number } | undefined;

  try {
    // Use SessionDynamicsEngine for accurate phase detection
    let conversationPhase: 'opening' | 'exploring' | 'supporting' | 'closing' = 'exploring';
    if (sessionId) {
      // Update dynamics and get current phase
      const dynamicsResult = updateSessionDynamics({
        sessionId,
        turnCount: userData.turnCount || 1,
        userEnergy:
          emotionalState.intensity > ENERGY_HIGH_INTENSITY
            ? 'high'
            : emotionalState.intensity < ENERGY_LOW_INTENSITY
              ? 'low'
              : 'medium',
        topicWeight:
          emotionalState.distressLevel > DISTRESS_NEGATIVE_SENTIMENT
            ? 'heavy'
            : emotionalState.intensity < (EMOTION_THRESHOLDS.baseline.concern + 0.2)
              ? 'light'
              : 'medium',
        wasDeepMoment:
          emotionalState.distressLevel > DEEP_MOMENT_DISTRESS ||
          emotionalState.intensity > DEEP_MOMENT_INTENSITY,
      });
      conversationPhase = mapToLegacyPhase(dynamicsResult.phase);
    } else {
      // Fallback to simple heuristic
      conversationPhase =
        userData.turnCount && userData.turnCount < 3
          ? 'opening'
          : userData.turnCount && userData.turnCount > 10
            ? 'closing'
            : 'exploring';
    }

    const result = await buildScientificCoachingContext({
      userId: services.userId || 'unknown',
      userMessage: userText,
      personaId: persona.id,
      topic: currentTopic,
      emotionalState: emotionalState.primary,
      emotionalIntensity: emotionalState.intensity,
      conversationPhase,
      turnNumber: userData.turnCount || 1,
    });

    // Add scientific coaching injections
    for (const injection of result.injections) {
      const priorityMap: Record<string, number> = {
        critical: 95,
        high: 85,
        standard: 75,
        hint: 65,
      };
      injections.push({
        category: `scientific_${injection.source}`,
        content: injection.content,
        priority: priorityMap[injection.priority] || 70,
      });
    }

    // Log detections
    if (result.detectedDistortions.length > 0) {
      diag.info('🧠 Cognitive distortions detected', {
        distortions: result.detectedDistortions,
      });
    }
    if (result.warnings.length > 0) {
      diag.warn('⚠️ Early warnings detected', { warnings: result.warnings });
    }

    // Store endpointing recommendation
    if (result.endpointingRecommendation) {
      endpointingRecommendation = {
        minDelay: result.endpointingRecommendation.minDelay,
        maxDelay: result.endpointingRecommendation.maxDelay,
      };
    }
  } catch (error) {
    diag.warn('Scientific coaching context failed (non-fatal)', { error: String(error) });
  }

  return { injections, endpointingRecommendation };
}

// ============================================================================
// LIFE COACHING INJECTION BUILDER
// Priority: 68-72
// ============================================================================

/**
 * Build life coaching context injections
 * Includes: goals, actions, obstacles, values, style
 */
export async function buildLifeCoachingInjections(
  ctx: InjectionBuilderContext
): Promise<ContextInjection[]> {
  const { userText, services, persona } = ctx;
  const injections: ContextInjection[] = [];

  try {
    const coachingPersona = COACHING_PERSONA_MAP[persona.id] || 'ferni';

    // Analyze user message for coaching opportunities
    const coachingAnalysis = analyzeForCoaching(services.userId || 'unknown', userText, {
      currentPersona: coachingPersona,
    });

    // Log coaching opportunities
    if (coachingAnalysis.hasGoalStatement) {
      diag.info('🎯 Goal statement detected', {
        goal: coachingAnalysis.goalText,
        domain: coachingAnalysis.domain,
      });
    }
    if (coachingAnalysis.hasObstacle) {
      diag.debug('🚧 Obstacle detected', { type: coachingAnalysis.obstacleType });
    }
    if (coachingAnalysis.suggestedHandoff) {
      diag.debug('🤝 Handoff suggested', { target: coachingAnalysis.handoffTarget });
    }

    // Get comprehensive coaching context for LLM
    const coachingContext = getCoachingContextForLLM(services.userId || 'unknown', {
      currentPersona: coachingPersona,
      userMessage: userText,
    });

    if (coachingContext) {
      injections.push({
        category: 'coaching',
        content: coachingContext,
        priority: 72,
      });
    }

    // If user has vague emotions, add granularity expansion prompt
    if (coachingAnalysis.hasVagueEmotion && coachingAnalysis.emotionExpansion) {
      injections.push({
        category: 'emotional_granularity',
        content: `[EMOTIONAL DEPTH] User used vague emotion language. Consider gently expanding: "${coachingAnalysis.emotionExpansion}"`,
        priority: 68,
      });
    }
  } catch (error) {
    diag.warn('Coaching context failed (non-fatal)', { error: String(error) });
  }

  return injections;
}
