/**
 * Community Insights Engine
 *
 * Aggregates anonymized learning signals across ALL users to discover:
 * - What response strategies work best in different contexts
 * - Common user journeys and progression patterns
 * - Questions that lead to breakthroughs
 * - Stories and phrases that resonate
 *
 * This creates COLLECTIVE INTELLIGENCE that makes every persona smarter
 * based on learnings from the entire community.
 *
 * PRIVACY: All data is anonymized before aggregation. No PII stored.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
// ============================================================================
// COMMUNITY INSIGHTS ENGINE
// ============================================================================
export class CommunityInsightsEngine {
    responseSignals = [];
    patterns = new Map();
    journeyPatterns = new Map();
    effectiveQuestions = [];
    storyResonance = new Map();
    phraseEffectiveness = [];
    // Minimum samples before pattern is considered reliable
    MIN_SAMPLES = 10;
    HIGH_CONFIDENCE_SAMPLES = 50;
    constructor() {
        // Will be loaded from persistent storage
    }
    // ==========================================================================
    // SIGNAL COLLECTION (Called during conversations)
    // ==========================================================================
    /**
     * Record a response strategy signal from a conversation
     * This is called after each agent response to capture what worked
     */
    recordResponseSignal(signal) {
        // Anonymize before storing
        const anonymized = this.anonymizeSignal(signal);
        this.responseSignals.push(anonymized);
        // Trigger pattern recomputation if we have enough new signals
        if (this.responseSignals.length % 100 === 0) {
            this.recomputePatterns();
        }
        getLogger().debug({
            context: signal.context.topic,
            strategy: signal.strategy.type,
            engagement: signal.outcome.engagementScore,
        }, 'Community signal recorded');
    }
    /**
     * Record a story being told and user reaction
     */
    recordStoryUsage(storyId, personaId, context, reaction, engagementScore) {
        const existing = this.storyResonance.get(storyId);
        if (existing) {
            // Update existing
            existing.userReactions[reaction]++;
            existing.overallEffectiveness =
                (existing.overallEffectiveness * existing.sampleSize + engagementScore) /
                    (existing.sampleSize + 1);
            existing.sampleSize++;
            existing.lastUpdated = new Date();
            // Update by-segment effectiveness
            this.updateSegmentEffectiveness(existing, context, engagementScore);
        }
        else {
            // Create new
            const resonance = {
                storyId,
                personaId,
                overallEffectiveness: engagementScore,
                byRelationshipStage: { [context.relationshipStage]: engagementScore },
                byTopic: { [context.topic]: engagementScore },
                byUserEmotion: { [context.userEmotion]: engagementScore },
                userReactions: {
                    moved: reaction === 'moved' ? 1 : 0,
                    inspired: reaction === 'inspired' ? 1 : 0,
                    connected: reaction === 'connected' ? 1 : 0,
                    curious: reaction === 'curious' ? 1 : 0,
                    indifferent: reaction === 'indifferent' ? 1 : 0,
                },
                bestContexts: [context.topic],
                sampleSize: 1,
                lastUpdated: new Date(),
            };
            this.storyResonance.set(storyId, resonance);
        }
    }
    /**
     * Record a simple engagement signal from response quality tracking
     * This is a simplified interface for the session manager
     */
    recordEngagementSignal(params) {
        const { personaId, responseType, topic, engagementScore, timestamp } = params;
        // Convert to full signal format
        const signal = {
            context: {
                userEmotion: 'neutral',
                topic,
                relationshipStage: 'building',
                personaId,
                timeOfDay: this.getTimeOfDay(timestamp),
                turnInConversation: 0,
            },
            strategy: {
                type: responseType ||
                    'advice',
                hadPersonalShare: responseType === 'story',
                hadQuirk: false,
                hadTeamReference: false,
                responseLength: 'moderate',
            },
            outcome: {
                engagementScore,
                userContinued: engagementScore > 0.5,
                emotionalShift: engagementScore > 0.7 ? 'positive' : engagementScore < 0.3 ? 'negative' : 'neutral',
                topicDepthened: engagementScore > 0.6,
                askFollowUp: engagementScore > 0.7,
            },
            recordedAt: timestamp,
        };
        this.recordResponseSignal(signal);
    }
    getTimeOfDay(date) {
        const hour = date.getHours();
        if (hour < 6)
            return 'night';
        if (hour < 12)
            return 'morning';
        if (hour < 17)
            return 'afternoon';
        if (hour < 21)
            return 'evening';
        return 'night';
    }
    /**
     * Record a question that led to a breakthrough moment
     */
    recordBreakthroughQuestion(questionPattern, personaId, topic, context, engagementLift) {
        const existing = this.effectiveQuestions.find((q) => q.questionPattern === questionPattern && q.personaId === personaId);
        if (existing) {
            existing.avgBreakthroughRate =
                (existing.avgBreakthroughRate * existing.sampleSize + 1) / (existing.sampleSize + 1);
            existing.avgEngagementLift =
                (existing.avgEngagementLift * existing.sampleSize + engagementLift) /
                    (existing.sampleSize + 1);
            if (!existing.bestContexts.includes(context)) {
                existing.bestContexts.push(context);
            }
            existing.sampleSize++;
            existing.lastUpdated = new Date();
        }
        else {
            this.effectiveQuestions.push({
                questionPattern,
                personaId,
                topic,
                avgBreakthroughRate: 1,
                avgEngagementLift: engagementLift,
                bestContexts: [context],
                sampleSize: 1,
                lastUpdated: new Date(),
            });
        }
    }
    // ==========================================================================
    // PATTERN COMPUTATION
    // ==========================================================================
    /**
     * Recompute all community patterns from signals
     * This should be run periodically (e.g., daily batch job)
     */
    recomputePatterns() {
        getLogger().info('Recomputing community patterns...');
        // Group signals by context
        const contextGroups = this.groupSignalsByContext();
        // Compute pattern for each context group
        for (const [contextKey, signals] of contextGroups.entries()) {
            if (signals.length < this.MIN_SAMPLES)
                continue;
            const pattern = this.computePatternFromSignals(contextKey, signals);
            this.patterns.set(pattern.id, pattern);
        }
        getLogger().info({ patternCount: this.patterns.size, signalCount: this.responseSignals.length }, 'Community patterns recomputed');
    }
    groupSignalsByContext() {
        const groups = new Map();
        for (const signal of this.responseSignals) {
            // Create context key (coarse-grained for aggregation)
            const key = `${signal.context.userEmotion}|${signal.context.topic}|${signal.context.relationshipStage}|${signal.context.personaId}`;
            const existing = groups.get(key) || [];
            existing.push(signal);
            groups.set(key, existing);
        }
        return groups;
    }
    computePatternFromSignals(contextKey, signals) {
        const [emotion, topic, stage, persona] = contextKey.split('|');
        // Group by strategy type
        const byStrategy = new Map();
        for (const signal of signals) {
            const existing = byStrategy.get(signal.strategy.type) || [];
            existing.push(signal);
            byStrategy.set(signal.strategy.type, existing);
        }
        // Compute effectiveness for each strategy
        const strategies = [];
        for (const [type, strategySignals] of byStrategy.entries()) {
            const avgEngagement = strategySignals.reduce((sum, s) => sum + s.outcome.engagementScore, 0) /
                strategySignals.length;
            const avgDepthening = strategySignals.filter((s) => s.outcome.topicDepthened).length / strategySignals.length;
            const avgPositiveShift = strategySignals.filter((s) => s.outcome.emotionalShift === 'positive').length /
                strategySignals.length;
            strategies.push({
                type,
                avgEngagement,
                avgDepthening,
                avgPositiveShift,
                sampleSize: strategySignals.length,
                confidenceScore: Math.min(1, strategySignals.length / this.HIGH_CONFIDENCE_SAMPLES),
            });
        }
        // Sort by engagement
        strategies.sort((a, b) => b.avgEngagement - a.avgEngagement);
        // Calculate improvement over baseline (average of all strategies)
        const baseline = strategies.reduce((sum, s) => sum + s.avgEngagement, 0) / strategies.length;
        const best = strategies[0];
        const improvement = best ? (best.avgEngagement - baseline) / baseline : 0;
        return {
            id: `pattern_${contextKey.replace(/\|/g, '_')}`,
            context: {
                userEmotion: emotion || undefined,
                topic: topic || undefined,
                relationshipStage: stage || undefined,
                personaId: persona || undefined,
            },
            strategies,
            bestStrategy: best?.type || 'unknown',
            improvementOverBaseline: improvement,
            lastUpdated: new Date(),
            totalSamples: signals.length,
            minimumSamplesRequired: this.MIN_SAMPLES,
        };
    }
    // ==========================================================================
    // INSIGHT RETRIEVAL (Used by context builders)
    // ==========================================================================
    /**
     * Get the best response strategy for a given context
     */
    getBestStrategy(context) {
        // Try exact match first
        const exactKey = `${context.userEmotion}|${context.topic}|${context.relationshipStage}|${context.personaId}`;
        let pattern = this.patterns.get(`pattern_${exactKey.replace(/\|/g, '_')}`);
        // Fall back to broader matches
        if (!pattern) {
            // Try without persona
            pattern = this.findBestMatchingPattern({
                ...context,
                personaId: undefined,
            });
        }
        if (!pattern || pattern.strategies.length === 0) {
            return null;
        }
        const best = pattern.strategies[0];
        return {
            strategy: best.type,
            confidence: best.confidenceScore,
            expectedEngagement: best.avgEngagement,
            alternatives: pattern.strategies.slice(1, 4).map((s) => s.type),
        };
    }
    /**
     * Get stories that resonate in a given context
     */
    getResonantStories(personaId, context, limit = 3) {
        const results = [];
        for (const [storyId, resonance] of this.storyResonance.entries()) {
            if (resonance.personaId !== personaId)
                continue;
            if (resonance.sampleSize < this.MIN_SAMPLES)
                continue;
            // Calculate contextual score
            let score = resonance.overallEffectiveness;
            let reason = 'general effectiveness';
            // Boost for matching context
            if (resonance.byTopic[context.topic]) {
                score = (score + resonance.byTopic[context.topic]) / 2;
                reason = `works well for ${context.topic}`;
            }
            if (resonance.byRelationshipStage[context.relationshipStage]) {
                score = (score + resonance.byRelationshipStage[context.relationshipStage]) / 2;
                reason = `resonates at ${context.relationshipStage} stage`;
            }
            if (resonance.byUserEmotion[context.userEmotion]) {
                score = (score + resonance.byUserEmotion[context.userEmotion]) / 2;
                reason = `effective when user feels ${context.userEmotion}`;
            }
            results.push({ storyId, score, reason });
        }
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((r) => ({
            storyId: r.storyId,
            expectedEffectiveness: r.score,
            reason: r.reason,
        }));
    }
    /**
     * Get effective questions for a topic
     */
    getEffectiveQuestions(personaId, topic, limit = 3) {
        return this.effectiveQuestions
            .filter((q) => q.personaId === personaId && q.topic === topic)
            .filter((q) => q.sampleSize >= this.MIN_SAMPLES)
            .sort((a, b) => b.avgBreakthroughRate - a.avgBreakthroughRate)
            .slice(0, limit)
            .map((q) => ({
            question: q.questionPattern,
            expectedBreakthroughRate: q.avgBreakthroughRate,
            bestContext: q.bestContexts[0] || 'any',
        }));
    }
    /**
     * Get community journey pattern for a starting state
     */
    getJourneyPattern(startingState) {
        for (const pattern of this.journeyPatterns.values()) {
            if (pattern.startingState === startingState) {
                return pattern;
            }
        }
        return null;
    }
    // ==========================================================================
    // PRIVACY & ANONYMIZATION
    // ==========================================================================
    anonymizeSignal(signal) {
        // Remove any potentially identifying information
        // Keep only behavioral signals
        return {
            ...signal,
            context: {
                ...signal.context,
                // Coarsen time to day granularity
                turnInConversation: Math.floor(signal.context.turnInConversation / 5) * 5,
            },
            // Round timestamp to day
            recordedAt: new Date(signal.recordedAt.toDateString()),
        };
    }
    updateSegmentEffectiveness(resonance, context, score) {
        // Update running averages for each segment
        const updateAvg = (existing, key, newVal) => {
            if (existing[key]) {
                existing[key] = (existing[key] + newVal) / 2;
            }
            else {
                existing[key] = newVal;
            }
        };
        updateAvg(resonance.byTopic, context.topic, score);
        updateAvg(resonance.byRelationshipStage, context.relationshipStage, score);
        updateAvg(resonance.byUserEmotion, context.userEmotion, score);
    }
    findBestMatchingPattern(context) {
        let bestMatch = undefined;
        let bestScore = 0;
        for (const pattern of this.patterns.values()) {
            let score = 0;
            if (context.userEmotion && pattern.context.userEmotion === context.userEmotion)
                score++;
            if (context.topic && pattern.context.topic === context.topic)
                score++;
            if (context.relationshipStage &&
                pattern.context.relationshipStage === context.relationshipStage)
                score++;
            if (context.personaId && pattern.context.personaId === context.personaId)
                score++;
            if (score > bestScore && pattern.totalSamples >= this.MIN_SAMPLES) {
                bestScore = score;
                bestMatch = pattern;
            }
        }
        return bestMatch;
    }
    // ==========================================================================
    // PERSISTENCE
    // ==========================================================================
    /**
     * Export insights for storage
     */
    exportInsights() {
        return {
            patterns: Array.from(this.patterns.values()),
            journeyPatterns: Array.from(this.journeyPatterns.values()),
            effectiveQuestions: this.effectiveQuestions,
            storyResonance: Array.from(this.storyResonance.values()),
        };
    }
    /**
     * Import insights from storage
     */
    importInsights(data) {
        if (data.patterns) {
            for (const p of data.patterns) {
                this.patterns.set(p.id, p);
            }
        }
        if (data.journeyPatterns) {
            for (const j of data.journeyPatterns) {
                this.journeyPatterns.set(j.id, j);
            }
        }
        if (data.effectiveQuestions) {
            this.effectiveQuestions = data.effectiveQuestions;
        }
        if (data.storyResonance) {
            for (const s of data.storyResonance) {
                this.storyResonance.set(s.storyId, s);
            }
        }
        getLogger().info({
            patterns: this.patterns.size,
            journeyPatterns: this.journeyPatterns.size,
            questions: this.effectiveQuestions.length,
            stories: this.storyResonance.size,
        }, 'Community insights imported');
    }
    // ==========================================================================
    // ANALYTICS WORKER INTEGRATION
    // ==========================================================================
    /**
     * Record an emotional pattern for collective learning.
     * Used by analytics-worker to aggregate anonymous emotional patterns.
     */
    recordEmotionalPattern(emotion, intensity, topic, personaId) {
        getLogger().debug({ emotion, intensity, topic, personaId }, 'Emotional pattern recorded for community insights');
        // Could be enhanced to track emotion → topic correlations
    }
    /**
     * Record an insight from conversation analysis.
     * Used by analytics-worker for collective learning.
     */
    recordInsight(insight) {
        getLogger().debug({ insight }, 'Insight recorded for community learning');
    }
    // ==========================================================================
    // STATISTICS
    // ==========================================================================
    getStats() {
        const avgConfidence = this.patterns.size > 0
            ? Array.from(this.patterns.values()).reduce((sum, p) => sum + (p.strategies[0]?.confidenceScore || 0), 0) / this.patterns.size
            : 0;
        return {
            totalSignals: this.responseSignals.length,
            totalPatterns: this.patterns.size,
            totalEffectiveQuestions: this.effectiveQuestions.length,
            totalStoryResonance: this.storyResonance.size,
            avgPatternConfidence: avgConfidence,
        };
    }
}
// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================
// Collection name in Firestore
const FIRESTORE_COLLECTION = 'community_insights';
const FIRESTORE_DOC_ID = 'global';
// Cache to prevent excessive reads
let lastLoadTime = 0;
const LOAD_COOLDOWN_MS = 60000; // 1 minute
/**
 * Load community insights from Firestore
 * Called on startup to hydrate the singleton
 */
export async function loadCommunityInsightsFromFirestore() {
    // Prevent duplicate loads
    if (Date.now() - lastLoadTime < LOAD_COOLDOWN_MS) {
        getLogger().debug('Skipping community insights load (cooldown)');
        return;
    }
    try {
        // Dynamic import to avoid circular dependencies
        const { getGlobalServices } = await import('../../services/global-services.js');
        const global = await getGlobalServices();
        // Check if store has Firestore collection access
        if (!('getFirestore' in global.store)) {
            getLogger().debug('Store does not support Firestore, skipping community insights load');
            return;
        }
        const firestore = global.store.getFirestore();
        const doc = await firestore.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).get();
        if (doc.exists) {
            const data = doc.data();
            const engine = getCommunityInsights();
            engine.importInsights({
                patterns: data.patterns,
                journeyPatterns: data.journeyPatterns,
                effectiveQuestions: data.effectiveQuestions,
                storyResonance: data.storyResonance,
            });
            lastLoadTime = Date.now();
            getLogger().info({
                patterns: data.patterns?.length || 0,
                journeyPatterns: data.journeyPatterns?.length || 0,
                questions: data.effectiveQuestions?.length || 0,
                stories: data.storyResonance?.length || 0,
                lastUpdated: data.updatedAt?.toDate()?.toISOString(),
            }, 'Community insights loaded from Firestore');
        }
        else {
            lastLoadTime = Date.now();
            getLogger().info('No community insights found in Firestore (new deployment)');
        }
    }
    catch (error) {
        getLogger().warn({ error: String(error) }, 'Failed to load community insights from Firestore (non-fatal)');
    }
}
/**
 * Save community insights to Firestore
 * Called periodically and on shutdown
 */
export async function saveCommunityInsightsToFirestore() {
    try {
        const engine = getCommunityInsights();
        const data = engine.exportInsights();
        // Check if we have any data worth saving
        if (data.patterns.length === 0 && data.effectiveQuestions.length === 0) {
            getLogger().debug('No community insights to save');
            return;
        }
        // Dynamic import to avoid circular dependencies
        const { getGlobalServices } = await import('../../services/global-services.js');
        const global = await getGlobalServices();
        // Check if store has Firestore collection access
        if (!('getFirestore' in global.store)) {
            getLogger().debug('Store does not support Firestore, skipping community insights save');
            return;
        }
        const firestore = global.store.getFirestore();
        await firestore
            .collection(FIRESTORE_COLLECTION)
            .doc(FIRESTORE_DOC_ID)
            .set(removeUndefined({
            patterns: data.patterns,
            journeyPatterns: data.journeyPatterns,
            effectiveQuestions: data.effectiveQuestions,
            storyResonance: data.storyResonance,
            updatedAt: new Date(),
            version: 1,
        }));
        getLogger().info({
            patterns: data.patterns.length,
            journeyPatterns: data.journeyPatterns.length,
            questions: data.effectiveQuestions.length,
            stories: data.storyResonance.length,
        }, 'Community insights saved to Firestore');
    }
    catch (error) {
        getLogger().warn({ error: String(error) }, 'Failed to save community insights to Firestore (non-fatal)');
    }
}
/**
 * Initialize community insights with Firestore persistence
 * Should be called during startup
 */
export async function initializeCommunityInsights() {
    await loadCommunityInsightsFromFirestore();
    return getCommunityInsights();
}
// ============================================================================
// SINGLETON
// ============================================================================
let communityInsightsEngine = null;
export function getCommunityInsights() {
    if (!communityInsightsEngine) {
        communityInsightsEngine = new CommunityInsightsEngine();
    }
    return communityInsightsEngine;
}
export function resetCommunityInsights() {
    communityInsightsEngine = null;
}
export default CommunityInsightsEngine;
//# sourceMappingURL=community-insights.js.map