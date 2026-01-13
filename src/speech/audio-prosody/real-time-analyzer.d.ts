/**
 * Real-Time Audio Analyzer
 *
 * Optimized for streaming audio analysis with:
 * - Ring buffer for continuous audio processing
 * - Incremental feature extraction (no waiting for full utterance)
 * - Lower latency than batch analysis
 * - Memory-efficient sliding window approach
 *
 * Use this for real-time voice emotion detection during speech,
 * rather than waiting for the user to finish speaking.
 *
 * @module real-time-analyzer
 */
import type { ProsodyFeatures } from './types.js';
export interface RealTimeAnalyzerConfig {
    /** Sample rate in Hz (default: 16000) */
    sampleRate: number;
    /** Ring buffer size in samples (default: 3 seconds worth) */
    bufferSizeSamples: number;
    /** Analysis window size in samples (default: 512) */
    windowSize: number;
    /** Hop size between windows in samples (default: 256) */
    hopSize: number;
    /** Minimum samples before first analysis */
    minSamplesForAnalysis: number;
}
export interface PartialProsodyFeatures {
    /** Estimated pitch (Hz) - may be noisy */
    pitchEstimate: number;
    /** Pitch confidence (0-1) */
    pitchConfidence: number;
    /** Current energy level (dB) */
    energyDb: number;
    /** Short-term energy variance */
    energyVariance: number;
    /** Zero crossing rate (indicator of voicing) */
    zeroCrossingRate: number;
    /** Is speech detected? */
    isSpeech: boolean;
    /** Estimated speaking rate (relative) */
    speakingRateEstimate: number;
    /** Current silence duration (ms) */
    currentSilenceMs: number;
    /** Pitch trend: 'rising', 'falling', 'stable' */
    pitchTrend: 'rising' | 'falling' | 'stable';
    /** Timestamp of analysis */
    timestamp: number;
}
export interface AnalyzerState {
    /** Total samples processed */
    totalSamplesProcessed: number;
    /** Current buffer fill level (0-1) */
    bufferFillLevel: number;
    /** Time since last speech (ms) */
    timeSinceLastSpeech: number;
    /** Is currently in speech segment */
    isInSpeech: boolean;
    /** Number of analyses performed */
    analysisCount: number;
}
export declare const DEFAULT_REALTIME_CONFIG: RealTimeAnalyzerConfig;
export declare class RealTimeAudioAnalyzer {
    private readonly config;
    private readonly ringBuffer;
    private writeIndex;
    private samplesInBuffer;
    private totalSamplesProcessed;
    private analysisCount;
    private lastSpeechTimestamp;
    private isInSpeech;
    private speechStartTimestamp;
    private pitchHistory;
    private energyHistory;
    private readonly maxHistorySize;
    private currentEstimate;
    constructor(config?: Partial<RealTimeAnalyzerConfig>);
    /**
     * Process a chunk of audio samples
     * Call this as audio frames arrive
     *
     * @param samples - Float32Array of audio samples (normalized -1 to 1)
     * @returns Partial prosody features if enough data, null otherwise
     */
    processChunk(samples: Float32Array): PartialProsodyFeatures | null;
    /**
     * Get the current estimated prosody features
     * Returns the most recent analysis result
     */
    getCurrentEstimate(): PartialProsodyFeatures | null;
    /**
     * Get full prosody features from accumulated data
     * Use this at end of utterance for final analysis
     */
    getFullFeatures(): ProsodyFeatures;
    /**
     * Get current analyzer state
     */
    getState(): AnalyzerState;
    /**
     * Reset the analyzer state
     */
    reset(): void;
    /**
     * Analyze the current window of audio
     */
    private analyzeCurrentWindow;
    /**
     * Get the most recent window of samples from ring buffer
     */
    private getRecentWindow;
    /**
     * Get all buffer contents in order
     */
    private getBufferContents;
    /**
     * Calculate energy of a signal window (SIMD-accelerated when available)
     */
    private calculateEnergy;
    /**
     * Calculate zero crossing rate (SIMD-accelerated when available)
     */
    private calculateZeroCrossingRate;
    /**
     * Detect if current window contains speech (uses native VAD when available)
     */
    private detectSpeech;
    /**
     * Pitch estimation using YIN algorithm (SIMD-accelerated ~40x faster)
     */
    private estimatePitch;
    /**
     * Calculate pitch trend from history
     */
    private calculatePitchTrend;
    /**
     * Estimate speech rate from energy patterns
     */
    private estimateSpeechRate;
    /**
     * Count pauses in speech
     */
    private countPauses;
    /**
     * Count peaks in a signal
     */
    private countPeaks;
    /**
     * Calculate mean of array (uses native SIMD when available)
     */
    private calculateMean;
    /**
     * Calculate variance of array (uses native SIMD when available)
     */
    private calculateVariance;
    /**
     * Calculate jitter (pitch variation)
     */
    private calculateJitter;
    /**
     * Calculate shimmer (amplitude variation)
     */
    private calculateShimmer;
    /**
     * Estimate breathiness from spectral tilt
     */
    private estimateBreathiness;
}
/**
 * Get or create a real-time analyzer for a session
 */
export declare function getRealTimeAnalyzer(sessionId: string, config?: Partial<RealTimeAnalyzerConfig>): RealTimeAudioAnalyzer;
/**
 * Reset analyzer for a session
 */
export declare function resetRealTimeAnalyzer(sessionId: string): void;
/**
 * Reset all analyzers
 */
export declare function resetAllRealTimeAnalyzers(): void;
/**
 * Get count of active analyzers
 */
export declare function getActiveRealTimeAnalyzerCount(): number;
export default RealTimeAudioAnalyzer;
//# sourceMappingURL=real-time-analyzer.d.ts.map