/**
 * In-Memory Store Implementation
 *
 * Simple in-memory storage for development and testing.
 * Data persists only for the lifetime of the process.
 *
 * For production, use a persistent store like Redis, PostgreSQL, or file-based.
 */

import { getLogger } from '../utils/safe-logger.js';
import { MemoryStore, type QueryOptions } from './store.js';
import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../types/user-profile.js';

/**
 * In-memory storage implementation
 */
export class InMemoryStore extends MemoryStore {
  private profiles: Map<string, UserProfile> = new Map();
  private summaries: Map<string, ConversationSummary[]> = new Map();
  private moments: Map<string, KeyMoment[]> = new Map();
  private goals: Map<string, FinancialGoal[]> = new Map();

  /**
   * Create a new in-memory store
   */
  constructor() {
    super();
  }

  /**
   * Initialize the store (no-op for in-memory)
   */
  initialize(): Promise<void> {
    this._initialized = true;
    getLogger().info('InMemoryStore initialized');
    return Promise.resolve();
  }

  /**
   * Close the store (clears all data)
   */
  close(): Promise<void> {
    this.profiles.clear();
    this.summaries.clear();
    this.moments.clear();
    this.goals.clear();
    this._initialized = false;
    getLogger().info('InMemoryStore closed and cleared');
    return Promise.resolve();
  }

  // ============================================================================
  // USER PROFILE OPERATIONS
  // ============================================================================

  getProfile(userId: string): Promise<UserProfile | null> {
    return Promise.resolve(this.profiles.get(userId) || null);
  }

  saveProfile(profile: UserProfile): Promise<void> {
    this.profiles.set(profile.id, { ...profile, updatedAt: new Date() });
    getLogger().debug(`Saved profile: ${profile.id}`);
    return Promise.resolve();
  }

  deleteProfile(userId: string): Promise<boolean> {
    const existed = this.profiles.has(userId);
    this.profiles.delete(userId);
    this.summaries.delete(userId);
    this.moments.delete(userId);
    this.goals.delete(userId);

    if (existed) {
      getLogger().info(`Deleted profile and related data: ${userId}`);
    }
    return Promise.resolve(existed);
  }

  hasProfile(userId: string): Promise<boolean> {
    return Promise.resolve(this.profiles.has(userId));
  }

  listProfiles(options?: QueryOptions): Promise<UserProfile[]> {
    const profiles = Array.from(this.profiles.values());

    // Sort
    if (options?.sortBy) {
      const key = options.sortBy as keyof UserProfile;
      profiles.sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        if (aVal === undefined || bVal === undefined) return 0;
        if (aVal < bVal) return options.sortOrder === 'desc' ? 1 : -1;
        if (aVal > bVal) return options.sortOrder === 'desc' ? -1 : 1;
        return 0;
      });
    }

    // Paginate
    const offset = options?.offset || 0;
    const limit = options?.limit || profiles.length;
    return Promise.resolve(profiles.slice(offset, offset + limit));
  }

  // ============================================================================
  // CONVERSATION SUMMARY OPERATIONS
  // ============================================================================

  saveSummary(userId: string, summary: ConversationSummary): Promise<void> {
    const existing = this.summaries.get(userId) || [];

    // Check if updating existing summary
    const index = existing.findIndex((s) => s.id === summary.id);
    if (index >= 0) {
      existing[index] = summary;
    } else {
      existing.push(summary);
    }

    this.summaries.set(userId, existing);
    getLogger().debug(`Saved summary ${summary.id} for user ${userId}`);
    return Promise.resolve();
  }

  getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]> {
    const summaries = this.summaries.get(userId) || [];

    // Sort by timestamp by default
    summaries.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return options?.sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
    });

    // Paginate
    const offset = options?.offset || 0;
    const limit = options?.limit || summaries.length;
    return Promise.resolve(summaries.slice(offset, offset + limit));
  }

  // ============================================================================
  // KEY MOMENT OPERATIONS
  // ============================================================================

  addKeyMoment(userId: string, moment: KeyMoment): Promise<void> {
    const existing = this.moments.get(userId) || [];

    // Check for duplicate
    const index = existing.findIndex((m) => m.id === moment.id);
    if (index >= 0) {
      existing[index] = moment;
    } else {
      existing.push(moment);
    }

    this.moments.set(userId, existing);
    getLogger().debug(`Added key moment ${moment.id} for user ${userId}`);
    return Promise.resolve();
  }

  getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]> {
    const moments = this.moments.get(userId) || [];

    // Sort by timestamp by default (most recent first)
    moments.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return options?.sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
    });

    // Paginate
    const offset = options?.offset || 0;
    const limit = options?.limit || moments.length;
    return Promise.resolve(moments.slice(offset, offset + limit));
  }

  // ============================================================================
  // GOAL OPERATIONS
  // ============================================================================

  saveGoal(userId: string, goal: FinancialGoal): Promise<void> {
    const existing = this.goals.get(userId) || [];

    // Update or add
    const index = existing.findIndex((g) => g.id === goal.id);
    if (index >= 0) {
      existing[index] = { ...goal, updatedAt: new Date() };
    } else {
      existing.push(goal);
    }

    this.goals.set(userId, existing);
    getLogger().debug(`Saved goal ${goal.id} for user ${userId}`);
    return Promise.resolve();
  }

  getGoals(userId: string): Promise<FinancialGoal[]> {
    return Promise.resolve(this.goals.get(userId) || []);
  }

  deleteGoal(userId: string, goalId: string): Promise<boolean> {
    const existing = this.goals.get(userId) || [];
    const index = existing.findIndex((g) => g.id === goalId);

    if (index >= 0) {
      existing.splice(index, 1);
      this.goals.set(userId, existing);
      getLogger().debug(`Deleted goal ${goalId} for user ${userId}`);
      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

  // ============================================================================
  // STATISTICS (for debugging)
  // ============================================================================

  /**
   * Get store statistics
   */
  getStats(): {
    profileCount: number;
    totalSummaries: number;
    totalMoments: number;
    totalGoals: number;
  } {
    let totalSummaries = 0;
    let totalMoments = 0;
    let totalGoals = 0;

    for (const summaries of this.summaries.values()) {
      totalSummaries += summaries.length;
    }

    for (const moments of this.moments.values()) {
      totalMoments += moments.length;
    }

    for (const goals of this.goals.values()) {
      totalGoals += goals.length;
    }

    return {
      profileCount: this.profiles.size,
      totalSummaries,
      totalMoments,
      totalGoals,
    };
  }
}

// Singleton instance for the application
let defaultStore: InMemoryStore | null = null;

/**
 * Get the default in-memory store instance
 */
export function getDefaultStore(): InMemoryStore {
  if (!defaultStore) {
    defaultStore = new InMemoryStore();
  }
  return defaultStore;
}

/**
 * Reset the default store (for testing)
 */
export async function resetDefaultStore(): Promise<void> {
  if (defaultStore) {
    await defaultStore.close();
    defaultStore = null;
  }
}

export default InMemoryStore;
