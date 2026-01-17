/**
 * Tool Chain Prediction
 *
 * Predicts multi-step tool sequences based on:
 * 1. Pre-defined domain chains (expert knowledge)
 * 2. Learned co-occurrence patterns (from usage data)
 * 3. Goal decomposition (intent analysis)
 * 4. User-specific patterns (personalization)
 *
 * @module semantic-router/advanced/tool-chains
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { RedisCache } from '../../../memory/redis-cache.js';

const log = createLogger({ module: 'SemanticRouter.ToolChains' });

// ============================================================================
// REDIS BACKING FOR CROSS-INSTANCE STATE
// ============================================================================

let redisCache: RedisCache | null = null;

/**
 * Initialize Redis for tool chain state sharing
 */
async function initializeRedis(): Promise<void> {
  try {
    const { getRedisCache } = await import('../../../memory/redis-cache.js');
    const cache = getRedisCache();
    await cache.initialize();
    if (cache.isConnected()) {
      redisCache = cache;
      log.info('🚀 Tool chains Redis backing enabled');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Redis not available for tool chains');
  }
}

// Initialize on module load (non-blocking)
void initializeRedis();

const REDIS_KEY_PREFIX = 'toolchain:';
const REDIS_TTL_SECONDS = 3600; // 1 hour for learned patterns

// ============================================================================
// TYPES
// ============================================================================

export interface ToolChainDefinition {
  id: string;
  name: string;
  description: string;

  /** Triggers that activate this chain */
  triggers: {
    phrases: string[];
    patterns: RegExp[];
    intents: string[];
  };

  /** Steps in the chain */
  steps: Array<{
    toolId: string;
    required: boolean;
    condition?: string;
    argsFrom?: Array<{
      argName: string;
      source: 'previous_result' | 'user_input' | 'context';
      path?: string;
    }>;
  }>;

  /** Typical completion time (for user expectations) */
  estimatedDurationMs?: number;
}

export interface ChainPrediction {
  chainId: string | null;
  chainName: string | null;
  confidence: number;
  predictedSteps: Array<{
    toolId: string;
    probability: number;
    expectedArgs: Record<string, unknown>;
  }>;
  reason: string;
}

export interface ChainExecutionContext {
  userId: string;
  sessionId: string;
  currentStep: number;
  completedSteps: Array<{
    toolId: string;
    result: unknown;
    timestamp: Date;
  }>;
  pendingSteps: string[];
}

// ============================================================================
// PRE-DEFINED CHAINS (Expert Knowledge)
// ============================================================================

export const PREDEFINED_CHAINS: ToolChainDefinition[] = [
  // Trip Planning
  {
    id: 'trip_planning',
    name: 'Trip Planning',
    description: 'Plan a trip including weather, calendar, and memory',
    triggers: {
      phrases: ['plan a trip', 'going to travel', 'vacation planning', 'book a trip'],
      patterns: [/plan(?:ning)?\s+(?:a\s+)?(?:trip|vacation|travel)/i],
      intents: ['travel_planning'],
    },
    steps: [
      {
        toolId: 'weather_forecast',
        required: false,
        argsFrom: [{ argName: 'location', source: 'user_input', path: 'destination' }],
      },
      {
        toolId: 'calendar_list_events',
        required: true,
        argsFrom: [{ argName: 'dateRange', source: 'user_input', path: 'dates' }],
      },
      {
        toolId: 'calendar_create_event',
        required: true,
        condition: 'calendar_is_free',
        argsFrom: [
          { argName: 'title', source: 'user_input', path: 'destination' },
          { argName: 'dates', source: 'previous_result', path: 'available_dates' },
        ],
      },
      {
        toolId: 'memory_save',
        required: false,
        argsFrom: [{ argName: 'fact', source: 'previous_result', path: 'trip_details' }],
      },
    ],
    estimatedDurationMs: 30000,
  },

  // Morning Routine
  {
    id: 'morning_routine',
    name: 'Morning Routine',
    description: 'Start the day with weather, calendar, and habits',
    triggers: {
      phrases: ['good morning', 'start my day', 'morning routine', 'what should I do today'],
      patterns: [/^good\s+morning/i, /start\s+(?:my|the)\s+day/i],
      intents: ['morning_greeting'],
    },
    steps: [
      { toolId: 'weather_current', required: true, argsFrom: [] },
      { toolId: 'calendar_list_events', required: true, argsFrom: [] },
      { toolId: 'habit_progress', required: false, argsFrom: [] },
    ],
    estimatedDurationMs: 15000,
  },

  // Meeting Preparation
  {
    id: 'meeting_prep',
    name: 'Meeting Preparation',
    description: 'Prepare for an upcoming meeting',
    triggers: {
      phrases: ['prepare for meeting', 'meeting prep', 'get ready for meeting'],
      patterns: [/prepar(?:e|ing)\s+for\s+(?:the\s+)?meeting/i],
      intents: ['meeting_preparation'],
    },
    steps: [
      {
        toolId: 'calendar_list_events',
        required: true,
        argsFrom: [{ argName: 'filter', source: 'user_input', path: 'meeting_name' }],
      },
      {
        toolId: 'memory_recall',
        required: false,
        argsFrom: [{ argName: 'query', source: 'previous_result', path: 'meeting_attendees' }],
      },
    ],
    estimatedDurationMs: 10000,
  },

  // Stress Relief
  {
    id: 'stress_relief',
    name: 'Stress Relief Sequence',
    description: 'Calming sequence for stress and anxiety',
    triggers: {
      phrases: ['help me calm down', 'I need to relax', 'stress relief', 'anxiety help'],
      patterns: [/(?:help\s+me\s+)?(?:calm|relax|de-?stress)/i],
      intents: ['stress_relief', 'anxiety_help'],
    },
    steps: [
      { toolId: 'grounding_exercise', required: true, argsFrom: [] },
      { toolId: 'breathing_exercise', required: false, argsFrom: [] },
      {
        toolId: 'spotify_play',
        required: false,
        argsFrom: [{ argName: 'query', source: 'context', path: 'calming_music' }],
      },
    ],
    estimatedDurationMs: 60000,
  },

  // Habit Check-in
  {
    id: 'habit_checkin',
    name: 'Habit Check-in',
    description: 'Review and track habits',
    triggers: {
      phrases: ['how are my habits', 'habit check', 'check my progress'],
      patterns: [/(?:check|how\s+are)\s+(?:my\s+)?habits?/i],
      intents: ['habit_review'],
    },
    steps: [
      { toolId: 'habit_progress', required: true, argsFrom: [] },
      { toolId: 'habit_track', required: false, condition: 'has_pending_habits', argsFrom: [] },
    ],
    estimatedDurationMs: 10000,
  },

  // End of Day Review
  {
    id: 'eod_review',
    name: 'End of Day Review',
    description: 'Review the day and prepare for tomorrow',
    triggers: {
      phrases: ["let's review my day", 'end of day', 'how was my day', 'wrap up the day'],
      patterns: [/(?:review|wrap\s+up|end\s+of)\s+(?:my\s+)?day/i],
      intents: ['daily_review'],
    },
    steps: [
      { toolId: 'calendar_list_events', required: true, argsFrom: [] },
      { toolId: 'habit_progress', required: true, argsFrom: [] },
      { toolId: 'memory_save', required: false, argsFrom: [] },
    ],
    estimatedDurationMs: 20000,
  },
];

// ============================================================================
// CHAIN DETECTION
// ============================================================================

/**
 * Detect if user input triggers a tool chain
 */
export function detectToolChain(
  input: string,
  context?: { recentTools?: string[]; timeOfDay?: string }
): ChainPrediction {
  const lowerInput = input.toLowerCase();

  // Check each predefined chain
  for (const chain of PREDEFINED_CHAINS) {
    // Check phrases
    for (const phrase of chain.triggers.phrases) {
      if (lowerInput.includes(phrase.toLowerCase())) {
        return {
          chainId: chain.id,
          chainName: chain.name,
          confidence: 0.9,
          predictedSteps: chain.steps.map((s) => ({
            toolId: s.toolId,
            probability: s.required ? 0.95 : 0.6,
            expectedArgs: {},
          })),
          reason: `Phrase match: "${phrase}"`,
        };
      }
    }

    // Check patterns
    for (const pattern of chain.triggers.patterns) {
      if (pattern.test(input)) {
        return {
          chainId: chain.id,
          chainName: chain.name,
          confidence: 0.85,
          predictedSteps: chain.steps.map((s) => ({
            toolId: s.toolId,
            probability: s.required ? 0.95 : 0.6,
            expectedArgs: {},
          })),
          reason: `Pattern match: ${pattern.source}`,
        };
      }
    }
  }

  // Check for implicit chains based on time of day
  if (context?.timeOfDay) {
    const timeChain = getTimeBasedChain(context.timeOfDay);
    if (timeChain) {
      return {
        chainId: timeChain.id,
        chainName: timeChain.name,
        confidence: 0.5,
        predictedSteps: timeChain.steps.map((s) => ({
          toolId: s.toolId,
          probability: 0.4,
          expectedArgs: {},
        })),
        reason: `Time-based suggestion: ${context.timeOfDay}`,
      };
    }
  }

  return {
    chainId: null,
    chainName: null,
    confidence: 0,
    predictedSteps: [],
    reason: 'No chain detected',
  };
}

/**
 * Get time-based chain suggestion
 */
function getTimeBasedChain(timeOfDay: string): ToolChainDefinition | null {
  switch (timeOfDay) {
    case 'morning':
      return PREDEFINED_CHAINS.find((c) => c.id === 'morning_routine') || null;
    case 'evening':
      return PREDEFINED_CHAINS.find((c) => c.id === 'eod_review') || null;
    default:
      return null;
  }
}

/**
 * Predict next step in an active chain
 */
export function predictNextStep(
  executionContext: ChainExecutionContext
): { toolId: string; probability: number } | null {
  if (executionContext.pendingSteps.length === 0) {
    return null;
  }

  const nextToolId = executionContext.pendingSteps[0];

  // Calculate probability based on completed steps success
  const successRate =
    executionContext.completedSteps.length > 0
      ? executionContext.completedSteps.filter((s) => s.result !== null).length /
        executionContext.completedSteps.length
      : 1;

  return {
    toolId: nextToolId,
    probability: successRate * 0.8, // Base probability adjusted by success rate
  };
}

// ============================================================================
// CHAIN EXECUTION TRACKING (Redis-backed for cross-instance sharing)
// ============================================================================

const activeChains = new Map<string, ChainExecutionContext>();

/**
 * Store active chain in Redis (fire-and-forget)
 */
function persistActiveChain(sessionId: string, context: ChainExecutionContext): void {
  if (!redisCache?.isConnected()) return;

  const key = `${REDIS_KEY_PREFIX}active:${sessionId}`;
  const serialized = {
    ...context,
    completedSteps: context.completedSteps.map((s) => ({
      ...s,
      timestamp: s.timestamp.toISOString(),
    })),
  };
  redisCache.set(key, serialized, 1800).catch((err) => {
    log.debug({ error: String(err) }, 'Failed to persist active chain');
  });
}

/**
 * Start tracking a chain execution
 */
export function startChainExecution(
  sessionId: string,
  chainId: string,
  userId: string
): ChainExecutionContext {
  const chain = PREDEFINED_CHAINS.find((c) => c.id === chainId);
  if (!chain) {
    throw new Error(`Chain not found: ${chainId}`);
  }

  const context: ChainExecutionContext = {
    userId,
    sessionId,
    currentStep: 0,
    completedSteps: [],
    pendingSteps: chain.steps.map((s) => s.toolId),
  };

  activeChains.set(sessionId, context);
  persistActiveChain(sessionId, context);
  log.info({ sessionId, chainId, steps: context.pendingSteps.length }, 'Chain execution started');

  return context;
}

/**
 * Record step completion
 */
export function recordStepCompletion(
  sessionId: string,
  toolId: string,
  result: unknown
): ChainExecutionContext | null {
  const context = activeChains.get(sessionId);
  if (!context) return null;

  // Remove from pending
  const pendingIndex = context.pendingSteps.indexOf(toolId);
  if (pendingIndex >= 0) {
    context.pendingSteps.splice(pendingIndex, 1);
  }

  // Add to completed
  context.completedSteps.push({
    toolId,
    result,
    timestamp: new Date(),
  });

  context.currentStep++;

  // Check if chain is complete
  if (context.pendingSteps.length === 0) {
    activeChains.delete(sessionId);
    // Clean up Redis
    if (redisCache?.isConnected()) {
      redisCache.delete(`${REDIS_KEY_PREFIX}active:${sessionId}`).catch((e) => {
        log.debug({ error: String(e), sessionId }, 'Redis cleanup failed (non-blocking)');
      });
    }
    log.info({ sessionId, completedSteps: context.completedSteps.length }, 'Chain completed');
  } else {
    // Update Redis with progress
    persistActiveChain(sessionId, context);
  }

  return context;
}

/**
 * Get active chain for session
 */
export function getActiveChain(sessionId: string): ChainExecutionContext | null {
  return activeChains.get(sessionId) || null;
}

/**
 * Cancel active chain
 */
export function cancelChain(sessionId: string): void {
  activeChains.delete(sessionId);
}

// ============================================================================
// CHAIN LEARNING (Redis-backed for cross-instance pattern sharing)
// ============================================================================

// Learned chains from user behavior (L1 memory cache)
const learnedChains = new Map<string, Map<string, number>>();

/**
 * Learn tool co-occurrence for chain discovery
 */
export function learnToolSequence(sessionId: string, tools: string[]): void {
  if (tools.length < 2) return;

  // Record each pair in local memory
  for (let i = 0; i < tools.length - 1; i++) {
    const from = tools[i];
    const to = tools[i + 1];

    if (!learnedChains.has(from)) {
      learnedChains.set(from, new Map());
    }

    const transitions = learnedChains.get(from)!;
    transitions.set(to, (transitions.get(to) || 0) + 1);

    // Persist to Redis (fire-and-forget)
    if (redisCache?.isConnected()) {
      const key = `${REDIS_KEY_PREFIX}learned:${from}:${to}`;
      redisCache.incr(key).then((count: number) => {
        // Set TTL on first increment
        if (count === 1) {
          redisCache?.expire(key, REDIS_TTL_SECONDS).catch((e) => {
            log.debug({ error: String(e), key }, 'Redis TTL set failed (non-blocking)');
          });
        }
      }).catch((e) => {
        log.debug({ error: String(e), key }, 'Redis incr failed (non-blocking)');
      });
    }
  }

  log.debug({ sessionId, sequence: tools }, 'Tool sequence learned');
}

/**
 * Predict likely next tools based on learned patterns
 */
export function predictFromLearned(
  currentTool: string
): Array<{ toolId: string; probability: number }> {
  const transitions = learnedChains.get(currentTool);
  if (!transitions || transitions.size === 0) {
    return [];
  }

  const total = Array.from(transitions.values()).reduce((a, b) => a + b, 0);

  return Array.from(transitions.entries())
    .map(([toolId, count]) => ({
      toolId,
      probability: count / total,
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getChainStats(): {
  predefinedChains: number;
  activeChains: number;
  learnedTransitions: number;
} {
  let totalTransitions = 0;
  for (const transitions of learnedChains.values()) {
    totalTransitions += transitions.size;
  }

  return {
    predefinedChains: PREDEFINED_CHAINS.length,
    activeChains: activeChains.size,
    learnedTransitions: totalTransitions,
  };
}
