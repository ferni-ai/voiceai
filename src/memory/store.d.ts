/**
 * Memory Store
 *
 * Abstract storage interface for user profiles and conversation history.
 * Supports multiple backends: in-memory, file-based, Redis, etc.
 */
import type { UserProfile, ConversationSummary, KeyMoment, FinancialGoal } from '../types/user-profile.js';
/**
 * Query options for listing/searching
 */
export interface QueryOptions {
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
/**
 * Search result with relevance score
 */
export interface SearchResult<T> {
    item: T;
    score: number;
    highlights?: string[];
}
/**
 * Abstract base class for memory storage
 */
export declare abstract class MemoryStore {
    protected _initialized: boolean;
    /**
     * Initialize the store (connect to DB, load files, etc.)
     */
    abstract initialize(): Promise<void>;
    /**
     * Close connections and cleanup
     */
    abstract close(): Promise<void>;
    /**
     * Check if store is ready
     */
    get isInitialized(): boolean;
    /**
     * Get a user profile by ID
     */
    abstract getProfile(userId: string): Promise<UserProfile | null>;
    /**
     * Save/update a user profile
     */
    abstract saveProfile(profile: UserProfile): Promise<void>;
    /**
     * Delete a user profile
     */
    abstract deleteProfile(userId: string): Promise<boolean>;
    /**
     * Check if a user profile exists
     */
    abstract hasProfile(userId: string): Promise<boolean>;
    /**
     * List all user profiles
     */
    abstract listProfiles(options?: QueryOptions): Promise<UserProfile[]>;
    /**
     * Get or create a user profile
     */
    getOrCreateProfile(userId: string, name?: string): Promise<UserProfile>;
    /**
     * Save a conversation summary
     */
    abstract saveSummary(userId: string, summary: ConversationSummary): Promise<void>;
    /**
     * Get conversation summaries for a user
     */
    abstract getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]>;
    /**
     * Get the most recent summary for a user
     */
    getLatestSummary(userId: string): Promise<ConversationSummary | null>;
    /**
     * Add a key moment to a user profile
     */
    abstract addKeyMoment(userId: string, moment: KeyMoment): Promise<void>;
    /**
     * Get key moments for a user
     */
    abstract getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]>;
    /**
     * Get key moments that need follow-up
     */
    getPendingFollowUps(userId: string): Promise<KeyMoment[]>;
    /**
     * Add or update a financial goal
     */
    abstract saveGoal(userId: string, goal: FinancialGoal): Promise<void>;
    /**
     * Get all goals for a user
     */
    abstract getGoals(userId: string): Promise<FinancialGoal[]>;
    /**
     * Delete a goal
     */
    abstract deleteGoal(userId: string, goalId: string): Promise<boolean>;
    /**
     * Search summaries by text (keyword search)
     * Override in implementations that support full-text search
     */
    searchSummaries(userId: string, query: string, options?: QueryOptions): Promise<Array<SearchResult<ConversationSummary>>>;
    /**
     * Export all data for a user (for backup/migration)
     */
    exportUserData(userId: string): Promise<{
        profile: UserProfile | null;
        summaries: ConversationSummary[];
        moments: KeyMoment[];
        goals: FinancialGoal[];
    }>;
    /**
     * Import user data (for restore/migration)
     */
    importUserData(data: {
        profile: UserProfile;
        summaries?: ConversationSummary[];
        moments?: KeyMoment[];
        goals?: FinancialGoal[];
    }): Promise<void>;
}
export default MemoryStore;
//# sourceMappingURL=store.d.ts.map