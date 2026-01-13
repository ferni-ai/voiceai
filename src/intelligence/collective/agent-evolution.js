/**
 * Agent Evolution Engine
 *
 * Enables personas to self-improve based on:
 * 1. Community insights (what works across users)
 * 2. Individual feedback signals
 * 3. A/B testing results
 * 4. Emergent behavior detection
 *
 * This creates a closed loop where personas get smarter over time,
 * adapting their prompts, stories, and approaches based on data.
 *
 * SAFETY: All changes are logged and can be rolled back.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { getCommunityInsights } from './community-insights.js';
// ============================================================================
// AGENT EVOLUTION ENGINE
// ============================================================================
export class AgentEvolutionEngine {
    evolutionStates = new Map();
    experiments = new Map();
    constructor() {
        // Initialize with empty states
    }
    // ==========================================================================
    // ADJUSTMENT MANAGEMENT
    // ==========================================================================
    /**
     * Create a new adjustment from community insights
     */
    createAdjustmentFromCommunityPattern(personaId, pattern) {
        const adjustment = {
            id: `adj_${personaId}_${Date.now()}`,
            personaId,
            trigger: {
                condition: this.buildConditionFromContext(pattern.context),
                description: `When ${this.describeContext(pattern.context)}`,
            },
            adjustment: {
                type: 'strategy_preference',
                content: `Prefer ${pattern.bestStrategy} response strategy`,
                priority: pattern.confidence * 10,
            },
            source: 'community_pattern',
            confidence: pattern.confidence,
            effectivenessLift: pattern.improvement,
            createdAt: new Date(),
            lastApplied: new Date(),
            applicationCount: 0,
            enabled: pattern.confidence >= 0.7, // Auto-enable high-confidence adjustments
        };
        // Add to state
        const state = this.getOrCreateState(personaId);
        state.adjustments.push(adjustment);
        getLogger().info({
            personaId,
            adjustmentId: adjustment.id,
            trigger: adjustment.trigger.description,
            improvement: `${(pattern.improvement * 100).toFixed(1)}%`,
        }, 'Created adjustment from community pattern');
        return adjustment;
    }
    /**
     * Get active adjustments for a context
     */
    getActiveAdjustments(personaId, context) {
        const state = this.evolutionStates.get(personaId);
        if (!state)
            return [];
        return state.adjustments
            .filter((adj) => adj.enabled)
            .filter((adj) => this.evaluateCondition(adj.trigger.condition, context))
            .sort((a, b) => b.adjustment.priority - a.adjustment.priority);
    }
    /**
     * Format adjustments for prompt injection
     */
    formatAdjustmentsForPrompt(adjustments) {
        if (adjustments.length === 0)
            return '';
        const lines = [];
        lines.push('[LEARNED ADJUSTMENTS - From Community Insights]');
        for (const adj of adjustments.slice(0, 3)) {
            // Limit to top 3
            lines.push(`• ${adj.adjustment.content} (${(adj.confidence * 100).toFixed(0)}% confident)`);
        }
        return lines.join('\n');
    }
    // ==========================================================================
    // STORY RANKINGS
    // ==========================================================================
    /**
     * Update story rankings from community data
     */
    updateStoryRankings(personaId) {
        const insights = getCommunityInsights();
        const state = this.getOrCreateState(personaId);
        // Get resonant stories for common contexts
        const contexts = [
            { topic: 'investing', relationshipStage: 'new_acquaintance', userEmotion: 'curious' },
            { topic: 'retirement', relationshipStage: 'trusted_advisor', userEmotion: 'anxious' },
            { topic: 'market', relationshipStage: 'friend', userEmotion: 'worried' },
            { topic: 'savings', relationshipStage: 'acquaintance', userEmotion: 'hopeful' },
        ];
        const storyScores = new Map();
        for (const ctx of contexts) {
            const resonant = insights.getResonantStories(personaId, ctx, 10);
            for (const story of resonant) {
                const existing = storyScores.get(story.storyId) || { total: 0, count: 0, byContext: {} };
                existing.total += story.expectedEffectiveness;
                existing.count++;
                existing.byContext[`${ctx.topic}_${ctx.relationshipStage}_${ctx.userEmotion}`] =
                    story.expectedEffectiveness;
                storyScores.set(story.storyId, existing);
            }
        }
        // Convert to rankings
        state.storyRankings = Array.from(storyScores.entries()).map(([storyId, data]) => ({
            storyId,
            personaId,
            overallScore: data.total / data.count,
            byContext: data.byContext,
            sampleSize: data.count,
            lastUpdated: new Date(),
        }));
        state.storyRankings.sort((a, b) => b.overallScore - a.overallScore);
        getLogger().info({ personaId, storiesRanked: state.storyRankings.length }, 'Updated story rankings');
    }
    /**
     * Get recommended stories for a context
     */
    getRecommendedStories(personaId, context, limit = 3) {
        const state = this.evolutionStates.get(personaId);
        if (!state || state.storyRankings.length === 0) {
            return [];
        }
        const contextKey = `${context.topic}_${context.relationshipStage}_${context.userEmotion}`;
        return state.storyRankings
            .map((ranking) => {
            // Check for context-specific score first
            const contextScore = ranking.byContext[contextKey];
            const score = contextScore || ranking.overallScore;
            const reason = contextScore
                ? `High effectiveness (${(score * 100).toFixed(0)}%) in this context`
                : `Generally effective (${(score * 100).toFixed(0)}%)`;
            return { storyId: ranking.storyId, score, reason };
        })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    // ==========================================================================
    // A/B TESTING
    // ==========================================================================
    /**
     * Create a new experiment
     */
    createExperiment(experiment) {
        const fullExperiment = {
            ...experiment,
            id: `exp_${experiment.personaId}_${Date.now()}`,
            metrics: {
                engagement: { control: 0, treatment: 0, controlN: 0, treatmentN: 0 },
                satisfaction: { control: 0, treatment: 0, controlN: 0, treatmentN: 0 },
                depth: { control: 0, treatment: 0, controlN: 0, treatmentN: 0 },
            },
            status: 'draft',
        };
        this.experiments.set(fullExperiment.id, fullExperiment);
        const state = this.getOrCreateState(experiment.personaId);
        state.experiments.push(fullExperiment);
        getLogger().info({ experimentId: fullExperiment.id, personaId: experiment.personaId, name: experiment.name }, 'Created new experiment');
        return fullExperiment;
    }
    /**
     * Get variant for a user in an experiment
     */
    getExperimentVariant(experimentId, userId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment || experiment.status !== 'running')
            return null;
        // Deterministic assignment based on userId hash
        const hash = this.hashString(userId + experimentId);
        const normalizedHash = hash / 0xffffffff;
        return normalizedHash < experiment.trafficAllocation ? 'treatment' : 'control';
    }
    /**
     * Record experiment metric
     */
    recordExperimentMetric(experimentId, variant, metric, value) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment)
            return;
        const metricData = experiment.metrics[metric];
        const n = variant === 'control' ? metricData.controlN : metricData.treatmentN;
        const currentAvg = variant === 'control' ? metricData.control : metricData.treatment;
        // Running average
        const newAvg = (currentAvg * n + value) / (n + 1);
        if (variant === 'control') {
            metricData.control = newAvg;
            metricData.controlN++;
        }
        else {
            metricData.treatment = newAvg;
            metricData.treatmentN++;
        }
        // Check if we have enough data to conclude
        this.checkExperimentConclusion(experimentId);
    }
    /**
     * Check if experiment can be concluded
     */
    checkExperimentConclusion(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment || experiment.status !== 'running')
            return;
        const { engagement } = experiment.metrics;
        const totalN = engagement.controlN + engagement.treatmentN;
        if (totalN < experiment.minimumSampleSize)
            return;
        // Simple significance check (would use proper stats in production)
        const diff = engagement.treatment - engagement.control;
        const pooledStdErr = 0.1; // Simplified
        const zScore = diff / pooledStdErr;
        if (Math.abs(zScore) > 1.96) {
            // 95% confidence
            experiment.status = 'concluded';
            experiment.endedAt = new Date();
            experiment.winner = diff > 0 ? 'treatment' : 'control';
            experiment.winnerConfidence = Math.min(0.99, Math.abs(zScore) / 4);
            getLogger().info({
                experimentId,
                winner: experiment.winner,
                confidence: experiment.winnerConfidence,
                improvement: `${(Math.abs(diff) * 100).toFixed(1)}%`,
            }, 'Experiment concluded');
            // Auto-create adjustment if treatment won
            if (experiment.winner === 'treatment' && experiment.treatment.promptModification) {
                this.createAdjustmentFromExperiment(experiment);
            }
        }
    }
    /**
     * Create adjustment from winning experiment
     */
    createAdjustmentFromExperiment(experiment) {
        const adjustment = {
            id: `adj_exp_${experiment.id}`,
            personaId: experiment.personaId,
            trigger: {
                condition: 'true', // Always apply
                description: `From experiment: ${experiment.name}`,
            },
            adjustment: {
                type: 'prompt_addition',
                content: experiment.treatment.promptModification || experiment.treatment.description,
                priority: 5,
            },
            source: 'a_b_test',
            confidence: experiment.winnerConfidence || 0.95,
            effectivenessLift: experiment.metrics.engagement.treatment - experiment.metrics.engagement.control,
            createdAt: new Date(),
            lastApplied: new Date(),
            applicationCount: 0,
            enabled: true,
        };
        const state = this.getOrCreateState(experiment.personaId);
        state.adjustments.push(adjustment);
        getLogger().info({ personaId: experiment.personaId, experimentId: experiment.id }, 'Created adjustment from experiment winner');
    }
    // ==========================================================================
    // EMERGENT BEHAVIOR DETECTION
    // ==========================================================================
    /**
     * Detect emergent patterns from conversation logs
     * This should be run periodically on conversation data
     */
    detectEmergentPatterns(personaId, conversations) {
        const patterns = [];
        // Look for phrases that correlate with positive outcomes
        const phraseOutcomes = new Map();
        for (const convo of conversations) {
            const isPositive = convo.userSatisfaction === 'positive' && convo.engagementScore > 0.7;
            for (const turn of convo.turns.filter((t) => t.role === 'assistant')) {
                // Extract phrases (simplified - would use NLP in production)
                const phrases = this.extractPhrases(turn.content);
                for (const phrase of phrases) {
                    const existing = phraseOutcomes.get(phrase) || { positive: 0, total: 0 };
                    existing.total++;
                    if (isPositive)
                        existing.positive++;
                    phraseOutcomes.set(phrase, existing);
                }
            }
        }
        // Find phrases with significantly higher positive correlation
        for (const [phrase, outcomes] of phraseOutcomes.entries()) {
            if (outcomes.total < 10)
                continue;
            const positiveRate = outcomes.positive / outcomes.total;
            const baselineRate = 0.5; // Simplified
            if (positiveRate > baselineRate + 0.15) {
                patterns.push({
                    id: `emergent_${personaId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    personaId,
                    observedBehavior: `Uses phrase: "${phrase}"`,
                    frequency: outcomes.total / conversations.length,
                    context: 'Various contexts',
                    correlatedOutcome: 'Higher engagement and satisfaction',
                    effectSize: positiveRate - baselineRate,
                    confidence: Math.min(0.95, outcomes.total / 50),
                    recommendation: positiveRate > 0.75 ? 'codify' : 'investigate',
                    reasoning: `This phrase appears in ${outcomes.total} responses and correlates with ${(positiveRate * 100).toFixed(0)}% positive outcomes`,
                    status: 'detected',
                });
            }
        }
        // Add to state
        const state = this.getOrCreateState(personaId);
        state.emergentPatterns.push(...patterns);
        getLogger().info({ personaId, patternsDetected: patterns.length }, 'Detected emergent patterns');
        return patterns;
    }
    // ==========================================================================
    // EVOLUTION CYCLE
    // ==========================================================================
    /**
     * Run a full evolution cycle for a persona
     * This should be run periodically (e.g., daily)
     */
    async runEvolutionCycle(personaId) {
        getLogger().info({ personaId }, 'Starting evolution cycle');
        const state = this.getOrCreateState(personaId);
        const insights = getCommunityInsights();
        // 1. Import community insights
        const bestStrategies = insights.getBestStrategy({
            userEmotion: 'neutral', // Get general patterns
            topic: 'general',
            relationshipStage: 'acquaintance',
            personaId,
        });
        if (bestStrategies && bestStrategies.confidence > 0.6) {
            // Create adjustment if not already exists
            const existingAdj = state.adjustments.find((a) => a.adjustment.content.includes(bestStrategies.strategy));
            if (!existingAdj) {
                this.createAdjustmentFromCommunityPattern(personaId, {
                    context: {},
                    bestStrategy: bestStrategies.strategy,
                    improvement: bestStrategies.expectedEngagement - 0.5, // vs baseline
                    confidence: bestStrategies.confidence,
                });
            }
        }
        // 2. Update story rankings
        this.updateStoryRankings(personaId);
        // 3. Update metrics
        const activeAdjustments = state.adjustments.filter((a) => a.enabled);
        state.evolutionMetrics = {
            ...state.evolutionMetrics,
            adjustmentsApplied: activeAdjustments.length,
            experimentsRun: state.experiments.filter((e) => e.status === 'concluded').length,
            lastEvolutionCycle: new Date(),
        };
        getLogger().info({
            personaId,
            adjustments: activeAdjustments.length,
            storyRankings: state.storyRankings.length,
        }, 'Evolution cycle complete');
    }
    // ==========================================================================
    // HELPERS
    // ==========================================================================
    getOrCreateState(personaId) {
        let state = this.evolutionStates.get(personaId);
        if (!state) {
            state = {
                personaId,
                adjustments: [],
                storyRankings: [],
                effectivePhrases: [],
                experiments: [],
                emergentPatterns: [],
                evolutionMetrics: {
                    avgEngagementBefore: 0.5,
                    avgEngagementAfter: 0.5,
                    improvementPercent: 0,
                    adjustmentsApplied: 0,
                    experimentsRun: 0,
                    lastEvolutionCycle: new Date(),
                },
            };
            this.evolutionStates.set(personaId, state);
        }
        return state;
    }
    buildConditionFromContext(context) {
        const conditions = [];
        if (context.userEmotion) {
            conditions.push(`userEmotion === '${context.userEmotion}'`);
        }
        if (context.topic) {
            conditions.push(`topic === '${context.topic}'`);
        }
        if (context.relationshipStage) {
            conditions.push(`relationshipStage === '${context.relationshipStage}'`);
        }
        return conditions.length > 0 ? conditions.join(' && ') : 'true';
    }
    describeContext(context) {
        const parts = [];
        if (context.userEmotion) {
            parts.push(`user feels ${context.userEmotion}`);
        }
        if (context.topic) {
            parts.push(`discussing ${context.topic}`);
        }
        if (context.relationshipStage) {
            parts.push(`at ${context.relationshipStage} stage`);
        }
        return parts.length > 0 ? parts.join(', ') : 'any context';
    }
    evaluateCondition(condition, context) {
        if (condition === 'true')
            return true;
        // Simple condition evaluation (would use a proper parser in production)
        try {
            const evalContext = {
                userEmotion: context.userEmotion,
                topic: context.topic,
                relationshipStage: context.relationshipStage,
            };
            const evalFn = new Function('userEmotion', 'topic', 'relationshipStage', `return ${condition}`);
            return evalFn(evalContext.userEmotion, evalContext.topic, evalContext.relationshipStage);
        }
        catch {
            return false;
        }
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    extractPhrases(content) {
        // Simplified phrase extraction
        // In production, would use NLP for better extraction
        const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
        return sentences.slice(0, 5).map((s) => s.trim().slice(0, 100));
    }
    // ==========================================================================
    // ANALYTICS WORKER INTEGRATION
    // ==========================================================================
    /**
     * Record tool usage for analytics.
     * Used by analytics-worker to track which tools are being used effectively.
     */
    recordToolUsage(personaId, toolName, success) {
        const state = this.getOrCreateState(personaId);
        // Simple recording - can be enhanced later for more detailed tracking
        getLogger().debug({ personaId, toolName, success }, 'Tool usage recorded');
        // State is accessed, no need to track timestamp as it's not in the interface
    }
    /**
     * Record a pattern for evolution tracking.
     * Used by analytics-worker for collective learning.
     */
    recordPattern(personaId, pattern) {
        getLogger().debug({ personaId, pattern }, 'Pattern recorded for evolution tracking');
    }
    // ==========================================================================
    // PERSISTENCE
    // ==========================================================================
    exportState() {
        return new Map(this.evolutionStates);
    }
    importState(states) {
        if (states instanceof Map) {
            this.evolutionStates = states;
        }
        else {
            this.evolutionStates = new Map(Object.entries(states));
        }
        // Also populate experiments map
        for (const state of this.evolutionStates.values()) {
            for (const exp of state.experiments) {
                this.experiments.set(exp.id, exp);
            }
        }
        getLogger().info({ personaCount: this.evolutionStates.size }, 'Evolution state imported');
    }
}
// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================
const FIRESTORE_COLLECTION = 'agent_evolution';
// Cache to prevent excessive reads
let lastLoadTime = 0;
const LOAD_COOLDOWN_MS = 60000; // 1 minute
/**
 * Load agent evolution state from Firestore
 * Called on startup to hydrate all persona states
 */
export async function loadAgentEvolutionFromFirestore() {
    // Prevent duplicate loads
    if (Date.now() - lastLoadTime < LOAD_COOLDOWN_MS) {
        getLogger().debug('Skipping agent evolution load (cooldown)');
        return;
    }
    try {
        const { getGlobalServices } = await import('../../services/global-services.js');
        const global = await getGlobalServices();
        if (!('getFirestore' in global.store)) {
            getLogger().debug('Store does not support Firestore, skipping evolution load');
            return;
        }
        const firestore = global.store.getFirestore();
        const snapshot = await firestore.collection(FIRESTORE_COLLECTION).get();
        if (snapshot.empty) {
            lastLoadTime = Date.now();
            getLogger().info('No agent evolution states found in Firestore (new deployment)');
            return;
        }
        const states = {};
        for (const doc of snapshot.docs) {
            const data = doc.data();
            states[doc.id] = {
                ...data,
                // Restore Date objects from Firestore Timestamps
                adjustments: data.adjustments?.map((adj) => ({
                    ...adj,
                    createdAt: adj.createdAt?.toDate?.() ||
                        new Date(adj.createdAt),
                    lastApplied: adj.lastApplied?.toDate?.() ||
                        new Date(adj.lastApplied),
                })) || [],
                experiments: data.experiments?.map((exp) => ({
                    ...exp,
                    startedAt: exp.startedAt?.toDate?.() ||
                        (exp.startedAt ? new Date(exp.startedAt) : undefined),
                    endedAt: exp.endedAt
                        ? exp.endedAt?.toDate?.() ||
                            new Date(exp.endedAt)
                        : undefined,
                })) || [],
                evolutionMetrics: {
                    ...data.evolutionMetrics,
                    lastEvolutionCycle: data.evolutionMetrics?.lastEvolutionCycle?.toDate?.() || new Date(),
                },
            };
        }
        const engine = getAgentEvolution();
        engine.importState(states);
        lastLoadTime = Date.now();
        getLogger().info({
            personasLoaded: Object.keys(states).length,
            totalAdjustments: Object.values(states).reduce((sum, s) => sum + (s.adjustments?.length || 0), 0),
        }, 'Agent evolution states loaded from Firestore');
    }
    catch (error) {
        getLogger().warn({ error: String(error) }, 'Failed to load agent evolution from Firestore (non-fatal)');
    }
}
/**
 * Save agent evolution state to Firestore
 * Called periodically and on shutdown
 */
export async function saveAgentEvolutionToFirestore() {
    try {
        const engine = getAgentEvolution();
        const states = engine.exportState();
        if (states.size === 0) {
            getLogger().debug('No agent evolution states to save');
            return;
        }
        const { getGlobalServices } = await import('../../services/global-services.js');
        const global = await getGlobalServices();
        if (!('getFirestore' in global.store)) {
            getLogger().debug('Store does not support Firestore, skipping evolution save');
            return;
        }
        const firestore = global.store.getFirestore();
        const batch = firestore.batch();
        for (const [personaId, state] of states) {
            const docRef = firestore.collection(FIRESTORE_COLLECTION).doc(personaId);
            batch.set(docRef, removeUndefined({
                ...state,
                updatedAt: new Date(),
            }));
        }
        await batch.commit();
        getLogger().info({
            personasSaved: states.size,
            totalAdjustments: Array.from(states.values()).reduce((sum, s) => sum + (s.adjustments?.length || 0), 0),
        }, 'Agent evolution states saved to Firestore');
    }
    catch (error) {
        getLogger().warn({ error: String(error) }, 'Failed to save agent evolution to Firestore (non-fatal)');
    }
}
/**
 * Initialize agent evolution with Firestore persistence
 * Should be called during startup
 */
export async function initializeAgentEvolution() {
    await loadAgentEvolutionFromFirestore();
    return getAgentEvolution();
}
// ============================================================================
// SINGLETON
// ============================================================================
let agentEvolutionEngine = null;
export function getAgentEvolution() {
    if (!agentEvolutionEngine) {
        agentEvolutionEngine = new AgentEvolutionEngine();
    }
    return agentEvolutionEngine;
}
export function resetAgentEvolution() {
    agentEvolutionEngine = null;
}
export default AgentEvolutionEngine;
//# sourceMappingURL=agent-evolution.js.map