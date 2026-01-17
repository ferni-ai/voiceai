/**
 * Nayan's Wisdom Insights - Life Synthesis
 *
 * Synthesizes the big picture of a user's life from all available data.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/life-synthesis
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
import type { LifeSynthesis } from './types.js';

const log = createLogger({ module: 'nayan:life-synthesis' });

// ============================================================================
// LIFE SYNTHESIS (The Big Picture)
// ============================================================================

export async function synthesizeLifeContext(userId: string): Promise<LifeSynthesis> {
  const synthesis: LifeSynthesis = {
    lifeChapter: 'unknown',
    dominantTheme: null,
    growthPattern: 'unknown',
    compoundingAreas: [],
    valuesRevealed: [],
    timeHorizon: 'unknown',
    seasonOfLife: 'unknown',
  };

  try {
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const goals = financialStore.getActiveSavingsGoals(userId);
    const budget = financialStore.getMainBudget(userId);

    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    // Infer life chapter from goals
    if (goals.length > 0) {
      const goalNames = goals.map((g) => g.name.toLowerCase());
      if (
        goalNames.some(
          (n) => n.includes('retire') || n.includes('freedom') || n.includes('sabbatical')
        )
      ) {
        synthesis.lifeChapter = 'freedom-seeking';
        synthesis.dominantTheme = 'Liberation from constraint';
      } else if (
        goalNames.some((n) => n.includes('house') || n.includes('home') || n.includes('apartment'))
      ) {
        synthesis.lifeChapter = 'nesting';
        synthesis.dominantTheme = 'Creating sanctuary';
      } else if (
        goalNames.some((n) => n.includes('wedding') || n.includes('family') || n.includes('baby'))
      ) {
        synthesis.lifeChapter = 'partnership-building';
        synthesis.dominantTheme = 'Weaving lives together';
      } else if (
        goalNames.some((n) => n.includes('emergency') || n.includes('safety') || n.includes('debt'))
      ) {
        synthesis.lifeChapter = 'foundation-building';
        synthesis.dominantTheme = 'Creating solid ground';
      } else if (
        goalNames.some(
          (n) => n.includes('business') || n.includes('startup') || n.includes('launch')
        )
      ) {
        synthesis.lifeChapter = 'creation';
        synthesis.dominantTheme = 'Bringing something new to life';
      } else if (
        goalNames.some(
          (n) => n.includes('education') || n.includes('degree') || n.includes('learn')
        )
      ) {
        synthesis.lifeChapter = 'expansion';
        synthesis.dominantTheme = 'Growing into new possibilities';
      } else {
        synthesis.lifeChapter = 'active-growth';
        synthesis.dominantTheme = 'Becoming who they are meant to be';
      }
    }

    // Infer growth pattern from habits
    if (activeHabits.length === 0) {
      synthesis.growthPattern = 'resting';
    } else {
      const totalStreaks = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0);
      const avgSuccess =
        activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;

      if (totalStreaks > 50 && avgSuccess > 0.7) {
        synthesis.growthPattern = 'integrating';
      } else if (activeHabits.length >= 5 && avgSuccess < 0.5) {
        synthesis.growthPattern = 'striving';
      } else if (goals.length > 0 && activeHabits.length > 0) {
        synthesis.growthPattern = 'transitioning';
      } else {
        synthesis.growthPattern = 'integrating';
      }
    }

    // Season of life
    const hour = new Date().getHours();
    const month = new Date().getMonth();
    const seasonName =
      month >= 2 && month <= 4
        ? 'spring'
        : month >= 5 && month <= 7
          ? 'summer'
          : month >= 8 && month <= 10
            ? 'autumn'
            : 'winter';
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    synthesis.seasonOfLife = `${seasonName} ${timeOfDay}`;

    // Infer values from where money and time go
    if (budget) {
      const budgetRatio = budget.spent / budget.monthlyLimit;
      if (budgetRatio < 0.7) {
        synthesis.valuesRevealed.push('Financial discipline - saving for tomorrow');
      } else if (budgetRatio > 1.1) {
        synthesis.valuesRevealed.push('Present-moment living - perhaps at a cost');
      }
    }

    // Values from habits
    for (const habit of activeHabits) {
      const name = habit.name.toLowerCase();
      if (name.includes('meditat') || name.includes('mindful')) {
        synthesis.valuesRevealed.push('Inner peace and presence');
      }
      if (name.includes('exercise') || name.includes('gym') || name.includes('workout')) {
        synthesis.valuesRevealed.push('Physical vitality');
      }
      if (name.includes('read') || name.includes('learn') || name.includes('study')) {
        synthesis.valuesRevealed.push('Continuous growth');
      }
      if (name.includes('journal') || name.includes('write') || name.includes('reflect')) {
        synthesis.valuesRevealed.push('Self-understanding');
      }
      if (name.includes('gratitude') || name.includes('thankful')) {
        synthesis.valuesRevealed.push('Appreciation and presence');
      }
    }

    // Deduplicate values
    synthesis.valuesRevealed = [...new Set(synthesis.valuesRevealed)];

    // Values from goals
    if (
      goals.some(
        (g) => g.name.toLowerCase().includes('vacation') || g.name.toLowerCase().includes('travel')
      )
    ) {
      synthesis.valuesRevealed.push('Experience and adventure');
    }
    if (
      goals.some(
        (g) => g.name.toLowerCase().includes('gift') || g.name.toLowerCase().includes('charity')
      )
    ) {
      synthesis.valuesRevealed.push('Generosity');
    }

    // Compounding areas (where growth is happening)
    const longestStreaks = activeHabits.filter((h) => h.currentStreak >= 7);
    if (longestStreaks.length > 0) {
      synthesis.compoundingAreas.push(`${longestStreaks.length} habit(s) compounding`);
    }
    const progressingGoals = goals.filter((g) => g.currentAmount / g.targetAmount > 0.5);
    if (progressingGoals.length > 0) {
      synthesis.compoundingAreas.push(`${progressingGoals.length} goal(s) past halfway`);
    }

    // Time horizon from goals
    const goalsWithDeadlines = goals.filter((g) => g.deadline);
    if (goalsWithDeadlines.length > 0) {
      const furthestDeadline = Math.max(
        ...goalsWithDeadlines.map((g) => new Date(g.deadline!).getTime())
      );
      const monthsAway = Math.ceil((furthestDeadline - Date.now()) / (1000 * 60 * 60 * 24 * 30));
      if (monthsAway > 60) {
        synthesis.timeHorizon = 'long';
      } else if (monthsAway > 12) {
        synthesis.timeHorizon = 'medium';
      } else {
        synthesis.timeHorizon = 'short';
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not synthesize life context');
  }

  return synthesis;
}
