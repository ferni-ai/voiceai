/**
 * Semantic Router Configuration & Feature Flags
 *
 * Centralized configuration for the semantic routing system.
 * Supports environment variables, runtime updates, and A/B testing.
 *
 * ENVIRONMENT VARIABLES:
 * - SEMANTIC_ROUTER_ENABLED: Enable/disable routing (default: true)
 * - SEMANTIC_ROUTER_AUTO_EXECUTE_THRESHOLD: Min confidence for auto-execute (default: 0.92)
 * - SEMANTIC_ROUTER_HINT_THRESHOLD: Min confidence for hints (default: 0.55)
 * - SEMANTIC_ROUTER_MAX_LATENCY_MS: Max routing latency before warning (default: 100)
 * - SEMANTIC_ROUTER_EMBEDDING_MODEL: openai | google | local (default: openai)
 * - REDIS_URL: Redis connection string for distributed caching
 *
 * @module tools/semantic-router/integration/config
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { isSemanticRoutingEnabled } from '../config.js';

const log = createLogger({ module: 'semantic-router:config' });

// ============================================================================
// TYPES
// ============================================================================

export interface SemanticRouterFeatureFlags {
  /** Master enable switch */
  enabled: boolean;

  /** Enable automatic tool execution for high-confidence matches */
  autoExecuteEnabled: boolean;

  /** Enable LLM hints for medium-confidence matches */
  hintsEnabled: boolean;

  /** Enable learning from corrections */
  learningEnabled: boolean;

  /** Enable per-user personalization */
  personalizationEnabled: boolean;

  /** Enable tool chain prediction */
  chainPredictionEnabled: boolean;

  /** Enable uncertainty quantification */
  uncertaintyEnabled: boolean;

  /** Enable distributed caching (Redis) */
  distributedCacheEnabled: boolean;

  /** Enable metrics collection */
  metricsEnabled: boolean;

  /** Enable debug logging */
  debugEnabled: boolean;
}

export interface SemanticRouterThresholds {
  /** Minimum confidence to auto-execute tool (bypass LLM) */
  autoExecute: number;

  /** Minimum confidence to confirm with user */
  confirm: number;

  /** Minimum confidence to hint to LLM */
  hint: number;

  /** Minimum confidence to consider a match */
  minimum: number;

  /** Maximum latency before warning */
  maxLatencyMs: number;

  /** Maximum embeddings to compute per request */
  maxEmbeddings: number;
}

export interface SemanticRouterConfig {
  /** Feature flags */
  flags: SemanticRouterFeatureFlags;

  /** Confidence thresholds */
  thresholds: SemanticRouterThresholds;

  /** Embedding model to use */
  embeddingModel: 'openai' | 'google' | 'local';

  /** Redis URL for distributed caching */
  redisUrl?: string;

  /** Warmup queries on initialization */
  warmupOnStart: boolean;

  /** A/B test variant (if any) */
  abTestVariant?: string;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_FLAGS: SemanticRouterFeatureFlags = {
  enabled: true,
  autoExecuteEnabled: true,
  hintsEnabled: true,
  learningEnabled: true,
  personalizationEnabled: true,
  chainPredictionEnabled: true,
  uncertaintyEnabled: true,
  distributedCacheEnabled: false,
  metricsEnabled: true,
  debugEnabled: false,
};

const DEFAULT_THRESHOLDS: SemanticRouterThresholds = {
  autoExecute: 0.92,
  confirm: 0.8,
  hint: 0.55,
  minimum: 0.35,
  maxLatencyMs: 100,
  maxEmbeddings: 10,
};

const DEFAULT_CONFIG: SemanticRouterConfig = {
  flags: DEFAULT_FLAGS,
  thresholds: DEFAULT_THRESHOLDS,
  embeddingModel: 'openai',
  warmupOnStart: true,
};

// ============================================================================
// CONFIGURATION STATE
// ============================================================================

let currentConfig: SemanticRouterConfig = loadConfigFromEnv();

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): SemanticRouterConfig {
  const env = process.env;

  return {
    flags: {
      enabled: env.SEMANTIC_ROUTER_ENABLED !== 'false',
      autoExecuteEnabled: env.SEMANTIC_ROUTER_AUTO_EXECUTE_ENABLED !== 'false',
      hintsEnabled: env.SEMANTIC_ROUTER_HINTS_ENABLED !== 'false',
      learningEnabled: env.SEMANTIC_ROUTER_LEARNING_ENABLED !== 'false',
      personalizationEnabled: env.SEMANTIC_ROUTER_PERSONALIZATION_ENABLED !== 'false',
      chainPredictionEnabled: env.SEMANTIC_ROUTER_CHAIN_PREDICTION_ENABLED !== 'false',
      uncertaintyEnabled: env.SEMANTIC_ROUTER_UNCERTAINTY_ENABLED !== 'false',
      distributedCacheEnabled: env.SEMANTIC_ROUTER_DISTRIBUTED_CACHE === 'true',
      metricsEnabled: env.SEMANTIC_ROUTER_METRICS_ENABLED !== 'false',
      debugEnabled: env.SEMANTIC_ROUTER_DEBUG === 'true' || env.NODE_ENV === 'development',
    },
    thresholds: {
      autoExecute:
        parseFloat(env.SEMANTIC_ROUTER_AUTO_EXECUTE_THRESHOLD || '') ||
        DEFAULT_THRESHOLDS.autoExecute,
      confirm:
        parseFloat(env.SEMANTIC_ROUTER_CONFIRM_THRESHOLD || '') || DEFAULT_THRESHOLDS.confirm,
      hint: parseFloat(env.SEMANTIC_ROUTER_HINT_THRESHOLD || '') || DEFAULT_THRESHOLDS.hint,
      minimum: parseFloat(env.SEMANTIC_ROUTER_MIN_THRESHOLD || '') || DEFAULT_THRESHOLDS.minimum,
      maxLatencyMs:
        parseInt(env.SEMANTIC_ROUTER_MAX_LATENCY_MS || '', 10) || DEFAULT_THRESHOLDS.maxLatencyMs,
      maxEmbeddings:
        parseInt(env.SEMANTIC_ROUTER_MAX_EMBEDDINGS || '', 10) || DEFAULT_THRESHOLDS.maxEmbeddings,
    },
    embeddingModel: (env.SEMANTIC_ROUTER_EMBEDDING_MODEL || 'google') as
      | 'openai'
      | 'google'
      | 'local',
    redisUrl: env.REDIS_URL,
    warmupOnStart: env.SEMANTIC_ROUTER_WARMUP !== 'false',
    abTestVariant: env.SEMANTIC_ROUTER_AB_VARIANT,
  };
}

// ============================================================================
// CONFIG ACCESSORS
// ============================================================================

/**
 * Get current configuration
 */
export function getConfig(): SemanticRouterConfig {
  return currentConfig;
}

/**
 * Get feature flags
 */
export function getFlags(): SemanticRouterFeatureFlags {
  return currentConfig.flags;
}

/**
 * Get thresholds
 */
export function getThresholds(): SemanticRouterThresholds {
  return currentConfig.thresholds;
}

/**
 * Check if a feature is enabled
 */
export function isEnabled(feature: keyof SemanticRouterFeatureFlags): boolean {
  return currentConfig.flags[feature];
}

/**
 * Check if routing is globally enabled
 */
export function isRoutingEnabled(): boolean {
  return currentConfig.flags.enabled;
}

// ============================================================================
// CONFIG UPDATES
// ============================================================================

/**
 * Update configuration at runtime
 */
export function updateConfig(updates: Partial<SemanticRouterConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...updates,
    flags: {
      ...currentConfig.flags,
      ...(updates.flags || {}),
    },
    thresholds: {
      ...currentConfig.thresholds,
      ...(updates.thresholds || {}),
    },
  };

  log.info({ config: currentConfig }, 'Semantic router config updated');
}

/**
 * Update feature flags at runtime
 */
export function updateFlags(updates: Partial<SemanticRouterFeatureFlags>): void {
  currentConfig = {
    ...currentConfig,
    flags: {
      ...currentConfig.flags,
      ...updates,
    },
  };

  log.info({ flags: currentConfig.flags }, 'Semantic router flags updated');
}

/**
 * Update thresholds at runtime
 */
export function updateThresholds(updates: Partial<SemanticRouterThresholds>): void {
  currentConfig = {
    ...currentConfig,
    thresholds: {
      ...currentConfig.thresholds,
      ...updates,
    },
  };

  log.info({ thresholds: currentConfig.thresholds }, 'Semantic router thresholds updated');
}

/**
 * Reset to defaults
 */
export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
  log.info('Semantic router config reset to defaults');
}

/**
 * Reload from environment
 */
export function reloadConfigFromEnv(): void {
  currentConfig = loadConfigFromEnv();
  log.info('Semantic router config reloaded from environment');
}

// ============================================================================
// A/B TESTING
// ============================================================================

interface ABTestConfig {
  name: string;
  variants: {
    id: string;
    weight: number;
    config: Partial<SemanticRouterConfig>;
  }[];
}

const activeABTests = new Map<string, ABTestConfig>();

/**
 * Register an A/B test
 */
export function registerABTest(test: ABTestConfig): void {
  activeABTests.set(test.name, test);
  log.info({ testName: test.name, variants: test.variants.length }, 'A/B test registered');
}

/**
 * Get A/B test variant for a user
 */
export function getABTestVariant(testName: string, userId: string): string | null {
  const test = activeABTests.get(testName);
  if (!test) return null;

  // Deterministic assignment based on user ID
  const hash = hashUserId(userId);
  const normalizedHash = Math.abs(hash) / 2147483647; // Normalize to 0-1

  let cumulative = 0;
  for (const variant of test.variants) {
    cumulative += variant.weight;
    if (normalizedHash < cumulative) {
      return variant.id;
    }
  }

  return test.variants[test.variants.length - 1]?.id || null;
}

/**
 * Apply A/B test config for a user
 */
export function applyABTestConfig(testName: string, userId: string): void {
  const test = activeABTests.get(testName);
  if (!test) return;

  const variantId = getABTestVariant(testName, userId);
  const variant = test.variants.find((v) => v.id === variantId);

  if (variant?.config) {
    // Temporarily apply variant config
    updateConfig(variant.config);
    currentConfig.abTestVariant = variantId || undefined;
  }
}

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Production preset - conservative, reliable
 */
export const PRODUCTION_PRESET: Partial<SemanticRouterConfig> = {
  flags: {
    ...DEFAULT_FLAGS,
    debugEnabled: false,
    distributedCacheEnabled: true,
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    autoExecute: 0.95, // Very high confidence required
    maxLatencyMs: 50, // Strict latency
  },
  warmupOnStart: true,
};

/**
 * Development preset - verbose, experimental
 */
export const DEVELOPMENT_PRESET: Partial<SemanticRouterConfig> = {
  flags: {
    ...DEFAULT_FLAGS,
    debugEnabled: true,
    distributedCacheEnabled: false,
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    autoExecute: 0.85, // Lower threshold for testing
    maxLatencyMs: 200, // Relaxed latency
  },
  warmupOnStart: false,
};

/**
 * Aggressive preset - maximize auto-execution
 */
export const AGGRESSIVE_PRESET: Partial<SemanticRouterConfig> = {
  flags: {
    ...DEFAULT_FLAGS,
    autoExecuteEnabled: true,
  },
  thresholds: {
    autoExecute: 0.8,
    confirm: 0.7,
    hint: 0.4,
    minimum: 0.25,
    maxLatencyMs: 100,
    maxEmbeddings: 20,
  },
};

/**
 * Conservative preset - minimize auto-execution
 */
export const CONSERVATIVE_PRESET: Partial<SemanticRouterConfig> = {
  flags: {
    ...DEFAULT_FLAGS,
    autoExecuteEnabled: false, // Always confirm
  },
  thresholds: {
    autoExecute: 0.99, // Almost never auto-execute
    confirm: 0.9,
    hint: 0.7,
    minimum: 0.5,
    maxLatencyMs: 150,
    maxEmbeddings: 5,
  },
};

/**
 * Apply a preset
 */
export function applyPreset(
  preset:
    | 'production'
    | 'development'
    | 'aggressive'
    | 'conservative'
    | 'gemini-optimized'
    | 'gemini-rock-solid'
): void {
  const presets = {
    production: PRODUCTION_PRESET,
    development: DEVELOPMENT_PRESET,
    aggressive: AGGRESSIVE_PRESET,
    conservative: CONSERVATIVE_PRESET,
    'gemini-optimized': GEMINI_OPTIMIZED_PRESET,
    'gemini-rock-solid': GEMINI_ROCK_SOLID_PRESET,
  };

  updateConfig(presets[preset]);
  log.info({ preset }, 'Preset applied');
}

// ============================================================================
// GEMINI-OPTIMIZED PRESET (Option C: Semantic Router Primary)
// ============================================================================

/**
 * Gemini-optimized preset - aggressive auto-execution to reduce JSON workaround usage.
 *
 * Since Gemini is cheaper but has unreliable native function calling,
 * we lean heavily on the semantic router to bypass the LLM for tool calls.
 */
export const GEMINI_OPTIMIZED_PRESET: Partial<SemanticRouterConfig> = {
  flags: {
    ...DEFAULT_FLAGS,
    autoExecuteEnabled: true,
    hintsEnabled: true,
    learningEnabled: true,
    metricsEnabled: true,
    debugEnabled: false,
  },
  thresholds: {
    autoExecute: 0.85, // Lower than production (0.95) to bypass LLM more often
    confirm: 0.75, // Ask for confirmation at moderate confidence
    hint: 0.5, // Hint to LLM at lower confidence
    minimum: 0.3, // Consider matches at low confidence for hints
    maxLatencyMs: 100,
    maxEmbeddings: 15,
  },
};

/**
 * GEMINI ROCK-SOLID PRESET - Maximum semantic routing, minimal LLM fallback.
 *
 * This preset aggressively routes tool calls through the semantic router,
 * minimizing opportunities for Gemini to "chat about" calling tools instead
 * of actually calling them.
 *
 * Use this when Gemini reliability is critical and you have good tool coverage.
 */
export const GEMINI_ROCK_SOLID_PRESET: Partial<SemanticRouterConfig> = {
  flags: {
    ...DEFAULT_FLAGS,
    autoExecuteEnabled: true,
    hintsEnabled: true, // Still hint to LLM for edge cases
    learningEnabled: true, // Learn from corrections
    personalizationEnabled: true, // Per-user optimization
    chainPredictionEnabled: true, // Predict tool chains
    metricsEnabled: true, // Track for optimization
    debugEnabled: false,
  },
  thresholds: {
    autoExecute: 0.72, // Aggressive: execute at 72% confidence
    confirm: 0.60, // Confirm with user at 60%
    hint: 0.40, // Hint to LLM at 40%
    minimum: 0.25, // Consider matches at 25%
    maxLatencyMs: 100,
    maxEmbeddings: 25, // More embeddings = better matching
  },
};

// ============================================================================
// GEMINI PROBLEM PHRASE DETECTION
// ============================================================================

/**
 * Phrases that Gemini consistently fails on - these should force semantic routing
 * even at lower confidence levels.
 *
 * These patterns are polite requests, hedged requests, or conversational phrasings
 * that make Gemini "chat" instead of calling tools.
 */
export const GEMINI_PROBLEM_PATTERNS: RegExp[] = [
  // Polite requests - Gemini often responds with "Sure, I'd be happy to..."
  /^can you (play|get|check|find|show|tell|search|look)/i,
  /^could you (play|get|check|find|show|tell|search|look)/i,
  /^would you (play|get|check|find|show|tell|search|look)/i,
  /^will you (play|get|check|find|show|tell|search|look)/i,

  // Hedged/tentative requests - Gemini asks clarifying questions
  /^(maybe|perhaps) (play|get|check|find)/i,
  /^(i think|i guess) i('d| would) like/i,
  /^if you (could|can|don't mind)/i,

  // Conversational phrasings - Gemini chats instead of acting
  /^i('d| would) (like|love) (to hear|some|to listen)/i,
  /^i('d| would) (like|love) you to/i,
  /^i (want|need) (to hear|some|you to)/i,
  /^how about (some|playing|we)/i,
  /^let's (hear|listen to|play|check)/i,

  // Question form - Gemini answers instead of acting
  /^(what|what's) the (weather|time|news)/i,
  /^do you (know|have) (the time|what time)/i,
  /^is it (going to rain|cold|hot|sunny)/i,

  // Handoff confusion - Gemini explains instead of executing
  /^(can|could) i (talk to|speak with|get)/i,
  /^(transfer|switch) me to/i,
  /^i('d| would) like to (talk to|speak with)/i,
];

/**
 * Check if input matches a known Gemini problem phrase.
 * When true, semantic routing should be more aggressive (lower threshold).
 */
export function isGeminiProblemPhrase(input: string): boolean {
  const trimmed = input.trim();
  return GEMINI_PROBLEM_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Get confidence boost for Gemini problem phrases.
 * Returns a multiplier to boost semantic router confidence when input
 * matches patterns that Gemini historically fails on.
 */
export function getGeminiConfidenceBoost(input: string): number {
  if (isGeminiProblemPhrase(input)) {
    log.debug({ input: input.slice(0, 50) }, '🎯 Gemini problem phrase detected - boosting confidence');
    return 1.15; // 15% confidence boost
  }
  return 1.0;
}

// ============================================================================
// P1 FIX: CONFIDENCE CALIBRATION LOGGING
// ============================================================================

/**
 * Confidence calibration entry for debugging routing decisions.
 */
export interface ConfidenceCalibrationEntry {
  timestamp: number;
  input: string;
  toolId: string;
  rawConfidence: number;
  geminiBoost: number;
  performanceAdjustment: number;
  finalConfidence: number;
  action: 'execute' | 'confirm' | 'hint' | 'conversation';
  thresholds: {
    autoExecute: number;
    confirm: number;
    hint: number;
  };
}

/** Rolling window of calibration entries for analysis */
const calibrationLog: ConfidenceCalibrationEntry[] = [];
const MAX_CALIBRATION_LOG = 200;

/**
 * Log a confidence calibration decision.
 *
 * This helps debug why certain inputs route to certain tools at certain
 * confidence levels, making threshold tuning data-driven.
 *
 * @param entry The calibration entry to log
 */
export function logConfidenceCalibration(entry: ConfidenceCalibrationEntry): void {
  calibrationLog.push(entry);

  // Trim if too long
  while (calibrationLog.length > MAX_CALIBRATION_LOG) {
    calibrationLog.shift();
  }

  // Detailed logging for debugging
  const adjustmentDesc: string[] = [];
  if (entry.geminiBoost !== 1.0) {
    adjustmentDesc.push(`Gemini boost: ${((entry.geminiBoost - 1) * 100).toFixed(0)}%`);
  }
  if (entry.performanceAdjustment !== 1.0) {
    adjustmentDesc.push(
      `Performance: ${entry.performanceAdjustment > 1 ? '+' : ''}${((entry.performanceAdjustment - 1) * 100).toFixed(0)}%`
    );
  }

  // Log at different levels based on how close to threshold
  const marginToExecute = entry.thresholds.autoExecute - entry.finalConfidence;
  const marginToConfirm = entry.thresholds.confirm - entry.finalConfidence;

  if (entry.action === 'execute') {
    log.info(
      {
        toolId: entry.toolId,
        input: entry.input.slice(0, 40),
        rawConfidence: entry.rawConfidence.toFixed(3),
        finalConfidence: entry.finalConfidence.toFixed(3),
        adjustments: adjustmentDesc.length > 0 ? adjustmentDesc.join(', ') : 'none',
        margin: `+${(-marginToExecute * 100).toFixed(1)}%`,
      },
      '🚀 CALIBRATION: Auto-execute (above threshold)'
    );
  } else if (marginToExecute < 0.1 && marginToExecute > 0) {
    // Close to auto-execute threshold - important for tuning
    log.info(
      {
        toolId: entry.toolId,
        input: entry.input.slice(0, 40),
        rawConfidence: entry.rawConfidence.toFixed(3),
        finalConfidence: entry.finalConfidence.toFixed(3),
        adjustments: adjustmentDesc.length > 0 ? adjustmentDesc.join(', ') : 'none',
        gapToExecute: `${(marginToExecute * 100).toFixed(1)}%`,
      },
      '⚠️ CALIBRATION: Near-miss for auto-execute (consider threshold adjustment)'
    );
  } else if (entry.action === 'confirm') {
    log.debug(
      {
        toolId: entry.toolId,
        finalConfidence: entry.finalConfidence.toFixed(3),
        action: 'confirm',
      },
      '📋 CALIBRATION: Confirm action'
    );
  } else if (entry.action === 'hint') {
    log.debug(
      {
        toolId: entry.toolId,
        finalConfidence: entry.finalConfidence.toFixed(3),
        action: 'hint',
      },
      '💡 CALIBRATION: Hint action'
    );
  }
}

/**
 * Get calibration statistics for threshold tuning.
 */
export function getCalibrationStats(): {
  totalEntries: number;
  actionDistribution: Record<string, number>;
  avgConfidenceByAction: Record<string, number>;
  nearMissCount: number;
  recentNearMisses: Array<{ input: string; gap: number; toolId: string }>;
  suggestedThresholdAdjustments: {
    autoExecute?: { current: number; suggested: number; reason: string };
    confirm?: { current: number; suggested: number; reason: string };
  };
} {
  const actionCounts: Record<string, number> = {};
  const actionConfidenceSums: Record<string, number> = {};
  const nearMisses: Array<{ input: string; gap: number; toolId: string }> = [];

  const thresholds = getThresholds();

  for (const entry of calibrationLog) {
    actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
    actionConfidenceSums[entry.action] =
      (actionConfidenceSums[entry.action] || 0) + entry.finalConfidence;

    // Track near-misses (within 10% of auto-execute)
    const gap = thresholds.autoExecute - entry.finalConfidence;
    if (gap > 0 && gap < 0.1) {
      nearMisses.push({
        input: entry.input.slice(0, 30),
        gap,
        toolId: entry.toolId,
      });
    }
  }

  // Calculate average confidence by action
  const avgConfidenceByAction: Record<string, number> = {};
  for (const action of Object.keys(actionCounts)) {
    avgConfidenceByAction[action] = actionConfidenceSums[action] / actionCounts[action];
  }

  // Generate threshold adjustment suggestions
  const suggestedThresholdAdjustments: {
    autoExecute?: { current: number; suggested: number; reason: string };
    confirm?: { current: number; suggested: number; reason: string };
  } = {};

  // If we have many near-misses with high confidence, suggest lowering threshold
  if (nearMisses.length > calibrationLog.length * 0.15) {
    const avgNearMissConfidence =
      nearMisses.reduce((sum, nm) => sum + (thresholds.autoExecute - nm.gap), 0) / nearMisses.length;
    if (avgNearMissConfidence > 0.75) {
      suggestedThresholdAdjustments.autoExecute = {
        current: thresholds.autoExecute,
        suggested: Math.max(0.70, avgNearMissConfidence - 0.05),
        reason: `${nearMisses.length} near-misses (${((nearMisses.length / calibrationLog.length) * 100).toFixed(0)}%) with avg confidence ${avgNearMissConfidence.toFixed(2)}`,
      };
    }
  }

  return {
    totalEntries: calibrationLog.length,
    actionDistribution: actionCounts,
    avgConfidenceByAction,
    nearMissCount: nearMisses.length,
    recentNearMisses: nearMisses.slice(-10),
    suggestedThresholdAdjustments,
  };
}

/**
 * Clear calibration log (for testing).
 */
export function resetCalibrationLog(): void {
  calibrationLog.length = 0;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Check if using Gemini (not OpenAI Realtime)
 */
export function isUsingGemini(): boolean {
  return process.env.USE_OPENAI_REALTIME !== 'true';
}

/**
 * Check if using OpenAI Realtime
 */
export function isUsingOpenAI(): boolean {
  return process.env.USE_OPENAI_REALTIME === 'true';
}

/**
 * Get the LLM provider name for logging
 */
export function getLLMProviderName(): 'gemini' | 'openai' {
  return isUsingGemini() ? 'gemini' : 'openai';
}

/**
 * Initialize configuration based on environment
 */
export function initializeConfig(): void {
  currentConfig = loadConfigFromEnv();

  // Check if semantic routing is globally disabled
  // (SEMANTIC_ROUTING_ENABLED=false in env)
  if (!isSemanticRoutingEnabled()) {
    log.info('⏸️ Semantic routing DISABLED via SEMANTIC_ROUTING_ENABLED=false');
    log.info('   → JSON function calling workaround will be used instead');
    return; // Skip all preset configuration
  }

  // Check for explicit preset override via env
  const presetOverride = process.env.SEMANTIC_ROUTER_PRESET as
    | 'gemini-rock-solid'
    | 'gemini-optimized'
    | 'production'
    | 'development'
    | undefined;

  if (presetOverride) {
    // Explicit preset requested
    switch (presetOverride) {
      case 'gemini-rock-solid':
        updateConfig(GEMINI_ROCK_SOLID_PRESET);
        log.info('🚀 Using GEMINI_ROCK_SOLID preset (maximum semantic routing)');
        break;
      case 'gemini-optimized':
        updateConfig(GEMINI_OPTIMIZED_PRESET);
        log.info('🎯 Using GEMINI_OPTIMIZED preset (aggressive semantic routing)');
        break;
      case 'production':
        updateConfig(PRODUCTION_PRESET);
        log.info('Using PRODUCTION preset');
        break;
      case 'development':
        updateConfig(DEVELOPMENT_PRESET);
        log.info('Using DEVELOPMENT preset');
        break;
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Auto-select based on LLM provider
    if (isUsingGemini()) {
      // Default to ROCK-SOLID for Gemini in production (maximum reliability)
      updateConfig(GEMINI_ROCK_SOLID_PRESET);
      log.info('🚀 Using GEMINI_ROCK_SOLID preset (Gemini detected, maximum semantic routing)');
    } else {
      // OpenAI has native function calling - use production preset
      updateConfig(PRODUCTION_PRESET);
      log.info('Using PRODUCTION preset (OpenAI native function calling)');
    }
  } else if (process.env.NODE_ENV === 'development') {
    // In development, still use rock-solid for Gemini to test reliability
    if (isUsingGemini()) {
      updateConfig(GEMINI_ROCK_SOLID_PRESET);
      log.info('🚀 Using GEMINI_ROCK_SOLID preset (dev mode with Gemini)');
    } else {
      updateConfig(DEVELOPMENT_PRESET);
      log.info('Using DEVELOPMENT preset');
    }
  }

  log.info(
    {
      llmProvider: getLLMProviderName(),
      autoExecuteThreshold: currentConfig.thresholds.autoExecute,
      confirmThreshold: currentConfig.thresholds.confirm,
      presetOverride: presetOverride || 'auto',
    },
    'Semantic router configuration initialized'
  );
}

// Initialize on module load
initializeConfig();
