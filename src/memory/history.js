/**
 * Conversation History Manager
 *
 * Tracks conversation turns within a session and manages
 * history persistence across sessions.
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// HISTORY TRACKER
// ============================================================================
/**
 * Tracks conversation history within a session
 */
export class ConversationHistoryTracker {
    sessionId;
    userId;
    turns = [];
    startedAt;
    lastActivityAt;
    topicsSet = new Set();
    emotionHistory = [];
    constructor(sessionId, userId) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.startedAt = new Date();
        this.lastActivityAt = new Date();
        getLogger().info(`Created history tracker for session: ${sessionId}`);
    }
    /**
     * Add a turn to the history
     */
    addTurn(turn) {
        // Calculate word count, handling empty content
        const words = turn.content
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0);
        const trackedTurn = {
            ...turn,
            id: `turn_${this.sessionId}_${this.turns.length}`,
            turnIndex: this.turns.length,
            wordCount: words.length,
            timestamp: turn.timestamp || new Date(),
        };
        this.turns.push(trackedTurn);
        this.lastActivityAt = new Date();
        // Track topics
        if (turn.topicsDetected) {
            for (const topic of turn.topicsDetected) {
                this.topicsSet.add(topic);
            }
        }
        // Track emotions
        if (turn.emotionDetected) {
            this.emotionHistory.push(turn.emotionDetected);
        }
        getLogger().debug(`Added turn ${trackedTurn.turnIndex}: ${turn.role} (${trackedTurn.wordCount} words)`);
        return trackedTurn;
    }
    /**
     * Add a user turn
     */
    addUserTurn(content, metadata) {
        return this.addTurn({
            role: 'user',
            content,
            timestamp: new Date(),
            ...metadata,
        });
    }
    /**
     * Add an assistant turn
     */
    addAssistantTurn(content, metadata) {
        return this.addTurn({
            role: 'assistant',
            content,
            timestamp: new Date(),
            ...metadata,
        });
    }
    /**
     * Get all turns
     */
    getTurns() {
        return [...this.turns];
    }
    /**
     * Get recent turns
     */
    getRecentTurns(count) {
        return this.turns.slice(-count);
    }
    /**
     * Get turns as simple ConversationTurn array (for summarizer)
     */
    getSimpleTurns() {
        return this.turns.map((t) => ({
            role: t.role,
            content: t.content,
            timestamp: t.timestamp,
        }));
    }
    /**
     * Get user turns only
     */
    getUserTurns() {
        return this.turns.filter((t) => t.role === 'user');
    }
    /**
     * Get assistant turns only
     */
    getAssistantTurns() {
        return this.turns.filter((t) => t.role === 'assistant');
    }
    /**
     * Get turn count
     */
    getTurnCount() {
        return this.turns.length;
    }
    /**
     * Get session duration in seconds
     */
    getDurationSeconds() {
        return Math.floor((this.lastActivityAt.getTime() - this.startedAt.getTime()) / 1000);
    }
    /**
     * Calculate average user words per minute (speaking pace)
     */
    calculateUserWPM() {
        const userTurns = this.getUserTurns().filter((t) => t.durationMs && t.durationMs > 0);
        if (userTurns.length === 0) {
            return undefined;
        }
        const totalWords = userTurns.reduce((sum, t) => sum + t.wordCount, 0);
        const totalMinutes = userTurns.reduce((sum, t) => sum + (t.durationMs || 0), 0) / 60000;
        if (totalMinutes === 0) {
            return undefined;
        }
        return Math.round(totalWords / totalMinutes);
    }
    /**
     * Get all topics discussed
     */
    getTopicsDiscussed() {
        return Array.from(this.topicsSet);
    }
    /**
     * Get emotional journey
     */
    getEmotionalJourney() {
        return [...this.emotionHistory];
    }
    /**
     * Get full session history with metadata
     */
    getSessionHistory() {
        const totalWordCount = this.turns.reduce((sum, t) => sum + t.wordCount, 0);
        return {
            sessionId: this.sessionId,
            userId: this.userId,
            startedAt: this.startedAt,
            lastActivityAt: this.lastActivityAt,
            turns: [...this.turns],
            metadata: {
                totalWordCount,
                averageWordsPerTurn: this.turns.length > 0 ? Math.round(totalWordCount / this.turns.length) : 0,
                topicsDiscussed: this.getTopicsDiscussed(),
                emotionalJourney: this.getEmotionalJourney(),
            },
        };
    }
    /**
     * Search turns for content
     */
    searchTurns(query) {
        const queryLower = query.toLowerCase();
        return this.turns.filter((t) => t.content.toLowerCase().includes(queryLower));
    }
    /**
     * Get context window (last N turns formatted for prompt)
     */
    getContextWindow(maxTurns = 10, maxChars = 4000) {
        const recent = this.getRecentTurns(maxTurns);
        let context = '';
        const personaName = getActivePersonaName();
        for (const turn of recent) {
            const speaker = turn.role === 'user' ? 'User' : personaName;
            const line = `${speaker}: ${turn.content}\n`;
            if (context.length + line.length > maxChars) {
                break;
            }
            context += line;
        }
        return context.trim();
    }
    /**
     * Clear history (for testing)
     */
    clear() {
        this.turns = [];
        this.topicsSet.clear();
        this.emotionHistory = [];
        getLogger().info(`Cleared history for session: ${this.sessionId}`);
    }
}
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
// Active session trackers
const activeTrackers = new Map();
/**
 * Get or create a history tracker for a session
 */
export function getHistoryTracker(sessionId, userId) {
    let tracker = activeTrackers.get(sessionId);
    if (!tracker) {
        tracker = new ConversationHistoryTracker(sessionId, userId);
        activeTrackers.set(sessionId, tracker);
    }
    return tracker;
}
/**
 * Remove a history tracker (on session end)
 */
export function removeHistoryTracker(sessionId) {
    const tracker = activeTrackers.get(sessionId);
    if (tracker) {
        const history = tracker.getSessionHistory();
        activeTrackers.delete(sessionId);
        getLogger().info(`Removed history tracker for session: ${sessionId}`);
        return history;
    }
    return undefined;
}
/**
 * Get all active session IDs
 */
export function getActiveSessionIds() {
    return Array.from(activeTrackers.keys());
}
/**
 * Clear all history trackers (for shutdown)
 */
export function clearAllHistoryTrackers() {
    activeTrackers.clear();
}
// ============================================================================
// ACTIVE PERSONA NAME TRACKING
// ============================================================================
/**
 * Default persona name when none is set
 */
const DEFAULT_PERSONA_NAME = 'Assistant';
/**
 * Active persona name for current conversation context
 */
let activePersonaName = DEFAULT_PERSONA_NAME;
/**
 * Set the active persona name
 */
export function setActivePersonaName(name) {
    activePersonaName = name;
}
/**
 * Get the active persona name
 */
export function getActivePersonaName() {
    return activePersonaName;
}
/**
 * Reset the active persona name to default
 */
export function resetActivePersonaName() {
    activePersonaName = DEFAULT_PERSONA_NAME;
}
export default {
    ConversationHistoryTracker,
    getHistoryTracker,
    removeHistoryTracker,
    getActiveSessionIds,
    clearAllHistoryTrackers,
    setActivePersonaName,
    getActivePersonaName,
    resetActivePersonaName,
};
//# sourceMappingURL=history.js.map