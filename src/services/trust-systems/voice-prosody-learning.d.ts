/**
 * Voice Prosody Learning
 *
 * Learns user's unique voice patterns over time for better
 * emotion detection and personalized understanding.
 *
 * Philosophy: Everyone expresses emotion differently.
 * "Quiet" for one person might be "screaming" for another.
 * Learning individual baselines enables true understanding.
 *
 * Features:
 * - Personal baseline establishment
 * - Deviation detection from personal norm
 * - Confidence boosting through familiarity
 * - Voice evolution tracking
 * - Micro-expression detection
 *
 * PERSISTENCE: Voice baselines and samples are persisted to Firestore.
 *
 * @module VoiceProsodyLearning
 */
export interface VoiceCharacteristics {
    pitchMean: number;
    pitchRange: number;
    pitchVariability: number;
    energyMean: number;
    energyRange: number;
    energyVariability: number;
    speakingRate: number;
    pauseFrequency: number;
    pauseDuration: number;
    breathiness: number;
    tension: number;
    clarity: number;
}
export interface PersonalBaseline {
    userId: string;
    characteristics: VoiceCharacteristics;
    sampleCount: number;
    confidence: number;
    establishedAt: Date;
    lastUpdated: Date;
    emotionalProfiles: EmotionalVoiceProfile[];
}
export interface EmotionalVoiceProfile {
    emotion: string;
    characteristics: Partial<VoiceCharacteristics>;
    sampleCount: number;
    confidence: number;
}
export interface VoiceSample {
    timestamp: Date;
    characteristics: VoiceCharacteristics;
    detectedEmotion?: string;
    userConfirmedEmotion?: string;
    context?: string;
}
export interface DeviationAnalysis {
    deviates: boolean;
    magnitude: number;
    direction: 'elevated' | 'subdued' | 'normal';
    significantFactors: SignificantFactor[];
    possibleMeaning: string;
    confidence: number;
}
export interface SignificantFactor {
    factor: keyof VoiceCharacteristics;
    baseline: number;
    current: number;
    deviation: number;
    interpretation: string;
}
export interface VoiceEvolution {
    period: 'week' | 'month' | 'quarter';
    changes: VoiceChange[];
    interpretation: string;
}
export interface VoiceChange {
    factor: string;
    direction: 'increased' | 'decreased' | 'stable';
    magnitude: number;
    significance: 'notable' | 'subtle' | 'none';
}
/**
 * Flush persistence
 */
export declare function flushVoiceProsodyPersistence(): Promise<void>;
/**
 * Shutdown voice prosody service
 */
export declare function shutdownVoiceProsody(): Promise<void>;
/**
 * Record a voice sample and update baseline
 */
export declare function recordVoiceSample(userId: string, characteristics: VoiceCharacteristics, context?: {
    detectedEmotion?: string;
    userConfirmedEmotion?: string;
    conversationContext?: string;
}): void;
/**
 * Analyze deviation from personal baseline
 */
export declare function analyzeDeviation(userId: string, currentCharacteristics: VoiceCharacteristics): DeviationAnalysis;
/**
 * Track voice evolution over time
 */
export declare function getVoiceEvolution(userId: string, period: 'week' | 'month' | 'quarter'): VoiceEvolution | null;
/**
 * Get familiarity score - how well we know this voice
 */
export declare function getFamiliarityScore(userId: string): {
    score: number;
    level: 'stranger' | 'acquaintance' | 'familiar' | 'well_known';
    description: string;
};
/**
 * Get boost for emotion detection based on familiarity
 */
export declare function getEmotionDetectionBoost(userId: string): number;
/**
 * Get baseline for user
 */
export declare function getBaseline(userId: string): PersonalBaseline | null;
/**
 * Check if user mentions something about their voice
 */
export declare function detectVoiceMention(text: string): {
    mentioned: boolean;
    type?: 'tired' | 'sick' | 'excited' | 'stressed' | 'other';
};
/**
 * Generate context for LLM about voice state
 *
 * "Better than Human" - We notice things about their voice that even close
 * friends might miss. This generates insights that make Ferni feel like
 * a friend who really knows them.
 */
export declare function generateVoiceContext(userId: string): string | null;
declare const _default: {
    recordVoiceSample: typeof recordVoiceSample;
    analyzeDeviation: typeof analyzeDeviation;
    getVoiceEvolution: typeof getVoiceEvolution;
    getFamiliarityScore: typeof getFamiliarityScore;
    getEmotionDetectionBoost: typeof getEmotionDetectionBoost;
    getBaseline: typeof getBaseline;
    detectVoiceMention: typeof detectVoiceMention;
    generateVoiceContext: typeof generateVoiceContext;
};
export default _default;
//# sourceMappingURL=voice-prosody-learning.d.ts.map