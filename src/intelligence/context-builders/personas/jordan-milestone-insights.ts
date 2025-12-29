/**
 * Jordan's Milestone Insights Context Builder
 *
 * > "I can SEE this coming together!"
 *
 * This builder loads Jordan with deep life planning insights when:
 * 1. A user transfers TO Jordan from another persona
 * 2. A user starts talking directly with Jordan
 *
 * DATA SOURCES (Cross-Team Integration):
 *
 * FROM PETER (Financial Analysis):
 * - Financial readiness for milestones
 * - Budget health for event planning
 * - Savings velocity toward goals
 * - Investment timing for major purchases
 *
 * FROM MAYA (Habits/Productivity):
 * - Habit momentum supporting goals
 * - Keystone habits driving progress
 * - Energy patterns for planning capacity
 * - Routine stability for event prep
 *
 * FROM ALEX (Calendar/Communication):
 * - Calendar density for planning windows
 * - Upcoming commitments affecting milestones
 * - Communication load analysis
 *
 * FROM NAYAN (Wisdom/Long-term):
 * - Life stage context and transitions
 * - Values alignment with goals
 * - Long-term perspective on decisions
 *
 * FROM FERNI (Memory Orchestrator):
 * - Historical milestone patterns
 * - Emotional significance of past events
 * - Relationship and family context
 * - Anniversary and date tracking
 *
 * INSIGHT CATEGORIES:
 *
 * 1. COMPUTED PLANNING METRICS
 *    - Planning Velocity Index (how fast goals progress)
 *    - Celebration Readiness Score (emotional/financial)
 *    - Life Stage Momentum (transition readiness)
 *    - Event Success Predictor
 *
 * 2. PROACTIVE DISCOVERIES
 *    - Milestone opportunities to celebrate
 *    - Anniversary and date reminders
 *    - Life stage transition signals
 *    - Goal completion approaching
 *
 * 3. CROSS-DOMAIN PATTERNS
 *    - How habits support milestone progress
 *    - Financial readiness for life events
 *    - Calendar capacity for planning
 *    - Emotional readiness indicators
 *
 * 4. SEASONAL AWARENESS
 *    - Wedding season patterns
 *    - Graduation season energy
 *    - Holiday planning windows
 *    - Personal anniversary tracking
 *
 * @module intelligence/context-builders/jordan-milestone-insights
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
import { getFinancialStore } from '../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../services/stores/productivity-store.js';
import { getGamificationStore } from '../../../services/engagement/gamification-store.js';
import { getSuperhuman } from '../superhuman/superhuman-integration.js';
import { getMemoryOrchestrator } from '../../../memory/orchestrator.js';
// Better Than Human: Milestone Calendar Sync
import { buildMilestoneCalendarContext } from '../../../services/milestones/milestone-calendar-sync.js';
// Cross-Persona: Jordan ↔ Alex Coordination
import { getCoordinationContext } from '../../../services/superhuman/jordan-alex-coordinator.js';

const log = createLogger({ module: 'context:jordan-milestone-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface JordanInsightBriefing {
  /** Active goals overview */
  goalsOverview: GoalsOverview;
  /** Financial insights from Peter */
  peterInsights: PeterFinancialInsights;
  /** Habit momentum from Maya */
  mayaInsights: HabitInsights;
  /** Mood/energy patterns */
  moodPatterns: MoodInsights;
  /** Memory orchestrator insights */
  memoryInsights: MemoryInsights;
  /** Computed planning metrics */
  planningMetrics: PlanningMetrics;
  /** Celebration opportunities */
  celebrationOpportunities: string[];
  /** Timeline alerts */
  timelineAlerts: string[];
  /** Life stage context */
  lifeStageContext: LifeStageContext;
  /** Proactive discoveries */
  proactiveDiscoveries: string[];
  /** Seasonal awareness */
  seasonalContext: SeasonalContext;
  /** Better Than Human: Milestone calendar sync from Alex */
  milestoneCalendarSync: string | null;
  /** Cross-Persona: Jordan ↔ Alex coordination context */
  alexCoordinationContext: string | null;
}

interface GoalsOverview {
  activeGoals: number;
  nearingCompletion: string[];
  atRisk: string[];
  recentlyAchieved: string[];
  totalSavedTowardGoals: number;
  biggestGoal: { name: string; progress: number; targetAmount: number } | null;
  milestoneDates: Array<{ name: string; date: Date; daysAway: number }>;
}

interface PeterFinancialInsights {
  budgetHealth: 'excellent' | 'good' | 'tight' | 'stressed';
  savingsVelocity: string;
  monthsToGoalCompletion: number | null;
  eventBudgetCapacity: number;
  financialReadiness: string[];
}

interface HabitInsights {
  activeHabits: number;
  keystoneHabits: string[];
  currentStreaks: Array<{ name: string; streak: number }>;
  atRiskHabits: string[];
  averageSuccessRate: number;
  planningRelatedHabits: string[];
  momentumScore: number;
}

interface MoodInsights {
  recentMoodTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  averageEnergy: number;
  celebrationReadiness: 'high' | 'moderate' | 'low';
  lastMood: { mood: string; energy: string } | null;
}

interface MemoryInsights {
  totalMemories: number;
  milestoneMentions: string[];
  upcomingAnniversaries: Array<{ event: string; date: Date; yearsAgo: number }>;
  pastCelebrations: string[];
  familyContext: string[];
  relationshipMilestones: string[];
}

interface PlanningMetrics {
  /** Planning Velocity Index (0-100) - how efficiently goals progress */
  planningVelocityIndex: number;
  /** Celebration Readiness Score (0-100) - emotional + financial readiness */
  celebrationReadinessScore: number;
  /** Life Stage Momentum (0-100) - transition energy */
  lifeStageMomentum: number;
  /** Event Success Predictor (0-100) */
  eventSuccessPredictor: number;
  /** Key patterns detected */
  patterns: string[];
}

interface LifeStageContext {
  currentStage: string;
  transitionSignals: string[];
  stageSpecificAdvice: string[];
  upcomingTransitions: string[];
}

interface SeasonalContext {
  currentSeason: string;
  seasonalOpportunities: string[];
  upcomingDates: Array<{ name: string; date: string; daysAway: number }>;
  planningWindows: string[];
}

interface HandoffBriefing {
  topic: string;
  planningContext: string | null;
  excitementLevel: 'low' | 'medium' | 'high';
  actionItems: string[];
  emotionalWeight: number;
  previousPersonaInsights: string[];
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface JordanSession {
  briefingTurn: number;
  celebratedMilestones: Set<string>;
  surfacedInsights: Set<string>;
}

const sessions = new Map<string, JordanSession>();

function getSession(sessionId: string): JordanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      briefingTurn: -1,
      celebratedMilestones: new Set(),
      surfacedInsights: new Set(),
    };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearJordanMilestoneSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// GOALS OVERVIEW ANALYSIS
// ============================================================================

async function analyzeGoalsOverview(userId: string): Promise<GoalsOverview> {
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

async function getPeterFinancialInsights(userId: string): Promise<PeterFinancialInsights> {
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

async function getMayaHabitInsights(userId: string): Promise<HabitInsights> {
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

async function getMoodPatterns(userId: string): Promise<MoodInsights> {
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

async function getMemoryOrchestratorInsights(userId: string): Promise<MemoryInsights> {
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

// ============================================================================
// COMPUTED PLANNING METRICS
// ============================================================================

function computePlanningMetrics(
  goalsOverview: GoalsOverview,
  peterInsights: PeterFinancialInsights,
  mayaInsights: HabitInsights,
  moodPatterns: MoodInsights
): PlanningMetrics {
  const patterns: string[] = [];

  // Planning Velocity Index (0-100)
  // Based on: goal progress rate, financial capacity, habit support
  let planningVelocity = 50;
  if (peterInsights.savingsVelocity === 'rapid') planningVelocity += 20;
  else if (peterInsights.savingsVelocity === 'steady') planningVelocity += 10;
  if (goalsOverview.nearingCompletion.length > 0) planningVelocity += 15;
  if (goalsOverview.atRisk.length > 0) planningVelocity -= 15;
  if (mayaInsights.planningRelatedHabits.length > 0) planningVelocity += 10;
  planningVelocity = Math.max(0, Math.min(100, planningVelocity));

  // Celebration Readiness Score (0-100)
  // Based on: mood, energy, financial health, emotional capacity
  let celebrationReadiness = 50;
  if (moodPatterns.celebrationReadiness === 'high') celebrationReadiness += 25;
  else if (moodPatterns.celebrationReadiness === 'low') celebrationReadiness -= 20;
  if (peterInsights.budgetHealth === 'excellent') celebrationReadiness += 15;
  else if (peterInsights.budgetHealth === 'stressed') celebrationReadiness -= 15;
  if (moodPatterns.recentMoodTrend === 'improving') celebrationReadiness += 10;
  else if (moodPatterns.recentMoodTrend === 'declining') celebrationReadiness -= 10;
  celebrationReadiness = Math.max(0, Math.min(100, celebrationReadiness));

  // Life Stage Momentum (0-100)
  // Based on: active goals, milestone dates, transition signals
  let lifeStageMomentum = 50;
  if (goalsOverview.activeGoals >= 3) lifeStageMomentum += 15;
  if (goalsOverview.milestoneDates.length > 0) lifeStageMomentum += 15;
  if (goalsOverview.recentlyAchieved.length > 0) lifeStageMomentum += 20;
  if (mayaInsights.momentumScore > 70) lifeStageMomentum += 10;
  lifeStageMomentum = Math.max(0, Math.min(100, lifeStageMomentum));

  // Event Success Predictor (0-100)
  // Composite of all factors
  const eventSuccessPredictor = Math.round(
    planningVelocity * 0.3 +
      celebrationReadiness * 0.3 +
      lifeStageMomentum * 0.2 +
      mayaInsights.momentumScore * 0.2
  );

  // Detect cross-domain patterns
  if (peterInsights.budgetHealth === 'excellent' && moodPatterns.celebrationReadiness === 'high') {
    patterns.push('💫 Perfect storm: Financial + emotional readiness aligned for big planning!');
  }
  if (goalsOverview.nearingCompletion.length > 0 && mayaInsights.keystoneHabits.length > 0) {
    patterns.push('🎯 Goals nearing completion with habit support - strong finish predicted');
  }
  if (moodPatterns.recentMoodTrend === 'declining' && goalsOverview.atRisk.length > 0) {
    patterns.push('⚠️ Declining mood + at-risk goals - may need timeline adjustment or support');
  }
  if (mayaInsights.planningRelatedHabits.length > 0 && peterInsights.savingsVelocity === 'rapid') {
    patterns.push('📈 Planning habits + rapid savings = milestone acceleration mode!');
  }

  return {
    planningVelocityIndex: Math.round(planningVelocity),
    celebrationReadinessScore: Math.round(celebrationReadiness),
    lifeStageMomentum: Math.round(lifeStageMomentum),
    eventSuccessPredictor,
    patterns,
  };
}

// ============================================================================
// LIFE STAGE CONTEXT
// ============================================================================

function analyzeLifeStageContext(
  goalsOverview: GoalsOverview,
  memoryInsights: MemoryInsights
): LifeStageContext {
  const context: LifeStageContext = {
    currentStage: 'active-planning',
    transitionSignals: [],
    stageSpecificAdvice: [],
    upcomingTransitions: [],
  };

  // Detect life stage from biggest goal
  if (goalsOverview.biggestGoal) {
    const name = goalsOverview.biggestGoal.name.toLowerCase();

    if (name.includes('house') || name.includes('home')) {
      context.currentStage = 'home-buying';
      context.stageSpecificAdvice.push(
        'Home buying chapter! Focus on: neighborhood research, pre-approval timeline, inspection checklist'
      );
      context.transitionSignals.push('Major transition: From renter to homeowner mindset');
    } else if (name.includes('wedding')) {
      context.currentStage = 'wedding-planning';
      context.stageSpecificAdvice.push(
        'Wedding planning! Key decisions: venue → date → guest list → vendors. Timeline is everything.'
      );
      context.transitionSignals.push('Life transition: Merging two lives and families');
    } else if (name.includes('baby') || name.includes('nursery') || name.includes('family')) {
      context.currentStage = 'growing-family';
      context.stageSpecificAdvice.push(
        'Growing family chapter! Consider: childcare plans, life insurance, estate basics'
      );
      context.transitionSignals.push('Identity shift: Becoming a parent changes everything');
    } else if (name.includes('retire')) {
      context.currentStage = 'retirement-transition';
      context.stageSpecificAdvice.push(
        'Retirement chapter! Focus on: income sources, healthcare coverage, purpose discovery'
      );
      context.transitionSignals.push('Major transition: From accumulation to distribution phase');
    } else if (name.includes('graduate') || name.includes('school')) {
      context.currentStage = 'education-transition';
      context.stageSpecificAdvice.push(
        'Education milestone! Consider: celebration plans, next chapter preparation'
      );
    }
  }

  // Add family context from memories
  if (memoryInsights.familyContext.length > 0) {
    context.upcomingTransitions.push(
      'Family milestones may be coming - stay tuned to their mentions'
    );
  }

  // General stage advice
  context.stageSpecificAdvice.push(
    'Remember: Hard chapters deserve presence, not positivity. Celebrate ALL progress.'
  );

  return context;
}

// ============================================================================
// SEASONAL AWARENESS
// ============================================================================

function analyzeSeasonalContext(): SeasonalContext {
  const now = new Date();
  const month = now.getMonth();
  const dayOfWeek = now.getDay();

  const context: SeasonalContext = {
    currentSeason: '',
    seasonalOpportunities: [],
    upcomingDates: [],
    planningWindows: [],
  };

  // Determine season and opportunities
  if (month >= 4 && month <= 5) {
    context.currentSeason = 'graduation-season';
    context.seasonalOpportunities.push(
      '🎓 GRADUATION SEASON! I cry at graduations. Any graduations. Happy tears.'
    );
    context.seasonalOpportunities.push(
      'Great time for: milestone celebrations, fresh start planning'
    );
  } else if (month >= 5 && month <= 9) {
    context.currentSeason = 'wedding-season';
    context.seasonalOpportunities.push(
      '💒 WEDDING SEASON! Peak planning energy. Love is in the air.'
    );
    context.seasonalOpportunities.push('Peak engagement: venue hunting, guest list planning');
  } else if (month >= 10 && month <= 11) {
    context.currentSeason = 'holiday-prep';
    context.seasonalOpportunities.push('🦃 Holiday season approaching - family gathering planning');
    context.seasonalOpportunities.push('Good for: year-end reviews, next year goal setting');
  } else if (month === 0) {
    context.currentSeason = 'fresh-start';
    context.seasonalOpportunities.push('🎊 NEW YEAR! Fresh start energy. Vision casting time!');
    context.seasonalOpportunities.push('Perfect for: annual planning, big picture dreaming');
  } else if (month >= 1 && month <= 3) {
    context.currentSeason = 'planning-season';
    context.seasonalOpportunities.push('📋 Peak planning season - summer event prep begins now');
  }

  // Time-based planning windows
  if (dayOfWeek === 0) {
    context.planningWindows.push('Sunday planning energy! Good day for big picture thinking.');
  } else if (dayOfWeek === 1) {
    context.planningWindows.push('Monday fresh start! High motivation for new plans.');
  }

  // Upcoming notable dates (within 90 days)
  const valentines = new Date(now.getFullYear(), 1, 14);
  const mothersDay = new Date(now.getFullYear(), 4, 11); // Approximate
  const fathersDay = new Date(now.getFullYear(), 5, 18); // Approximate

  const notableDates = [
    { name: "Valentine's Day", date: valentines },
    { name: "Mother's Day", date: mothersDay },
    { name: "Father's Day", date: fathersDay },
  ];

  for (const notable of notableDates) {
    let targetDate = notable.date;
    if (targetDate < now) {
      targetDate = new Date(targetDate.setFullYear(targetDate.getFullYear() + 1));
    }
    const daysAway = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAway <= 90) {
      context.upcomingDates.push({
        name: notable.name,
        date: targetDate.toLocaleDateString(),
        daysAway,
      });
    }
  }

  return context;
}

// ============================================================================
// CELEBRATION OPPORTUNITY DETECTION
// ============================================================================

function detectCelebrationOpportunities(
  goalsOverview: GoalsOverview,
  planningMetrics: PlanningMetrics,
  memoryInsights: MemoryInsights
): string[] {
  const opportunities: string[] = [];

  // Near completion celebrations
  for (const goal of goalsOverview.nearingCompletion) {
    opportunities.push(`🎯 ${goal} - SO CLOSE! Finish line energy!`);
  }

  // Recently achieved
  for (const goal of goalsOverview.recentlyAchieved) {
    opportunities.push(`🏆 ${goal} ACHIEVED! This NEEDS a celebration moment!`);
  }

  // Savings milestone
  if (goalsOverview.totalSavedTowardGoals >= 1000) {
    const formatted = goalsOverview.totalSavedTowardGoals.toLocaleString();
    opportunities.push(`💰 $${formatted} total saved toward goals - that's REAL progress!`);
  }

  // Multiple active goals
  if (goalsOverview.activeGoals >= 3) {
    opportunities.push(
      `📋 ${goalsOverview.activeGoals} active goals - building their life portfolio!`
    );
  }

  // Upcoming milestone dates
  for (const milestone of goalsOverview.milestoneDates.slice(0, 3)) {
    if (milestone.daysAway <= 30) {
      opportunities.push(
        `📅 "${milestone.name}" deadline in ${milestone.daysAway} days - countdown mode!`
      );
    }
  }

  // Planning metrics celebration
  if (planningMetrics.eventSuccessPredictor >= 80) {
    opportunities.push('🌟 Event Success Predictor at 80%+ - this person is READY to plan big!');
  }

  // Memory-based opportunities
  if (memoryInsights.totalMemories > 30) {
    opportunities.push('📚 Deep relationship - can celebrate their journey with specific memories');
  }

  return opportunities;
}

// ============================================================================
// PROACTIVE DISCOVERIES
// ============================================================================

function generateProactiveDiscoveries(
  briefing: Omit<JordanInsightBriefing, 'proactiveDiscoveries'>
): string[] {
  const discoveries: string[] = [];

  // Goal-based discoveries
  if (briefing.goalsOverview.nearingCompletion.length > 0) {
    discoveries.push(
      `🎯 Goals nearing completion: ${briefing.goalsOverview.nearingCompletion.join(', ')} - celebrate progress!`
    );
  }

  // Financial readiness discoveries
  if (briefing.peterInsights.budgetHealth === 'excellent') {
    discoveries.push(
      '💪 Financial runway is excellent - good time to dream bigger on milestone planning!'
    );
  }

  // Habit momentum discoveries
  if (briefing.mayaInsights.keystoneHabits.length > 0) {
    discoveries.push(
      `🔑 Keystone habit "${briefing.mayaInsights.keystoneHabits[0]}" is driving momentum - connect it to milestone progress`
    );
  }

  // Mood-based discoveries
  if (briefing.moodPatterns.celebrationReadiness === 'high') {
    discoveries.push('🎉 Emotional readiness is HIGH - perfect time for celebration planning!');
  } else if (briefing.moodPatterns.recentMoodTrend === 'declining') {
    discoveries.push('💙 Mood trend declining - approach with extra care, honor where they are');
  }

  // Memory-based discoveries
  if (briefing.memoryInsights.milestoneMentions.length > 0) {
    discoveries.push(
      `📝 Past milestone discussions: ${briefing.memoryInsights.milestoneMentions[0]} - connect to current planning`
    );
  }

  // Planning metrics discoveries
  for (const pattern of briefing.planningMetrics.patterns.slice(0, 2)) {
    discoveries.push(pattern);
  }

  // Life stage discoveries
  if (briefing.lifeStageContext.transitionSignals.length > 0) {
    discoveries.push(`🔄 ${briefing.lifeStageContext.transitionSignals[0]}`);
  }

  // Seasonal discoveries
  if (briefing.seasonalContext.seasonalOpportunities.length > 0) {
    discoveries.push(briefing.seasonalContext.seasonalOpportunities[0]);
  }

  // Timeline alerts as discoveries
  for (const alert of briefing.timelineAlerts.slice(0, 2)) {
    discoveries.push(alert);
  }

  return discoveries;
}

// ============================================================================
// TIMELINE ALERTS
// ============================================================================

function generateTimelineAlerts(
  goalsOverview: GoalsOverview,
  peterInsights: PeterFinancialInsights
): string[] {
  const alerts: string[] = [];

  // At-risk goals
  for (const goal of goalsOverview.atRisk) {
    alerts.push(`⚠️ "${goal}" is behind schedule - might need timeline adjustment`);
  }

  // Financial constraints affecting timeline
  if (peterInsights.budgetHealth === 'stressed') {
    alerts.push('💸 Budget stress may impact milestone timelines - plan for flexibility');
  }

  // No current goals
  if (goalsOverview.activeGoals === 0) {
    alerts.push("📝 No active goals yet - what's the next chapter they're dreaming about?");
  }

  // Upcoming deadlines
  for (const milestone of goalsOverview.milestoneDates) {
    if (milestone.daysAway <= 14) {
      alerts.push(`🚨 "${milestone.name}" deadline in ${milestone.daysAway} days - crunch time!`);
    }
  }

  return alerts;
}

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

function analyzeHandoffForJordan(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();
  if (!handoffContext) return null;

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'planning',
    planningContext: null,
    excitementLevel: 'medium',
    actionItems: [],
    emotionalWeight: 0,
    previousPersonaInsights: [],
  };

  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lower = topic.toLowerCase();

    // From Peter - financial readiness
    if (lower.includes('saving') || lower.includes('budget') || lower.includes('afford')) {
      briefing.planningContext = 'financial-planning';
      briefing.actionItems.push(`Peter crunched numbers for "${topic}" - help make it real`);
    }

    // From Maya - habit support
    if (lower.includes('habit') || lower.includes('routine') || lower.includes('streak')) {
      briefing.planningContext = 'habit-supported-goal';
      briefing.actionItems.push(`Maya's building habits for "${topic}" - tie them to milestones`);
    }

    // From Nayan - wisdom context
    if (lower.includes('values') || lower.includes('purpose') || lower.includes('meaning')) {
      briefing.planningContext = 'values-aligned-planning';
      briefing.actionItems.push(
        `Nayan explored values around "${topic}" - align milestones to meaning`
      );
    }

    // Exciting topics
    if (
      lower.includes('wedding') ||
      lower.includes('baby') ||
      lower.includes('house') ||
      lower.includes('vacation') ||
      lower.includes('retirement')
    ) {
      briefing.excitementLevel = 'high';
    }

    // Difficult topics
    if (
      lower.includes('divorce') ||
      lower.includes('loss') ||
      lower.includes('ending') ||
      lower.includes('transition')
    ) {
      briefing.excitementLevel = 'low';
      briefing.planningContext = 'life-transition';
      briefing.emotionalWeight = 0.7;
    }
  }

  // Capture summary
  if (handoffContext.summary) {
    briefing.previousPersonaInsights.push(`Previous persona noted: "${handoffContext.summary}"`);
  }

  // Emotional state
  if (handoffContext.emotionalState && handoffContext.emotionalState !== 'neutral') {
    briefing.previousPersonaInsights.push(
      `User emotional state: ${handoffContext.emotionalState} - adjust planning energy accordingly`
    );
    briefing.emotionalWeight = Math.max(briefing.emotionalWeight, 0.5);
  }

  // Cognitive context
  if (handoffContext.cognitiveContext) {
    const cogCtx = handoffContext.cognitiveContext;
    if (cogCtx.effectiveApproaches?.length > 0) {
      briefing.previousPersonaInsights.push(
        `What worked: ${cogCtx.effectiveApproaches.join(', ')}`
      );
    }
  }

  return briefing;
}

// ============================================================================
// BUILD COMPREHENSIVE BRIEFING
// ============================================================================

async function buildJordanBriefing(userId: string): Promise<JordanInsightBriefing> {
  // Default fallback values for graceful degradation
  const defaultGoalsOverview: GoalsOverview = {
    activeGoals: 0,
    nearingCompletion: [],
    atRisk: [],
    recentlyAchieved: [],
    totalSavedTowardGoals: 0,
    biggestGoal: null,
    milestoneDates: [],
  };
  const defaultPeterInsights: PeterFinancialInsights = {
    budgetHealth: 'good',
    savingsVelocity: 'unknown',
    monthsToGoalCompletion: null,
    eventBudgetCapacity: 0,
    financialReadiness: [],
  };
  const defaultHabitInsights: HabitInsights = {
    activeHabits: 0,
    keystoneHabits: [],
    currentStreaks: [],
    atRiskHabits: [],
    averageSuccessRate: 0,
    planningRelatedHabits: [],
    momentumScore: 0,
  };
  const defaultMoodInsights: MoodInsights = {
    recentMoodTrend: 'unknown',
    averageEnergy: 5,
    celebrationReadiness: 'moderate',
    lastMood: null,
  };
  const defaultMemoryInsights: MemoryInsights = {
    totalMemories: 0,
    milestoneMentions: [],
    upcomingAnniversaries: [],
    pastCelebrations: [],
    familyContext: [],
    relationshipMilestones: [],
  };

  // Parallel fetch from all data sources with defensive catch handlers
  // 🐛 FIX: Each promise has its own catch to prevent one failure from crashing all
  const [
    goalsOverview,
    peterInsights,
    mayaInsights,
    moodPatterns,
    memoryInsights,
    milestoneCalendarSync,
    alexCoordinationContext,
  ] = await Promise.all([
    analyzeGoalsOverview(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to analyze goals overview');
      return defaultGoalsOverview;
    }),
    getPeterFinancialInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get Peter financial insights');
      return defaultPeterInsights;
    }),
    getMayaHabitInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get Maya habit insights');
      return defaultHabitInsights;
    }),
    getMoodPatterns(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get mood patterns');
      return defaultMoodInsights;
    }),
    getMemoryOrchestratorInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get memory insights');
      return defaultMemoryInsights;
    }),
    // Better Than Human: Milestone calendar sync
    buildMilestoneCalendarContext(userId).catch(() => null),
    // Cross-Persona: Jordan ↔ Alex coordination
    getCoordinationContext(userId, []).catch(() => null),
  ]);

  // Compute planning metrics
  const planningMetrics = computePlanningMetrics(
    goalsOverview,
    peterInsights,
    mayaInsights,
    moodPatterns
  );

  // Analyze contexts
  const lifeStageContext = analyzeLifeStageContext(goalsOverview, memoryInsights);
  const seasonalContext = analyzeSeasonalContext();

  // Generate alerts and opportunities
  const timelineAlerts = generateTimelineAlerts(goalsOverview, peterInsights);
  const celebrationOpportunities = detectCelebrationOpportunities(
    goalsOverview,
    planningMetrics,
    memoryInsights
  );

  // Build partial briefing for proactive discoveries
  const partialBriefing = {
    goalsOverview,
    peterInsights,
    mayaInsights,
    moodPatterns,
    memoryInsights,
    planningMetrics,
    celebrationOpportunities,
    timelineAlerts,
    lifeStageContext,
    seasonalContext,
    milestoneCalendarSync,
    alexCoordinationContext,
  };

  // Generate proactive discoveries
  const proactiveDiscoveries = generateProactiveDiscoveries(partialBriefing);

  return {
    ...partialBriefing,
    proactiveDiscoveries,
  };
}

// ============================================================================
// FORMAT BRIEFING FOR INJECTION
// ============================================================================

function formatJordanBriefing(
  briefing: JordanInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[JORDAN'S MILESTONE BRIEFING - Turn ${turnCount}]`);

  // Handoff context first
  if (handoffBriefing) {
    sections.push('\n=== HANDOFF CONTEXT ===');
    sections.push(`Topic: ${handoffBriefing.topic}`);

    const excitementEmoji =
      handoffBriefing.excitementLevel === 'high'
        ? '🎉'
        : handoffBriefing.excitementLevel === 'low'
          ? '💙'
          : '✨';
    sections.push(`Energy: ${excitementEmoji} ${handoffBriefing.excitementLevel}`);

    if (handoffBriefing.planningContext) {
      sections.push(`Planning context: ${handoffBriefing.planningContext}`);
    }
    if (handoffBriefing.actionItems.length > 0) {
      sections.push(`Team handoff notes: ${handoffBriefing.actionItems.join('; ')}`);
    }
    if (handoffBriefing.previousPersonaInsights.length > 0) {
      briefing.peterInsights.financialReadiness.forEach((insight) => sections.push(`• ${insight}`));
    }
    if (handoffBriefing.emotionalWeight > 0.5) {
      sections.push(
        'NOTE: User may be emotionally charged. Start with validation before diving into planning.'
      );
    }
  }

  // COMPUTED PLANNING METRICS
  const { planningMetrics } = briefing;
  sections.push('\n=== YOUR PLANNING DASHBOARD (Real Data) ===');
  sections.push(`• Planning Velocity Index: ${planningMetrics.planningVelocityIndex}/100`);
  sections.push(`• Celebration Readiness: ${planningMetrics.celebrationReadinessScore}/100`);
  sections.push(`• Life Stage Momentum: ${planningMetrics.lifeStageMomentum}/100`);
  sections.push(`• Event Success Predictor: ${planningMetrics.eventSuccessPredictor}/100`);

  // Cross-domain patterns
  if (planningMetrics.patterns.length > 0) {
    sections.push('\n=== CROSS-DOMAIN PATTERNS DETECTED ===');
    planningMetrics.patterns.forEach((pattern) => sections.push(`• ${pattern}`));
  }

  // Goals dashboard
  const { goalsOverview } = briefing;
  sections.push('\n=== GOALS DASHBOARD ===');
  sections.push(`• Active goals: ${goalsOverview.activeGoals}`);
  sections.push(`• Total saved: $${goalsOverview.totalSavedTowardGoals.toLocaleString()}`);
  if (goalsOverview.biggestGoal) {
    sections.push(
      `• Biggest goal: "${goalsOverview.biggestGoal.name}" (${goalsOverview.biggestGoal.progress}% complete)`
    );
  }
  if (goalsOverview.milestoneDates.length > 0) {
    const upcoming = goalsOverview.milestoneDates
      .slice(0, 3)
      .map((m) => `${m.name} (${m.daysAway}d)`)
      .join(', ');
    sections.push(`• Upcoming: ${upcoming}`);
  }

  // Life stage context
  if (briefing.lifeStageContext.currentStage !== 'active-planning') {
    sections.push('\n=== LIFE STAGE CONTEXT ===');
    sections.push(`🌟 Current stage: ${briefing.lifeStageContext.currentStage}`);
    briefing.lifeStageContext.stageSpecificAdvice
      .slice(0, 2)
      .forEach((advice) => sections.push(`• ${advice}`));
    briefing.lifeStageContext.transitionSignals.forEach((signal) =>
      sections.push(`• 🔄 ${signal}`)
    );
  }

  // FROM PETER (Financial Context)
  if (briefing.peterInsights.financialReadiness.length > 0) {
    sections.push('\n=== FROM PETER (Financial Readiness) ===');
    sections.push(`• Budget health: ${briefing.peterInsights.budgetHealth}`);
    sections.push(`• Savings velocity: ${briefing.peterInsights.savingsVelocity}`);
    if (briefing.peterInsights.monthsToGoalCompletion) {
      sections.push(
        `• Months to goal completion: ~${briefing.peterInsights.monthsToGoalCompletion}`
      );
    }
    briefing.peterInsights.financialReadiness
      .slice(0, 2)
      .forEach((insight) => sections.push(`• ${insight}`));
  }

  // FROM MAYA (Habit Momentum)
  if (briefing.mayaInsights.activeHabits > 0) {
    sections.push('\n=== FROM MAYA (Habit Momentum) ===');
    sections.push(`• Active habits: ${briefing.mayaInsights.activeHabits}`);
    sections.push(`• Success rate: ${Math.round(briefing.mayaInsights.averageSuccessRate * 100)}%`);
    sections.push(`• Momentum score: ${briefing.mayaInsights.momentumScore}/100`);
    if (briefing.mayaInsights.keystoneHabits.length > 0) {
      sections.push(`• 🌟 Keystone habits: ${briefing.mayaInsights.keystoneHabits.join(', ')}`);
    }
    if (briefing.mayaInsights.planningRelatedHabits.length > 0) {
      sections.push(
        `• 📋 Planning habits: ${briefing.mayaInsights.planningRelatedHabits.join(', ')}`
      );
    }
    if (briefing.mayaInsights.currentStreaks.length > 0) {
      const streakStr = briefing.mayaInsights.currentStreaks
        .slice(0, 3)
        .map((s) => `${s.name} (${s.streak}d)`)
        .join(', ');
      sections.push(`• 🔥 Active streaks: ${streakStr}`);
    }
  }

  // MOOD/ENERGY
  if (briefing.moodPatterns.lastMood || briefing.moodPatterns.recentMoodTrend !== 'unknown') {
    sections.push('\n=== MOOD/ENERGY INTELLIGENCE ===');
    if (briefing.moodPatterns.lastMood) {
      sections.push(
        `• Last logged: Mood ${briefing.moodPatterns.lastMood.mood}, Energy ${briefing.moodPatterns.lastMood.energy}`
      );
    }
    sections.push(`• Mood trend (2 weeks): ${briefing.moodPatterns.recentMoodTrend}`);
    sections.push(`• Celebration readiness: ${briefing.moodPatterns.celebrationReadiness}`);
  }

  // MEMORY INSIGHTS
  if (briefing.memoryInsights.totalMemories > 10) {
    sections.push('\n=== FROM FERNI (Memory Context) ===');
    sections.push(`• Relationship depth: ${briefing.memoryInsights.totalMemories} memories`);
    if (briefing.memoryInsights.milestoneMentions.length > 0) {
      sections.push(
        `• Past milestone discussions: ${briefing.memoryInsights.milestoneMentions.slice(0, 2).join(', ')}`
      );
    }
    if (briefing.memoryInsights.familyContext.length > 0) {
      sections.push(
        `• Family context available: ${briefing.memoryInsights.familyContext.slice(0, 2).join(', ')}`
      );
    }
  }

  // Celebration opportunities
  if (briefing.celebrationOpportunities.length > 0) {
    sections.push('\n=== 🎊 CELEBRATION OPPORTUNITIES ===');
    briefing.celebrationOpportunities.slice(0, 4).forEach((opp) => sections.push(`• ${opp}`));
    sections.push('Remember: Every milestone deserves recognition!');
  }

  // Timeline alerts
  if (briefing.timelineAlerts.length > 0) {
    sections.push('\n=== ⏰ TIMELINE ALERTS ===');
    briefing.timelineAlerts.forEach((alert) => sections.push(`• ${alert}`));
  }

  // Seasonal context
  if (briefing.seasonalContext.currentSeason) {
    sections.push('\n=== 📅 SEASONAL AWARENESS ===');
    sections.push(`• Season: ${briefing.seasonalContext.currentSeason}`);
    briefing.seasonalContext.seasonalOpportunities
      .slice(0, 2)
      .forEach((opp) => sections.push(`• ${opp}`));
    if (briefing.seasonalContext.upcomingDates.length > 0) {
      const upcoming = briefing.seasonalContext.upcomingDates
        .slice(0, 2)
        .map((d) => `${d.name} in ${d.daysAway}d`)
        .join(', ');
      sections.push(`• Coming up: ${upcoming}`);
    }
  }

  // Better Than Human: Milestone Calendar Sync (from Alex's calendar data)
  if (briefing.milestoneCalendarSync) {
    sections.push('\n=== 📅 FROM ALEX (Milestone Calendar Sync) ===');
    sections.push(briefing.milestoneCalendarSync);
  }

  // Cross-Persona: Jordan ↔ Alex Coordination Context
  if (briefing.alexCoordinationContext) {
    sections.push('\n=== 🤝 JORDAN ↔ ALEX COORDINATION ===');
    sections.push(briefing.alexCoordinationContext);
  }

  // Proactive discoveries (top priority)
  if (briefing.proactiveDiscoveries.length > 0) {
    sections.push('\n=== 🎯 PROACTIVE OPPORTUNITIES ===');
    briefing.proactiveDiscoveries
      .slice(0, 5)
      .forEach((discovery) => sections.push(`• ${discovery}`));
  }

  // Jordan's planning frameworks (on first turns)
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR PLANNING SUPERPOWER ===');
    sections.push('• You see their whole arc - past, present, and possibility');
    sections.push('• Hard chapters deserve presence, not positivity');
    sections.push("• Celebrations don't have to be big to be meaningful");
    sections.push('• Life transitions are both endings AND beginnings');
    sections.push('• Quiet growth is still growth - maintenance IS a milestone');
  }

  sections.push(
    '\n[Remember: Every chapter of their story matters. See the arc. Celebrate the journey. Match their energy but honor ALL emotions.]'
  );

  return sections;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildJordanMilestoneInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData } = input;

  // Only for Jordan
  const currentPersona = (services as { personaId?: string })?.personaId || '';
  const isJordan = [
    'jordan',
    'jordan-taylor',
    'event-planner',
    'life-planner',
    'lifetime-planner',
  ].includes(currentPersona.toLowerCase());

  if (!isJordan) return injections;

  const userId = services?.userId || 'anonymous';
  if (userId === 'anonymous') return injections;

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  const handoffBriefing = analyzeHandoffForJordan();
  const isHandoff = handoffBriefing !== null;

  // Inject on first turn, handoff, or every 10 turns
  const shouldInject =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const briefing = await buildJordanBriefing(userId);
    const briefingLines = formatJordanBriefing(briefing, handoffBriefing, turnCount);

    // Get superhuman context (dreams, milestones, narrative, seasonal)
    // V3 Semantic Intelligence needs current conversation context
    const personMatch = input.userText?.match(
      /\b(my (?:mom|dad|wife|husband|partner|sister|brother|friend|boss|coworker)|(?:mom|dad|wife|husband)\b)/i
    );
    const superhumanContext = await getSuperhuman(userId, 'jordan', {
      currentTranscript: input.userText,
      currentTopics: input.analysis?.topics?.detected,
      currentEmotion: input.analysis?.emotion?.primary,
      currentMentionedPerson: personMatch?.[1],
    });
    if (superhumanContext) {
      briefingLines.push(`\n${superhumanContext}`);
    }

    // 🤝 TEAM HUDDLE: Record Jordan's observations for cross-persona intelligence
    try {
      const { jordan: jordanObserver, recordConcern } = await import(
        '../../../services/cross-persona/observation-recorder.js'
      );

      // Record milestone patterns
      if (briefing.goalsOverview.activeGoals > 0) {
        jordanObserver.pattern(
          userId,
          `${briefing.goalsOverview.activeGoals} active goals being tracked`,
          0.8,
          ['goals', 'milestones', 'planning']
        );
      }

      // Record celebration readiness
      if (briefing.planningMetrics.celebrationReadinessScore > 0.7) {
        jordanObserver.milestone(
          userId,
          'High celebration readiness - wins to acknowledge!',
          briefing.planningMetrics.celebrationReadinessScore,
          ['celebration', 'progress', 'achievement']
        );
      }

      // Record at-risk goals as concerns (use generic recordConcern since Jordan focuses on positives)
      if (briefing.goalsOverview.atRisk.length > 0) {
        recordConcern(
          userId,
          'jordan',
          `${briefing.goalsOverview.atRisk.length} goal(s) at risk: ${briefing.goalsOverview.atRisk.slice(0, 2).join(', ')}`,
          0.7,
          ['goals', 'at-risk', 'motivation']
        );
      }

      // Record planning velocity patterns as a pattern, not concern (Jordan stays positive)
      if (briefing.planningMetrics.planningVelocityIndex < 0.3) {
        jordanObserver.pattern(
          userId,
          'Low planning velocity - opportunity for planning support',
          0.65,
          ['planning', 'momentum', 'support']
        );
      }

      // Record recently achieved goals as milestones
      if (briefing.goalsOverview.recentlyAchieved.length > 0) {
        jordanObserver.milestone(
          userId,
          `Recently achieved: ${briefing.goalsOverview.recentlyAchieved.join(', ')}`,
          0.9,
          ['achievement', 'celebration', 'goals']
        );
      }
    } catch (err) {
      // Non-critical - don't block if observation recording fails
      log.debug({ error: String(err) }, 'Failed to record Jordan observations (non-blocking)');
    }

    const content = briefingLines.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('jordan_handoff_briefing', content, {
          category: 'persona-planning',
          confidence: 0.9,
        })
      );
      log.info(
        {
          userId,
          handoffTopic: handoffBriefing?.topic,
          planningVelocity: briefing.planningMetrics.planningVelocityIndex,
        },
        '🌟 Jordan loaded with handoff milestone briefing'
      );
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('jordan_initial_briefing', content, {
          category: 'persona-planning',
          confidence: 0.8,
        })
      );
      log.info(
        {
          userId,
          goals: briefing.goalsOverview.activeGoals,
          celebrationReadiness: briefing.planningMetrics.celebrationReadinessScore,
        },
        '🌟 Jordan loaded with milestone briefing'
      );
    } else {
      injections.push(
        createHintInjection('jordan_refresh_briefing', content, {
          category: 'persona-planning',
        })
      );
    }

    session.briefingTurn = turnCount;

    // Jordan's mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'jordan_mindset',
          "[JORDAN'S HEART: You see their whole life arc - every chapter matters. " +
            'Match their energy but honor ALL emotions. Hard chapters deserve presence, not positivity. ' +
            "Celebrate progress everywhere. Second chances are milestones too! You're genuinely excited - let it show!]",
          { category: 'persona-identity' }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Jordan milestone briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'jordan-milestone-insights',
  description:
    'Loads Jordan with deep milestone insights - goals, celebrations, cross-team context, life stage awareness, and proactive planning opportunities',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildJordanMilestoneInsightsContext,
});

export { buildJordanMilestoneInsightsContext };
