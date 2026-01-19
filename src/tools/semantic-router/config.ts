/**
 * Semantic Router Configuration
 *
 * Feature flags and configuration for the semantic tool routing system.
 *
 * Updated Jan 2026: Hybrid approach for Gemini reliability
 * - Semantic router handles HIGH confidence matches (>0.92)
 * - JSON workaround handles uncertain cases
 * - This reduces load on Gemini's function calling for obvious cases
 *
 * Environment Variables:
 * - SEMANTIC_ROUTING_ENABLED: Enable/disable semantic routing (default: hybrid)
 * - SEMANTIC_ROUTING_HYBRID: Enable hybrid mode (semantic + JSON fallback) (default: true)
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
 * Jan 2026 Update: Raised thresholds for hybrid mode
 * - autoExecute raised to 0.92 (from 0.80) - only HIGH confidence matches
 * - This eliminates false positives while still handling 60%+ of obvious cases
 * - JSON workaround catches everything else
 *
 * These values have been tuned through testing for optimal balance between
 * reliability and latency. Adjust with caution.
 */
export function getDefaultConfig(): SemanticRouterConfig {
  // FTIS_ONLY_MODE: Lower thresholds since there's no JSON workaround fallback
  // FTIS is the 100% solution - we need to be more aggressive
  const isFTISOnly = process.env.FTIS_ONLY_MODE === 'true';
  
  return {
    ...DEFAULT_ROUTER_CONFIG,
    thresholds: {
      // Jan 2026: Thresholds depend on mode
      // - Hybrid mode (default): 0.92 - conservative, JSON catches rest
      // - FTIS_ONLY_MODE: 0.70 - aggressive, FTIS handles everything
      autoExecute: parseFloat(
        process.env.SEMANTIC_ROUTING_THRESHOLD_AUTO_EXECUTE || (isFTISOnly ? '0.70' : '0.92')
      ),
      confirm: parseFloat(
        process.env.SEMANTIC_ROUTING_THRESHOLD_CONFIRM || (isFTISOnly ? '0.55' : '0.75')
      ),
      hint: parseFloat(
        process.env.SEMANTIC_ROUTING_THRESHOLD_HINT || (isFTISOnly ? '0.40' : '0.60')
      ),
      minimum: parseFloat(
        process.env.SEMANTIC_ROUTING_THRESHOLD_MINIMUM || (isFTISOnly ? '0.25' : '0.40')
      ),
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
 * Check if HYBRID semantic routing mode is enabled.
 *
 * Jan 2026 Update: Hybrid mode is the recommended approach.
 * - Semantic router handles high-confidence matches (>0.92)
 * - JSON workaround handles uncertain cases
 * - Best of both worlds: fast for obvious cases, reliable for edge cases
 *
 * Enable with: SEMANTIC_ROUTING_HYBRID=true (default: true)
 */
export function isHybridModeEnabled(): boolean {
  // Default to TRUE - hybrid mode is the best approach
  const envValue = process.env.SEMANTIC_ROUTING_HYBRID;

  // If not set, ENABLE by default (Jan 2026 recommendation)
  if (envValue === undefined) {
    return true;
  }

  return envValue === 'true' || envValue === '1';
}

/**
 * Check if semantic routing is enabled globally.
 *
 * Jan 2026 Update: In hybrid mode, this returns TRUE since semantic
 * routing handles high-confidence matches while JSON handles the rest.
 *
 * For backwards compatibility:
 * - SEMANTIC_ROUTING_ENABLED=true: Full semantic routing
 * - SEMANTIC_ROUTING_ENABLED=false: Disable semantic routing entirely
 * - SEMANTIC_ROUTING_HYBRID=true (default): Hybrid mode (recommended)
 *
 * @returns Whether semantic routing should be used (either full or hybrid)
 */
export function isSemanticRoutingEnabled(): boolean {
  // If hybrid mode is enabled, semantic routing is ON for high-confidence
  if (isHybridModeEnabled()) {
    return true;
  }

  // Otherwise check explicit flag
  const envValue = process.env.SEMANTIC_ROUTING_ENABLED;

  // If not set and not hybrid, DISABLE by default (legacy behavior)
  if (envValue === undefined) {
    return false;
  }

  // Explicit true enables
  return envValue === 'true' || envValue === '1';
}

/**
 * Check if we should fall back to JSON workaround on semantic router failure.
 *
 * When true (default): Failed/uncertain semantic routing → JSON function calling
 * When false: Failed semantic routing → Conversation mode only
 *
 * In hybrid mode, this is always true (JSON handles uncertain cases).
 */
export function isJsonFallbackEnabled(): boolean {
  // In hybrid mode, JSON fallback is always enabled
  if (isHybridModeEnabled()) {
    return true;
  }

  // Otherwise check explicit flag (default to true)
  return process.env.SEMANTIC_ROUTING_JSON_FALLBACK !== 'false';
}

/**
 * Get the confidence threshold for semantic router auto-execution in hybrid mode.
 *
 * In hybrid mode, we only auto-execute when confidence is very high (>0.92).
 * Below this threshold, defer to JSON workaround.
 *
 * @returns Confidence threshold (0-1)
 */
export function getHybridAutoExecuteThreshold(): number {
  const config = getDefaultConfig();
  return config.thresholds.autoExecute;
}

/**
 * Check if a semantic match should auto-execute in hybrid mode.
 *
 * @param confidence - Match confidence (0-1)
 * @returns Whether the match is confident enough to auto-execute
 */
export function shouldAutoExecuteInHybridMode(confidence: number): boolean {
  if (!isHybridModeEnabled()) {
    // Not in hybrid mode, use normal threshold logic
    return confidence >= getDefaultConfig().thresholds.autoExecute;
  }

  // In hybrid mode, require very high confidence
  const threshold = getHybridAutoExecuteThreshold();
  return confidence >= threshold;
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
  const hybridMode = isHybridModeEnabled();
  const status = hybridMode ? '🔄 HYBRID' : isSemanticRoutingEnabled() ? '✅ ENABLED' : '❌ DISABLED';
  const modeDesc = hybridMode 
    ? 'Semantic (high-conf) + JSON (fallback)' 
    : isSemanticRoutingEnabled() 
      ? 'Semantic routing only' 
      : 'JSON workaround only';

  // eslint-disable-next-line no-console
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    SEMANTIC ROUTER STATUS                      ║
╠════════════════════════════════════════════════════════════════╣
║  Status: ${status.padEnd(52)}║
║  Mode:   ${modeDesc.padEnd(52)}║
║                                                                ║
║  Confidence Thresholds:                                        ║
║    Auto-Execute: ${String(config.thresholds.autoExecute).padEnd(43)}║
║    Confirm:      ${String(config.thresholds.confirm).padEnd(43)}║
║    Hint:         ${String(config.thresholds.hint).padEnd(43)}║
║    Minimum:      ${String(config.thresholds.minimum).padEnd(43)}║
║                                                                ║
║  Settings:                                                     ║
║    Hybrid Mode:        ${String(hybridMode).padEnd(37)}║
║    Embedding Model:    ${String(config.embeddingModel).padEnd(37)}║
║    Cache Enabled:      ${String(config.cacheEmbeddings).padEnd(37)}║
║    JSON Fallback:      ${String(isJsonFallbackEnabled()).padEnd(37)}║
║    Verbose Logging:    ${String(isVerboseLoggingEnabled()).padEnd(37)}║
╚════════════════════════════════════════════════════════════════╝
`);
}
