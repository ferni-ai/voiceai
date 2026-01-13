/**
 * Ambient Sound Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects ambient environment characteristics from user audio:
 * - Background noise level (quiet room vs coffee shop vs outdoors)
 * - Environmental context clues (typing, TV, traffic)
 * - Acoustic conditions that affect speech clarity
 *
 * This enables Ferni to:
 * 1. Adjust response clarity for noisy environments
 * 2. Acknowledge environmental context ("sounds like you're somewhere busy")
 * 3. Offer appropriate responses ("should we continue this later?")
 *
 * @module AmbientAwareness
 */
/**
 * Detected environment type
 */
export type EnvironmentType = 'quiet_room' | 'office' | 'coffee_shop' | 'outdoors' | 'car' | 'public_transit' | 'noisy' | 'unknown';
/**
 * Environmental awareness result
 */
export interface AmbientAnalysisResult {
    /** Detected environment type */
    environment: EnvironmentType;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Background noise level (0-1, where 0 = silent, 1 = very noisy) */
    noiseLevel: number;
    /** Signal-to-noise ratio estimate (higher = clearer speech) */
    snrEstimate: number;
    /** Detected background elements */
    backgroundElements: BackgroundElement[];
    /** Recommendations for agent behavior */
    recommendations: AmbientRecommendations;
}
/**
 * Detected background sound element
 */
export interface BackgroundElement {
    type: 'music' | 'conversation' | 'traffic' | 'typing' | 'tv' | 'wind' | 'rain' | 'baby_crying' | 'unknown';
    confidence: number;
    /** Is this element persistent or intermittent? */
    persistent: boolean;
}
/**
 * Recommendations based on ambient analysis
 */
export interface AmbientRecommendations {
    /** Speak slower/clearer for noisy environments */
    speakClearer: boolean;
    /** Offer to pause/continue later */
    offerToPause: boolean;
    /** Increase volume slightly */
    increaseVolume: boolean;
    /** Add more pauses for clarity */
    addPauses: boolean;
    /** Suggested acknowledgment phrase */
    acknowledgment: string | null;
}
export declare class AmbientAwarenessService {
    private energyHistory;
    private speechEnergyHistory;
    private silenceEnergyHistory;
    private lastAnalysis;
    private lastAnalysisTime;
    private frameCount;
    private spectralHistory;
    /**
     * Process an audio frame for ambient analysis
     * Call this with each audio frame (can be same stream as STT)
     */
    processFrame(data: Int16Array | Float32Array, sampleRate: number, isSpeech: boolean): void;
    /**
     * Get ambient analysis (cached, updates periodically)
     */
    getAnalysis(): AmbientAnalysisResult;
    /**
     * Perform ambient environment analysis
     */
    private analyze;
    /**
     * Classify environment type based on audio characteristics
     */
    private classifyEnvironment;
    /**
     * Detect specific background elements
     */
    private detectBackgroundElements;
    /**
     * Build recommendations based on analysis
     */
    private buildRecommendations;
    /**
     * Calculate RMS energy
     */
    private calculateEnergy;
    /**
     * Estimate spectral bands (simple approximation without FFT)
     * Uses zero-crossing rate and energy distribution
     */
    private estimateSpectralBands;
    /**
     * Get average spectral characteristics
     */
    private averageSpectral;
    /**
     * Calculate percentile
     */
    private percentile;
    /**
     * Calculate average
     */
    private average;
    /**
     * Reset service state
     */
    reset(): void;
}
/**
 * Get or create ambient awareness service for a session
 */
export declare function getAmbientAwarenessService(sessionId: string): AmbientAwarenessService;
/**
 * Reset ambient awareness for a session
 */
export declare function resetAmbientAwareness(sessionId: string): void;
export declare function getActiveAmbientAwarenessCount(): number;
/**
 * Reset all instances
 */
export declare function resetAllAmbientAwareness(): void;
//# sourceMappingURL=ambient-awareness.d.ts.map