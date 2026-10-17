/**
 * Gated RMS level of a time-domain audio frame.
 *
 * The frequency-domain volume in audio.service (max-weighted, x3, no gate)
 * saturates on speech and never reaches zero on line noise. RMS over the
 * waveform tracks loudness the way an ear does, and the gate keeps hiss at
 * zero. Used by ferni:lid-blend; re-exported from audio.service so other
 * avatar motion (speech beats) can reuse it.
 */

/** RMS below this (0-1 full scale) counts as silence. */
export const RMS_NOISE_GATE = 0.02;
/** Gain after the gate: conversational speech (RMS ~0.05-0.25) maps to ~0.1-0.9. */
export const RMS_GAIN = 4;

/** Gated RMS (0-1) of 8-bit time-domain samples, where 128 is silence. */
export function computeGatedRms(
  samples: ArrayLike<number>,
  gate: number = RMS_NOISE_GATE,
  gain: number = RMS_GAIN
): number {
  if (samples.length === 0) return 0;
  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const centred = ((samples[i] ?? 128) - 128) / 128;
    sumOfSquares += centred * centred;
  }
  const rms = Math.sqrt(sumOfSquares / samples.length);
  if (rms <= gate) return 0;
  return Math.min(1, (rms - gate) * gain);
}
