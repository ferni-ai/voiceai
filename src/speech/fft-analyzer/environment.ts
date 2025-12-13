/**
 * Environment Classification
 *
 * Classifies audio environment from spectral features.
 *
 * @module fft-analyzer/environment
 */

import type { SpectralAnalysis, SpectralEnvironment } from './types.js';

// ============================================================================
// ENVIRONMENT CLASSIFICATION
// ============================================================================

/**
 * Classify environment from spectral features
 *
 * Uses band energy distribution to identify:
 * - Speech: energy concentrated in 300-3400 Hz
 * - Music: broad spectrum with bass and brilliance
 * - Traffic: low frequency rumble
 * - Wind: broadband noise with high centroid
 * - Crowd: diffuse mid-frequency energy
 *
 * @param spectrum - Spectral analysis result
 * @returns Environment classification
 */
export function classifyEnvironment(spectrum: SpectralAnalysis): SpectralEnvironment {
  const { bandEnergies, spectralCentroid } = spectrum;

  // Feature extraction for classification
  const features = {
    // Speech indicators: energy concentrated in 300-3400 Hz (telephone band)
    speechLikelihood: (bandEnergies.lowMid + bandEnergies.mid + bandEnergies.highMid) / 3,

    // Music indicators: broad spectrum with strong bass and brilliance
    musicLikelihood: (bandEnergies.bass + bandEnergies.brilliance) / 2,

    // Traffic indicators: low frequency rumble
    trafficLikelihood: bandEnergies.subBass + bandEnergies.bass * 0.5,

    // Wind indicators: broadband noise with high spectral centroid
    windLikelihood: spectralCentroid > 2000 && bandEnergies.presence > 0.3 ? 0.7 : 0.2,

    // Crowd indicators: diffuse mid-frequency energy
    crowdLikelihood: bandEnergies.mid > 0.4 && bandEnergies.highMid > 0.3 ? 0.6 : 0.2,
  };

  // Determine primary environment
  const scores: Array<{ env: SpectralEnvironment['environment']; score: number }> = [
    { env: 'quiet', score: 1 - Math.max(...Object.values(features)) },
    { env: 'speech', score: features.speechLikelihood },
    { env: 'music', score: features.musicLikelihood },
    { env: 'traffic', score: features.trafficLikelihood },
    { env: 'wind', score: features.windLikelihood },
    { env: 'crowd', score: features.crowdLikelihood },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // Calculate overall noise floor (inverse of quiet score)
  const noiseFloor = 1 - scores.find((s) => s.env === 'quiet')!.score;

  // Estimate SNR based on speech band vs rest
  const speechEnergy = bandEnergies.mid + bandEnergies.highMid;
  const noiseEnergy = bandEnergies.subBass + bandEnergies.bass + bandEnergies.brilliance;
  const snrLinear = speechEnergy / Math.max(noiseEnergy, 0.001);
  const snrEstimate = 10 * Math.log10(snrLinear);

  return {
    environment: best.env,
    confidence: best.score,
    hasSpeech: features.speechLikelihood > 0.5,
    hasMusic: features.musicLikelihood > 0.4,
    noiseFloor,
    snrEstimate: Math.max(-20, Math.min(60, snrEstimate)), // Clamp to reasonable range
  };
}

