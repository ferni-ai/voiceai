/**
 * Emotional Pattern Analysis
 *
 * Superhuman feature: Notice things about users that they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 * "When you talk about your boss, your whole energy shifts"
 *
 * Humans miss these patterns because they're self-absorbed or too close.
 * We can see the bigger picture and reflect it back gently.
 *
 * @module personality/pattern-analysis
 */
import { createLogger } from '../utils/safe-logger.js';
import { getEmotionalHistory, hasEnoughHistoryForPatterns, } from './emotional-data.js';
const log = createLogger({ module: 'PatternAnalysis' });
// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * Configuration constants for pattern detection
 */
export const PATTERN_CONFIG = {
    /** Minimum relevant data points to consider a correlation */
    MIN_RELEVANT_POINTS: 3,
    /** Correlation threshold to detect a pattern (60%) */
    CORRELATION_THRESHOLD: 0.6,
    /** High correlation threshold for immediate surfacing (80%) */
    HIGH_CORRELATION_THRESHOLD: 0.8,
    /** Minimum recent points to detect declining trend */
    MIN_RECENT_POINTS_FOR_TREND: 5,
    /** Minimum negative emotions in recent history to flag declining */
    MIN_NEGATIVE_FOR_DECLINE: 3,
    /** Minimum temporal pattern matches to surface */
    MIN_TEMPORAL_MATCHES: 2,
};
// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================
/**
 * Topic-emotion correlation patterns to look for
 */
const CORRELATION_PATTERNS = [
    {
        topicKeywords: ['work', 'job', 'boss', 'office', 'meeting', 'deadline'],
        emotionWatch: ['stress', 'anxiety', 'dread', 'overwhelm'],
        insightTemplate: "I've noticed you seem more stressed when work comes up lately",
    },
    {
        topicKeywords: ['mom', 'mother', 'dad', 'father', 'parent', 'family'],
        emotionWatch: ['guilt', 'obligation', 'sadness', 'frustration'],
        insightTemplate: "You've mentioned your {topic} a few times recently - is something on your mind?",
    },
    {
        topicKeywords: ['relationship', 'partner', 'dating', 'girlfriend', 'boyfriend'],
        emotionWatch: ['uncertainty', 'anxiety', 'loneliness', 'hurt'],
        insightTemplate: 'When relationships come up, I notice a shift in your energy',
    },
    {
        topicKeywords: ['money', 'bills', 'rent', 'financial', 'afford'],
        emotionWatch: ['stress', 'anxiety', 'shame', 'worry'],
        insightTemplate: 'Financial stuff seems to carry a lot of weight for you right now',
    },
    {
        topicKeywords: ['health', 'doctor', 'sick', 'body', 'sleep'],
        emotionWatch: ['worry', 'fear', 'frustration', 'exhaustion'],
        insightTemplate: 'Health has been on your mind - how are you really doing with that?',
    },
];
/**
 * Time-based patterns to look for
 */
const TEMPORAL_PATTERNS = [
    {
        dayOfWeek: 0, // Sunday
        timeOfDay: 'evening',
        emotionWatch: ['anxiety', 'dread', 'low'],
        insightTemplate: "Sunday evenings seem harder for you. Is that a pattern you've noticed?",
    },
    {
        dayOfWeek: 1, // Monday
        timeOfDay: 'morning',
        emotionWatch: ['stress', 'overwhelm', 'dread'],
        insightTemplate: "Monday mornings hit different for you, don't they?",
    },
    {
        dayOfWeek: 5, // Friday
        timeOfDay: 'afternoon',
        emotionWatch: ['relief', 'excited', 'tired'],
        insightTemplate: "Fridays seem to bring a shift for you. The week's weight lifting?",
    },
];
/**
 * Day names for human-readable pattern descriptions
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// ============================================================================
// IN-MEMORY PATTERN STORAGE
// ============================================================================
/** Detected patterns per user */
const detectedPatterns = new Map();
// ============================================================================
// PATTERN DETECTION
// ============================================================================
/**
 * Get time of day from hour
 */
function getTimeOfDay(hour) {
    if (hour < 12)
        return 'morning';
    if (hour < 18)
        return 'afternoon';
    return 'evening';
}
/**
 * Analyze for time-based emotional patterns
 */
function analyzeTemporalPatterns(userId, history, patterns) {
    // Group history by day+timeOfDay
    const temporalGroups = new Map();
    for (const dp of history) {
        const date = dp.timestamp;
        const dayOfWeek = date.getDay();
        const timeOfDay = getTimeOfDay(date.getHours());
        const key = `${dayOfWeek}_${timeOfDay}`;
        const group = temporalGroups.get(key) || [];
        group.push(dp);
        temporalGroups.set(key, group);
    }
    // Check each temporal pattern
    for (const temporalPattern of TEMPORAL_PATTERNS) {
        const key = `${temporalPattern.dayOfWeek}_${temporalPattern.timeOfDay}`;
        const group = temporalGroups.get(key);
        if (!group || group.length < PATTERN_CONFIG.MIN_RELEVANT_POINTS) {
            continue; // Not enough data for this time slot
        }
        // Check how many match the watched emotions
        const emotionMatches = group.filter((dp) => temporalPattern.emotionWatch.some((watched) => dp.emotion.toLowerCase().includes(watched) || watched.includes(dp.emotion.toLowerCase())));
        // If we have enough matches, it's a pattern
        if (emotionMatches.length >= PATTERN_CONFIG.MIN_TEMPORAL_MATCHES) {
            const correlation = emotionMatches.length / group.length;
            if (correlation >= PATTERN_CONFIG.CORRELATION_THRESHOLD) {
                const dayName = DAY_NAMES[temporalPattern.dayOfWeek];
                const matchedEmotions = [
                    ...new Set(emotionMatches.map((dp) => dp.emotion.toLowerCase())),
                ].slice(0, 3);
                patterns.push({
                    id: `pattern_${userId}_temporal_${key}`,
                    userId,
                    pattern: `${dayName} ${temporalPattern.timeOfDay} → ${matchedEmotions.join('/')}`,
                    evidence: emotionMatches.slice(-3).map((dp) => dp.context || dp.emotion),
                    trend: 'cyclical',
                    insight: temporalPattern.insightTemplate,
                    deliveryTiming: 'when_relevant',
                    confidence: correlation,
                    detectedAt: new Date(),
                    lastUpdated: new Date(),
                    surfacedToUser: false,
                });
                log.debug({
                    userId,
                    dayName,
                    timeOfDay: temporalPattern.timeOfDay,
                    correlation,
                    matches: emotionMatches.length,
                }, '⏰ Temporal pattern detected');
            }
        }
    }
}
/**
 * Find most common topic from data points
 */
function findMostCommonTopic(dataPoints, keywords) {
    const counts = new Map();
    for (const dp of dataPoints) {
        for (const topic of dp.topics) {
            const match = keywords.find((k) => topic.toLowerCase().includes(k));
            if (match) {
                counts.set(match, (counts.get(match) || 0) + 1);
            }
        }
    }
    let maxCount = 0;
    let mostCommon = keywords[0] ?? '';
    for (const [topic, count] of counts) {
        if (count > maxCount) {
            maxCount = count;
            mostCommon = topic;
        }
    }
    return mostCommon;
}
/**
 * Calculate average of numbers
 */
function average(numbers) {
    if (numbers.length === 0)
        return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}
/**
 * Analyze user's emotional history for patterns
 * Called automatically after recording new data points
 */
export function analyzeForPatterns(userId) {
    if (!hasEnoughHistoryForPatterns(userId))
        return;
    const history = getEmotionalHistory(userId);
    const patterns = [];
    // Check topic-emotion correlations
    for (const pattern of CORRELATION_PATTERNS) {
        const relevantPoints = history.filter((dp) => dp.topics.some((t) => pattern.topicKeywords.some((k) => t.toLowerCase().includes(k))));
        if (relevantPoints.length >= PATTERN_CONFIG.MIN_RELEVANT_POINTS) {
            const emotionalMatches = relevantPoints.filter((dp) => pattern.emotionWatch.includes(dp.emotion.toLowerCase()));
            const correlation = emotionalMatches.length / relevantPoints.length;
            if (correlation >= PATTERN_CONFIG.CORRELATION_THRESHOLD) {
                const mostCommonTopic = findMostCommonTopic(relevantPoints, pattern.topicKeywords);
                patterns.push({
                    id: `pattern_${userId}_${pattern.topicKeywords[0]}`,
                    userId,
                    pattern: `${mostCommonTopic} → ${pattern.emotionWatch.join('/')}`,
                    evidence: emotionalMatches.slice(-3).map((dp) => dp.context || dp.emotion),
                    trend: 'triggered',
                    triggers: [mostCommonTopic],
                    insight: pattern.insightTemplate.replace('{topic}', mostCommonTopic),
                    deliveryTiming: correlation >= PATTERN_CONFIG.HIGH_CORRELATION_THRESHOLD ? 'now' : 'when_relevant',
                    confidence: correlation,
                    detectedAt: new Date(),
                    lastUpdated: new Date(),
                    surfacedToUser: false,
                });
            }
        }
    }
    // Check for temporal patterns (Sunday evening anxiety, Monday morning dread, etc.)
    analyzeTemporalPatterns(userId, history, patterns);
    // Check for declining trend
    const minPointsForTrend = PATTERN_CONFIG.MIN_RECENT_POINTS_FOR_TREND * 2;
    if (history.length >= minPointsForTrend) {
        const recentSlice = PATTERN_CONFIG.MIN_RECENT_POINTS_FOR_TREND;
        const recentAvgIntensity = average(history.slice(-recentSlice).map((dp) => dp.intensity));
        const olderAvgIntensity = average(history.slice(-minPointsForTrend, -recentSlice).map((dp) => dp.intensity));
        const negativeEmotions = ['stress', 'anxiety', 'sadness', 'overwhelm', 'frustration'];
        const recentNegative = history
            .slice(-recentSlice)
            .filter((dp) => negativeEmotions.includes(dp.emotion.toLowerCase()));
        if (recentNegative.length >= PATTERN_CONFIG.MIN_NEGATIVE_FOR_DECLINE &&
            recentAvgIntensity > olderAvgIntensity) {
            patterns.push({
                id: `pattern_${userId}_declining`,
                userId,
                pattern: 'Increasing negative emotions',
                evidence: recentNegative.map((dp) => dp.context || dp.emotion),
                trend: 'declining',
                insight: "Things seem heavier lately. I'm here if you want to talk about it.",
                deliveryTiming: 'now',
                confidence: 0.7,
                detectedAt: new Date(),
                lastUpdated: new Date(),
                surfacedToUser: false,
            });
        }
    }
    // Store patterns
    if (patterns.length > 0) {
        const existingPatterns = detectedPatterns.get(userId) || [];
        // Merge with existing, don't duplicate
        for (const newPattern of patterns) {
            const existingIndex = existingPatterns.findIndex((p) => p.id === newPattern.id);
            const existing = existingPatterns[existingIndex];
            if (existing) {
                // Update existing
                existingPatterns[existingIndex] = {
                    ...existing,
                    ...newPattern,
                    surfacedToUser: existing.surfacedToUser,
                };
            }
            else {
                existingPatterns.push(newPattern);
            }
        }
        detectedPatterns.set(userId, existingPatterns);
        log.info({ userId, patternCount: patterns.length }, '🔮 Emotional patterns detected');
    }
}
// ============================================================================
// PATTERN RETRIEVAL
// ============================================================================
/**
 * Get patterns ready to surface to the user
 */
export function getPatternInsights(userId, options = {}) {
    const patterns = detectedPatterns.get(userId) || [];
    const maxCount = options.maxCount ?? 1;
    const onlyUnsurfaced = options.onlyUnsurfaced ?? true;
    let filtered = patterns.filter((p) => p.confidence >= 0.6);
    if (onlyUnsurfaced) {
        filtered = filtered.filter((p) => !p.surfacedToUser);
    }
    // Sort by confidence and delivery timing
    filtered.sort((a, b) => {
        if (a.deliveryTiming === 'now' && b.deliveryTiming !== 'now')
            return -1;
        if (b.deliveryTiming === 'now' && a.deliveryTiming !== 'now')
            return 1;
        return b.confidence - a.confidence;
    });
    return filtered.slice(0, maxCount);
}
/**
 * Mark a pattern as surfaced
 */
export function markPatternSurfaced(patternId, userId) {
    const patterns = detectedPatterns.get(userId);
    if (!patterns)
        return;
    const pattern = patterns.find((p) => p.id === patternId);
    if (pattern) {
        pattern.surfacedToUser = true;
        log.info({ userId, patternId }, '✅ Pattern marked as surfaced');
    }
}
/**
 * Format pattern insight for prompt injection
 */
export function formatPatternForPrompt(pattern) {
    return [
        '[🔮 PATTERN INSIGHT - SUPERHUMAN OBSERVATION]',
        '',
        "You've noticed something about this person:",
        '',
        `Pattern: ${pattern.pattern}`,
        `Evidence: ${pattern.evidence.join('; ')}`,
        `Insight to share: "${pattern.insight}"`,
        `Confidence: ${Math.round(pattern.confidence * 100)}%`,
        '',
        'This is SUPERHUMAN - noticing what they might not notice themselves.',
        'Deliver gently, as an observation, not a diagnosis.',
        'Frame it as curiosity: "I\'ve noticed..." not "You always..."',
    ].join('\n');
}
// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================
/**
 * Clear detected patterns for a user
 */
export function clearUserPatterns(userId) {
    detectedPatterns.delete(userId);
    log.debug({ userId }, 'Cleared patterns for user');
}
/**
 * Clear all detected patterns
 */
export function clearAllPatterns() {
    detectedPatterns.clear();
    log.info('Cleared all detected patterns');
}
// ============================================================================
// EXPORTS
// ============================================================================
export { detectedPatterns };
//# sourceMappingURL=pattern-analysis.js.map