/**
 * FFT Analyzer Service
 *
 * Session-scoped service for spectral analysis.
 *
 * @module fft-analyzer/service
 */
import type { LaughterSpectralFeatures, SpectralAnalysis, SpectralEnvironment } from './types.js';
/**
 * Session-scoped FFT analyzer service
 *
 * Maintains state across frames for:
 * - Spectral flux calculation
 * - Burst pattern detection
 * - Activity level tracking
 */
export declare class FFTAnalyzerService {
    private sessionId;
    private previousSpectrum;
    private spectralFluxHistory;
    private readonly maxFluxHistory;
    constructor(sessionId: string);
    /**
     * Analyze audio frame with full spectral analysis
     *
     * @param samples - Audio samples (Int16Array)
     * @param sampleRate - Sample rate (default 16000)
     * @returns Spectrum, environment, and laughter analysis
     */
    analyze(samples: Int16Array, sampleRate?: number): {
        spectrum: SpectralAnalysis;
        environment: SpectralEnvironment;
        laughter: LaughterSpectralFeatures;
    };
    /**
     * Calculate spectral flux (measure of spectral change)
     *
     * Only counts increases for onset detection.
     *
     * @param current - Current magnitude spectrum
     * @param previous - Previous magnitude spectrum
     * @returns Spectral flux value
     */
    private calculateSpectralFlux;
    /**
     * Get average spectral flux (for activity detection)
     *
     * @returns Average flux over recent frames
     */
    getAverageFlux(): number;
    /**
     * Reset analyzer state
     */
    reset(): void;
}
/**
 * Get FFT analyzer for a session
 */
export declare function getFFTAnalyzer(sessionId: string): FFTAnalyzerService;
/**
 * Reset FFT analyzer for a session
 */
export declare function resetFFTAnalyzer(sessionId: string): void;
/**
 * Get count of active FFT analyzer instances
 */
export declare function getActiveFFTAnalyzerCount(): number;
//# sourceMappingURL=service.d.ts.map