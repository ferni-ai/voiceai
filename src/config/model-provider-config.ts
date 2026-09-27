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
  | 'gemini-live'
  | 'qwen3-omni'
  | 'qwen3-thinker-local';

/**
 * Get the active provider ID from environment only (no singleton, no agent code).
 *
 * Use from domain layers when you only need to know which provider is configured.
 */
export function getProviderIdSync(): ModelProviderIdSync {
  if (process.env.USE_QWEN3_THINKER_LOCAL === 'true') return 'qwen3-thinker-local';
  if (process.env.USE_QWEN3_OMNI === 'true') return 'qwen3-omni';
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

/**
 * Check if any Qwen3-Omni variant is configured (env only).
 * Includes both full Qwen3-Omni and thinker-local.
 */
export function isUsingQwen3Omni(): boolean {
  const id = getProviderIdSync();
  return id === 'qwen3-omni' || id === 'qwen3-thinker-local';
}

/**
 * Check if Qwen3-TTS should be used (only full Qwen3-Omni, not thinker-local).
 * thinker-local uses Cartesia TTS; full Qwen3-Omni uses Qwen3-TTS.
 */
export function isUsingQwen3TTS(): boolean {
  return getProviderIdSync() === 'qwen3-omni';
}
