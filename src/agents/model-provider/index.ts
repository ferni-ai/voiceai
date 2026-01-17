/**
 * Model Provider Module
 *
 * Centralized abstraction for LLM provider differences.
 * Eliminates scattered environment variable checks throughout the codebase.
 *
 * ## Usage
 *
 * ```typescript
 * import { getModelProvider, isUsingOpenAI } from './model-provider/index.js';
 *
 * // Get the current provider
 * const provider = getModelProvider();
 *
 * // Check capabilities
 * if (provider.hasNativeFunctionCalling()) {
 *   // Skip JSON workaround
 * }
 *
 * // Get prompt configuration
 * const modules = provider.getPromptModules();
 * if (modules.includeFunctionCallingBase) {
 *   // Load JSON function-calling prompts
 * }
 *
 * // Create LLM model
 * const llm = await provider.createLLMModel({
 *   instructions: systemPrompt,
 *   temperature: 0.7,
 * });
 *
 * // Quick checks without loading provider
 * if (isUsingOpenAI()) {
 *   // OpenAI-specific initialization
 * }
 * ```
 *
 * ## Testing
 *
 * ```typescript
 * import { setModelProvider, clearModelProvider } from './model-provider/index.js';
 *
 * beforeEach(() => {
 *   setModelProvider(mockProvider);
 * });
 *
 * afterEach(() => {
 *   clearModelProvider();
 * });
 * ```
 *
 * @module agents/model-provider
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
  LLMModelConfig,
  TurnDetectionConfig,
} from './types.js';

export { hasNativeFunctionCalling, needsJsonWorkaround } from './types.js';

// ============================================================================
// PROVIDER EXPORTS
// ============================================================================

export { OpenAIRealtimeProvider } from './openai-realtime.js';
export { GeminiLiveProvider } from './gemini-live.js';

// ============================================================================
// FACTORY EXPORTS
// ============================================================================

export {
  getModelProvider,
  getProviderIdSync,
  isUsingOpenAI,
  isUsingGemini,
  setModelProvider,
  clearModelProvider,
  isTestInjectedProvider,
  createProvider,
} from './factory.js';
