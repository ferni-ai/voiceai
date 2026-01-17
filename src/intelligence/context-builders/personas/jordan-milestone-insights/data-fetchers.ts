/**
 * Jordan Milestone Insights - Data Fetchers
 *
 * Functions to fetch data from various stores (cross-team integration).
 *
 * @module intelligence/context-builders/jordan-milestone-insights/data-fetchers
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
import { getGamificationStore } from '../../../../services/engagement/gamification-store.js';
import { getMemoryOrchestrator } from '../../../../memory/orchestrator.js';

import type {
  GoalsOverview,
  PeterFinancialInsights,
  HabitInsights,
  MoodInsights,
  MemoryInsights,
} from './types.js';

const log = createLogger({ module: 'context:jordan-data-fetchers' });

// ============================================================================
// GOALS OVERVIEW ANALYSIS
// ============================================================================

export async function analyzeGoalsOverview(userId: string): Promise<GoalsOverview> {
  const overview: GoalsOverview = {
    activeGoals: 0,
    nearingCompletion: [],
    atRisk: [],
    recentlyAchieved: [],
    totalSavedTowardGoals: 0,
    biggestGoal: null,
    milestoneDates: [],
  };

  try {
    const store = getFinancialStore();
    await store.loadUserData(userId);
    const goals = store.getActiveSavingsGoals(userId);

    overview.activeGoals = goals.length;

    for (const goal of goals) {
      const progress = goal.currentAmount / goal.targetAmount;
      overview.totalSavedTowardGoals += goal.currentAmount;

      // Nearing completion (80%+)
      if (progress >= 0.8 && progress < 1) {
        overview.nearingCompletion.push(`${goal.name} (${Math.round(progress * 100)}%)`);
      }

      // Completed recently
      if (progress >= 1) {
        overview.recentlyAchieved.push(goal.name);
      }

      // At risk (has deadline, behind schedule)
      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const daysAway = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Track milestone dates
        if (daysAway > 0 && daysAway <= 90) {
          overview.milestoneDates.push({
            name: goal.name,
            date: deadline,
            daysAway,
          });
        }

        const totalDays = Math.ceil(
          (deadline.getTime() - new Date(goal.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysElapsed = Math.ceil(
          (now.getTime() - new Date(goal.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
        );
        const expectedProgress = totalDays > 0 ? daysElapsed / totalDays : 0;

        if (progress < expectedProgress * 0.7) {
          overview.atRisk.push(goal.name);
        }
      }

      // Track biggest goal
      if (!overview.biggestGoal || goal.targetAmount > overview.biggestGoal.targetAmount) {
        overview.biggestGoal = {
          name: goal.name,
          progress: Math.round(progress * 100),
          targetAmount: goal.targetAmount,
        };
      }
    }

    // Sort milestone dates by proximity
    overview.milestoneDates.sort((a, b) => a.daysAway - b.daysAway);
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze goals overview');
  }

  return overview;
}

// ============================================================================
// PETER'S FINANCIAL INSIGHTS (Cross-Team)
// ============================================================================

export async function getPeterFinancialInsights(userId: string): Promise<PeterFinancialInsights> {
  const insights: PeterFinancialInsights = {
    budgetHealth: 'good',
    savingsVelocity: 'unknown',
    monthsToGoalCompletion: null,
    eventBudgetCapacity: 0,
    financialReadiness: [],
  };

  try {
    const store = getFinancialStore();
    await store.loadUserData(userId);

    const budget = store.getMainBudget(userId);
    const goals = store.getActiveSavingsGoals(userId);

    if (budget) {
      const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
      const remaining = budget.monthlyLimit - budget.spent;

      // Determine budget health
      if (percentUsed < 50) {
        insights.budgetHealth = 'excellent';
        insights.financialReadiness.push(
          `Peter confirms: Budget healthy at ${Math.round(percentUsed)}% - excellent runway for milestone planning!`
        );
      } else if (percentUsed < 75) {
        insights.budgetHealth = 'good';
        insights.financialReadiness.push(
          `Peter notes: Budget at ${Math.round(percentUsed)}% - solid foundation for planning`
        );
      } else if (percentUsed < 90) {
        insights.budgetHealth = 'tight';
        insights.financialReadiness.push(
          `Peter flags: Budget at ${Math.round(percentUsed)}% - timeline planning should account for this`
        );
      } else {
        insights.budgetHealth = 'stressed';
        insights.financialReadiness.push(
          `Peter warns: Budget stretched at ${Math.round(percentUsed)}% - may need to adjust milestone timelines`
        );
      }

      insights.eventBudgetCapacity = remaining;

      // Calculate savings velocity
      if (goals.length > 0) {
        const totalNeeded = goals.reduce((sum, g) => sum + (g.targetAmount - g.currentAmount), 0);
        const savingsCapacity = remaining * 0.3; // Assume 30% could go to savings

        if (savingsCapacity > 0 && totalNeeded > 0) {
          const monthsNeeded = totalNeeded / savingsCapacity;
          insights.monthsToGoalCompletion = Math.ceil(monthsNeeded);

          if (monthsNeeded < 6) {
            insights.savingsVelocity = 'rapid';
            insights.financialReadiness.push(
              `🚀 Peter calculates: ALL goals achievable in ~${Math.ceil(monthsNeeded)} months at current pace!`
            );
          } else if (monthsNeeded < 12) {
            insights.savingsVelocity = 'steady';
            insights.financialReadiness.push(
              `Peter projects: Goals on track for completion within ${Math.ceil(monthsNeeded)} months`
            );
          } else {
            insights.savingsVelocity = 'gradual';
            insights.financialReadiness.push(
              `Peter notes: Current pace suggests ${Math.ceil(monthsNeeded)} months to goal completion - may need acceleration`
            );
          }
        }
      }
    }

    // Check for celebration-related spending
    const triggers = store.getRecentSpendingTriggers(userId, 30);
    const celebrationSpending = triggers.filter(
      (t) => t.emotion === 'celebratory' || t.emotion === 'happy'
    );
    if (celebrationSpending.length >= 2) {
      insights.financialReadiness.push(
        `🎊 Peter noticed ${celebrationSpending.length} celebration purchases recently - someone's hitting milestones!`
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Peter insights for Jordan');
  }

  return insights;
}

// ============================================================================
// MAYA'S HABIT INSIGHTS (Cross-Team)
// ============================================================================

export async function getMayaHabitInsights(userId: string): Promise<HabitInsights> {
  const insights: HabitInsights = {
    activeHabits: 0,
    keystoneHabits: [],
    currentStreaks: [],
    atRiskHabits: [],
    averageSuccessRate: 0,
    planningRelatedHabits: [],
    momentumScore: 50,
  };

  try {
    const store = getProductivityStore();
    const userData = store.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    insights.activeHabits = activeHabits.length;

    if (activeHabits.length === 0) {
      insights.momentumScore = 30;
      return insights;
    }

    // Find keystone habits
    insights.keystoneHabits = activeHabits
      .filter((h) => h.isKeystone && h.keystoneScore && h.keystoneScore > 0.6)
      .map((h) => h.name);

    // Current streaks
    insights.currentStreaks = activeHabits
      .filter((h) => h.currentStreak >= 3)
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 5)
      .map((h) => ({ name: h.name, streak: h.currentStreak }));

    // At-risk habits
    insights.atRiskHabits = activeHabits
      .filter((h) => h.longestStreak >= 7 && h.currentStreak <= 1)
      .map((h) => h.name);

    // Success rate
    if (activeHabits.length > 0) {
      insights.averageSuccessRate =
        activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;
    }

    // Planning-related habits
    const planningKeywords = ['plan', 'goal', 'save', 'budget', 'organize', 'prep', 'review'];
    insights.planningRelatedHabits = activeHabits
      .filter((h) => planningKeywords.some((k) => h.name.toLowerCase().includes(k)))
      .map((h) => `${h.name} (${h.currentStreak}d streak)`);

    // Calculate momentum score
    let momentum = 50;
    if (insights.keystoneHabits.length > 0) momentum += 15;
    if (insights.averageSuccessRate > 0.7) momentum += 15;
    if (insights.currentStreaks.length >= 3) momentum += 10;
    if (insights.atRiskHabits.length > 2) momentum -= 15;
    insights.momentumScore = Math.max(0, Math.min(100, momentum));
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Maya insights for Jordan');
  }

  return insights;
}

// ============================================================================
// MOOD/ENERGY PATTERNS
// ============================================================================

export async function getMoodPatterns(userId: string): Promise<MoodInsights> {
  const insights: MoodInsights = {
    recentMoodTrend: 'unknown',
    averageEnergy: 3,
    celebrationReadiness: 'moderate',
    lastMood: null,
  };

  try {
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const moodLogs = await gamificationStore.getMoodLogs(userId, twoWeeksAgo, now);

    if (moodLogs.length === 0) return insights;

    // Last mood
    const lastLog = moodLogs[moodLogs.length - 1];
    const moodLabel = lastLog.mood <= 3 ? 'low' : lastLog.mood <= 6 ? 'moderate' : 'high';
    const energyLabel = lastLog.energy <= 3 ? 'low' : lastLog.energy <= 6 ? 'moderate' : 'high';
    insights.lastMood = { mood: moodLabel, energy: energyLabel };

    // Energy average
    const energyValues = moodLogs.map((m) => m.energy / 2);
    if (energyValues.length > 0) {
      insights.averageEnergy =
        energyValues.reduce((a: number, b: number) => a + b, 0) / energyValues.length;
    }

    // Mood trend
    const midpoint = Math.floor(moodLogs.length / 2);
    if (midpoint > 1) {
      const firstHalf = moodLogs.slice(0, midpoint);
      const secondHalf = moodLogs.slice(midpoint);

      const avgFirst = firstHalf.reduce((sum: number, m) => sum + m.mood, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum: number, m) => sum + m.mood, 0) / secondHalf.length;

      if (avgSecond > avgFirst + 0.5) {
        insights.recentMoodTrend = 'improving';
      } else if (avgSecond < avgFirst - 0.5) {
        insights.recentMoodTrend = 'declining';
      } else {
        insights.recentMoodTrend = 'stable';
      }
    }

    // Celebration readiness based on mood and energy
    const avgMood = moodLogs.reduce((sum, m) => sum + m.mood, 0) / moodLogs.length;
    if (avgMood >= 7 && insights.averageEnergy >= 3.5) {
      insights.celebrationReadiness = 'high';
    } else if (avgMood <= 4 || insights.averageEnergy < 2.5) {
      insights.celebrationReadiness = 'low';
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not fetch mood patterns');
  }

  return insights;
}

// ============================================================================
// MEMORY ORCHESTRATOR INSIGHTS
// ============================================================================

export async function getMemoryOrchestratorInsights(userId: string): Promise<MemoryInsights> {
  const insights: MemoryInsights = {
    totalMemories: 0,
    milestoneMentions: [],
    upcomingAnniversaries: [],
    pastCelebrations: [],
    familyContext: [],
    relationshipMilestones: [],
  };

  try {
    const orchestrator = getMemoryOrchestrator();
    const health = await orchestrator.getMemoryHealth(userId);
    insights.totalMemories = health.totalMemories;

    // Rich memory context available for planning
    if (health.totalMemories > 10) {
      insights.milestoneMentions.push(
        `${health.totalMemories} memories available - can reference past conversations`
      );
    }

    if (health.totalMemories > 20) {
      insights.relationshipMilestones.push(
        `Rich history (${health.totalMemories} memories) - can reference past conversations about life events`
      );
    }

    if (health.recentMemories > 5) {
      insights.milestoneMentions.push(
        `${health.recentMemories} recent memories - active relationship`
      );
    }

    if (health.emotionalMemories > 3) {
      insights.pastCelebrations.push(
        `${health.emotionalMemories} emotionally significant memories - deep context available`
      );
    }

    if (health.commitments > 0) {
      insights.familyContext.push(
        `${health.commitments} active commitments tracked - accountability context available`
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get memory orchestrator insights');
  }

  return insights;
}
