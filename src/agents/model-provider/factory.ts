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
import { GeminiLiveProvider } from './gemini-live.js';
import { Qwen3OmniProvider } from './qwen3-omni.js';
import { LocalPipelineProvider } from './local-pipeline.js';
import { OmniPipelineProvider, isOmniPipelineEnabled } from './omni-pipeline.js';

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
    const useOmniPipeline = isOmniPipelineEnabled();
    const useLocalPipeline = process.env.USE_LOCAL_PIPELINE === 'true';
    const useOpenAI = process.env.USE_OPENAI_REALTIME === 'true';
    const useQwen3Omni = process.env.USE_QWEN3_OMNI === 'true';
    const useQwen3ThinkerLocal = process.env.USE_QWEN3_THINKER_LOCAL === 'true';

    // omni-pipeline: Rust FullOmniPipeline (Candle Thinker) — fully local inference
    if (useOmniPipeline) {
      cachedProvider = new OmniPipelineProvider();
      log.info(
        {
          providerId: cachedProvider.id,
          serverUrl: process.env.OMNI_PIPELINE_URL || 'http://127.0.0.1:8505',
        },
        '🦀 Using Omni Pipeline (local Rust/Candle inference)'
      );
    } else if (useLocalPipeline) {
      const ttsProvider = process.env.TTS_PROVIDER || 'sonata';
      cachedProvider = new LocalPipelineProvider();
      log.info(
        {
          providerId: cachedProvider.id,
          ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
          model: process.env.OLLAMA_MODEL || 'qwen3:8b',
          ttsProvider,
        },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    } else if (useQwen3ThinkerLocal) {
      if (!process.env.QWEN3_OMNI_URL) {
        process.env.QWEN3_OMNI_URL = 'http://127.0.0.1:8000';
      }
      cachedProvider = new Qwen3OmniProvider('qwen3-thinker-local');
      log.info(
        { providerId: cachedProvider.id, url: process.env.QWEN3_OMNI_URL },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    } else if (useQwen3Omni) {
      cachedProvider = new Qwen3OmniProvider('qwen3-omni');
      const backend = isQwen3OmniCandleBackend() ? 'candle (in-process)' : 'HTTP';
      log.info(
        { providerId: cachedProvider.id, backend },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName} (${backend})`
      );
      if (isQwen3OmniCandleBackend()) {
        log.info('Using Candle NAPI pipeline (in-process)');
      }
    } else if (useOpenAI) {
      cachedProvider = new OpenAIRealtimeProvider();
      log.info(
        { providerId: cachedProvider.id },
        `${cachedProvider.getLogPrefix()} Model provider initialized: ${cachedProvider.displayName}`
      );
    } else {
      cachedProvider = new GeminiLiveProvider();
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
  if (isOmniPipelineEnabled()) return 'omni-pipeline';
  if (process.env.USE_LOCAL_PIPELINE === 'true') return 'local-pipeline';
  if (process.env.USE_QWEN3_THINKER_LOCAL === 'true') return 'qwen3-thinker-local';
  if (process.env.USE_QWEN3_OMNI === 'true') return 'qwen3-omni';
  return process.env.USE_OPENAI_REALTIME === 'true' ? 'openai-realtime' : 'gemini-live';
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
    case 'openai-realtime':
      return new OpenAIRealtimeProvider();
    case 'gemini-live':
      return new GeminiLiveProvider();
    case 'qwen3-omni':
    case 'qwen3-thinker-local':
      return new Qwen3OmniProvider();
    case 'local-pipeline':
      return new LocalPipelineProvider();
    case 'omni-pipeline':
      return new OmniPipelineProvider();
    default:
      throw new Error(`Unknown provider ID: ${id}`);
  }
}

/**
 * Check if using any Qwen3-Omni variant (LLM selection).
 */
export function isUsingQwen3Omni(): boolean {
  const id = getProviderIdSync();
  return id === 'qwen3-omni' || id === 'qwen3-thinker-local';
}

/**
 * Check if Qwen3-TTS should be used. Only true for full Qwen3-Omni, NOT thinker-local.
 * thinker-local uses Cartesia TTS (paired with local Thinker for LLM only).
 */
export function isUsingQwen3TTS(): boolean {
  return getProviderIdSync() === 'qwen3-omni';
}

/**
 * When USE_QWEN3_OMNI=true and QWEN3_OMNI_BACKEND=candle, use in-process Candle NAPI
 * (NativeOmniRealtimeModel). Otherwise use HTTP-based adapters.
 */
export function isQwen3OmniCandleBackend(): boolean {
  return (
    (process.env.USE_QWEN3_OMNI === 'true' || process.env.USE_QWEN3_THINKER_LOCAL === 'true') &&
    process.env.QWEN3_OMNI_BACKEND === 'candle'
  );
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

/**
 * Check if using local pipeline (Kyutai STT + Ollama LLM + Cartesia TTS).
 */
export function isUsingLocalPipeline(): boolean {
  return getProviderIdSync() === 'local-pipeline';
}

/**
 * Check if using Omni Pipeline (Rust FullOmniPipeline with Candle Thinker).
 */
export function isUsingOmniPipeline(): boolean {
  return getProviderIdSync() === 'omni-pipeline';
}

export { OpenAIRealtimeProvider } from './openai-realtime.js';
export { GeminiLiveProvider } from './gemini-live.js';
export { Qwen3OmniProvider } from './qwen3-omni.js';
export { LocalPipelineProvider } from './local-pipeline.js';
export { OmniPipelineProvider } from './omni-pipeline.js';