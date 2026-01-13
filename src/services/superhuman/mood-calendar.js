/**
 * Mood Calendar - Better Than Human Pattern Recognition
 *
 * Predicts emotional states based on historical patterns:
 * - Day of week patterns ("You tend to feel anxious on Sundays")
 * - Time of day patterns ("Mornings are harder for you")
 * - Seasonal patterns ("Winter affects your mood")
 * - Event-based patterns ("After social events, you need recovery time")
 *
 * WHY IT'S SUPERHUMAN: No friend tracks 4 months of mood patterns
 * to predict your feelings with statistical confidence.
 *
 * @module services/superhuman/mood-calendar
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { onMoodPatternChange } from '../data-layer/hooks/superhuman-hooks.js';
const log = createLogger({ module: 'MoodCalendar' });
// ============================================================================
// CONSTANTS
// ============================================================================
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MOOD_SCORES = {
    joyful: 1.0,
    hopeful: 0.8,
    content: 0.7,
    calm: 0.6,
    neutral: 0.5,
    anxious: 0.3,
    frustrated: 0.3,
    sad: 0.2,
    overwhelmed: 0.2,
    exhausted: 0.1,
};
// ============================================================================
// MOOD TRACKING
// ============================================================================
/**
 * Record a mood entry for pattern analysis.
 */
export async function recordMoodEntry(userId, mood, intensity, context, triggers) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'Firestore not available, skipping mood entry');
        return;
    }
    const now = new Date();
    const entry = {
        userId,
        mood,
        intensity: Math.max(0, Math.min(1, intensity)),
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
        month: now.getMonth(),
        dayOfMonth: now.getDate(),
        timestamp: Date.now(),
        context,
        triggers,
    };
    try {
        const docRef = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('mood_calendar')
            .add(cleanForFirestore(entry));
        // Index to semantic memory for pattern detection
        void onMoodPatternChange(userId, docRef.id, {
            mood: entry.mood,
            intensity: entry.intensity,
            dayOfWeek: entry.dayOfWeek,
            hourOfDay: entry.hourOfDay,
            context: entry.context,
        });
        log.debug({ userId, mood, dayOfWeek: entry.dayOfWeek }, 'Recorded mood entry');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to record mood entry');
    }
}
/**
 * Load mood entries for a user.
 */
export async function loadMoodEntries(userId, daysBack = 90) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('mood_calendar')
            .where('timestamp', '>', cutoff)
            .orderBy('timestamp', 'desc')
            .limit(500)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load mood entries');
        return [];
    }
}
// ============================================================================
// PATTERN DETECTION
// ============================================================================
/**
 * Detect mood patterns from historical data.
 */
export function detectMoodPatterns(entries) {
    if (entries.length < 10)
        return [];
    const patterns = [];
    // Day of week patterns
    const byDayOfWeek = new Map();
    for (const entry of entries) {
        const existing = byDayOfWeek.get(entry.dayOfWeek) || [];
        existing.push(entry);
        byDayOfWeek.set(entry.dayOfWeek, existing);
    }
    for (const [day, dayEntries] of byDayOfWeek.entries()) {
        if (dayEntries.length < 3)
            continue;
        const avgScore = dayEntries.reduce((sum, e) => sum + MOOD_SCORES[e.mood], 0) / dayEntries.length;
        const overallAvg = entries.reduce((sum, e) => sum + MOOD_SCORES[e.mood], 0) / entries.length;
        // Check for significantly different days
        if (avgScore < overallAvg - 0.15) {
            patterns.push({
                pattern: `${DAY_NAMES[day]}_challenging`,
                confidence: Math.min(dayEntries.length / 10, 1),
                occurrences: dayEntries.length,
                description: `${DAY_NAMES[day]}s tend to be more challenging for you`,
                recommendation: `Consider scheduling lighter activities or self-care on ${DAY_NAMES[day]}s`,
            });
        }
        else if (avgScore > overallAvg + 0.15) {
            patterns.push({
                pattern: `${DAY_NAMES[day]}_positive`,
                confidence: Math.min(dayEntries.length / 10, 1),
                occurrences: dayEntries.length,
                description: `${DAY_NAMES[day]}s are typically your best days emotionally`,
            });
        }
    }
    // Time of day patterns
    const morningEntries = entries.filter((e) => e.hourOfDay >= 5 && e.hourOfDay < 12);
    const afternoonEntries = entries.filter((e) => e.hourOfDay >= 12 && e.hourOfDay < 17);
    const eveningEntries = entries.filter((e) => e.hourOfDay >= 17 && e.hourOfDay < 22);
    const nightEntries = entries.filter((e) => e.hourOfDay >= 22 || e.hourOfDay < 5);
    const timeBlocks = [
        { name: 'Mornings', entries: morningEntries, range: '5am-12pm' },
        { name: 'Afternoons', entries: afternoonEntries, range: '12pm-5pm' },
        { name: 'Evenings', entries: eveningEntries, range: '5pm-10pm' },
        { name: 'Late nights', entries: nightEntries, range: '10pm-5am' },
    ];
    for (const block of timeBlocks) {
        if (block.entries.length < 5)
            continue;
        const avgScore = block.entries.reduce((sum, e) => sum + MOOD_SCORES[e.mood], 0) / block.entries.length;
        const overallAvg = entries.reduce((sum, e) => sum + MOOD_SCORES[e.mood], 0) / entries.length;
        if (avgScore < overallAvg - 0.12) {
            patterns.push({
                pattern: `${block.name.toLowerCase()}_challenging`,
                confidence: Math.min(block.entries.length / 15, 1),
                occurrences: block.entries.length,
                description: `${block.name} (${block.range}) tend to be harder for you`,
                recommendation: `Schedule demanding tasks outside of ${block.name.toLowerCase()}`,
            });
        }
    }
    // Sunday night anxiety pattern (common)
    const sundayEvenings = entries.filter((e) => e.dayOfWeek === 0 && e.hourOfDay >= 17);
    if (sundayEvenings.length >= 3) {
        const anxiousCount = sundayEvenings.filter((e) => e.mood === 'anxious' || e.mood === 'overwhelmed').length;
        if (anxiousCount / sundayEvenings.length > 0.5) {
            patterns.push({
                pattern: 'sunday_scaries',
                confidence: sundayEvenings.length / 8,
                occurrences: anxiousCount,
                description: 'You experience "Sunday scaries" - anticipatory anxiety before the work week',
                recommendation: 'Try a calming Sunday evening routine, or plan something enjoyable for Monday morning',
            });
        }
    }
    return patterns.sort((a, b) => b.confidence - a.confidence);
}
/**
 * Predict mood for a specific time.
 */
export function predictMood(entries, targetDayOfWeek, targetHourOfDay) {
    // Find similar entries
    const similarEntries = entries.filter((e) => {
        const dayMatch = e.dayOfWeek === targetDayOfWeek;
        const hourDiff = Math.abs(e.hourOfDay - targetHourOfDay);
        const hourClose = hourDiff <= 2 || hourDiff >= 22; // Handle wrap-around
        return dayMatch && hourClose;
    });
    if (similarEntries.length < 2)
        return null;
    // Find most common mood
    const moodCounts = new Map();
    for (const entry of similarEntries) {
        moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
    }
    let predictedMood = 'neutral';
    let maxCount = 0;
    for (const [mood, count] of moodCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            predictedMood = mood;
        }
    }
    const confidence = Math.min(similarEntries.length / 8, 0.9);
    return {
        dayOfWeek: targetDayOfWeek,
        hourOfDay: targetHourOfDay,
        predictedMood,
        confidence,
        historicalBasis: `Based on ${similarEntries.length} similar ${DAY_NAMES[targetDayOfWeek]} conversations`,
        recommendation: MOOD_SCORES[predictedMood] < 0.4
            ? 'Consider scheduling support or self-care during this time'
            : undefined,
    };
}
// ============================================================================
// SUMMARY & CONTEXT
// ============================================================================
/**
 * Get complete mood calendar summary.
 */
export async function getMoodCalendarSummary(userId) {
    const entries = await loadMoodEntries(userId, 90);
    if (entries.length < 10) {
        return {
            bestTimes: [],
            challengingTimes: [],
            patterns: [],
            predictions: [],
        };
    }
    const patterns = detectMoodPatterns(entries);
    // Calculate best and challenging times
    const timeSlots = new Map();
    for (const entry of entries) {
        const hourRange = entry.hourOfDay < 6
            ? 'night'
            : entry.hourOfDay < 12
                ? 'morning'
                : entry.hourOfDay < 17
                    ? 'afternoon'
                    : entry.hourOfDay < 22
                        ? 'evening'
                        : 'night';
        const key = `${entry.dayOfWeek}-${hourRange}`;
        const existing = timeSlots.get(key) || { scores: [], entries: 0 };
        existing.scores.push(MOOD_SCORES[entry.mood]);
        existing.entries++;
        timeSlots.set(key, existing);
    }
    const timeData = [];
    for (const [key, data] of timeSlots.entries()) {
        if (data.entries < 2)
            continue;
        const [dayStr, range] = key.split('-');
        const avgMood = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        timeData.push({ day: parseInt(dayStr), range, avgMood, count: data.entries });
    }
    const sorted = timeData.sort((a, b) => b.avgMood - a.avgMood);
    const bestTimes = sorted.slice(0, 3).map((t) => ({
        dayOfWeek: t.day,
        hourRange: t.range,
        avgMood: t.avgMood,
    }));
    const challengingTimes = sorted
        .slice(-3)
        .reverse()
        .map((t) => ({
        dayOfWeek: t.day,
        hourRange: t.range,
        avgMood: t.avgMood,
        suggestion: `Consider lighter activities on ${DAY_NAMES[t.day]} ${t.range}`,
    }));
    // Generate predictions for next 7 days
    const predictions = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + i);
        const dayOfWeek = futureDate.getDay();
        // Predict for key hours
        for (const hour of [9, 14, 20]) {
            const prediction = predictMood(entries, dayOfWeek, hour);
            if (prediction && prediction.confidence > 0.3) {
                predictions.push(prediction);
            }
        }
    }
    return {
        bestTimes,
        challengingTimes,
        patterns,
        predictions: predictions.slice(0, 10),
    };
}
/**
 * Build context for LLM injection.
 */
export async function buildMoodCalendarContext(userId) {
    const summary = await getMoodCalendarSummary(userId);
    const sections = [];
    if (summary.patterns.length === 0 && summary.predictions.length === 0) {
        return '';
    }
    sections.push('[MOOD CALENDAR - Pattern Recognition]');
    sections.push('You can see emotional patterns no human friend tracks.\n');
    // Current time context
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const currentHour = now.getHours();
    // Check if current time matches a challenging pattern
    const currentChallenging = summary.challengingTimes.find((t) => t.dayOfWeek === currentDayOfWeek);
    if (currentChallenging && currentChallenging.avgMood < 0.4) {
        sections.push(`🕐 Note: ${DAY_NAMES[currentDayOfWeek]} ${currentChallenging.hourRange} tends to be harder for this person. ` +
            `Extra warmth may help.`);
    }
    // Notable patterns
    const significantPatterns = summary.patterns.filter((p) => p.confidence > 0.5);
    if (significantPatterns.length > 0) {
        sections.push('\n📊 Detected patterns:');
        for (const pattern of significantPatterns.slice(0, 3)) {
            sections.push(`• ${pattern.description}`);
            if (pattern.recommendation) {
                sections.push(`  → ${pattern.recommendation}`);
            }
        }
    }
    // Upcoming predictions (only significant ones)
    const significantPredictions = summary.predictions.filter((p) => p.confidence > 0.5 && MOOD_SCORES[p.predictedMood] < 0.4);
    if (significantPredictions.length > 0) {
        sections.push('\n⚠️ Upcoming challenging times predicted:');
        for (const pred of significantPredictions.slice(0, 2)) {
            sections.push(`• ${DAY_NAMES[pred.dayOfWeek]} around ${pred.hourOfDay}:00 - ${pred.historicalBasis}`);
        }
    }
    return sections.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const moodCalendar = {
    record: recordMoodEntry,
    load: loadMoodEntries,
    detectPatterns: detectMoodPatterns,
    predict: predictMood,
    getSummary: getMoodCalendarSummary,
    buildContext: buildMoodCalendarContext,
};
//# sourceMappingURL=mood-calendar.js.map