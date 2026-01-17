/**
 * Conversation Dynamics Processor
 *
 * Handles advanced conversation dynamics:
 * - Narrative arc tracking (is user building to a point?)
 * - Engagement scoring (is user losing interest?)
 * - Conversation rhythm (match user's pacing)
 * - Silence decisions (when to use meaningful pauses)
 */

import {
  getConversationRhythmTracker,
  getEngagementScorer,
  getNarrativeArcTracker,
  getSilencePresenceEngine,
} from '../../conversation/index.js';
import type { TurnAnalysisResult, TurnContext } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result from processing conversation dynamics
 */
export interface ConversationDynamicsResult {
  narrativeArc?: {
    structure: string;
    climaxApproaching: boolean;
    hasReachedCore: boolean;
    suggestedIntervention: string;
    interventionGuidance: string;
  };
  engagement?: {
    level: string;
    score: number;
    declining: boolean;
    suggestedAction: string;
    actionGuidance: string;
  };
  rhythm?: {
    lengthMultiplier: number;
    rateMultiplier: number;
    energyLevel: string;
    guidance: string;
  };
  silence?: {
    useSilence: boolean;
    reason: string;
    duration: number;
    ssml: string;
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Process advanced conversation dynamics
 */
export function processConversationDynamics(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult,
  emotionalState: { primary: string; intensity: number; distressLevel: number }
): ConversationDynamicsResult {
  const { userText, userData, services } = ctx;
  const { analysis, currentTopic } = analysisResult;
  const result: ConversationDynamicsResult = {};

  // 1. NARRATIVE ARC TRACKING
  // Detect if user is building to a point, meandering, or has reached their core message
  try {
    const narrativeTracker = getNarrativeArcTracker(services.sessionId);
    const narrativeResult = narrativeTracker.analyzeUtterance({
      text: userText,
      turn: userData.turnCount || 0,
      emotion: emotionalState.primary,
      emotionalIntensity: emotionalState.intensity,
    });

    result.narrativeArc = {
      structure: narrativeResult.structure,
      climaxApproaching: narrativeResult.climaxApproaching,
      hasReachedCore: narrativeResult.hasReachedCore,
      suggestedIntervention: narrativeResult.suggestedIntervention,
      interventionGuidance: narrativeResult.interventionGuidance,
    };

    if (narrativeResult.climaxApproaching || narrativeResult.hasReachedCore) {
      ctx.logger.debug(
        { structure: narrativeResult.structure, climax: narrativeResult.climaxApproaching },
        '📖 Narrative moment detected'
      );
    }
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Narrative arc tracking failed (non-fatal)');
  }

  // 2. ENGAGEMENT SCORING
  // Track if user is engaged or losing interest
  try {
    const engagementScorer = getEngagementScorer(services.sessionId);
    const engagementResult = engagementScorer.recordResponse(userText, {
      currentTopic,
    });

    result.engagement = {
      level: engagementResult.level,
      score: engagementResult.score,
      declining: engagementResult.declining,
      suggestedAction: engagementResult.suggestedAction,
      actionGuidance: engagementResult.actionGuidance,
    };

    if (engagementResult.level === 'low' || engagementResult.level === 'distracted') {
      ctx.logger.debug(
        { level: engagementResult.level, action: engagementResult.suggestedAction },
        '👀 Low engagement detected'
      );
    }
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Engagement scoring failed (non-fatal)');
  }

  // 3. CONVERSATION RHYTHM TRACKING
  // Match user's pacing and energy
  try {
    const rhythmTracker = getConversationRhythmTracker();
    rhythmTracker.recordUserTurn({
      text: userText,
      emotionIntensity: emotionalState.intensity,
    });

    const rhythmGuidance = rhythmTracker.getRhythmGuidance();

    result.rhythm = {
      lengthMultiplier: rhythmGuidance.lengthMultiplier,
      rateMultiplier: rhythmGuidance.rateMultiplier,
      energyLevel: rhythmGuidance.energyLevel,
      guidance: rhythmGuidance.guidance,
    };
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Rhythm tracking failed (non-fatal)');
  }

  // 4. SILENCE DECISION
  // Determine if a meaningful silence is appropriate
  try {
    const silenceEngine = getSilencePresenceEngine();
    const conversationDepth =
      emotionalState.distressLevel > 0.6
        ? ('deep' as const)
        : emotionalState.intensity > 0.5
          ? ('medium' as const)
          : ('surface' as const);

    const topicWeight =
      emotionalState.distressLevel > 0.6
        ? ('heavy' as const)
        : emotionalState.distressLevel > 0.3
          ? ('medium' as const)
          : ('light' as const);

    const silenceDecision = silenceEngine.decideSilence({
      userMessage: userText,
      userEmotion: emotionalState.primary,
      turnCount: userData.turnCount || 0,
      wasPersonalSharing: analysis.state.userNeedsSupport || false,
      conversationDepth,
      topicWeight,
    });

    if (silenceDecision.useSilence) {
      result.silence = {
        useSilence: silenceDecision.useSilence,
        reason: silenceDecision.reason,
        duration: silenceDecision.duration,
        ssml: silenceDecision.ssml,
      };

      ctx.logger.debug(
        { reason: silenceDecision.reason, duration: silenceDecision.duration },
        '🤫 Meaningful silence decided'
      );
    }
  } catch (err) {
    ctx.logger.warn({ error: String(err) }, 'Silence decision failed (non-fatal)');
  }

  return result;
}
