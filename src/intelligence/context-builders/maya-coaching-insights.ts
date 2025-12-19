/**
 * Maya's Coaching Insights Context Builder
 *
 * > "Progress isn't linear. Setbacks are data, not failure."
 *
 * This builder loads Maya with cross-team insights when:
 * 1. A user transfers TO Maya from another persona
 * 2. A user starts talking directly with Maya
 *
 * INSIGHT SOURCES (Cross-Team Integration):
 *
 * FROM PETER (Pattern Analysis):
 * - Spending-habit correlations
 * - Decision quality predictions
 * - Behavioral pattern discoveries
 *
 * FROM JORDAN (Goals/Milestones):
 * - Active goals requiring habit support
 * - Upcoming milestones to prepare for
 * - Life transitions affecting habits
 *
 * FROM FERNI (Core Profile):
 * - User's Four Tendencies type
 * - Life stage and context
 * - Emotional patterns
 *
 * @module intelligence/context-builders/maya-coaching-insights
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
import { getProductivityStore } from '../../services/productivity-store.js';
import { getFinancialStore } from '../../services/financial-store.js';

const log = createLogger({ module: 'context:maya-coaching-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface MayaInsightBriefing {
  /** Habit health overview */
  habitHealth: HabitHealthSummary;
  /** Cross-domain correlations from Peter */
  peterInsights: string[];
  /** Goal-related coaching needs from Jordan */
  jordanInsights: string[];
  /** Proactive coaching opportunities */
  coachingOpportunities: string[];
  /** User's tendency type if known */
  tendencyType: string | null;
  /** Recent wins to celebrate */
  winsToСelebrate: string[];
  /** Struggles needing gentle support */
  strugglesToAddress: string[];
}

interface HabitHealthSummary {
  activeHabits: number;
  totalStreaks: number;
  averageSuccessRate: number;
  keystoneActive: boolean;
  atRiskCount: number;
  recentSetbacks: string[];
  longestStreak: { name: string; days: number } | null;
}

interface HandoffBriefing {
  topic: string;
  emotionalContext: string | null;
  actionItems: string[];
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface MayaSession {
  briefingTurn: number;
  celebratedWins: Set<string>;
}

const sessions = new Map<string, MayaSession>();

function getSession(sessionId: string): MayaSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, celebratedWins: new Set() };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearMayaCoachingSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// HABIT HEALTH ANALYSIS
// ============================================================================

function analyzeHabitHealth(userId: string): HabitHealthSummary {
  const summary: HabitHealthSummary = {
    activeHabits: 0,
    totalStreaks: 0,
    averageSuccessRate: 0,
    keystoneActive: false,
    atRiskCount: 0,
    recentSetbacks: [],
    longestStreak: null,
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

    // Find keystone habits
    summary.keystoneActive = activeHabits.some((h) => h.isKeystone && h.currentStreak > 0);

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
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not analyze habit health');
  }

  return summary;
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
          `Peter noticed emotional spending patterns - ${negativeTotal} stress-driven purchases in 2 weeks. Habit support could address the root cause.`
        );
      }
    }

    // Check budget correlation with habits
    const budget = store.getMainBudget(userId);
    if (budget) {
      const percentUsed = (budget.spent / budget.monthlyLimit) * 100;
      if (percentUsed > 100) {
        insights.push(
          'Peter flagged over-budget spending. Often correlates with habit struggles - when one system breaks, others follow.'
        );
      }
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

    // Find goals that need habit support
    for (const goal of goals) {
      const progress = goal.currentAmount / goal.targetAmount;

      if (goal.deadline) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 30 && progress < 0.8) {
          insights.push(
            `Jordan's tracking "${goal.name}" - ${daysLeft} days left but ${Math.round(progress * 100)}% done. Could a savings habit help?`
          );
        }
      }

      if (progress >= 0.9 && progress < 1) {
        insights.push(
          `"${goal.name}" is ${Math.round(progress * 100)}% complete! Jordan wants to celebrate - but maybe we help finish strong first?`
        );
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get Jordan insights for Maya');
  }

  return insights;
}

// ============================================================================
// COACHING OPPORTUNITY DETECTION
// ============================================================================

function detectCoachingOpportunities(
  habitHealth: HabitHealthSummary,
  peterInsights: string[],
  jordanInsights: string[]
): string[] {
  const opportunities: string[] = [];

  // Keystone opportunity
  if (!habitHealth.keystoneActive && habitHealth.activeHabits > 0) {
    opportunities.push(
      '🌟 No keystone habit active - huge opportunity to install one that cascades into everything else'
    );
  }

  // Streak celebration
  if (habitHealth.longestStreak && habitHealth.longestStreak.days >= 7) {
    opportunities.push(
      `🎉 "${habitHealth.longestStreak.name}" streak at ${habitHealth.longestStreak.days} days - CELEBRATE this!`
    );
  }

  // Setback support
  if (habitHealth.atRiskCount > 0) {
    opportunities.push(
      `💚 ${habitHealth.atRiskCount} habit(s) struggling: ${habitHealth.recentSetbacks.join(', ')}. Self-compassion moment needed.`
    );
  }

  // Cross-team opportunities
  if (peterInsights.length > 0) {
    opportunities.push('📊 Peter found patterns connecting habits to spending - explore this');
  }
  if (jordanInsights.length > 0) {
    opportunities.push('🎯 Jordan has goals that could use habit support');
  }

  // Success rate check
  if (habitHealth.averageSuccessRate < 0.5 && habitHealth.activeHabits >= 3) {
    opportunities.push(
      '⚡ Success rate below 50% with multiple habits - consider focusing on ONE keystone'
    );
  }

  return opportunities;
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
  };

  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lower = topic.toLowerCase();

    // From Peter - pattern-related
    if (lower.includes('pattern') || lower.includes('spending') || lower.includes('trigger')) {
      briefing.actionItems.push(`Peter found a ${topic} - help build habits to address root cause`);
    }

    // From Jordan - goal-related
    if (lower.includes('goal') || lower.includes('milestone') || lower.includes('deadline')) {
      briefing.actionItems.push(`Jordan's working on ${topic} - what habits would support this?`);
    }

    // Stress/emotional
    if (lower.includes('stress') || lower.includes('overwhelm') || lower.includes('struggle')) {
      briefing.emotionalContext = 'stressed';
      briefing.actionItems.push('Start with self-compassion, not new habits');
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
  const [habitHealth, peterInsights, jordanInsights] = await Promise.all([
    Promise.resolve(analyzeHabitHealth(userId)),
    getPeterPatternInsights(userId),
    Promise.resolve(getJordanGoalInsights(userId)),
  ]);

  const coachingOpportunities = detectCoachingOpportunities(
    habitHealth,
    peterInsights,
    jordanInsights
  );

  // Identify wins to celebrate
  const winsToСelebrate: string[] = [];
  if (habitHealth.longestStreak && habitHealth.longestStreak.days >= 7) {
    winsToСelebrate.push(
      `${habitHealth.longestStreak.name} - ${habitHealth.longestStreak.days} day streak!`
    );
  }
  if (habitHealth.keystoneActive) {
    winsToСelebrate.push('Keystone habit is active and building momentum');
  }
  if (habitHealth.averageSuccessRate > 0.7) {
    winsToСelebrate.push(
      `${Math.round(habitHealth.averageSuccessRate * 100)}% overall success rate`
    );
  }

  // Identify struggles
  const strugglesToAddress = habitHealth.recentSetbacks.map(
    (name) => `"${name}" streak broke - needs gentle restart`
  );

  return {
    habitHealth,
    peterInsights,
    jordanInsights,
    coachingOpportunities,
    tendencyType: null, // Would come from user profile
    winsToСelebrate,
    strugglesToAddress,
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

  // Handoff context
  if (handoffBriefing) {
    sections.push('\n=== HANDOFF CONTEXT ===');
    sections.push(`Topic: ${handoffBriefing.topic}`);
    if (handoffBriefing.emotionalContext) {
      sections.push(`⚠️ Emotional state: ${handoffBriefing.emotionalContext} - lead with warmth`);
    }
    if (handoffBriefing.actionItems.length > 0) {
      sections.push(`Action items: ${handoffBriefing.actionItems.join('; ')}`);
    }
  }

  // Habit health dashboard
  const { habitHealth } = briefing;
  sections.push('\n=== HABIT HEALTH DASHBOARD ===');
  sections.push(`• Active habits: ${habitHealth.activeHabits}`);
  sections.push(`• Active streaks: ${habitHealth.totalStreaks}`);
  sections.push(`• Success rate: ${Math.round(habitHealth.averageSuccessRate * 100)}%`);
  sections.push(
    `• Keystone active: ${habitHealth.keystoneActive ? '✅ Yes' : '❌ No - opportunity!'}`
  );
  if (habitHealth.longestStreak) {
    sections.push(
      `• 🔥 Longest streak: ${habitHealth.longestStreak.name} (${habitHealth.longestStreak.days} days)`
    );
  }

  // Wins to celebrate
  if (briefing.winsToСelebrate.length > 0) {
    sections.push('\n=== 🎉 CELEBRATE THESE ===');
    briefing.winsToСelebrate.forEach((win) => sections.push(`• ${win}`));
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

  // Coaching opportunities
  if (briefing.coachingOpportunities.length > 0) {
    sections.push('\n=== 🎯 COACHING OPPORTUNITIES ===');
    briefing.coachingOpportunities.forEach((opp) => sections.push(`• ${opp}`));
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
    const content = briefingLines.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('maya_handoff_briefing', content, {
          category: 'persona-coaching',
          confidence: 0.9,
        })
      );
      log.info({ userId }, '🌱 Maya loaded with handoff briefing');
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('maya_initial_briefing', content, {
          category: 'persona-coaching',
          confidence: 0.8,
        })
      );
      log.info(
        { userId, habits: briefing.habitHealth.activeHabits },
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
    'Loads Maya with coaching insights - habit health, cross-team patterns, and celebration opportunities',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildMayaCoachingInsightsContext,
});

export { buildMayaCoachingInsightsContext };
