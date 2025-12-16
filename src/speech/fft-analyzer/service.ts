/**
 * FFT Analyzer Service
 *
 * Session-scoped service for spectral analysis.
 *
 * @module fft-analyzer/service
 */

import { getLogger } from '../../utils/safe-logger.js';
import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
import { classifyEnvironment } from './environment.js';
import { analyzeLaughterSpectral } from './laughter.js';
import { analyzeSpectrum } from './spectral-analysis.js';
import type { LaughterSpectralFeatures, SpectralAnalysis, SpectralEnvironment } from './types.js';

const log = getLogger().child({ module: 'FFTAnalyzer' });

// ============================================================================
// FFT ANALYZER SERVICE
// ============================================================================

/**
 * Session-scoped FFT analyzer service
 *
 * Maintains state across frames for:
 * - Spectral flux calculation
 * - Burst pattern detection
 * - Activity level tracking
 */
export class FFTAnalyzerService {
  private previousSpectrum: SpectralAnalysis | null = null;
  private spectralFluxHistory: number[] = [];
  private readonly maxFluxHistory = 10;

  constructor(private sessionId: string) {
    log.debug({ sessionId }, '📊 FFT analyzer service initialized');
  }

  /**
   * Analyze audio frame with full spectral analysis
   *
   * @param samples - Audio samples (Int16Array)
   * @param sampleRate - Sample rate (default 16000)
   * @returns Spectrum, environment, and laughter analysis
   */
  analyze(
    samples: Int16Array,
    sampleRate = 16000
  ): {
    spectrum: SpectralAnalysis;
    environment: SpectralEnvironment;
    laughter: LaughterSpectralFeatures;
  } {
    // Perform FFT analysis
    const spectrum = analyzeSpectrum(samples, sampleRate);

    // Calculate spectral flux if we have previous frame
    if (this.previousSpectrum) {
      spectrum.spectralFlux = this.calculateSpectralFlux(
        spectrum.magnitudes,
        this.previousSpectrum.magnitudes
      );

      // Track flux history for burst detection
      this.spectralFluxHistory.push(spectrum.spectralFlux);
      if (this.spectralFluxHistory.length > this.maxFluxHistory) {
        this.spectralFluxHistory.shift();
      }
    }

    // Classify environment
    const environment = classifyEnvironment(spectrum);

    // Analyze for laughter
    const laughter = analyzeLaughterSpectral(spectrum, this.previousSpectrum || undefined);

    // Store for next frame
    this.previousSpectrum = spectrum;

    return { spectrum, environment, laughter };
  }

  /**
   * Calculate spectral flux (measure of spectral change)
   *
   * Only counts increases for onset detection.
   *
   * @param current - Current magnitude spectrum
   * @param previous - Previous magnitude spectrum
   * @returns Spectral flux value
   */
  private calculateSpectralFlux(current: Float32Array, previous: Float32Array): number {
    let flux = 0;
    const len = Math.min(current.length, previous.length);

    for (let i = 0; i < len; i++) {
      const diff = current[i] - previous[i];
      flux += diff > 0 ? diff : 0; // Only count increases (onset detection)
    }

    return flux / len;
  }

  /**
   * Get average spectral flux (for activity detection)
   *
   * @returns Average flux over recent frames
   */
  getAverageFlux(): number {
    if (this.spectralFluxHistory.length === 0) return 0;
    return this.spectralFluxHistory.reduce((a, b) => a + b, 0) / this.spectralFluxHistory.length;
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.previousSpectrum = null;
    this.spectralFluxHistory = [];
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const fftAnalyzerRegistry = createSessionRegistry(
  (sessionId: string) => new FFTAnalyzerService(sessionId),
  { name: 'FFTAnalyzer', cleanup: (analyzer) => analyzer.reset(), verbose: false }
);

registerGlobalRegistry(fftAnalyzerRegistry);

/**
 * Get FFT analyzer for a session
 */
export function getFFTAnalyzer(sessionId: string): FFTAnalyzerService {
  return fftAnalyzerRegistry.get(sessionId);
}

/**
 * Reset FFT analyzer for a session
 */
export function resetFFTAnalyzer(sessionId: string): void {
  fftAnalyzerRegistry.reset(sessionId);
  log.debug({ sessionId }, '📊 FFT analyzer service reset');
}

/**
 * Get count of active FFT analyzer instances
 */
export function getActiveFFTAnalyzerCount(): number {
  return fftAnalyzerRegistry.getActiveCount();
}
