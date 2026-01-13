/**
 * "Thinking of You" Proactive Outreach
 *
 * Reaching out with no agenda - just because you crossed my mind.
 *
 * Philosophy: The most meaningful check-ins aren't scheduled or triggered
 * by due dates. They're the random "I was thinking about you" moments
 * that show someone genuinely cares.
 *
 * This system generates:
 * - No-agenda check-ins based on things they shared
 * - "I saw something that reminded me of you"
 * - "I've been thinking about what you said"
 * - Random warmth without ulterior motive
 *
 * @module ThinkingOfYou
 */
export interface ThinkingOfYouMoment {
    id: string;
    /** Type of outreach */
    type: 'genuine_check_in' | 'thought_of_you' | 'following_thread' | 'celebrating_quietly' | 'holding_space' | 'random_warmth';
    /** What triggered this thought */
    trigger: {
        type: 'time_based' | 'topic_based' | 'date_based' | 'random';
        context?: string;
        theirWords?: string;
    };
    /** The outreach message */
    message: string;
    /** SSML version for voice */
    ssml: string;
    /** When this should be sent */
    suggestedTiming: Date;
    /** Priority (affects when it actually sends) */
    priority: 'high' | 'medium' | 'low';
    /** Whether this has been sent */
    sent: boolean;
    /** Response received */
    responseReceived?: boolean;
}
export interface SignificantShare {
    id: string;
    /** What they shared */
    content: string;
    /** When they shared it */
    sharedAt: Date;
    /** Topic category */
    topic: string;
    /** Emotional weight of what they shared */
    emotionalWeight: 'light' | 'medium' | 'heavy';
    /** Key people mentioned */
    peopleMentioned: string[];
    /** If there's a date associated (event, deadline, etc.) */
    associatedDate?: Date;
    /** What kind of follow-up might be appropriate */
    followUpType: 'check_in' | 'celebrate' | 'support' | 'remember';
}
export interface ThinkingOfYouProfile {
    userId: string;
    /** Significant things they've shared */
    significantShares: SignificantShare[];
    /** Generated but not-yet-sent moments */
    pendingMoments: ThinkingOfYouMoment[];
    /** Sent moments (for avoiding repetition) */
    sentMoments: ThinkingOfYouMoment[];
    /** Preferences about unsolicited outreach */
    preferences: {
        enabled: boolean;
        maxPerWeek: number;
        preferredMethod: 'voice' | 'text' | 'either';
        quietDays: string[];
    };
    /** Last time we reached out with no agenda */
    lastNoAgendaOutreach?: Date;
}
/**
 * Analyze a message for significant shares worth following up on
 */
export declare function detectSignificantShare(userId: string, userMessage: string, context: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
}): SignificantShare | null;
/**
 * Generate "thinking of you" moments based on stored shares
 */
export declare function generateThinkingOfYouMoments(userId: string): ThinkingOfYouMoment[];
/**
 * Generate a random warmth message (pure "thinking of you" with no trigger)
 */
export declare function generateRandomWarmth(userId: string): ThinkingOfYouMoment | null;
/**
 * Get pending moments that are due
 */
export declare function getDueMoments(userId: string): ThinkingOfYouMoment[];
/**
 * Mark a moment as sent
 */
export declare function markMomentSent(userId: string, momentId: string): void;
/**
 * Record response to outreach
 */
export declare function recordOutreachResponse(userId: string, momentId: string, responded: boolean): void;
/**
 * Update outreach preferences
 */
export declare function updatePreferences(userId: string, preferences: Partial<ThinkingOfYouProfile['preferences']>): void;
/**
 * Export profile for persistence
 */
export declare function exportThinkingOfYouProfile(userId: string): ThinkingOfYouProfile | null;
/**
 * Import profile from persistence
 */
export declare function importThinkingOfYouProfile(profile: ThinkingOfYouProfile): void;
declare const _default: {
    detectSignificantShare: typeof detectSignificantShare;
    generateThinkingOfYouMoments: typeof generateThinkingOfYouMoments;
    generateRandomWarmth: typeof generateRandomWarmth;
    getDueMoments: typeof getDueMoments;
    markMomentSent: typeof markMomentSent;
    recordOutreachResponse: typeof recordOutreachResponse;
    updatePreferences: typeof updatePreferences;
    exportThinkingOfYouProfile: typeof exportThinkingOfYouProfile;
    importThinkingOfYouProfile: typeof importThinkingOfYouProfile;
};
export default _default;
//# sourceMappingURL=thinking-of-you.d.ts.map