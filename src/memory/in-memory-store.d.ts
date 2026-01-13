/**
 * In-Memory Store Implementation
 *
 * Simple in-memory storage for development and testing.
 * Data persists only for the lifetime of the process.
 *
 * For production, use a persistent store like Redis, PostgreSQL, or file-based.
 */
import { MemoryStore, type QueryOptions } from './store.js';
import type { UserProfile, ConversationSummary, KeyMoment, FinancialGoal } from '../types/user-profile.js';
/**
 * In-memory storage implementation
 */
export declare class InMemoryStore extends MemoryStore {
    private profiles;
    private summaries;
    private moments;
    private goals;
    /**
     * Create a new in-memory store
     */
    constructor();
    /**
     * Initialize the store (no-op for in-memory)
     */
    initialize(): Promise<void>;
    /**
     * Close the store (clears all data)
     */
    close(): Promise<void>;
    getProfile(userId: string): Promise<UserProfile | null>;
    saveProfile(profile: UserProfile): Promise<void>;
    deleteProfile(userId: string): Promise<boolean>;
    hasProfile(userId: string): Promise<boolean>;
    listProfiles(options?: QueryOptions): Promise<UserProfile[]>;
    saveSummary(userId: string, summary: ConversationSummary): Promise<void>;
    getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]>;
    addKeyMoment(userId: string, moment: KeyMoment): Promise<void>;
    getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]>;
    saveGoal(userId: string, goal: FinancialGoal): Promise<void>;
    getGoals(userId: string): Promise<FinancialGoal[]>;
    deleteGoal(userId: string, goalId: string): Promise<boolean>;
    /**
     * Get store statistics
     */
    getStats(): {
        profileCount: number;
        totalSummaries: number;
        totalMoments: number;
        totalGoals: number;
    };
}
/**
 * Get the default in-memory store instance
 */
export declare function getDefaultStore(): InMemoryStore;
/**
 * Reset the default store (for testing)
 */
export declare function resetDefaultStore(): Promise<void>;
export default InMemoryStore;
//# sourceMappingURL=in-memory-store.d.ts.map