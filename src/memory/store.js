/**
 * Memory Store
 *
 * Abstract storage interface for user profiles and conversation history.
 * Supports multiple backends: in-memory, file-based, Redis, etc.
 */
import { getLogger } from '../utils/safe-logger.js';
/**
 * Abstract base class for memory storage
 */
export class MemoryStore {
    _initialized = false;
    /**
     * Check if store is ready
     */
    get isInitialized() {
        return this._initialized;
    }
    /**
     * Get or create a user profile
     */
    async getOrCreateProfile(userId, name) {
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
    /**
     * Get the most recent summary for a user
     */
    async getLatestSummary(userId) {
        const summaries = await this.getSummaries(userId, {
            limit: 1,
            sortBy: 'timestamp',
            sortOrder: 'desc',
        });
        return summaries[0] || null;
    }
    /**
     * Get key moments that need follow-up
     */
    async getPendingFollowUps(userId) {
        const moments = await this.getKeyMoments(userId);
        const now = new Date();
        return moments.filter((m) => m.followUpNeeded && m.followUpDate && new Date(m.followUpDate) <= now);
    }
    // ============================================================================
    // SEARCH OPERATIONS (for implementations that support it)
    // ============================================================================
    /**
     * Search summaries by text (keyword search)
     * Override in implementations that support full-text search
     */
    async searchSummaries(userId, query, options) {
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
    async exportUserData(userId) {
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
    async importUserData(data) {
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
//# sourceMappingURL=store.js.map