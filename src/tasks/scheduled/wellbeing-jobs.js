/**
 * Wellbeing Scheduled Jobs
 *
 * Background tasks for wellbeing intelligence:
 * - Weekly ANT (Automatic Negative Thought) reports
 * - Daily early warning checks
 * - Wisdom contribution aggregation
 * - Engagement nudges for missing check-ins
 *
 * @module WellbeingJobs
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'WellbeingJobs' });
const JOBS = {
    weeklyANTReport: {
        name: 'Weekly ANT Report',
        schedule: '0 9 * * 1', // Monday 9 AM
        enabled: true,
    },
    dailyWarningCheck: {
        name: 'Daily Warning Check',
        schedule: '0 10 * * *', // Daily 10 AM
        enabled: true,
    },
    wisdomAggregation: {
        name: 'Wisdom Aggregation',
        schedule: '0 3 * * 0', // Sunday 3 AM
        enabled: true,
    },
    checkInNudge: {
        name: 'Check-in Nudge',
        schedule: '0 18 * * *', // Daily 6 PM
        enabled: true,
    },
    // BETTER-THAN-HUMAN: Proactive "thinking of you" outreach
    thinkingOfYouOutreach: {
        name: 'Thinking of You Outreach',
        schedule: '0 10,14,19 * * *', // 10 AM, 2 PM, 7 PM - natural check-in times
        enabled: true,
    },
};
/**
 * Generate weekly ANT report for a user
 */
async function generateANTReport(userId) {
    try {
        const { getANTPatterns, generateWeeklyInsights } = await import('../../services/cognitive-intelligence/index.js');
        const pattern = getANTPatterns(userId);
        if (!pattern || pattern.totalRecordings < 3) {
            log.debug({ userId }, 'Insufficient ANT data for report');
            return null;
        }
        // Get peak time from timeOfDayPatterns
        let peakTime = 'unknown';
        let maxTimeCount = 0;
        for (const [time, distortions] of Array.from(pattern.timeOfDayPatterns.entries())) {
            if (distortions.length > maxTimeCount) {
                maxTimeCount = distortions.length;
                peakTime = time;
            }
        }
        // Get peak day from dayOfWeekPatterns
        let peakDay = 'unknown';
        let maxDayCount = 0;
        for (const [day, distortions] of Array.from(pattern.dayOfWeekPatterns.entries())) {
            if (distortions.length > maxDayCount) {
                maxDayCount = distortions.length;
                peakDay = day;
            }
        }
        const insights = generateWeeklyInsights({
            totalDetected: pattern.totalRecordings,
            peakTime,
            peakDay,
            topicTriggers: pattern.topicTriggers,
        });
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Map trend from pattern
        const trend = pattern.distortionTrend === 'decreasing'
            ? 'improving'
            : pattern.distortionTrend === 'increasing'
                ? 'increasing'
                : 'stable';
        return {
            userId,
            period: { start: weekAgo, end: now },
            totalDistortions: pattern.totalRecordings,
            topDistortions: pattern.topDistortions
                .slice(0, 3)
                .map((d) => ({ type: d, count: pattern.distortionFrequency.get(d) || 0 })),
            peakTime,
            peakDay,
            triggerTopics: Array.from(pattern.topicTriggers.keys()).slice(0, 3),
            trend,
            insights,
        };
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to generate ANT report');
        return null;
    }
}
/**
 * Run weekly ANT reports for all users
 */
export async function runWeeklyANTReports() {
    log.info('Starting weekly ANT reports job');
    const stats = { processed: 0, reports: 0, errors: 0 };
    try {
        // Get all users with ANT data
        const { getAllUsersWithANTData, clearOldANTData } = await import('../../services/cognitive-intelligence/index.js');
        const userIds = await getAllUsersWithANTData();
        log.info({ userCount: userIds.length }, 'Processing ANT reports');
        for (const userId of userIds) {
            stats.processed++;
            try {
                const report = await generateANTReport(userId);
                if (report) {
                    stats.reports++;
                    // Store report for later retrieval via API
                    await storeANTReport(userId, report);
                    // If insights are meaningful, trigger outreach
                    if (report.insights.length > 0 && report.trend !== 'stable') {
                        await triggerANTInsightOutreach(userId, report);
                    }
                }
            }
            catch (error) {
                stats.errors++;
                log.warn({ error, userId }, 'Failed to process ANT report for user');
            }
        }
        // Clean up old data (> 90 days)
        clearOldANTData(90);
        log.info(stats, 'Weekly ANT reports completed');
    }
    catch (error) {
        log.error({ error }, 'Weekly ANT reports job failed');
    }
    return stats;
}
/**
 * Run daily early warning checks for all users
 */
export async function runDailyWarningChecks() {
    log.info('Starting daily warning checks job');
    const stats = { processed: 0, warnings: 0, urgent: 0, outreachTriggered: 0 };
    try {
        const { getAllWellbeingProfiles } = await import('../../services/wellbeing-tracking/index.js');
        const { checkWarnings } = await import('../../services/wellbeing-tracking/early-warning.js');
        const profiles = getAllWellbeingProfiles();
        log.info({ profileCount: profiles.length }, 'Processing warning checks');
        for (const profile of profiles) {
            stats.processed++;
            try {
                const warnings = checkWarnings(profile);
                if (warnings.length > 0) {
                    stats.warnings += warnings.length;
                    const urgentWarnings = warnings.filter((w) => w.severity === 'urgent');
                    stats.urgent += urgentWarnings.length;
                    // Trigger outreach for concerns and urgent
                    const actionableWarnings = warnings.filter((w) => w.severity === 'concern' || w.severity === 'urgent');
                    if (actionableWarnings.length > 0) {
                        await triggerWarningOutreach(profile.userId, actionableWarnings.map((w) => ({
                            type: w.type,
                            severity: w.severity,
                            message: w.recommendations?.forUser?.[0] || `Warning: ${w.type}`,
                        })));
                        stats.outreachTriggered++;
                    }
                }
            }
            catch (error) {
                log.warn({ error, userId: profile.userId }, 'Failed to check warnings for user');
            }
        }
        log.info(stats, 'Daily warning checks completed');
    }
    catch (error) {
        log.error({ error }, 'Daily warning checks job failed');
    }
    return stats;
}
// ============================================================================
// WISDOM AGGREGATION
// ============================================================================
/**
 * Aggregate wisdom patterns from population
 */
export async function runWisdomAggregation() {
    log.info('Starting wisdom aggregation job');
    const stats = { patternsDiscovered: 0, insightsGenerated: 0 };
    try {
        const { aggregatePopulationWisdom, discoverNewPatterns } = await import('../../services/wisdom-synthesis/index.js');
        // Discover new patterns from recent interactions
        const newPatterns = discoverNewPatterns();
        stats.patternsDiscovered = newPatterns.length;
        // Aggregate and update wisdom database
        const aggregationResult = aggregatePopulationWisdom();
        stats.insightsGenerated = aggregationResult.newInsights;
        log.info(stats, 'Wisdom aggregation completed');
    }
    catch (error) {
        log.error({ error }, 'Wisdom aggregation job failed');
    }
    return stats;
}
// ============================================================================
// CHECK-IN NUDGE
// ============================================================================
/**
 * Send gentle nudges to users who haven't checked in
 */
export async function runCheckInNudges() {
    log.info('Starting check-in nudge job');
    const stats = { eligible: 0, nudged: 0 };
    try {
        const { getUsersNeedingCheckIn, getLastCheckInTime } = await import('../../services/wellbeing-tracking/index.js');
        const eligibleUsers = getUsersNeedingCheckIn({
            minDaysSinceCheckIn: 2,
            maxDaysSinceCheckIn: 7, // Don't nudge if too long (different strategy)
        });
        stats.eligible = eligibleUsers.length;
        log.info({ eligible: stats.eligible }, 'Users eligible for check-in nudge');
        for (const userId of eligibleUsers) {
            try {
                const lastCheckIn = getLastCheckInTime(userId);
                const daysSince = lastCheckIn
                    ? Math.floor((Date.now() - lastCheckIn.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                await triggerCheckInNudge(userId, daysSince);
                stats.nudged++;
            }
            catch (error) {
                log.warn({ error, userId }, 'Failed to nudge user');
            }
        }
        log.info(stats, 'Check-in nudge job completed');
    }
    catch (error) {
        log.error({ error }, 'Check-in nudge job failed');
    }
    return stats;
}
// ============================================================================
// BETTER-THAN-HUMAN: THINKING OF YOU OUTREACH
// ============================================================================
/**
 * Process and send "thinking of you" proactive outreach
 *
 * This is THE differentiator - the AI that remembers and checks in
 * on things the user mentioned. A human friend might forget, but Ferni doesn't.
 */
export async function runThinkingOfYouOutreach() {
    log.info('🤔 Starting BETTER-THAN-HUMAN "Thinking of You" outreach job');
    const stats = { usersProcessed: 0, momentsGenerated: 0, outreachSent: 0, errors: 0 };
    try {
        // Import outreach integration
        const { getDueItems, canSendOutreach, executeOutreach, queueThinkingOfYou } = await import('../../services/trust-systems/outreach-integration.js');
        const { getDueMoments, generateThinkingOfYouMoments } = await import('../../services/trust-systems/thinking-of-you.js');
        // Get all users with significant shares (potential outreach targets)
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        // Get recent active users (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const usersSnapshot = await db
            .collection('bogle_users')
            .where('lastContact', '>=', thirtyDaysAgo.toISOString())
            .limit(100) // Process in batches
            .get();
        log.info({ userCount: usersSnapshot.size }, 'Processing users for thinking-of-you outreach');
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            stats.usersProcessed++;
            try {
                // Check if user can receive outreach
                const { allowed, reason } = canSendOutreach(userId);
                if (!allowed) {
                    log.debug({ userId, reason }, 'Skipping user - outreach blocked');
                    continue;
                }
                // Generate new thinking-of-you moments based on stored shares
                const newMoments = generateThinkingOfYouMoments(userId);
                stats.momentsGenerated += newMoments.length;
                // Queue any new moments
                for (const moment of newMoments) {
                    queueThinkingOfYou(userId, moment);
                }
                // Get items that are due for delivery
                const dueItems = getDueItems(userId);
                // Process due items (limit to 1 per user per run to avoid overwhelming)
                if (dueItems.length > 0) {
                    const item = dueItems[0]; // Most important item
                    // Determine delivery method (prefer push, fall back to SMS)
                    const method = 'push'; // Start with push, executeOutreach will fall back
                    const result = await executeOutreach(item, method);
                    if (result.success) {
                        stats.outreachSent++;
                        log.info({ userId, type: item.type, method: result.method }, '💌 BETTER-THAN-HUMAN: Sent "thinking of you" outreach');
                    }
                    else {
                        // If push failed, try SMS
                        if (method === 'push') {
                            const smsResult = await executeOutreach(item, 'sms');
                            if (smsResult.success) {
                                stats.outreachSent++;
                                log.info({ userId, type: item.type, method: 'sms' }, '📱 BETTER-THAN-HUMAN: Sent via SMS fallback');
                            }
                        }
                    }
                }
            }
            catch (error) {
                stats.errors++;
                log.warn({ error: String(error), userId }, 'Failed to process user for outreach');
            }
        }
        log.info(stats, '✅ Thinking-of-you outreach job completed');
    }
    catch (error) {
        log.error({ error: String(error) }, 'Thinking-of-you outreach job failed');
    }
    return stats;
}
// ============================================================================
// OUTREACH HELPERS
// ============================================================================
async function storeANTReport(userId, report) {
    // In production, store in Firestore
    // For now, just log that we would store it
    log.debug({ userId, totalDistortions: report.totalDistortions }, 'Would store ANT report');
    // Non-critical - continue
}
async function triggerANTInsightOutreach(userId, report) {
    try {
        const { triggerOutreach } = await import('../../services/outreach/index.js');
        // Craft a gentle, insight-focused message
        const topDistortion = report.topDistortions[0]?.type || 'thought patterns';
        const trend = report.trend === 'improving' ? 'getting better at noticing' : 'noticed some patterns in';
        triggerOutreach({
            type: 'insight_discovery', // ANT insights are discoveries
            userId,
            priority: 'low',
            reason: `Weekly insight: You've been ${trend} your ${topDistortion}. Want to explore this together?`,
            suggestedPersona: 'ferni',
        });
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to trigger ANT insight outreach');
    }
}
async function triggerWarningOutreach(userId, warnings) {
    try {
        const { triggerOutreach } = await import('../../services/outreach/index.js');
        const isUrgent = warnings.some((w) => w.severity === 'urgent');
        const primaryWarning = warnings[0];
        triggerOutreach({
            type: 'emotional_support', // Warning triggers emotional support
            userId,
            priority: isUrgent ? 'urgent' : 'medium',
            reason: `Noticed: ${primaryWarning.message}`,
            suggestedPersona: 'ferni',
        });
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to trigger warning outreach');
    }
}
async function triggerCheckInNudge(userId, daysSince) {
    try {
        const { triggerOutreach } = await import('../../services/outreach/index.js');
        const messages = [
            "Hey - haven't heard from you in a bit. How are you doing?",
            'Just checking in. Would love to catch up when you have a moment.',
            "Been a few days! No pressure, but I'm here when you want to chat.",
        ];
        const message = messages[Math.min(daysSince - 2, messages.length - 1)];
        triggerOutreach({
            type: 'reengagement', // Check-in nudges are re-engagement
            userId,
            priority: 'low',
            reason: message,
            suggestedPersona: 'ferni',
        });
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to trigger check-in nudge');
    }
}
// ============================================================================
// JOB RUNNER
// ============================================================================
/**
 * Run a specific job by name
 */
export async function runJob(jobName) {
    const job = JOBS[jobName];
    if (!job) {
        throw new Error(`Unknown job: ${jobName}`);
    }
    if (!job.enabled) {
        log.info({ jobName }, 'Job is disabled, skipping');
        return null;
    }
    log.info({ jobName }, 'Running job');
    switch (jobName) {
        case 'weeklyANTReport':
            return runWeeklyANTReports();
        case 'dailyWarningCheck':
            return runDailyWarningChecks();
        case 'wisdomAggregation':
            return runWisdomAggregation();
        case 'checkInNudge':
            return runCheckInNudges();
        case 'thinkingOfYouOutreach':
            return runThinkingOfYouOutreach();
        default:
            throw new Error(`No runner for job: ${jobName}`);
    }
}
/**
 * Get all job configurations
 */
export function getJobConfigs() {
    return { ...JOBS };
}
/**
 * Enable/disable a job
 */
export function setJobEnabled(jobName, enabled) {
    if (JOBS[jobName]) {
        JOBS[jobName].enabled = enabled;
        log.info({ jobName, enabled }, 'Job enabled state updated');
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const wellbeingJobs = {
    runWeeklyANTReports,
    runDailyWarningChecks,
    runWisdomAggregation,
    runCheckInNudges,
    runThinkingOfYouOutreach,
    runJob,
    getJobConfigs,
    setJobEnabled,
};
export default wellbeingJobs;
//# sourceMappingURL=wellbeing-jobs.js.map