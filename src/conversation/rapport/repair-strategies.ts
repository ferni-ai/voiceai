/**
 * Repair Strategies
 *
 * Strategies for repairing declining rapport in conversation.
 *
 * @module rapport/repair-strategies
 */

import type { RapportScore, RepairState, RepairStrategy, RepairStrategyType } from './types.js';

// ============================================================================
// STRATEGY DEFINITIONS
// ============================================================================

interface StrategyConfig {
  /** When to use this strategy (score conditions) */
  conditions: {
    minScore?: number;
    maxScore?: number;
    trend?: 'declining' | 'stable';
    minDeclineRate?: number;
  };

  /** Priority (higher = preferred) */
  priority: number;

  /** Suggested TTS adjustments */
  ttsAdjustments?: {
    speedMultiplier?: number;
    extraPauseMs?: number;
    volumeAdjust?: number;
  };

  /** Context to inject into LLM prompt */
  contextInjection: string;

  /** Human-readable description */
  description: string;
}

const STRATEGY_CONFIGS: Record<Exclude<RepairStrategyType, 'none'>, StrategyConfig> = {
  validate_feeling: {
    conditions: {
      maxScore: 55,
    },
    priority: 90,
    contextInjection:
      'The user may be feeling unheard or disconnected. Lead your next response with validation of their feelings or perspective. Use phrases like "I can see why..." or "That makes sense..." before anything else.',
    description: 'Lead with emotional validation',
  },

  slow_down: {
    conditions: {
      maxScore: 70,
      minDeclineRate: 2,
    },
    priority: 80,
    ttsAdjustments: {
      speedMultiplier: 0.85,
      extraPauseMs: 300,
    },
    contextInjection:
      'Slow down your response pace. Take time to breathe and pause. The user may need more space to process. Keep responses shorter.',
    description: 'Reduce pace, add pauses',
  },

  check_in: {
    conditions: {
      minScore: 40,
      maxScore: 60,
    },
    priority: 70,
    contextInjection:
      'Consider gently checking in with the user. You might ask "How are you feeling about this?" or "Is this making sense?" Show genuine curiosity about their state.',
    description: 'Ask how they are doing',
  },

  give_space: {
    conditions: {
      maxScore: 50,
    },
    priority: 75,
    ttsAdjustments: {
      extraPauseMs: 500,
    },
    contextInjection:
      'The user may need more space to talk. Keep your responses brief and end with open questions that invite them to share more. Avoid long explanations.',
    description: 'More pauses, less talking',
  },

  show_interest: {
    conditions: {
      minScore: 55,
      maxScore: 75,
    },
    priority: 60,
    contextInjection:
      'Show active interest in what the user is saying. Ask follow-up questions, reference specific things they mentioned, and express genuine curiosity about their experiences.',
    description: 'More engagement cues',
  },
};

// ============================================================================
// STRATEGY SELECTION
// ============================================================================

/**
 * Select the most appropriate repair strategy based on current score and state
 */
export function selectRepairStrategy(
  score: RapportScore,
  repairState: RepairState
): RepairStrategy {
  const now = Date.now();

  // If score is good, no repair needed
  if (score.level === 'excellent' || score.level === 'good') {
    return {
      type: 'none',
      priority: 0,
      reason: 'Rapport is good',
      recommendedAt: now,
    };
  }

  // Find matching strategies
  const matchingStrategies: { type: RepairStrategyType; config: StrategyConfig }[] = [];

  for (const [type, config] of Object.entries(STRATEGY_CONFIGS)) {
    const strategyType = type as Exclude<RepairStrategyType, 'none'>;
    const { conditions } = config;

    // Check score range
    if (conditions.minScore !== undefined && score.score < conditions.minScore) {
      continue;
    }
    if (conditions.maxScore !== undefined && score.score > conditions.maxScore) {
      continue;
    }

    // Check trend
    if (conditions.trend !== undefined && score.trend !== conditions.trend) {
      continue;
    }

    // Check decline rate
    if (
      conditions.minDeclineRate !== undefined &&
      Math.abs(score.trendRate) < conditions.minDeclineRate
    ) {
      continue;
    }

    // Don't repeat recently used strategies (unless critical)
    if (score.level !== 'critical' && repairState.recentStrategies.includes(strategyType)) {
      continue;
    }

    matchingStrategies.push({ type: strategyType, config });
  }

  // If no strategies match, use validate_feeling as fallback for critical
  if (matchingStrategies.length === 0) {
    if (score.level === 'critical') {
      const config = STRATEGY_CONFIGS.validate_feeling;
      return {
        type: 'validate_feeling',
        priority: 100,
        reason: 'Critical rapport - defaulting to validation',
        ttsAdjustments: config.ttsAdjustments,
        contextInjection: config.contextInjection,
        recommendedAt: now,
      };
    }

    return {
      type: 'none',
      priority: 0,
      reason: 'No matching repair strategy',
      recommendedAt: now,
    };
  }

  // Sort by priority and pick the best
  matchingStrategies.sort((a, b) => b.config.priority - a.config.priority);
  const best = matchingStrategies[0];

  return {
    type: best.type,
    priority: best.config.priority,
    reason: best.config.description,
    ttsAdjustments: best.config.ttsAdjustments,
    contextInjection: best.config.contextInjection,
    recommendedAt: now,
  };
}

/**
 * Get all available repair strategies
 */
export function getAvailableStrategies(): { type: RepairStrategyType; description: string }[] {
  const strategies: { type: RepairStrategyType; description: string }[] = [];

  for (const [type, config] of Object.entries(STRATEGY_CONFIGS)) {
    strategies.push({
      type: type as RepairStrategyType,
      description: config.description,
    });
  }

  strategies.push({
    type: 'none',
    description: 'No repair needed',
  });

  return strategies;
}

/**
 * Get TTS adjustments for a strategy type
 */
export function getStrategyTtsAdjustments(
  type: RepairStrategyType
): { speedMultiplier?: number; extraPauseMs?: number; volumeAdjust?: number } | undefined {
  if (type === 'none') return undefined;
  return STRATEGY_CONFIGS[type]?.ttsAdjustments;
}

/**
 * Get context injection for a strategy type
 */
export function getStrategyContextInjection(type: RepairStrategyType): string | undefined {
  if (type === 'none') return undefined;
  return STRATEGY_CONFIGS[type]?.contextInjection;
}
