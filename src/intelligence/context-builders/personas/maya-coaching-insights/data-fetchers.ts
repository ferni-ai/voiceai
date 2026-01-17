/**
 * Data fetching functions for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/data-fetchers
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getGamificationStore } from '../../../../services/engagement/gamification-store.js';
import type { HabitHealthSummary, MoodIntelligence, MemoryInsights } from './types.js';

const log = createLogger({ module: 'context:maya-data-fetchers' });

// ============================================================================
// HABIT HEALTH ANALYSIS
// ============================================================================

export function analyzeHabitHealth(userId: string): HabitHealthSummary {
  const summary: HabitHealthSummary = {
    activeHabits: 0,
    totalStreaks: 0,
    averageSuccessRate: 0,
    keystoneActive: false,
    keystoneHabits: [],
    atRiskCount: 0,
    recentSetbacks: [],
    longestStreak: null,
    habitStacks: [],
    weeklyReflectionSummary: null,
    totalCompletions: 0,
    habitCategories: {},
  };

  try {
    const store = getProductivityStore();
    const userData = store.getFullUserData(userId);
    const enhancedHabits = userData.enhancedHabits || [];
    const activeHabits = enhancedHabits.filter((h) => h.isActive && !h.isPaused);

    summary.activeHabits = activeHabits.length;

    if (activeHabits.length === 0) return summary;

    // Calculate totals
    summary.totalStreaks = activeHabits.filter((h) => h.currentStreak > 0).length;
    summary.averageSuccessRate =
      activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;
    summary.totalCompletions = activeHabits.reduce((sum, h) => sum + h.totalCompletions, 0);

    // Find keystone habits
    summary.keystoneHabits = activeHabits
      .filter((h) => h.isKeystone && h.keystoneScore && h.keystoneScore > 0.6)
      .map((h) => h.name);
    summary.keystoneActive =
      summary.keystoneHabits.length > 0 &&
      activeHabits.some((h) => h.isKeystone && h.currentStreak > 0);

    // Find at-risk habits (had streak, now broken)
    const atRisk = activeHabits.filter((h) => h.longestStreak >= 7 && h.currentStreak <= 1);
    summary.atRiskCount = atRisk.length;
    summary.recentSetbacks = atRisk.map((h) => h.name);

    // Find longest active streak
    const withStreaks = activeHabits.filter((h) => h.currentStreak > 0);
    if (withStreaks.length > 0) {
      const longest = withStreaks.sort((a, b) => b.currentStreak - a.currentStreak)[0];
      summary.longestStreak = { name: longest.name, days: longest.currentStreak };
    }

    // Habit stacks
    const stacks = userData.habitStacks || [];
    summary.habitStacks = stacks.map((s) => `${s.name} (${s.newHabits.length} habits)`);

    // Weekly reflections
    const reflections = userData.weeklyReflections || [];
    if (reflections.length > 0) {
      const latest = reflections[reflections.length - 1];
      summary.weeklyReflectionSummary = `Win: ${latest.wins[0] || 'none'}, Challenge: ${latest.challenges[0] || 'none'}`;
    }

    // Categorize habits by domain
    for (const habit of activeHabits) {
      const category = habit.domain || 'general';
      summary.habitCategories[category] = (summary.habitCategories[category] || 0) + 1;
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze habit health');
  }

  return summary;
}

// ============================================================================
// MOOD/ENERGY INTELLIGENCE
// ============================================================================

export async function analyzeMoodIntelligence(userId: string): Promise<MoodIntelligence> {
  const intelligence: MoodIntelligence = {
    recentMoodTrend: 'unknown',
    averageEnergy: 0,
    optimalCoachingTime: null,
    moodHabitCorrelations: [],
    currentState: null,
    energyPatterns: [],
  };

  try {
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const moodLogs = await gamificationStore.getMoodLogs(userId, twoWeeksAgo, now);

    if (moodLogs.length === 0) return intelligence;

    // Current state
    const lastLog = moodLogs[moodLogs.length - 1];
    const moodLabel = lastLog.mood <= 3 ? 'low' : lastLog.mood <= 6 ? 'moderate' : 'high';
    const energyLabel = lastLog.energy <= 3 ? 'low' : lastLog.energy <= 6 ? 'moderate' : 'high';
    intelligence.currentState = { mood: moodLabel, energy: energyLabel };

    // Average energy (normalize 1-10 to 1-5)
    const energyValues = moodLogs.map((m) => m.energy / 2);
    intelligence.averageEnergy = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;

    // Mood trend
    const midpoint = Math.floor(moodLogs.length / 2);
    if (midpoint > 1) {
      const firstHalf = moodLogs.slice(0, midpoint);
      const secondHalf = moodLogs.slice(midpoint);

      const avgFirst = firstHalf.reduce((sum, m) => sum + m.mood, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, m) => sum + m.mood, 0) / secondHalf.length;

      if (avgSecond > avgFirst + 0.5) {
        intelligence.recentMoodTrend = 'improving';
      } else if (avgSecond < avgFirst - 0.5) {
        intelligence.recentMoodTrend = 'declining';
      } else {
        intelligence.recentMoodTrend = 'stable';
      }
    }

    // Optimal coaching time (based on when energy is highest)
    const hourlyEnergy: Record<number, number[]> = {};
    for (const moodLog of moodLogs) {
      const hour = new Date(moodLog.date).getHours();
      if (!hourlyEnergy[hour]) hourlyEnergy[hour] = [];
      hourlyEnergy[hour].push(moodLog.energy);
    }

    let bestHour = -1;
    let bestEnergy = 0;
    for (const [hour, energies] of Object.entries(hourlyEnergy)) {
      const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
      if (avg > bestEnergy) {
        bestEnergy = avg;
        bestHour = parseInt(hour);
      }
    }

    if (bestHour >= 0) {
      const period = bestHour < 12 ? 'morning' : bestHour < 17 ? 'afternoon' : 'evening';
      intelligence.optimalCoachingTime = period;
    }

    // Energy patterns
    if (intelligence.averageEnergy < 2.5) {
      intelligence.energyPatterns.push('Consistently low energy - explore root causes');
    } else if (intelligence.averageEnergy > 4) {
      intelligence.energyPatterns.push('High energy available - great for challenging habits');
    }

    if (intelligence.recentMoodTrend === 'declining') {
      intelligence.moodHabitCorrelations.push('Declining mood may impact habit consistency');
    } else if (intelligence.recentMoodTrend === 'improving') {
      intelligence.moodHabitCorrelations.push('Improving mood - habits may be contributing!');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze mood intelligence');
  }

  return intelligence;
}

// ============================================================================
// CROSS-TEAM INSIGHTS: PETER
// ============================================================================

export async function getPeterPatternInsights(userId: string): Promise<string[]> {
  const insights: string[] = [];

  try {
    const store = getFinancialStore();
    await store.loadUserData(userId);

    // Check spending triggers for emotional patterns
    const triggers = store.getRecentSpendingTriggers(userId, 14);
    if (triggers.length >= 3) {
      const emotionCounts = triggers.reduce(
        (acc, t) => {
          acc[t.emotion] = (acc[t.emotion] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const negativeEmotions = ['stressed', 'bored', 'anxious', 'lonely', 'tired'];
      const negativeTotal = negativeEmotions.reduce((sum, e) => sum + (emotionCounts[e] || 0), 0);

      if (negativeTotal >= 3) {
        insights.push(
          `Peter noticed emotional spending patterns - ${negativeTotal} stress-driven purchases in 2 weeks. Root cause opportunity.`
        );

        // Specific emotion insights
        if (emotionCounts['bored'] >= 2) {
          insights.push('Boredom spending detected - a dopamine-healthy habit could help');
        }
        if (emotionCounts['stressed'] >= 2) {
          insights.push('Stress spending pattern - stress-relief habit needed');
        }
      }
    }

    // Check budget correlation with habits
    const budget = store.getMainBudget(userId);
    if (budget) {
      const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
      if (percentUsed > 100) {
        insights.push('Peter flagged over-budget spending. Often correlates with habit struggles.');
      } else if (percentUsed < 50) {
        insights.push('Peter notes strong budget discipline - financial habits are working!');
      }
    }

    // Savings velocity
    const goals = store.getActiveSavingsGoals(userId);
    const progressingGoals = goals.filter((g) => g.currentAmount / g.targetAmount > 0.3);
    if (progressingGoals.length > 0) {
      insights.push(
        `${progressingGoals.length} savings goal(s) progressing - financial habits building`
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Peter insights for Maya');
  }

  return insights;
}

// ============================================================================
// CROSS-TEAM INSIGHTS: JORDAN
// ============================================================================

export function getJordanGoalInsights(userId: string): string[] {
  const insights: string[] = [];

  try {
    const store = getFinancialStore();
    const goals = store.getActiveSavingsGoals(userId);

    for (const goal of goals) {
      const progress = goal.currentAmount / goal.targetAmount;

      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 30 && progress < 0.8) {
          insights.push(
            `Jordan's "${goal.name}" - ${daysLeft} days left, ${Math.round(progress * 100)}% done. Habit support needed!`
          );
        }

        if (daysLeft <= 7 && progress < 0.9) {
          insights.push(
            `⚠️ URGENT: "${goal.name}" deadline in ${daysLeft} days - daily habit push needed`
          );
        }
      }

      if (progress >= 0.9 && progress < 1) {
        insights.push(
          `"${goal.name}" at ${Math.round(progress * 100)}% - one final push! Jordan's celebrating soon.`
        );
      }

      if (progress >= 1) {
        insights.push(
          `🎉 "${goal.name}" COMPLETE! Jordan wants to celebrate - the habits paid off!`
        );
      }
    }

    // Life stage transitions
    const transitionGoals = goals.filter(
      (g) =>
        g.name.toLowerCase().includes('wedding') ||
        g.name.toLowerCase().includes('baby') ||
        g.name.toLowerCase().includes('house') ||
        g.name.toLowerCase().includes('move')
    );

    if (transitionGoals.length > 0) {
      insights.push(
        `Life transition detected (${transitionGoals[0].name}) - habits may need adjustment`
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Jordan insights for Maya');
  }

  return insights;
}

// ============================================================================
// MEMORY INSIGHTS
// ============================================================================

export function getMemoryInsights(userId: string): MemoryInsights {
  const insights: MemoryInsights = {
    totalHabitConversations: 0,
    previousWins: [],
    previousStruggles: [],
    coachingApproachesTried: [],
    whatWorked: [],
    whatDidntWork: [],
  };

  try {
    const store = getProductivityStore();
    const userData = store.getFullUserData(userId);

    // Weekly reflections contain coaching history
    const reflections = userData.weeklyReflections || [];
    insights.totalHabitConversations = reflections.length;

    // Extract patterns from reflections
    for (const reflection of reflections.slice(-5)) {
      if (reflection.wins) {
        insights.previousWins.push(...reflection.wins.slice(0, 2));
      }
      if (reflection.challenges) {
        insights.previousStruggles.push(...reflection.challenges.slice(0, 2));
      }
      if (reflection.insights) {
        insights.whatWorked.push(...reflection.insights.slice(0, 1));
      }
    }

    // Deduplicate
    insights.previousWins = [...new Set(insights.previousWins)].slice(0, 5);
    insights.previousStruggles = [...new Set(insights.previousStruggles)].slice(0, 5);
    insights.whatWorked = [...new Set(insights.whatWorked)].slice(0, 3);
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get memory insights');
  }

  return insights;
}
