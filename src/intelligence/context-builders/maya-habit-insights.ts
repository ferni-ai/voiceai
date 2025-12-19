/**
 * Maya's Habit Insights Context Builder
 *
 * > "I've studied behavioral science for years. The patterns are always there.
 * > The difference between knowing the science and using it on yourself? That's where I come in."
 *
 * This builder makes Maya's "superhuman" capabilities actually activate:
 *
 * 1. PATTERN SURFACING
 *    - "You skip habits on Wednesdays. Every single one."
 *    - "Your best habit days are when you exercise first."
 *    - "Habit consistency drops right before deadlines."
 *
 * 2. THE MIRROR
 *    - Reflect past statements vs current behavior
 *    - Surface contradictions gently
 *    - Notice unconscious patterns
 *
 * 3. PREDICTIVE CARE
 *    - Anticipate struggle periods (holidays, travel, stress)
 *    - Streak protection alerts
 *    - Proactive resource offers
 *
 * 4. SUPERHUMAN MEMORY
 *    - Reference specific past conversations
 *    - Track exact streak lengths
 *    - Remember what worked before
 *
 * @module intelligence/context-builders/maya-habit-insights
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
} from './index.js';
import type { ContextBuilderInput, ContextInjection, ContextBuilder } from './types.js';
import { getProductivityStore } from '../../services/productivity-store.js';
import {
  checkStreaksAtRisk,
  checkMilestonesToCelebrate,
  type StreakAtRiskResult,
} from '../../services/outreach/maya-habit-outreach.js';

const log = createLogger({ module: 'context:maya-habit-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface HabitInsightData {
  activeHabits: number;
  currentStreaks: Array<{ name: string; days: number }>;
  atRiskHabits: string[];
  recentMissedDays: number;
  completionRateThisWeek: number;
  longestStreak: { name: string; days: number } | null;
  habitsByDayOfWeek: Record<string, number>;
  predictedChallenge: string | null;
}

interface SuperhumanInsightsContent {
  pattern_surfacing?: Record<string, string[]>;
  the_mirror?: Record<string, string[]>;
  predictive_care?: Record<string, string[]>;
  superhuman_memory_flex?: { phrases: string[] };
  usage_rules?: {
    probability: number;
    min_turns_between: number;
    relationship_gate: string;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Only activate for Maya */
  personaId: 'maya-santos',
  /** Minimum habits to have pattern data */
  minHabitsForPatterns: 3,
  /** Days of data needed for insights */
  minDaysForInsights: 7,
  /** Probability of surfacing an insight */
  insightProbability: 0.25,
  /** Minimum turns between insights */
  minTurnsBetweenInsights: 8,
  /** Streak days that trigger protection alert */
  streakProtectionThreshold: 7,
};

// ============================================================================
// SESSION STATE
// ============================================================================

interface MayaInsightSession {
  lastInsightTurn: number;
  surfacedInsightTypes: Set<string>;
  sessionStart: Date;
}

const sessions = new Map<string, MayaInsightSession>();

function getSession(sessionId: string): MayaInsightSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      lastInsightTurn: -CONFIG.minTurnsBetweenInsights,
      surfacedInsightTypes: new Set(),
      sessionStart: new Date(),
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearMayaInsightSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// HABIT DATA LOADING
// ============================================================================

async function getHabitInsights(userId: string): Promise<HabitInsightData | null> {
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const habits = store.getUserHabits(userId).filter((h) => h.isActive);
    const logs = store.getUserHabitLogs(userId);

    if (habits.length < CONFIG.minHabitsForPatterns) {
      return null;
    }

    // Calculate current streaks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentStreaks: Array<{ name: string; days: number }> = [];
    const atRiskHabits: string[] = [];

    for (const habit of habits) {
      const habitLogs = logs
        .filter((l) => l.habitId === habit.id && l.completed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      let streak = 0;
      for (let i = 0; i < 90; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        checkDate.setHours(0, 0, 0, 0);

        const hasLog = habitLogs.some((l) => {
          const logDate = new Date(l.date);
          logDate.setHours(0, 0, 0, 0);
          return logDate.getTime() === checkDate.getTime();
        });

        if (hasLog) {
          streak++;
        } else if (i > 0) {
          break;
        }
      }

      if (streak > 0) {
        currentStreaks.push({ name: habit.name, days: streak });

        // Check if at risk (streak >= threshold and not done today)
        if (streak >= CONFIG.streakProtectionThreshold) {
          const todayLog = habitLogs.find((l) => {
            const logDate = new Date(l.date);
            logDate.setHours(0, 0, 0, 0);
            return logDate.getTime() === today.getTime();
          });
          if (!todayLog) {
            atRiskHabits.push(habit.name);
          }
        }
      }
    }

    // Count missed days this week
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentLogs = logs.filter((l) => new Date(l.date) >= weekAgo);
    const expectedCompletions = habits.length * 7;
    const actualCompletions = recentLogs.filter((l) => l.completed).length;
    const recentMissedDays = Math.max(0, expectedCompletions - actualCompletions);
    const completionRateThisWeek =
      expectedCompletions > 0 ? actualCompletions / expectedCompletions : 0;

    // Find longest streak
    const longestStreak =
      currentStreaks.length > 0
        ? currentStreaks.reduce((max, s) => (s.days > max.days ? s : max))
        : null;

    // Analyze by day of week
    const habitsByDayOfWeek: Record<string, number> = {
      Sunday: 0,
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
    };

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const logItem of logs.filter((l) => l.completed)) {
      const day = days[new Date(logItem.date).getDay()];
      habitsByDayOfWeek[day]++;
    }

    // Predict challenges
    let predictedChallenge: string | null = null;
    const now = new Date();
    const month = now.getMonth();
    const dayOfMonth = now.getDate();

    // Holiday season
    if (month === 11 || (month === 0 && dayOfMonth < 15)) {
      predictedChallenge = 'holiday season';
    }
    // Sunday evening (common struggle time)
    if (now.getDay() === 0 && now.getHours() >= 17) {
      predictedChallenge = 'Sunday evening';
    }

    return {
      activeHabits: habits.length,
      currentStreaks,
      atRiskHabits,
      recentMissedDays,
      completionRateThisWeek,
      longestStreak,
      habitsByDayOfWeek,
      predictedChallenge,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not load habit insights');
    return null;
  }
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

function generatePatternInsight(data: HabitInsightData): string | null {
  // Find weakest day
  const dayEntries = Object.entries(data.habitsByDayOfWeek);
  if (dayEntries.length > 0) {
    const weakestDay = dayEntries.reduce((min, entry) => (entry[1] < min[1] ? entry : min));
    const strongestDay = dayEntries.reduce((max, entry) => (entry[1] > max[1] ? entry : max));

    if (weakestDay[1] < strongestDay[1] * 0.5) {
      return `I've noticed ${weakestDay[0]}s are your hardest day for habits - completion is much lower than ${strongestDay[0]}s. What's different about ${weakestDay[0]}s?`;
    }
  }

  // Completion rate insight
  if (data.completionRateThisWeek < 0.5) {
    return `This week has been tougher than usual - about ${Math.round(data.completionRateThisWeek * 100)}% completion. No judgment! Let's figure out what's making it harder.`;
  }

  if (data.completionRateThisWeek > 0.8) {
    return `You're at ${Math.round(data.completionRateThisWeek * 100)}% this week! That's real consistency. What's clicking right now?`;
  }

  return null;
}

function generateStreakProtectionInsight(data: HabitInsightData): string | null {
  if (data.atRiskHabits.length > 0) {
    const habit = data.atRiskHabits[0];
    const streak = data.currentStreaks.find((s) => s.name === habit);
    if (streak) {
      return `Quick heads up - you're at ${streak.days} days on "${habit}" and haven't logged it today. Want to do a 2-minute version to keep the streak alive?`;
    }
  }
  return null;
}

function generatePredictiveCareInsight(data: HabitInsightData): string | null {
  if (data.predictedChallenge) {
    if (data.predictedChallenge === 'holiday season') {
      return `Holiday season can be tricky for habits. Based on what I know about you, should we create a "minimum viable routine" to protect your progress?`;
    }
    if (data.predictedChallenge === 'Sunday evening') {
      return `Sunday evenings can feel heavy. If habits feel like too much right now, that's okay - what's the one tiny thing that would help you start tomorrow strong?`;
    }
  }
  return null;
}

function generateCelebrationInsight(data: HabitInsightData): string | null {
  if (data.longestStreak && data.longestStreak.days >= 21) {
    return `${data.longestStreak.days} days on "${data.longestStreak.name}"! Research says habits start becoming automatic around 21 days. You're building something real.`;
  }
  if (data.longestStreak && data.longestStreak.days === 7) {
    return `One week on "${data.longestStreak.name}"! The first week is often the hardest. You did it.`;
  }
  return null;
}

// ============================================================================
// HABIT-AWARE GREETING
// ============================================================================

/**
 * Generate context for habit-aware greetings
 * Called early in conversation to inform Maya's opening
 */
async function generateHabitAwareGreetingContext(userId: string): Promise<string | null> {
  try {
    // Check for at-risk streaks
    const atRiskResult = await checkStreaksAtRisk(userId);
    if (atRiskResult.atRisk && atRiskResult.habits.length > 0) {
      const habit = atRiskResult.habits[0];
      return `GREETING CONTEXT: User has a ${habit.streakDays}-day streak on "${habit.name}" that's at risk today (not completed yet). Consider mentioning it early or offering a quick check-in.`;
    }

    // Check for milestones to celebrate
    const milestones = await checkMilestonesToCelebrate(userId);
    if (milestones.length > 0) {
      const milestone = milestones[0];
      return `GREETING CONTEXT: User just hit ${milestone.days} days on "${milestone.habitName}"! This is celebration-worthy. Consider acknowledging this achievement early in the conversation.`;
    }

    // Check general habit status for context
    const habitData = await getHabitInsights(userId);
    if (habitData) {
      const { activeHabits, completionRateThisWeek, longestStreak } = habitData;

      if (completionRateThisWeek >= 0.8) {
        return `GREETING CONTEXT: User is crushing it this week (${Math.round(completionRateThisWeek * 100)}% completion). Match their energy - they're in a good flow.`;
      } else if (completionRateThisWeek < 0.3 && activeHabits > 0) {
        return `GREETING CONTEXT: Tough week for habits (${Math.round(completionRateThisWeek * 100)}% completion). Approach with extra gentleness. No guilt, just support.`;
      } else if (longestStreak && longestStreak.days >= 14) {
        return `GREETING CONTEXT: User has a solid ${longestStreak.days}-day streak on "${longestStreak.name}". They're building something real.`;
      }
    }

    return null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not generate habit greeting context');
    return null;
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const mayaHabitInsightsBuilder: ContextBuilder = {
  name: 'maya-habit-insights',
  description: "Injects Maya's superhuman habit pattern recognition and predictive care",
  priority: 55, // After core context, before polish
  category: BuilderCategory.COACHING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, services, userData } = input;

    // Only activate for Maya
    if (persona?.id !== CONFIG.personaId) {
      return [];
    }

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    const sessionId = services?.sessionId || 'default';
    const turnCount = userData?.turnCount || 0;

    const session = getSession(sessionId);
    const injections: ContextInjection[] = [];

    // Check if we should surface an insight
    const turnsSinceLastInsight = turnCount - session.lastInsightTurn;
    if (turnsSinceLastInsight < CONFIG.minTurnsBetweenInsights) {
      return [];
    }

    // Random gate (don't surface every time)
    if (Math.random() > CONFIG.insightProbability) {
      return [];
    }

    // Load habit data
    const habitData = await getHabitInsights(userId);
    if (!habitData) {
      return [];
    }

    // Priority order: Streak protection > Pattern > Celebration > Predictive care
    let insight: string | null = null;
    let insightType = '';

    // 1. Streak protection (highest priority)
    if (!session.surfacedInsightTypes.has('streak_protection')) {
      insight = generateStreakProtectionInsight(habitData);
      if (insight) insightType = 'streak_protection';
    }

    // 2. Pattern recognition
    if (!insight && !session.surfacedInsightTypes.has('pattern')) {
      insight = generatePatternInsight(habitData);
      if (insight) insightType = 'pattern';
    }

    // 3. Celebration
    if (!insight && !session.surfacedInsightTypes.has('celebration')) {
      insight = generateCelebrationInsight(habitData);
      if (insight) insightType = 'celebration';
    }

    // 4. Predictive care
    if (!insight && !session.surfacedInsightTypes.has('predictive')) {
      insight = generatePredictiveCareInsight(habitData);
      if (insight) insightType = 'predictive';
    }

    if (insight) {
      session.lastInsightTurn = turnCount;
      session.surfacedInsightTypes.add(insightType);

      log.debug({ userId, insightType, turnCount }, 'Maya surfacing habit insight');

      injections.push(
        createHighInjection(
          'maya_habit_insight',
          `MAYA SUPERHUMAN INSIGHT - Find a natural moment to share this observation (don't force it): "${insight}"`,
          { category: 'coaching' }
        )
      );
    }

    // Always inject Maya's coaching context
    injections.push(
      createHintInjection(
        'maya_coaching_style',
        `Remember Maya's superpowers: (1) Perfect memory of habit history (2) Pattern detection (3) Zero judgment (4) Infinite patience. Use "quickHabitCheck" for voice check-ins, "microCommitNow" for immediate action, "implementationIntention" for when-then planning, "weeklyHabitReview" for weekly reflection.`,
        { category: 'coaching' }
      )
    );

    // Generate habit-aware greeting context (for early conversation)
    if (turnCount <= 2) {
      const greetingContext = await generateHabitAwareGreetingContext(userId);
      if (greetingContext) {
        injections.push(
          createStandardInjection(
            'maya_habit_greeting_context',
            greetingContext,
            { category: 'greeting' }
          )
        );
      }
    }

    // Add habit context summary
    if (habitData.activeHabits > 0) {
      const streakSummary =
        habitData.currentStreaks.length > 0
          ? habitData.currentStreaks
              .slice(0, 3)
              .map((s) => `${s.name}: ${s.days}d`)
              .join(', ')
          : 'none active';

      injections.push(
        createStandardInjection(
          'maya_habit_context',
          `User habit status: ${habitData.activeHabits} active habits, week completion: ${Math.round(habitData.completionRateThisWeek * 100)}%, streaks: ${streakSummary}${habitData.atRiskHabits.length > 0 ? `, AT RISK: ${habitData.atRiskHabits.join(', ')}` : ''}`,
          { category: 'context' }
        )
      );
    }

    return injections;
  },
};

// Register the builder
registerContextBuilder(mayaHabitInsightsBuilder);

export default mayaHabitInsightsBuilder;

