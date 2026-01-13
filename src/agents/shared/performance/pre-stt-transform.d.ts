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
export interface PreSTTConfig {
    /** Sample rate of input audio (typically 16000 for LiveKit) */
    sampleRate?: number;
    /** Enable Automatic Gain Control (normalize volume levels) */
    enableAgc?: boolean;
    /** Enable noise suppression (spectral subtraction) */
    enableNoiseSuppression?: boolean;
    /** Enable high-pass filter (DC removal + low rumble) */
    enableHighpass?: boolean;
    /** High-pass filter cutoff frequency in Hz (default: 80) */
    highpassCutoffHz?: number;
    /** Enable bandwidth extension (8kHz → 16kHz) */
    enableBandwidthExtension?: boolean;
    /** Input is 8kHz (Twilio telephony) */
    inputIs8Khz?: boolean;
    /** Session ID for logging */
    sessionId?: string;
    /** Enable metrics tracking */
    enableMetrics?: boolean;
}
export declare const DEFAULT_CONFIG: Required<PreSTTConfig>;
export declare const TWILIO_CONFIG: Required<PreSTTConfig>;
export interface PreSTTMetrics {
    totalFramesProcessed: number;
    totalProcessingTimeMs: number;
    avgProcessingTimeMs: number;
    maxProcessingTimeMs: number;
    avgAgcGain: number;
    bypassedFrames: number;
}
/**
 * Get pre-STT processing metrics
 */
export declare function getPreSTTMetrics(): PreSTTMetrics;
/**
 * Reset metrics (for testing)
 */
export declare function resetPreSTTMetrics(): void;
/**
 * Session-scoped Pre-STT processor
 *
 * Creates one processor per session that maintains state between frames
 * for optimal audio enhancement.
 */
export declare class PreSTTProcessor {
    private config;
    private rustProcessor;
    private jsAgc;
    private jsHighpass;
    private frameCount;
    private initialized;
    constructor(config?: PreSTTConfig);
    /**
     * Create a processor configured for Twilio 8kHz audio
     */
    static forTwilio(sessionId?: string): PreSTTProcessor;
    /**
     * Initialize the processor (call once before processing)
     */
    initialize(): Promise<void>;
    private initJSFallback;
    /**
     * Process an audio frame
     *
     * @param samples - Float32Array audio samples (normalized -1 to 1)
     * @param isSpeech - VAD result (true if speech detected)
     * @returns Enhanced audio samples (may be longer if bandwidth extended)
     */
    processFrame(samples: Float32Array, isSpeech: boolean): Float32Array;
    /**
     * Process an Int16 audio frame (common LiveKit format)
     *
     * @param samples - Int16Array audio samples
     * @param isSpeech - VAD result
     * @returns Enhanced audio as Float32Array
     */
    processFrameI16(samples: Int16Array, isSpeech: boolean): Float32Array;
    /**
     * Reset noise estimation (call when entering a new environment)
     */
    resetNoiseEstimate(): void;
    /**
     * Full reset (call when starting a new session)
     */
    reset(): void;
    /**
     * Get processing statistics
     */
    getStats(): {
        framesProcessed: number;
        agcGain: number;
    };
    /**
     * Check if using Rust or JavaScript fallback
     */
    isUsingRust(): boolean;
}
/**
 * Preset configurations for different audio scenarios
 */
export declare const PreSTTPresets: {
    /**
     * Default preset - standard 16kHz LiveKit audio
     * Full enhancement: AGC + noise suppression + highpass
     */
    standard: {
        sampleRate: number;
        enableAgc: true;
        enableNoiseSuppression: true;
        enableHighpass: true;
        highpassCutoffHz: number;
        enableBandwidthExtension: false;
        inputIs8Khz: false;
    };
    /**
     * Twilio telephony preset - 8kHz audio with bandwidth extension
     * Enhances telephone-quality audio to 16kHz
     */
    twilio: {
        sampleRate: number;
        enableAgc: true;
        enableNoiseSuppression: true;
        enableHighpass: true;
        highpassCutoffHz: number;
        enableBandwidthExtension: true;
        inputIs8Khz: true;
    };
    /**
     * Quiet environment - AGC only (no noise suppression)
     * For users in quiet rooms where noise suppression isn't needed
     */
    quietRoom: {
        sampleRate: number;
        enableAgc: true;
        enableNoiseSuppression: false;
        enableHighpass: true;
        highpassCutoffHz: number;
        enableBandwidthExtension: false;
        inputIs8Khz: false;
    };
    /**
     * Noisy environment - aggressive processing
     * For users in loud environments (cafes, offices, etc.)
     */
    noisy: {
        sampleRate: number;
        enableAgc: true;
        enableNoiseSuppression: true;
        enableHighpass: true;
        highpassCutoffHz: number;
        enableBandwidthExtension: false;
        inputIs8Khz: false;
    };
    /**
     * Bypass - no processing (for debugging)
     */
    bypass: {
        enableAgc: false;
        enableNoiseSuppression: false;
        enableHighpass: false;
        enableBandwidthExtension: false;
    };
};
/**
 * Get or create a Pre-STT processor for a session
 */
export declare function getOrCreateProcessor(sessionId: string, config?: PreSTTConfig): Promise<PreSTTProcessor>;
/**
 * Remove a session's processor (cleanup)
 */
export declare function removeSessionProcessor(sessionId: string): boolean;
/**
 * Get count of active session processors
 */
export declare function getActiveProcessorCount(): number;
/**
 * Clear all session processors (emergency cleanup)
 */
export declare function clearAllProcessors(): number;
/**
 * Check if pre-STT processing is available
 */
export declare function isPreSTTAvailable(): Promise<boolean>;
/**
 * Apply standalone AGC to audio samples (creates/reuses session-scoped instance)
 * Useful for simple AGC without full Pre-STT pipeline
 *
 * @param sessionId - Session identifier for state management
 * @param samples - Float32Array to process (modified in place)
 * @returns Current AGC gain
 */
export declare function applyAgc(sessionId: string, samples: Float32Array): Promise<number>;
declare const _default: {
    PreSTTProcessor: typeof PreSTTProcessor;
    PreSTTPresets: {
        /**
         * Default preset - standard 16kHz LiveKit audio
         * Full enhancement: AGC + noise suppression + highpass
         */
        standard: {
            sampleRate: number;
            enableAgc: true;
            enableNoiseSuppression: true;
            enableHighpass: true;
            highpassCutoffHz: number;
            enableBandwidthExtension: false;
            inputIs8Khz: false;
        };
        /**
         * Twilio telephony preset - 8kHz audio with bandwidth extension
         * Enhances telephone-quality audio to 16kHz
         */
        twilio: {
            sampleRate: number;
            enableAgc: true;
            enableNoiseSuppression: true;
            enableHighpass: true;
            highpassCutoffHz: number;
            enableBandwidthExtension: true;
            inputIs8Khz: true;
        };
        /**
         * Quiet environment - AGC only (no noise suppression)
         * For users in quiet rooms where noise suppression isn't needed
         */
        quietRoom: {
            sampleRate: number;
            enableAgc: true;
            enableNoiseSuppression: false;
            enableHighpass: true;
            highpassCutoffHz: number;
            enableBandwidthExtension: false;
            inputIs8Khz: false;
        };
        /**
         * Noisy environment - aggressive processing
         * For users in loud environments (cafes, offices, etc.)
         */
        noisy: {
            sampleRate: number;
            enableAgc: true;
            enableNoiseSuppression: true;
            enableHighpass: true;
            highpassCutoffHz: number;
            enableBandwidthExtension: false;
            inputIs8Khz: false;
        };
        /**
         * Bypass - no processing (for debugging)
         */
        bypass: {
            enableAgc: false;
            enableNoiseSuppression: false;
            enableHighpass: false;
            enableBandwidthExtension: false;
        };
    };
    getOrCreateProcessor: typeof getOrCreateProcessor;
    removeSessionProcessor: typeof removeSessionProcessor;
    getActiveProcessorCount: typeof getActiveProcessorCount;
    clearAllProcessors: typeof clearAllProcessors;
    isPreSTTAvailable: typeof isPreSTTAvailable;
    applyAgc: typeof applyAgc;
    getPreSTTMetrics: typeof getPreSTTMetrics;
    resetPreSTTMetrics: typeof resetPreSTTMetrics;
    DEFAULT_CONFIG: Required<PreSTTConfig>;
    TWILIO_CONFIG: Required<PreSTTConfig>;
};
export default _default;
//# sourceMappingURL=pre-stt-transform.d.ts.map