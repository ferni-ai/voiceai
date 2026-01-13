/**
 * Coaching Style Adaptation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Different people need different coaching approaches.
 * Detects and adapts to user's preferred coaching style.
 *
 * Philosophy:
 * - Meet people where they are
 * - Style is not about us, it's about them
 * - Adapt without losing authenticity
 *
 * @module StyleAdaptation
 */
export type CoachingStyle = 'analytical' | 'emotional' | 'action' | 'reflective' | 'supportive' | 'challenging';
export type ProcessingMode = 'verbal' | 'internal' | 'collaborative';
export type FeedbackPreference = 'direct' | 'gentle' | 'curious';
export interface CoachingStyleProfile {
    userId: string;
    primaryStyle: CoachingStyle;
    secondaryStyle?: CoachingStyle;
    confidence: number;
    processingMode: ProcessingMode;
    feedbackPreference: FeedbackPreference;
    preferences: {
        pacingPreference: 'fast' | 'medium' | 'slow';
        silenceComfort: 'comfortable' | 'uncomfortable';
        advicePreference: 'ask_first' | 'offer_freely' | 'only_when_asked';
        emotionalDepth: 'surface' | 'moderate' | 'deep';
        accountabilityLevel: 'light' | 'moderate' | 'strong';
    };
    signals: StyleSignal[];
    lastUpdated: Date;
}
export interface StyleSignal {
    timestamp: Date;
    signal: string;
    indicatedStyle: CoachingStyle;
    source: 'explicit' | 'behavioral' | 'response_pattern';
}
/**
 * Analyze a message for style indicators
 */
export declare function detectStyleSignals(userId: string, userMessage: string): StyleSignal[];
/**
 * Set explicit style preference
 */
export declare function setExplicitStylePreference(userId: string, style: CoachingStyle, preferences?: Partial<CoachingStyleProfile['preferences']>): void;
interface StyleGuidance {
    responseStyle: string;
    pacing: string;
    questionStyle: string;
    adviceApproach: string;
    tone: string;
}
/**
 * Get coaching guidance for a user's style
 */
export declare function getStyleGuidance(userId: string): StyleGuidance & {
    style: CoachingStyle;
    confidence: number;
};
/**
 * Build LLM context for coaching style
 */
export declare function buildStyleContext(userId: string): string | null;
export declare function getStyleProfile(userId: string): CoachingStyleProfile;
export declare function getPreferredStyle(userId: string): CoachingStyle;
export declare function exportStyleProfile(userId: string): CoachingStyleProfile | null;
export declare function importStyleProfile(profile: CoachingStyleProfile): void;
declare const _default: {
    detectStyleSignals: typeof detectStyleSignals;
    setExplicitStylePreference: typeof setExplicitStylePreference;
    getStyleGuidance: typeof getStyleGuidance;
    buildStyleContext: typeof buildStyleContext;
    getStyleProfile: typeof getStyleProfile;
    getPreferredStyle: typeof getPreferredStyle;
    exportStyleProfile: typeof exportStyleProfile;
    importStyleProfile: typeof importStyleProfile;
};
export default _default;
//# sourceMappingURL=style-adaptation.d.ts.map