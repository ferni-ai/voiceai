/**
 * The mastering chain after TTS (warmth, compression, de-esser, limiter) is
 * opt-in: POST_TTS_ENHANCEMENT_ENABLED=true turns it on. It re-masters audio
 * Cartesia already masters, and in a loudness-matched blind A/B on Ferni's
 * voice (2026-10-04) it was never preferred: raw 2 of 6, can't tell 4 of 6.
 *
 * @module agents/shared/performance/post-tts-chain
 */
export function postTtsChainEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POST_TTS_ENHANCEMENT_ENABLED === 'true';
}
