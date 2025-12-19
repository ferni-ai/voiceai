/**
 * Peter's Research Insights Context Builder
 *
 * > "The skill was never about stocks. It was about seeing patterns nobody else sees."
 *
 * This builder loads Peter with deep research insights when:
 * 1. A user transfers TO Peter from another persona
 * 2. A user starts talking directly with Peter
 *
 * DATA SOURCES (Cross-Team Integration):
 *
 * FROM MAYA (Habits/Productivity):
 * - Enhanced habits with streaks, levels, keystone status
 * - Weekly reflections and habit stacks
 * - Mood/energy logs and patterns
 * - Routine completions and consistency scores
 *
 * FROM ALEX (Calendar/Time):
 * - Calendar density patterns
 * - Meeting load analysis
 * - Focus time blocks
 *
 * FROM JORDAN (Goals/Milestones):
 * - Active goals and progress
 * - Upcoming milestones
 * - Celebration-worthy achievements
 *
 * FROM FERNI (Core Profile):
 * - User preferences and communication style
 * - Emotional patterns and triggers
 * - Memory system insights
 *
 * INSIGHT CATEGORIES:
 *
 * 1. USER PATTERN INSIGHTS
 *    - Spending patterns and anomalies
 *    - Habit correlations
 *    - Calendar/productivity patterns
 *    - Goal trajectory analysis
 *    - Behavioral economics observations
 *
 * 2. MARKET CONTEXT (when relevant)
 *    - Market conditions (if user has investments)
 *    - Sector trends they care about
 *    - Companies they've mentioned
 *
 * 3. CROSS-DOMAIN DISCOVERIES
 *    - How spending correlates with mood/habits
 *    - Time patterns that predict behavior
 *    - The "connections others miss"
 *
 * 4. HANDOFF INTELLIGENCE
 *    - What the previous persona was discussing
 *    - Insights that connect to Peter's domain
 *    - Action items for Peter to explore
 *
 * @module intelligence/context-builders/peter-research-insights
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { getHandoffContext } from '../../tools/handoff/executor.js';
import { getFinancialStore } from '../../services/financial-store.js';
import { getProductivityStore } from '../../services/productivity-store.js';
import { getGamificationStore } from '../../services/gamification-store.js';
import { getMemoryOrchestrator } from '../../memory/orchestrator.js';
import { detectProactiveTriggers, type ProactiveTrigger } from '../../tools/proactive-coaching.js';

const log = createLogger({ module: 'context:peter-research-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface UserInsightBriefing {
  /** Spending pattern insights */
  spendingInsights: string[];
  /** Habit correlation discoveries */
  habitCorrelations: string[];
  /** Goal trajectory analysis */
  goalInsights: string[];
  /** Cross-domain patterns */
  crossDomainPatterns: string[];
  /** Anomalies detected */
  anomalies: string[];
  /** Proactive discoveries to share */
  proactiveDiscoveries: string[];
  /** Cross-team data from Maya */
  mayaInsights: HabitInsights;
  /** Mood/energy patterns */
  moodPatterns: MoodInsights;
  /** Behavioral research metrics */
  behavioralMetrics: BehavioralMetrics;
}

/** Computed behavioral research metrics */
interface BehavioralMetrics {
  /** Decision Quality Index (0-100) */
  decisionQualityIndex: number;
  /** Habit Formation Velocity (days to form habits) */
  habitFormationVelocity: string;
  /** Motivation Sustainability Index */
  motivationSustainability: string;
  /** Financial Stress Index */
  financialStressLevel: string;
  /** Key behavioral patterns detected */
  patterns: string[];
}

interface HandoffBriefing {
  /** What was being discussed */
  topic: string;
  /** Insights from the previous persona */
  previousPersonaInsights: string[];
  /** Questions for Peter to explore */
  questionsForPeter: string[];
  /** Emotional context */
  emotionalWeight: number;
}

// ============================================================================
// SESSION STATE - Track what insights we've surfaced
// ============================================================================

interface PeterSession {
  /** Insights already surfaced this session */
  surfacedInsights: Set<string>;
  /** Turn when briefing was delivered */
  briefingTurn: number;
  /** Whether initial briefing was given */
  initialBriefingGiven: boolean;
}

const sessions = new Map<string, PeterSession>();

function getSession(sessionId: string): PeterSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      surfacedInsights: new Set(),
      briefingTurn: -1,
      initialBriefingGiven: false,
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearPeterResearchSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// SPENDING PATTERN ANALYSIS
// ============================================================================

async function analyzeSpendingPatterns(userId: string): Promise<string[]> {
  const insights: string[] = [];

  try {
    const store = getFinancialStore();
    await store.loadUserData(userId);

    const budget = store.getMainBudget(userId);
    if (!budget) return insights;

    // Check for over-budget categories
    const overCategories = budget.categories.filter(
      (c: { spent: number; limit: number }) => c.spent > c.limit
    );
    if (overCategories.length > 0) {
      const categoryNames = overCategories.map((c: { name: string }) => c.name).join(', ');
      insights.push(
        `User is over budget in ${overCategories.length} categories: ${categoryNames}. Worth exploring WHY - is it a pattern or one-time thing?`
      );
    }

    // Check spending pace
    const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
    const dayOfMonth = new Date().getDate();
    const expectedPercent = (dayOfMonth / 30) * 100;

    if (percentUsed > expectedPercent + 20) {
      insights.push(
        `Spending pace is ${Math.round(percentUsed - expectedPercent)}% ahead of where it should be this month. Classic early-month splurge pattern?`
      );
    } else if (percentUsed < expectedPercent - 15) {
      insights.push(
        `User is tracking well under budget - ${Math.round(expectedPercent - percentUsed)}% below expected pace. Something shifted - good habit forming?`
      );
    }

    // Find the biggest category
    const sortedCategories = [...budget.categories].sort((a, b) => b.spent - a.spent);
    if (sortedCategories.length > 0) {
      const topCategory = sortedCategories[0];
      const topPercent = Math.round((topCategory.spent / budget.spent) * 100);
      if (topPercent > 40) {
        insights.push(
          `${topCategory.name} accounts for ${topPercent}% of total spending. Classic 80/20 - this one category is the lever.`
        );
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze spending patterns');
  }

  return insights;
}

// ============================================================================
// CROSS-TEAM DATA: MAYA'S HABIT DATA
// ============================================================================

interface HabitInsights {
  activeHabits: number;
  keystoneHabits: string[];
  currentStreaks: Array<{ name: string; streak: number }>;
  atRiskHabits: string[];
  totalCompletions: number;
  averageSuccessRate: number;
  habitStacks: string[];
  weeklyReflectionSummary: string | null;
}

async function getMayaHabitInsights(userId: string): Promise<HabitInsights> {
  const insights: HabitInsights = {
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
    insights.habitStacks = stacks.map((s) => `${s.name} (${s.habits.length} habits)`);

    // Weekly reflections
    const reflections = userData.weeklyReflections || [];
    if (reflections.length > 0) {
      const latest = reflections[reflections.length - 1];
      insights.weeklyReflectionSummary = `Win: ${latest.wins[0] || 'none'}, Struggle: ${latest.struggles[0] || 'none'}`;
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not fetch Maya habit insights');
  }

  return insights;
}

// ============================================================================
// CROSS-TEAM DATA: MOOD/ENERGY PATTERNS
// ============================================================================

interface MoodInsights {
  recentMoodTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  averageEnergy: number;
  moodCorrelations: string[];
  lastMood: { mood: string; energy: string } | null;
}

async function getMoodPatterns(userId: string): Promise<MoodInsights> {
  const insights: MoodInsights = {
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

    if (moodLogs.length === 0) return insights;

    // Last mood
    const lastLog = moodLogs[moodLogs.length - 1];
    insights.lastMood = { mood: String(lastLog.mood), energy: String(lastLog.energy) };

    // Calculate energy average (mood 1-5 scale assumed)
    const energyMap: Record<string, number> = {
      depleted: 1,
      low: 2,
      normal: 3,
      high: 4,
      energized: 5,
    };
    const energyValues = moodLogs
      .map((m) => energyMap[String(m.energy).toLowerCase()] || 3)
      .filter((e) => e > 0);
    if (energyValues.length > 0) {
      insights.averageEnergy = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
    }

    // Mood trend (compare first half vs second half)
    const midpoint = Math.floor(moodLogs.length / 2);
    if (midpoint > 1) {
      const firstHalf = moodLogs.slice(0, midpoint);
      const secondHalf = moodLogs.slice(midpoint);

      const moodMap: Record<string, number> = {
        terrible: 1,
        bad: 2,
        okay: 3,
        good: 4,
        great: 5,
      };

      const avgFirst =
        firstHalf.reduce((sum, m) => sum + (moodMap[String(m.mood).toLowerCase()] || 3), 0) /
        firstHalf.length;
      const avgSecond =
        secondHalf.reduce((sum, m) => sum + (moodMap[String(m.mood).toLowerCase()] || 3), 0) /
        secondHalf.length;

      if (avgSecond > avgFirst + 0.3) {
        insights.recentMoodTrend = 'improving';
      } else if (avgSecond < avgFirst - 0.3) {
        insights.recentMoodTrend = 'declining';
      } else {
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
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not fetch mood patterns');
  }

  return insights;
}

// ============================================================================
// CROSS-TEAM DATA: MEMORY ORCHESTRATOR (Historical Patterns)
// ============================================================================

interface MemoryInsights {
  behavioralPatterns: string[];
  emotionalThreads: string[];
  communicationStyle: string | null;
  memoryHealth: {
    totalMemories: number;
    recentMemories: number;
    emotionalMemories: number;
  } | null;
}

async function getMemoryOrchestratorInsights(userId: string): Promise<MemoryInsights> {
  const insights: MemoryInsights = {
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
      insights.behavioralPatterns.push(
        `Rich memory history (${health.totalMemories} memories) - can reference patterns over time`
      );
    }

    if (health.emotionalMemories > 5) {
      insights.behavioralPatterns.push(
        `${health.emotionalMemories} emotionally significant memories stored - emotional context available`
      );
    }

    if (health.commitments > 0) {
      insights.behavioralPatterns.push(
        `${health.commitments} active commitments tracked - accountability data available`
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not fetch memory orchestrator insights');
  }

  return insights;
}

// ============================================================================
// PROACTIVE COACHING TRIGGER DETECTION
// ============================================================================

interface ProactiveInsights {
  triggers: ProactiveTrigger[];
  priorityInsights: string[];
}

function detectProactiveCoachingInsights(
  userId: string,
  mayaInsights: HabitInsights
): ProactiveInsights {
  const priorityInsights: string[] = [];

  try {
    // Build detection context from Maya's data
    const activeHabits = mayaInsights.currentStreaks.map((s, i) => ({
      id: `habit_${i}`,
      name: s.name,
      currentStreak: s.streak,
      lastCompletion: new Date(), // Would come from actual data
      level: 1,
      successRate: mayaInsights.averageSuccessRate,
    }));

    // Add at-risk habits with broken streaks
    mayaInsights.atRiskHabits.forEach((name, i) => {
      activeHabits.push({
        id: `atrisk_${i}`,
        name,
        currentStreak: 0,
        lastCompletion: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        level: 1,
        successRate: 0.3,
      });
    });

    const detectionContext = {
      userId,
      activeHabits,
      recentMoods: [], // Would come from mood data
      weeklyReflectionsDue: false,
    };

    const triggers = detectProactiveTriggers(detectionContext);

    // Extract priority insights from triggers
    triggers.slice(0, 3).forEach((t) => {
      if (t.priority === 'urgent' || t.priority === 'high') {
        priorityInsights.push(`[${t.type}] ${t.message.opener}`);
      }
    });

    // Add streak-at-risk insights
    const streakRisk = triggers.filter((t) => t.type === 'streak_at_risk');
    if (streakRisk.length > 0) {
      priorityInsights.push(
        `⚠️ ${streakRisk.length} streak(s) at risk of breaking - opportunity for intervention`
      );
    }

    // Add celebration opportunities
    const milestones = triggers.filter((t) => t.type === 'streak_milestone');
    if (milestones.length > 0) {
      priorityInsights.push(
        `🎉 ${milestones.length} streak milestone(s) achieved - celebrate these wins!`
      );
    }

    return { triggers, priorityInsights };
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not detect proactive coaching insights');
    return { triggers: [], priorityInsights: [] };
  }
}

// ============================================================================
// GOAL TRAJECTORY ANALYSIS
// ============================================================================

async function analyzeGoalTrajectory(userId: string): Promise<string[]> {
  const insights: string[] = [];

  try {
    const store = getFinancialStore();
    await store.loadUserData(userId);

    const goals = store.getActiveSavingsGoals(userId);

    for (const goal of goals) {
      const progress = goal.currentAmount / goal.targetAmount;

      if (progress >= 0.9 && progress < 1) {
        insights.push(
          `User is ${Math.round(progress * 100)}% toward "${goal.name}" - SO close! The home stretch psychology is interesting.`
        );
      } else if (progress >= 0.5 && progress < 0.75) {
        insights.push(
          `"${goal.name}" is at ${Math.round(progress * 100)}% - past halfway! That's when momentum usually builds.`
        );
      }

      // Check if goal has deadline and is on track
      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const totalTime =
          deadline.getTime() -
          (goal.createdAt ? new Date(goal.createdAt).getTime() : now.getTime());
        const elapsed =
          now.getTime() - (goal.createdAt ? new Date(goal.createdAt).getTime() : now.getTime());
        const timeProgress = totalTime > 0 ? elapsed / totalTime : 0;

        if (progress < timeProgress - 0.2) {
          insights.push(
            `"${goal.name}" is behind pace - ${Math.round(progress * 100)}% saved but ${Math.round(timeProgress * 100)}% of time elapsed. Need to explore what's blocking progress.`
          );
        } else if (progress > timeProgress + 0.2) {
          insights.push(
            `"${goal.name}" is AHEAD of schedule! ${Math.round(progress * 100)}% saved with ${Math.round((1 - timeProgress) * 100)}% of time left. What's working?`
          );
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze goal trajectory');
  }

  return insights;
}

// ============================================================================
// TIME-BASED PATTERN ANALYSIS
// ============================================================================

function analyzeTimePatterns(): string[] {
  const insights: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const dayOfMonth = now.getDate();

  // Sunday scaries (spending spike predictor)
  if (dayOfWeek === 0 && hour >= 17) {
    insights.push(
      'Sunday evening - classic "Sunday scaries" time. Research shows impulse spending often spikes now. Worth watching.'
    );
  }

  // End of month crunch
  if (dayOfMonth >= 28) {
    insights.push(
      'End of month - budget psychology shifts. People either panic-cut spending or give up until next month. Which pattern does this user follow?'
    );
  }

  // Monday morning correlation
  if (dayOfWeek === 1 && hour >= 7 && hour <= 10) {
    insights.push(
      'Monday morning - decision quality tends to be high. Good time to tackle important financial decisions.'
    );
  }

  // Friday afternoon
  if (dayOfWeek === 5 && hour >= 14) {
    insights.push(
      'Friday afternoon - end-of-week impulse spending risk. The "I deserve this" pattern often kicks in.'
    );
  }

  // Pre-market hours (if before 9:30 AM on weekday)
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 6 && hour < 9) {
    insights.push(
      'Pre-market hours - if user has investments, they might be checking overnight news. Good time for research discussions.'
    );
  }

  return insights;
}

// ============================================================================
// CROSS-DOMAIN PATTERN GENERATION
// ============================================================================

function generateCrossDomainPatterns(): string[] {
  // These are pattern templates Peter uses to find connections
  // In a full implementation, these would be populated from actual user data
  return [
    'Look for correlations between spending categories and time of day - people often have "trigger times"',
    'Check if goal progress correlates with any behavioral patterns - what predicts success?',
    'The 80/20 rule applies everywhere - find the 20% of behaviors driving 80% of outcomes',
    'Leading indicators vs lagging indicators - what PREDICTS results vs just measures them?',
  ];
}

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

function analyzeHandoffContext(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();

  if (!handoffContext) {
    return null;
  }

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'general conversation',
    previousPersonaInsights: [],
    questionsForPeter: [],
    emotionalWeight: 0,
  };

  // Extract topics and generate Peter-specific questions
  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lowerTopic = topic.toLowerCase();

    // Financial topics → Peter's wheelhouse
    if (
      lowerTopic.includes('spend') ||
      lowerTopic.includes('budget') ||
      lowerTopic.includes('money')
    ) {
      briefing.questionsForPeter.push(
        `User was discussing ${topic} - look for patterns in their spending data that connect to this`
      );
    }

    // Habit topics → Cross-domain correlation opportunity
    if (
      lowerTopic.includes('habit') ||
      lowerTopic.includes('routine') ||
      lowerTopic.includes('exercise')
    ) {
      briefing.questionsForPeter.push(
        `Habits topic came up - explore correlation between habit streaks and financial behaviors`
      );
    }

    // Goal topics → Trajectory analysis
    if (
      lowerTopic.includes('goal') ||
      lowerTopic.includes('save') ||
      lowerTopic.includes('target')
    ) {
      briefing.questionsForPeter.push(
        `Goal discussion in progress - run trajectory analysis to show progress patterns`
      );
    }

    // Stress/emotion topics → Behavioral economics lens
    if (
      lowerTopic.includes('stress') ||
      lowerTopic.includes('anxious') ||
      lowerTopic.includes('worried')
    ) {
      briefing.questionsForPeter.push(
        `Emotional topic detected - apply behavioral economics lens. Stress often correlates with spending patterns.`
      );
      briefing.emotionalWeight = 0.7;
    }
  }

  // Capture summary if available
  if (handoffContext.summary) {
    briefing.previousPersonaInsights.push(`Previous persona noted: "${handoffContext.summary}"`);
  }

  // Note emotional state
  if (handoffContext.emotionalState && handoffContext.emotionalState !== 'neutral') {
    briefing.previousPersonaInsights.push(
      `User emotional state: ${handoffContext.emotionalState} - adjust research delivery accordingly`
    );
    briefing.emotionalWeight = Math.max(briefing.emotionalWeight, 0.5);
  }

  // Extract cognitive handoff context if available
  if (handoffContext.cognitiveContext) {
    const cogCtx = handoffContext.cognitiveContext;

    if (cogCtx.potentialBlindSpots?.length > 0) {
      briefing.questionsForPeter.push(
        `Potential blind spots from previous persona: ${cogCtx.potentialBlindSpots.slice(0, 2).join('; ')}`
      );
    }

    if (cogCtx.effectiveApproaches?.length > 0) {
      briefing.previousPersonaInsights.push(
        `Approaches that worked: ${cogCtx.effectiveApproaches.join(', ')}`
      );
    }
  }

  return briefing;
}

// ============================================================================
// PERSONAL LIFE PATTERN ANALYSIS
// ============================================================================

function analyzePersonalLifePatterns(): string[] {
  const insights: string[] = [];
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  // Energy cycle insights
  if (hour >= 9 && hour <= 11) {
    insights.push(
      'Peak decision-making window (9-11 AM). Decision Quality Index is typically highest now. Good time for important discussions.'
    );
  } else if (hour >= 14 && hour <= 15) {
    insights.push(
      'Post-lunch energy dip. Decision quality often drops 30-40% in this window. Keep discussions light or energy-focused.'
    );
  } else if (hour >= 21) {
    insights.push(
      'Evening wind-down. Good time for reflection, not major decisions. Ask about how their day went.'
    );
  }

  // Behavioral economics lens based on day
  if (dayOfWeek === 0) {
    insights.push(
      'Sunday: "Sunday scaries" window. Anxiety and control-seeking spending often spike. Look for stress signals.'
    );
  } else if (dayOfWeek === 1) {
    insights.push(
      'Monday: Fresh start energy. Good day for goal-setting discussions. Motivation is typically higher.'
    );
  } else if (dayOfWeek === 5 && hour >= 14) {
    insights.push(
      'Friday afternoon: "I deserve this" psychology kicks in. Watch for rationalized spending or impulsive decisions.'
    );
  }

  return insights;
}

// ============================================================================
// COACHING ANALYTICS PATTERNS
// ============================================================================

function generateCoachingInsights(): string[] {
  return [
    'Apply Four Tendencies detection: Listen for Upholder/Questioner/Obliger/Rebel signals in how they talk about goals',
    'Calculate Motivation Sustainability: Is this intrinsic (lasting) or extrinsic (temporary)?',
    'Look for keystone habit opportunities: One habit that cascades into fixing multiple areas',
    'Assess change readiness before pushing solutions: Are they in contemplation, preparation, or action stage?',
    'Track habit formation velocity: Some people are fast formers (21 days), others slow (90+ days)',
  ];
}

// ============================================================================
// DEEP FINANCIAL RESEARCH PATTERNS
// ============================================================================

function generateDeepFinancialInsights(): string[] {
  return [
    'Calculate Investor Behavior Index: Checking frequency + trading frequency + emotional correlation',
    'Look for behavioral finance patterns: Loss aversion, present bias, mental accounting',
    'Assess Financial Stress Index sources: Liquidity, cash flow, debt, uncertainty, or goal gap?',
    'Check for money scripts: Money avoidance, worship, status, or vigilance patterns',
    'Analyze Spending Quality Score: Value-aligned spending minus regret spending',
  ];
}

// ============================================================================
// BEHAVIORAL METRICS COMPUTATION
// ============================================================================

function computeBehavioralMetrics(
  mayaInsights: HabitInsights,
  moodPatterns: MoodInsights,
  spendingInsights: string[]
): BehavioralMetrics {
  const patterns: string[] = [];

  // Decision Quality Index (0-100)
  // Based on: energy level, mood trend, time of day, streak consistency
  let dqi = 70; // baseline
  if (moodPatterns.averageEnergy >= 3.5) dqi += 15;
  else if (moodPatterns.averageEnergy < 2.5) dqi -= 20;
  if (moodPatterns.recentMoodTrend === 'improving') dqi += 10;
  else if (moodPatterns.recentMoodTrend === 'declining') dqi -= 15;
  if (mayaInsights.averageSuccessRate > 0.7) dqi += 10;
  dqi = Math.max(0, Math.min(100, dqi));

  // Habit Formation Velocity
  let habitVelocity = 'unknown';
  if (mayaInsights.activeHabits > 0) {
    if (mayaInsights.averageSuccessRate > 0.8) habitVelocity = 'fast (21-30 days)';
    else if (mayaInsights.averageSuccessRate > 0.5) habitVelocity = 'moderate (30-66 days)';
    else habitVelocity = 'slow (66+ days)';
  }

  // Motivation Sustainability
  let motivationSustainability = 'moderate';
  if (mayaInsights.keystoneHabits.length > 0 && mayaInsights.averageSuccessRate > 0.7) {
    motivationSustainability = 'high (intrinsic drivers active)';
  } else if (mayaInsights.atRiskHabits.length > 2 || moodPatterns.recentMoodTrend === 'declining') {
    motivationSustainability = 'low (motivation fatigue signals)';
  }

  // Financial Stress Level
  let financialStress = 'moderate';
  const hasOverBudget = spendingInsights.some((i) => i.includes('over budget'));
  const hasBehindGoals = spendingInsights.some((i) => i.includes('behind'));
  if (hasOverBudget && hasBehindGoals) {
    financialStress = 'elevated (multiple stress signals)';
    patterns.push('Financial stress correlating with habit struggles');
  } else if (hasOverBudget || hasBehindGoals) {
    financialStress = 'moderate (one area needs attention)';
  } else {
    financialStress = 'low (on track)';
  }

  // Detect cross-domain patterns
  if (mayaInsights.atRiskHabits.length > 0 && moodPatterns.recentMoodTrend === 'declining') {
    patterns.push('Habit struggles + declining mood = likely stress cascade');
  }
  if (mayaInsights.keystoneHabits.length > 0 && mayaInsights.averageSuccessRate > 0.7) {
    patterns.push('Active keystone habit = strong foundation for other changes');
  }
  if (moodPatterns.averageEnergy < 2.5 && hasOverBudget) {
    patterns.push('Low energy + overspending = possible emotional spending pattern');
  }
  if (mayaInsights.currentStreaks.length >= 3) {
    patterns.push(
      `Multiple active streaks (${mayaInsights.currentStreaks.length}) = momentum building`
    );
  }

  return {
    decisionQualityIndex: Math.round(dqi),
    habitFormationVelocity: habitVelocity,
    motivationSustainability,
    financialStressLevel: financialStress,
    patterns,
  };
}

// ============================================================================
// BUILD COMPREHENSIVE BRIEFING
// ============================================================================

async function buildInsightBriefing(
  userId: string,
  _isHandoff: boolean
): Promise<UserInsightBriefing> {
  // Parallel fetch from all data sources
  const [spendingInsights, goalInsights, mayaInsights, moodPatterns, memoryInsights] =
    await Promise.all([
      analyzeSpendingPatterns(userId),
      analyzeGoalTrajectory(userId),
      getMayaHabitInsights(userId),
      getMoodPatterns(userId),
      getMemoryOrchestratorInsights(userId),
    ]);

  const crossDomainPatterns = generateCrossDomainPatterns();
  const personalLifeInsights = analyzePersonalLifePatterns();
  const coachingInsights = generateCoachingInsights();
  const financialDeepInsights = generateDeepFinancialInsights();

  // Detect proactive coaching triggers (sync, based on already-fetched data)
  const proactiveCoachingInsights = detectProactiveCoachingInsights(userId, mayaInsights);

  // Compute behavioral metrics from cross-team data
  const behavioralMetrics = computeBehavioralMetrics(mayaInsights, moodPatterns, spendingInsights);

  // Proactive discoveries Peter should surface
  const proactiveDiscoveries: string[] = [];

  // Spending anomalies
  if (spendingInsights.some((i) => i.includes('over budget') || i.includes('ahead'))) {
    proactiveDiscoveries.push(
      'Spending patterns worth surfacing - look for the right moment to share the insight.'
    );
  }

  // Goal milestones
  if (goalInsights.some((i) => i.includes('SO close') || i.includes('AHEAD'))) {
    proactiveDiscoveries.push(
      "Goal milestones detected - celebrate the progress and explore what's working!"
    );
  }

  // Maya's habit data discoveries
  if (mayaInsights.keystoneHabits.length > 0) {
    proactiveDiscoveries.push(
      `Keystone habit active: "${mayaInsights.keystoneHabits[0]}" - this is driving other behaviors`
    );
  }
  if (mayaInsights.atRiskHabits.length > 0) {
    proactiveDiscoveries.push(
      `At-risk habit: "${mayaInsights.atRiskHabits[0]}" had a streak but is struggling - intervention point`
    );
  }
  if (mayaInsights.currentStreaks.length > 0) {
    const topStreak = mayaInsights.currentStreaks[0];
    proactiveDiscoveries.push(
      `Strong streak: "${topStreak.name}" at ${topStreak.streak} days - acknowledge this!`
    );
  }

  // Mood pattern discoveries
  if (moodPatterns.recentMoodTrend === 'declining') {
    proactiveDiscoveries.push(
      'Declining mood trend detected - approach with extra care, look for underlying causes'
    );
  }
  if (moodPatterns.averageEnergy < 2.5) {
    proactiveDiscoveries.push('Low energy average - may need to address rest before goals');
  }

  // Behavioral metric discoveries
  if (behavioralMetrics.patterns.length > 0) {
    proactiveDiscoveries.push(`Cross-domain pattern: ${behavioralMetrics.patterns[0]}`);
  }

  // Memory system insights
  if (memoryInsights.behavioralPatterns.length > 0) {
    proactiveDiscoveries.push(...memoryInsights.behavioralPatterns.slice(0, 1));
  }
  if (memoryInsights.memoryHealth && memoryInsights.memoryHealth.totalMemories > 50) {
    proactiveDiscoveries.push(
      `Deep relationship history available - can reference patterns from earlier conversations`
    );
  }

  // Proactive coaching trigger insights
  if (proactiveCoachingInsights.priorityInsights.length > 0) {
    proactiveDiscoveries.push(...proactiveCoachingInsights.priorityInsights);
  }

  // Personal life discoveries
  if (personalLifeInsights.length > 0) {
    proactiveDiscoveries.push(...personalLifeInsights.slice(0, 1));
  }

  // Build habit correlations (framework prompts + real correlations)
  const habitCorrelations: string[] = [];
  if (behavioralMetrics.patterns.length > 0) {
    habitCorrelations.push(...behavioralMetrics.patterns.slice(0, 2));
  }
  habitCorrelations.push(...coachingInsights.slice(0, 2), ...financialDeepInsights.slice(0, 2));

  return {
    spendingInsights,
    habitCorrelations,
    goalInsights,
    crossDomainPatterns: [...crossDomainPatterns, ...personalLifeInsights.slice(1)],
    anomalies: spendingInsights.filter(
      (i) => i.includes('over') || i.includes('ahead') || i.includes('behind')
    ),
    proactiveDiscoveries,
    mayaInsights,
    moodPatterns,
    behavioralMetrics,
  };
}

// ============================================================================
// FORMAT BRIEFING FOR INJECTION
// ============================================================================

function formatBriefingForInjection(
  briefing: UserInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  // Opening context
  sections.push(`[PETER'S RESEARCH BRIEFING - Turn ${turnCount}]`);

  // Handoff context first (if transferring to Peter)
  if (handoffBriefing) {
    sections.push('\n=== HANDOFF CONTEXT ===');
    sections.push(`Topic in progress: ${handoffBriefing.topic}`);

    if (handoffBriefing.previousPersonaInsights.length > 0) {
      sections.push(`From previous persona: ${handoffBriefing.previousPersonaInsights.join('; ')}`);
    }

    if (handoffBriefing.questionsForPeter.length > 0) {
      sections.push(`Questions for your research: ${handoffBriefing.questionsForPeter.join('; ')}`);
    }

    if (handoffBriefing.emotionalWeight > 0.5) {
      sections.push(
        'NOTE: User may be emotionally charged. Start with validation before diving into data.'
      );
    }
  }

  // COMPUTED BEHAVIORAL METRICS (Peter's research dashboard)
  const { behavioralMetrics } = briefing;
  sections.push('\n=== YOUR COMPUTED METRICS (Real Data) ===');
  sections.push(`• Decision Quality Index: ${behavioralMetrics.decisionQualityIndex}/100`);
  sections.push(`• Habit Formation Velocity: ${behavioralMetrics.habitFormationVelocity}`);
  sections.push(`• Motivation Sustainability: ${behavioralMetrics.motivationSustainability}`);
  sections.push(`• Financial Stress Level: ${behavioralMetrics.financialStressLevel}`);

  // Cross-domain patterns from behavioral analysis
  if (behavioralMetrics.patterns.length > 0) {
    sections.push('\n=== CROSS-DOMAIN CORRELATIONS DETECTED ===');
    behavioralMetrics.patterns.forEach((pattern) => {
      sections.push(`🔗 ${pattern}`);
    });
  }

  // MAYA'S HABIT DATA (Cross-team integration)
  const { mayaInsights } = briefing;
  if (mayaInsights.activeHabits > 0) {
    sections.push('\n=== FROM MAYA (Habit Intelligence) ===');
    sections.push(`• Active habits: ${mayaInsights.activeHabits}`);
    sections.push(`• Success rate: ${Math.round(mayaInsights.averageSuccessRate * 100)}%`);
    sections.push(`• Total completions: ${mayaInsights.totalCompletions}`);

    if (mayaInsights.keystoneHabits.length > 0) {
      sections.push(`• 🌟 Keystone habits: ${mayaInsights.keystoneHabits.join(', ')}`);
    }
    if (mayaInsights.currentStreaks.length > 0) {
      const streakStr = mayaInsights.currentStreaks
        .slice(0, 3)
        .map((s) => `${s.name} (${s.streak}d)`)
        .join(', ');
      sections.push(`• 🔥 Active streaks: ${streakStr}`);
    }
    if (mayaInsights.atRiskHabits.length > 0) {
      sections.push(`• ⚠️ At-risk habits: ${mayaInsights.atRiskHabits.join(', ')}`);
    }
    if (mayaInsights.habitStacks.length > 0) {
      sections.push(`• Habit stacks: ${mayaInsights.habitStacks.join(', ')}`);
    }
    if (mayaInsights.weeklyReflectionSummary) {
      sections.push(`• Latest reflection: ${mayaInsights.weeklyReflectionSummary}`);
    }
  }

  // MOOD/ENERGY DATA
  const { moodPatterns } = briefing;
  if (moodPatterns.lastMood || moodPatterns.recentMoodTrend !== 'unknown') {
    sections.push('\n=== MOOD/ENERGY INTELLIGENCE ===');
    if (moodPatterns.lastMood) {
      sections.push(
        `• Last logged: Mood ${moodPatterns.lastMood.mood}, Energy ${moodPatterns.lastMood.energy}`
      );
    }
    sections.push(`• Mood trend (2 weeks): ${moodPatterns.recentMoodTrend}`);
    sections.push(`• Average energy: ${moodPatterns.averageEnergy.toFixed(1)}/5`);
    if (moodPatterns.moodCorrelations.length > 0) {
      moodPatterns.moodCorrelations.forEach((corr) => {
        sections.push(`• 💡 ${corr}`);
      });
    }
  }

  // Spending insights
  if (briefing.spendingInsights.length > 0) {
    sections.push('\n=== SPENDING PATTERNS DETECTED ===');
    briefing.spendingInsights.slice(0, 3).forEach((insight) => {
      sections.push(`• ${insight}`);
    });
  }

  // Goal trajectory
  if (briefing.goalInsights.length > 0) {
    sections.push('\n=== GOAL TRAJECTORY ===');
    briefing.goalInsights.slice(0, 2).forEach((insight) => {
      sections.push(`• ${insight}`);
    });
  }

  // Coaching & Personal Research Analytics
  if (briefing.habitCorrelations.length > 0) {
    sections.push('\n=== COACHING ANALYTICS TO APPLY ===');
    briefing.habitCorrelations.slice(0, 3).forEach((insight) => {
      sections.push(`• ${insight}`);
    });
  }

  // Cross-domain patterns (framework reminders) - only on first turns
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR RESEARCH FRAMEWORKS ===');
    sections.push('• Two-Minute Drill: Can you explain any finding simply?');
    sections.push('• Story Behind the Numbers: Every data point has a human story');
    sections.push('• Leading vs Lagging: Focus on what PREDICTS, not just what MEASURES');
    sections.push('• Cross-Domain: Best insights come from connecting unrelated data');
    sections.push('• Behavioral Economics: People are not rational - find the emotional driver');
  }

  // Time-based context
  const timePatterns = analyzeTimePatterns();
  if (timePatterns.length > 0) {
    sections.push('\n=== TIME CONTEXT ===');
    timePatterns.slice(0, 1).forEach((pattern) => {
      sections.push(`• ${pattern}`);
    });
  }

  // Proactive discoveries (top priority items)
  if (briefing.proactiveDiscoveries.length > 0) {
    sections.push('\n=== 🎯 PROACTIVE OPPORTUNITIES ===');
    briefing.proactiveDiscoveries.slice(0, 5).forEach((discovery) => {
      sections.push(`• ${discovery}`);
    });
  }

  sections.push(
    "\n[Remember: Make data human. Find the story. Connect the dots they haven't seen.]"
  );

  return sections;
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

async function buildPeterResearchInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData, userProfile: _userProfile } = input;

  // Only activate for Peter
  const servicesWithPersona = services as { personaId?: string };
  const currentPersona = servicesWithPersona?.personaId || '';

  const isPeter = ['peter', 'peter-john', 'the-quant', 'insights-guy'].includes(
    currentPersona.toLowerCase()
  );

  if (!isPeter) {
    return injections;
  }

  const userId = services?.userId || 'anonymous';
  if (userId === 'anonymous') {
    return injections;
  }

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  // Check if this is a handoff situation
  const handoffBriefing = analyzeHandoffContext();
  const isHandoff = handoffBriefing !== null;

  // Determine when to inject briefing
  // - Always on first turn (turn 0)
  // - On handoff (regardless of turn)
  // - Periodically (every 10 turns) for refresh
  const shouldInjectBriefing =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInjectBriefing) {
    return injections;
  }

  try {
    // Build comprehensive briefing
    const briefing = await buildInsightBriefing(userId, isHandoff);

    // Format for injection
    const briefingLines = formatBriefingForInjection(briefing, handoffBriefing, turnCount);
    const briefingContent = briefingLines.join('\n');

    // Determine injection priority based on context
    if (isHandoff) {
      // High priority on handoff - Peter needs this context immediately
      injections.push(
        createHighInjection('peter_handoff_briefing', briefingContent, {
          category: 'persona-research',
          confidence: 0.9,
        })
      );

      log.info(
        {
          userId,
          turnCount,
          handoffTopic: handoffBriefing?.topic,
          insightCount:
            briefing.spendingInsights.length +
            briefing.goalInsights.length +
            briefing.proactiveDiscoveries.length,
        },
        '📊 Peter loaded with handoff research briefing'
      );
    } else if (turnCount === 0) {
      // Standard priority on first turn
      injections.push(
        createStandardInjection('peter_initial_briefing', briefingContent, {
          category: 'persona-research',
          confidence: 0.8,
        })
      );

      log.info(
        {
          userId,
          turnCount,
          spendingInsights: briefing.spendingInsights.length,
          goalInsights: briefing.goalInsights.length,
        },
        '📊 Peter loaded with initial research briefing'
      );
    } else {
      // Hint priority for periodic refresh
      injections.push(
        createHintInjection('peter_refresh_briefing', briefingContent, {
          category: 'persona-research',
          confidence: 0.6,
        })
      );
    }

    // Update session state
    session.briefingTurn = turnCount;
    session.initialBriefingGiven = true;

    // Add Peter's research mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'peter_mindset',
          "[PETER'S MINDSET: You see patterns nobody else sees. Every number has a story. " +
            'Connect the dots across spending, habits, time, and goals. Make the complex simple. ' +
            "Get excited about discoveries! The Two-Minute Drill: if you can't explain it simply, dig deeper.]",
          { category: 'persona-identity' }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Peter research briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'peter-research-insights',
  description:
    'Loads Peter with deep research insights about the user - spending patterns, goal trajectory, cross-domain correlations, and handoff context',
  priority: 45, // Run early to inform Peter's responses
  category: BuilderCategory.PERSONA,
  build: buildPeterResearchInsightsContext,
});

export { buildPeterResearchInsightsContext };
