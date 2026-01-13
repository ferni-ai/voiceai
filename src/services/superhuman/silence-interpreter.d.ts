/**
 * Silence Interpreter
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Classifies different types of silence and responds appropriately.
 * Because sometimes silence IS the conversation.
 *
 * Your friend talks to fill every silence. Ferni knows when silence means:
 * - Processing: Let them think
 * - Emotional: Words are too hard
 * - Uncomfortable: Something unspoken
 * - Invitational: They want you to go deeper
 * - Exhausted: They need rest, not words
 * - Contemplative: They're somewhere beautiful
 *
 * @module SilenceInterpreter
 */
export type SilenceType = 'processing' | 'emotional' | 'uncomfortable' | 'invitational' | 'exhausted' | 'contemplative';
export type SilenceResponse = 'hold_space' | 'gentle_presence' | 'soft_prompt' | 'offer_rest' | 'honor_moment';
export type BreathPattern = 'held' | 'sighing' | 'normal' | 'quickening' | 'deep';
export type MicroSound = 'hmm' | 'um' | 'sigh' | 'sniff' | 'throat_clear' | 'none';
export interface VoiceMarkers {
    breathPattern: BreathPattern;
    microSounds: MicroSound[];
    energyJustBefore: number;
    emotionJustBefore?: string;
}
export interface SilenceAnalysis {
    /** Classified silence type */
    type: SilenceType;
    /** Confidence in classification (0-1) */
    confidence: number;
    /** Duration of silence in ms */
    duration: number;
    /** Voice markers that informed classification */
    voiceMarkers: VoiceMarkers;
    /** Recommended response type */
    recommendedResponse: SilenceResponse;
    /** SSML phrase to use (may be empty for hold_space) */
    responsePhrase: string;
    /** Should Ferni stay silent too? */
    shouldWait: boolean;
    /** How long to wait before responding (ms) */
    waitDurationMs: number;
}
export interface SilenceSignature {
    typicalDuration: {
        min: number;
        max: number;
    };
    voiceMarkersBefore: string[];
    breathPatternDuring: BreathPattern[];
    confidenceThreshold: number;
    bestResponse: SilenceResponse;
}
export interface SilenceHistoryEntry {
    timestamp: Date;
    type: SilenceType;
    duration: number;
    precedingTopic?: string;
    precedingEmotion?: string;
    ferniResponse: string;
    wasHelpful?: boolean;
    voiceMarkers: VoiceMarkers;
}
export interface SilenceProfile {
    userId: string;
    /** Learned silence signatures for this user */
    silenceSignatures: Record<SilenceType, SilenceSignature>;
    /** Historical patterns */
    silenceHistory: SilenceHistoryEntry[];
    /** User's baseline silence tolerance (ms before they feel awkward) */
    baselinePauseTolerance: number;
    updatedAt: Date;
}
/**
 * Analyze a silence to determine its meaning.
 * Call this when user has been silent for > 1 second.
 */
export declare function analyzeSilence(durationMs: number, context: {
    precedingTopic?: string;
    precedingEmotion?: string;
    precedingUserMessage?: string;
    voiceMarkersBefore: VoiceMarkers;
    conversationPhase: 'opening' | 'middle' | 'deep' | 'closing';
    recentHeavyTopics?: string[];
    userProfile?: SilenceProfile;
}): SilenceAnalysis;
/**
 * Record a silence and user's response for learning.
 */
export declare function recordSilenceOutcome(userId: string, analysis: SilenceAnalysis, outcome: {
    ferniResponse: string;
    wasHelpful?: boolean;
    userContinued: boolean;
    topic?: string;
    emotion?: string;
}): Promise<void>;
/**
 * Load user's silence profile.
 */
export declare function loadSilenceProfile(userId: string): Promise<SilenceProfile | null>;
/**
 * Update user's baseline pause tolerance based on their patterns.
 */
export declare function updateBaselineTolerance(userId: string): Promise<void>;
/**
 * Build guidance string for LLM injection.
 */
export declare function buildSilenceGuidance(analysis: SilenceAnalysis): string;
/**
 * Build context for ongoing conversation.
 */
export declare function buildSilenceContext(userId: string): Promise<string>;
/**
 * Quick check if we should analyze a silence (duration threshold).
 */
export declare function shouldAnalyzeSilence(durationMs: number): boolean;
/**
 * Get a random response phrase for a silence type.
 */
export declare function getResponsePhrase(type: SilenceType): string;
export declare const silenceInterpreter: {
    analyzeSilence: typeof analyzeSilence;
    recordSilenceOutcome: typeof recordSilenceOutcome;
    loadSilenceProfile: typeof loadSilenceProfile;
    updateBaselineTolerance: typeof updateBaselineTolerance;
    buildSilenceGuidance: typeof buildSilenceGuidance;
    buildSilenceContext: typeof buildSilenceContext;
    shouldAnalyzeSilence: typeof shouldAnalyzeSilence;
    getResponsePhrase: typeof getResponsePhrase;
};
export default silenceInterpreter;
//# sourceMappingURL=silence-interpreter.d.ts.map