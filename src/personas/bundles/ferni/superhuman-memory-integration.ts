/**
 * Superhuman Memory → Personality Integration
 *
 * Bridges the superhuman memory system with the personality callback system.
 * Automatically queues memory insights as personality callbacks.
 *
 * Call this at session start to:
 * 1. Check for upcoming important dates
 * 2. Find growth to celebrate
 * 3. Detect topics the user hasn't mentioned
 * 4. Surface inside jokes at the right moment
 * 5. Apply comfort patterns when stress is detected
 *
 * @module personas/bundles/ferni/superhuman-memory-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { HumanMemory } from '../../../types/human-memory.js';
import {
  checkUpcomingDates,
  findCelebratableGrowth,
  detectTopicAbsences,
  findSurfaceableJokes,
  getComfortGuidance,
  buildSuperhumanContext,
  wasRecentlyDelivered,
  markInsightDelivered,
  type ProactiveInsight,
  type ComfortGuidance,
} from '../../../intelligence/superhuman-memory.js';
import {
  memoryPersonalityBridge,
  createCallbackFromInsight,
  createDateCallback,
  createAbsenceCallback,
  createGrowthCallback,
  createComfortCallback,
  type MemoryCallback,
} from '../../shared/memory-personality-bridge.js';

const log = createLogger({ module: 'superhuman-memory-integration' });

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryIntegrationConfig {
  /** Maximum number of callbacks to queue per category */
  maxCallbacksPerCategory: number;
  /** Check upcoming dates within this many days */
  dateHorizonDays: number;
  /** Minimum days since topic was mentioned to consider it "absent" */
  topicAbsenceMinDays: number;
  /** Enable/disable specific callback types */
  enabledTypes: {
    dates: boolean;
    growth: boolean;
    absences: boolean;
    insideJokes: boolean;
    comfort: boolean;
  };
}

const DEFAULT_CONFIG: MemoryIntegrationConfig = {
  maxCallbacksPerCategory: 3,
  dateHorizonDays: 14,
  topicAbsenceMinDays: 14,
  enabledTypes: {
    dates: true,
    growth: true,
    absences: true,
    insideJokes: true,
    comfort: true,
  },
};

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Initialize memory callbacks from superhuman memory at session start
 *
 * This scans the user's memory for proactive insights and queues them
 * as personality callbacks that can be surfaced during conversation.
 */
export async function initializeMemoryCallbacks(
  userId: string,
  humanMemory: Partial<HumanMemory> | undefined,
  currentEmotion?: string,
  config: Partial<MemoryIntegrationConfig> = {}
): Promise<{
  callbacksQueued: number;
  comfortGuidance: ComfortGuidance | null;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let callbacksQueued = 0;

  if (!humanMemory) {
    log.debug({ userId }, 'No human memory available for callbacks');
    return { callbacksQueued: 0, comfortGuidance: null };
  }

  // Clear existing callbacks for fresh start
  memoryPersonalityBridge.clear(userId);

  // =========================================================================
  // 1. UPCOMING DATES
  // =========================================================================
  if (cfg.enabledTypes.dates) {
    const dateInsights = checkUpcomingDates(humanMemory, cfg.dateHorizonDays);

    for (const insight of dateInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      if (!wasRecentlyDelivered(insight.id)) {
        const callback = createCallbackFromInsight(insight);
        memoryPersonalityBridge.add(userId, callback);
        callbacksQueued++;
        log.debug({ type: 'date', content: insight.content }, 'Queued date callback');
      }
    }
  }

  // =========================================================================
  // 2. GROWTH CELEBRATIONS
  // =========================================================================
  if (cfg.enabledTypes.growth) {
    const growthInsights = findCelebratableGrowth(humanMemory);

    for (const insight of growthInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      if (!wasRecentlyDelivered(insight.id)) {
        const callback = createCallbackFromInsight(insight);
        memoryPersonalityBridge.add(userId, callback);
        callbacksQueued++;
        log.debug({ type: 'growth', content: insight.content }, 'Queued growth callback');
      }
    }
  }

  // =========================================================================
  // 3. TOPIC ABSENCES
  // =========================================================================
  if (cfg.enabledTypes.absences) {
    // detectTopicAbsences takes (humanMemory, recentTopics[], sessionCount)
    const absenceInsights = detectTopicAbsences(humanMemory, [], 1);

    for (const insight of absenceInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      // Convert TopicAbsenceInsight to MemoryCallback
      const callback = createAbsenceCallback(insight.topic, insight.lastMentioned);
      const insightId = `absence-${insight.topic}`;

      if (!wasRecentlyDelivered(insightId)) {
        memoryPersonalityBridge.add(userId, callback);
        callbacksQueued++;
        log.debug({ type: 'absence', topic: insight.topic }, 'Queued absence callback');
      }
    }
  }

  // =========================================================================
  // 4. INSIDE JOKES
  // =========================================================================
  if (cfg.enabledTypes.insideJokes) {
    const jokeInsights = findSurfaceableJokes(humanMemory, 'ferni');

    for (const insight of jokeInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      if (!wasRecentlyDelivered(insight.id)) {
        const callback = createCallbackFromInsight(insight);
        memoryPersonalityBridge.add(userId, callback);
        callbacksQueued++;
        log.debug({ type: 'joke', content: insight.content }, 'Queued inside joke callback');
      }
    }
  }

  // =========================================================================
  // 5. COMFORT GUIDANCE
  // =========================================================================
  let comfortGuidance: ComfortGuidance | null = null;

  if (cfg.enabledTypes.comfort && currentEmotion) {
    // Estimate stress level from emotion
    const stressLevel = estimateStressLevel(currentEmotion);

    if (stressLevel > 0.2) {
      comfortGuidance = getComfortGuidance(humanMemory, currentEmotion, stressLevel);

      if (comfortGuidance.supportType && comfortGuidance.promptInjection) {
        const callback = createComfortCallback(
          comfortGuidance.promptInjection,
          `user feeling ${currentEmotion}`
        );
        memoryPersonalityBridge.add(userId, callback);
        callbacksQueued++;
        log.debug(
          { stressLevel: comfortGuidance.stressLevel, supportType: comfortGuidance.supportType },
          'Queued comfort callback'
        );
      }
    }
  }

  log.info(
    { userId, callbacksQueued, hasComfort: !!comfortGuidance },
    '🧠 Memory callbacks initialized'
  );

  return { callbacksQueued, comfortGuidance };
}

/**
 * Mark a callback as delivered in both systems
 */
export function markMemoryCallbackDelivered(userId: string, callback: MemoryCallback): void {
  memoryPersonalityBridge.markDelivered(userId, callback);

  if (callback.sourceId) {
    markInsightDelivered(callback.sourceId);
  }
}

/**
 * Get the full superhuman context for prompt injection
 */
export function getSuperhmanContextForPrompt(
  userProfile: { humanMemory?: Partial<HumanMemory> } | null,
  options: {
    detectedEmotion?: string;
    currentTopic?: string;
  } = {}
): string {
  const context = buildSuperhumanContext(userProfile as unknown as null, {
    detectedEmotion: options.detectedEmotion,
    currentTopic: options.currentTopic,
  });
  return context.promptInjection || '';
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Estimate stress level from emotion string
 */
function estimateStressLevel(emotion: string | undefined): number {
  if (!emotion) return 0;

  const stressEmotions: Record<string, number> = {
    stressed: 0.8,
    anxious: 0.7,
    overwhelmed: 0.9,
    frustrated: 0.6,
    angry: 0.5,
    sad: 0.5,
    fearful: 0.7,
    worried: 0.6,
    tense: 0.6,
    nervous: 0.5,
    upset: 0.5,
    distressed: 0.8,
    panicked: 0.95,
  };

  const lowerEmotion = emotion.toLowerCase();

  for (const [key, value] of Object.entries(stressEmotions)) {
    if (lowerEmotion.includes(key)) {
      return value;
    }
  }

  return 0;
}

/**
 * Check if we should surface a memory callback right now
 */
export function shouldSurfaceMemoryNow(
  userId: string,
  turnCount: number,
  timing: MemoryCallback['timing'],
  currentMood?: string
): boolean {
  // First turn - only greeting callbacks
  if (turnCount === 1) {
    return timing === 'greeting';
  }

  // Check if there's a suitable callback
  const callback = memoryPersonalityBridge.getBest(userId, timing, currentMood);
  return callback !== null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const superhumanMemoryIntegration = {
  initialize: initializeMemoryCallbacks,
  markDelivered: markMemoryCallbackDelivered,
  getContext: getSuperhmanContextForPrompt,
  shouldSurface: shouldSurfaceMemoryNow,
  estimateStress: estimateStressLevel,
};

export default superhumanMemoryIntegration;
