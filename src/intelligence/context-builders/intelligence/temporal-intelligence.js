/**
 * Temporal Intelligence Context Builder
 *
 * "Better Than Human" - We know your rhythms, your patterns, your important moments.
 *
 * This builder synthesizes:
 * - Time of day patterns (morning person? night owl?)
 * - Day of week patterns (rough Mondays? better Fridays?)
 * - Seasonal patterns (winter blues? summer energy?)
 * - Life rhythm milestones (streaks, anniversaries)
 * - Important dates approaching (birthdays, events)
 *
 * Philosophy: Use temporal awareness to show up at the right moments
 * with the right energy. "I know Tuesday mornings are hard for you."
 *
 * PERFORMANCE:
 * - Session-scoped cache (2 min TTL) avoids repeated Firestore reads
 * - Pattern writing is rate-limited (every 5 turns)
 * - Target: <5ms cache hit, <100ms cache miss
 *
 * @module TemporalIntelligenceContext
 */
import { createStandardInjection, createHighInjection, registerContextBuilder, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { EdgeCache } from '../../../services/cache/edge-cache.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
// Use dynamic import for Firestore to avoid hard dependency
async function getFirestoreDb() {
    try {
        const { getFirestore } = await import('firebase-admin/firestore');
        return getFirestore();
    }
    catch {
        return null;
    }
}
const log = createLogger({ module: 'TemporalIntelligence' });
// ============================================================================
// PERFORMANCE: Session-scoped cache
// ============================================================================
// Cache temporal patterns per user (2 min TTL - patterns don't change often)
const temporalCache = new EdgeCache({
    maxSize: 100,
    defaultTtlMs: 120000, // 2 minutes
    staleWhileRevalidate: true,
    staleTtlMs: 300000, // 5 minute stale grace period
});
function getCurrentTemporalContext() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const month = now.getMonth();
    let timeOfDay;
    if (hour >= 5 && hour < 8)
        timeOfDay = 'early_morning';
    else if (hour >= 8 && hour < 12)
        timeOfDay = 'morning';
    else if (hour >= 12 && hour < 14)
        timeOfDay = 'midday';
    else if (hour >= 14 && hour < 17)
        timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21)
        timeOfDay = 'evening';
    else if (hour >= 21 || hour < 2)
        timeOfDay = 'night';
    else
        timeOfDay = 'late_night';
    const days = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
    ];
    const dayOfWeek = days[day];
    let season;
    if (month >= 2 && month <= 4)
        season = 'spring';
    else if (month >= 5 && month <= 7)
        season = 'summer';
    else if (month >= 8 && month <= 10)
        season = 'fall';
    else
        season = 'winter';
    return {
        timeOfDay,
        dayOfWeek,
        season,
        isWeekend: day === 0 || day === 6,
        isLateNight: hour >= 23 || hour < 5,
        hourOfDay: hour,
        dayOfMonth: now.getDate(),
        monthOfYear: month + 1,
    };
}
async function getUserTemporalPatterns(userId) {
    const cacheKey = `temporal:${userId}`;
    const startTime = Date.now();
    // Check cache first (PERFORMANCE: saves 50-100ms on hit)
    const cached = temporalCache.get(cacheKey);
    if (cached) {
        log.debug({ userId, durationMs: Date.now() - startTime, cacheHit: true }, '⚡ Temporal cache hit');
        return cached;
    }
    try {
        const db = await getFirestoreDb();
        if (!db)
            return {};
        const doc = await db.collection('bogle_users').doc(userId).get();
        if (!doc.exists)
            return {};
        const data = doc.data();
        const temporalPatterns = data?.temporalPatterns;
        const result = {
            preferredTimes: temporalPatterns?.preferredTimes,
            dayPatterns: temporalPatterns?.dayPatterns,
            seasonalMood: temporalPatterns?.seasonalMood,
            specialDays: data?.importantDates || [],
        };
        // Store in cache for subsequent turns (PERFORMANCE: avoids repeated Firestore reads)
        temporalCache.set(cacheKey, result);
        log.debug({ userId, durationMs: Date.now() - startTime, cacheHit: false }, '📊 Temporal data loaded & cached');
        return result;
    }
    catch (err) {
        log.debug({ error: String(err) }, 'Could not load temporal patterns');
        return {};
    }
}
function checkUpcomingDates(patterns, temporal) {
    const upcoming = [];
    const today = new Date();
    if (!patterns.specialDays)
        return upcoming;
    for (const specialDay of patterns.specialDays) {
        const thisYear = today.getFullYear();
        let targetDate = new Date(thisYear, specialDay.month - 1, specialDay.day);
        // If the date has passed this year, check next year
        if (targetDate < today) {
            targetDate = new Date(thisYear + 1, specialDay.month - 1, specialDay.day);
        }
        const diffMs = targetDate.getTime() - today.getTime();
        const daysUntil = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        // Surface dates within 14 days
        if (daysUntil <= 14) {
            upcoming.push({
                type: specialDay.type,
                description: specialDay.description,
                daysUntil,
                isToday: daysUntil === 0,
                wantsAcknowledgment: specialDay.wantsAcknowledgment !== false,
            });
        }
    }
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}
function generateTemporalInsights(patterns, temporal, upcomingDates) {
    const insights = [];
    // 1. TODAY dates - highest priority
    for (const date of upcomingDates.filter((d) => d.isToday && d.wantsAcknowledgment)) {
        insights.push({
            type: 'date_today',
            message: `[IMPORTANT DATE TODAY] ${date.description}. This matters to them. Acknowledge it warmly at the right moment.`,
            priority: 'high',
        });
    }
    // 2. UPCOMING dates within 3 days - high priority
    for (const date of upcomingDates.filter((d) => !d.isToday && d.daysUntil <= 3 && d.wantsAcknowledgment)) {
        insights.push({
            type: 'date_upcoming',
            message: `[UPCOMING DATE] ${date.description} is in ${date.daysUntil} day${date.daysUntil > 1 ? 's' : ''}. You might mention it if relevant.`,
            priority: 'high',
        });
    }
    // 3. Late night awareness
    if (temporal.isLateNight) {
        insights.push({
            type: 'time_aware',
            message: `[LATE NIGHT] It's ${temporal.hourOfDay > 12 ? temporal.hourOfDay - 12 : temporal.hourOfDay}${temporal.hourOfDay >= 12 ? 'pm' : 'am'}. Late night conversations often carry weight. Be present and gentle. They're here for a reason.`,
            priority: 'medium',
        });
    }
    // 4. Day of week patterns
    if (patterns.dayPatterns?.hardDays?.includes(temporal.dayOfWeek)) {
        insights.push({
            type: 'day_aware',
            message: `[TEMPORAL PATTERN] ${capitalize(temporal.dayOfWeek)}s tend to be hard for them. Extra gentleness might help.`,
            priority: 'medium',
        });
    }
    // 5. Seasonal awareness
    const seasonalPattern = patterns.seasonalMood?.find((s) => s.season === temporal.season);
    if (seasonalPattern &&
        seasonalPattern.moodTrend === 'worse' &&
        seasonalPattern.confidence > 0.6) {
        insights.push({
            type: 'season_aware',
            message: `[SEASONAL PATTERN] They tend to have a harder time in ${temporal.season}. Be aware of potential seasonal mood shifts.`,
            priority: 'low',
        });
    }
    // 6. Weekend vs weekday energy
    if (temporal.isWeekend &&
        patterns.dayPatterns?.bestDays?.some((d) => d === 'saturday' || d === 'sunday')) {
        insights.push({
            type: 'day_aware',
            message: `[WEEKEND MODE] Weekends are usually their better days. Match that energy.`,
            priority: 'low',
        });
    }
    // 7. Early morning check-in
    if (temporal.timeOfDay === 'early_morning') {
        insights.push({
            type: 'time_aware',
            message: `[EARLY MORNING] They're up early. Early risers often appreciate acknowledgment of that dedication.`,
            priority: 'low',
        });
    }
    return insights;
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
// ============================================================================
// BUILDER
// ============================================================================
async function buildTemporalIntelligenceContext(input) {
    const { services } = input;
    const userId = services?.userId;
    if (!userId)
        return [];
    // Get current temporal context
    const temporal = getCurrentTemporalContext();
    // Get user's temporal patterns
    const patterns = await getUserTemporalPatterns(userId);
    // Check for upcoming dates
    const upcomingDates = checkUpcomingDates(patterns, temporal);
    // Generate insights
    const insights = generateTemporalInsights(patterns, temporal, upcomingDates);
    if (insights.length === 0)
        return [];
    // Build injections
    const injections = [];
    // High priority insights get their own injection
    const highPriority = insights.filter((i) => i.priority === 'high');
    for (const insight of highPriority) {
        injections.push(createHighInjection(`temporal_${insight.type}`, insight.message, { category: 'awareness' }));
        log.info({ userId, type: insight.type }, '⏰ BETTER-THAN-HUMAN: High-priority temporal awareness');
    }
    // Bundle medium/low priority into one injection
    const otherInsights = insights.filter((i) => i.priority !== 'high');
    if (otherInsights.length > 0) {
        const bundledMessage = otherInsights.map((i) => i.message).join('\n');
        injections.push(createStandardInjection('temporal_context', bundledMessage, { category: 'awareness' }));
    }
    return injections;
}
// ============================================================================
// PATTERN LEARNING (Call from turn handler)
// ============================================================================
/**
 * Update temporal patterns based on conversation
 * Call this after each conversation to learn patterns
 */
async function learnTemporalPatternInternal(userId, _sessionContext) {
    try {
        const db = await getFirestoreDb();
        if (!db)
            return;
        const temporal = getCurrentTemporalContext();
        // Update conversation-by-day counter
        const userRef = db.collection('bogle_users').doc(userId);
        const doc = await userRef.get();
        const docData = doc.data();
        const existingPatterns = docData?.temporalPatterns || {};
        const dayPatternsData = existingPatterns.dayPatterns;
        const dayStats = dayPatternsData?.conversationsByDay || {};
        dayStats[temporal.dayOfWeek] = (dayStats[temporal.dayOfWeek] || 0) + 1;
        // Determine most active time
        const timeStats = existingPatterns.timeStats || {};
        timeStats[temporal.timeOfDay] = (timeStats[temporal.timeOfDay] || 0) + 1;
        // Find peak time
        let mostActive = 'morning';
        let maxCount = 0;
        for (const [time, count] of Object.entries(timeStats)) {
            if (count > maxCount) {
                mostActive = time;
                maxCount = count;
            }
        }
        await userRef.set(cleanForFirestore({
            temporalPatterns: {
                ...existingPatterns,
                dayPatterns: {
                    ...dayPatternsData,
                    conversationsByDay: dayStats,
                },
                timeStats,
                preferredTimes: {
                    mostActive,
                    peakEnergy: mostActive,
                    preferenceStrength: Math.min(1, maxCount / 10),
                },
                lastUpdated: new Date(),
            },
        }), { merge: true });
        log.debug({ userId, timeOfDay: temporal.timeOfDay, dayOfWeek: temporal.dayOfWeek }, 'Temporal pattern learned');
    }
    catch (err) {
        log.debug({ error: String(err) }, 'Could not learn temporal pattern');
    }
}
// ============================================================================
// REGISTRATION
// ============================================================================
registerContextBuilder({
    name: 'temporal-intelligence',
    description: 'Surfaces temporal awareness: time patterns, upcoming dates (Better Than Human)',
    priority: 25, // Early in pipeline for awareness
    category: BuilderCategory.HUMANIZING,
    build: buildTemporalIntelligenceContext,
});
export { buildTemporalIntelligenceContext, learnTemporalPatternInternal as learnTemporalPattern, getCurrentTemporalContext, };
//# sourceMappingURL=temporal-intelligence.js.map