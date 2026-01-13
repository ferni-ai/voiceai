/**
 * Collective Learning Store
 *
 * Persists community insights and agent evolution data to Firestore.
 * Automatically loads on startup and saves on shutdown.
 *
 * Collections:
 * - community_insights: Cross-user learning patterns
 * - agent_evolution: Persona-specific learnings and adjustments
 * - learning_signals: Raw signals for batch processing
 */
import { getLogger } from '../../utils/safe-logger.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getCommunityInsights, getAgentEvolution, } from '../../intelligence/index.js';
// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================
export class CollectiveLearningStore {
    db = null;
    initialized = false;
    // Collection names
    COMMUNITY_INSIGHTS = 'community_insights';
    AGENT_EVOLUTION = 'agent_evolution';
    LEARNING_SIGNALS = 'learning_signals';
    async initialize() {
        if (this.initialized)
            return;
        try {
            const { Firestore } = await import('@google-cloud/firestore');
            this.db = new Firestore({
                projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                databaseId: process.env.FIRESTORE_DATABASE || '(default)',
            });
            this.initialized = true;
            getLogger().info('📚 Collective learning store initialized');
            // Load existing data in BACKGROUND - don't block startup!
            // This is optional enhancement data, not critical for operation
            this.loadAllData().catch((error) => {
                getLogger().debug({ error }, 'Background collective learning load failed (non-blocking)');
            });
        }
        catch (error) {
            getLogger().warn({ error }, 'Collective learning store initialization skipped (no Firestore)');
            // Not a fatal error - we can operate without persistence
        }
    }
    // ==========================================================================
    // LOAD ON STARTUP
    // ==========================================================================
    /**
     * Load all community insights and evolution data on startup
     * Runs with timeout to prevent blocking startup
     */
    async loadAllData() {
        if (!this.db)
            return;
        // Timeout for all Firestore operations - don't let them block forever
        const LOAD_TIMEOUT_MS = 3000;
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS);
        });
        try {
            // Load in parallel with timeout
            const result = await Promise.race([
                Promise.all([this.loadCommunityInsights(), this.loadAgentEvolution()]),
                timeoutPromise,
            ]);
            if (result === 'timeout') {
                getLogger().warn('Collective learning load timed out after 3s (continuing without data)');
                return;
            }
            getLogger().info('📖 Collective learning data loaded from Firestore');
        }
        catch (error) {
            getLogger().warn({ error }, 'Failed to load collective learning data');
        }
    }
    async loadCommunityInsights() {
        if (!this.db)
            return;
        const insights = getCommunityInsights();
        try {
            // Load all documents in PARALLEL (not sequential!)
            const [patternsSnap, questionsSnap, storiesSnap, journeysSnap] = await Promise.all([
                this.db.collection(this.COMMUNITY_INSIGHTS).doc('patterns').get(),
                this.db.collection(this.COMMUNITY_INSIGHTS).doc('questions').get(),
                this.db.collection(this.COMMUNITY_INSIGHTS).doc('stories').get(),
                this.db.collection(this.COMMUNITY_INSIGHTS).doc('journeys').get(),
            ]);
            const data = {};
            if (patternsSnap.exists) {
                const patternData = patternsSnap.data();
                if (patternData?.patterns) {
                    data.patterns = this.hydrateArray(patternData.patterns);
                }
            }
            if (questionsSnap.exists) {
                const questionData = questionsSnap.data();
                if (questionData?.questions) {
                    data.effectiveQuestions = this.hydrateArray(questionData.questions);
                }
            }
            if (storiesSnap.exists) {
                const storyData = storiesSnap.data();
                if (storyData?.stories) {
                    data.storyResonance = this.hydrateArray(storyData.stories);
                }
            }
            if (journeysSnap.exists) {
                const journeyData = journeysSnap.data();
                if (journeyData?.journeys) {
                    data.journeyPatterns = this.hydrateArray(journeyData.journeys);
                }
            }
            insights.importInsights(data);
            getLogger().debug({
                patterns: data.patterns?.length || 0,
                questions: data.effectiveQuestions?.length || 0,
                stories: data.storyResonance?.length || 0,
            }, 'Community insights loaded');
        }
        catch (error) {
            getLogger().warn({ error }, 'Failed to load community insights');
        }
    }
    async loadAgentEvolution() {
        if (!this.db)
            return;
        const evolution = getAgentEvolution();
        try {
            const snap = await this.db.collection(this.AGENT_EVOLUTION).get();
            if (!snap.empty) {
                const states = {};
                for (const doc of snap.docs) {
                    const data = doc.data();
                    if (data) {
                        states[doc.id] = this.hydrateObject(data);
                    }
                }
                evolution.importState(states);
                getLogger().debug({ personaCount: Object.keys(states).length }, 'Agent evolution loaded');
            }
        }
        catch (error) {
            getLogger().warn({ error }, 'Failed to load agent evolution');
        }
    }
    // ==========================================================================
    // SAVE ON SHUTDOWN
    // ==========================================================================
    /**
     * Save all community insights and evolution data on shutdown
     */
    async saveAllData() {
        if (!this.db)
            return;
        try {
            // Save community insights
            await this.saveCommunityInsights();
            // Save agent evolution states
            await this.saveAgentEvolution();
            getLogger().info('💾 Collective learning data saved to Firestore');
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to save collective learning data');
        }
    }
    async saveCommunityInsights() {
        if (!this.db)
            return;
        const insights = getCommunityInsights();
        const exported = insights.exportInsights();
        try {
            // Save patterns
            if (exported.patterns.length > 0) {
                await this.db
                    .collection(this.COMMUNITY_INSIGHTS)
                    .doc('patterns')
                    .set(cleanForFirestore({ patterns: exported.patterns, updatedAt: new Date().toISOString() }), { merge: true });
            }
            // Save questions
            if (exported.effectiveQuestions.length > 0) {
                await this.db
                    .collection(this.COMMUNITY_INSIGHTS)
                    .doc('questions')
                    .set(cleanForFirestore({
                    questions: exported.effectiveQuestions,
                    updatedAt: new Date().toISOString(),
                }), { merge: true });
            }
            // Save stories
            if (exported.storyResonance.length > 0) {
                await this.db
                    .collection(this.COMMUNITY_INSIGHTS)
                    .doc('stories')
                    .set(cleanForFirestore({
                    stories: exported.storyResonance,
                    updatedAt: new Date().toISOString(),
                }), { merge: true });
            }
            // Save journeys
            if (exported.journeyPatterns.length > 0) {
                await this.db
                    .collection(this.COMMUNITY_INSIGHTS)
                    .doc('journeys')
                    .set(cleanForFirestore({
                    journeys: exported.journeyPatterns,
                    updatedAt: new Date().toISOString(),
                }), { merge: true });
            }
            getLogger().debug({
                patterns: exported.patterns.length,
                questions: exported.effectiveQuestions.length,
                stories: exported.storyResonance.length,
            }, 'Community insights saved');
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to save community insights');
        }
    }
    async saveAgentEvolution() {
        if (!this.db)
            return;
        const evolution = getAgentEvolution();
        const states = evolution.exportState();
        try {
            for (const [personaId, state] of states.entries()) {
                await this.db
                    .collection(this.AGENT_EVOLUTION)
                    .doc(personaId)
                    .set(removeUndefined({ ...state, updatedAt: new Date().toISOString() }), { merge: true });
            }
            getLogger().debug({ personaCount: states.size }, 'Agent evolution saved');
        }
        catch (error) {
            getLogger().error({ error }, 'Failed to save agent evolution');
        }
    }
    // ==========================================================================
    // INCREMENTAL UPDATES (Called during conversations)
    // ==========================================================================
    /**
     * Save a batch of learning signals for later processing
     * Called at the end of each session
     */
    async saveLearningSignals(sessionId, personaId, signals) {
        if (!this.db || signals.length === 0)
            return;
        try {
            const docId = `${sessionId}_${Date.now()}`;
            await this.db
                .collection(this.LEARNING_SIGNALS)
                .doc(docId)
                .set(removeUndefined({
                sessionId,
                personaId,
                signals,
                createdAt: new Date().toISOString(),
                processed: false,
            }));
            getLogger().debug({ sessionId, signalCount: signals.length }, 'Learning signals saved');
        }
        catch (error) {
            getLogger().warn({ error }, 'Failed to save learning signals');
        }
    }
    /**
     * Increment a counter atomically (for high-frequency signals)
     */
    async incrementCounter(collection, docId, field, amount = 1) {
        if (!this.db)
            return;
        try {
            const docRef = this.db.collection(collection).doc(docId);
            await this.db.runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                const current = doc.exists ? doc.data()?.[field] || 0 : 0;
                transaction.set(docRef, { [field]: current + amount, updatedAt: new Date().toISOString() }, { merge: true });
            });
        }
        catch (error) {
            getLogger().debug({ error }, 'Failed to increment counter');
        }
    }
    // ==========================================================================
    // EVOLUTION CYCLE (Run periodically)
    // ==========================================================================
    /**
     * Run evolution cycle for all personas
     * This should be called by a scheduled Cloud Function
     */
    async runEvolutionCycle() {
        const insights = getCommunityInsights();
        const evolution = getAgentEvolution();
        // Recompute patterns from signals
        insights.recomputePatterns();
        // Get all persona IDs that have data
        const states = evolution.exportState();
        const personaIds = Array.from(states.keys());
        // Add standard personas if not present
        const standardPersonas = [
            'ferni',
            'nayan-patel',
            'peter-john',
            'maya-santos',
            'jordan-taylor',
            'alex-chen',
        ];
        for (const id of standardPersonas) {
            if (!personaIds.includes(id)) {
                personaIds.push(id);
            }
        }
        let adjustmentsCreated = 0;
        // Run evolution for each persona
        for (const personaId of personaIds) {
            await evolution.runEvolutionCycle(personaId);
            const state = states.get(personaId);
            if (state) {
                adjustmentsCreated += state.adjustments.filter((a) => a.enabled).length;
            }
        }
        // Save updated data
        await this.saveAllData();
        const stats = insights.getStats();
        getLogger().info({
            personasProcessed: personaIds.length,
            patternsComputed: stats.totalPatterns,
            adjustmentsCreated,
        }, '🧬 Evolution cycle complete');
        return {
            personasProcessed: personaIds.length,
            patternsComputed: stats.totalPatterns,
            adjustmentsCreated,
        };
    }
    // ==========================================================================
    // HELPERS
    // ==========================================================================
    hydrateArray(arr) {
        return arr.map((item) => this.hydrateObject(item));
    }
    hydrateObject(obj) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === 'object' && '_seconds' in value) {
                // Firestore Timestamp
                result[key] = new Date(value._seconds * 1000);
            }
            else if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
                // ISO date string
                result[key] = new Date(value);
            }
            else if (Array.isArray(value)) {
                result[key] = this.hydrateArray(value);
            }
            else if (value && typeof value === 'object') {
                result[key] = this.hydrateObject(value);
            }
            else {
                result[key] = value;
            }
        }
        return result;
    }
    // ==========================================================================
    // LIFECYCLE
    // ==========================================================================
    async shutdown() {
        if (this.initialized) {
            await this.saveAllData();
            this.initialized = false;
            getLogger().info('Collective learning store shut down');
        }
    }
    isInitialized() {
        return this.initialized;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let store = null;
export function getCollectiveLearningStore() {
    if (!store) {
        store = new CollectiveLearningStore();
    }
    return store;
}
export async function initializeCollectiveLearning() {
    const s = getCollectiveLearningStore();
    await s.initialize();
    return s;
}
export async function shutdownCollectiveLearning() {
    if (store) {
        await store.shutdown();
        store = null;
    }
}
export default CollectiveLearningStore;
//# sourceMappingURL=collective-learning-store.js.map