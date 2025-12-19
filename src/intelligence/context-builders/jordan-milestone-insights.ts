/**
 * Jordan's Milestone Insights Context Builder
 *
 * > "I can SEE this coming together!"
 *
 * This builder loads Jordan with cross-team insights when:
 * 1. A user transfers TO Jordan from another persona
 * 2. A user starts talking directly with Jordan
 *
 * INSIGHT SOURCES (Cross-Team Integration):
 *
 * FROM PETER (Pattern Analysis):
 * - Financial readiness for milestones
 * - Behavioral patterns affecting goals
 * - Decision timing insights
 *
 * FROM MAYA (Habits):
 * - Habit momentum for goal support
 * - Keystone habits driving progress
 * - Habit struggles affecting timelines
 *
 * FROM NAYAN (Wisdom):
 * - Life stage context
 * - Long-term perspective
 * - Values alignment
 *
 * @module intelligence/context-builders/jordan-milestone-insights
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

const log = createLogger({ module: 'context:jordan-milestone-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface JordanInsightBriefing {
  /** Active goals overview */
  goalsOverview: GoalsOverview;
  /** Financial insights from Peter */
  peterInsights: string[];
  /** Habit momentum from Maya */
  mayaInsights: string[];
  /** Upcoming celebrations */
  celebrationOpportunities: string[];
  /** Timeline alerts */
  timelineAlerts: string[];
  /** Life stage context */
  lifeStageHints: string[];
}

interface GoalsOverview {
  activeGoals: number;
  nearingCompletion: string[];
  atRisk: string[];
  recentlyAchieved: string[];
  totalSavedTowardGoals: number;
  biggestGoal: { name: string; progress: number } | null;
}

interface HandoffBriefing {
  topic: string;
  planningContext: string | null;
  excitementLevel: 'low' | 'medium' | 'high';
  actionItems: string[];
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface JordanSession {
  briefingTurn: number;
  celebratedMilestones: Set<string>;
}

const sessions = new Map<string, JordanSession>();

function getSession(sessionId: string): JordanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, celebratedMilestones: new Set() };
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

function analyzeGoalsOverview(userId: string): GoalsOverview {
  const overview: GoalsOverview = {
    activeGoals: 0,
    nearingCompletion: [],
    atRisk: [],
    recentlyAchieved: [],
    totalSavedTowardGoals: 0,
    biggestGoal: null,
  };

  try {
    const store = getFinancialStore();
    const goals = store.getActiveSavingsGoals(userId);

    overview.activeGoals = goals.length;

    for (const goal of goals) {
      const progress = goal.currentAmount / goal.targetAmount;
      overview.totalSavedTowardGoals += goal.currentAmount;

      // Nearing completion (80%+)
      if (progress >= 0.8 && progress < 1) {
        overview.nearingCompletion.push(`${goal.name} (${Math.round(progress * 100)}%)`);
      }

      // Completed recently (would need date tracking)
      if (progress >= 1) {
        overview.recentlyAchieved.push(goal.name);
      }

      // At risk (has deadline, behind schedule)
      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const totalDays = Math.ceil(
          (deadline.getTime() - new Date(goal.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysElapsed = Math.ceil(
          (now.getTime() - new Date(goal.createdAt || now).getTime()) / (1000 * 60 * 60 * 24)
        );
        const expectedProgress = daysElapsed / totalDays;

        if (progress < expectedProgress * 0.7) {
          overview.atRisk.push(goal.name);
        }
      }

      // Track biggest goal
      if (!overview.biggestGoal || goal.targetAmount > overview.biggestGoal.progress) {
        overview.biggestGoal = {
          name: goal.name,
          progress: Math.round(progress * 100),
        };
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze goals overview');
  }

  return overview;
}

// ============================================================================
// CROSS-TEAM INSIGHTS
// ============================================================================

async function getPeterFinancialInsights(userId: string): Promise<string[]> {
  const insights: string[] = [];

  try {
    const store = getFinancialStore();
    await store.loadUserData(userId);

    // Check savings velocity
    const goals = store.getActiveSavingsGoals(userId);
    const budget = store.getMainBudget(userId);

    if (budget) {
      const savingsCapacity = budget.monthlyLimit - budget.spent;
      if (savingsCapacity > 0 && goals.length > 0) {
        const totalNeeded = goals.reduce((sum, g) => sum + (g.targetAmount - g.currentAmount), 0);
        const monthsToComplete = totalNeeded / savingsCapacity;
        if (monthsToComplete < 12) {
          insights.push(
            `Peter calculates: At current pace, ALL goals achievable in ~${Math.ceil(monthsToComplete)} months! 🎉`
          );
        }
      }

      // Budget health for planning
      const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
      if (percentUsed < 60) {
        insights.push(
          'Peter notes: Budget healthy (under 60% used) - good runway for new milestone planning'
        );
      } else if (percentUsed > 90) {
        insights.push(
          'Peter flags: Budget tight this month - timeline planning should account for this'
        );
      }
    }

    // Check investment context
    const triggers = store.getRecentSpendingTriggers(userId, 30);
    const celebrationSpending = triggers.filter(
      (t) => t.emotion === 'celebratory' || t.emotion === 'happy'
    );
    if (celebrationSpending.length >= 2) {
      insights.push(
        `Peter noticed ${celebrationSpending.length} celebration purchases recently - someone's hitting milestones! 🎊`
      );
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Peter insights for Jordan');
  }

  return insights;
}

function getMayaHabitInsights(userId: string): string[] {
  const insights: string[] = [];

  try {
    const store = getProductivityStore();
    const userData = store.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    if (activeHabits.length === 0) {
      insights.push(
        'Maya reports: No active habits - milestone support might need habit scaffolding'
      );
      return insights;
    }

    // Check keystone habits
    const keystones = activeHabits.filter((h) => h.isKeystone);
    if (keystones.length > 0 && keystones.some((k) => k.currentStreak >= 7)) {
      insights.push(
        `Maya's proud: Keystone habit "${keystones[0].name}" driving momentum! Great foundation for big goals.`
      );
    }

    // Check overall momentum
    const totalStreakDays = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0);
    if (totalStreakDays >= 30) {
      insights.push(
        `Maya confirms: ${totalStreakDays} total streak days across habits - strong momentum for milestone push!`
      );
    }

    // Check savings-related habits
    const savingsHabits = activeHabits.filter(
      (h) =>
        h.name.toLowerCase().includes('save') ||
        h.name.toLowerCase().includes('budget') ||
        h.name.toLowerCase().includes('money')
    );
    if (savingsHabits.length > 0) {
      const savingsStreak = savingsHabits[0].currentStreak;
      if (savingsStreak >= 7) {
        insights.push(
          `Maya tracking: "${savingsHabits[0].name}" at ${savingsStreak} days - habit is feeding the goals!`
        );
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Maya insights for Jordan');
  }

  return insights;
}

// ============================================================================
// CELEBRATION OPPORTUNITY DETECTION
// ============================================================================

function detectCelebrationOpportunities(goalsOverview: GoalsOverview): string[] {
  const opportunities: string[] = [];

  // Near completion celebrations
  for (const goal of goalsOverview.nearingCompletion) {
    opportunities.push(`🎯 ${goal} - SO CLOSE! Finish line energy!`);
  }

  // Recently achieved
  for (const goal of goalsOverview.recentlyAchieved) {
    opportunities.push(`🏆 ${goal} ACHIEVED! This needs a celebration moment!`);
  }

  // Savings milestone
  if (goalsOverview.totalSavedTowardGoals >= 1000) {
    const formatted = goalsOverview.totalSavedTowardGoals.toLocaleString();
    opportunities.push(`💰 $${formatted} total saved toward goals - that's REAL progress!`);
  }

  // Multiple active goals
  if (goalsOverview.activeGoals >= 3) {
    opportunities.push(
      `📋 ${goalsOverview.activeGoals} active goals - this person is building their life portfolio!`
    );
  }

  return opportunities;
}

// ============================================================================
// TIMELINE ALERTS
// ============================================================================

function generateTimelineAlerts(goalsOverview: GoalsOverview): string[] {
  const alerts: string[] = [];

  // At-risk goals
  for (const goal of goalsOverview.atRisk) {
    alerts.push(`⚠️ "${goal}" is behind schedule - might need timeline adjustment`);
  }

  // No current goals
  if (goalsOverview.activeGoals === 0) {
    alerts.push("📝 No active goals yet - what's the next chapter they're dreaming about?");
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
    }
  }

  return briefing;
}

// ============================================================================
// BUILD BRIEFING
// ============================================================================

async function buildJordanBriefing(userId: string): Promise<JordanInsightBriefing> {
  const [goalsOverview, peterInsights, mayaInsights] = await Promise.all([
    Promise.resolve(analyzeGoalsOverview(userId)),
    getPeterFinancialInsights(userId),
    Promise.resolve(getMayaHabitInsights(userId)),
  ]);

  const celebrationOpportunities = detectCelebrationOpportunities(goalsOverview);
  const timelineAlerts = generateTimelineAlerts(goalsOverview);

  // Life stage hints based on goals
  const lifeStageHints: string[] = [];
  if (goalsOverview.biggestGoal) {
    const name = goalsOverview.biggestGoal.name.toLowerCase();
    if (name.includes('house') || name.includes('home')) {
      lifeStageHints.push('Life stage: Home-buying chapter - exciting transition ahead!');
    } else if (name.includes('wedding')) {
      lifeStageHints.push('Life stage: Wedding planning - SO much to celebrate!');
    } else if (name.includes('baby') || name.includes('nursery')) {
      lifeStageHints.push('Life stage: Growing family - new chapter beginning!');
    } else if (name.includes('retire')) {
      lifeStageHints.push('Life stage: Retirement planning - freedom chapter approaching!');
    }
  }

  return {
    goalsOverview,
    peterInsights,
    mayaInsights,
    celebrationOpportunities,
    timelineAlerts,
    lifeStageHints,
  };
}

// ============================================================================
// FORMAT BRIEFING
// ============================================================================

function formatJordanBriefing(
  briefing: JordanInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[JORDAN'S MILESTONE BRIEFING - Turn ${turnCount}]`);

  // Handoff context
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
  }

  // Life stage hints
  if (briefing.lifeStageHints.length > 0) {
    sections.push('\n=== LIFE STAGE CONTEXT ===');
    briefing.lifeStageHints.forEach((hint) => sections.push(`🌟 ${hint}`));
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

  // Celebration opportunities
  if (briefing.celebrationOpportunities.length > 0) {
    sections.push('\n=== 🎊 CELEBRATION OPPORTUNITIES ===');
    briefing.celebrationOpportunities.forEach((opp) => sections.push(`• ${opp}`));
    sections.push('Remember: Every milestone deserves recognition!');
  }

  // Timeline alerts
  if (briefing.timelineAlerts.length > 0) {
    sections.push('\n=== ⏰ TIMELINE ALERTS ===');
    briefing.timelineAlerts.forEach((alert) => sections.push(`• ${alert}`));
  }

  // Cross-team insights
  if (briefing.peterInsights.length > 0) {
    sections.push('\n=== FROM PETER (Financial Context) ===');
    briefing.peterInsights.forEach((insight) => sections.push(`• ${insight}`));
  }

  if (briefing.mayaInsights.length > 0) {
    sections.push('\n=== FROM MAYA (Habit Momentum) ===');
    briefing.mayaInsights.forEach((insight) => sections.push(`• ${insight}`));
  }

  // Jordan's planning reminders
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR PLANNING SUPERPOWER ===');
    sections.push('• You see their whole arc - past, present, and possibility');
    sections.push('• Hard chapters deserve presence, not positivity');
    sections.push("• Celebrations don't have to be big to be meaningful");
    sections.push('• Life transitions are both endings AND beginnings');
  }

  sections.push(
    '\n[Remember: Every chapter of their story matters. See the arc. Celebrate the journey.]'
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
    const content = briefingLines.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('jordan_handoff_briefing', content, {
          category: 'persona-planning',
          confidence: 0.9,
        })
      );
      log.info({ userId }, '🌟 Jordan loaded with handoff briefing');
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('jordan_initial_briefing', content, {
          category: 'persona-planning',
          confidence: 0.8,
        })
      );
      log.info(
        { userId, goals: briefing.goalsOverview.activeGoals },
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
            "Celebrate progress everywhere. You're genuinely excited - let it show!]",
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
  description: 'Loads Jordan with milestone insights - goals, celebrations, and cross-team context',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildJordanMilestoneInsightsContext,
});

export { buildJordanMilestoneInsightsContext };
