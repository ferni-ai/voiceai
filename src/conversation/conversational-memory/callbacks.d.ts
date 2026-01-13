/**
 * Memory Callback Generation
 *
 * Generates callbacks to earlier statements, threads, and commitments.
 * Tracks callback frequency and tunes based on user engagement.
 *
 * @module conversation/conversational-memory/callbacks
 */
import type { ConversationCommitment, ConversationThread, ConversationTuningPreferences, MemoryCallback, UserStatement } from './types.js';
export declare class CallbackGenerator {
    private callbacksGiven;
    private positiveCallbackReactions;
    private lastCallbackTurn;
    private callbackMultiplier;
    /**
     * Record user reaction to a memory callback
     * Used to tune callback frequency for this user
     */
    recordReaction(wasPositive: boolean): void;
    /**
     * Get current callback multiplier
     */
    getMultiplier(): number;
    /**
     * Check if we just gave a callback
     */
    wasLastTurnCallback(currentTurn: number): boolean;
    /**
     * Record that a callback was given
     */
    recordCallback(turn: number): void;
    /**
     * Get last callback turn
     */
    getLastCallbackTurn(): number;
    /**
     * Export tuning preferences for persistence
     */
    exportPreferences(): ConversationTuningPreferences;
    /**
     * Import tuning preferences from a previous session
     */
    importPreferences(prefs: Partial<ConversationTuningPreferences>): void;
    /**
     * Check if it's appropriate to give a callback
     */
    shouldCallback(currentTurn: number): boolean;
    /**
     * Create a thread callback
     */
    createThreadCallback(thread: ConversationThread, seed?: string): MemoryCallback;
    /**
     * Create a statement callback
     */
    createStatementCallback(statement: UserStatement, seed?: string): MemoryCallback;
    /**
     * Create a commitment callback
     */
    createCommitmentCallback(commitment: ConversationCommitment, seed?: string): MemoryCallback;
    /**
     * Create a notable quote callback
     */
    createQuoteCallback(quote: string): MemoryCallback;
    /**
     * Reset callback state
     */
    reset(): void;
    /**
     * Full reset including tuning
     */
    fullReset(): void;
}
//# sourceMappingURL=callbacks.d.ts.map