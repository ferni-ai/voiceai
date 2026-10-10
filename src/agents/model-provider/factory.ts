/**
 * Model Provider Factory
 *
 * Creates and caches the appropriate ModelProvider based on environment configuration.
 * Uses singleton pattern to ensure consistent provider across the application.
 *
 * @module agents/model-provider/factory
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ModelProvider, ModelProviderId } from './types.js';
import { OpenAIRealtimeProvider } from './openai-realtime.js';
import { CartesiaCascadeProvider } from './cartesia-cascade.js';
import { GeminiNativeAudioProvider } from './gemini-native-audio.js';
import { GeminiLiveProvider } from './gemini-live.js';

const log = createLogger({ module: 'ModelProviderFactory' });

// ============================================================================
// SINGLETON CACHE
// ============================================================================

/**
 * Cached provider instance (singleton)
 */
let cachedProvider: ModelProvider | null = null;

/**
 * Flag to track if provider was set via test injection
 */
let isTestInjection = false;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Get the current model provider.
 *
 * Returns a singleton instance based on the USE_OPENAI_REALTIME environment variable.
 * The provider is cached after first creation for consistent behavior.
 *
 * @example
 * ```typescript
 * const provider = getModelProvider();
 *
 * // Check capabilities
 * if (provider.hasNativeFunctionCalling()) {
 *   // Skip JSON workaround
 * }
 *
 * // Create model
 * const llm = await provider.createLLMModel(config);
 * ```
 */
export function getModelProvider(): ModelProvider {
  if (!cachedProvider) {
    const useOpenAI = process.env.USE_OPENAI_REALTIME === 'true';

    if (useOpenAI) {
      cachedProvider = new OpenAIRealtimeProvider();
      log.info(
        { providerId: cachedProvider.id },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    } else if (process.env.VOICE_PIPELINE === 'gemini-native-audio') {
      cachedProvider = new GeminiNativeAudioProvider();
      log.info(
        { providerId: cachedProvider.id },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    } else if (process.env.VOICE_PIPELINE === 'gemini-live') {
      // Legacy opt-in only: the Gemini Live text-output model Ferni used is retired.
      cachedProvider = new GeminiLiveProvider();
      log.info(
        { providerId: cachedProvider.id },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    } else {
      cachedProvider = new CartesiaCascadeProvider();
      log.info(
        { providerId: cachedProvider.id },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    }
  }

  return cachedProvider;
}

/**
 * Get the provider ID without creating the full provider.
 *
 * Useful for quick checks without loading SDK dependencies.
 */
export function getProviderIdSync(): ModelProviderId {
  if (cachedProvider) {
    return cachedProvider.id;
  }
  if (process.env.USE_OPENAI_REALTIME === 'true') return 'openai-realtime';
  if (process.env.VOICE_PIPELINE === 'gemini-native-audio') return 'gemini-native-audio';
  return process.env.VOICE_PIPELINE === 'gemini-live' ? 'gemini-live' : 'cartesia-cascade';
}

/**
 * Check if using OpenAI Realtime without creating the provider.
 *
 * Useful for conditional imports and initialization.
 */
export function isUsingOpenAI(): boolean {
  return getProviderIdSync() === 'openai-realtime';
}

/**
 * Check if using Gemini Live without creating the provider.
 *
 * Useful for conditional imports and initialization.
 */
export function isUsingGemini(): boolean {
  return getProviderIdSync() === 'gemini-live';
}

// ============================================================================
// TEST INJECTION (for unit tests)
// ============================================================================

/**
 * Set the model provider for testing.
 *
 * This allows tests to inject mock providers without relying on environment variables.
 * Call clearModelProvider() in test teardown to reset.
 *
 * @example
 * ```typescript
 * // In test setup
 * const mockProvider = createMockProvider();
 * setModelProvider(mockProvider);
 *
 * // In test teardown
 * clearModelProvider();
 * ```
 */
export function setModelProvider(provider: ModelProvider): void {
  cachedProvider = provider;
  isTestInjection = true;
  log.debug(
    { providerId: provider.id, isTestInjection: true },
    'Model provider set via test injection'
  );
}

/**
 * Clear the cached model provider.
 *
 * Used in test teardown to reset state between tests.
 * Also useful if you need to reinitialize the provider at runtime.
 */
export function clearModelProvider(): void {
  const previousId = cachedProvider?.id;
  cachedProvider = null;
  isTestInjection = false;

  if (previousId) {
    log.debug({ previousProviderId: previousId }, 'Model provider cache cleared');
  }
}

/**
 * Check if the provider was set via test injection.
 *
 * Useful for debugging and logging.
 */
export function isTestInjectedProvider(): boolean {
  return isTestInjection;
}

// ============================================================================
// PROVIDER CREATION HELPERS
// ============================================================================

/**
 * Create a specific provider by ID.
 *
 * Useful when you need a specific provider regardless of environment.
 * Note: This does NOT cache the provider.
 */
export function createProvider(id: ModelProviderId): ModelProvider {
  switch (id) {
    case 'cartesia-cascade':
      return new CartesiaCascadeProvider();
    case 'gemini-native-audio':
      return new GeminiNativeAudioProvider();
    case 'openai-realtime':
      return new OpenAIRealtimeProvider();
    case 'gemini-live':
      return new GeminiLiveProvider();
    default:
      throw new Error(`Unknown provider ID: ${id}`);
  }
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export { OpenAIRealtimeProvider } from './openai-realtime.js';
export { GeminiLiveProvider } from './gemini-live.js';
