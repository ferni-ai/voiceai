/**
 * Progress Metrics - User-Facing Growth Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks and presents user growth in meaningful ways.
 * Not gamification - genuine reflection on their journey.
 *
 * Philosophy:
 * - Progress is often invisible to the person making it
 * - Numbers alone miss the story
 * - Growth isn't always linear
 *
 * @module ProgressMetrics
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ProgressMetrics' });
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const progressProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = progressProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            weeklySummaries: [],
            monthlySummaries: [],
            highlights: [],
            streaks: {
                currentSessionStreak: 0,
                longestSessionStreak: 0,
                currentGoalStreak: 0,
                weeklyConsistency: [],
            },
            trends: {
                engagementTrend: 'stable',
                emotionalTrend: 'stable',
                progressRate: 0,
            },
        };
        progressProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// PROGRESS TRACKING
// ============================================================================
/**
 * Record a session for progress tracking
 */
export function recordProgressSession(userId, sessionData) {
    const profile = getOrCreateProfile(userId);
    // Update streaks
    profile.streaks.currentSessionStreak++;
    if (profile.streaks.currentSessionStreak > profile.streaks.longestSessionStreak) {
        profile.streaks.longestSessionStreak = profile.streaks.currentSessionStreak;
    }
    log.debug({ userId, duration: sessionData.durationMinutes }, 'Progress session recorded');
}
/**
 * Record a growth highlight
 */
export function recordHighlight(userId, highlight) {
    const profile = getOrCreateProfile(userId);
    profile.highlights.push({
        ...highlight,
        date: new Date(),
    });
    log.info({ userId, type: highlight.type, title: highlight.title }, '⭐ Highlight recorded');
}
/**
 * Reset streak (called when session gap is too long)
 */
export function resetStreak(userId) {
    const profile = getOrCreateProfile(userId);
    profile.streaks.currentSessionStreak = 0;
}
// ============================================================================
// SUMMARY GENERATION
// ============================================================================
/**
 * Generate a progress summary for a period
 */
export function generateProgressSummary(userId, period) {
    const profile = progressProfiles.get(userId);
    if (!profile)
        return null;
    const now = new Date();
    let periodStart;
    switch (period) {
        case 'week':
            periodStart = new Date(now);
            periodStart.setDate(periodStart.getDate() - 7);
            break;
        case 'month':
            periodStart = new Date(now);
            periodStart.setMonth(periodStart.getMonth() - 1);
            break;
        case 'quarter':
            periodStart = new Date(now);
            periodStart.setMonth(periodStart.getMonth() - 3);
            break;
    }
    // In production, this would aggregate real data
    // For now, return a placeholder structure
    const summary = {
        userId,
        period,
        periodStart,
        periodEnd: now,
        engagement: {
            sessionsCount: 0,
            totalMinutes: 0,
            averageSessionLength: 0,
            longestSession: 0,
            consistencyScore: 0,
        },
        growth: {
            goalsSet: 0,
            goalsCompleted: 0,
            milestonesReached: 0,
            breakthroughMoments: profile.highlights.filter((h) => h.type === 'breakthrough' && h.date >= periodStart).length,
            habitsFormed: 0,
        },
        emotional: {
            primaryEmotions: [],
            emotionalRange: 0,
            vulnerabilityMoments: 0,
        },
        topics: {
            mainTopics: [],
            newTopicsExplored: 0,
            deepDiveTopics: [],
        },
        relationship: {
            trustScore: 0,
            personasInteractedWith: [],
            teamMembersUnlocked: 0,
        },
    };
    return summary;
}
// ============================================================================
// USER-FACING REFLECTIONS
// ============================================================================
/**
 * Generate a human-readable progress reflection
 */
export function generateProgressReflection(userId) {
    const profile = progressProfiles.get(userId);
    if (!profile || profile.highlights.length === 0)
        return null;
    const recentHighlights = profile.highlights
        .filter((h) => {
        const daysSince = Math.floor((Date.now() - h.date.getTime()) / (1000 * 60 * 60 * 24));
        return daysSince <= 30;
    })
        .slice(-3);
    if (recentHighlights.length === 0)
        return null;
    const reflections = [
        `Looking back at this past month, you've had some real moments. ${recentHighlights[0].title}. That matters.`,
        `I've been keeping track, and I wanted to share something. ${recentHighlights[0].title}. That's growth you might not see day-to-day.`,
        `Can we pause for a second? ${recentHighlights[0].title}. I want to make sure you know that I noticed.`,
    ];
    const reflection = reflections[Math.floor(Math.random() * reflections.length)];
    return {
        title: 'Your Recent Growth',
        reflection,
        highlights: recentHighlights,
        ssml: reflection.replace(/\. /g, ". <break time='400ms'/> "),
    };
}
/**
 * Get streak information for user
 */
export function getStreakInfo(userId) {
    const profile = getOrCreateProfile(userId);
    let message;
    if (profile.streaks.currentSessionStreak === profile.streaks.longestSessionStreak &&
        profile.streaks.currentSessionStreak > 5) {
        message = "You're on your longest streak! Keep it up.";
    }
    else if (profile.streaks.currentSessionStreak > 7) {
        message = `${profile.streaks.currentSessionStreak} sessions in a row. That's consistency.`;
    }
    else if (profile.streaks.currentSessionStreak > 3) {
        message = "You've been showing up. That matters more than you know.";
    }
    else {
        message = "Every session counts. Glad you're here.";
    }
    return {
        currentStreak: profile.streaks.currentSessionStreak,
        longestStreak: profile.streaks.longestSessionStreak,
        message,
    };
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build LLM context for progress metrics
 */
export function buildProgressContext(userId) {
    const profile = progressProfiles.get(userId);
    if (!profile)
        return null;
    const lines = ['[📈 PROGRESS CONTEXT]'];
    // Streaks
    if (profile.streaks.currentSessionStreak > 3) {
        lines.push(`Session streak: ${profile.streaks.currentSessionStreak} in a row`);
    }
    // Recent highlights
    const recentHighlights = profile.highlights.filter((h) => {
        const daysSince = Math.floor((Date.now() - h.date.getTime()) / (1000 * 60 * 60 * 24));
        return daysSince <= 14;
    });
    if (recentHighlights.length > 0) {
        lines.push('');
        lines.push('Recent wins:');
        for (const h of recentHighlights.slice(0, 3)) {
            lines.push(`• ${h.title} (${h.type})`);
        }
        lines.push('');
        lines.push('Consider acknowledging recent progress when natural.');
    }
    // Trends
    if (profile.trends.engagementTrend === 'increasing') {
        lines.push("Engagement is up - they're showing up more often.");
    }
    else if (profile.trends.engagementTrend === 'decreasing') {
        lines.push('Engagement has dipped - check in on how things are going.');
    }
    return lines.length > 1 ? lines.join('\n') : null;
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function exportProgressProfile(userId) {
    return progressProfiles.get(userId) || null;
}
export function importProgressProfile(profile) {
    profile.highlights.forEach((h) => {
        h.date = new Date(h.date);
    });
    profile.weeklySummaries.forEach((s) => {
        s.periodStart = new Date(s.periodStart);
        s.periodEnd = new Date(s.periodEnd);
    });
    profile.monthlySummaries.forEach((s) => {
        s.periodStart = new Date(s.periodStart);
        s.periodEnd = new Date(s.periodEnd);
    });
    progressProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId }, 'Imported progress profile');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordProgressSession,
    recordHighlight,
    resetStreak,
    generateProgressSummary,
    generateProgressReflection,
    getStreakInfo,
    buildProgressContext,
    exportProgressProfile,
    importProgressProfile,
};
//# sourceMappingURL=progress-metrics.js.map