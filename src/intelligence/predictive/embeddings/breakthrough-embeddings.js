/**
 * Breakthrough Catalyst Embeddings
 *
 * Embeds breakthrough moments to find similar situations where insights emerged.
 *
 * Example: "A similar pattern led to your insight about self-worth 3 months ago."
 *
 * This enables recognizing when conditions are right for breakthrough based on
 * the user's own breakthrough history.
 *
 * @module intelligence/predictive/embeddings/breakthrough-embeddings
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { embed, embedBatch, cosineSimilarity } from '../../../memory/embeddings.js';
const log = createLogger({ module: 'BreakthroughEmbeddings' });
// ============================================================================
// STORAGE
// ============================================================================
const userBreakthroughLibrary = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record a breakthrough with embeddings
 */
export async function recordBreakthroughWithEmbeddings(userId, breakthrough) {
    const library = userBreakthroughLibrary.get(userId) || [];
    // Build text representations
    const contextText = `Topic: ${breakthrough.topic}. Context: ${breakthrough.conversationContext}. Emotion: ${breakthrough.emotionalState}`;
    const indicatorText = breakthrough.indicators
        .map((i) => `${i.type}: ${i.content}`)
        .join('. ');
    const catalystText = `${breakthrough.catalystType}: ${breakthrough.catalystDescription}`;
    const insightText = `Breakthrough about ${breakthrough.topic}: ${breakthrough.insightSummary}`;
    // Generate embeddings
    const [contextEmbedding, indicatorEmbedding, catalystEmbedding, insightEmbedding] = await embedBatch([
        contextText,
        indicatorText,
        catalystText,
        insightText,
    ]);
    const record = {
        id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        ...breakthrough,
        contextEmbedding,
        indicatorEmbedding,
        catalystEmbedding,
        insightEmbedding,
        timestamp: Date.now(),
    };
    library.push(record);
    userBreakthroughLibrary.set(userId, library);
    log.info({ userId, topic: breakthrough.topic, type: breakthrough.type }, '💡 Recorded breakthrough embedding');
    return record;
}
/**
 * Find similar past breakthroughs
 */
export async function findSimilarBreakthroughs(userId, currentState, k = 5) {
    const library = userBreakthroughLibrary.get(userId) || [];
    if (library.length === 0)
        return [];
    // Embed current state
    const contextText = `Topic: ${currentState.topic}. Context: ${currentState.conversationContext}. Emotion: ${currentState.emotionalState}`;
    const indicatorText = currentState.indicators
        .map((i) => `${i.type}: ${i.content}`)
        .join('. ');
    const topicText = currentState.topic;
    const [contextEmb, indicatorEmb, topicEmb] = await embedBatch([
        contextText,
        indicatorText,
        topicText,
    ]);
    // Score all breakthroughs
    const scored = [];
    for (const breakthrough of library) {
        const contextSimilarity = cosineSimilarity(contextEmb, breakthrough.contextEmbedding);
        const indicatorSimilarity = cosineSimilarity(indicatorEmb, breakthrough.indicatorEmbedding);
        const topicSimilarity = cosineSimilarity(topicEmb, breakthrough.insightEmbedding);
        // Weighted combination
        const overallSimilarity = indicatorSimilarity * 0.4 +
            contextSimilarity * 0.3 +
            topicSimilarity * 0.3;
        // Likelihood based on similarity and historical impact
        const likelihood = overallSimilarity * (0.5 + breakthrough.impact * 0.5);
        // Generate guidance
        const guidanceFromPast = generateGuidance(breakthrough, indicatorSimilarity);
        scored.push({
            breakthrough,
            overallSimilarity,
            indicatorSimilarity,
            contextSimilarity,
            topicSimilarity,
            likelihood,
            guidanceFromPast,
        });
    }
    return scored
        .filter((m) => m.overallSimilarity > 0.4)
        .sort((a, b) => b.likelihood - a.likelihood)
        .slice(0, k);
}
/**
 * Predict breakthrough readiness
 */
export async function predictBreakthroughReadiness(userId, currentState) {
    const matches = await findSimilarBreakthroughs(userId, currentState, 5);
    if (matches.length === 0)
        return null;
    // Calculate readiness
    const avgSimilarity = matches.reduce((sum, m) => sum + m.overallSimilarity, 0) / matches.length;
    const readiness = Math.min(1, avgSimilarity * 1.2);
    // Find likely breakthrough type
    const typeCounts = {};
    for (const match of matches) {
        typeCounts[match.breakthrough.type] = (typeCounts[match.breakthrough.type] || 0) + match.likelihood;
    }
    const likelyType = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'self_understanding';
    // Find optimal catalysts
    const catalystSuccess = {};
    for (const match of matches) {
        const catalyst = match.breakthrough.catalystType;
        if (!catalystSuccess[catalyst]) {
            catalystSuccess[catalyst] = { count: 0, totalImpact: 0 };
        }
        catalystSuccess[catalyst].count++;
        catalystSuccess[catalyst].totalImpact += match.breakthrough.impact;
    }
    const optimalCatalysts = Object.entries(catalystSuccess)
        .map(([type, data]) => ({
        type,
        description: getCatalystDescription(type),
        historicalSuccess: data.totalImpact / data.count,
    }))
        .sort((a, b) => b.historicalSuccess - a.historicalSuccess)
        .slice(0, 3);
    // Generate recommendation
    const recommendedApproach = generateRecommendation(matches, optimalCatalysts);
    return {
        readiness,
        likelyType,
        optimalCatalysts,
        similarBreakthroughs: matches,
        recommendedApproach,
    };
}
/**
 * Get breakthrough catalyst that worked best for this user
 */
export function getOptimalCatalysts(userId) {
    const library = userBreakthroughLibrary.get(userId) || [];
    const catalystStats = {};
    for (const breakthrough of library) {
        const type = breakthrough.catalystType;
        if (!catalystStats[type]) {
            catalystStats[type] = { count: 0, totalImpact: 0 };
        }
        catalystStats[type].count++;
        catalystStats[type].totalImpact += breakthrough.impact;
    }
    return Object.entries(catalystStats)
        .map(([type, data]) => ({
        type,
        successRate: data.count / library.length,
        averageImpact: data.totalImpact / data.count,
        count: data.count,
    }))
        .sort((a, b) => b.averageImpact - a.averageImpact);
}
/**
 * Get breakthrough patterns by topic similarity
 */
export async function getBreakthroughsByTopic(userId, topic, k = 5) {
    const library = userBreakthroughLibrary.get(userId) || [];
    if (library.length === 0)
        return [];
    const topicEmb = await embed(topic);
    const scored = library.map((b) => ({
        breakthrough: b,
        similarity: cosineSimilarity(topicEmb, b.insightEmbedding),
    }));
    return scored
        .filter((s) => s.similarity > 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k)
        .map((s) => s.breakthrough);
}
// ============================================================================
// HELPERS
// ============================================================================
function generateGuidance(breakthrough, similarity) {
    const timeAgo = Math.round((Date.now() - breakthrough.timestamp) / (24 * 60 * 60 * 1000));
    const timeStr = timeAgo === 0 ? 'today' :
        timeAgo === 1 ? 'yesterday' :
            timeAgo < 7 ? `${timeAgo} days ago` :
                timeAgo < 30 ? `${Math.round(timeAgo / 7)} weeks ago` :
                    `${Math.round(timeAgo / 30)} months ago`;
    let guidance = `Similar to breakthrough ${timeStr} about "${breakthrough.topic}"`;
    if (breakthrough.catalystType === 'question') {
        guidance += `. A reflective question helped then.`;
    }
    else if (breakthrough.catalystType === 'silence') {
        guidance += `. Space and silence helped then.`;
    }
    else if (breakthrough.catalystType === 'connection') {
        guidance += `. Making connections helped then.`;
    }
    if (breakthrough.insightSummary) {
        guidance += ` Insight was: "${breakthrough.insightSummary.slice(0, 100)}"`;
    }
    return guidance;
}
function getCatalystDescription(type) {
    const descriptions = {
        question: 'Ask a reflective question that invites deeper exploration',
        reflection: 'Mirror back what you notice, invite them to sit with it',
        connection: 'Help them see connections between different parts of their experience',
        emotion: 'Acknowledge the emotion and create space for it',
        external_event: 'Connect to something happening in their life',
        silence: 'Create space, don\'t fill the silence',
    };
    return descriptions[type] || 'Follow their lead';
}
function generateRecommendation(matches, optimalCatalysts) {
    if (matches.length === 0)
        return 'Continue building trust and exploring.';
    const topMatch = matches[0];
    const topCatalyst = optimalCatalysts[0];
    let recommendation = '';
    if (topMatch.overallSimilarity > 0.7) {
        recommendation = `Strong pattern match with past breakthrough. `;
    }
    else if (topMatch.overallSimilarity > 0.5) {
        recommendation = `Moderate pattern match detected. `;
    }
    if (topCatalyst) {
        recommendation += `Historically, ${topCatalyst.type.replace(/_/g, ' ')} works well for this person. `;
        recommendation += topCatalyst.description;
    }
    return recommendation;
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build breakthrough pattern context for LLM
 */
export async function buildBreakthroughEmbeddingContext(userId, currentState) {
    const prediction = await predictBreakthroughReadiness(userId, currentState);
    if (!prediction || prediction.readiness < 0.4)
        return '';
    const sections = ['[BREAKTHROUGH PATTERN INTELLIGENCE]'];
    sections.push(`\nBreakthrough readiness: ${Math.round(prediction.readiness * 100)}%`);
    sections.push(`Likely type: ${prediction.likelyType.replace(/_/g, ' ')}`);
    if (prediction.optimalCatalysts.length > 0) {
        sections.push('\nWhat has catalyzed breakthroughs before:');
        for (const catalyst of prediction.optimalCatalysts) {
            sections.push(`• ${catalyst.type}: ${catalyst.description} (${Math.round(catalyst.historicalSuccess * 100)}% success)`);
        }
    }
    if (prediction.similarBreakthroughs.length > 0) {
        sections.push('\nSimilar past breakthroughs:');
        for (const match of prediction.similarBreakthroughs.slice(0, 2)) {
            sections.push(`• ${match.guidanceFromPast}`);
        }
    }
    sections.push(`\nRecommendation: ${prediction.recommendedApproach}`);
    return sections.join('\n');
}
/**
 * Get current state for persistence
 */
export function getStateForPersistence(userId) {
    return {
        breakthroughs: userBreakthroughLibrary.get(userId) || [],
    };
}
/**
 * Hydrate from persisted data
 */
export function hydrateFromPersistence(userId, data) {
    if (data.breakthroughs && data.breakthroughs.length > 0) {
        userBreakthroughLibrary.set(userId, data.breakthroughs);
        log.debug({ userId, count: data.breakthroughs.length }, '💧 Hydrated breakthrough embeddings');
    }
}
/**
 * Clear user data (for cleanup)
 */
export function clearUserData(userId) {
    userBreakthroughLibrary.delete(userId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const breakthroughEmbeddings = {
    recordBreakthroughWithEmbeddings,
    findSimilarBreakthroughs,
    predictBreakthroughReadiness,
    getOptimalCatalysts,
    getBreakthroughsByTopic,
    buildBreakthroughEmbeddingContext,
    // Persistence
    getStateForPersistence,
    hydrateFromPersistence,
    clearUserData,
};
export default breakthroughEmbeddings;
//# sourceMappingURL=breakthrough-embeddings.js.map