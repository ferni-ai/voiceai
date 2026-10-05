/**
 * When a speaker-embedding similarity may count as identity.
 *
 * Only a neural (ECAPA-TDNN) embedding compared with a profile enrolled from
 * neural embeddings can verify or identify anyone. DSP voice features do not
 * separate speakers (measured 2026-10-04 on six TTS voices: EER 49.9%, every
 * cosine about 0.999), so with them any voice "matches" any profile above its
 * 0.5-0.9 threshold. Vectors from different methods are not comparable at all.
 *
 * Profiles with no recorded method predate this rule. The neural model never
 * loaded in any image before it (the ferni-speaker addon was never built), so
 * they hold DSP vectors and are refused until re-enrolled.
 *
 * Refusing means unverified / unknown speaker: less personal behavior, never more.
 */

export type EmbeddingMethod = 'neural' | 'dsp';

/** A profile is neural only if every one of its samples is. */
export function profileEmbeddingMethod(
  samples: ReadonlyArray<{ method?: EmbeddingMethod }>
): EmbeddingMethod {
  return samples.length > 0 && samples.every((s) => s.method === 'neural') ? 'neural' : 'dsp';
}

/** Why this comparison cannot count as a voice match, or null when it can. */
export function voiceMatchRefusal(
  queryMethod: EmbeddingMethod,
  profileMethod: EmbeddingMethod | undefined
): string | null {
  if (queryMethod !== 'neural') return 'Voice matching needs the neural speaker model';
  if (profileMethod !== 'neural') {
    return 'Voice profile was not enrolled with the neural speaker model';
  }
  return null;
}

/**
 * A profile that cannot verify anyone today but would after a fresh enrollment:
 * this process runs the neural model and the profile is not neural. With no
 * neural model here, re-enrolling would only make another DSP profile, so false.
 */
export function needsNeuralReenrollment(
  profileMethod: EmbeddingMethod | undefined,
  activeMethod: EmbeddingMethod
): boolean {
  return activeMethod === 'neural' && profileMethod !== 'neural';
}
