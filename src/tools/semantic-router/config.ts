/**
 * Semantic Router Configuration
 *
 * Feature flags and configuration for the semantic tool routing system.
 *
 * Environment Variables:
 * - SEMANTIC_ROUTING_ENABLED: Enable/disable semantic routing (default: true)
 * - SEMANTIC_ROUTING_LOG_LEVEL: Log level for routing (debug|info|warn|error)
 * - SEMANTIC_ROUTING_THRESHOLD_AUTO_EXECUTE: Auto-execute threshold (default: 0.92)
 * - SEMANTIC_ROUTING_THRESHOLD_HINT: Hint threshold (default: 0.60)
 *
 * @module tools/semantic-router/config
 */

import type { SemanticRouterConfig, MatchLayer } from './types.js';
import { DEFAULT_ROUTER_CONFIG } from './types.js';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Get default semantic router configuration from environment + defaults
 *
 * These values have been tuned through testing for optimal balance between
 * reliability and latency. Adjust with caution.
 */
export function getDefaultConfig(): SemanticRouterConfig {
  return {
    ...DEFAULT_ROUTER_CONFIG,
    thresholds: {
      // Lowered from 0.92 to 0.80 - pattern matches should auto-execute more often
      // Pattern layer score is 1.0 for exact matches, 0.95 for regex
      autoExecute: parseFloat(process.env.SEMANTIC_ROUTING_THRESHOLD_AUTO_EXECUTE || '0.80'),
      confirm: parseFloat(process.env.SEMANTIC_ROUTING_THRESHOLD_CONFIRM || '0.70'),
      hint: parseFloat(process.env.SEMANTIC_ROUTING_THRESHOLD_HINT || '0.55'),
      minimum: parseFloat(process.env.SEMANTIC_ROUTING_THRESHOLD_MINIMUM || '0.35'),
    },
    embeddingModel:
      (process.env.SEMANTIC_ROUTING_EMBEDDING_MODEL as 'local' | 'openai' | 'voyage' | 'cohere') ||
      'local',
    cacheEmbeddings: process.env.SEMANTIC_ROUTING_CACHE !== 'false',
    debug: process.env.SEMANTIC_ROUTING_DEBUG === 'true',
  };
}

/** Exported for backward compatibility */
export const DEFAULT_CONFIG = getDefaultConfig();

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Check if semantic routing is enabled globally
 *
 * DISABLED BY DEFAULT (Dec 2024): Semantic routing has too many false positives
 * (e.g., "bluegrass" → trauma support because "blue" is in sadness vocabulary).
 * JSON function calling workaround is more reliable. Re-enable with:
 *   SEMANTIC_ROUTING_ENABLED=true
 */
export function isSemanticRoutingEnabled(): boolean {
  // Default to FALSE - JSON workaround is more reliable
  const envValue = process.env.SEMANTIC_ROUTING_ENABLED;

  // If not set, DISABLE by default
  if (envValue === undefined) {
    return false;
  }

  // Explicit true enables
  return envValue === 'true' || envValue === '1';
}

/**
 * Check if we should fall back to JSON workaround on semantic router failure
 *
 * When true (default): Failed semantic routing → JSON function calling
 * When false: Failed semantic routing → Conversation mode only
 */
export function isJsonFallbackEnabled(): boolean {
  // Default to true for reliability
  return process.env.SEMANTIC_ROUTING_JSON_FALLBACK !== 'false';
}

/**
 * Check if verbose logging is enabled for debugging
 */
export function isVerboseLoggingEnabled(): boolean {
  return process.env.SEMANTIC_ROUTING_LOG_LEVEL === 'debug';
}

// ============================================================================
// RUNTIME CONFIGURATION
// ============================================================================

let runtimeConfig: Partial<SemanticRouterConfig> = {};

/**
 * Get the current effective configuration
 */
export function getConfig(): SemanticRouterConfig {
  const defaultConfig = getDefaultConfig();
  return {
    ...defaultConfig,
    ...runtimeConfig,
    thresholds: {
      ...defaultConfig.thresholds,
      ...runtimeConfig.thresholds,
    },
    layerWeights: {
      ...defaultConfig.layerWeights,
      ...runtimeConfig.layerWeights,
    },
  };
}

/**
 * Update runtime configuration
 * Changes take effect immediately for new routing requests
 */
export function updateConfig(updates: Partial<SemanticRouterConfig>): void {
  runtimeConfig = {
    ...runtimeConfig,
    ...updates,
    // Only update nested objects if provided
    ...(updates.thresholds && {
      thresholds: {
        ...runtimeConfig.thresholds,
        ...updates.thresholds,
      },
    }),
    ...(updates.layerWeights && {
      layerWeights: {
        ...runtimeConfig.layerWeights,
        ...updates.layerWeights,
      },
    }),
  };
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  runtimeConfig = {};
}

// ============================================================================
// ENVIRONMENT SUMMARY
// ============================================================================

/**
 * Log current configuration (useful for debugging)
 */
export function logConfiguration(): void {
  const config = getConfig();
  const status = isSemanticRoutingEnabled() ? '✅ ENABLED' : '❌ DISABLED';

  // eslint-disable-next-line no-console
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    SEMANTIC ROUTER STATUS                      ║
╠════════════════════════════════════════════════════════════════╣
║  Status: ${status.padEnd(52)}║
║                                                                ║
║  Confidence Thresholds:                                        ║
║    Auto-Execute: ${String(config.thresholds.autoExecute).padEnd(43)}║
║    Confirm:      ${String(config.thresholds.confirm).padEnd(43)}║
║    Hint:         ${String(config.thresholds.hint).padEnd(43)}║
║    Minimum:      ${String(config.thresholds.minimum).padEnd(43)}║
║                                                                ║
║  Settings:                                                     ║
║    Embedding Model:    ${String(config.embeddingModel).padEnd(37)}║
║    Cache Enabled:      ${String(config.cacheEmbeddings).padEnd(37)}║
║    JSON Fallback:      ${String(isJsonFallbackEnabled()).padEnd(37)}║
║    Verbose Logging:    ${String(isVerboseLoggingEnabled()).padEnd(37)}║
╚════════════════════════════════════════════════════════════════╝
`);
}
