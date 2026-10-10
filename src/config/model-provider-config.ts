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
 * Supported model provider identifiers (must stay in sync with agents/model-provider/types.ts)
 */
export type ModelProviderIdSync =
  | 'cartesia-cascade'
  | 'gemini-native-audio'
  | 'openai-realtime'
  | 'gemini-live';

/**
 * Get the active provider ID from environment only (no singleton, no agent code).
 *
 * Use from domain layers when you only need to know which provider is configured.
 */
export function getProviderIdSync(): ModelProviderIdSync {
  if (process.env.USE_OPENAI_REALTIME === 'true') return 'openai-realtime';
  // Keep in step with agents/model-provider/factory.ts getProviderIdSync.
  if (process.env.VOICE_PIPELINE === 'gemini-native-audio') return 'gemini-native-audio';
  return process.env.VOICE_PIPELINE === 'gemini-live' ? 'gemini-live' : 'cartesia-cascade';
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
