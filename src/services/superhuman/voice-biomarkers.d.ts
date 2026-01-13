/**
 * Voice Biomarkers - Better Than Human Wellness Detection
 *
 * Detects wellness signals from voice that humans can't consciously perceive:
 * - Fatigue/sleep deprivation from pitch variability
 * - Stress trajectory over time
 * - Hydration from voice dryness
 * - Early illness detection from nasal resonance
 * - Medication changes from voice patterns
 *
 * WHY IT'S SUPERHUMAN: Humans notice "you sound tired" but can't track patterns
 * or detect early illness signs from voice biomarkers.
 *
 * @module services/superhuman/voice-biomarkers
 */
export interface VoiceBiomarkers {
    /** Overall fatigue level (0-1, higher = more fatigued) */
    fatigueLevel: number;
    /** Stress trajectory over recent conversations */
    stressTrajectory: 'rising' | 'stable' | 'falling' | 'unknown';
    /** Estimated hydration level (0-1, lower = more dehydrated) */
    hydrationEstimate: number;
    /** Risk of illness based on voice patterns (0-1) */
    illnessRisk: number;
    /** Detected potential medication/substance change */
    medicationChangeIndicator: boolean;
    /** Confidence in the readings */
    confidence: number;
    /** Timestamp of analysis */
    timestamp: number;
}
export interface VoiceAnalysisInput {
    /** Pitch variability (standard deviation) */
    pitchVariability?: number;
    /** Average pitch */
    averagePitch?: number;
    /** Speech rate (words per minute) */
    speechRate?: number;
    /** Pause frequency */
    pauseFrequency?: number;
    /** Voice strain indicator (0-1) */
    strain?: number;
    /** Nasal resonance indicator (0-1) */
    nasalResonance?: number;
    /** Voice dryness/breathiness (0-1) */
    breathiness?: number;
    /** Tremor in voice (0-1) */
    tremor?: number;
}
interface StoredBiomarkerReading {
    userId: string;
    sessionId: string;
    biomarkers: VoiceBiomarkers;
    input: VoiceAnalysisInput;
    timestamp: number;
}
interface BiomarkerTrend {
    metric: string;
    direction: 'improving' | 'stable' | 'declining';
    averageRecent: number;
    averageBaseline: number;
    percentChange: number;
}
/**
 * Analyze voice input for biomarkers.
 * Returns wellness indicators that exceed human perception.
 */
export declare function analyzeVoiceBiomarkers(input: VoiceAnalysisInput): VoiceBiomarkers;
/**
 * Calculate stress trajectory from historical readings.
 */
export declare function calculateStressTrajectory(readings: StoredBiomarkerReading[]): 'rising' | 'stable' | 'falling' | 'unknown';
/**
 * Store a biomarker reading for trend analysis.
 */
export declare function storeBiomarkerReading(userId: string, sessionId: string, biomarkers: VoiceBiomarkers, input: VoiceAnalysisInput): Promise<void>;
/**
 * Load recent biomarker readings for trend analysis.
 */
export declare function loadBiomarkerReadings(userId: string, daysBack?: number): Promise<StoredBiomarkerReading[]>;
/**
 * Get biomarker trends for a user.
 */
export declare function getBiomarkerTrends(userId: string): Promise<BiomarkerTrend[]>;
/**
 * Build context for LLM injection about voice biomarkers.
 */
export declare function buildVoiceBiomarkersContext(userId: string, currentBiomarkers?: VoiceBiomarkers): Promise<string>;
export declare const voiceBiomarkers: {
    analyze: typeof analyzeVoiceBiomarkers;
    store: typeof storeBiomarkerReading;
    load: typeof loadBiomarkerReadings;
    getTrends: typeof getBiomarkerTrends;
    buildContext: typeof buildVoiceBiomarkersContext;
    calculateStressTrajectory: typeof calculateStressTrajectory;
};
export {};
//# sourceMappingURL=voice-biomarkers.d.ts.map