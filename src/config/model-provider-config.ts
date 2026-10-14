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
  'cartesia-cascade' | 'gemini-native-audio' | 'openai-realtime' | 'gemini-live';

/**
 * VOICE_PIPELINE picks the voice pipeline: `openai-realtime`, `gemini-live` or
 * `gemini-native-audio`. Unset or anything else is the Cartesia cascade, which
 * dev and prod run. This is the only place it is read; the factory, the
 * session label and the Gemini configs all ask here. USE_OPENAI_REALTIME=true
 * used to pick OpenAI Realtime through a second, separate check; it is no
 * longer read (use VOICE_PIPELINE=openai-realtime).
 */
export function voicePipeline(
  env: Readonly<Record<string, string | undefined>> = process.env
): ModelProviderIdSync {
  const value = env.VOICE_PIPELINE;
  return value === 'openai-realtime' || value === 'gemini-live' || value === 'gemini-native-audio'
    ? value
    : 'cartesia-cascade';
}

/**
 * Get the active provider ID from environment only (no singleton, no agent code).
 *
 * Use from domain layers when you only need to know which provider is configured.
 */
export function getProviderIdSync(
  env: Record<string, string | undefined> = process.env
): ModelProviderIdSync {
  return voicePipeline(env);
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
