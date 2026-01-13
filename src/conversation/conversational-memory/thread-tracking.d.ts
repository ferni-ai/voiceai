/**
 * Thread Tracking
 *
 * Tracks conversation threads (topics) and manages thread state.
 * Allows returning to unresolved topics.
 *
 * @module conversation/conversational-memory/thread-tracking
 */
import type { ConversationThread } from './types.js';
export declare class ThreadTracker {
    private threads;
    /**
     * Update or create a thread for a topic
     */
    update(topic: string, currentTurn: number, userInitiated: boolean): void;
    /**
     * Get unresolved threads
     */
    getUnresolved(): ConversationThread[];
    /**
     * Get all threads
     */
    getAll(): ConversationThread[];
    /**
     * Find an unresolved thread for callback
     */
    findForCallback(currentTopic: string, currentTurn: number): ConversationThread | undefined;
    /**
     * Mark thread as mentioned (update lastMentionedTurn)
     */
    markMentioned(topic: string, turn: number): void;
    /**
     * Mark a thread as resolved
     */
    resolve(topic: string): void;
    /**
     * Add a related quote to a thread
     */
    addQuote(topic: string, quote: string): void;
    /**
     * Get topics from all threads
     */
    getTopics(): string[];
    /**
     * Reset all threads
     */
    reset(): void;
    private trimOldThreads;
}
//# sourceMappingURL=thread-tracking.d.ts.map