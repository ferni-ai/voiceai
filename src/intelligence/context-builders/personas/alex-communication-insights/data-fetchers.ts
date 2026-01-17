/**
 * Data fetching functions for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/data-fetchers
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
import { getGamificationStore } from '../../../../services/engagement/gamification-store.js';
import type {
  UserStateSnapshot,
  UpcomingPriority,
  MemoryContext,
  ProductivityUserData,
} from './types.js';

const log = createLogger({ module: 'context:alex-data-fetchers' });

// ============================================================================
// USER STATE SNAPSHOT
// ============================================================================

export async function getUserStateSnapshot(userId: string): Promise<UserStateSnapshot> {
  const snapshot: UserStateSnapshot = {
    stressLevel: 'unknown',
    stressSignals: [],
    energyLevel: 'unknown',
    productivityMomentum: 'unknown',
    timeOfDayContext: getTimeOfDayContext(),
    optimalCommunicationWindow: null,
  };

  try {
    // Get stress signals from financial patterns (Peter's domain)
    const financialStore = getFinancialStore();
    const triggers = financialStore.getUserSpendingTriggers(userId);

    if (triggers.length > 0) {
      const stressTriggers = triggers.filter((t) =>
        ['stressed', 'anxious', 'overwhelmed', 'tired'].includes(t.emotion?.toLowerCase() || '')
      );

      if (stressTriggers.length >= 3) {
        snapshot.stressLevel = 'high';
        snapshot.stressSignals.push('Multiple stress-related spending triggers detected');
      } else if (stressTriggers.length >= 1) {
        snapshot.stressLevel = 'moderate';
        snapshot.stressSignals.push('Some stress indicators in spending patterns');
      } else {
        snapshot.stressLevel = 'low';
      }
    }

    // Get energy/productivity signals from habits (Maya's domain)
    const productivityStore = getProductivityStore();
    const userData = (
      productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }
    ).getFullUserData?.(userId);
    const enhancedHabits = userData?.enhancedHabits || [];
    const activeHabits = enhancedHabits.filter((h) => h.isActive && !h.isPaused);

    if (activeHabits.length > 0) {
      const totalStreaks = activeHabits.reduce((sum, h) => sum + (h.currentStreak || 0), 0);
      const avgSuccessRate =
        activeHabits.reduce((sum, h) => sum + (h.successRate || 0), 0) / activeHabits.length;

      if (avgSuccessRate >= 0.7 && totalStreaks >= 5) {
        snapshot.productivityMomentum = 'building';
        snapshot.energyLevel = 'high';
      } else if (avgSuccessRate >= 0.5) {
        snapshot.productivityMomentum = 'stable';
        snapshot.energyLevel = 'moderate';
      } else {
        snapshot.productivityMomentum = 'struggling';
        snapshot.energyLevel = 'low';
        snapshot.stressSignals.push('Habit completion rate is low');
      }
    }

    // Get mood signals from gamification store
    const gamificationStore = getGamificationStore();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const moodLogs = await gamificationStore.getMoodLogs(userId, weekAgo, now);

    if (moodLogs.length > 0) {
      const recentMoods = moodLogs.slice(0, 3);
      const lowMoods = recentMoods.filter((m) => m.mood <= 4);

      if (lowMoods.length >= 2) {
        snapshot.stressLevel = 'high';
        snapshot.stressSignals.push('Recent mood logs indicate stress');
      }

      // Find optimal communication window
      const hourlyMoods: Record<number, number[]> = {};
      for (const log of moodLogs) {
        const hour = new Date(log.date).getHours();
        if (!hourlyMoods[hour]) hourlyMoods[hour] = [];
        hourlyMoods[hour].push(log.mood);
      }

      let bestHour = -1;
      let bestMood = 0;
      for (const [hour, moods] of Object.entries(hourlyMoods)) {
        const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
        if (avg > bestMood) {
          bestMood = avg;
          bestHour = parseInt(hour);
        }
      }

      if (bestHour >= 0) {
        const period = bestHour < 12 ? 'morning' : bestHour < 17 ? 'afternoon' : 'evening';
        snapshot.optimalCommunicationWindow = period;
      }
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to get user state snapshot');
  }

  return snapshot;
}

export function getTimeOfDayContext(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Morning - peak energy for difficult conversations';
  if (hour >= 12 && hour < 17) return 'Afternoon - good for routine coordination';
  if (hour >= 17 && hour < 21) return 'Evening - best for reflective conversations';
  return 'Late night - emotional conversations common, handle with care';
}

// ============================================================================
// UPCOMING PRIORITIES
// ============================================================================

export function getUpcomingPriorities(userId: string): UpcomingPriority[] {
  const priorities: UpcomingPriority[] = [];

  try {
    // Get upcoming goals/deadlines from financial store (Jordan's data)
    const financialStore = getFinancialStore();
    const goals = financialStore.getUserSavingsGoals(userId);

    for (const goal of goals) {
      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 7 && daysUntil > 0) {
          priorities.push({
            type: 'deadline',
            description: `${goal.name} deadline in ${daysUntil} days`,
            urgency: daysUntil <= 2 ? 'critical' : 'high',
            source: 'jordan',
            actionNeeded: 'Schedule final push or communication about adjustments',
            daysUntil,
          });
        } else if (daysUntil <= 30 && daysUntil > 0) {
          priorities.push({
            type: 'deadline',
            description: `${goal.name} coming up in ${Math.round(daysUntil / 7)} weeks`,
            urgency: 'medium',
            source: 'jordan',
            daysUntil,
          });
        }

        // Celebration opportunity
        const progress = goal.currentAmount / goal.targetAmount;
        if (progress >= 1) {
          priorities.push({
            type: 'event',
            description: `🎉 "${goal.name}" COMPLETE - announce/celebrate!`,
            urgency: 'medium',
            source: 'jordan',
            actionNeeded: 'Draft celebration message or announcement',
          });
        }
      }
    }

    // Get habits that might need check-ins (Maya's data)
    const productivityStore = getProductivityStore();
    const userData = (
      productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }
    ).getFullUserData?.(userId);
    const enhancedHabits = userData?.enhancedHabits || [];
    const activeHabits = enhancedHabits.filter((h) => h.isActive && !h.isPaused);

    const strugglingHabits = activeHabits.filter(
      (h) => (h.longestStreak || 0) >= 7 && (h.currentStreak || 0) <= 1
    );

    for (const habit of strugglingHabits) {
      priorities.push({
        type: 'check-in',
        description: `"${habit.name}" streak broken - was ${habit.longestStreak} days`,
        urgency: 'medium',
        source: 'maya',
        actionNeeded: 'Schedule reflection or accountability check-in',
      });
    }

    // Milestone celebrations
    const milestonePriorities = activeHabits.filter(
      (h) => h.currentStreak === 7 || h.currentStreak === 30 || h.currentStreak === 100
    );
    for (const habit of milestonePriorities) {
      priorities.push({
        type: 'event',
        description: `🎉 "${habit.name}" hit ${habit.currentStreak} days!`,
        urgency: 'low',
        source: 'maya',
        actionNeeded: 'Celebrate! Maybe share with someone?',
      });
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to get upcoming priorities');
  }

  return priorities;
}

// ============================================================================
// MEMORY CONTEXT
// ============================================================================

export function getMemoryContext(userId: string): MemoryContext {
  const context: MemoryContext = {
    previousCommunicationTopics: [],
    scriptsThatWorked: [],
    pendingFollowUps: [],
    relationshipNotes: [],
  };

  try {
    const productivityStore = getProductivityStore();
    const userData = (
      productivityStore as unknown as { getFullUserData: (id: string) => ProductivityUserData }
    ).getFullUserData?.(userId);

    // Extract from weekly reflections
    const reflections = userData?.weeklyReflections || [];
    for (const reflection of reflections.slice(-5)) {
      if (reflection.challenges) {
        // Communication challenges often appear here
        const commChallenges = reflection.challenges.filter(
          (c) =>
            c.toLowerCase().includes('conversation') ||
            c.toLowerCase().includes('tell') ||
            c.toLowerCase().includes('ask')
        );
        context.previousCommunicationTopics.push(...commChallenges);
      }
      if (reflection.wins) {
        // Successful communications
        const commWins = reflection.wins.filter(
          (w) =>
            w.toLowerCase().includes('conversation') ||
            w.toLowerCase().includes('told') ||
            w.toLowerCase().includes('asked')
        );
        context.scriptsThatWorked.push(...commWins);
      }
    }

    // Deduplicate
    context.previousCommunicationTopics = [...new Set(context.previousCommunicationTopics)].slice(
      0,
      5
    );
    context.scriptsThatWorked = [...new Set(context.scriptsThatWorked)].slice(0, 3);
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get memory context');
  }

  return context;
}
