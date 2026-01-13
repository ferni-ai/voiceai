/**
 * Engagement Firestore Store
 *
 * Persists daily rituals, streaks, emotional weather, and engagement data to Firestore.
 * Provides the foundation for all engagement features requiring persistence.
 *
 * Collections:
 * - engagement_profiles/{userId} - Main engagement profile
 * - engagement_profiles/{userId}/ritual_streaks/{ritualId} - Individual ritual streaks
 * - engagement_profiles/{userId}/weather_history/{date} - Daily emotional weather
 * - engagement_profiles/{userId}/predictions/{predictionId} - Weekly predictions
 * - engagement_profiles/{userId}/team_huddles/{huddleId} - Team huddle history
 */
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// ENGAGEMENT STORE
// ============================================================================
export class EngagementStore {
    db = null;
    COLLECTION = 'engagement_profiles';
    memoryCache = new Map();
    /**
     * Initialize Firestore connection
     */
    async initialize() {
        if (this.db)
            return;
        try {
            const { Firestore } = await import('@google-cloud/firestore');
            this.db = new Firestore({
                projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            });
            getLogger().info('Engagement store initialized with Firestore');
        }
        catch (error) {
            getLogger().warn({ error }, 'Firestore not available, using memory cache');
        }
    }
    /**
     * Get or create engagement profile
     */
    async getProfile(userId) {
        // Check memory cache first
        const cached = this.memoryCache.get(userId);
        if (cached)
            return cached;
        // Try Firestore
        if (this.db) {
            try {
                const doc = await this.db.collection(this.COLLECTION).doc(userId).get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data) {
                        const profile = data;
                        this.memoryCache.set(userId, profile);
                        return profile;
                    }
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to fetch engagement profile');
            }
        }
        // Create default profile
        const profile = this.createDefaultProfile(userId);
        await this.saveProfile(profile);
        return profile;
    }
    /**
     * Save engagement profile
     */
    async saveProfile(profile) {
        profile.updatedAt = new Date().toISOString();
        this.memoryCache.set(profile.userId, profile);
        if (this.db) {
            try {
                await this.db
                    .collection(this.COLLECTION)
                    .doc(profile.userId)
                    .set(cleanForFirestore(profile), { merge: true });
            }
            catch (error) {
                getLogger().warn({ error, userId: profile.userId }, 'Failed to save engagement profile');
            }
        }
    }
    /**
     * Get ritual streak
     */
    async getRitualStreak(userId, ritualId) {
        if (this.db) {
            try {
                const doc = await this.db
                    .collection(this.COLLECTION)
                    .doc(userId)
                    .collection('ritual_streaks')
                    .doc(ritualId)
                    .get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data) {
                        return data;
                    }
                }
            }
            catch (error) {
                getLogger().warn({ error, userId, ritualId }, 'Failed to fetch ritual streak');
            }
        }
        return null;
    }
    /**
     * Save ritual streak
     */
    async saveRitualStreak(userId, streak) {
        if (this.db) {
            try {
                await this.db
                    .collection(this.COLLECTION)
                    .doc(userId)
                    .collection('ritual_streaks')
                    .doc(streak.ritualId)
                    .set(cleanForFirestore(streak), { merge: true });
            }
            catch (error) {
                getLogger().warn({ error, userId, ritualId: streak.ritualId }, 'Failed to save ritual streak');
            }
        }
    }
    /**
     * Record emotional weather
     */
    async recordWeather(userId, entry) {
        if (this.db) {
            try {
                const docId = entry.date.split('T')[0]; // Use date as ID for easy lookup
                await this.db
                    .collection(this.COLLECTION)
                    .doc(userId)
                    .collection('weather_history')
                    .doc(docId)
                    .set(cleanForFirestore(entry), { merge: true });
                // Update profile stats
                const profile = await this.getProfile(userId);
                profile.stats.totalSkyChecks++;
                await this.saveProfile(profile);
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to record weather');
            }
        }
    }
    /**
     * Get weather history
     */
    async getWeatherHistory(userId, days = 30) {
        if (!this.db)
            return [];
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffStr = cutoff.toISOString().split('T')[0];
            const snapshot = await this.db
                .collection(this.COLLECTION)
                .doc(userId)
                .collection('weather_history')
                .where('date', '>=', cutoffStr)
                .orderBy('date', 'desc')
                .limit(days)
                .get();
            return snapshot.docs
                .map((doc) => doc.data())
                .filter((data) => data !== undefined)
                .map((data) => data);
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to get weather history');
            return [];
        }
    }
    /**
     * Save prediction
     */
    async savePrediction(userId, prediction) {
        if (this.db) {
            try {
                await this.db
                    .collection(this.COLLECTION)
                    .doc(userId)
                    .collection('predictions')
                    .doc(prediction.id)
                    .set(cleanForFirestore(prediction), { merge: true });
                if (!prediction.completedAt) {
                    const profile = await this.getProfile(userId);
                    profile.stats.totalPredictions++;
                    await this.saveProfile(profile);
                }
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to save prediction');
            }
        }
    }
    /**
     * Get recent predictions
     */
    async getRecentPredictions(userId, limit = 10) {
        if (!this.db)
            return [];
        try {
            const snapshot = await this.db
                .collection(this.COLLECTION)
                .doc(userId)
                .collection('predictions')
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            return snapshot.docs
                .map((doc) => doc.data())
                .filter((data) => data !== undefined)
                .map((data) => data);
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to get predictions');
            return [];
        }
    }
    /**
     * Record team huddle
     */
    async recordTeamHuddle(userId, huddle) {
        if (this.db) {
            try {
                await this.db
                    .collection(this.COLLECTION)
                    .doc(userId)
                    .collection('team_huddles')
                    .doc(huddle.id)
                    .set(cleanForFirestore(huddle));
                const profile = await this.getProfile(userId);
                profile.stats.teamHuddlesAttended++;
                await this.saveProfile(profile);
            }
            catch (error) {
                getLogger().warn({ error, userId }, 'Failed to record team huddle');
            }
        }
    }
    /**
     * Get all ritual streaks for a user
     */
    async getAllStreaks(userId) {
        if (!this.db)
            return [];
        try {
            const snapshot = await this.db
                .collection(this.COLLECTION)
                .doc(userId)
                .collection('ritual_streaks')
                .get();
            return snapshot.docs
                .map((doc) => doc.data())
                .filter((data) => data !== undefined)
                .map((data) => data);
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to get all streaks');
            return [];
        }
    }
    /**
     * Update prediction with actuals
     */
    async updatePredictionActuals(userId, predictionId, actuals) {
        if (!this.db)
            return null;
        try {
            const doc = await this.db
                .collection(this.COLLECTION)
                .doc(userId)
                .collection('predictions')
                .doc(predictionId)
                .get();
            if (!doc.exists)
                return null;
            const data = doc.data();
            if (!data)
                return null;
            const prediction = data;
            // Calculate accuracy
            let totalDiff = 0;
            let count = 0;
            for (const [key, actual] of Object.entries(actuals)) {
                if (prediction.predictions[key] !== undefined) {
                    const predicted = prediction.predictions[key];
                    totalDiff += Math.abs(predicted - actual) / Math.max(predicted, actual, 1);
                    count++;
                }
            }
            const accuracy = count > 0 ? Math.round((1 - totalDiff / count) * 100) : 0;
            // Update prediction
            await this.db
                .collection(this.COLLECTION)
                .doc(userId)
                .collection('predictions')
                .doc(predictionId)
                .set(cleanForFirestore({
                actuals,
                accuracy,
                completedAt: new Date().toISOString(),
            }), { merge: true });
            // Update profile accuracy
            const profile = await this.getProfile(userId);
            const predictions = await this.getRecentPredictions(userId, 20);
            const completedPredictions = predictions.filter((p) => p.accuracy !== undefined);
            if (completedPredictions.length > 0) {
                profile.stats.predictionAccuracy = Math.round(completedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) /
                    completedPredictions.length);
                await this.saveProfile(profile);
            }
            return { accuracy };
        }
        catch (error) {
            getLogger().warn({ error, userId, predictionId }, 'Failed to update prediction actuals');
            return null;
        }
    }
    /**
     * Create default profile
     */
    createDefaultProfile(userId) {
        const now = new Date().toISOString();
        return {
            userId,
            activeRituals: [],
            totalRitualDays: 0,
            longestOverallStreak: 0,
            lastEngagementAt: now,
            preferences: {
                preferredTime: 'morning',
                reminderEnabled: false,
            },
            stats: {
                totalSkyChecks: 0,
                totalPredictions: 0,
                predictionAccuracy: 0,
                teamHuddlesAttended: 0,
                memoryCallbacksTriggered: 0,
            },
            createdAt: now,
            updatedAt: now,
        };
    }
    /**
     * Convert to UserRitualProfile format for backward compatibility
     */
    async toRitualProfile(userId) {
        const profile = await this.getProfile(userId);
        const streaks = await this.getAllStreaks(userId);
        const weather = await this.getWeatherHistory(userId, 90);
        const streaksMap = {};
        for (const streak of streaks) {
            streaksMap[streak.ritualId] = {
                ritualId: streak.ritualId,
                userId,
                currentStreak: streak.currentStreak,
                longestStreak: streak.longestStreak,
                lastCompletedAt: new Date(streak.lastCompletedAt),
                totalCompletions: streak.totalCompletions,
                streakHistory: streak.streakHistory.map((h) => ({
                    startDate: new Date(h.startDate),
                    endDate: new Date(h.endDate),
                    length: h.length,
                })),
            };
        }
        return {
            userId,
            activeRituals: profile.activeRituals,
            streaks: streaksMap,
            emotionalWeatherHistory: weather.map((w) => ({
                date: new Date(w.date),
                weather: w.weather,
            })),
            weeklyInsights: [],
            lastRitualDate: new Date(profile.lastEngagementAt),
            totalRitualDays: profile.totalRitualDays,
            preferences: profile.preferences,
        };
    }
    // ============================================================================
    // CONVERSATION SESSION METHODS (for conversation-history.ts)
    // ============================================================================
    async addConversationSession(userId, session) {
        if (!this.db)
            return;
        try {
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            const sessionsRef = docRef.collection('conversation_sessions');
            await sessionsRef.add(removeUndefined({
                ...session,
                createdAt: new Date().toISOString(),
            }));
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to add conversation session');
        }
    }
    async getConversationSessions(userId, limit = 50) {
        if (!this.db)
            return [];
        try {
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            const sessionsRef = docRef.collection('conversation_sessions');
            const snapshot = await sessionsRef.orderBy('createdAt', 'desc').limit(limit).get();
            return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to get conversation sessions');
            return [];
        }
    }
    async getConversationSession(userId, sessionId) {
        if (!this.db)
            return null;
        try {
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            const sessionDoc = await docRef.collection('conversation_sessions').doc(sessionId).get();
            if (!sessionDoc.exists)
                return null;
            return { id: sessionDoc.id, ...sessionDoc.data() };
        }
        catch (error) {
            getLogger().warn({ error, userId, sessionId }, 'Failed to get conversation session');
            return null;
        }
    }
    async addInsightToLatestSession(userId, insight) {
        if (!this.db)
            return;
        try {
            const sessions = await this.getConversationSessions(userId, 1);
            if (sessions.length === 0)
                return;
            const latestSession = sessions[0];
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            const sessionRef = docRef.collection('conversation_sessions').doc(latestSession.id);
            const existingInsights = latestSession.insights || [];
            await sessionRef.update(cleanForFirestore({ insights: [...existingInsights, insight] }));
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to add insight to session');
        }
    }
    async addHighlightToLatestSession(userId, highlight) {
        if (!this.db)
            return;
        try {
            const sessions = await this.getConversationSessions(userId, 1);
            if (sessions.length === 0)
                return;
            const latestSession = sessions[0];
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            const sessionRef = docRef.collection('conversation_sessions').doc(latestSession.id);
            const existingHighlights = latestSession.highlights || [];
            await sessionRef.update(cleanForFirestore({ highlights: [...existingHighlights, highlight] }));
        }
        catch (error) {
            getLogger().warn({ error, userId }, 'Failed to add highlight to session');
        }
    }
    async updateSessionMood(userId, sessionId, mood, energy) {
        if (!this.db)
            return;
        try {
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            const sessionRef = docRef.collection('conversation_sessions').doc(sessionId);
            const update = { mood };
            if (energy)
                update.energy = energy;
            await sessionRef.update(cleanForFirestore(update));
        }
        catch (error) {
            getLogger().warn({ error, userId, sessionId }, 'Failed to update session mood');
        }
    }
    // Alias for getRecentPredictions for data-export.ts compatibility
    async getPredictions(userId, limit = 100) {
        return this.getRecentPredictions(userId, limit);
    }
    // Alias for getAllStreaks for data-export.ts compatibility
    async getRitualStreaks(userId) {
        return this.getAllStreaks(userId);
    }
    /** Firestore batch write limit */
    FIRESTORE_BATCH_LIMIT = 500;
    async deleteUserData(userId) {
        if (!this.db) {
            // Clear from memory cache
            this.memoryCache.delete(userId);
            return;
        }
        try {
            const docRef = this.db.collection(this.COLLECTION).doc(userId);
            // Delete subcollections
            const subcollections = [
                'conversation_sessions',
                'ritual_streaks',
                'weather_entries',
                'predictions',
                'team_huddles',
            ];
            for (const subcol of subcollections) {
                const snapshot = await docRef.collection(subcol).get();
                // Process in batches to respect Firestore's 500-operation limit
                const { docs } = snapshot;
                for (let i = 0; i < docs.length; i += this.FIRESTORE_BATCH_LIMIT) {
                    const chunk = docs.slice(i, i + this.FIRESTORE_BATCH_LIMIT);
                    const batch = this.db.batch();
                    chunk.forEach((doc) => batch.delete(doc.ref));
                    await batch.commit();
                }
            }
            // Delete main document
            await docRef.delete();
            // Clear from cache
            this.memoryCache.delete(userId);
            getLogger().info({ userId }, 'User data deleted successfully');
        }
        catch (error) {
            getLogger().error({ error, userId }, 'Failed to delete user data');
            throw error;
        }
    }
    /**
     * Get user IDs that have been active in the last N days
     */
    async getActiveUserIds(daysActive = 30) {
        if (!this.db) {
            getLogger().warn('Firestore not initialized');
            return [];
        }
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - daysActive);
            const cutoffTimestamp = cutoff.toISOString();
            // Query Firestore for users active since cutoff
            const snapshot = await this.db
                .collection('engagement_profiles')
                .where('lastEngagementAt', '>=', cutoffTimestamp)
                .get();
            const userIds = snapshot.docs.map((doc) => doc.id);
            getLogger().debug({ userCount: userIds.length, daysActive }, 'Got active user IDs');
            return userIds;
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to get active user IDs');
            return [];
        }
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let engagementStore = null;
export async function getEngagementStore() {
    if (!engagementStore) {
        engagementStore = new EngagementStore();
        await engagementStore.initialize();
    }
    return engagementStore;
}
export function resetEngagementStore() {
    engagementStore = null;
}
export default EngagementStore;
//# sourceMappingURL=engagement-store.js.map