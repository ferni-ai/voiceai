/**
 * Feedback Insights Generator
 *
 * Analyzes aggregated feedback to generate actionable insights:
 * - Per-persona resonance rates
 * - Topics that land well vs. fall flat
 * - User's preferred conversation depth
 * - Time-of-day engagement patterns
 *
 * These insights help both the AI (via context injection) and the user
 * (via reflection UI) understand what's working.
 *
 * @module services/feedback/feedback-insights
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getRecentFeedback, calculateUserFeedbackStats } from './conversation-feedback-store.js';
const log = createLogger({ module: 'FeedbackInsights' });
// ============================================================================
// CONSTANTS
// ============================================================================
// Minimum feedback count before generating insights
const MIN_FEEDBACK_FOR_INSIGHTS = 5;
// Topic detection patterns (simple keyword extraction)
const TOPIC_PATTERNS = [
    { topic: 'career', patterns: [/\b(work|job|career|boss|colleague|office|meeting)\b/i] },
    { topic: 'relationships', patterns: [/\b(partner|spouse|friend|family|relationship|dating)\b/i] },
    { topic: 'health', patterns: [/\b(health|exercise|sleep|diet|energy|tired|sick)\b/i] },
    { topic: 'emotions', patterns: [/\b(feeling|feel|emotion|anxious|stressed|happy|sad)\b/i] },
    { topic: 'goals', patterns: [/\b(goal|dream|plan|future|ambition|want to)\b/i] },
    { topic: 'habits', patterns: [/\b(habit|routine|morning|evening|daily|practice)\b/i] },
    { topic: 'creativity', patterns: [/\b(creative|art|music|writing|project|idea)\b/i] },
    { topic: 'finances', patterns: [/\b(money|budget|saving|spending|finance|invest)\b/i] },
];
// ============================================================================
// MAIN INSIGHTS GENERATOR
// ============================================================================
/**
 * Generate insights from a user's feedback history.
 */
export async function generateFeedbackInsights(userId) {
    try {
        // Get aggregated stats
        const stats = await calculateUserFeedbackStats(userId);
        if (!stats || stats.totalPrompts < MIN_FEEDBACK_FOR_INSIGHTS) {
            log.debug({ userId, totalPrompts: stats?.totalPrompts }, 'Insufficient feedback for insights');
            return null;
        }
        // Get recent feedback for topic analysis
        const feedback = await getRecentFeedback(userId, 100);
        // Calculate persona resonance rates
        const personaResonance = calculatePersonaResonance(stats);
        // Analyze topics
        const { topicsWell, topicsFlat } = analyzeTopics(feedback);
        // Determine preferred depth
        const preferredDepth = determinePreferredDepth(feedback);
        // Analyze time-of-day patterns
        const bestTimeOfDay = analyzeTimeOfDay(feedback);
        // Analyze skip patterns
        const skipPatterns = analyzeSkipPatterns(feedback);
        const insights = {
            userId,
            personaResonance,
            topicsWell,
            topicsFlat,
            preferredDepth,
            bestTimeOfDay,
            skipPatterns,
            generatedAt: new Date(),
        };
        log.info({
            userId,
            resonancePersonas: Object.keys(personaResonance).length,
            topicsWellCount: topicsWell.length,
            preferredDepth,
        }, '📊 Generated feedback insights');
        return insights;
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to generate feedback insights');
        return null;
    }
}
// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================
/**
 * Calculate resonance rate for each persona.
 */
function calculatePersonaResonance(stats) {
    const result = {};
    for (const [personaId, data] of Object.entries(stats.byPersona)) {
        const positiveCount = data.resonated + data.helpful;
        const totalResponded = data.prompts - (data.prompts - positiveCount - data.tooMuch - data.offTrack);
        if (totalResponded > 0) {
            result[personaId] = positiveCount / data.prompts;
        }
    }
    return result;
}
/**
 * Analyze topics that resonate well vs. fall flat.
 */
function analyzeTopics(feedback) {
    const topicScores = {};
    for (const fb of feedback) {
        // Skip if no meaningful reaction
        if (!fb.reaction || fb.reaction === 'skipped')
            continue;
        // Detect topics from context
        const text = `${fb.context.lastAgentMessage} ${fb.context.lastUserMessage} ${fb.context.topic || ''}`;
        for (const { topic, patterns } of TOPIC_PATTERNS) {
            if (patterns.some((p) => p.test(text))) {
                if (!topicScores[topic]) {
                    topicScores[topic] = { positive: 0, negative: 0 };
                }
                if (fb.reaction === 'resonated' || fb.reaction === 'helpful') {
                    topicScores[topic].positive++;
                }
                else if (fb.reaction === 'too_much' || fb.reaction === 'off_track') {
                    topicScores[topic].negative++;
                }
            }
        }
    }
    // Sort by score
    const entries = Object.entries(topicScores);
    const topicsWell = entries
        .filter(([, scores]) => scores.positive > scores.negative && scores.positive >= 2)
        .sort((a, b) => b[1].positive - a[1].positive)
        .map(([topic]) => topic)
        .slice(0, 5);
    const topicsFlat = entries
        .filter(([, scores]) => scores.negative > scores.positive && scores.negative >= 2)
        .sort((a, b) => b[1].negative - a[1].negative)
        .map(([topic]) => topic)
        .slice(0, 5);
    return { topicsWell, topicsFlat };
}
/**
 * Determine user's preferred conversation depth based on feedback patterns.
 */
function determinePreferredDepth(feedback) {
    // Simple heuristic: high "too_much" rate suggests preference for lighter/shorter
    // High "resonated" on long turns suggests preference for depth
    const withReaction = feedback.filter((f) => f.reaction && f.reaction !== 'skipped');
    if (withReaction.length < 3) {
        return 'medium'; // Not enough data
    }
    const tooMuchRate = withReaction.filter((f) => f.reaction === 'too_much').length / withReaction.length;
    const resonatedRate = withReaction.filter((f) => f.reaction === 'resonated').length / withReaction.length;
    if (tooMuchRate > 0.3) {
        return 'shallow';
    }
    else if (resonatedRate > 0.5) {
        return 'deep';
    }
    return 'medium';
}
/**
 * Analyze time-of-day engagement patterns.
 */
function analyzeTimeOfDay(feedback) {
    const timeScores = {
        morning: { positive: 0, total: 0 },
        afternoon: { positive: 0, total: 0 },
        evening: { positive: 0, total: 0 },
        night: { positive: 0, total: 0 },
    };
    for (const fb of feedback) {
        const hour = fb.promptedAt.getHours();
        let period;
        if (hour >= 5 && hour < 12) {
            period = 'morning';
        }
        else if (hour >= 12 && hour < 17) {
            period = 'afternoon';
        }
        else if (hour >= 17 && hour < 21) {
            period = 'evening';
        }
        else {
            period = 'night';
        }
        timeScores[period].total++;
        if (fb.reaction === 'resonated' || fb.reaction === 'helpful') {
            timeScores[period].positive++;
        }
    }
    // Find best engagement period
    let bestPeriod;
    let bestRate = 0;
    const minSamples = 3;
    for (const [period, scores] of Object.entries(timeScores)) {
        if (scores.total >= minSamples) {
            const rate = scores.positive / scores.total;
            if (rate > bestRate) {
                bestRate = rate;
                bestPeriod = period;
            }
        }
    }
    // Only return if significantly better than average
    if (bestPeriod && bestRate > 0.5) {
        return bestPeriod;
    }
    return undefined;
}
/**
 * Analyze patterns in skipped/dismissed feedback.
 */
function analyzeSkipPatterns(feedback) {
    const topicSkips = {};
    const personaSkips = {};
    for (const fb of feedback) {
        // Track persona skips
        if (!personaSkips[fb.personaId]) {
            personaSkips[fb.personaId] = { skips: 0, total: 0 };
        }
        personaSkips[fb.personaId].total++;
        if (fb.reaction === 'skipped' || fb.reaction === null) {
            personaSkips[fb.personaId].skips++;
            // Track topic skips
            const text = `${fb.context.lastAgentMessage} ${fb.context.topic || ''}`;
            for (const { topic, patterns } of TOPIC_PATTERNS) {
                if (patterns.some((p) => p.test(text))) {
                    topicSkips[topic] = (topicSkips[topic] || 0) + 1;
                }
            }
        }
    }
    // High skip topics (at least 3 skips)
    const highSkipTopics = Object.entries(topicSkips)
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .map(([topic]) => topic);
    // High skip personas (> 50% skip rate with at least 5 samples)
    const highSkipPersonas = Object.entries(personaSkips)
        .filter(([, data]) => data.total >= 5 && data.skips / data.total > 0.5)
        .map(([personaId]) => personaId);
    return { highSkipTopics, highSkipPersonas };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const feedbackInsightsService = {
    generate: generateFeedbackInsights,
};
export default feedbackInsightsService;
//# sourceMappingURL=feedback-insights.js.map