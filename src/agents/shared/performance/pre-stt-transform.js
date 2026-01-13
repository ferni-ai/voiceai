/**
 * Pre-STT Audio Transform (Inbound Audio Enhancement)
 *
 * Applies Rust-accelerated audio processing to user audio BEFORE sending to STT
 * to improve transcription accuracy and handle challenging audio conditions.
 *
 * Pipeline:
 * ```
 * User Mic → LiveKit → [THIS TRANSFORM] → Gemini STT
 *                           ↓
 *                     Rust DSP (STATEFUL):
 *                     - DC removal / high-pass filter
 *                     - Bandwidth extension (8kHz → 16kHz for Twilio)
 *                     - Automatic Gain Control (normalize quiet/loud speakers)
 *                     - Noise suppression (spectral subtraction)
 * ```
 *
 * Key Features:
 * - **AGC**: Normalizes volume from quiet mumblers to loud speakers
 * - **Noise Suppression**: Removes fans, AC, traffic, and other background noise
 * - **Bandwidth Extension**: Reconstructs high frequencies for Twilio 8kHz audio
 * - **DC Removal**: Eliminates DC offset and low-frequency rumble
 *
 * Performance Target: <1ms per 20ms frame (real-time safe)
 *
 * @module agents/shared/performance/pre-stt-transform
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'PreSTTTransform' });
let rustModule = null;
let rustLoadAttempted = false;
/**
 * Lazily load the Rust native module
 */
async function getRustModule() {
    if (rustModule)
        return rustModule;
    if (rustLoadAttempted)
        return null;
    rustLoadAttempted = true;
    try {
        const native = (await import('@ferni/audio'));
        const module = native;
        if (typeof module.NativePreSttProcessor !== 'function') {
            log.warn('Rust module loaded but missing NativePreSttProcessor');
            return null;
        }
        log.info('🦀 Rust pre-STT module loaded (AGC + noise suppression + bandwidth extension)');
        rustModule = module;
        return rustModule;
    }
    catch (error) {
        log.warn({ error: String(error) }, '⚠️ Rust pre-STT module not available - using JavaScript fallback');
        return null;
    }
}
// Default config for standard LiveKit 16kHz audio
export const DEFAULT_CONFIG = {
    sampleRate: 16000,
    enableAgc: true,
    enableNoiseSuppression: true,
    enableHighpass: true,
    highpassCutoffHz: 80, // Remove DC and low rumble below 80Hz
    enableBandwidthExtension: false, // Only for 8kHz input
    inputIs8Khz: false,
    sessionId: 'unknown',
    enableMetrics: true,
};
// Config for Twilio 8kHz telephony audio
export const TWILIO_CONFIG = {
    sampleRate: 8000, // Input rate before extension
    enableAgc: true,
    enableNoiseSuppression: true,
    enableHighpass: true,
    highpassCutoffHz: 80,
    enableBandwidthExtension: true, // Extend to 16kHz
    inputIs8Khz: true,
    sessionId: 'unknown',
    enableMetrics: true,
};
const metrics = {
    totalFramesProcessed: 0,
    totalProcessingTimeMs: 0,
    avgProcessingTimeMs: 0,
    maxProcessingTimeMs: 0,
    avgAgcGain: 1.0,
    bypassedFrames: 0,
};
/**
 * Get pre-STT processing metrics
 */
export function getPreSTTMetrics() {
    return { ...metrics };
}
/**
 * Reset metrics (for testing)
 */
export function resetPreSTTMetrics() {
    metrics.totalFramesProcessed = 0;
    metrics.totalProcessingTimeMs = 0;
    metrics.avgProcessingTimeMs = 0;
    metrics.maxProcessingTimeMs = 0;
    metrics.avgAgcGain = 1.0;
    metrics.bypassedFrames = 0;
}
// ============================================================================
// AUDIO CONVERSION UTILITIES
// ============================================================================
/**
 * Convert Int16 PCM samples to Float32 (-1.0 to 1.0 range)
 */
function int16ToFloat32(int16Samples) {
    const float32Samples = new Float32Array(int16Samples.length);
    for (let i = 0; i < int16Samples.length; i++) {
        float32Samples[i] = int16Samples[i] / 32768;
    }
    return float32Samples;
}
// ============================================================================
// JAVASCRIPT FALLBACK IMPLEMENTATIONS
// ============================================================================
/**
 * Simple JavaScript AGC fallback
 * Uses peak-following envelope with attack/release
 */
class SimpleJSAgc {
    targetLevel = 0.25; // Target ~-12 dBFS
    currentGain = 1.0;
    maxGain = 10.0; // +20 dB max boost
    minGain = 0.1; // -20 dB max reduction
    attackCoeff = 0.01;
    releaseCoeff = 0.0001;
    envelope = 0;
    process(samples) {
        // Track peak envelope
        for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > this.envelope) {
                this.envelope = this.envelope + this.attackCoeff * (abs - this.envelope);
            }
            else {
                this.envelope = this.envelope + this.releaseCoeff * (abs - this.envelope);
            }
        }
        // Calculate target gain
        if (this.envelope > 0.001) {
            const targetGain = Math.min(this.maxGain, Math.max(this.minGain, this.targetLevel / this.envelope));
            // Smooth gain changes
            this.currentGain = this.currentGain + 0.01 * (targetGain - this.currentGain);
        }
        // Apply gain
        for (let i = 0; i < samples.length; i++) {
            samples[i] *= this.currentGain;
            // Soft clip
            if (samples[i] > 1.0)
                samples[i] = 1.0;
            if (samples[i] < -1.0)
                samples[i] = -1.0;
        }
        return this.currentGain;
    }
    reset() {
        this.currentGain = 1.0;
        this.envelope = 0;
    }
}
/**
 * Simple JavaScript high-pass filter (DC removal)
 * First-order IIR: y[n] = alpha * (y[n-1] + x[n] - x[n-1])
 */
class SimpleJSHighpass {
    alpha;
    prevInput = 0;
    prevOutput = 0;
    constructor(cutoffHz, sampleRate) {
        const rc = 1 / (2 * Math.PI * cutoffHz);
        const dt = 1 / sampleRate;
        this.alpha = rc / (rc + dt);
    }
    process(samples) {
        for (let i = 0; i < samples.length; i++) {
            const input = samples[i];
            const output = this.alpha * (this.prevOutput + input - this.prevInput);
            this.prevInput = input;
            this.prevOutput = output;
            samples[i] = output;
        }
    }
    reset() {
        this.prevInput = 0;
        this.prevOutput = 0;
    }
}
// ============================================================================
// PROCESSOR CLASS
// ============================================================================
/**
 * Session-scoped Pre-STT processor
 *
 * Creates one processor per session that maintains state between frames
 * for optimal audio enhancement.
 */
export class PreSTTProcessor {
    config;
    rustProcessor = null;
    jsAgc = null;
    jsHighpass = null;
    frameCount = 0;
    initialized = false;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Create a processor configured for Twilio 8kHz audio
     */
    static forTwilio(sessionId) {
        return new PreSTTProcessor({
            ...TWILIO_CONFIG,
            sessionId: sessionId || 'twilio',
        });
    }
    /**
     * Initialize the processor (call once before processing)
     */
    async initialize() {
        if (this.initialized)
            return;
        const rust = await getRustModule();
        if (rust) {
            // Use Rust processor
            try {
                const rustConfig = {
                    sampleRate: this.config.sampleRate,
                    enableAgc: this.config.enableAgc,
                    enableNoiseSuppression: this.config.enableNoiseSuppression,
                    enableHighpass: this.config.enableHighpass,
                    highpassCutoffHz: this.config.highpassCutoffHz,
                    enableBandwidthExtension: this.config.enableBandwidthExtension,
                    inputIs8Khz: this.config.inputIs8Khz,
                };
                if (this.config.inputIs8Khz) {
                    this.rustProcessor = rust.NativePreSttProcessor.forTwilio();
                }
                else {
                    this.rustProcessor = new rust.NativePreSttProcessor(rustConfig);
                }
                log.info({
                    sessionId: this.config.sessionId,
                    features: {
                        agc: this.config.enableAgc,
                        noiseSuppression: this.config.enableNoiseSuppression,
                        highpass: this.config.enableHighpass,
                        bandwidthExtension: this.config.enableBandwidthExtension,
                    },
                    inputIs8Khz: this.config.inputIs8Khz,
                }, '🎤 Pre-STT Rust processor initialized');
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to create Rust Pre-STT processor, using JavaScript fallback');
                this.initJSFallback();
            }
        }
        else {
            this.initJSFallback();
        }
        this.initialized = true;
    }
    initJSFallback() {
        if (this.config.enableAgc) {
            this.jsAgc = new SimpleJSAgc();
        }
        if (this.config.enableHighpass) {
            this.jsHighpass = new SimpleJSHighpass(this.config.highpassCutoffHz, this.config.sampleRate);
        }
        log.info({
            sessionId: this.config.sessionId,
            features: {
                agc: !!this.jsAgc,
                highpass: !!this.jsHighpass,
                noiseSuppression: false, // Not available in JS fallback
                bandwidthExtension: false, // Not available in JS fallback
            },
        }, '📦 Pre-STT JavaScript fallback initialized (limited features)');
    }
    /**
     * Process an audio frame
     *
     * @param samples - Float32Array audio samples (normalized -1 to 1)
     * @param isSpeech - VAD result (true if speech detected)
     * @returns Enhanced audio samples (may be longer if bandwidth extended)
     */
    processFrame(samples, isSpeech) {
        if (!this.initialized) {
            throw new Error('PreSTTProcessor not initialized - call initialize() first');
        }
        const startTime = performance.now();
        this.frameCount++;
        let result;
        if (this.rustProcessor) {
            // Use Rust processor (full feature set)
            result = this.rustProcessor.processFrame(samples, isSpeech);
            // Update metrics from Rust stats
            const stats = this.rustProcessor.getStats();
            metrics.avgAgcGain =
                (metrics.avgAgcGain * (this.frameCount - 1) + stats.agcGain) / this.frameCount;
        }
        else {
            // JavaScript fallback (limited features)
            result = new Float32Array(samples);
            // Apply highpass first (DC removal)
            if (this.jsHighpass) {
                this.jsHighpass.process(result);
            }
            // Apply AGC
            if (this.jsAgc) {
                const gain = this.jsAgc.process(result);
                metrics.avgAgcGain = (metrics.avgAgcGain * (this.frameCount - 1) + gain) / this.frameCount;
            }
        }
        // Track metrics
        const processingTime = performance.now() - startTime;
        metrics.totalFramesProcessed++;
        metrics.totalProcessingTimeMs += processingTime;
        metrics.avgProcessingTimeMs = metrics.totalProcessingTimeMs / metrics.totalFramesProcessed;
        if (processingTime > metrics.maxProcessingTimeMs) {
            metrics.maxProcessingTimeMs = processingTime;
        }
        return result;
    }
    /**
     * Process an Int16 audio frame (common LiveKit format)
     *
     * @param samples - Int16Array audio samples
     * @param isSpeech - VAD result
     * @returns Enhanced audio as Float32Array
     */
    processFrameI16(samples, isSpeech) {
        if (!this.initialized) {
            throw new Error('PreSTTProcessor not initialized - call initialize() first');
        }
        if (this.rustProcessor) {
            // Rust can process Int16 directly
            return this.rustProcessor.processFrameI16(samples, isSpeech);
        }
        else {
            // JavaScript needs Float32
            const float32 = int16ToFloat32(samples);
            return this.processFrame(float32, isSpeech);
        }
    }
    /**
     * Reset noise estimation (call when entering a new environment)
     */
    resetNoiseEstimate() {
        if (this.rustProcessor) {
            this.rustProcessor.resetNoiseEstimate();
        }
    }
    /**
     * Full reset (call when starting a new session)
     */
    reset() {
        if (this.rustProcessor) {
            this.rustProcessor.reset();
        }
        if (this.jsAgc) {
            this.jsAgc.reset();
        }
        if (this.jsHighpass) {
            this.jsHighpass.reset();
        }
        this.frameCount = 0;
    }
    /**
     * Get processing statistics
     */
    getStats() {
        if (this.rustProcessor) {
            return this.rustProcessor.getStats();
        }
        return {
            framesProcessed: this.frameCount,
            agcGain: 1.0,
        };
    }
    /**
     * Check if using Rust or JavaScript fallback
     */
    isUsingRust() {
        return this.rustProcessor !== null;
    }
}
// ============================================================================
// PRESETS
// ============================================================================
/**
 * Preset configurations for different audio scenarios
 */
export const PreSTTPresets = {
    /**
     * Default preset - standard 16kHz LiveKit audio
     * Full enhancement: AGC + noise suppression + highpass
     */
    standard: {
        sampleRate: 16000,
        enableAgc: true,
        enableNoiseSuppression: true,
        enableHighpass: true,
        highpassCutoffHz: 80,
        enableBandwidthExtension: false,
        inputIs8Khz: false,
    },
    /**
     * Twilio telephony preset - 8kHz audio with bandwidth extension
     * Enhances telephone-quality audio to 16kHz
     */
    twilio: {
        sampleRate: 8000,
        enableAgc: true,
        enableNoiseSuppression: true,
        enableHighpass: true,
        highpassCutoffHz: 80,
        enableBandwidthExtension: true,
        inputIs8Khz: true,
    },
    /**
     * Quiet environment - AGC only (no noise suppression)
     * For users in quiet rooms where noise suppression isn't needed
     */
    quietRoom: {
        sampleRate: 16000,
        enableAgc: true,
        enableNoiseSuppression: false,
        enableHighpass: true,
        highpassCutoffHz: 80,
        enableBandwidthExtension: false,
        inputIs8Khz: false,
    },
    /**
     * Noisy environment - aggressive processing
     * For users in loud environments (cafes, offices, etc.)
     */
    noisy: {
        sampleRate: 16000,
        enableAgc: true,
        enableNoiseSuppression: true,
        enableHighpass: true,
        highpassCutoffHz: 100, // Slightly higher to cut more rumble
        enableBandwidthExtension: false,
        inputIs8Khz: false,
    },
    /**
     * Bypass - no processing (for debugging)
     */
    bypass: {
        enableAgc: false,
        enableNoiseSuppression: false,
        enableHighpass: false,
        enableBandwidthExtension: false,
    },
};
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
// Global processor registry for session management
const sessionProcessors = new Map();
/**
 * Get or create a Pre-STT processor for a session
 */
export async function getOrCreateProcessor(sessionId, config) {
    let processor = sessionProcessors.get(sessionId);
    if (!processor) {
        processor = new PreSTTProcessor({
            ...config,
            sessionId,
        });
        await processor.initialize();
        sessionProcessors.set(sessionId, processor);
        log.debug({ sessionId }, 'Created new Pre-STT processor for session');
    }
    return processor;
}
/**
 * Remove a session's processor (cleanup)
 */
export function removeSessionProcessor(sessionId) {
    const processor = sessionProcessors.get(sessionId);
    if (processor) {
        processor.reset();
        sessionProcessors.delete(sessionId);
        log.debug({ sessionId }, 'Removed Pre-STT processor for session');
        return true;
    }
    return false;
}
/**
 * Get count of active session processors
 */
export function getActiveProcessorCount() {
    return sessionProcessors.size;
}
/**
 * Clear all session processors (emergency cleanup)
 */
export function clearAllProcessors() {
    const count = sessionProcessors.size;
    for (const processor of sessionProcessors.values()) {
        processor.reset();
    }
    sessionProcessors.clear();
    log.info({ clearedCount: count }, 'Cleared all Pre-STT processors');
    return count;
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Check if pre-STT processing is available
 */
export async function isPreSTTAvailable() {
    const rust = await getRustModule();
    return rust !== null;
}
/**
 * Apply standalone AGC to audio samples (creates/reuses session-scoped instance)
 * Useful for simple AGC without full Pre-STT pipeline
 *
 * @param sessionId - Session identifier for state management
 * @param samples - Float32Array to process (modified in place)
 * @returns Current AGC gain
 */
export async function applyAgc(sessionId, samples) {
    const rust = await getRustModule();
    if (rust) {
        return rust.applyAgc(sessionId, samples);
    }
    // JavaScript fallback (less efficient - creates new AGC each time)
    const agc = new SimpleJSAgc();
    return agc.process(samples);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    PreSTTProcessor,
    PreSTTPresets,
    getOrCreateProcessor,
    removeSessionProcessor,
    getActiveProcessorCount,
    clearAllProcessors,
    isPreSTTAvailable,
    applyAgc,
    getPreSTTMetrics,
    resetPreSTTMetrics,
    DEFAULT_CONFIG,
    TWILIO_CONFIG,
};
//# sourceMappingURL=pre-stt-transform.js.map