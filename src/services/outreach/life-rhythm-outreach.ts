/**
 * Life Rhythm Outreach Integration
 *
 * > "Better than human" - We remember your patterns and reach out BEFORE you struggle
 *
 * Connects the deep understanding life rhythm prediction system to proactive outreach.
 * This enables Ferni to anticipate when users need support based on learned patterns:
 *
 * - Weekly patterns (Monday blues, Sunday scaries)
 * - Monthly patterns (end-of-month stress, pay cycle)
 * - Seasonal patterns (SAD, holiday stress)
 * - Personal anniversaries and significant dates
 *
 * @module services/outreach/life-rhythm-outreach
 */

import { createLogger } from '../../utils/safe-logger.js';
import { predictUserState, type RhythmPrediction } from '../../intelligence/life-rhythm-prediction.js';
import { getOutreachDecisionEngine } from './decision-engine.js';
import type { AgentId } from '../agent-bus.js';

const log = createLogger({ module: 'LifeRhythmOutreach' });

// ============================================================================
// TYPES
// ============================================================================

export interface LifeRhythmOutreachConfig {
  /** Minimum confidence for triggering outreach */
  minConfidence: number;
  /** Minimum hours since last outreach */
  minHoursBetweenOutreach: number;
  /** Maximum outreach per user per day */
  maxPerDay: number;
  /** Enable/disable feature */
  enabled: boolean;
}

export interface LifeRhythmOutreachResult {
  triggered: boolean;
  prediction: RhythmPrediction | null;
  reason?: string;
  suggestedTime?: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: LifeRhythmOutreachConfig = {
  minConfidence: 0.6,
  minHoursBetweenOutreach: 24,
  maxPerDay: 1,
  enabled: true,
};

// Track last outreach times per user
const lastOutreachTimes = new Map<string, Date>();
const dailyOutreachCounts = new Map<string, { date: string; count: number }>();

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Evaluate if a user should receive a life rhythm-based outreach
 *
 * @param userId - User to evaluate
 * @param config - Optional config overrides
 * @returns Result with whether to trigger and the prediction
 */
export function evaluateLifeRhythmOutreach(
  userId: string,
  config: Partial<LifeRhythmOutreachConfig> = {}
): LifeRhythmOutreachResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    return { triggered: false, prediction: null, reason: 'Feature disabled' };
  }

  // Get prediction from life rhythm system
  const prediction = predictUserState(userId);

  if (!prediction) {
    return { triggered: false, prediction: null, reason: 'No prediction available' };
  }

  // Check confidence threshold
  if (prediction.confidence < cfg.minConfidence) {
    return {
      triggered: false,
      prediction,
      reason: `Confidence ${prediction.confidence.toFixed(2)} below threshold ${cfg.minConfidence}`,
    };
  }

  // Check if we predict a difficult time
  const isLowMood = prediction.prediction.likelyMood === 'low';
  const isLowEnergy = prediction.prediction.likelyEnergy === 'depleted';
  const needsProactiveSupport = prediction.prediction.supportNeed === 'proactive';
  const hasStressFactors = prediction.reasons.some(
    (r) =>
      r.toLowerCase().includes('stress') ||
      r.toLowerCase().includes('difficult') ||
      r.toLowerCase().includes('hard')
  );

  if (!isLowMood && !isLowEnergy && !needsProactiveSupport && !hasStressFactors) {
    return {
      triggered: false,
      prediction,
      reason: 'No predicted difficulty',
    };
  }

  // Rate limiting - check last outreach time
  const lastOutreach = lastOutreachTimes.get(userId);
  const now = new Date();
  if (lastOutreach) {
    const hoursSince = (now.getTime() - lastOutreach.getTime()) / (1000 * 60 * 60);
    if (hoursSince < cfg.minHoursBetweenOutreach) {
      return {
        triggered: false,
        prediction,
        reason: `Too soon since last outreach (${hoursSince.toFixed(1)}h < ${cfg.minHoursBetweenOutreach}h)`,
      };
    }
  }

  // Rate limiting - check daily count
  const today = now.toDateString();
  const dailyCount = dailyOutreachCounts.get(userId);
  if (dailyCount && dailyCount.date === today && dailyCount.count >= cfg.maxPerDay) {
    return {
      triggered: false,
      prediction,
      reason: `Daily limit reached (${dailyCount.count}/${cfg.maxPerDay})`,
    };
  }

  // All checks passed - trigger outreach
  return {
    triggered: true,
    prediction,
    suggestedTime: prediction.approach.bestTime || now,
  };
}

/**
 * Trigger a life rhythm-based outreach for a user
 *
 * @param userId - User to reach out to
 * @param prediction - The rhythm prediction
 * @param personaId - Which persona should reach out (default: ferni)
 */
export async function triggerLifeRhythmOutreach(
  userId: string,
  prediction: RhythmPrediction,
  personaId: AgentId = 'ferni'
): Promise<boolean> {
  try {
    const engine = getOutreachDecisionEngine();

    // Build context-aware reason
    const reasons = prediction.reasons.slice(0, 2).join(' and ');
    const reason = reasons || 'Predicted you might need some support';

    // Create the trigger
    engine.addTrigger({
      type: 'life_rhythm_prediction',
      userId,
      priority: prediction.confidence > 0.8 ? 'high' : 'medium',
      reason: `🌊 ${reason}`,
      context: {
        predictedMood: prediction.prediction.likelyMood,
        predictedEnergy: prediction.prediction.likelyEnergy,
        supportNeed: prediction.prediction.supportNeed,
        confidence: prediction.confidence,
        factors: prediction.reasons,
      },
      suggestedTime: prediction.approach.bestTime || undefined,
      suggestedPersona: personaId,
    });

    // Update tracking
    const now = new Date();
    lastOutreachTimes.set(userId, now);

    const today = now.toDateString();
    const dailyCount = dailyOutreachCounts.get(userId);
    if (dailyCount && dailyCount.date === today) {
      dailyCount.count++;
    } else {
      dailyOutreachCounts.set(userId, { date: today, count: 1 });
    }

    log.info(
      {
        userId,
        reason,
        predictedMood: prediction.prediction.likelyMood,
        confidence: prediction.confidence,
      },
      '🌊 Life rhythm outreach triggered'
    );

    return true;
  } catch (error) {
    log.error({ error, userId }, 'Failed to trigger life rhythm outreach');
    return false;
  }
}

/**
 * Generate an empathetic message based on life rhythm prediction
 *
 * @param prediction - The rhythm prediction
 * @returns A warm, human message
 */
export function generateLifeRhythmMessage(prediction: RhythmPrediction): string {
  const primaryReason = prediction.reasons[0] || '';

  // Pattern-specific messages
  if (primaryReason.toLowerCase().includes('monday')) {
    return "Hey! I know Mondays can be rough - just wanted to check in and see how you're doing. No agenda, just here if you want to chat. 💚";
  }

  if (primaryReason.toLowerCase().includes('sunday')) {
    return "Sunday evening check-in! I noticed these times can feel a bit heavy. How are you feeling about the week ahead? 💚";
  }

  if (primaryReason.toLowerCase().includes('end of month') || primaryReason.toLowerCase().includes('month end')) {
    return "End of month energy! I know this time can bring some stress. Just wanted to reach out and see how you're holding up. 💚";
  }

  if (primaryReason.toLowerCase().includes('winter') || primaryReason.toLowerCase().includes('seasonal')) {
    return "Hey there! With the shorter days, I wanted to check in. How's your energy been lately? I'm here if you need someone to talk to. 💚";
  }

  if (primaryReason.toLowerCase().includes('anniversary')) {
    return "I've been thinking about you. This time of year has been meaningful in our conversations. How are you doing? 💚";
  }

  // Default empathetic message
  if (prediction.prediction.likelyMood === 'low') {
    return "Hey, I wanted to reach out. Something told me you might appreciate a friendly check-in today. No pressure to chat - just know I'm here. 💚";
  }

  if (prediction.prediction.likelyEnergy === 'depleted') {
    return "Just checking in! I sensed you might be running on low battery today. Remember, it's okay to take things slow. I'm here whenever you're ready to talk. 💚";
  }

  return "Hey! Just wanted to say hi and see how you're doing today. I've been thinking about you. 💚";
}

/**
 * Run life rhythm outreach evaluation for all registered users
 * Called by the daily outreach job
 *
 * @param getUserIds - Function to get active user IDs
 * @returns Number of outreach triggers created
 */
export async function runDailyLifeRhythmOutreach(
  getUserIds: () => Promise<string[]>
): Promise<{ processed: number; triggered: number }> {
  const userIds = await getUserIds();
  let processed = 0;
  let triggered = 0;

  for (const userId of userIds) {
    try {
      const result = evaluateLifeRhythmOutreach(userId);
      processed++;

      if (result.triggered && result.prediction) {
        const success = await triggerLifeRhythmOutreach(userId, result.prediction);
        if (success) {
          triggered++;
        }
      }
    } catch (error) {
      log.warn({ error, userId }, 'Error processing user for life rhythm outreach');
    }
  }

  log.info(
    { processed, triggered },
    '🌊 Daily life rhythm outreach completed'
  );

  return { processed, triggered };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  evaluateLifeRhythmOutreach,
  triggerLifeRhythmOutreach,
  generateLifeRhythmMessage,
  runDailyLifeRhythmOutreach,
};

