/**
 * Joel Dickson: Superhuman Memory → Personality Integration
 *
 * Same as Ferni's integration but scoped to Joel: dates, growth, absences,
 * inside jokes (Joel-voiced), and comfort. Uses shared memory-personality bridge.
 *
 * @module personas/bundles/joel-dickson/superhuman-memory-integration
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
  type ComfortGuidance,
} from '../../../intelligence/superhuman-memory.js';
import {
  memoryPersonalityBridge,
  createCallbackFromInsight,
  createAbsenceCallback,
  createGrowthCallback,
  createComfortCallback,
  type MemoryCallback,
} from '../../shared/memory-personality-bridge.js';

const log = createLogger({ module: 'joel-superhuman-memory-integration' });

// ============================================================================
// CONFIG (Joel-appropriate defaults)
// ============================================================================

export interface JoelMemoryIntegrationConfig {
  maxCallbacksPerCategory: number;
  dateHorizonDays: number;
  topicAbsenceMinDays: number;
  enabledTypes: {
    dates: boolean;
    growth: boolean;
    absences: boolean;
    insideJokes: boolean;
    comfort: boolean;
  };
}

const DEFAULT_CONFIG: JoelMemoryIntegrationConfig = {
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
// MAIN
// ============================================================================

/**
 * Initialize Joel memory callbacks from superhuman memory at session start.
 */
export async function initializeMemoryCallbacks(
  userId: string,
  humanMemory: Partial<HumanMemory> | undefined,
  currentEmotion?: string,
  config: Partial<JoelMemoryIntegrationConfig> = {}
): Promise<{
  callbacksQueued: number;
  comfortGuidance: ComfortGuidance | null;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let callbacksQueued = 0;

  if (!humanMemory) {
    log.debug({ userId }, 'No human memory available for Joel callbacks');
    return { callbacksQueued: 0, comfortGuidance: null };
  }

  memoryPersonalityBridge.clear(userId);

  if (cfg.enabledTypes.dates) {
    const dateInsights = checkUpcomingDates(humanMemory, cfg.dateHorizonDays);
    for (const insight of dateInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      if (!wasRecentlyDelivered(insight.id)) {
        memoryPersonalityBridge.add(userId, createCallbackFromInsight(insight));
        callbacksQueued++;
      }
    }
  }

  if (cfg.enabledTypes.growth) {
    const growthInsights = findCelebratableGrowth(humanMemory);
    for (const insight of growthInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      if (!wasRecentlyDelivered(insight.id)) {
        memoryPersonalityBridge.add(userId, createCallbackFromInsight(insight));
        callbacksQueued++;
      }
    }
  }

  if (cfg.enabledTypes.absences) {
    const absenceInsights = detectTopicAbsences(humanMemory, [], 1);
    for (const insight of absenceInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      const callback = createAbsenceCallback(insight.topic, insight.lastMentioned);
      const insightId = `absence-${insight.topic}`;
      if (!wasRecentlyDelivered(insightId)) {
        memoryPersonalityBridge.add(userId, callback);
        callbacksQueued++;
      }
    }
  }

  if (cfg.enabledTypes.insideJokes) {
    const jokeInsights = findSurfaceableJokes(humanMemory, 'joel-dickson');
    for (const insight of jokeInsights.slice(0, cfg.maxCallbacksPerCategory)) {
      if (!wasRecentlyDelivered(insight.id)) {
        memoryPersonalityBridge.add(userId, createCallbackFromInsight(insight));
        callbacksQueued++;
      }
    }
  }

  let comfortGuidance: ComfortGuidance | null = null;
  if (cfg.enabledTypes.comfort && currentEmotion) {
    const stressLevel = estimateStressLevel(currentEmotion);
    if (stressLevel > 0.2) {
      comfortGuidance = getComfortGuidance(humanMemory, currentEmotion, stressLevel);
      if (comfortGuidance.supportType && comfortGuidance.promptInjection) {
        memoryPersonalityBridge.add(
          userId,
          createComfortCallback(comfortGuidance.promptInjection, `user feeling ${currentEmotion}`)
        );
        callbacksQueued++;
      }
    }
  }

  log.info(
    { userId, callbacksQueued, hasComfort: !!comfortGuidance },
    'Joel memory callbacks initialized'
  );

  return { callbacksQueued, comfortGuidance };
}

export function markMemoryCallbackDelivered(userId: string, callback: MemoryCallback): void {
  memoryPersonalityBridge.markDelivered(userId, callback);
  if (callback.sourceId) {
    markInsightDelivered(callback.sourceId);
  }
}

export function getSuperhumanContextForPrompt(
  userProfile: { humanMemory?: Partial<HumanMemory> } | null,
  options: { detectedEmotion?: string; currentTopic?: string } = {}
): string {
  const context = buildSuperhumanContext(userProfile as unknown as null, {
    detectedEmotion: options.detectedEmotion,
    currentTopic: options.currentTopic,
  });
  return context.promptInjection || '';
}

export function shouldSurfaceMemoryNow(
  userId: string,
  turnCount: number,
  timing: MemoryCallback['timing'],
  currentMood?: string
): boolean {
  if (turnCount === 1) return timing === 'greeting';
  const callback = memoryPersonalityBridge.getBest(userId, timing, currentMood);
  return callback !== null;
}

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
  const lower = emotion.toLowerCase();
  for (const [key, value] of Object.entries(stressEmotions)) {
    if (lower.includes(key)) return value;
  }
  return 0;
}

export const joelSuperhumanMemoryIntegration = {
  initialize: initializeMemoryCallbacks,
  markDelivered: markMemoryCallbackDelivered,
  getContext: getSuperhumanContextForPrompt,
  shouldSurface: shouldSurfaceMemoryNow,
  estimateStress: estimateStressLevel,
};

export default joelSuperhumanMemoryIntegration;
