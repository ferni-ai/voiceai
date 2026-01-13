/**
 * Voice Memory Service
 *
 * Lightweight voice recognition that creates "voice sketches" from audio
 * characteristics. Not full biometrics, but enough to recognize returning
 * users across devices with reasonable confidence.
 *
 * Features extracted:
 * - Pitch (fundamental frequency) - voice "height"
 * - Speaking rate - how fast they talk
 * - Spectral characteristics - voice "color/timbre"
 * - Pause patterns - rhythm of speech
 *
 * This is designed for UX enhancement, not security. The agent can say
 * "Your voice sounds familiar - is this Seth?" rather than requiring login.
 */
/**
 * Voice sketch - a compact representation of someone's voice characteristics
 */
export interface VoiceSketch {
    pitchMean: number;
    pitchMin: number;
    pitchMax: number;
    pitchStdDev: number;
    speakingRateMean: number;
    pauseFrequency: number;
    avgPauseDuration: number;
    spectralCentroidMean: number;
    spectralCentroidStdDev: number;
    spectralRolloffMean: number;
    energyMean: number;
    energyStdDev: number;
    samplesAnalyzed: number;
    totalDurationMs: number;
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Result of comparing two voice sketches
 */
export interface VoiceSimilarityResult {
    similarity: number;
    confidence: number;
    matchingFeatures: string[];
    divergentFeatures: string[];
}
/**
 * Result of searching for a voice match
 */
export interface VoiceSearchResult {
    userId: string;
    similarity: number;
    confidence: number;
    profile?: {
        name?: string;
        lastSeen?: Date;
    };
}
/**
 * Accumulator for building voice sketches incrementally
 */
export declare class VoiceSketchBuilder {
    private pitchSamples;
    private spectralCentroids;
    private spectralRolloffs;
    private energySamples;
    private pauseDurations;
    private totalDurationMs;
    private lastSpeechTimestamp;
    private inPause;
    private pauseStartTime;
    private readonly sampleRate;
    private readonly frameSize;
    constructor(sampleRate?: number, frameSizeMs?: number);
    /**
     * Process an audio chunk and extract features
     */
    processAudioChunk(samples: Float32Array, timestampMs: number): void;
    private processFrame;
    /**
     * Build the voice sketch from accumulated features
     */
    build(): VoiceSketch | null;
    private calculateStats;
    /**
     * Get current sample counts (for progress tracking)
     */
    getProgress(): {
        samplesCollected: number;
        durationMs: number;
        isReady: boolean;
    };
    /**
     * Reset the builder for a new user
     */
    reset(): void;
}
/**
 * Compare two voice sketches and return similarity score
 */
export declare function compareVoiceSketches(sketch1: VoiceSketch, sketch2: VoiceSketch): VoiceSimilarityResult;
/**
 * Voice Memory Service - manages voice sketches and matching
 */
export declare class VoiceMemoryService {
    private sketchBuilders;
    constructor();
    /**
     * Get or create a sketch builder for a session
     */
    getBuilder(sessionId: string, sampleRate?: number): VoiceSketchBuilder;
    /**
     * Process audio from a session
     */
    processAudio(sessionId: string, samples: Float32Array, timestampMs: number, sampleRate?: number): void;
    /**
     * Build voice sketch for a session
     */
    buildSketch(sessionId: string): VoiceSketch | null;
    /**
     * Get progress for a session
     */
    getProgress(sessionId: string): {
        samplesCollected: number;
        durationMs: number;
        isReady: boolean;
    } | null;
    /**
     * Clean up a session's builder
     */
    cleanupSession(sessionId: string): void;
    /**
     * Find best matching voice from a list of candidates
     */
    findBestMatch(currentSketch: VoiceSketch, candidates: Array<{
        userId: string;
        sketch: VoiceSketch;
        name?: string;
    }>): VoiceSearchResult | null;
    /**
     * Search all stored voice sketches for matches
     * This is the main entry point for voice identification
     */
    searchVoices(currentSketch: VoiceSketch, store: {
        listProfiles: () => Promise<Array<{
            id: string;
            name?: string;
            voiceSketch?: VoiceSketch;
        }>>;
    }): Promise<VoiceSearchResult[]>;
}
export declare function getVoiceMemory(): VoiceMemoryService;
export declare function resetVoiceMemory(): void;
declare const _default: {
    VoiceSketchBuilder: typeof VoiceSketchBuilder;
    VoiceMemoryService: typeof VoiceMemoryService;
    compareVoiceSketches: typeof compareVoiceSketches;
    getVoiceMemory: typeof getVoiceMemory;
    resetVoiceMemory: typeof resetVoiceMemory;
};
export default _default;
//# sourceMappingURL=voice-memory.d.ts.map