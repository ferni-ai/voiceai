/**
 * Between-Session Thinking
 *
 * "I've been thinking about what you said..."
 *
 * Philosophy: Real relationships don't pause between conversations.
 * We think about people we care about. This system creates the
 * illusion (and eventually, the reality) of continuous presence.
 *
 * When to record:
 * - End of meaningful conversations
 * - After breakthroughs or vulnerable moments
 * - When user shares something that needs processing
 * - When conversation ends on an open thread
 *
 * When to surface:
 * - Start of next session (with probability gating)
 * - When relevant topic comes up
 * - After appropriate relationship depth reached
 *
 * @module BetweenSessionThinking
 */
export type ThinkingType = 'mulling' | 'connecting' | 'realizing' | 'questioning' | 'remembering' | 'concerned';
export interface ThinkingRecord {
    id: string;
    userId: string;
    personaId: string;
    /** The topic or theme being thought about */
    topic: string;
    /** Optional direct quote from user */
    userQuote?: string;
    /** Context about what prompted this */
    context: string;
    /** How emotionally weighty is this */
    emotionalWeight: 'light' | 'medium' | 'heavy';
    /** Type of thinking */
    thinkingType: ThinkingType;
    /** When this was recorded */
    createdAt: Date;
    /** When this was surfaced (if ever) */
    surfacedAt?: Date;
    /** How many sessions since this was recorded */
    sessionsSince: number;
    /** Session ID when recorded */
    sourceSessionId: string;
}
export interface ThinkingMoment {
    record: ThinkingRecord;
    phrase: string;
    ssml: string;
    shouldAskPermission: boolean;
}
/**
 * Record something worth thinking about between sessions.
 * Call this at meaningful moments during conversation.
 */
export declare function recordThinkingMoment(params: {
    userId: string;
    personaId: string;
    topic: string;
    userQuote?: string;
    context: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
    thinkingType: ThinkingType;
    sourceSessionId: string;
}): ThinkingRecord;
/**
 * Get a thinking moment to surface at the start of a session.
 * Returns null if nothing appropriate to surface.
 */
export declare function getThinkingMomentToSurface(userId: string, personaId: string, currentSessionId: string): ThinkingMoment | null;
/**
 * Mark a thinking moment as surfaced
 */
export declare function markThinkingSurfaced(recordId: string): void;
/**
 * Increment sessions since for all records of a user.
 * Call this when a new session starts.
 */
export declare function incrementSessionCount(userId: string): void;
/**
 * Detect if the current conversation contains something worth "thinking about"
 * Call this during turn processing
 */
export declare function detectThinkingWorthy(context: {
    userText: string;
    topic?: string;
    emotion?: string;
    isVulnerable?: boolean;
    isBreakthrough?: boolean;
    hasOpenQuestion?: boolean;
}): {
    worthy: boolean;
    type?: ThinkingType;
    extractedTopic?: string;
    emotionalWeight?: 'light' | 'medium' | 'heavy';
    quote?: string;
};
export declare function loadThinkingRecords(userId: string, records: ThinkingRecord[]): void;
export declare function getThinkingRecordsForPersistence(userId: string): ThinkingRecord[];
export declare function getAllUnsurfacedThinking(userId: string): ThinkingRecord[];
/**
 * Clear all thinking records for a user (for testing)
 */
export declare function clearUserThinking(userId: string): void;
/**
 * Alias for markThinkingSurfaced (for consistency)
 */
export declare function markMomentSurfaced(userId: string, recordId: string): void;
declare const _default: {
    recordThinkingMoment: typeof recordThinkingMoment;
    getThinkingMomentToSurface: typeof getThinkingMomentToSurface;
    markThinkingSurfaced: typeof markThinkingSurfaced;
    markMomentSurfaced: typeof markMomentSurfaced;
    incrementSessionCount: typeof incrementSessionCount;
    detectThinkingWorthy: typeof detectThinkingWorthy;
    loadThinkingRecords: typeof loadThinkingRecords;
    getThinkingRecordsForPersistence: typeof getThinkingRecordsForPersistence;
    getAllUnsurfacedThinking: typeof getAllUnsurfacedThinking;
    clearUserThinking: typeof clearUserThinking;
};
export default _default;
//# sourceMappingURL=between-session-thinking.d.ts.map