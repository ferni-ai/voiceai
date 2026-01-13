/**
 * Insight Broker - Proactive Intelligence V3.2
 *
 * The brain that monitors all semantic systems and surfaces insights
 * at the right moment. This is what makes Ferni say "I noticed..." and
 * "Remember when you mentioned...?"
 *
 * Key capabilities:
 * - Monitor all 6 semantic systems for high-priority insights
 * - Push relevant insights to agent at the right moment
 * - Respect timing intelligence (no heavy stuff late at night)
 * - Track which insights have been surfaced (don't repeat)
 *
 * @module services/superhuman/semantic-intelligence/insight-broker
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
const log = createLogger({ module: 'insight-broker' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    MAX_INSIGHTS_PER_USER: 50,
    MAX_INSIGHTS_TO_SURFACE: 3, // Per session
    MIN_CONFIDENCE: 0.5,
    INSIGHT_TTL_DAYS: 30,
    // Priority weights for sorting
    PRIORITY_WEIGHTS: {
        critical: 100,
        high: 50,
        medium: 20,
        low: 5,
    },
    // Time-based adjustments
    LATE_NIGHT_HOURS: [22, 23, 0, 1, 2, 3, 4, 5],
    MORNING_HOURS: [6, 7, 8, 9],
};
// ============================================================================
// CACHE
// ============================================================================
const insightCache = new Map();
const surfacedThisSession = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Create a new proactive insight.
 *
 * Call this when any semantic system detects something worth surfacing.
 */
export async function createInsight(userId, insight) {
    const now = new Date();
    const id = `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const proactiveInsight = {
        id,
        userId,
        source: insight.source,
        priority: insight.priority,
        insight: insight.insight,
        context: insight.context,
        surfaceWhen: insight.surfaceWhen,
        surfaceAfter: insight.surfaceAfter,
        expiresAt: insight.expiresAt ?? new Date(now.getTime() + CONFIG.INSIGHT_TTL_DAYS * 24 * 60 * 60 * 1000),
        created: now,
        surfaced: false,
        dismissed: false,
        relatedEntities: insight.relatedEntities,
        confidence: insight.confidence ?? 0.7,
    };
    // Save to Firestore
    await saveInsight(userId, proactiveInsight);
    // Update cache
    const cached = insightCache.get(userId);
    if (cached) {
        cached.insights.push(proactiveInsight);
        // Trim if too many
        if (cached.insights.length > CONFIG.MAX_INSIGHTS_PER_USER) {
            cached.insights = cached.insights
                .filter((i) => !i.surfaced && !i.dismissed)
                .slice(-CONFIG.MAX_INSIGHTS_PER_USER);
        }
    }
    log.debug({ userId, source: insight.source, priority: insight.priority }, '💡 Insight created');
    return proactiveInsight;
}
/**
 * Get insights to surface for the current context.
 *
 * Call this at session start or when context changes significantly.
 */
export async function getInsightsToSurface(userId, context) {
    const insights = await loadInsights(userId);
    const now = new Date();
    const hour = context.hourOfDay ?? now.getHours();
    // Get already surfaced this session
    const surfaced = surfacedThisSession.get(userId) ?? new Set();
    // Filter and score insights
    const candidates = insights
        .filter((insight) => {
        // Not already surfaced
        if (insight.surfaced || insight.dismissed)
            return false;
        if (surfaced.has(insight.id))
            return false;
        // Not expired
        if (insight.expiresAt && now > insight.expiresAt)
            return false;
        // Not too early
        if (insight.surfaceAfter && now < insight.surfaceAfter)
            return false;
        // Minimum confidence
        if (insight.confidence < CONFIG.MIN_CONFIDENCE)
            return false;
        // Check triggers
        return matchesTriggers(insight, context);
    })
        .map((insight) => ({
        insight,
        score: scoreInsight(insight, context, hour),
    }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);
    // Take top N
    const toSurface = candidates
        .slice(0, CONFIG.MAX_INSIGHTS_TO_SURFACE)
        .map(({ insight }) => insight);
    // Mark as surfaced this session
    for (const insight of toSurface) {
        surfaced.add(insight.id);
    }
    surfacedThisSession.set(userId, surfaced);
    log.debug({ userId, count: toSurface.length, total: insights.length }, '🎯 Insights to surface');
    return toSurface;
}
/**
 * Mark an insight as surfaced.
 */
export async function markInsightSurfaced(userId, insightId) {
    const insights = await loadInsights(userId);
    const insight = insights.find((i) => i.id === insightId);
    if (insight) {
        insight.surfaced = true;
        insight.surfacedAt = new Date();
        await saveInsight(userId, insight);
        log.debug({ userId, insightId }, '✅ Insight marked as surfaced');
    }
}
/**
 * Dismiss an insight (user indicated not interested).
 */
export async function dismissInsight(userId, insightId) {
    const insights = await loadInsights(userId);
    const insight = insights.find((i) => i.id === insightId);
    if (insight) {
        insight.dismissed = true;
        await saveInsight(userId, insight);
        log.debug({ userId, insightId }, '🚫 Insight dismissed');
    }
}
/**
 * Get pending insights count for a user.
 */
export async function getPendingInsightCount(userId) {
    const insights = await loadInsights(userId);
    return insights.filter((i) => !i.surfaced && !i.dismissed).length;
}
// ============================================================================
// TRIGGER MATCHING
// ============================================================================
function matchesTriggers(insight, context) {
    // If no triggers, always match
    if (!insight.surfaceWhen || insight.surfaceWhen.length === 0) {
        return true;
    }
    // ANY trigger match is sufficient
    return insight.surfaceWhen.some((trigger) => {
        switch (trigger.type) {
            case 'session_start':
                return context.isSessionStart === true;
            case 'topic':
                if (!context.currentTopic || !trigger.value)
                    return false;
                return trigger.condition === 'contains'
                    ? context.currentTopic.toLowerCase().includes(trigger.value.toLowerCase())
                    : context.currentTopic.toLowerCase() === trigger.value.toLowerCase();
            case 'person':
                if (!context.currentPerson || !trigger.value)
                    return false;
                return context.currentPerson.toLowerCase().includes(trigger.value.toLowerCase());
            case 'emotion':
                if (!context.currentEmotion || !trigger.value)
                    return false;
                return context.currentEmotion.toLowerCase().includes(trigger.value.toLowerCase());
            case 'keyword':
                // Would need full text to check
                return false;
            default:
                return false;
        }
    });
}
// ============================================================================
// SCORING
// ============================================================================
function scoreInsight(insight, context, hourOfDay) {
    let score = CONFIG.PRIORITY_WEIGHTS[insight.priority];
    // Confidence multiplier
    score *= insight.confidence;
    // Recency boost (newer insights score higher)
    const ageHours = (Date.now() - insight.created.getTime()) / (1000 * 60 * 60);
    if (ageHours < 24)
        score *= 1.5;
    else if (ageHours < 72)
        score *= 1.2;
    // Context relevance boost
    if (insight.relatedEntities) {
        if (context.currentTopic && insight.relatedEntities.includes(context.currentTopic)) {
            score *= 1.5;
        }
        if (context.currentPerson &&
            insight.relatedEntities.some((e) => e.toLowerCase().includes(context.currentPerson.toLowerCase()))) {
            score *= 1.8;
        }
    }
    // Time-based adjustments
    if (CONFIG.LATE_NIGHT_HOURS.includes(hourOfDay)) {
        // Reduce heavy insights late at night
        if (insight.priority === 'critical' || insight.priority === 'high') {
            score *= 0.3;
        }
    }
    return score;
}
// ============================================================================
// INSIGHT GENERATORS (called by semantic systems)
// ============================================================================
/**
 * Generate insight from correlation discovery.
 */
export async function generateCorrelationInsight(userId, correlation) {
    if (correlation.strength < 0.6)
        return null;
    return createInsight(userId, {
        source: 'correlation',
        priority: correlation.strength > 0.8 ? 'high' : 'medium',
        insight: `I've noticed a pattern: ${correlation.description}`,
        context: `${correlation.pattern1} → ${correlation.pattern2}`,
        surfaceWhen: [
            { type: 'topic', value: correlation.pattern1, condition: 'contains' },
            { type: 'topic', value: correlation.pattern2, condition: 'contains' },
        ],
        relatedEntities: [correlation.pattern1, correlation.pattern2],
        confidence: correlation.strength,
    });
}
/**
 * Generate insight from emotional trajectory.
 */
export async function generateTrajectoryInsight(userId, trajectory) {
    const insight = trajectory.trend === 'rising'
        ? `Your ${trajectory.emotion} has been building over ${trajectory.duration}${trajectory.trigger ? ` around ${trajectory.trigger}` : ''}.`
        : trajectory.trend === 'falling'
            ? `I've noticed your ${trajectory.emotion} easing over ${trajectory.duration}. That's real progress.`
            : null;
    if (!insight)
        return null;
    return createInsight(userId, {
        source: 'trajectory',
        priority: trajectory.trend === 'rising' ? 'high' : 'medium',
        insight,
        context: `${trajectory.emotion} ${trajectory.trend} over ${trajectory.duration}`,
        surfaceWhen: [
            { type: 'emotion', value: trajectory.emotion, condition: 'contains' },
            ...(trajectory.trigger
                ? [{ type: 'topic', value: trajectory.trigger, condition: 'contains' }]
                : []),
        ],
        relatedEntities: trajectory.trigger ? [trajectory.trigger] : undefined,
        confidence: 0.75,
    });
}
/**
 * Generate insight from advice outcome.
 */
export async function generateCounterfactualInsight(userId, outcome) {
    if (outcome.result === 'neutral')
        return null;
    const insight = outcome.followed
        ? outcome.result === 'positive'
            ? `Remember when you tried ${outcome.advice}? That really worked for you.`
            : `Last time you tried ${outcome.advice}, it didn't go as hoped. Let's think of another approach.`
        : outcome.result === 'negative'
            ? `I remember suggesting ${outcome.advice}. I wonder if trying that might help now.`
            : null;
    if (!insight)
        return null;
    return createInsight(userId, {
        source: 'counterfactual',
        priority: outcome.result === 'negative' ? 'high' : 'medium',
        insight,
        context: outcome.lesson,
        surfaceWhen: [{ type: 'session_start' }],
        confidence: 0.8,
    });
}
/**
 * Generate insight from growth observation.
 */
export async function generateGrowthInsight(userId, growth) {
    return createInsight(userId, {
        source: 'growth',
        priority: 'medium',
        insight: `I've noticed something: ${growth.change} in how you approach ${growth.area} over the past ${growth.timeframe}.`,
        context: `Growth in ${growth.area}`,
        surfaceWhen: [{ type: 'topic', value: growth.area, condition: 'contains' }],
        relatedEntities: [growth.area],
        confidence: 0.7,
    });
}
/**
 * Generate insight from cross-session connection.
 */
export async function generateThreadingInsight(userId, thread) {
    if (thread.sessionGap < 3)
        return null; // Only surface non-obvious connections
    return createInsight(userId, {
        source: 'threading',
        priority: 'high',
        insight: `Something just clicked for me. ${thread.connection}`,
        context: `Connected ${thread.topic1} (session ${thread.sessionGap} ago) with ${thread.topic2}`,
        surfaceWhen: [
            { type: 'topic', value: thread.topic1, condition: 'contains' },
            { type: 'topic', value: thread.topic2, condition: 'contains' },
        ],
        relatedEntities: [thread.topic1, thread.topic2],
        confidence: 0.85,
    });
}
// ============================================================================
// FORMAT FOR PROMPT
// ============================================================================
/**
 * Format insights for LLM injection.
 */
export function formatInsightsForPrompt(insights) {
    if (insights.length === 0)
        return '';
    const lines = [
        '═══════════════════════════════════════════════════════════',
        'PROACTIVE INSIGHTS - Things to potentially surface naturally',
        '═══════════════════════════════════════════════════════════',
        '',
    ];
    for (const insight of insights) {
        lines.push(`[${insight.priority.toUpperCase()}] ${insight.insight}`);
        lines.push(`  Context: ${insight.context}`);
        lines.push('');
    }
    lines.push("NOTE: Weave these naturally into conversation. Don't force them.");
    lines.push('═══════════════════════════════════════════════════════════');
    return lines.join('\n');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
async function loadInsights(userId) {
    // Check cache first
    const cached = insightCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt.getTime() < 5 * 60 * 1000) {
        return cached.insights;
    }
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('proactive_insights')
            .where('dismissed', '==', false)
            .orderBy('created', 'desc')
            .limit(CONFIG.MAX_INSIGHTS_PER_USER)
            .get();
        const insights = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                created: data.created?.toDate?.() ?? new Date(data.created),
                expiresAt: data.expiresAt?.toDate?.() ?? (data.expiresAt ? new Date(data.expiresAt) : undefined),
                surfaceAfter: data.surfaceAfter?.toDate?.() ??
                    (data.surfaceAfter ? new Date(data.surfaceAfter) : undefined),
                surfacedAt: data.surfacedAt?.toDate?.() ?? (data.surfacedAt ? new Date(data.surfacedAt) : undefined),
            };
        });
        // Update cache
        insightCache.set(cleanForFirestore(userId), {
            userId,
            insights,
            fetchedAt: new Date(),
        });
        return insights;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load insights');
        return [];
    }
}
async function saveInsight(userId, insight) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('proactive_insights')
            .doc(insight.id)
            .set(cleanForFirestore(insight));
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save insight');
    }
}
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
/**
 * Clear session-scoped data.
 */
export function clearSessionInsights(userId) {
    surfacedThisSession.delete(userId);
}
/**
 * Clear cache for a user.
 */
export function clearInsightCache(userId) {
    if (userId) {
        insightCache.delete(userId);
        surfacedThisSession.delete(userId);
    }
    else {
        insightCache.clear();
        surfacedThisSession.clear();
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const insightBroker = {
    create: createInsight,
    getToSurface: getInsightsToSurface,
    markSurfaced: markInsightSurfaced,
    dismiss: dismissInsight,
    getPendingCount: getPendingInsightCount,
    format: formatInsightsForPrompt,
    clearSession: clearSessionInsights,
    clearCache: clearInsightCache,
    // Generators
    fromCorrelation: generateCorrelationInsight,
    fromTrajectory: generateTrajectoryInsight,
    fromCounterfactual: generateCounterfactualInsight,
    fromGrowth: generateGrowthInsight,
    fromThreading: generateThreadingInsight,
};
export default insightBroker;
//# sourceMappingURL=insight-broker.js.map