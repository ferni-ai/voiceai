/**
 * Intervention-Situation Matching - Embedding-Powered
 *
 * Embeds situations to find optimal interventions based on semantic similarity.
 *
 * Example: "In similar situations, validation worked 85% of the time."
 *
 * This enables learning what interventions work for which situations,
 * going beyond simple condition matching to semantic understanding.
 *
 * @module intelligence/predictive/embeddings/intervention-matching
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { embedBatch, cosineSimilarity } from '../../../memory/embeddings.js';
const log = createLogger({ module: 'InterventionMatching' });
// ============================================================================
// STORAGE
// ============================================================================
const userSituationLibrary = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record a situation-intervention outcome
 */
export async function recordSituationOutcome(userId, situation) {
    const library = userSituationLibrary.get(userId) || [];
    // Build embedding texts
    const situationText = `${situation.topic}: ${situation.transcript.slice(0, 500)}. Emotion: ${situation.emotionalState}. Depth: ${situation.conversationDepth}`;
    const emotionalText = `emotional state: ${situation.emotionalState}`;
    const topicText = situation.topic;
    // Generate embeddings
    const [situationEmbedding, emotionalEmbedding, topicEmbedding] = await embedBatch([
        situationText,
        emotionalText,
        topicText,
    ]);
    const record = {
        id: `sit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        timestamp: Date.now(),
        situationEmbedding,
        emotionalEmbedding,
        topicEmbedding,
        transcript: situation.transcript.slice(0, 500),
        emotionalState: situation.emotionalState,
        topic: situation.topic,
        conversationDepth: situation.conversationDepth,
        intervention: situation.intervention,
        outcome: situation.outcome,
        effectivenessScore: situation.effectivenessScore,
        userResponse: situation.userResponse,
        timeOfDay: situation.timeOfDay || getTimeOfDay(),
        dayOfWeek: situation.dayOfWeek ?? new Date().getDay(),
        relationshipStage: situation.relationshipStage || 'established',
    };
    library.push(record);
    // Keep library manageable
    if (library.length > 500) {
        library.shift(); // Remove oldest
    }
    userSituationLibrary.set(userId, library);
    log.debug({ userId, intervention: situation.intervention, outcome: situation.outcome }, '📍 Recorded situation-intervention outcome');
    return record;
}
/**
 * Find similar situations from history
 */
export async function findSimilarSituations(userId, currentSituation, k = 10) {
    const library = userSituationLibrary.get(userId) || [];
    if (library.length === 0)
        return [];
    // Embed current situation
    const situationText = `${currentSituation.topic}: ${currentSituation.transcript.slice(0, 500)}. Emotion: ${currentSituation.emotionalState}. Depth: ${currentSituation.conversationDepth || 'moderate'}`;
    const emotionalText = `emotional state: ${currentSituation.emotionalState}`;
    const topicText = currentSituation.topic;
    const [currentSituationEmb, currentEmotionalEmb, currentTopicEmb] = await embedBatch([
        situationText,
        emotionalText,
        topicText,
    ]);
    // Score all historical situations
    const scored = [];
    for (const situation of library) {
        const situationSim = cosineSimilarity(currentSituationEmb, situation.situationEmbedding);
        const emotionalSim = cosineSimilarity(currentEmotionalEmb, situation.emotionalEmbedding);
        const topicSim = cosineSimilarity(currentTopicEmb, situation.topicEmbedding);
        // Weighted overall similarity
        const similarity = situationSim * 0.5 +
            emotionalSim * 0.3 +
            topicSim * 0.2;
        scored.push({
            situation,
            similarity,
            emotionalMatch: emotionalSim,
            topicMatch: topicSim,
            successfulIntervention: situation.outcome === 'success' || situation.userResponse === 'breakthrough',
        });
    }
    return scored
        .filter((m) => m.similarity > 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);
}
/**
 * Get intervention recommendations based on similar situations
 */
export async function getInterventionRecommendations(userId, currentSituation, k = 5) {
    const similarSituations = await findSimilarSituations(userId, currentSituation, 20);
    if (similarSituations.length < 3) {
        return getDefaultRecommendations(currentSituation);
    }
    // Aggregate intervention outcomes
    const interventionStats = {};
    for (const match of similarSituations) {
        const intervention = match.situation.intervention;
        if (!interventionStats[intervention]) {
            interventionStats[intervention] = {
                successes: 0,
                failures: 0,
                totalScore: 0,
                situations: [],
            };
        }
        const stats = interventionStats[intervention];
        stats.situations.push(match);
        stats.totalScore += match.situation.effectivenessScore * match.similarity;
        if (match.successfulIntervention) {
            stats.successes++;
        }
        else if (match.situation.outcome === 'backfired') {
            stats.failures++;
        }
    }
    // Build recommendations
    const recommendations = [];
    for (const [intervention, stats] of Object.entries(interventionStats)) {
        const sampleSize = stats.situations.length;
        if (sampleSize < 2)
            continue;
        const successRate = stats.successes / sampleSize;
        const avgScore = stats.totalScore / sampleSize;
        const confidence = Math.min(1, sampleSize / 10) * avgScore;
        // Find anti-patterns (what backfired)
        const antiPatterns = stats.situations
            .filter((s) => s.situation.outcome === 'backfired')
            .map((s) => describeAntiPattern(s.situation))
            .slice(0, 2);
        recommendations.push({
            intervention: intervention,
            confidence,
            successRate,
            sampleSize,
            reasoning: generateReasoning(intervention, stats.situations, successRate),
            antiPatterns,
        });
    }
    return recommendations
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, k);
}
/**
 * Get the single best intervention for current situation
 */
export async function getBestIntervention(userId, currentSituation) {
    const recommendations = await getInterventionRecommendations(userId, currentSituation, 1);
    return recommendations[0] || null;
}
/**
 * Get intervention success rate for a specific intervention
 */
export async function getInterventionSuccessRate(userId, intervention, currentSituation) {
    const similarSituations = await findSimilarSituations(userId, currentSituation, 20);
    const relevantSituations = similarSituations.filter((s) => s.situation.intervention === intervention);
    if (relevantSituations.length < 2)
        return null;
    const successes = relevantSituations.filter((s) => s.successfulIntervention).length;
    const successRate = successes / relevantSituations.length;
    // Find common conditions in successful cases
    const successfulConditions = relevantSituations
        .filter((s) => s.successfulIntervention)
        .map((s) => describeConditions(s.situation));
    return {
        rate: successRate,
        sampleSize: relevantSituations.length,
        conditions: [...new Set(successfulConditions)].slice(0, 3),
    };
}
/**
 * Get situations where a specific intervention worked well
 */
export function getSuccessfulSituations(userId, intervention, limit = 5) {
    const library = userSituationLibrary.get(userId) || [];
    return library
        .filter((s) => s.intervention === intervention &&
        (s.outcome === 'success' || s.userResponse === 'breakthrough'))
        .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
        .slice(0, limit);
}
/**
 * Get intervention statistics for user
 */
export function getInterventionStats(userId) {
    const library = userSituationLibrary.get(userId) || [];
    const stats = {};
    for (const situation of library) {
        const intervention = situation.intervention;
        if (!stats[intervention]) {
            stats[intervention] = {
                successes: 0,
                attempts: 0,
                totalEffectiveness: 0,
                conditions: [],
            };
        }
        stats[intervention].attempts++;
        stats[intervention].totalEffectiveness += situation.effectivenessScore;
        if (situation.outcome === 'success' || situation.userResponse === 'breakthrough') {
            stats[intervention].successes++;
            stats[intervention].conditions.push(describeConditions(situation));
        }
    }
    const result = {};
    for (const [intervention, data] of Object.entries(stats)) {
        result[intervention] = {
            attempts: data.attempts,
            successRate: data.attempts > 0 ? data.successes / data.attempts : 0,
            avgEffectiveness: data.attempts > 0 ? data.totalEffectiveness / data.attempts : 0,
            bestConditions: [...new Set(data.conditions)].slice(0, 3),
        };
    }
    return result;
}
// ============================================================================
// HELPERS
// ============================================================================
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 6)
        return 'early_morning';
    if (hour < 12)
        return 'morning';
    if (hour < 17)
        return 'afternoon';
    if (hour < 21)
        return 'evening';
    return 'night';
}
function getDefaultRecommendations(situation) {
    // Default recommendations when no history
    const recommendations = [];
    // Based on emotional state
    if (situation.emotionalState.match(/sad|grief|hurt|low/i)) {
        recommendations.push({
            intervention: 'validation',
            confidence: 0.6,
            successRate: 0.7,
            sampleSize: 0,
            reasoning: 'Validation is generally effective when someone is sad or hurt',
            antiPatterns: ['jumping to solutions', 'minimizing'],
        });
    }
    if (situation.emotionalState.match(/anxious|worried|scared/i)) {
        recommendations.push({
            intervention: 'grounding',
            confidence: 0.6,
            successRate: 0.7,
            sampleSize: 0,
            reasoning: 'Grounding helps when someone is anxious',
            antiPatterns: ['amplifying worry', 'dismissing'],
        });
    }
    if (situation.emotionalState.match(/excited|happy|proud/i)) {
        recommendations.push({
            intervention: 'celebration',
            confidence: 0.7,
            successRate: 0.8,
            sampleSize: 0,
            reasoning: 'Celebrate with them when they\'re happy',
            antiPatterns: ['tempering enthusiasm', 'redirecting'],
        });
    }
    // Default fallback
    if (recommendations.length === 0) {
        recommendations.push({
            intervention: 'presence',
            confidence: 0.5,
            successRate: 0.6,
            sampleSize: 0,
            reasoning: 'When uncertain, being present is always safe',
            antiPatterns: [],
        });
    }
    return recommendations;
}
function describeAntiPattern(situation) {
    const parts = [];
    if (situation.conversationDepth === 'surface') {
        parts.push('conversation was surface-level');
    }
    if (situation.emotionalState) {
        parts.push(`when ${situation.emotionalState}`);
    }
    if (situation.timeOfDay === 'night' || situation.timeOfDay === 'early_morning') {
        parts.push(`late at night`);
    }
    return parts.join(', ') || 'unclear conditions';
}
function describeConditions(situation) {
    const parts = [];
    if (situation.conversationDepth === 'deep') {
        parts.push('deep conversation');
    }
    if (situation.emotionalState) {
        parts.push(situation.emotionalState);
    }
    if (situation.topic) {
        parts.push(`discussing ${situation.topic}`);
    }
    return parts.join(', ') || 'general';
}
function generateReasoning(intervention, situations, successRate) {
    const successWord = successRate > 0.7 ? 'highly effective' :
        successRate > 0.5 ? 'moderately effective' : 'sometimes effective';
    const topicMatch = situations.reduce((sum, s) => sum + s.topicMatch, 0) / situations.length;
    const emotionalMatch = situations.reduce((sum, s) => sum + s.emotionalMatch, 0) / situations.length;
    let reasoning = `${intervention.replace(/_/g, ' ')} has been ${successWord} in similar situations`;
    if (emotionalMatch > 0.7) {
        reasoning += ' (especially with similar emotional states)';
    }
    else if (topicMatch > 0.7) {
        reasoning += ' (especially on similar topics)';
    }
    return reasoning;
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build intervention matching context for LLM
 */
export async function buildInterventionMatchingContext(userId, currentSituation) {
    const recommendations = await getInterventionRecommendations(userId, currentSituation, 3);
    if (recommendations.length === 0)
        return '';
    const sections = ['[INTERVENTION MATCHING INTELLIGENCE]'];
    sections.push('\nBased on similar past situations:');
    for (const rec of recommendations) {
        const rateStr = `${Math.round(rec.successRate * 100)}% success`;
        const sampleStr = rec.sampleSize > 0 ? ` (n=${rec.sampleSize})` : ' (default)';
        sections.push(`• ${rec.intervention.replace(/_/g, ' ')}: ${rateStr}${sampleStr}`);
        sections.push(`  ${rec.reasoning}`);
        if (rec.antiPatterns.length > 0) {
            sections.push(`  ⚠️ Avoid when: ${rec.antiPatterns.join(', ')}`);
        }
    }
    return sections.join('\n');
}
/**
 * Get current state for persistence
 */
export function getStateForPersistence(userId) {
    return {
        situations: userSituationLibrary.get(userId) || [],
    };
}
/**
 * Hydrate from persisted data
 */
export function hydrateFromPersistence(userId, data) {
    if (data.situations && data.situations.length > 0) {
        userSituationLibrary.set(userId, data.situations);
        log.debug({ userId, count: data.situations.length }, '💧 Hydrated intervention situations');
    }
}
/**
 * Clear user data (for cleanup)
 */
export function clearUserData(userId) {
    userSituationLibrary.delete(userId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const interventionMatching = {
    recordSituationOutcome,
    findSimilarSituations,
    getInterventionRecommendations,
    getBestIntervention,
    getInterventionSuccessRate,
    getSuccessfulSituations,
    getInterventionStats,
    buildInterventionMatchingContext,
    // Persistence
    getStateForPersistence,
    hydrateFromPersistence,
    clearUserData,
};
export default interventionMatching;
//# sourceMappingURL=intervention-matching.js.map