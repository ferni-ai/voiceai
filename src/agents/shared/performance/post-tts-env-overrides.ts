/**
 * POST_TTS_* environment switches applied over the post-TTS preset.
 *
 * @module agents/shared/performance/post-tts-env-overrides
 */

import type { PostTTSConfig } from './post-tts-transform.js';

/**
 * POST_TTS_* switches that override the preset. The live path applies the
 * betterThanHuman preset over DEFAULT_CONFIG, so the env defaults in
 * DEFAULT_CONFIG (post-tts-transform.ts) were overwritten and setting e.g.
 * POST_TTS_JITTER=true did nothing. These apply last, and only for variables
 * that are actually set, so an unset variable leaves the preset alone.
 */
export const POST_TTS_ENV_SWITCHES: Readonly<Record<string, keyof PostTTSConfig>> = {
  POST_TTS_BREATH: 'enableBreath',
  POST_TTS_WARMTH: 'enableWarmth',
  POST_TTS_DEESSER: 'enableDeEsser',
  POST_TTS_COMPRESSION: 'enableCompression',
  POST_TTS_PRESENCE: 'enablePresence',
  POST_TTS_AMPLITUDE_JITTER: 'enableAmplitudeJitter',
  POST_TTS_PITCH_DRIFT: 'enablePitchDrift',
  POST_TTS_NOISE_FLOOR: 'enableNoiseFloor',
  POST_TTS_SOLA_PITCH: 'useSolaPitch',
  POST_TTS_EMOTION_PROSODY: 'enableEmotionProsody',
  POST_TTS_MICRO_PITCH: 'enableMicroPitch',
  POST_TTS_ADAPTIVE_PACING: 'enableAdaptivePacing',
  POST_TTS_VOCAL_FRY: 'enableVocalFry',
  POST_TTS_LIP_SMACKS: 'enableLipSmacks',
  POST_TTS_TEMPO_VARIATION: 'enableTempoVariation',
  POST_TTS_ONSET_SOFTENING: 'enableOnsetSoftening',
  POST_TTS_JITTER: 'enableJitter',
  POST_TTS_SHIMMER: 'enableShimmer',
  POST_TTS_HNR_MODULATION: 'enableHnrModulation',
  POST_TTS_SUBGLOTTAL: 'enableSubglottalResonance',
  POST_TTS_SMILE_FORMANTS: 'enableSmileFormants',
  POST_TTS_GLOTTALIZATION: 'enableGlottalization',
  POST_TTS_HESITATION: 'enableHesitationSounds',
  POST_TTS_LOMBARD: 'enableLombardEffect',
  POST_TTS_REGISTER: 'enableRegisterTransitions',
  POST_TTS_PHARYNGEAL: 'enablePharyngealConstriction',
};

export function postTtsEnvOverrides(
  env: Record<string, string | undefined> = process.env
): Partial<PostTTSConfig> {
  const out: Partial<PostTTSConfig> = {};
  for (const [name, key] of Object.entries(POST_TTS_ENV_SWITCHES)) {
    const v = env[name]?.trim().toLowerCase();
    if (v === 'true' || v === '1') (out as Record<string, boolean>)[key] = true;
    else if (v === 'false' || v === '0') (out as Record<string, boolean>)[key] = false;
  }
  return out;
}

/**
 * The mastering chain (warmth, compression, de-esser, limiter) is opt-in:
 * POST_TTS_ENHANCEMENT_ENABLED=true turns it on. It re-masters audio Cartesia
 * already masters, and in a loudness-matched blind A/B on Ferni's voice
 * (2026-10-04) it was never preferred: raw 2 of 6, can't tell 4 of 6.
 */
export function postTtsChainEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POST_TTS_ENHANCEMENT_ENABLED === 'true';
}
