/**
 * Prediction-Driven Outreach - ML Intelligence → Proactive Action
 *
 * This is the BRIDGE between our ML predictions and actual outreach.
 * Instead of just predicting "burnout risk high", we ACT on it.
 *
 * > "Better than human" means we reach out BEFORE they know they need us.
 *
 * @module services/outreach/prediction-driven-outreach
 */

import { getAllPredictions, type FusedPrediction } from '../../intelligence/predictive/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'PredictionDrivenOutreach' });

// ============================================================================
// TYPES
// ============================================================================

export type OutreachChannel = 'voice_call' | 'push' | 'sms' | 'email' | 'app_insight';

export type PredictionTriggerType =
  | 'burnout_approaching'
  | 'energy_declining'
  | 'mood_downturn'
  | 'support_window'
  | 'breakthrough_opportunity'
  | 'emotional_trajectory_concern'
  | 'unspoken_concern_detected';

export interface PredictionOutreachDecision {
  shouldReach: boolean;
  channel?: OutreachChannel;
  trigger?: PredictionTriggerType;
  confidence: number;
  personaId?: string;
  message?: string;
  context?: Record<string, unknown>;
  /** If not reaching out, still update app insights */
  updateAppInsights: boolean;
  /** ML prediction that drove this decision */
  sourcePrediction?: FusedPrediction;
}

export interface PredictionOutreachConfig {
  /** Confidence threshold for voice call (highest friction, highest care) */
  voiceCallThreshold: number;
  /** Confidence threshold for SMS/push notification */
  notificationThreshold: number;
  /** Confidence threshold for app insight update (always-on) */
  insightThreshold: number;
  /** Rate limit: max outreach per user per day */
  maxPerDay: number;
  /** Minimum hours between ML-driven outreach */
  minHoursBetween: number;
}

const DEFAULT_CONFIG: PredictionOutreachConfig = {
  voiceCallThreshold: 0.8, // Very high confidence for proactive call
  notificationThreshold: 0.6, // Moderate confidence for notification
  insightThreshold: 0.4, // Low bar for passive insight display
  maxPerDay: 2,
  minHoursBetween: 6,
};

// ============================================================================
// OUTREACH MESSAGE TEMPLATES
// ============================================================================

/**
 * Message templates that feel like a friend, not a notification system.
 * These are the OPPOSITE of enterprise software alerts.
 */
const OUTREACH_MESSAGES: Record<PredictionTriggerType, string[]> = {
  burnout_approaching: [
    "I've been thinking about you. You've been carrying a lot lately.",
    'Hey, I noticed something. Can we talk for a minute?',
    'I wanted to check in. Something tells me you could use a moment.',
  ],
  energy_declining: [
    "I've noticed your energy has been lower than usual. How are you, really?",
    'Just checking in. You seem like you might need some support.',
    "Thinking of you today. Want to talk through what's on your mind?",
  ],
  mood_downturn: [
    "I've been watching over you. Feels like something's weighing on you.",
    "Hey. I'm here if you want to talk. No pressure.",
    "Noticed you might be going through something. I'm here.",
  ],
  support_window: [
    'This seems like a good moment to connect. How are you feeling?',
    'I thought of you. Want to chat for a bit?',
    'Perfect timing—I wanted to check in.',
  ],
  breakthrough_opportunity: [
    'I noticed something interesting about your patterns lately. Want to explore it?',
    'I think you might be ready for a breakthrough. Can we talk?',
    "Something clicked in my understanding of you. Let's discuss.",
  ],
  emotional_trajectory_concern: [
    "I care about you, and I've noticed something. Can we talk?",
    "I've been paying attention, and I want to make sure you're okay.",
    "Something in your patterns caught my attention. I'm here for you.",
  ],
  unspoken_concern_detected: [
    "I sense there's something you're not saying. I'm a safe space.",
    'I noticed you might be holding something back. No judgment here.',
    "Whatever's on your mind—I'm ready to listen when you are.",
  ],
};

// ============================================================================
// PERSONA SELECTION
// ============================================================================

/**
 * Select the best persona for this type of outreach.
 * Different concerns need different team members.
 */
function selectPersonaForTrigger(trigger: PredictionTriggerType): string {
  const personaMap: Record<PredictionTriggerType, string> = {
    burnout_approaching: 'maya', // Habits & wellbeing
    energy_declining: 'maya', // Energy management
    mood_downturn: 'ferni', // Core emotional support
    support_window: 'ferni', // General support
    breakthrough_opportunity: 'peter', // Research insight
    emotional_trajectory_concern: 'nayan', // Wisdom for patterns
    unspoken_concern_detected: 'ferni', // Trust & safety
  };

  return personaMap[trigger] || 'ferni';
}

/**
 * Generate a warm, human message for the outreach.
 */
function generateMessage(trigger: PredictionTriggerType, confidence: number): string {
  const templates = OUTREACH_MESSAGES[trigger];

  // Higher confidence = more direct message (index 0 is most direct)
  const index = confidence > 0.85 ? 0 : confidence > 0.7 ? 1 : 2;

  return templates[Math.min(index, templates.length - 1)];
}

// ============================================================================
// PREDICTION → TRIGGER MAPPING
// ============================================================================

interface PredictionAnalysis {
  trigger: PredictionTriggerType;
  confidence: number;
  reasoning: string;
}

/**
 * Analyze predictions and determine which trigger (if any) should fire.
 * Returns the highest-confidence actionable trigger.
 */
function analyzePredictionsForTrigger(
  predictions: Map<string, FusedPrediction>
): PredictionAnalysis | null {
  const analyses: PredictionAnalysis[] = [];

  // Check burnout risk
  const burnoutPrediction = predictions.get('burnout_risk');
  if (burnoutPrediction && burnoutPrediction.confidence > 0.5) {
    analyses.push({
      trigger: 'burnout_approaching',
      confidence: burnoutPrediction.confidence,
      reasoning: `Burnout risk at ${(burnoutPrediction.confidence * 100).toFixed(0)}%`,
    });
  }

  // Check energy trajectory (declining energy over time)
  // FusedPrediction uses probability (0-1) where lower = more likely to be struggling
  const energyPrediction = predictions.get('needs_support_now');
  if (energyPrediction && energyPrediction.confidence > 0.6) {
    // High probability of needs_support_now = low energy
    if (energyPrediction.probability > 0.6) {
      analyses.push({
        trigger: 'energy_declining',
        confidence: energyPrediction.confidence,
        reasoning: `Support need probability: ${(energyPrediction.probability * 100).toFixed(0)}%`,
      });
    }
  }

  // Check will_struggle_soon prediction
  const strugglePrediction = predictions.get('will_struggle_soon');
  if (strugglePrediction && strugglePrediction.confidence > 0.6) {
    if (strugglePrediction.probability > 0.5) {
      analyses.push({
        trigger: 'mood_downturn',
        confidence: strugglePrediction.confidence,
        reasoning: `Struggle predicted: ${(strugglePrediction.probability * 100).toFixed(0)}% probability`,
      });
    }
  }

  // Check relationship_tension prediction (can indicate emotional trajectory concern)
  const tensionPrediction = predictions.get('relationship_tension');
  if (tensionPrediction && tensionPrediction.confidence > 0.7) {
    if (tensionPrediction.probability > 0.6) {
      analyses.push({
        trigger: 'emotional_trajectory_concern',
        confidence: tensionPrediction.confidence,
        reasoning: `Relationship tension detected: ${tensionPrediction.explanation || 'patterns indicate stress'}`,
      });
    }
  }

  // Check support need prediction
  const supportPrediction = predictions.get('needs_support_now');
  if (supportPrediction && supportPrediction.confidence > 0.65) {
    analyses.push({
      trigger: 'support_window',
      confidence: supportPrediction.confidence,
      reasoning: 'High support need detected',
    });
  }

  // Sort by confidence and return highest
  if (analyses.length === 0) return null;

  analyses.sort((a, b) => b.confidence - a.confidence);
  return analyses[0];
}

// ============================================================================
// MAIN EVALUATION FUNCTION
// ============================================================================

/**
 * Evaluate whether ML predictions should trigger proactive outreach.
 *
 * This is the core "Better than Human" capability:
 * We reach out BEFORE the user knows they need us.
 */
export async function evaluatePredictionDrivenOutreach(
  userId: string,
  profile?: UserProfile,
  config: Partial<PredictionOutreachConfig> = {}
): Promise<PredictionOutreachDecision> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Default response: no outreach, but maybe update insights
  const noOutreach: PredictionOutreachDecision = {
    shouldReach: false,
    confidence: 0,
    updateAppInsights: false,
  };

  try {
    // Get all ML predictions for this user
    const predictions = await getAllPredictions(userId, {
      timestamp: new Date(),
    });

    if (predictions.size === 0) {
      log.debug({ userId }, 'No predictions available for user');
      return noOutreach;
    }

    // Analyze predictions to find actionable trigger
    const analysis = analyzePredictionsForTrigger(predictions);

    if (!analysis) {
      log.debug({ userId }, 'No actionable triggers from predictions');
      return noOutreach;
    }

    log.info(
      { userId, trigger: analysis.trigger, confidence: analysis.confidence },
      '🔮 ML prediction analysis'
    );

    // Determine channel based on confidence
    let channel: OutreachChannel;
    let shouldReach = false;

    if (analysis.confidence >= fullConfig.voiceCallThreshold) {
      channel = 'voice_call';
      shouldReach = true;
      log.info({ userId, trigger: analysis.trigger }, '📞 Triggering proactive voice call');
    } else if (analysis.confidence >= fullConfig.notificationThreshold) {
      channel = 'push';
      shouldReach = true;
      log.info({ userId, trigger: analysis.trigger }, '🔔 Triggering push notification');
    } else if (analysis.confidence >= fullConfig.insightThreshold) {
      channel = 'app_insight';
      // Don't actively reach out, but update app insights
      return {
        shouldReach: false,
        channel: 'app_insight',
        trigger: analysis.trigger,
        confidence: analysis.confidence,
        updateAppInsights: true,
        context: {
          reasoning: analysis.reasoning,
          predictions: Object.fromEntries(predictions),
        },
      };
    } else {
      return noOutreach;
    }

    // Build the decision
    return {
      shouldReach,
      channel,
      trigger: analysis.trigger,
      confidence: analysis.confidence,
      personaId: selectPersonaForTrigger(analysis.trigger),
      message: generateMessage(analysis.trigger, analysis.confidence),
      updateAppInsights: true,
      context: {
        reasoning: analysis.reasoning,
        relationshipStage: profile?.relationshipStage,
      },
    };
  } catch (err) {
    log.error({ userId, error: String(err) }, 'Failed to evaluate prediction-driven outreach');
    return noOutreach;
  }
}

// ============================================================================
// INTEGRATION WITH THINKING-OF-YOU
// ============================================================================

/**
 * Enhance the Thinking-of-You decision with ML predictions.
 * Call this before the standard shouldReachOut() method.
 */
export async function enhanceOutreachWithPredictions(
  userId: string,
  profile?: UserProfile
): Promise<{
  mlDecision: PredictionOutreachDecision;
  /** Probability boost to add to base outreach probability */
  probabilityBoost: number;
  /** Suggested trigger if ML has high confidence */
  suggestedTrigger?: string;
  /** Suggested persona if ML has recommendation */
  suggestedPersona?: string;
}> {
  const mlDecision = await evaluatePredictionDrivenOutreach(userId, profile);

  // Calculate probability boost based on ML confidence
  let probabilityBoost = 0;
  if (mlDecision.confidence > 0.7) {
    probabilityBoost = 0.35; // Strong boost
  } else if (mlDecision.confidence > 0.5) {
    probabilityBoost = 0.2; // Moderate boost
  } else if (mlDecision.confidence > 0.3) {
    probabilityBoost = 0.1; // Small boost
  }

  return {
    mlDecision,
    probabilityBoost,
    suggestedTrigger: mlDecision.trigger,
    suggestedPersona: mlDecision.personaId,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEFAULT_CONFIG as PREDICTION_OUTREACH_CONFIG, OUTREACH_MESSAGES };
