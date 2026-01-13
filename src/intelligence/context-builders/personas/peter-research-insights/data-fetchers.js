/**
 * Data fetching functions for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/data-fetchers
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
import { getGamificationStore } from '../../../../services/engagement/gamification-store.js';
import { getMemoryOrchestrator } from '../../../../memory/orchestrator.js';
import { getCalendarLoadFactors } from '../../../../services/calendar/calendar-load-service.js';
import { getAmbientCalendarContext } from '../../../../services/calendar/ambient-calendar-awareness.js';
const log = createLogger({ module: 'context:peter-data-fetchers' });
// ============================================================================
// SPENDING PATTERN ANALYSIS
// ============================================================================
export async function analyzeSpendingPatterns(userId) {
    const insights = [];
    try {
        const store = getFinancialStore();
        await store.loadUserData(userId);
        const budget = store.getMainBudget(userId);
        if (!budget)
            return insights;
        // Check for over-budget categories
        const overCategories = budget.categories.filter((c) => c.spent > c.limit);
        if (overCategories.length > 0) {
            const categoryNames = overCategories.map((c) => c.name).join(', ');
            insights.push(`User is over budget in ${overCategories.length} categories: ${categoryNames}. Worth exploring WHY - is it a pattern or one-time thing?`);
        }
        // Check spending pace
        const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
        const dayOfMonth = new Date().getDate();
        const expectedPercent = (dayOfMonth / 30) * 100;
        if (percentUsed > expectedPercent + 20) {
            insights.push(`Spending pace is ${Math.round(percentUsed - expectedPercent)}% ahead of where it should be this month. Classic early-month splurge pattern?`);
        }
        else if (percentUsed < expectedPercent - 15) {
            insights.push(`User is tracking well under budget - ${Math.round(expectedPercent - percentUsed)}% below expected pace. Something shifted - good habit forming?`);
        }
        // Find the biggest category
        const sortedCategories = [...budget.categories].sort((a, b) => b.spent - a.spent);
        if (sortedCategories.length > 0) {
            const topCategory = sortedCategories[0];
            const topPercent = Math.round((topCategory.spent / budget.spent) * 100);
            if (topPercent > 40) {
                insights.push(`${topCategory.name} accounts for ${topPercent}% of total spending. Classic 80/20 - this one category is the lever.`);
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not analyze spending patterns');
    }
    return insights;
}
// ============================================================================
// CROSS-TEAM DATA: MAYA'S HABIT DATA
// ============================================================================
export async function getMayaHabitInsights(userId) {
    const insights = {
        activeHabits: 0,
        keystoneHabits: [],
        currentStreaks: [],
        atRiskHabits: [],
        totalCompletions: 0,
        averageSuccessRate: 0,
        habitStacks: [],
        weeklyReflectionSummary: null,
    };
    try {
        const store = getProductivityStore();
        const userData = store.getFullUserData(userId);
        // Enhanced habits (Maya's coaching system)
        const enhancedHabits = userData.enhancedHabits || [];
        const activeHabits = enhancedHabits.filter((h) => h.isActive && !h.isPaused);
        insights.activeHabits = activeHabits.length;
        // Find keystone habits
        insights.keystoneHabits = activeHabits
            .filter((h) => h.isKeystone && h.keystoneScore && h.keystoneScore > 0.6)
            .map((h) => h.name);
        // Current streaks (only meaningful ones)
        insights.currentStreaks = activeHabits
            .filter((h) => h.currentStreak >= 3)
            .sort((a, b) => b.currentStreak - a.currentStreak)
            .slice(0, 5)
            .map((h) => ({ name: h.name, streak: h.currentStreak }));
        // At-risk habits (had streak, now at 0 or 1)
        insights.atRiskHabits = activeHabits
            .filter((h) => h.longestStreak >= 7 && h.currentStreak <= 1)
            .map((h) => h.name);
        // Total completions and success rate
        insights.totalCompletions = activeHabits.reduce((sum, h) => sum + h.totalCompletions, 0);
        if (activeHabits.length > 0) {
            insights.averageSuccessRate =
                activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;
        }
        // Habit stacks
        const stacks = userData.habitStacks || [];
        insights.habitStacks = stacks.map((s) => `${s.name} (${s.newHabits.length} habits)`);
        // Weekly reflections
        const reflections = userData.weeklyReflections || [];
        if (reflections.length > 0) {
            const latest = reflections[reflections.length - 1];
            insights.weeklyReflectionSummary = `Win: ${latest.wins[0] || 'none'}, Challenge: ${latest.challenges[0] || 'none'}`;
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not fetch Maya habit insights');
    }
    return insights;
}
// ============================================================================
// CROSS-TEAM DATA: MOOD/ENERGY PATTERNS
// ============================================================================
export async function getMoodPatterns(userId) {
    const insights = {
        recentMoodTrend: 'unknown',
        averageEnergy: 0,
        moodCorrelations: [],
        lastMood: null,
    };
    try {
        const gamificationStore = getGamificationStore();
        const now = new Date();
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const moodLogs = await gamificationStore.getMoodLogs(userId, twoWeeksAgo, now);
        if (moodLogs.length === 0)
            return insights;
        // Last mood (MoodLog has mood and energy as numbers 1-10)
        const lastLog = moodLogs[moodLogs.length - 1];
        const moodLabel = lastLog.mood <= 3 ? 'low' : lastLog.mood <= 6 ? 'moderate' : 'high';
        const energyLabel = lastLog.energy <= 3 ? 'low' : lastLog.energy <= 6 ? 'moderate' : 'high';
        insights.lastMood = { mood: moodLabel, energy: energyLabel };
        // Calculate energy average (already 1-10 scale, normalize to 1-5)
        const energyValues = moodLogs.map((m) => m.energy / 2); // Normalize to 1-5 scale
        if (energyValues.length > 0) {
            insights.averageEnergy =
                energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
        }
        // Mood trend (compare first half vs second half)
        const midpoint = Math.floor(moodLogs.length / 2);
        if (midpoint > 1) {
            const firstHalf = moodLogs.slice(0, midpoint);
            const secondHalf = moodLogs.slice(midpoint);
            const avgFirst = firstHalf.reduce((sum, m) => sum + m.mood, 0) / firstHalf.length;
            const avgSecond = secondHalf.reduce((sum, m) => sum + m.mood, 0) / secondHalf.length;
            if (avgSecond > avgFirst + 0.5) {
                insights.recentMoodTrend = 'improving';
            }
            else if (avgSecond < avgFirst - 0.5) {
                insights.recentMoodTrend = 'declining';
            }
            else {
                insights.recentMoodTrend = 'stable';
            }
        }
        // Generate correlations based on patterns
        if (insights.recentMoodTrend === 'declining') {
            insights.moodCorrelations.push('Declining mood trend detected - look for stress triggers');
        }
        if (insights.averageEnergy < 2.5) {
            insights.moodCorrelations.push('Low average energy - may impact decision quality');
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not fetch mood patterns');
    }
    return insights;
}
// ============================================================================
// CROSS-TEAM DATA: MEMORY ORCHESTRATOR
// ============================================================================
export async function getMemoryOrchestratorInsights(userId) {
    const insights = {
        behavioralPatterns: [],
        emotionalThreads: [],
        communicationStyle: null,
        memoryHealth: null,
    };
    try {
        const orchestrator = getMemoryOrchestrator();
        // Get memory health stats
        const health = await orchestrator.getMemoryHealth(userId);
        insights.memoryHealth = {
            totalMemories: health.totalMemories,
            recentMemories: health.recentMemories,
            emotionalMemories: health.emotionalMemories,
        };
        // Check if user has rich history
        if (health.totalMemories > 20) {
            insights.behavioralPatterns.push(`Rich memory history (${health.totalMemories} memories) - can reference patterns over time`);
        }
        if (health.emotionalMemories > 5) {
            insights.behavioralPatterns.push(`${health.emotionalMemories} emotionally significant memories stored - emotional context available`);
        }
        if (health.commitments > 0) {
            insights.behavioralPatterns.push(`${health.commitments} active commitments tracked - accountability data available`);
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not fetch memory orchestrator insights');
    }
    return insights;
}
// ============================================================================
// GOAL TRAJECTORY ANALYSIS
// ============================================================================
export async function analyzeGoalTrajectory(userId) {
    const insights = [];
    try {
        const store = getFinancialStore();
        await store.loadUserData(userId);
        const goals = store.getActiveSavingsGoals(userId);
        for (const goal of goals) {
            const progress = goal.currentAmount / goal.targetAmount;
            if (progress >= 0.9 && progress < 1) {
                insights.push(`User is ${Math.round(progress * 100)}% toward "${goal.name}" - SO close! The home stretch psychology is interesting.`);
            }
            else if (progress >= 0.5 && progress < 0.75) {
                insights.push(`"${goal.name}" is at ${Math.round(progress * 100)}% - past halfway! That's when momentum usually builds.`);
            }
            // Check if goal has deadline and is on track
            if (goal.deadline) {
                const now = new Date();
                const deadline = new Date(goal.deadline);
                const totalTime = deadline.getTime() -
                    (goal.createdAt ? new Date(goal.createdAt).getTime() : now.getTime());
                const elapsed = now.getTime() - (goal.createdAt ? new Date(goal.createdAt).getTime() : now.getTime());
                const timeProgress = totalTime > 0 ? elapsed / totalTime : 0;
                if (progress < timeProgress - 0.2) {
                    insights.push(`"${goal.name}" is behind pace - ${Math.round(progress * 100)}% saved but ${Math.round(timeProgress * 100)}% of time elapsed. Need to explore what's blocking progress.`);
                }
                else if (progress > timeProgress + 0.2) {
                    insights.push(`"${goal.name}" is AHEAD of schedule! ${Math.round(progress * 100)}% saved with ${Math.round((1 - timeProgress) * 100)}% of time left. What's working?`);
                }
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Could not analyze goal trajectory');
    }
    return insights;
}
// ============================================================================
// CALENDAR RESEARCH CONTEXT
// ============================================================================
export async function buildCalendarResearchContext(userId) {
    try {
        const [loadFactors, ambientContext] = await Promise.all([
            getCalendarLoadFactors(userId),
            getAmbientCalendarContext(userId),
        ]);
        // Determine load level
        let loadLevel = 'light';
        if (loadFactors.weeklyMeetingHours >= 35) {
            loadLevel = 'overloaded';
        }
        else if (loadFactors.weeklyMeetingHours >= 25) {
            loadLevel = 'heavy';
        }
        else if (loadFactors.weeklyMeetingHours >= 15) {
            loadLevel = 'moderate';
        }
        // Calculate focus time available
        const totalHoursInWeek = 40; // Assuming a 40-hour work week
        const focusTimeHours = Math.round(totalHoursInWeek * loadFactors.weeklyFocusTimeRatio);
        // Timing suggestion based on context
        let timingSuggestion = null;
        const nextMeeting = ambientContext.nextMeeting;
        const justEnded = ambientContext.justEndedMeeting;
        if (nextMeeting.event && nextMeeting.minutesUntil !== null) {
            if (nextMeeting.minutesUntil < 10) {
                timingSuggestion = 'Meeting starting soon - keep insights brief and actionable';
            }
            else if (nextMeeting.minutesUntil < 30) {
                timingSuggestion = 'Limited time before next meeting - prioritize key insights';
            }
        }
        if (justEnded.event !== null) {
            timingSuggestion =
                'Just finished a meeting - good time for a quick debrief or reflection, not deep analysis';
        }
        if (loadLevel === 'overloaded') {
            timingSuggestion =
                timingSuggestion || 'Calendar overloaded this week - focus on quick wins, save deep dives';
        }
        else if (loadLevel === 'light' && focusTimeHours > 20) {
            timingSuggestion =
                timingSuggestion || 'Light calendar week - great time for deep research discussions';
        }
        return {
            bestDayForDeepWork: loadFactors.lightestDayThisWeek,
            loadLevel,
            focusTimeHours,
            timingSuggestion,
            justEndedMeeting: justEnded.event !== null,
            upcomingMeetingSoon: nextMeeting.event !== null && (nextMeeting.minutesUntil ?? Infinity) < 30,
        };
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Could not build calendar research context');
        return null;
    }
}
//# sourceMappingURL=data-fetchers.js.map