/**
 * Conversation History Manager
 *
 * Tracks conversation turns within a session and manages
 * history persistence across sessions.
 */
import type { ConversationTurn } from './summarizer.js';
/**
 * Extended turn with additional metadata
 */
export interface TrackedTurn extends ConversationTurn {
    id: string;
    turnIndex: number;
    wordCount: number;
    emotionDetected?: string;
    topicsDetected?: string[];
    durationMs?: number;
}
/**
 * Session history with metadata
 */
export interface SessionHistory {
    sessionId: string;
    userId?: string;
    startedAt: Date;
    lastActivityAt: Date;
    turns: TrackedTurn[];
    metadata: {
        totalWordCount: number;
        averageWordsPerTurn: number;
        topicsDiscussed: string[];
        emotionalJourney: string[];
    };
}
/**
 * Tracks conversation history within a session
 */
export declare class ConversationHistoryTracker {
    private sessionId;
    private userId?;
    private turns;
    private startedAt;
    private lastActivityAt;
    private topicsSet;
    private emotionHistory;
    constructor(sessionId: string, userId?: string);
    /**
     * Add a turn to the history
     */
    addTurn(turn: Omit<TrackedTurn, 'id' | 'turnIndex' | 'wordCount'>): TrackedTurn;
    /**
     * Add a user turn
     */
    addUserTurn(content: string, metadata?: {
        emotionDetected?: string;
        topicsDetected?: string[];
        durationMs?: number;
    }): TrackedTurn;
    /**
     * Add an assistant turn
     */
    addAssistantTurn(content: string, metadata?: {
        topicsDetected?: string[];
    }): TrackedTurn;
    /**
     * Get all turns
     */
    getTurns(): TrackedTurn[];
    /**
     * Get recent turns
     */
    getRecentTurns(count: number): TrackedTurn[];
    /**
     * Get turns as simple ConversationTurn array (for summarizer)
     */
    getSimpleTurns(): ConversationTurn[];
    /**
     * Get user turns only
     */
    getUserTurns(): TrackedTurn[];
    /**
     * Get assistant turns only
     */
    getAssistantTurns(): TrackedTurn[];
    /**
     * Get turn count
     */
    getTurnCount(): number;
    /**
     * Get session duration in seconds
     */
    getDurationSeconds(): number;
    /**
     * Calculate average user words per minute (speaking pace)
     */
    calculateUserWPM(): number | undefined;
    /**
     * Get all topics discussed
     */
    getTopicsDiscussed(): string[];
    /**
     * Get emotional journey
     */
    getEmotionalJourney(): string[];
    /**
     * Get full session history with metadata
     */
    getSessionHistory(): SessionHistory;
    /**
     * Search turns for content
     */
    searchTurns(query: string): TrackedTurn[];
    /**
     * Get context window (last N turns formatted for prompt)
     */
    getContextWindow(maxTurns?: number, maxChars?: number): string;
    /**
     * Clear history (for testing)
     */
    clear(): void;
}
/**
 * Get or create a history tracker for a session
 */
export declare function getHistoryTracker(sessionId: string, userId?: string): ConversationHistoryTracker;
/**
 * Remove a history tracker (on session end)
 */
export declare function removeHistoryTracker(sessionId: string): SessionHistory | undefined;
/**
 * Get all active session IDs
 */
export declare function getActiveSessionIds(): string[];
/**
 * Clear all history trackers (for shutdown)
 */
export declare function clearAllHistoryTrackers(): void;
/**
 * Set the active persona name
 */
export declare function setActivePersonaName(name: string): void;
/**
 * Get the active persona name
 */
export declare function getActivePersonaName(): string;
/**
 * Reset the active persona name to default
 */
export declare function resetActivePersonaName(): void;
declare const _default: {
    ConversationHistoryTracker: typeof ConversationHistoryTracker;
    getHistoryTracker: typeof getHistoryTracker;
    removeHistoryTracker: typeof removeHistoryTracker;
    getActiveSessionIds: typeof getActiveSessionIds;
    clearAllHistoryTrackers: typeof clearAllHistoryTrackers;
    setActivePersonaName: typeof setActivePersonaName;
    getActivePersonaName: typeof getActivePersonaName;
    resetActivePersonaName: typeof resetActivePersonaName;
};
export default _default;
//# sourceMappingURL=history.d.ts.map