/**
 * Timing Intelligence
 *
 * Superhuman feature: Know exactly when to share and when to just listen.
 *
 * Human limitation: People share stories about themselves when YOU need to be heard.
 * Superhuman: We know the perfect moment for everything.
 *
 * Core principle: Sometimes the most loving thing is silence.
 *
 * @module personality/timing-intelligence
 */
export type UserIntent = 'needs_to_be_heard' | 'seeking_perspective' | 'open_to_connection' | 'just_venting' | 'seeking_advice' | 'sharing_good_news' | 'processing_aloud' | 'small_talk' | 'vulnerable_share' | 'checking_in';
export type SuggestedResponse = 'deep_listening' | 'validation' | 'reflection' | 'share_story' | 'ask_more' | 'celebrate' | 'hold_space' | 'gentle_guidance' | 'light_engagement';
export interface TimingAnalysis {
    intent: UserIntent;
    confidence: number;
    suggestedResponse: SuggestedResponse;
    personalMomentAppropriate: boolean;
    callbackAppropriate: boolean;
    patternInsightAppropriate: boolean;
    reasoningNotes: string;
}
interface MessageMetadata {
    wordCount?: number;
    sentenceCount?: number;
    hasQuestion?: boolean;
    emotionalIntensity?: number;
    topics?: string[];
    previousTurnWasQuestion?: boolean;
}
/**
 * Analyze a user message to determine timing/response strategy
 */
export declare function analyzeMessageTiming(message: string, metadata?: MessageMetadata): TimingAnalysis;
/**
 * Should we share a personal moment right now?
 */
export declare function shouldSharePersonalMoment(message: string, momentRelevance: number, metadata?: MessageMetadata): {
    should: boolean;
    reason: string;
};
/**
 * Format timing guidance for prompt injection
 */
export declare function formatTimingGuidance(analysis: TimingAnalysis): string;
export type { MessageMetadata };
//# sourceMappingURL=timing-intelligence.d.ts.map