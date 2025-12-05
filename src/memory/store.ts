/**
 * Memory Store
 *
 * Abstract storage interface for user profiles and conversation history.
 * Supports multiple backends: in-memory, file-based, Redis, etc.
 */

import { getLogger } from '../utils/safe-logger.js';
import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../types/user-profile.js';

// Lazy logger to avoid initialization before CLI runs

// ============================================================================
// STORE INTERFACE
// ============================================================================

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
export abstract class MemoryStore {
  protected _initialized = false;

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
  get isInitialized(): boolean {
    return this._initialized;
  }

  // ============================================================================
  // USER PROFILE OPERATIONS
  // ============================================================================

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
  async getOrCreateProfile(userId: string, name?: string): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    if (existing) {
      return existing;
    }

    const { createUserProfile } = await import('../types/user-profile.js');
    const newProfile = createUserProfile(userId, name);
    await this.saveProfile(newProfile);

    getLogger().info(`Created new user profile: ${userId}`);
    return newProfile;
  }

  // ============================================================================
  // CONVERSATION SUMMARY OPERATIONS
  // ============================================================================

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
  async getLatestSummary(userId: string): Promise<ConversationSummary | null> {
    const summaries = await this.getSummaries(userId, {
      limit: 1,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    });
    return summaries[0] || null;
  }

  // ============================================================================
  // KEY MOMENT OPERATIONS
  // ============================================================================

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
  async getPendingFollowUps(userId: string): Promise<KeyMoment[]> {
    const moments = await this.getKeyMoments(userId);
    const now = new Date();
    return moments.filter(
      (m) => m.followUpNeeded && m.followUpDate && new Date(m.followUpDate) <= now
    );
  }

  // ============================================================================
  // GOAL OPERATIONS
  // ============================================================================

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

  // ============================================================================
  // SEARCH OPERATIONS (for implementations that support it)
  // ============================================================================

  /**
   * Search summaries by text (keyword search)
   * Override in implementations that support full-text search
   */
  async searchSummaries(
    userId: string,
    query: string,
    options?: QueryOptions
  ): Promise<SearchResult<ConversationSummary>[]> {
    // Default implementation: simple keyword match
    const summaries = await this.getSummaries(userId);
    const queryLower = query.toLowerCase();

    return summaries
      .map((summary) => {
        const text = [...summary.mainTopics, ...summary.keyPoints, summary.emotionalArc]
          .join(' ')
          .toLowerCase();

        const words = queryLower.split(/\s+/);
        const matches = words.filter((w) => text.includes(w)).length;
        const score = matches / words.length;

        return { item: summary, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.limit || 10);
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Export all data for a user (for backup/migration)
   */
  async exportUserData(userId: string): Promise<{
    profile: UserProfile | null;
    summaries: ConversationSummary[];
    moments: KeyMoment[];
    goals: FinancialGoal[];
  }> {
    const [profile, summaries, moments, goals] = await Promise.all([
      this.getProfile(userId),
      this.getSummaries(userId),
      this.getKeyMoments(userId),
      this.getGoals(userId),
    ]);

    return { profile, summaries, moments, goals };
  }

  /**
   * Import user data (for restore/migration)
   */
  async importUserData(data: {
    profile: UserProfile;
    summaries?: ConversationSummary[];
    moments?: KeyMoment[];
    goals?: FinancialGoal[];
  }): Promise<void> {
    await this.saveProfile(data.profile);

    if (data.summaries) {
      for (const summary of data.summaries) {
        await this.saveSummary(data.profile.id, summary);
      }
    }

    if (data.moments) {
      for (const moment of data.moments) {
        await this.addKeyMoment(data.profile.id, moment);
      }
    }

    if (data.goals) {
      for (const goal of data.goals) {
        await this.saveGoal(data.profile.id, goal);
      }
    }

    getLogger().info(`Imported data for user: ${data.profile.id}`);
  }
}

export default MemoryStore;
