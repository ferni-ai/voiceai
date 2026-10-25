/**
 * The arithmetic behind voice prosody baselines (moved from voice-prosody-learning.ts unchanged).
 *
 * @module services/trust-systems/voice-prosody-math
 */
import type { VoiceCharacteristics } from './voice-prosody-learning.js';

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

export function calculateVarianceScore(chars: VoiceCharacteristics[]): number {
  // Lower variance = more consistent baseline = higher score
  const keys: Array<keyof VoiceCharacteristics> = ['pitchMean', 'energyMean', 'speakingRate'];
  const variances = keys.map((k) => {
    const values = chars.map((c) => c[k]);
    const avg = average(values);
    if (avg === 0) return 0;
    return calculateStdDev(values) / avg; // Coefficient of variation
  });

  return Math.min(1, average(variances));
}
