/**
 * Voice Humanization Feature Flags
 *
 * Controls gradual rollout of voice humanization features.
 * Each feature can be enabled/disabled independently for testing
 * and gradual production rollout.
 *
 * @module VoiceHumanizationFlags
 */
export interface VoiceHumanizationFlags {
    /** Enable prosody-aware turn prediction (intonation detection) */
    enableProsodyTurnPrediction: boolean;
    /** Enable micro-interruption detection ("wait", "hold on" stops agent) */
    enableMicroInterruptions: boolean;
    /** Enable emotional arc influence on TTS pauses */
    enableEmotionalArcTts: boolean;
    /** Enable laughter detection */
    enableLaughterDetection: boolean;
    /** Enable ambient sound awareness */
    enableAmbientAwareness: boolean;
    /** Enable speech rhythm mirroring */
    enableRhythmMirroring: boolean;
    /** Enable emotional contagion continuity */
    enableEmotionalContagion: boolean;
    /** Enable enhanced voice fingerprinting */
    enableEnhancedVoiceFingerprinting: boolean;
    /** Enable voice authentication (enrollment, verification, identification) */
    enableVoiceAuthentication: boolean;
    /** Enable FFT-based spectral analysis */
    enableFftAnalysis: boolean;
    /** Enable enhanced turn prediction with phrase boundaries */
    enableEnhancedTurnPrediction: boolean;
    /** Enable multi-signal laughter detection */
    enableMultiSignalLaughter: boolean;
    /** Enable word-timing rhythm mirroring */
    enableWordTimingRhythm: boolean;
    /** Enable response anticipation/pattern caching */
    enableResponseAnticipation: boolean;
    /** Actually use cached responses (vs just monitoring) */
    useCachedResponses: boolean;
    /** Minimum confidence to use cached response (0-1) */
    cacheConfidenceThreshold: number;
    /** Enable live backchanneling during user speech at breath pauses */
    enableLiveBackchanneling: boolean;
    /** Enable LLM-generated backchannels instead of hardcoded phrase pools */
    enableLLMBackchannels: boolean;
    /** Percentage of sessions to enable (0-100) */
    rolloutPercentage: number;
    /** Enable verbose logging for debugging */
    enableVerboseLogging: boolean;
    /** Enable metrics collection */
    enableMetrics: boolean;
}
/**
 * Default flags - conservative defaults for production safety
 */
declare const DEFAULT_FLAGS: VoiceHumanizationFlags;
/**
 * Staging flags - more aggressive for testing
 */
declare const STAGING_FLAGS: VoiceHumanizationFlags;
/**
 * Development flags - all features enabled
 */
declare const DEVELOPMENT_FLAGS: VoiceHumanizationFlags;
/**
 * Initialize feature flags based on environment
 */
export declare function initializeFlags(): void;
/**
 * Get current feature flags
 */
export declare function getFlags(): VoiceHumanizationFlags;
/**
 * Check if a specific feature is enabled
 */
export declare function isFeatureEnabled(feature: keyof Omit<VoiceHumanizationFlags, 'rolloutPercentage' | 'enableVerboseLogging'>): boolean;
/**
 * Check if voice humanization is enabled for a session
 * Uses rollout percentage to determine inclusion
 */
export declare function isEnabledForSession(sessionId: string): boolean;
/**
 * Get flags for a specific session (with rollout check)
 */
export declare function getSessionFlags(sessionId: string): VoiceHumanizationFlags & {
    isEnabled: boolean;
};
/**
 * Update flags at runtime (for testing/debugging)
 */
export declare function updateFlags(updates: Partial<VoiceHumanizationFlags>): void;
/**
 * Reset flags to defaults
 */
export declare function resetFlags(): void;
export { DEFAULT_FLAGS, DEVELOPMENT_FLAGS, STAGING_FLAGS };
/**
 * Direct access to current flags (auto-initializes if needed)
 * Use this for simple flag checks without calling getFlags()
 */
export declare const voiceHumanizationFlags: VoiceHumanizationFlags;
//# sourceMappingURL=voice-humanization-flags.d.ts.map