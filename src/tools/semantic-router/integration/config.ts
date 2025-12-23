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
    embeddingModel: (env.SEMANTIC_ROUTER_EMBEDDING_MODEL || 'openai') as
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

const activeABTests: Map<string, ABTestConfig> = new Map();

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
  preset: 'production' | 'development' | 'aggressive' | 'conservative'
): void {
  const presets = {
    production: PRODUCTION_PRESET,
    development: DEVELOPMENT_PRESET,
    aggressive: AGGRESSIVE_PRESET,
    conservative: CONSERVATIVE_PRESET,
  };

  updateConfig(presets[preset]);
  log.info({ preset }, 'Preset applied');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize configuration based on environment
 */
export function initializeConfig(): void {
  currentConfig = loadConfigFromEnv();

  // Auto-apply environment preset
  if (process.env.NODE_ENV === 'production') {
    updateConfig(PRODUCTION_PRESET);
  } else if (process.env.NODE_ENV === 'development') {
    updateConfig(DEVELOPMENT_PRESET);
  }

  log.info(
    {
      flags: currentConfig.flags,
      thresholds: currentConfig.thresholds,
      embeddingModel: currentConfig.embeddingModel,
    },
    'Semantic router configuration initialized'
  );
}

// Initialize on module load
initializeConfig();
