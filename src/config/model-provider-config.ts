/**
 * Model Provider Config (Level 10 - Config)
 *
 * Pure environment-variable checks for which LLM provider is active.
 * Use this from domain layers (tools, intelligence, speech) to avoid
 * importing from the application layer (agents/).
 *
 * For full provider instance and factory, use agents/model-provider from application layer only.
 *
 * @module config/model-provider-config
 */

/**
 * Supported model provider identifiers (must stay in sync with agents/model-provider/types.js)
 */
export type ModelProviderIdSync = 'openai-realtime' | 'gemini-live' | 'qwen3-omni';

/**
 * Get the active provider ID from environment only (no singleton, no agent code).
 *
 * Use from domain layers when you only need to know which provider is configured.
 */
export function getProviderIdSync(): ModelProviderIdSync {
  if (process.env.USE_QWEN3_OMNI === 'true') return 'qwen3-omni';
  return process.env.USE_OPENAI_REALTIME === 'true' ? 'openai-realtime' : 'gemini-live';
}

/**
 * Check if OpenAI Realtime is configured (env only).
 */
export function isUsingOpenAI(): boolean {
  return getProviderIdSync() === 'openai-realtime';
}

/**
 * Check if Gemini Live is configured (env only).
 */
export function isUsingGemini(): boolean {
  return getProviderIdSync() === 'gemini-live';
}

/**
 * Check if Qwen3-Omni is configured (env only).
 */
export function isUsingQwen3Omni(): boolean {
  return getProviderIdSync() === 'qwen3-omni';
}
