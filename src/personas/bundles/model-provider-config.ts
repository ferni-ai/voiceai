/**
 * Model Provider Dependency Injection Configuration
 *
 * This module provides DI for model provider information to avoid
 * architecture layer violations (personas L70 cannot import from agents L100).
 *
 * The agents layer calls `configureModelProvider()` during initialization
 * to inject the actual model provider configuration.
 *
 * @see src/memory/CLAUDE.md for the DI pattern documentation
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ModelProviderConfig' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for which prompt modules to include
 * (mirrors src/agents/model-provider/types.ts PromptModuleConfig)
 */
export interface PromptModuleConfig {
  /** Include shared/function-calling-base.md */
  includeFunctionCallingBase: boolean;
  /** Include persona-specific identity/function-calling-specialty.md */
  includeFunctionCallingSpecialty: boolean;
  /** Include shared/model-base-instructions.md */
  includeModelBaseInstructions: boolean;
  /** Use minimal instructions instead of full model-base-instructions */
  useMinimalInstructions: boolean;
}

/**
 * Provider information needed by personas layer
 */
export interface ModelProviderInfo {
  /** Provider identifier */
  id: string;
  /** Log prefix for debugging */
  logPrefix: string;
  /** Prompt module configuration */
  promptModules: PromptModuleConfig;
}

/**
 * Configuration getter function type
 */
export type ModelProviderGetter = () => ModelProviderInfo;

// ============================================================================
// STATE
// ============================================================================

let providerGetter: ModelProviderGetter | null = null;

// Default configuration when not injected (assumes JSON workaround needed)
const DEFAULT_CONFIG: ModelProviderInfo = {
  id: 'unknown',
  logPrefix: '🤖',
  promptModules: {
    includeFunctionCallingBase: true,
    includeFunctionCallingSpecialty: true,
    includeModelBaseInstructions: true,
    useMinimalInstructions: false,
  },
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure the model provider dependency.
 *
 * Called by agents layer during initialization to inject the actual
 * model provider implementation without creating a layer violation.
 *
 * @example
 * ```typescript
 * // In agents/voice-agent-entry.ts or multi-agent setup
 * import { getModelProvider } from '../agents/model-provider/index.js';
 * import { configureModelProvider } from '../personas/bundles/model-provider-config.js';
 *
 * configureModelProvider(() => {
 *   const provider = getModelProvider();
 *   return {
 *     id: provider.id,
 *     logPrefix: provider.getLogPrefix(),
 *     promptModules: provider.getPromptModules(),
 *   };
 * });
 * ```
 */
export function configureModelProvider(getter: ModelProviderGetter): void {
  providerGetter = getter;
  log.info('Model provider dependency configured for personas layer');
}

/**
 * Get the current model provider info.
 * Returns default config if not configured.
 */
export function getModelProviderInfo(): ModelProviderInfo {
  if (!providerGetter) {
    log.debug('Model provider not configured, using defaults');
    return DEFAULT_CONFIG;
  }

  try {
    return providerGetter();
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get model provider info');
    return DEFAULT_CONFIG;
  }
}

/**
 * Check if model provider is configured
 */
export function isModelProviderConfigured(): boolean {
  return providerGetter !== null;
}

/**
 * Reset configuration (for testing)
 */
export function resetModelProviderConfig(): void {
  providerGetter = null;
}
