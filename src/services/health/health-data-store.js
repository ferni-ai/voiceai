/**
 * Health Data Store
 *
 * > "Better than human means knowing, not guessing."
 *
 * Privacy-first storage of health summaries.
 * We store insights, not raw health records.
 *
 * @module services/health/health-data-store
 */
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onHealthSummaryChange } from '../data-layer/hooks/index.js';
const log = createLogger({ module: 'health-data-store' });
function getFirestoreDb() {
    try {
        // Dynamic import to avoid issues when Firestore not available
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const admin = require('firebase-admin');
        return admin.firestore();
    }
    catch {
        log.debug('Firestore not available');
        return null;
    }
}
// ============================================================================
// HEALTH DATA STORAGE
// ============================================================================
/**
 * Store health summary for a user
 */
export async function storeHealthSummary(summary) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId: summary.userId }, 'Firestore not available, skipping health store');
        return;
    }
    try {
        await db
            .collection('bogle_users')
            .doc(summary.userId)
            .collection('health_summaries')
            .doc(summary.date)
            .set(cleanForFirestore({
            ...summary,
            syncedAt: new Date().toISOString(),
        }), { merge: true });
        log.debug({ userId: summary.userId, date: summary.date }, 'Health summary stored');
        // Index to semantic memory
        void onHealthSummaryChange(summary.userId, summary.date, {
            date: summary.date,
            sleepHours: summary.sleepHours,
            sleepQuality: summary.sleepQuality,
            activity: summary.activityTrend,
            stepsCount: summary.stepsToday,
            heartRateAvg: summary.restingHeartRate,
        }, 'update');
    }
    catch (error) {
        log.error({ error: String(error), userId: summary.userId }, 'Failed to store health summary');
    }
}
/**
 * Get health summary for a specific date
 */
export async function getHealthSummary(userId, date) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('health_summaries')
            .doc(date)
            .get();
        if (!doc.exists)
            return null;
        return doc.data();
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get health summary');
        return null;
    }
}
/**
 * Get recent health summaries (last N days)
 */
export async function getRecentHealthSummaries(userId, days = 7) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('health_summaries')
            .where('date', '>=', startDateStr)
            .orderBy('date', 'desc')
            .limit(days)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Failed to get recent health summaries');
        return [];
    }
}
// ============================================================================
// HEALTH PREFERENCES
// ============================================================================
/**
 * Get user's health preferences
 */
export async function getHealthPreferences(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('settings')
            .doc('health_preferences')
            .get();
        if (!doc.exists)
            return null;
        return doc.data();
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Failed to get health preferences');
        return null;
    }
}
/**
 * Update user's health preferences
 */
export async function updateHealthPreferences(userId, preferences) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('settings')
            .doc('health_preferences')
            .set(cleanForFirestore({
            ...preferences,
            updatedAt: new Date().toISOString(),
        }), { merge: true });
        log.info({ userId }, 'Health preferences updated');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to update health preferences');
    }
}
// ============================================================================
// HEALTH SYNC ENDPOINT
// ============================================================================
/**
 * Handle health sync from mobile app
 */
export async function handleHealthSync(request) {
    const { userId, summary, timestamp } = request;
    log.info({ userId, deviceType: request.deviceType }, 'Processing health sync');
    try {
        // Check if user has health integration enabled
        const preferences = await getHealthPreferences(userId);
        if (preferences && !preferences.enabled) {
            return {
                success: false,
                error: 'Health integration is disabled',
            };
        }
        // Get today's date
        const today = new Date().toISOString().split('T')[0];
        // Build filtered summary based on preferences
        const filteredSummary = {
            userId,
            date: today,
            syncedAt: timestamp,
            source: request.deviceType === 'ios' ? 'apple_health' : 'google_fit',
        };
        // Apply preference filters
        if (!preferences || preferences.shareSleep) {
            if (summary.sleepHours !== undefined)
                filteredSummary.sleepHours = summary.sleepHours;
            if (summary.sleepQuality !== undefined)
                filteredSummary.sleepQuality = summary.sleepQuality;
            if (summary.bedtime !== undefined)
                filteredSummary.bedtime = summary.bedtime;
            if (summary.wakeTime !== undefined)
                filteredSummary.wakeTime = summary.wakeTime;
        }
        if (!preferences || preferences.shareStress) {
            if (summary.hrvValue !== undefined)
                filteredSummary.hrvValue = summary.hrvValue;
            if (summary.hrvTrend !== undefined)
                filteredSummary.hrvTrend = summary.hrvTrend;
            if (summary.restingHeartRate !== undefined)
                filteredSummary.restingHeartRate = summary.restingHeartRate;
        }
        if (!preferences || preferences.shareActivity) {
            if (summary.stepsToday !== undefined)
                filteredSummary.stepsToday = summary.stepsToday;
            if (summary.activityTrend !== undefined)
                filteredSummary.activityTrend = summary.activityTrend;
            if (summary.exerciseMinutes !== undefined)
                filteredSummary.exerciseMinutes = summary.exerciseMinutes;
            if (summary.lastWorkoutType !== undefined)
                filteredSummary.lastWorkoutType = summary.lastWorkoutType;
            if (summary.lastWorkoutDate !== undefined)
                filteredSummary.lastWorkoutDate = summary.lastWorkoutDate;
        }
        if (!preferences || preferences.shareWellness) {
            if (summary.mindfulMinutes !== undefined)
                filteredSummary.mindfulMinutes = summary.mindfulMinutes;
            if (summary.lastMeditationDate !== undefined)
                filteredSummary.lastMeditationDate = summary.lastMeditationDate;
        }
        if (preferences?.shareCycle) {
            if (summary.cycleDay !== undefined)
                filteredSummary.cycleDay = summary.cycleDay;
            if (summary.cyclePhase !== undefined)
                filteredSummary.cyclePhase = summary.cyclePhase;
        }
        // Store the summary
        await storeHealthSummary(filteredSummary);
        // Calculate next sync time (every 4 hours)
        const nextSync = new Date();
        nextSync.setHours(nextSync.getHours() + 4);
        return {
            success: true,
            nextSyncSuggested: nextSync.toISOString(),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Health sync failed');
        return {
            success: false,
            error: 'Sync failed',
        };
    }
}
// ============================================================================
// HEALTH CONTEXT BUILDER
// ============================================================================
/**
 * Build health context for LLM injection
 */
export async function buildHealthContext(userId) {
    const emptyContext = {
        hasHealthData: false,
        confidence: 'low',
        dataAvailableDays: 0,
    };
    // Check preferences first
    const preferences = await getHealthPreferences(userId);
    if (preferences && !preferences.enabled) {
        return emptyContext;
    }
    // Get recent summaries
    const summaries = await getRecentHealthSummaries(userId, 7);
    if (summaries.length === 0) {
        return emptyContext;
    }
    const latest = summaries[0];
    const context = {
        hasHealthData: true,
        confidence: summaries.length >= 3 ? 'high' : summaries.length >= 1 ? 'medium' : 'low',
        dataAvailableDays: summaries.length,
    };
    const insights = [];
    // Sleep insights
    if (latest.sleepHours !== undefined && (!preferences || preferences.shareSleep)) {
        if (latest.sleepHours < 5) {
            context.sleepInsight = `User only slept ${latest.sleepHours.toFixed(1)} hours last night.`;
            insights.push(context.sleepInsight);
        }
        else if (latest.sleepHours < 6) {
            context.sleepInsight = `User got ${latest.sleepHours.toFixed(1)} hours of sleep - less than ideal.`;
            insights.push(context.sleepInsight);
        }
        else if (latest.sleepQuality === 'poor') {
            context.sleepInsight = `User's sleep quality was poor last night despite ${latest.sleepHours.toFixed(1)} hours.`;
            insights.push(context.sleepInsight);
        }
    }
    // Stress/HRV insights
    if (latest.hrvTrend && (!preferences || preferences.shareStress)) {
        if (latest.hrvTrend === 'declining') {
            context.stressInsight =
                "User's stress indicators have been elevated this week (HRV declining).";
            insights.push(context.stressInsight);
        }
        else if (latest.hrvAnomalyDetected) {
            context.stressInsight = "User's HRV shows an unusual dip - possible high stress.";
            insights.push(context.stressInsight);
        }
    }
    // Activity insights
    if (latest.activityTrend && (!preferences || preferences.shareActivity)) {
        if (latest.activityTrend === 'less_active') {
            context.activityInsight = 'User has been less physically active than usual this week.';
            insights.push(context.activityInsight);
        }
        else if (latest.lastWorkoutDate) {
            const daysSinceWorkout = getDaysSince(latest.lastWorkoutDate);
            if (daysSinceWorkout > 7) {
                context.activityInsight = `User hasn't worked out in ${daysSinceWorkout} days.`;
                insights.push(context.activityInsight);
            }
            else if (daysSinceWorkout === 0 && latest.lastWorkoutType) {
                context.activityInsight = `User did a ${latest.lastWorkoutType} workout today!`;
                insights.push(context.activityInsight);
            }
        }
    }
    // Wellness/mindfulness insights
    if (latest.lastMeditationDate !== undefined && (!preferences || preferences.shareWellness)) {
        const daysSinceMeditation = getDaysSince(latest.lastMeditationDate);
        if (daysSinceMeditation > 3) {
            context.wellnessInsight = `User hasn't meditated in ${daysSinceMeditation} days.`;
            insights.push(context.wellnessInsight);
        }
    }
    // Cycle insights (very gentle, only if enabled)
    if (latest.cyclePhase && preferences?.shareCycle) {
        if (latest.cyclePhase === 'menstrual') {
            context.cycleInsight = 'User may be experiencing menstruation - be extra gentle.';
            insights.push(context.cycleInsight);
        }
        else if (latest.cyclePhase === 'luteal' && latest.cycleDay && latest.cycleDay > 20) {
            context.cycleInsight = 'User is in late luteal phase - PMS symptoms possible.';
            insights.push(context.cycleInsight);
        }
    }
    // Build summary
    if (insights.length > 0) {
        context.summary = insights.join(' ');
    }
    return context;
}
/**
 * Format health context for LLM injection
 */
export async function getHealthContextInjection(userId) {
    const context = await buildHealthContext(userId);
    if (!context.hasHealthData || !context.summary) {
        return '';
    }
    const lines = ['[HEALTH AWARENESS - Better Than Human]'];
    lines.push('');
    lines.push('You have access to health data the user has shared:');
    lines.push(context.summary);
    lines.push('');
    lines.push('GUIDANCE:');
    lines.push("- Use this gently if relevant - don't lecture");
    lines.push("- Acknowledge, don't diagnose");
    lines.push('- If they seem tired, you know why - acknowledge it');
    lines.push('- This is "better than human" - a friend on the phone wouldn\'t know this');
    return lines.join('\n');
}
// ============================================================================
// HELPERS
// ============================================================================
function getDaysSince(isoDate) {
    const date = new Date(isoDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const healthDataStore = {
    storeHealthSummary,
    getHealthSummary,
    getRecentHealthSummaries,
    getHealthPreferences,
    updateHealthPreferences,
    handleHealthSync,
    buildHealthContext,
    getHealthContextInjection,
};
//# sourceMappingURL=health-data-store.js.map