/**
 * Environment Classification
 *
 * Classifies audio environment from spectral features.
 *
 * @module fft-analyzer/environment
 */
import type { SpectralAnalysis, SpectralEnvironment } from './types.js';
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
export declare function classifyEnvironment(spectrum: SpectralAnalysis): SpectralEnvironment;
//# sourceMappingURL=environment.d.ts.map