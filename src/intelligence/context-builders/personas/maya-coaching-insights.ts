/**
 * Maya's Coaching Insights Context Builder
 *
 * > "Progress isn't linear. Setbacks are data, not failure."
 *
 * ============================================================================
 * DISTINCTION FROM maya-habit-insights.ts:
 * ============================================================================
 *
 * This builder (`maya-coaching-insights`) focuses on:
 * - CROSS-TEAM INTEGRATION: Data from Peter, Jordan, Alex, Nayan
 * - COMPUTED METRICS: Consistency Index, Cascade Potential, Momentum, etc.
 * - PROACTIVE TRIGGERS: Celebration, support, challenge opportunities
 * - FOUR TENDENCIES: Coaching approach based on user type
 * - SUPERHUMAN SERVICES: Commitments, capacity, predictions
 *
 * The other builder (`maya-habit-insights`) focuses on:
 * - HABIT-SPECIFIC data: streaks, completions, patterns
 * - PATTERN SURFACING: Weekly patterns, time-of-day insights
 * - STREAK PROTECTION: Risk alerts, milestone celebrations
 * - PREDICTIVE CARE: Anticipating struggle periods
 *
 * WHEN THEY ACTIVATE:
 * - `maya-coaching-insights`: Category PERSONA, runs on first turn/handoffs
 * - `maya-habit-insights`: Category COACHING, runs during habit discussions
 *
 * Both can run simultaneously - they provide complementary insights.
 * ============================================================================
 *
 * This builder loads Maya with DEEP coaching intelligence when:
 * 1. A user transfers TO Maya from another persona
 * 2. A user starts talking directly with Maya
 *
 * DATA SOURCES (Cross-Team Integration):
 *
 * FROM PETER (Pattern Analysis):
 * - Spending-habit correlations
 * - Decision quality predictions
 * - Behavioral pattern discoveries
 * - Time-of-day effectiveness patterns
 *
 * FROM JORDAN (Goals/Milestones):
 * - Active goals requiring habit support
 * - Upcoming milestones to prepare for
 * - Life transitions affecting habits
 * - Deadline-driven motivation opportunities
 *
 * FROM NAYAN (Wisdom):
 * - Values alignment with habits
 * - Meaning behind habit choices
 * - Long-term perspective on growth
 *
 * FROM FERNI (Core Profile):
 * - User's Four Tendencies type
 * - Life stage and context
 * - Emotional patterns
 * - Relationship depth
 *
 * COMPUTED METRICS (Maya's Research Dashboard):
 * - Consistency Index (0-100): Regularity of habit execution
 * - Cascade Potential (0-100): Likelihood habits ripple into other areas
 * - Recovery Speed (0-100): How quickly they bounce back from setbacks
 * - Momentum Score (0-100): Overall trend direction
 * - Keystone Power (0-100): Impact of keystone habits on others
 *
 * @module intelligence/context-builders/maya-coaching-insights
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { getHandoffContext } from '../../../tools/handoff/executor.js';
import { getProductivityStore } from '../../../services/stores/productivity-store.js';
import { getFinancialStore } from '../../../services/stores/financial-store.js';
import { getGamificationStore } from '../../../services/engagement/gamification-store.js';
import { getSuperhuman } from '../superhuman/superhuman-integration.js';
// Better Than Human: Habit-Calendar Integration
import {
  getHabitCalendarContextForBuilder,
  getTomorrowHabitRecommendations,
  type HabitCalendarInsight,
} from '../../../services/habits/habit-calendar-integration.js';

const log = createLogger({ module: 'context:maya-coaching-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface MayaInsightBriefing {
  /** Habit health overview */
  habitHealth: HabitHealthSummary;
  /** Computed coaching metrics */
  coachingMetrics: CoachingMetrics;
  /** Cross-domain correlations from Peter */
  peterInsights: string[];
  /** Goal-related coaching needs from Jordan */
  jordanInsights: string[];
  /** Mood/energy intelligence */
  moodIntelligence: MoodIntelligence;
  /** Proactive coaching triggers */
  proactiveTriggers: ProactiveTrigger[];
  /** User's tendency type if known */
  tendencyType: FourTendency | null;
  /** Recent wins to celebrate */
  winsToCelebrate: string[];
  /** Struggles needing gentle support */
  strugglesToAddress: string[];
  /** Memory insights from past conversations */
  memoryInsights: MemoryInsights;
  /** Better Than Human: Calendar-habit correlations from Alex */
  calendarInsights: string | null;
}

interface HabitHealthSummary {
  activeHabits: number;
  totalStreaks: number;
  averageSuccessRate: number;
  keystoneActive: boolean;
  keystoneHabits: string[];
  atRiskCount: number;
  recentSetbacks: string[];
  longestStreak: { name: string; days: number } | null;
  habitStacks: string[];
  weeklyReflectionSummary: string | null;
  totalCompletions: number;
  habitCategories: Record<string, number>;
}

interface CoachingMetrics {
  /** Regularity of habit execution (0-100) */
  consistencyIndex: number;
  /** Likelihood habits ripple into other areas (0-100) */
  cascadePotential: number;
  /** How quickly they bounce back from setbacks (0-100) */
  recoverySpeed: number;
  /** Overall trend direction (0-100) */
  momentumScore: number;
  /** Impact of keystone habits (0-100) */
  keystonePower: number;
  /** Key patterns detected */
  patterns: string[];
}

interface MoodIntelligence {
  recentMoodTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  averageEnergy: number;
  optimalCoachingTime: string | null;
  moodHabitCorrelations: string[];
  currentState: { mood: string; energy: string } | null;
  energyPatterns: string[];
}

interface ProactiveTrigger {
  type: 'celebration' | 'support' | 'challenge' | 'insight' | 'connection';
  message: string;
  priority: 'high' | 'medium' | 'low';
  timing: 'immediate' | 'when_relevant' | 'next_session';
}

type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';

interface MemoryInsights {
  totalHabitConversations: number;
  previousWins: string[];
  previousStruggles: string[];
  coachingApproachesTried: string[];
  whatWorked: string[];
  whatDidntWork: string[];
}

interface HandoffBriefing {
  topic: string;
  emotionalContext: string | null;
  actionItems: string[];
  fromPersona: string | null;
  urgency: 'low' | 'medium' | 'high';
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface MayaSession {
  briefingTurn: number;
  celebratedWins: Set<string>;
  coachingApproaches: string[];
}

const sessions = new Map<string, MayaSession>();

function getSession(sessionId: string): MayaSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, celebratedWins: new Set(), coachingApproaches: [] };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearMayaCoachingSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// HABIT HEALTH ANALYSIS (Enhanced)
// ============================================================================

function analyzeHabitHealth(userId: string): HabitHealthSummary {
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
// COMPUTED COACHING METRICS
// ============================================================================

function computeCoachingMetrics(
  habitHealth: HabitHealthSummary,
  moodIntelligence: MoodIntelligence
): CoachingMetrics {
  const metrics: CoachingMetrics = {
    consistencyIndex: 0,
    cascadePotential: 0,
    recoverySpeed: 0,
    momentumScore: 0,
    keystonePower: 0,
    patterns: [],
  };

  if (habitHealth.activeHabits === 0) {
    metrics.patterns.push('No active habits - fresh start opportunity');
    return metrics;
  }

  // Consistency Index: Based on success rate and streak maintenance
  const successWeight = habitHealth.averageSuccessRate * 60;
  const streakRatio =
    habitHealth.activeHabits > 0 ? (habitHealth.totalStreaks / habitHealth.activeHabits) * 40 : 0;
  metrics.consistencyIndex = Math.round(successWeight + streakRatio);

  // Cascade Potential: Based on keystone habits and habit stacks
  const keystoneBonus = habitHealth.keystoneActive ? 40 : 0;
  const stackBonus = Math.min(habitHealth.habitStacks.length * 15, 30);
  const categoryDiversity = Math.min(Object.keys(habitHealth.habitCategories).length * 10, 30);
  metrics.cascadePotential = Math.round(keystoneBonus + stackBonus + categoryDiversity);

  // Recovery Speed: Based on at-risk ratio and past recovery patterns
  const atRiskRatio =
    habitHealth.activeHabits > 0 ? 1 - habitHealth.atRiskCount / habitHealth.activeHabits : 1;
  const reflectionBonus = habitHealth.weeklyReflectionSummary ? 20 : 0;
  metrics.recoverySpeed = Math.round(atRiskRatio * 80 + reflectionBonus);

  // Momentum Score: Based on trends and energy
  const trendBonus =
    moodIntelligence.recentMoodTrend === 'improving'
      ? 30
      : moodIntelligence.recentMoodTrend === 'stable'
        ? 15
        : 0;
  const energyBonus = Math.round(moodIntelligence.averageEnergy * 10);
  const completionBonus = Math.min(habitHealth.totalCompletions / 10, 30);
  metrics.momentumScore = Math.round(trendBonus + energyBonus + completionBonus);

  // Keystone Power: Based on keystone habit performance
  if (habitHealth.keystoneHabits.length > 0) {
    const keystoneCount = habitHealth.keystoneHabits.length;
    const keystoneActiveBonus = habitHealth.keystoneActive ? 50 : 0;
    metrics.keystonePower = Math.round(keystoneCount * 20 + keystoneActiveBonus);
  }

  // Detect patterns
  if (metrics.consistencyIndex > 70) {
    metrics.patterns.push('Strong consistency - ready for habit stacking');
  } else if (metrics.consistencyIndex < 40) {
    metrics.patterns.push('Consistency needs work - focus on one tiny habit');
  }

  if (metrics.cascadePotential > 60) {
    metrics.patterns.push('High cascade potential - habits are interconnecting');
  }

  if (metrics.recoverySpeed < 50 && habitHealth.atRiskCount > 0) {
    metrics.patterns.push('Recovery support needed - self-compassion first');
  }

  if (metrics.momentumScore > 70) {
    metrics.patterns.push('Strong momentum - capitalize on this energy');
  } else if (metrics.momentumScore < 30) {
    metrics.patterns.push('Low momentum - need a quick win to build energy');
  }

  if (metrics.keystonePower > 70) {
    metrics.patterns.push('Keystone habits are driving growth');
  } else if (habitHealth.activeHabits > 3 && metrics.keystonePower < 30) {
    metrics.patterns.push('Missing keystone - too many habits without anchor');
  }

  return metrics;
}

// ============================================================================
// MOOD/ENERGY INTELLIGENCE
// ============================================================================

async function analyzeMoodIntelligence(userId: string): Promise<MoodIntelligence> {
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
    for (const log of moodLogs) {
      const hour = new Date(log.date).getHours();
      if (!hourlyEnergy[hour]) hourlyEnergy[hour] = [];
      hourlyEnergy[hour].push(log.energy);
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
// PROACTIVE COACHING TRIGGERS
// ============================================================================

function detectProactiveTriggers(
  habitHealth: HabitHealthSummary,
  metrics: CoachingMetrics,
  moodIntelligence: MoodIntelligence
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  // Celebration triggers
  if (habitHealth.longestStreak && habitHealth.longestStreak.days >= 7) {
    triggers.push({
      type: 'celebration',
      message: `🎉 "${habitHealth.longestStreak.name}" hit ${habitHealth.longestStreak.days} days! This is huge.`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  if (habitHealth.totalCompletions > 0 && habitHealth.totalCompletions % 50 === 0) {
    triggers.push({
      type: 'celebration',
      message: `🏆 ${habitHealth.totalCompletions} total completions! Momentum is building.`,
      priority: 'medium',
      timing: 'immediate',
    });
  }

  // Support triggers
  if (habitHealth.atRiskCount > 0) {
    triggers.push({
      type: 'support',
      message: `💚 ${habitHealth.atRiskCount} habit(s) need gentle attention: ${habitHealth.recentSetbacks.join(', ')}`,
      priority: 'high',
      timing: 'immediate',
    });
  }

  if (moodIntelligence.recentMoodTrend === 'declining') {
    triggers.push({
      type: 'support',
      message: 'Mood has been dipping - focus on self-care habits before new challenges',
      priority: 'high',
      timing: 'immediate',
    });
  }

  // Challenge triggers
  if (metrics.consistencyIndex > 70 && !habitHealth.keystoneActive) {
    triggers.push({
      type: 'challenge',
      message: 'Consistency is strong - ready to identify a keystone habit',
      priority: 'medium',
      timing: 'when_relevant',
    });
  }

  if (metrics.momentumScore > 70 && habitHealth.activeHabits < 5) {
    triggers.push({
      type: 'challenge',
      message: 'High momentum - consider adding a new tiny habit',
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  // Insight triggers
  if (metrics.cascadePotential > 60) {
    triggers.push({
      type: 'insight',
      message: 'Habits are starting to cascade - help them see the connections',
      priority: 'medium',
      timing: 'when_relevant',
    });
  }

  if (moodIntelligence.optimalCoachingTime) {
    triggers.push({
      type: 'insight',
      message: `Best energy is in the ${moodIntelligence.optimalCoachingTime} - schedule important habits then`,
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  // Connection triggers
  if (habitHealth.habitStacks.length > 0) {
    triggers.push({
      type: 'connection',
      message: 'Habit stacks are active - reinforce the chain',
      priority: 'low',
      timing: 'when_relevant',
    });
  }

  return triggers;
}

// ============================================================================
// CROSS-TEAM INSIGHTS
// ============================================================================

async function getPeterPatternInsights(userId: string): Promise<string[]> {
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

function getJordanGoalInsights(userId: string): string[] {
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
// MEMORY INSIGHTS (Historical Patterns)
// ============================================================================

function getMemoryInsights(userId: string): MemoryInsights {
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

// ============================================================================
// FOUR TENDENCIES DETECTION
// ============================================================================

function detectFourTendency(habitHealth: HabitHealthSummary): FourTendency | null {
  // This is a simple heuristic - would ideally come from user profile
  // Based on habit patterns, we can make educated guesses

  if (habitHealth.activeHabits === 0) return null;

  const hasExternalAccountability = habitHealth.habitStacks.length > 0;
  const hasInternalConsistency = habitHealth.averageSuccessRate > 0.7;
  const hasStructure = habitHealth.keystoneActive;

  if (hasInternalConsistency && hasStructure) {
    return 'upholder'; // Meets inner and outer expectations
  }

  if (!hasInternalConsistency && hasExternalAccountability) {
    return 'obliger'; // Needs external accountability
  }

  if (hasInternalConsistency && !hasExternalAccountability) {
    return 'questioner'; // Internal reasoning-driven
  }

  if (!hasInternalConsistency && !hasExternalAccountability) {
    return 'rebel'; // Resists all expectations
  }

  return null;
}

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

function analyzeHandoffForMaya(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();
  if (!handoffContext) return null;

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'general',
    emotionalContext: null,
    actionItems: [],
    fromPersona: null,
    urgency: 'medium',
  };

  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lower = topic.toLowerCase();

    // From Peter - pattern-related
    if (lower.includes('pattern') || lower.includes('spending') || lower.includes('trigger')) {
      briefing.actionItems.push(`Peter found a ${topic} - help build habits to address root cause`);
      briefing.fromPersona = 'peter';
    }

    // From Jordan - goal-related
    if (lower.includes('goal') || lower.includes('milestone') || lower.includes('deadline')) {
      briefing.actionItems.push(`Jordan's working on ${topic} - what habits would support this?`);
      briefing.fromPersona = 'jordan';
    }

    // From Nayan - meaning-related
    if (lower.includes('meaning') || lower.includes('values') || lower.includes('purpose')) {
      briefing.actionItems.push(`Nayan explored ${topic} - connect habits to deeper meaning`);
      briefing.fromPersona = 'nayan';
    }

    // Stress/emotional - high urgency
    if (lower.includes('stress') || lower.includes('overwhelm') || lower.includes('struggle')) {
      briefing.emotionalContext = 'stressed';
      briefing.actionItems.push('Start with self-compassion, not new habits');
      briefing.urgency = 'high';
    }

    // Crisis signals
    if (lower.includes('crisis') || lower.includes('burnout') || lower.includes('breaking')) {
      briefing.urgency = 'high';
      briefing.emotionalContext = 'crisis';
      briefing.actionItems.push('Pause all habit expectations - just be present');
    }
  }

  if (handoffContext.emotionalState && handoffContext.emotionalState !== 'neutral') {
    briefing.emotionalContext = handoffContext.emotionalState;
  }

  return briefing;
}

// ============================================================================
// BUILD BRIEFING
// ============================================================================

async function buildMayaBriefing(userId: string): Promise<MayaInsightBriefing> {
  // Default fallback values for graceful degradation
  const defaultHabitHealth: HabitHealthSummary = {
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
  const defaultMoodIntelligence: MoodIntelligence = {
    recentMoodTrend: 'unknown',
    averageEnergy: 5,
    optimalCoachingTime: null,
    moodHabitCorrelations: [],
    currentState: null,
    energyPatterns: [],
  };
  const defaultMemoryInsights: MemoryInsights = {
    totalHabitConversations: 0,
    previousWins: [],
    previousStruggles: [],
    coachingApproachesTried: [],
    whatWorked: [],
    whatDidntWork: [],
  };

  // 🐛 FIX: Each promise has its own catch to prevent one failure from crashing all
  const [
    habitHealth,
    moodIntelligence,
    peterInsights,
    jordanInsights,
    memoryInsights,
    calendarInsights,
  ] = await Promise.all([
    Promise.resolve(analyzeHabitHealth(userId)).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to analyze habit health');
      return defaultHabitHealth;
    }),
    analyzeMoodIntelligence(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to analyze mood intelligence');
      return defaultMoodIntelligence;
    }),
    getPeterPatternInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get Peter pattern insights');
      return [] as string[];
    }),
    Promise.resolve(getJordanGoalInsights(userId)).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get Jordan goal insights');
      return [] as string[];
    }),
    Promise.resolve(getMemoryInsights(userId)).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get memory insights');
      return defaultMemoryInsights;
    }),
    // Better Than Human: Calendar-habit correlation
    getHabitCalendarContextForBuilder(userId).catch(() => null),
  ]);

  const coachingMetrics = computeCoachingMetrics(habitHealth, moodIntelligence);
  const proactiveTriggers = detectProactiveTriggers(habitHealth, coachingMetrics, moodIntelligence);
  const tendencyType = detectFourTendency(habitHealth);

  // Identify wins to celebrate
  const winsToCelebrate: string[] = [];
  if (habitHealth.longestStreak && habitHealth.longestStreak.days >= 7) {
    winsToCelebrate.push(
      `${habitHealth.longestStreak.name} - ${habitHealth.longestStreak.days} day streak!`
    );
  }
  if (habitHealth.keystoneActive) {
    winsToCelebrate.push('Keystone habit is active and building momentum');
  }
  if (habitHealth.averageSuccessRate > 0.7) {
    winsToCelebrate.push(
      `${Math.round(habitHealth.averageSuccessRate * 100)}% overall success rate - excellent!`
    );
  }
  if (coachingMetrics.momentumScore > 70) {
    winsToCelebrate.push('Momentum is strong - energy is building');
  }

  // Identify struggles
  const strugglesToAddress = habitHealth.recentSetbacks.map(
    (name) => `"${name}" streak broke - needs gentle restart`
  );
  if (coachingMetrics.consistencyIndex < 40) {
    strugglesToAddress.push('Overall consistency needs support');
  }

  return {
    habitHealth,
    coachingMetrics,
    peterInsights,
    jordanInsights,
    moodIntelligence,
    proactiveTriggers,
    tendencyType,
    winsToCelebrate,
    strugglesToAddress,
    memoryInsights,
    calendarInsights,
  };
}

// ============================================================================
// FORMAT BRIEFING
// ============================================================================

function formatMayaBriefing(
  briefing: MayaInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[MAYA'S COACHING BRIEFING - Turn ${turnCount}]`);

  // Handoff context (high priority)
  if (handoffBriefing) {
    sections.push('\n=== HANDOFF CONTEXT ===');
    sections.push(`Topic: ${handoffBriefing.topic}`);
    if (handoffBriefing.fromPersona) {
      sections.push(`From: ${handoffBriefing.fromPersona.toUpperCase()}`);
    }
    if (handoffBriefing.urgency === 'high') {
      sections.push(`⚠️ URGENCY: HIGH`);
    }
    if (handoffBriefing.emotionalContext) {
      sections.push(`Emotional state: ${handoffBriefing.emotionalContext} - lead with warmth`);
    }
    if (handoffBriefing.actionItems.length > 0) {
      sections.push(
        `Action items:\n${handoffBriefing.actionItems.map((a) => `  • ${a}`).join('\n')}`
      );
    }
  }

  // Computed Metrics Dashboard
  const { coachingMetrics } = briefing;
  sections.push('\n=== 📊 COACHING METRICS DASHBOARD ===');
  sections.push(`• Consistency Index: ${coachingMetrics.consistencyIndex}/100`);
  sections.push(`• Cascade Potential: ${coachingMetrics.cascadePotential}/100`);
  sections.push(`• Recovery Speed: ${coachingMetrics.recoverySpeed}/100`);
  sections.push(`• Momentum Score: ${coachingMetrics.momentumScore}/100`);
  sections.push(`• Keystone Power: ${coachingMetrics.keystonePower}/100`);
  if (coachingMetrics.patterns.length > 0) {
    sections.push(`PATTERNS: ${coachingMetrics.patterns.join('; ')}`);
  }

  // Habit health dashboard
  const { habitHealth } = briefing;
  sections.push('\n=== 🌱 HABIT HEALTH ===');
  sections.push(`• Active habits: ${habitHealth.activeHabits}`);
  sections.push(`• Active streaks: ${habitHealth.totalStreaks}`);
  sections.push(`• Success rate: ${Math.round(habitHealth.averageSuccessRate * 100)}%`);
  sections.push(`• Total completions: ${habitHealth.totalCompletions}`);
  sections.push(
    `• Keystone: ${habitHealth.keystoneActive ? `✅ ${habitHealth.keystoneHabits.join(', ')}` : '❌ None active'}`
  );
  if (habitHealth.longestStreak) {
    sections.push(
      `• 🔥 Longest streak: ${habitHealth.longestStreak.name} (${habitHealth.longestStreak.days} days)`
    );
  }
  if (habitHealth.habitStacks.length > 0) {
    sections.push(`• Habit stacks: ${habitHealth.habitStacks.join(', ')}`);
  }

  // Mood Intelligence
  const { moodIntelligence } = briefing;
  if (moodIntelligence.currentState || moodIntelligence.recentMoodTrend !== 'unknown') {
    sections.push('\n=== 🧠 MOOD INTELLIGENCE ===');
    if (moodIntelligence.currentState) {
      sections.push(
        `• Current: ${moodIntelligence.currentState.mood} mood, ${moodIntelligence.currentState.energy} energy`
      );
    }
    sections.push(`• Trend: ${moodIntelligence.recentMoodTrend}`);
    if (moodIntelligence.optimalCoachingTime) {
      sections.push(`• Best time for challenges: ${moodIntelligence.optimalCoachingTime}`);
    }
    if (moodIntelligence.moodHabitCorrelations.length > 0) {
      sections.push(`• ${moodIntelligence.moodHabitCorrelations.join('; ')}`);
    }
  }

  // Four Tendencies coaching approach
  if (briefing.tendencyType) {
    sections.push('\n=== 🎯 COACHING APPROACH ===');
    const approaches: Record<FourTendency, string> = {
      upholder: "UPHOLDER: Clear rules and schedules work. Set expectations and they'll meet them.",
      questioner: 'QUESTIONER: Explain the WHY. They need logical reasons to commit.',
      obliger: 'OBLIGER: External accountability is key. Check-ins, partners, public commitments.',
      rebel:
        'REBEL: Frame as choice and identity. "You\'re the kind of person who..." works better than rules.',
    };
    sections.push(approaches[briefing.tendencyType]);
  }

  // Proactive Triggers (high priority first)
  const highPriority = briefing.proactiveTriggers.filter((t) => t.priority === 'high');
  const otherTriggers = briefing.proactiveTriggers.filter((t) => t.priority !== 'high');

  if (highPriority.length > 0) {
    sections.push('\n=== ⚡ IMMEDIATE ACTIONS ===');
    highPriority.forEach((t) => sections.push(`• [${t.type.toUpperCase()}] ${t.message}`));
  }

  if (otherTriggers.length > 0) {
    sections.push('\n=== 💡 COACHING OPPORTUNITIES ===');
    otherTriggers.slice(0, 4).forEach((t) => sections.push(`• [${t.type}] ${t.message}`));
  }

  // Wins to celebrate
  if (briefing.winsToCelebrate.length > 0) {
    sections.push('\n=== 🎉 CELEBRATE THESE ===');
    briefing.winsToCelebrate.forEach((win) => sections.push(`• ${win}`));
  }

  // Struggles needing support
  if (briefing.strugglesToAddress.length > 0) {
    sections.push('\n=== 💚 SELF-COMPASSION NEEDED ===');
    briefing.strugglesToAddress.forEach((struggle) => sections.push(`• ${struggle}`));
    sections.push('Remember: Setbacks are data, not failure. Meet them where they are.');
  }

  // Cross-team insights
  if (briefing.peterInsights.length > 0) {
    sections.push('\n=== FROM PETER (Patterns) ===');
    briefing.peterInsights.forEach((insight) => sections.push(`• ${insight}`));
  }

  if (briefing.jordanInsights.length > 0) {
    sections.push('\n=== FROM JORDAN (Goals) ===');
    briefing.jordanInsights.forEach((insight) => sections.push(`• ${insight}`));
  }

  // Better Than Human: Calendar-Habit Correlation (from Alex's calendar data)
  if (briefing.calendarInsights) {
    sections.push('\n=== 📅 FROM ALEX (Calendar-Habit Correlation) ===');
    sections.push(briefing.calendarInsights);
  }

  // Memory context
  if (briefing.memoryInsights.totalHabitConversations > 0) {
    sections.push('\n=== 🧠 RELATIONSHIP HISTORY ===');
    sections.push(`• ${briefing.memoryInsights.totalHabitConversations} habit conversations`);
    if (briefing.memoryInsights.previousWins.length > 0) {
      sections.push(`• Past wins: ${briefing.memoryInsights.previousWins.slice(0, 3).join(', ')}`);
    }
    if (briefing.memoryInsights.whatWorked.length > 0) {
      sections.push(`• What worked before: ${briefing.memoryInsights.whatWorked.join(', ')}`);
    }
  }

  // Coaching reminders (first turns only)
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR COACHING PRINCIPLES ===');
    sections.push('• Start embarrassingly small - 2 minutes or less');
    sections.push('• Systems beat willpower every time');
    sections.push('• Celebrate EVERYTHING - emotions create habits');
    sections.push('• Meet them where they are, not where they "should" be');
    sections.push('• Progress over perfection, always');
  }

  sections.push(
    "\n[Remember: Zero judgment. Infinite patience. They're doing better than they think.]"
  );

  return sections;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildMayaCoachingInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData } = input;

  // Only for Maya
  const currentPersona = (services as { personaId?: string })?.personaId || '';
  const isMaya = ['maya', 'maya-santos', 'habits-coach', 'life-coach'].includes(
    currentPersona.toLowerCase()
  );

  if (!isMaya) return injections;

  const userId = services?.userId || 'anonymous';
  if (userId === 'anonymous') return injections;

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  const handoffBriefing = analyzeHandoffForMaya();
  const isHandoff = handoffBriefing !== null;

  // Inject on first turn, handoff, or every 10 turns
  const shouldInject =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const briefing = await buildMayaBriefing(userId);
    const briefingLines = formatMayaBriefing(briefing, handoffBriefing, turnCount);

    // Get superhuman context (commitments, capacity, predictions)
    // V3 Semantic Intelligence needs current conversation context
    const personMatch = input.userText?.match(
      /\b(my (?:mom|dad|wife|husband|partner|sister|brother|friend|boss|coworker)|(?:mom|dad|wife|husband)\b)/i
    );
    const superhumanContext = await getSuperhuman(userId, 'maya', {
      currentTranscript: input.userText,
      currentTopics: input.analysis?.topics?.detected,
      currentEmotion: input.analysis?.emotion?.primary,
      currentMentionedPerson: personMatch?.[1],
    });
    if (superhumanContext) {
      briefingLines.push(`\n${superhumanContext}`);
    }

    const content = briefingLines.join('\n');

    // 🤝 TEAM HUDDLE: Record Maya's observations for cross-persona intelligence
    // This enables Ferni and other personas to know what Maya has noticed
    try {
      const { maya: mayaObserver } = await import(
        '../../../services/cross-persona/observation-recorder.js'
      );

      // Record concerning patterns
      if (briefing.habitHealth.atRiskCount > 0) {
        mayaObserver.concern(
          userId,
          `${briefing.habitHealth.atRiskCount} habits at risk of breaking streak`,
          0.8,
          ['habits', 'streak', 'motivation']
        );
      }

      // Record mood-related concerns
      if (briefing.moodIntelligence.recentMoodTrend === 'declining') {
        mayaObserver.concern(
          userId,
          'Mood trend has been declining recently',
          0.7,
          ['mood', 'energy', 'wellbeing']
        );
      }

      // Record positive patterns
      if (briefing.coachingMetrics.momentumScore > 70) {
        mayaObserver.pattern(
          userId,
          `Strong momentum score (${briefing.coachingMetrics.momentumScore}/100)`,
          0.8,
          ['habits', 'momentum', 'progress']
        );
      }

      // Record milestones
      if (briefing.habitHealth.longestStreak && briefing.habitHealth.longestStreak.days >= 7) {
        mayaObserver.milestone(
          userId,
          `${briefing.habitHealth.longestStreak.days}-day streak on ${briefing.habitHealth.longestStreak.name}`,
          0.9,
          ['habits', 'streak', 'achievement']
        );
      }

      // Record opportunities
      if (briefing.proactiveTriggers.length > 0) {
        const topTrigger = briefing.proactiveTriggers[0];
        // Map priority to confidence: high=0.9, medium=0.7, low=0.5
        const confidenceMap: Record<string, number> = { high: 0.9, medium: 0.7, low: 0.5 };
        mayaObserver.opportunity(
          userId,
          topTrigger.message || 'Coaching opportunity detected',
          confidenceMap[topTrigger.priority] || 0.7,
          undefined, // suggestedAction not available on this ProactiveTrigger type
          ['habits', 'coaching']
        );
      }
    } catch (err) {
      // Non-critical - don't block if observation recording fails
      log.debug({ error: String(err) }, 'Failed to record Maya observations (non-blocking)');
    }

    if (isHandoff) {
      injections.push(
        createHighInjection('maya_handoff_briefing', content, {
          category: 'persona-coaching',
          confidence: 0.9,
        })
      );
      log.info(
        { userId, urgency: handoffBriefing?.urgency },
        '🌱 Maya loaded with handoff briefing'
      );
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('maya_initial_briefing', content, {
          category: 'persona-coaching',
          confidence: 0.8,
        })
      );
      log.info(
        {
          userId,
          habits: briefing.habitHealth.activeHabits,
          momentum: briefing.coachingMetrics.momentumScore,
        },
        '🌱 Maya loaded with coaching briefing'
      );
    } else {
      injections.push(
        createHintInjection('maya_refresh_briefing', content, {
          category: 'persona-coaching',
        })
      );
    }

    session.briefingTurn = turnCount;

    // Maya's mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'maya_mindset',
          "[MAYA'S HEART: You believe in them before they believe in themselves. " +
            'Celebrate every tiny step. Meet setbacks with compassion, not criticism. ' +
            "Progress isn't linear - and that's okay. Start small. Stay patient. Trust the process.]",
          { category: 'persona-identity' }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Maya coaching briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'maya-coaching-insights',
  description:
    'Loads Maya with deep coaching insights - computed metrics, mood intelligence, proactive triggers, and cross-team patterns',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildMayaCoachingInsightsContext,
});

export { buildMayaCoachingInsightsContext };
