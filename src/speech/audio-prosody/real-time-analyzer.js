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
import { getLogger } from '../../utils/safe-logger.js';
import { detectPitch, calculateRms, calculateZcr, calculateMean as nativeCalculateMean, calculateVariance as nativeCalculateVariance, } from '../audio-dsp/index.js';
const log = getLogger().child({ module: 'RealTimeAudioAnalyzer' });
// ============================================================================
// CONFIGURATION
// ============================================================================
export const DEFAULT_REALTIME_CONFIG = {
    sampleRate: 16000,
    bufferSizeSamples: 16000 * 3, // 3 seconds
    windowSize: 512,
    hopSize: 256,
    minSamplesForAnalysis: 1024,
};
// Speech detection thresholds
const SPEECH_DETECTION = {
    ENERGY_THRESHOLD_DB: -40,
    ZCR_SPEECH_MAX: 0.3,
    ZCR_UNVOICED_MIN: 0.4,
    MIN_SPEECH_DURATION_MS: 100,
    MAX_SILENCE_IN_SPEECH_MS: 300,
};
// ============================================================================
// REAL-TIME AUDIO ANALYZER
// ============================================================================
export class RealTimeAudioAnalyzer {
    config;
    ringBuffer;
    writeIndex = 0;
    samplesInBuffer = 0;
    // State tracking
    totalSamplesProcessed = 0;
    analysisCount = 0;
    lastSpeechTimestamp = 0;
    isInSpeech = false;
    speechStartTimestamp = 0;
    // Feature history for trend detection
    pitchHistory = [];
    energyHistory = [];
    maxHistorySize = 20;
    // Cached estimates for current state
    currentEstimate = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_REALTIME_CONFIG, ...config };
        this.ringBuffer = new Float32Array(this.config.bufferSizeSamples);
        log.debug({
            sampleRate: this.config.sampleRate,
            bufferSizeMs: (this.config.bufferSizeSamples / this.config.sampleRate) * 1000,
            windowSizeMs: (this.config.windowSize / this.config.sampleRate) * 1000,
        }, '🎤 Real-time audio analyzer initialized');
    }
    /**
     * Process a chunk of audio samples
     * Call this as audio frames arrive
     *
     * @param samples - Float32Array of audio samples (normalized -1 to 1)
     * @returns Partial prosody features if enough data, null otherwise
     */
    processChunk(samples) {
        // Write samples to ring buffer
        for (let i = 0; i < samples.length; i++) {
            this.ringBuffer[this.writeIndex] = samples[i];
            this.writeIndex = (this.writeIndex + 1) % this.config.bufferSizeSamples;
            this.samplesInBuffer = Math.min(this.samplesInBuffer + 1, this.config.bufferSizeSamples);
        }
        this.totalSamplesProcessed += samples.length;
        // Check if we have enough samples for analysis
        if (this.samplesInBuffer < this.config.minSamplesForAnalysis) {
            return null;
        }
        // Perform incremental analysis
        const result = this.analyzeCurrentWindow();
        this.currentEstimate = result;
        this.analysisCount++;
        return result;
    }
    /**
     * Get the current estimated prosody features
     * Returns the most recent analysis result
     */
    getCurrentEstimate() {
        return this.currentEstimate;
    }
    /**
     * Get full prosody features from accumulated data
     * Use this at end of utterance for final analysis
     */
    getFullFeatures() {
        // Extract full buffer for analysis
        const buffer = this.getBufferContents();
        // Calculate comprehensive features
        const pitchMean = this.calculateMean(this.pitchHistory.filter((p) => p > 0));
        const pitchVariance = this.calculateVariance(this.pitchHistory.filter((p) => p > 0));
        const energyMean = this.calculateMean(this.energyHistory);
        const energyVariance = this.calculateVariance(this.energyHistory);
        // Pitch contour from trend
        let pitchContour = 'flat';
        if (this.pitchHistory.length >= 5) {
            const recent = this.pitchHistory.slice(-5);
            const older = this.pitchHistory.slice(-10, -5);
            if (older.length > 0) {
                const recentAvg = this.calculateMean(recent);
                const olderAvg = this.calculateMean(older);
                if (recentAvg > olderAvg * 1.1)
                    pitchContour = 'rising';
                else if (recentAvg < olderAvg * 0.9)
                    pitchContour = 'falling';
            }
        }
        // Calculate other features
        const durationMs = (this.totalSamplesProcessed / this.config.sampleRate) * 1000;
        const speechDurationMs = this.isInSpeech ? Date.now() - this.speechStartTimestamp : 0;
        const speakingRatio = speechDurationMs / Math.max(durationMs, 1);
        return {
            pitchMean: pitchMean || 150,
            pitchVariance: pitchVariance || 20,
            pitchRange: Math.max(...this.pitchHistory) - Math.min(...this.pitchHistory) || 50,
            pitchContour,
            energyMean: energyMean || -30,
            energyVariance: energyVariance || 5,
            energyPeaks: this.countPeaks(this.energyHistory),
            speechRate: this.estimateSpeechRate(),
            pauseDuration: this.currentEstimate?.currentSilenceMs || 0,
            pauseFrequency: this.countPauses(),
            jitter: this.calculateJitter(),
            shimmer: this.calculateShimmer(),
            breathiness: this.estimateBreathiness(buffer),
            utteranceDuration: durationMs,
            speakingRatio,
        };
    }
    /**
     * Get current analyzer state
     */
    getState() {
        const timeSinceLastSpeech = this.lastSpeechTimestamp > 0 ? Date.now() - this.lastSpeechTimestamp : 0;
        return {
            totalSamplesProcessed: this.totalSamplesProcessed,
            bufferFillLevel: this.samplesInBuffer / this.config.bufferSizeSamples,
            timeSinceLastSpeech,
            isInSpeech: this.isInSpeech,
            analysisCount: this.analysisCount,
        };
    }
    /**
     * Reset the analyzer state
     */
    reset() {
        this.writeIndex = 0;
        this.samplesInBuffer = 0;
        this.totalSamplesProcessed = 0;
        this.analysisCount = 0;
        this.lastSpeechTimestamp = 0;
        this.isInSpeech = false;
        this.speechStartTimestamp = 0;
        this.pitchHistory = [];
        this.energyHistory = [];
        this.currentEstimate = null;
        this.ringBuffer.fill(0);
        log.debug('🎤 Real-time analyzer reset');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE ANALYSIS METHODS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Analyze the current window of audio
     */
    analyzeCurrentWindow() {
        const now = Date.now();
        const window = this.getRecentWindow(this.config.windowSize);
        // Calculate basic features
        const energy = this.calculateEnergy(window);
        const energyDb = 10 * Math.log10(Math.max(energy, 1e-10));
        const zcr = this.calculateZeroCrossingRate(window);
        // Speech detection
        const isSpeech = this.detectSpeech(energyDb, zcr);
        // Update speech state
        if (isSpeech && !this.isInSpeech) {
            this.isInSpeech = true;
            this.speechStartTimestamp = now;
        }
        else if (!isSpeech && this.isInSpeech) {
            const silenceMs = now - this.lastSpeechTimestamp;
            if (silenceMs > SPEECH_DETECTION.MAX_SILENCE_IN_SPEECH_MS) {
                this.isInSpeech = false;
            }
        }
        if (isSpeech) {
            this.lastSpeechTimestamp = now;
        }
        // Calculate pitch estimate
        const pitchResult = this.estimatePitch(window);
        // Update history
        if (pitchResult.pitch > 0) {
            this.pitchHistory.push(pitchResult.pitch);
            if (this.pitchHistory.length > this.maxHistorySize) {
                this.pitchHistory.shift();
            }
        }
        this.energyHistory.push(energyDb);
        if (this.energyHistory.length > this.maxHistorySize) {
            this.energyHistory.shift();
        }
        // Calculate pitch trend
        const pitchTrend = this.calculatePitchTrend();
        // Calculate silence duration
        const currentSilenceMs = isSpeech
            ? 0
            : this.lastSpeechTimestamp > 0
                ? now - this.lastSpeechTimestamp
                : 0;
        return {
            pitchEstimate: pitchResult.pitch,
            pitchConfidence: pitchResult.confidence,
            energyDb,
            energyVariance: this.calculateVariance(this.energyHistory.slice(-5)),
            zeroCrossingRate: zcr,
            isSpeech,
            speakingRateEstimate: this.estimateSpeechRate(),
            currentSilenceMs,
            pitchTrend,
            timestamp: now,
        };
    }
    /**
     * Get the most recent window of samples from ring buffer
     */
    getRecentWindow(windowSize) {
        const window = new Float32Array(windowSize);
        const startIdx = (this.writeIndex - windowSize + this.config.bufferSizeSamples) %
            this.config.bufferSizeSamples;
        for (let i = 0; i < windowSize; i++) {
            window[i] = this.ringBuffer[(startIdx + i) % this.config.bufferSizeSamples];
        }
        return window;
    }
    /**
     * Get all buffer contents in order
     */
    getBufferContents() {
        const result = new Float32Array(this.samplesInBuffer);
        const startIdx = (this.writeIndex - this.samplesInBuffer + this.config.bufferSizeSamples) %
            this.config.bufferSizeSamples;
        for (let i = 0; i < this.samplesInBuffer; i++) {
            result[i] = this.ringBuffer[(startIdx + i) % this.config.bufferSizeSamples];
        }
        return result;
    }
    /**
     * Calculate energy of a signal window (SIMD-accelerated when available)
     */
    calculateEnergy(samples) {
        // RMS² is the energy
        const rms = calculateRms(samples);
        return rms * rms;
    }
    /**
     * Calculate zero crossing rate (SIMD-accelerated when available)
     */
    calculateZeroCrossingRate(samples) {
        return calculateZcr(samples);
    }
    /**
     * Detect if current window contains speech (uses native VAD when available)
     */
    detectSpeech(energyDb, zcr) {
        // Energy must be above threshold
        if (energyDb < SPEECH_DETECTION.ENERGY_THRESHOLD_DB) {
            return false;
        }
        // Voiced speech has lower ZCR than unvoiced sounds
        return zcr < SPEECH_DETECTION.ZCR_UNVOICED_MIN;
    }
    /**
     * Pitch estimation using YIN algorithm (SIMD-accelerated ~40x faster)
     */
    estimatePitch(samples) {
        // Use native YIN pitch detection when available
        const result = detectPitch(samples, this.config.sampleRate, 50, 400);
        return {
            pitch: result.confidence > 0.3 ? result.pitchHz : 0,
            confidence: result.confidence,
        };
    }
    /**
     * Calculate pitch trend from history
     */
    calculatePitchTrend() {
        if (this.pitchHistory.length < 5)
            return 'stable';
        const recent = this.pitchHistory.slice(-3);
        const older = this.pitchHistory.slice(-6, -3);
        if (older.length === 0)
            return 'stable';
        const recentAvg = this.calculateMean(recent);
        const olderAvg = this.calculateMean(older);
        const diff = (recentAvg - olderAvg) / Math.max(olderAvg, 1);
        if (diff > 0.1)
            return 'rising';
        if (diff < -0.1)
            return 'falling';
        return 'stable';
    }
    /**
     * Estimate speech rate from energy patterns
     */
    estimateSpeechRate() {
        // Count syllables by energy peaks
        const peaks = this.countPeaks(this.energyHistory);
        const durationSec = this.totalSamplesProcessed / this.config.sampleRate;
        // Estimate syllables per second (rough)
        return durationSec > 0 ? peaks / durationSec : 0;
    }
    /**
     * Count pauses in speech
     */
    countPauses() {
        // Count transitions from speech to silence
        let pauses = 0;
        let wasSpeech = false;
        for (let i = 0; i < this.energyHistory.length; i++) {
            const isSpeech = this.energyHistory[i] > SPEECH_DETECTION.ENERGY_THRESHOLD_DB;
            if (wasSpeech && !isSpeech) {
                pauses++;
            }
            wasSpeech = isSpeech;
        }
        return pauses;
    }
    /**
     * Count peaks in a signal
     */
    countPeaks(signal) {
        if (signal.length < 3)
            return 0;
        let peaks = 0;
        for (let i = 1; i < signal.length - 1; i++) {
            if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
                peaks++;
            }
        }
        return peaks;
    }
    /**
     * Calculate mean of array (uses native SIMD when available)
     */
    calculateMean(arr) {
        if (arr.length === 0)
            return 0;
        // Use native SIMD-accelerated mean if available
        const f32Arr = new Float32Array(arr);
        return nativeCalculateMean(f32Arr);
    }
    /**
     * Calculate variance of array (uses native SIMD when available)
     */
    calculateVariance(arr) {
        if (arr.length < 2)
            return 0;
        // Use native SIMD-accelerated variance if available
        const f32Arr = new Float32Array(arr);
        return nativeCalculateVariance(f32Arr);
    }
    /**
     * Calculate jitter (pitch variation)
     */
    calculateJitter() {
        if (this.pitchHistory.length < 2)
            return 0.01;
        let sumDiff = 0;
        for (let i = 1; i < this.pitchHistory.length; i++) {
            sumDiff += Math.abs(this.pitchHistory[i] - this.pitchHistory[i - 1]);
        }
        const avgDiff = sumDiff / (this.pitchHistory.length - 1);
        const avgPitch = this.calculateMean(this.pitchHistory);
        return avgPitch > 0 ? avgDiff / avgPitch : 0.01;
    }
    /**
     * Calculate shimmer (amplitude variation)
     */
    calculateShimmer() {
        if (this.energyHistory.length < 2)
            return 0.02;
        let sumDiff = 0;
        for (let i = 1; i < this.energyHistory.length; i++) {
            sumDiff += Math.abs(this.energyHistory[i] - this.energyHistory[i - 1]);
        }
        const avgDiff = sumDiff / (this.energyHistory.length - 1);
        const avgEnergy = this.calculateMean(this.energyHistory);
        return Math.abs(avgEnergy) > 0 ? avgDiff / Math.abs(avgEnergy) : 0.02;
    }
    /**
     * Estimate breathiness from spectral tilt
     */
    estimateBreathiness(samples) {
        // Simple estimation based on zero crossing rate
        const zcr = this.calculateZeroCrossingRate(samples);
        // Higher ZCR often correlates with breathiness
        return Math.min(zcr * 0.5, 0.5);
    }
}
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
const sessionAnalyzers = new Map();
/**
 * Get or create a real-time analyzer for a session
 */
export function getRealTimeAnalyzer(sessionId, config) {
    if (!sessionAnalyzers.has(sessionId)) {
        sessionAnalyzers.set(sessionId, new RealTimeAudioAnalyzer(config));
    }
    return sessionAnalyzers.get(sessionId);
}
/**
 * Reset analyzer for a session
 */
export function resetRealTimeAnalyzer(sessionId) {
    const analyzer = sessionAnalyzers.get(sessionId);
    if (analyzer) {
        analyzer.reset();
        sessionAnalyzers.delete(sessionId);
    }
}
/**
 * Reset all analyzers
 */
export function resetAllRealTimeAnalyzers() {
    sessionAnalyzers.clear();
}
/**
 * Get count of active analyzers
 */
export function getActiveRealTimeAnalyzerCount() {
    return sessionAnalyzers.size;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default RealTimeAudioAnalyzer;
//# sourceMappingURL=real-time-analyzer.js.map