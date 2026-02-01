/**
 * Emotional Trajectory Awareness Context Builder
 *
 * Surfaces emotional patterns over time so Ferni can respond with
 * awareness of trends, not just current state.
 *
 * "Better Than Human" means noticing: "You've seemed more anxious lately"
 * or "You sound lighter than last week" - things a friend might miss.
 *
 * Data surfaced:
 * - Mood trajectory (improving/declining/stable)
 * - Emotional patterns by time (morning stress, weekend dips)
 * - Cross-session emotional trends
 * - Distress pattern alerts
 *
 * @module intelligence/context-builders/awareness/emotional-trajectory-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHighInjection, createHintInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { getRedisCache } from '../../../memory/redis-cache.js';

const log = createLogger({ module: 'context:emotional-trajectory' });

// ============================================================================
// TYPES
// ============================================================================

interface EmotionalTrajectory {
  currentMood: string;
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  trendDuration: string; // "3 days", "past week"
  recentEmotions: string[];
  distressLevel: number;
  patterns?: {
    timeOfDay?: string; // "anxious mornings", "calmer evenings"
    dayOfWeek?: string; // "Monday stress", "Weekend dips"
  };
  alerts?: string[];
}

// ============================================================================
// TRAJECTORY LOADER
// ============================================================================

async function loadEmotionalTrajectory(userId: string): Promise<EmotionalTrajectory | null> {
  try {
    // Try to get from Redis cache first (real-time state)
    const redis = getRedisCache();
    const cachedState = await redis.getEmotionalState(userId);

    // Try to get from semantic intelligence service
    let trajectory: EmotionalTrajectory | null = null;

    try {
      const { getEmotionalTrajectory } =
        await import('../../../services/superhuman/semantic-intelligence/emotional-semantics.js');
      const semanticTrajectory = await getEmotionalTrajectory(userId);

      if (semanticTrajectory) {
        trajectory = {
          currentMood: semanticTrajectory.dominantEmotion || 'neutral',
          trend: semanticTrajectory.trend || 'stable',
          trendDuration: semanticTrajectory.durationDescription || 'recently',
          recentEmotions: semanticTrajectory.recentEmotions || [],
          distressLevel: semanticTrajectory.avgDistress || 0,
          // patterns from semantic trajectory are string[], convert to expected format
          patterns: undefined,
          alerts: semanticTrajectory.alerts,
        };
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Semantic intelligence not available');
    }

    // Merge with real-time cached state if available
    if (cachedState && trajectory) {
      trajectory.currentMood = cachedState.primary || trajectory.currentMood;
      // Use intensity as a proxy for distress (high intensity often correlates with distress)
      trajectory.distressLevel = Math.max(trajectory.distressLevel, cachedState.intensity || 0);
    } else if (cachedState && !trajectory) {
      // Only have real-time state, no trajectory
      trajectory = {
        currentMood: cachedState.primary || 'neutral',
        trend: 'stable',
        trendDuration: 'now',
        recentEmotions: [cachedState.primary || 'neutral'],
        distressLevel: cachedState.intensity || 0,
      };
    }

    return trajectory;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load emotional trajectory');
    return null;
  }
}

// ============================================================================
// CONTEXT FORMATTER
// ============================================================================

function formatTrajectoryContext(trajectory: EmotionalTrajectory): string {
  const parts: string[] = [];

  // Current state
  parts.push(`Current: ${trajectory.currentMood}`);

  // Trend (most important for "Better Than Human")
  if (trajectory.trend !== 'stable') {
    const trendEmoji =
      trajectory.trend === 'improving' ? '📈' : trajectory.trend === 'declining' ? '📉' : '〰️';
    parts.push(`${trendEmoji} Trend: ${trajectory.trend} (${trajectory.trendDuration})`);
  }

  // Patterns
  if (trajectory.patterns?.timeOfDay) {
    parts.push(`⏰ Pattern: ${trajectory.patterns.timeOfDay}`);
  }
  if (trajectory.patterns?.dayOfWeek) {
    parts.push(`📅 Pattern: ${trajectory.patterns.dayOfWeek}`);
  }

  // Alerts
  if (trajectory.alerts && trajectory.alerts.length > 0) {
    parts.push(`⚠️ ${trajectory.alerts[0]}`);
  }

  return parts.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildEmotionalTrajectoryAwareness(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services, userData, analysis } = input;
  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;

  if (!userId) {
    return [];
  }

  // Load trajectory
  const trajectory = await loadEmotionalTrajectory(userId);
  if (!trajectory) {
    return [];
  }

  const injections: ContextInjection[] = [];

  // HIGH PRIORITY: Declining trend or high distress
  if (trajectory.trend === 'declining' || trajectory.distressLevel > 0.7) {
    const urgency =
      trajectory.distressLevel > 0.7
        ? `EMOTIONAL ALERT: High distress detected (${Math.round(trajectory.distressLevel * 100)}%). Be especially gentle and present.`
        : `EMOTIONAL TREND: They've been feeling ${trajectory.currentMood} and the trend is ${trajectory.trend} over ${trajectory.trendDuration}. You might gently check in.`;

    injections.push(
      createHighInjection('emotional_trajectory_alert', urgency, {
        category: 'emotional_safety',
        confidence: trajectory.distressLevel,
      })
    );
  }
  // HINT: Patterns worth noticing
  else if (trajectory.patterns || trajectory.trend === 'improving') {
    const formatted = formatTrajectoryContext(trajectory);
    const hint = `[EMOTIONAL AWARENESS - "Better Than Human"]
${formatted}

${trajectory.trend === 'improving' ? "They're on an upswing - celebrate small wins!" : 'You notice patterns they might not see.'}`;

    injections.push(
      createHintInjection('emotional_trajectory_hint', hint, {
        category: 'emotional_awareness',
      })
    );
  }

  if (injections.length > 0) {
    log.debug(
      {
        userId,
        turnCount,
        trend: trajectory.trend,
        distress: trajectory.distressLevel,
      },
      '📈 Emotional trajectory awareness injected'
    );
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

export const emotionalTrajectoryAwarenessBuilder: ContextBuilder = {
  name: 'emotional-trajectory-awareness',
  description: 'Surfaces emotional trends over time for "Better Than Human" awareness',
  priority: 25, // High priority - emotional awareness is important
  category: BuilderCategory.EMOTIONAL,
  build: buildEmotionalTrajectoryAwareness,
};

registerContextBuilder(emotionalTrajectoryAwarenessBuilder);

export default emotionalTrajectoryAwarenessBuilder;
