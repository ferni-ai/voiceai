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

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../../index.js';
import { getSuperhuman } from '../../superhuman/superhuman-integration.js';
// Better Than Human: Milestone Calendar Sync
import { buildMilestoneCalendarContext } from '../../../../services/milestones/milestone-calendar-sync.js';
// Cross-Domain: Milestone ↔ Calendar Coordination
import { getCoordinationContext } from '../../../../services/superhuman/milestone-calendar-coordinator.js';

// Import submodules
import {
  getSession,
  clearJordanMilestoneSession,
  clearAllJordanMilestoneSessions,
} from './session.js';
import {
  analyzeGoalsOverview,
  getPeterFinancialInsights,
  getMayaHabitInsights,
  getMoodPatterns,
  getMemoryOrchestratorInsights,
} from './data-fetchers.js';
import {
  computePlanningMetrics,
  analyzeLifeStageContext,
  analyzeSeasonalContext,
} from './metrics.js';
import {
  detectCelebrationOpportunities,
  generateProactiveDiscoveries,
  generateTimelineAlerts,
} from './opportunities.js';
import { analyzeHandoffForJordan } from './handoff-analysis.js';
import { formatJordanBriefing } from './formatting.js';

import type { JordanInsightBriefing } from './types.js';
import {
  DEFAULT_GOALS_OVERVIEW,
  DEFAULT_PETER_INSIGHTS,
  DEFAULT_HABIT_INSIGHTS,
  DEFAULT_MOOD_INSIGHTS,
  DEFAULT_MEMORY_INSIGHTS,
} from './types.js';

const log = createLogger({ module: 'context:jordan-milestone-insights' });

// Re-export types
export type * from './types.js';
export { clearJordanMilestoneSession, clearAllJordanMilestoneSessions };

// ============================================================================
// BUILD BRIEFING
// ============================================================================

async function buildJordanBriefing(userId: string): Promise<JordanInsightBriefing> {
  // Parallel fetch from all data sources with defensive catch handlers
  // Each promise has its own catch to prevent one failure from crashing all
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
      return DEFAULT_GOALS_OVERVIEW;
    }),
    getPeterFinancialInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get Peter financial insights');
      return DEFAULT_PETER_INSIGHTS;
    }),
    getMayaHabitInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get Maya habit insights');
      return DEFAULT_HABIT_INSIGHTS;
    }),
    getMoodPatterns(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get mood patterns');
      return DEFAULT_MOOD_INSIGHTS;
    }),
    getMemoryOrchestratorInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to get memory insights');
      return DEFAULT_MEMORY_INSIGHTS;
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
    'jordan-chen',
    'event-planner',
    'milestone',
    'celebration',
    'life-planner',
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

    // Get superhuman context (commitments, relationships, patterns)
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
      briefingLines.push('\n' + superhumanContext);
    }

    // 🤝 TEAM HUDDLE: Record Jordan's observations for cross-persona intelligence
    try {
      const { jordan: jordanObserver, recordConcern } =
        await import('../../../../services/cross-persona/observation-recorder.js');

      // Record celebration readiness for the team
      if (briefing.planningMetrics.celebrationReadinessScore >= 70) {
        jordanObserver.opportunity(
          userId,
          `Celebration readiness at ${briefing.planningMetrics.celebrationReadinessScore}% - ready for milestone planning!`,
          briefing.planningMetrics.celebrationReadinessScore / 100,
          'celebrate milestone',
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
      if (briefing.planningMetrics.planningVelocityIndex < 30) {
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
