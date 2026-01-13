/**
 * FFT Analyzer for Audio Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Implements Fast Fourier Transform for spectral analysis of audio signals.
 * This enables:
 * 1. Better ambient environment detection (music vs speech vs noise)
 * 2. Improved prosody analysis (formant frequencies)
 * 3. More accurate laughter detection (spectral patterns)
 *
 * Uses Cooley-Tukey FFT algorithm - O(n log n) complexity.
 *
 * @module fft-analyzer
 */
export type { BandEnergies, Complex, EnvironmentType, LaughterSpectralFeatures, SpectralAnalysis, SpectralEnvironment, } from './types.js';
export { applyHanningWindow, clearFFTCaches, fft, getMagnitudeSpectrum } from './fft-core.js';
export { analyzeSpectrum, calculateBandEnergies } from './spectral-analysis.js';
export { classifyEnvironment } from './environment.js';
export { analyzeLaughterSpectral } from './laughter.js';
export { FFTAnalyzerService, getActiveFFTAnalyzerCount, getFFTAnalyzer, resetFFTAnalyzer, } from './service.js';
export { analyzeSpectrumNative, applyHanningWindowNative, fftNative, getMagnitudeSpectrumNative, getNativeFftInfo, getNativeFftLoadError, isNativeFftAvailable, getFftMetrics, logFftStatus, resetFftMetrics, type NativeFftLibraryInfo, type NativeFftResult, type NativeSpectralFeatures, } from './native-fft.js';
//# sourceMappingURL=index.d.ts.map