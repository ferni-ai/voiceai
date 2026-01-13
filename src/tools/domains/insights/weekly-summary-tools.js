/**
 * Weekly Summary Tools
 *
 * Provides voice-accessible analytics summaries for users.
 * "How am I doing?" triggers a conversational summary of:
 * - Habit completion rates
 * - Mood trends
 * - Streak progress
 * - Areas of improvement
 *
 * @see SET-21 - Voice: Add weekly analytics summary
 * @module tools/domains/insights/weekly-summary-tools
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// DATA AGGREGATION
// ============================================================================
/**
 * Aggregate weekly summary data from multiple sources.
 */
async function aggregateWeeklySummary(userId) {
    try {
        // Load data from engagement store
        const { getEngagementStore } = await import('../../../services/engagement/engagement-store.js');
        const store = await getEngagementStore();
        const profile = await store.getProfile(userId);
        const streaks = await store.getAllStreaks(userId);
        const weatherHistory = await store.getWeatherHistory(userId, 14); // Last 2 weeks
        // Calculate metrics
        const totalRituals = (streaks || []).reduce((sum, s) => sum + (s.totalCompletions || 0), 0);
        const currentStreak = Math.max(...(streaks || []).map((s) => s.currentStreak || 0), 0);
        const longestStreak = Math.max(...(streaks || []).map((s) => s.longestStreak || 0), 0);
        // Calculate completion rate (rituals completed this week vs expected)
        const activeRituals = profile?.activeRituals?.length || 0;
        const expectedWeeklyCompletions = activeRituals * 7;
        const weeklyCompletions = (streaks || []).filter((s) => {
            const lastCompleted = s.lastCompletedAt;
            if (!lastCompleted)
                return false;
            const lastDate = new Date(lastCompleted);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return lastDate > weekAgo;
        }).length;
        const ritualCompletionRate = expectedWeeklyCompletions > 0 ? (weeklyCompletions / expectedWeeklyCompletions) * 100 : 0;
        // Mood analysis
        const moodMap = {
            sunny: 5,
            rainbow: 5,
            'partly-cloudy': 4,
            cloudy: 3,
            foggy: 2,
            rainy: 2,
            stormy: 1,
        };
        const moodScores = (weatherHistory || []).map((w) => {
            const weather = w.weather;
            const primary = typeof weather === 'object' ? weather?.primary : weather;
            return moodMap[primary] || 3;
        });
        const averageMood = moodScores.length > 0 ? moodScores.reduce((a, b) => a + b, 0) / moodScores.length : 3;
        // Determine mood trend
        let moodTrend = 'unknown';
        if (moodScores.length >= 4) {
            const recentHalf = moodScores.slice(0, Math.floor(moodScores.length / 2));
            const olderHalf = moodScores.slice(Math.floor(moodScores.length / 2));
            const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
            const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;
            if (recentAvg > olderAvg + 0.3) {
                moodTrend = 'improving';
            }
            else if (recentAvg < olderAvg - 0.3) {
                moodTrend = 'declining';
            }
            else {
                moodTrend = 'stable';
            }
        }
        // Generate mood highlight
        let moodHighlight = null;
        if (averageMood >= 4) {
            moodHighlight = "You've been in good spirits lately";
        }
        else if (averageMood >= 3) {
            moodHighlight = "You've had a balanced week emotionally";
        }
        else if (averageMood < 2.5) {
            moodHighlight = "It's been a challenging week";
        }
        // Identify wins
        const wins = [];
        if (currentStreak >= 3) {
            wins.push(`${currentStreak}-day streak going strong`);
        }
        if (ritualCompletionRate >= 80) {
            wins.push('Excellent ritual consistency');
        }
        if (moodTrend === 'improving') {
            wins.push('Mood trending upward');
        }
        if (longestStreak > currentStreak && longestStreak >= 7) {
            wins.push(`Personal best streak of ${longestStreak} days`);
        }
        // Identify areas of concern
        const areasOfConcern = [];
        if (currentStreak === 0 && totalRituals > 0) {
            areasOfConcern.push('Streak ended - time to restart');
        }
        if (ritualCompletionRate < 50 && activeRituals > 0) {
            areasOfConcern.push('Ritual consistency could use attention');
        }
        if (moodTrend === 'declining') {
            areasOfConcern.push('Mood has been lower - consider some self-care');
        }
        if (moodScores.filter((m) => m <= 2).length > moodScores.length / 2 &&
            moodScores.length >= 3) {
            areasOfConcern.push('Energy levels have been low');
        }
        // Best day (from engagement data)
        const dayCompletions = {};
        (streaks || []).forEach((s) => {
            const lastCompleted = s.lastCompletedAt;
            if (lastCompleted) {
                const day = new Date(lastCompleted).toLocaleDateString('en-US', { weekday: 'long' });
                dayCompletions[day] = (dayCompletions[day] || 0) + 1;
            }
        });
        const bestDay = Object.entries(dayCompletions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        // Most consistent ritual
        const sortedStreaks = [...(streaks || [])].sort((a, b) => (b.longestStreak || 0) -
            (a.longestStreak || 0));
        const topRitual = sortedStreaks[0];
        const mostConsistentRitual = formatRitualName(topRitual?.ritualId || null);
        return {
            totalRituals,
            currentStreak,
            longestStreak,
            ritualCompletionRate,
            averageMood,
            moodTrend,
            moodHighlight,
            wins,
            areasOfConcern,
            bestDay,
            mostConsistentRitual,
        };
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to aggregate weekly summary');
        return null;
    }
}
/**
 * Convert ritual IDs to human-friendly names.
 */
function formatRitualName(ritualId) {
    if (!ritualId)
        return null;
    const names = {
        'ferni-sky-check': 'Morning Sky Check',
        'alex-inbox-pulse': 'Inbox Pulse',
        'maya-habit-heartbeat': 'Habit Heartbeat',
        'jordan-todays-chapter': "Today's Chapter",
        'nayan-morning-stillness': 'Morning Stillness',
        'peter-pattern-pulse': 'Pattern Pulse',
    };
    if (names[ritualId])
        return names[ritualId];
    // Handle generated habit IDs
    if (/^\d{13}/.test(ritualId) || /^ritual_\d+/.test(ritualId)) {
        return 'Custom Habit';
    }
    return ritualId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
// ============================================================================
// RESPONSE GENERATION
// ============================================================================
/**
 * Generate persona-appropriate response.
 */
function generateSummaryResponse(data, personaId) {
    const sections = [];
    // Persona-specific opening
    switch (personaId) {
        case 'maya':
            sections.push("Alright, let's check in on how you're doing.");
            break;
        case 'peter':
            sections.push("Here's your weekly performance overview.");
            break;
        case 'jordan':
            sections.push("Let's see what progress you've made this week.");
            break;
        case 'nayan':
            sections.push("Let me reflect on your journey this week.");
            break;
        default:
            sections.push("Here's how you've been doing lately.");
    }
    // Wins (lead with the positive)
    if (data.wins.length > 0) {
        const winsIntro = personaId === 'maya'
            ? "First, some wins to celebrate:"
            : personaId === 'peter'
                ? 'Positive indicators:'
                : 'Some highlights:';
        sections.push(`\n${winsIntro}`);
        data.wins.forEach((win) => sections.push(`• ${win}`));
    }
    // Key metrics (persona-appropriate framing)
    if (data.currentStreak > 0) {
        const streakMsg = personaId === 'maya'
            ? `You're on a ${data.currentStreak}-day streak - that's momentum worth protecting.`
            : personaId === 'peter'
                ? `Current streak: ${data.currentStreak} days. ${data.longestStreak > data.currentStreak ? `Personal best: ${data.longestStreak}.` : 'On track to beat your record.'}`
                : `You've shown up ${data.currentStreak} days in a row.`;
        sections.push(`\n${streakMsg}`);
    }
    // Mood insight
    if (data.moodHighlight) {
        const moodMsg = personaId === 'maya'
            ? `${data.moodHighlight}. ${data.moodTrend === 'improving' ? 'I notice an upward trend - keep doing what you\'re doing.' : ''}`
            : personaId === 'nayan'
                ? `${data.moodHighlight}. There is wisdom in understanding our emotional rhythms.`
                : data.moodHighlight;
        sections.push(moodMsg);
    }
    // Best day
    if (data.bestDay) {
        sections.push(`\n${data.bestDay}s seem to be your strongest day for engagement.`);
    }
    // Most consistent ritual
    if (data.mostConsistentRitual) {
        sections.push(`Your most consistent practice has been ${data.mostConsistentRitual}.`);
    }
    // Areas of concern (gently framed)
    if (data.areasOfConcern.length > 0) {
        const concernIntro = personaId === 'maya'
            ? '\nA few things to keep an eye on:'
            : personaId === 'peter'
                ? '\nAreas requiring attention:'
                : personaId === 'nayan'
                    ? '\nSome gentle observations:'
                    : '\nA couple things to consider:';
        sections.push(concernIntro);
        data.areasOfConcern.forEach((concern) => sections.push(`• ${concern}`));
    }
    // Closing (persona-appropriate)
    if (data.wins.length > 0 || data.currentStreak > 0) {
        const closing = personaId === 'maya'
            ? "\nOverall, you're making progress. What would you like to focus on next?"
            : personaId === 'peter'
                ? '\nThe data shows positive trends. Want me to drill down on any specific area?'
                : personaId === 'jordan'
                    ? '\nYou\'re building something. Want to plan your next week?'
                    : "Would you like to dig into anything specific?";
        sections.push(closing);
    }
    else {
        const closing = personaId === 'maya'
            ? "\nEvery day is a fresh start. What small step could we take today?"
            : personaId === 'nayan'
                ? '\nThe path forward begins with a single step. What matters most to you right now?'
                : 'What would be most helpful to work on?';
        sections.push(`\n${closing}`);
    }
    return sections.join('\n');
}
/**
 * Generate response when no data is available.
 */
function generateNoDataResponse(personaId) {
    switch (personaId) {
        case 'maya':
            return "I don't have enough data yet to give you a meaningful summary. Try checking in with me for a few days, and I'll be able to spot patterns and track your progress.";
        case 'peter':
            return "Insufficient data for statistical analysis. I need at least a week of engagement to generate meaningful insights.";
        case 'nayan':
            return "We're just beginning our journey together. As we talk more, I'll learn your patterns and rhythms.";
        default:
            return "I don't have enough information yet to summarize how you're doing. Check in with me over the next few days and I'll start tracking your progress.";
    }
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
const getWeeklySummaryDef = {
    id: 'getWeeklySummary',
    name: 'Get Weekly Summary',
    description: 'Provides a conversational summary of how the user is doing - habits, mood, streaks, wins, and areas of attention.',
    domain: 'insights',
    tags: ['analytics', 'summary', 'progress', 'habits', 'mood', 'wellness'],
    create: (ctx) => {
        return llm.tool({
            description: `Get a weekly summary of how the user is doing. Call this when the user asks:
- "How am I doing?"
- "How's my week going?"
- "Summarize my progress"
- "Give me an update on my habits"
- "What's my streak?"
- "How have I been?"

Returns a conversational summary of their habits, mood trends, wins, and areas to work on.`,
            parameters: z.object({}),
            execute: async () => {
                const userId = ctx.userId;
                const personaId = ctx.agentId || 'ferni';
                if (!userId) {
                    return "I'd need to know who you are to give you a summary. Are you signed in?";
                }
                try {
                    log.info({ userId, personaId }, '📊 Generating weekly summary');
                    const data = await aggregateWeeklySummary(userId);
                    if (!data || (data.totalRituals === 0 && data.averageMood === 3)) {
                        return generateNoDataResponse(personaId);
                    }
                    const response = generateSummaryResponse(data, personaId);
                    log.debug({
                        userId,
                        wins: data.wins.length,
                        concerns: data.areasOfConcern.length,
                        streak: data.currentStreak,
                    }, '📊 Weekly summary generated');
                    return response;
                }
                catch (error) {
                    log.error({ error: String(error), userId }, '📊 Failed to generate weekly summary');
                    return "I had trouble pulling together your summary. You can check the analytics in the app for now.";
                }
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const weeklySummaryToolDefinitions = [getWeeklySummaryDef];
export const { getToolDefinitions, domain, definitions } = createDomainExport('insights', weeklySummaryToolDefinitions);
//# sourceMappingURL=weekly-summary-tools.js.map