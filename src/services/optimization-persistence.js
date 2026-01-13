/**
 * Optimization System Persistence Service
 *
 * Handles Firestore persistence for the tool optimization system:
 * - User feedback records
 * - Interaction patterns (co-occurrences, sequences, journeys)
 * - AI-generated recommendations
 * - A/B experiment results
 *
 * Data is buffered in memory and flushed periodically to reduce writes.
 */
import { getGCPProjectId } from '../config/environment.js';
import { removeUndefined, cleanForFirestore } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';
const log = getLogger();
/** Interval name for optimization persistence flush */
const OPTIMIZATION_PERSISTENCE_INTERVAL = 'optimization-persistence-flush';
// ============================================================================
// PERSISTENCE SERVICE
// ============================================================================
class OptimizationPersistenceService {
    db = null;
    initialized = false;
    flushInterval = null;
    // Collection names
    COLLECTIONS = {
        FEEDBACK: 'optimization_feedback',
        FEEDBACK_SUMMARY: 'optimization_feedback_summary',
        PATTERNS: 'optimization_patterns',
        SESSIONS: 'optimization_sessions',
        RECOMMENDATIONS: 'optimization_recommendations',
        EXPERIMENTS: 'optimization_experiments',
        JOURNEYS: 'optimization_journeys',
        GAPS: 'optimization_gaps',
    };
    // Buffers
    feedbackBuffer = [];
    sessionBuffer = [];
    recommendationBuffer = [];
    BUFFER_SIZE = 100;
    FLUSH_INTERVAL_MS = 60000; // 1 minute
    FIRESTORE_BATCH_LIMIT = 500; // Firestore batch write limit
    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    async initialize(db) {
        if (this.initialized)
            return;
        if (db) {
            this.db = db;
        }
        else {
            try {
                const { Firestore } = await import('@google-cloud/firestore');
                this.db = new Firestore({
                    projectId: getGCPProjectId(),
                });
            }
            catch (error) {
                getLogger().warn({ error }, 'Firestore not available, optimization data will be in-memory only');
            }
        }
        // Start periodic flush using managed interval
        registerInterval(OPTIMIZATION_PERSISTENCE_INTERVAL, () => {
            this.flushAll().catch((err) => getLogger().warn({ err }, 'Failed to flush optimization buffers'));
        }, this.FLUSH_INTERVAL_MS);
        this.initialized = true;
        getLogger().info('🗄️ Optimization persistence initialized');
    }
    async shutdown() {
        clearNamedInterval(OPTIMIZATION_PERSISTENCE_INTERVAL);
        await this.flushAll();
        getLogger().info('🗄️ Optimization persistence shut down');
    }
    // ==========================================================================
    // FEEDBACK PERSISTENCE
    // ==========================================================================
    /**
     * Buffer feedback for batch writing
     */
    bufferFeedback(feedback) {
        this.feedbackBuffer.push(feedback);
        if (this.feedbackBuffer.length >= this.BUFFER_SIZE) {
            this.flushFeedback().catch((err) => getLogger().warn({ err }, 'Failed to flush feedback'));
        }
    }
    /**
     * Flush feedback buffer to Firestore
     */
    async flushFeedback() {
        if (this.feedbackBuffer.length === 0 || !this.db)
            return;
        const toFlush = this.feedbackBuffer.splice(0, this.feedbackBuffer.length);
        const collection = this.db.collection(this.COLLECTIONS.FEEDBACK);
        try {
            // Process in chunks to respect Firestore's 500-operation limit
            for (let i = 0; i < toFlush.length; i += this.FIRESTORE_BATCH_LIMIT) {
                const chunk = toFlush.slice(i, i + this.FIRESTORE_BATCH_LIMIT);
                const batch = this.db.batch();
                for (const feedback of chunk) {
                    const docRef = collection.doc();
                    // Use removeUndefined to filter out undefined fields (Firestore doesn't accept them)
                    batch.set(docRef, removeUndefined({
                        ...feedback,
                        timestamp: feedback.timestamp.toISOString(),
                        createdAt: new Date().toISOString(),
                    }));
                }
                await batch.commit();
            }
            getLogger().debug({ count: toFlush.length }, '📝 Flushed feedback to Firestore');
        }
        catch (error) {
            // Re-add to buffer on failure
            this.feedbackBuffer.unshift(...toFlush);
            getLogger().error({ error }, 'Failed to flush feedback');
        }
    }
    /**
     * Save aggregated feedback summary
     */
    async saveFeedbackSummary(toolId, summary) {
        if (!this.db)
            return;
        try {
            await this.db
                .collection(this.COLLECTIONS.FEEDBACK_SUMMARY)
                .doc(toolId)
                .set(cleanForFirestore({
                ...summary,
                updatedAt: new Date().toISOString(),
            }), { merge: true });
        }
        catch (error) {
            getLogger().error({ error, toolId }, 'Failed to save feedback summary');
        }
    }
    /**
     * Get feedback summary for a tool
     */
    async getFeedbackSummary(toolId) {
        if (!this.db)
            return null;
        try {
            const doc = await this.db.collection(this.COLLECTIONS.FEEDBACK_SUMMARY).doc(toolId).get();
            const data = doc.data();
            return doc.exists && data ? data : null;
        }
        catch (error) {
            getLogger().error({ error, toolId }, 'Failed to get feedback summary');
            return null;
        }
    }
    /**
     * Get all feedback summaries
     */
    async getAllFeedbackSummaries() {
        if (!this.db)
            return [];
        try {
            const snapshot = await this.db.collection(this.COLLECTIONS.FEEDBACK_SUMMARY).get();
            return snapshot.docs
                .map((doc) => doc.data())
                .filter((data) => data !== undefined);
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to get all feedback summaries');
            return [];
        }
    }
    // ==========================================================================
    // SESSION & PATTERN PERSISTENCE
    // ==========================================================================
    /**
     * Buffer completed session for analysis
     */
    bufferSession(session) {
        this.sessionBuffer.push(session);
        if (this.sessionBuffer.length >= this.BUFFER_SIZE) {
            this.flushSessions().catch((err) => getLogger().warn({ err }, 'Failed to flush sessions'));
        }
    }
    /**
     * Flush sessions to Firestore
     */
    async flushSessions() {
        if (this.sessionBuffer.length === 0 || !this.db)
            return;
        const toFlush = this.sessionBuffer.splice(0, this.sessionBuffer.length);
        const collection = this.db.collection(this.COLLECTIONS.SESSIONS);
        try {
            // Process in chunks to respect Firestore's 500-operation limit
            for (let i = 0; i < toFlush.length; i += this.FIRESTORE_BATCH_LIMIT) {
                const chunk = toFlush.slice(i, i + this.FIRESTORE_BATCH_LIMIT);
                const batch = this.db.batch();
                for (const session of chunk) {
                    const docRef = collection.doc(session.sessionId);
                    batch.set(docRef, removeUndefined({
                        ...session,
                        startTime: session.startTime.toISOString(),
                        endTime: session.endTime?.toISOString(),
                        toolCalls: session.toolCalls.map((tc) => removeUndefined({
                            ...tc,
                            timestamp: tc.timestamp.toISOString(),
                        })),
                        createdAt: new Date().toISOString(),
                    }));
                }
                await batch.commit();
            }
            getLogger().debug({ count: toFlush.length }, '📊 Flushed sessions to Firestore');
        }
        catch (error) {
            this.sessionBuffer.unshift(...toFlush);
            getLogger().error({ error }, 'Failed to flush sessions');
        }
    }
    /**
     * Save pattern analysis results
     */
    async savePatternAnalysis(analysis) {
        if (!this.db)
            return;
        try {
            const docId = `analysis_${Date.now()}`;
            await this.db
                .collection(this.COLLECTIONS.PATTERNS)
                .doc(docId)
                .set(removeUndefined({
                ...analysis,
                analyzedAt: analysis.analyzedAt.toISOString(),
            }));
            getLogger().info('📊 Saved pattern analysis to Firestore');
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to save pattern analysis');
        }
    }
    /**
     * Get latest pattern analysis
     */
    async getLatestPatternAnalysis() {
        if (!this.db)
            return null;
        try {
            const snapshot = await this.db
                .collection(this.COLLECTIONS.PATTERNS)
                .orderBy('analyzedAt', 'desc')
                .limit(1)
                .get();
            if (snapshot.empty)
                return null;
            return snapshot.docs[0].data();
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to get latest pattern analysis');
            return null;
        }
    }
    // ==========================================================================
    // RECOMMENDATIONS PERSISTENCE
    // ==========================================================================
    /**
     * Buffer recommendation
     */
    bufferRecommendation(recommendation) {
        this.recommendationBuffer.push(recommendation);
        if (this.recommendationBuffer.length >= this.BUFFER_SIZE) {
            this.flushRecommendations().catch((err) => getLogger().warn({ err }, 'Failed to flush recommendations'));
        }
    }
    /**
     * Flush recommendations to Firestore
     */
    async flushRecommendations() {
        if (this.recommendationBuffer.length === 0 || !this.db)
            return;
        const toFlush = this.recommendationBuffer.splice(0, this.recommendationBuffer.length);
        const collection = this.db.collection(this.COLLECTIONS.RECOMMENDATIONS);
        try {
            // Process in chunks to respect Firestore's 500-operation limit
            for (let i = 0; i < toFlush.length; i += this.FIRESTORE_BATCH_LIMIT) {
                const chunk = toFlush.slice(i, i + this.FIRESTORE_BATCH_LIMIT);
                const batch = this.db.batch();
                for (const rec of chunk) {
                    const docRef = collection.doc(rec.id);
                    batch.set(docRef, removeUndefined({
                        ...rec,
                        createdAt: rec.createdAt.toISOString(),
                    }));
                }
                await batch.commit();
            }
            getLogger().debug({ count: toFlush.length }, '💡 Flushed recommendations to Firestore');
        }
        catch (error) {
            this.recommendationBuffer.unshift(...toFlush);
            getLogger().error({ error }, 'Failed to flush recommendations');
        }
    }
    /**
     * Save a recommendation
     */
    async saveRecommendation(recommendation) {
        if (!this.db)
            return;
        try {
            await this.db
                .collection(this.COLLECTIONS.RECOMMENDATIONS)
                .doc(recommendation.id)
                .set(removeUndefined({
                ...recommendation,
                createdAt: recommendation.createdAt.toISOString(),
            }));
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to save recommendation');
        }
    }
    /**
     * Get pending recommendations
     */
    async getPendingRecommendations() {
        if (!this.db)
            return [];
        try {
            const snapshot = await this.db
                .collection(this.COLLECTIONS.RECOMMENDATIONS)
                .where('status', '==', 'pending')
                .orderBy('priority', 'desc')
                .limit(50)
                .get();
            return snapshot.docs
                .map((doc) => {
                const data = doc.data();
                if (!data)
                    return null;
                return {
                    ...data,
                    createdAt: new Date(data['createdAt']),
                };
            })
                .filter((rec) => rec !== null);
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to get pending recommendations');
            return [];
        }
    }
    /**
     * Update recommendation status
     */
    async updateRecommendationStatus(id, status, implementedAt) {
        if (!this.db)
            return;
        try {
            await this.db
                .collection(this.COLLECTIONS.RECOMMENDATIONS)
                .doc(id)
                .update(cleanForFirestore({
                status,
                implementedAt: implementedAt?.toISOString(),
                updatedAt: new Date().toISOString(),
            }));
        }
        catch (error) {
            getLogger().error({ error, id, status }, 'Failed to update recommendation status');
        }
    }
    // ==========================================================================
    // EXPERIMENT PERSISTENCE
    // ==========================================================================
    /**
     * Save experiment configuration and results
     */
    async saveExperiment(experiment) {
        if (!this.db)
            return;
        try {
            await this.db
                .collection(this.COLLECTIONS.EXPERIMENTS)
                .doc(experiment.id)
                .set(removeUndefined({
                ...experiment,
                startedAt: experiment.startedAt?.toISOString(),
                completedAt: experiment.completedAt?.toISOString(),
                updatedAt: new Date().toISOString(),
            }));
        }
        catch (error) {
            getLogger().error({ error, experimentId: experiment.id }, 'Failed to save experiment');
        }
    }
    /**
     * Get active experiments
     */
    async getActiveExperiments() {
        if (!this.db)
            return [];
        try {
            const snapshot = await this.db
                .collection(this.COLLECTIONS.EXPERIMENTS)
                .where('status', '==', 'active')
                .get();
            return snapshot.docs.map((doc) => doc.data());
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to get active experiments');
            return [];
        }
    }
    // ==========================================================================
    // AGGREGATION & ANALYTICS
    // ==========================================================================
    /**
     * Get dashboard summary data
     */
    async getDashboardSummary() {
        if (!this.db) {
            return {
                totalFeedback: 0,
                feedbackByType: {},
                totalSessions: 0,
                avgSessionDuration: 0,
                topTools: [],
                activeExperiments: 0,
                pendingRecommendations: 0,
                lastAnalysisTime: null,
            };
        }
        try {
            // Get feedback count
            const feedbackSnapshot = await this.db.collection(this.COLLECTIONS.FEEDBACK).get();
            // Count by type
            const feedbackByType = {};
            feedbackSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                if (data) {
                    const type = data['type'];
                    feedbackByType[type] = (feedbackByType[type] || 0) + 1;
                }
            });
            // Get session count
            const sessionSnapshot = await this.db.collection(this.COLLECTIONS.SESSIONS).get();
            // Get active experiments
            const experimentsSnapshot = await this.db
                .collection(this.COLLECTIONS.EXPERIMENTS)
                .where('status', '==', 'active')
                .get();
            // Get pending recommendations
            const recsSnapshot = await this.db
                .collection(this.COLLECTIONS.RECOMMENDATIONS)
                .where('status', '==', 'pending')
                .get();
            // Get latest analysis time
            const latestAnalysis = await this.getLatestPatternAnalysis();
            // Calculate average session duration from sessions
            let totalDuration = 0;
            let durationCount = 0;
            const toolUsageCount = new Map();
            for (const doc of sessionSnapshot.docs) {
                const data = doc.data();
                if (data && data.durationMs && typeof data.durationMs === 'number') {
                    totalDuration += data.durationMs;
                    durationCount++;
                }
                // Aggregate tool usage
                if (data && data.toolsUsed && Array.isArray(data.toolsUsed)) {
                    for (const tool of data.toolsUsed) {
                        const toolName = typeof tool === 'string' ? tool : tool.name;
                        if (toolName) {
                            toolUsageCount.set(toolName, (toolUsageCount.get(toolName) || 0) + 1);
                        }
                    }
                }
            }
            const avgSessionDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
            // Get top 10 most used tools
            const topTools = Array.from(toolUsageCount.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([toolId, count]) => ({ toolId, count }));
            return {
                totalFeedback: feedbackSnapshot.size,
                feedbackByType,
                totalSessions: sessionSnapshot.size,
                avgSessionDuration,
                topTools,
                activeExperiments: experimentsSnapshot.size,
                pendingRecommendations: recsSnapshot.size,
                lastAnalysisTime: latestAnalysis?.analyzedAt || null,
            };
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to get dashboard summary');
            return {
                totalFeedback: 0,
                feedbackByType: {},
                totalSessions: 0,
                avgSessionDuration: 0,
                topTools: [],
                activeExperiments: 0,
                pendingRecommendations: 0,
                lastAnalysisTime: null,
            };
        }
    }
    // ==========================================================================
    // FLUSH ALL
    // ==========================================================================
    /**
     * Flush all buffers
     */
    async flushAll() {
        await Promise.all([this.flushFeedback(), this.flushSessions(), this.flushRecommendations()]);
    }
    /**
     * Check if persistence is available
     */
    isAvailable() {
        return this.db !== null;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
export const optimizationPersistence = new OptimizationPersistenceService();
export default optimizationPersistence;
//# sourceMappingURL=optimization-persistence.js.map