/**
 * Thread Tracking
 *
 * Tracks conversation threads (topics) and manages thread state.
 * Allows returning to unresolved topics.
 *
 * @module conversation/conversational-memory/thread-tracking
 */
// ============================================================================
// THREAD TRACKER
// ============================================================================
const MAX_THREADS = 10;
export class ThreadTracker {
    threads = [];
    /**
     * Update or create a thread for a topic
     */
    update(topic, currentTurn, userInitiated) {
        const existing = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
        if (existing) {
            existing.lastMentionedTurn = currentTurn;
        }
        else {
            this.threads.push({
                id: `thread_${Date.now()}`,
                topic,
                startedAtTurn: currentTurn,
                lastMentionedTurn: currentTurn,
                importance: 'medium',
                resolved: false,
                userInitiated,
                relatedQuotes: [],
            });
        }
        // Trim old threads
        this.trimOldThreads(currentTurn);
    }
    /**
     * Get unresolved threads
     */
    getUnresolved() {
        return this.threads.filter((t) => !t.resolved);
    }
    /**
     * Get all threads
     */
    getAll() {
        return [...this.threads];
    }
    /**
     * Find an unresolved thread for callback
     */
    findForCallback(currentTopic, currentTurn) {
        return this.threads.find((t) => !t.resolved &&
            t.userInitiated &&
            t.topic !== currentTopic &&
            currentTurn - t.lastMentionedTurn > 3);
    }
    /**
     * Mark thread as mentioned (update lastMentionedTurn)
     */
    markMentioned(topic, turn) {
        const thread = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
        if (thread) {
            thread.lastMentionedTurn = turn;
        }
    }
    /**
     * Mark a thread as resolved
     */
    resolve(topic) {
        const thread = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
        if (thread) {
            thread.resolved = true;
        }
    }
    /**
     * Add a related quote to a thread
     */
    addQuote(topic, quote) {
        const thread = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
        if (thread) {
            thread.relatedQuotes.push(quote);
        }
    }
    /**
     * Get topics from all threads
     */
    getTopics() {
        return [...new Set(this.threads.map((t) => t.topic))];
    }
    /**
     * Reset all threads
     */
    reset() {
        this.threads = [];
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    trimOldThreads(currentTurn) {
        if (this.threads.length > MAX_THREADS) {
            this.threads = this.threads
                .filter((t) => !t.resolved || currentTurn - t.lastMentionedTurn < 10)
                .slice(-MAX_THREADS);
        }
    }
}
//# sourceMappingURL=thread-tracking.js.map