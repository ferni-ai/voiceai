/**
 * Audio Prosody Analyzer
 *
 * Main analyzer class for voice-based emotion detection.
 * Analyzes pitch, volume, speech rate, and other prosodic features
 * to detect emotional state from the user's voice.
 */
import type { AudioFrame } from '@livekit/rtc-node';
import type { VoiceEmotionResult } from './types.js';
/**
 * Analyzes voice prosody for emotion detection
 *
 * Uses signal processing to extract emotional cues from:
 * - Pitch (F0) patterns - fast/varied for excitement, slow/flat for sadness
 * - Energy levels - loud for anger, soft for sadness
 * - Speech rate - fast for anxiety, slow for depression
 * - Voice quality - trembling for fear, harsh for anger
 */
export declare class AudioProsodyAnalyzer {
    private buffers;
    private readonly maxBufferMs;
    private readonly minSamplesForAnalysis;
    private baselinePitch;
    private baselineEnergy;
    private baselineRate;
    private calibrated;
    private featureHistory;
    private readonly historySize;
    private sessionId;
    private useNativeProcessor;
    private lastFrameTimestamp;
    constructor(sessionId?: string);
    /**
     * Set session ID for metrics tracking
     */
    setSessionId(sessionId: string): void;
    /**
     * Process an audio frame from LiveKit
     */
    processAudioFrame(frame: AudioFrame): void;
    /**
     * Process raw audio samples
     */
    processSamples(samples: Float32Array, sampleRate: number): void;
    /**
     * Analyze accumulated audio and detect emotion
     */
    analyze(): VoiceEmotionResult | null;
    /**
     * Clear buffers (call after analysis or on new utterance)
     */
    clearBuffers(): void;
    /**
     * Reset analyzer state
     */
    reset(): void;
    private calibrateBaseline;
    /**
     * Map native Rust prosody features to JS ProsodyFeatures interface.
     * Rust provides core features; we compute defaults for voice quality metrics.
     */
    private mapNativeToJsFeatures;
}
export default AudioProsodyAnalyzer;
//# sourceMappingURL=analyzer.d.ts.map