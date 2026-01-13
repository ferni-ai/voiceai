/**
 * Conversational Memory
 *
 * Tracks and references things said during the conversation:
 * - Callback to earlier statements ("Earlier you mentioned...")
 * - Thread tracking (topics to return to)
 * - Commitments & promises ("You said you'd...")
 * - Notable quotes from the user
 * - Key facts shared during conversation
 *
 * This makes the AI feel like it's truly listening and remembering,
 * not just responding to the immediate message.
 *
 * @module conversation/conversational-memory
 */
import type { ConversationCommitment, ConversationThread, ConversationTuningPreferences, MemoryCallback, ProfileContradiction, QuotedMemory, RecordMessageContext, TopicChange, UserProfile, UserStatement } from './types.js';
export type { ConversationCommitment, ConversationThread, ConversationTuningPreferences, MemoryCallback, ProfileContradiction, QuotedMemory, RecordMessageContext, TopicChange, UserProfile, UserStatement, };
export declare class ConversationalMemoryEngine {
    private threadTracker;
    private quotedMemory;
    private callbacks;
    private contradictions;
    private topicDetector;
    private classifier;
    private userStatements;
    private commitments;
    private currentTurn;
    private notableQuotes;
    constructor();
    /**
     * Record user reaction to a memory callback
     * Used to tune callback frequency for this user
     */
    recordCallbackReaction(wasPositive: boolean): void;
    /**
     * Get current callback multiplier for external use
     */
    getCallbackMultiplier(): number;
    /**
     * Export tuning preferences for persistence
     */
    exportTuningPreferences(): ConversationTuningPreferences;
    /**
     * Import tuning preferences from a previous session
     */
    importTuningPreferences(prefs: Partial<ConversationTuningPreferences>): void;
    /**
     * Check if we just gave a callback (for reaction tracking)
     */
    wasLastTurnCallback(): boolean;
    /**
     * Record a user message and extract memorable elements
     */
    recordUserMessage(text: string, context?: RecordMessageContext): void;
    /**
     * Record agent message (for commitment tracking)
     */
    recordAgentMessage(text: string): void;
    /**
     * Get a callback to something said earlier
     * Returns null if nothing appropriate to reference
     */
    getMemoryCallback(currentTopic: string, currentTurn: number): MemoryCallback | null;
    /**
     * Get unresolved threads that could be revisited
     */
    getUnresolvedThreads(): ConversationThread[];
    /**
     * Get unfulfilled commitments
     */
    getUnfulfilledCommitments(): ConversationCommitment[];
    /**
     * Generate a "circling back" phrase for a topic
     */
    generateCircleBack(topic: string): string;
    /**
     * Mark a thread as resolved
     */
    resolveThread(topic: string): void;
    /**
     * Mark a commitment as fulfilled
     */
    fulfillCommitment(what: string): void;
    /**
     * Check if user contradicted something they said earlier (this session)
     */
    checkForContradiction(newStatement: string, topic: string): UserStatement | null;
    /**
     * Enhanced contradiction detection using profile memory
     */
    checkForContradictionWithProfile(newStatement: string, topic: string, profile?: UserProfile): {
        contradiction: UserStatement | null;
        profileContradiction?: ProfileContradiction;
    };
    /**
     * Generate a gentle contradiction acknowledgment
     */
    generateContradictionAcknowledgment(original: UserStatement): string;
    /**
     * Generate a gentle clarification for a profile contradiction
     */
    generateContradictionClarification(profileContradiction: ProfileContradiction): string;
    /**
     * Detect topic from text
     */
    detectTopic(text: string): string | null;
    /**
     * Analyze message for topic change
     */
    analyzeTopicChange(userMessage: string): TopicChange;
    /**
     * Get natural transition phrase for topic change
     */
    getTopicTransitionPhrase(fromTopic: string, toTopic: string): string;
    /**
     * Get current detected topic
     */
    getCurrentTopic(): string | null;
    /**
     * Get topic history
     */
    getTopicHistory(): string[];
    /**
     * Check if returning to a previous topic
     */
    isReturningToTopic(topic: string): boolean;
    /**
     * Get quoted memories for persistence / cross-session callbacks
     */
    getQuotedMemories(): QuotedMemory[];
    /**
     * Import quoted memories from a previous session
     */
    importQuotedMemories(memories: QuotedMemory[]): void;
    /**
     * Reset quoted memories (explicit)
     */
    resetQuotedMemories(): void;
    /**
     * Get conversation summary for handoff/persistence
     */
    getConversationSummary(): {
        keyTopics: string[];
        userStatements: UserStatement[];
        unresolvedThreads: string[];
        commitments: ConversationCommitment[];
    };
    /**
     * Reset for new conversation
     */
    reset(): void;
}
export declare function getConversationalMemory(): ConversationalMemoryEngine;
export declare function resetConversationalMemory(): void;
export default ConversationalMemoryEngine;
//# sourceMappingURL=index.d.ts.map