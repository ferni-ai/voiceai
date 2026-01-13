/**
 * Twilio Audio Enhancement
 *
 * Applies Rust-accelerated audio processing to Twilio 8kHz audio:
 * - Bandwidth extension (8kHz → 16kHz) with harmonic regeneration
 * - AGC normalization for consistent volume
 * - Noise suppression for cleaner STT input
 *
 * This significantly improves STT accuracy for telephone audio compared
 * to simple linear interpolation upsampling.
 *
 * @module services/voice/twilio-audio-enhance
 */
export interface TwilioEnhanceConfig {
    /** Session ID for logging and caching */
    sessionId: string;
    /** Enable AGC normalization */
    enableAgc?: boolean;
    /** Enable noise suppression */
    enableNoiseSuppression?: boolean;
    /** Enable bandwidth extension (8kHz → 16kHz) */
    enableBandwidthExtension?: boolean;
    /** Enable high-pass filter (DC removal) */
    enableHighpass?: boolean;
}
export interface TwilioEnhanceResult {
    /** Enhanced audio samples (16kHz Float32) */
    samples: Float32Array;
    /** Whether Rust processing was used */
    usedRust: boolean;
    /** Processing time in ms */
    processingTimeMs: number;
}
export interface TwilioEnhancer {
    /** Enhance a frame of 8kHz audio */
    enhanceFrame: (samples8kHz: Int16Array, isSpeech?: boolean) => TwilioEnhanceResult;
    /** Get current AGC gain level */
    getAgcGain: () => number;
    /** Reset the processor state */
    reset: () => void;
    /** Check if using Rust */
    isUsingRust: () => boolean;
    /** Cleanup resources */
    cleanup: () => void;
}
/**
 * Get or create a Twilio audio enhancer for a session.
 *
 * The enhancer is session-scoped and maintains state between frames
 * for optimal audio enhancement (AGC envelope tracking, noise estimation).
 *
 * @example
 * ```typescript
 * const enhancer = await getTwilioEnhancer({ sessionId: callSid });
 *
 * // Process each audio frame from Twilio
 * const result = enhancer.enhanceFrame(pcm8kHz);
 * const enhanced16kHz = result.samples;
 * ```
 */
export declare function getTwilioEnhancer(config: TwilioEnhanceConfig): Promise<TwilioEnhancer>;
/**
 * Remove a Twilio enhancer for a session.
 */
export declare function removeTwilioEnhancer(sessionId: string): boolean;
/**
 * Get count of active enhancers.
 */
export declare function getActiveEnhancerCount(): number;
/**
 * Clear all enhancers (emergency cleanup).
 */
export declare function clearAllEnhancers(): number;
/**
 * Simple bandwidth extension using Rust (one-shot, no session state).
 *
 * Use this for one-off enhancement without maintaining session state.
 * For streaming audio, prefer `getTwilioEnhancer()` for stateful processing.
 *
 * @param samples8kHz - Int16Array of 8kHz audio samples
 * @returns Enhanced 16kHz Float32 samples
 */
export declare function enhanceTwilioAudio(samples8kHz: Int16Array): Promise<Float32Array>;
/**
 * Convert Int16 samples to Buffer for Twilio bridge compatibility.
 */
export declare function float32ToInt16Buffer(samples: Float32Array): Buffer;
/**
 * Convert Int16 Buffer to Float32 array.
 */
export declare function int16BufferToFloat32(buffer: Buffer): Float32Array;
declare const _default: {
    getTwilioEnhancer: typeof getTwilioEnhancer;
    removeTwilioEnhancer: typeof removeTwilioEnhancer;
    getActiveEnhancerCount: typeof getActiveEnhancerCount;
    clearAllEnhancers: typeof clearAllEnhancers;
    enhanceTwilioAudio: typeof enhanceTwilioAudio;
    float32ToInt16Buffer: typeof float32ToInt16Buffer;
    int16BufferToFloat32: typeof int16BufferToFloat32;
};
export default _default;
//# sourceMappingURL=twilio-audio-enhance.d.ts.map