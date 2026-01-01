/**
 * Peter's Research Insights Context Builder
 *
 * > "The skill was never about stocks. It was about seeing patterns nobody else sees."
 *
 * This builder loads Peter with deep research insights when:
 * 1. A user transfers TO Peter from another persona
 * 2. A user starts talking directly with Peter
 *
 * @module intelligence/context-builders/personas/peter-research-insights
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

import { getSession, clearPeterResearchSession } from './session.js';
import {
  analyzeSpendingPatterns,
  getMayaHabitInsights,
  getMoodPatterns,
  getMemoryOrchestratorInsights,
  analyzeGoalTrajectory,
  buildCalendarResearchContext,
} from './data-fetchers.js';
import {
  computeBehavioralMetrics,
  analyzePersonalLifePatterns,
  generateCrossDomainPatterns,
  generateCoachingInsights,
  generateDeepFinancialInsights,
} from './metrics.js';
import { detectProactiveCoachingInsights } from './opportunities.js';
import { analyzeHandoffContext } from './handoff-analysis.js';
import { formatBriefingForInjection } from './formatting.js';
import type { UserInsightBriefing, HabitInsights, MoodInsights, MemoryInsights } from './types.js';

const log = createLogger({ module: 'context:peter-research-insights' });

// Re-export session functions for external use
export { clearPeterResearchSession };

// ============================================================================
// BUILD COMPREHENSIVE BRIEFING
// ============================================================================

async function buildInsightBriefing(
  userId: string,
  _isHandoff: boolean
): Promise<UserInsightBriefing> {
  // Default fallback values for graceful degradation
  const defaultHabitInsights: HabitInsights = {
    activeHabits: 0,
    keystoneHabits: [],
    currentStreaks: [],
    atRiskHabits: [],
    totalCompletions: 0,
    averageSuccessRate: 0,
    habitStacks: [],
    weeklyReflectionSummary: null,
  };
  const defaultMoodInsights: MoodInsights = {
    recentMoodTrend: 'unknown',
    averageEnergy: 0,
    moodCorrelations: [],
    lastMood: null,
  };
  const defaultMemoryInsights: MemoryInsights = {
    behavioralPatterns: [],
    emotionalThreads: [],
    communicationStyle: null,
    memoryHealth: null,
  };

  // Parallel fetch from all data sources + calendar context
  // 🐛 FIX: Each promise has its own catch to prevent one failure from crashing all
  const [
    spendingInsights,
    goalInsights,
    mayaInsights,
    moodPatterns,
    memoryInsights,
    calendarContext,
  ] = await Promise.all([
    analyzeSpendingPatterns(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to analyze spending patterns');
      return [] as string[];
    }),
    analyzeGoalTrajectory(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to analyze goal trajectory');
      return [] as string[];
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
    buildCalendarResearchContext(userId).catch(() => null),
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
    calendarContext,
  };
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

    // Get superhuman context (predictions, values, commitments)
    // V3 Semantic Intelligence needs current conversation context
    const personMatch = input.userText?.match(
      /\b(my (?:mom|dad|wife|husband|partner|sister|brother|friend|boss|coworker)|(?:mom|dad|wife|husband)\b)/i
    );
    const superhumanContext = await getSuperhuman(userId, 'peter', {
      currentTranscript: input.userText,
      currentTopics: input.analysis?.topics?.detected,
      currentEmotion: input.analysis?.emotion?.primary,
      currentMentionedPerson: personMatch?.[1],
    });

    // Format for injection
    const briefingLines = formatBriefingForInjection(briefing, handoffBriefing, turnCount);

    // Add superhuman context if available
    if (superhumanContext) {
      briefingLines.push('\n' + superhumanContext);
    }

    // 🤝 TEAM HUDDLE: Record Peter's observations for cross-persona intelligence
    try {
      const { peter: peterObserver, recordConcern } =
        await import('../../../../services/cross-persona/observation-recorder.js');

      // Record spending/financial concerns (financialStressLevel is a string like "high", "moderate")
      const stressLevel = briefing.behavioralMetrics.financialStressLevel.toLowerCase();
      if (stressLevel === 'high' || stressLevel === 'stressed') {
        recordConcern(
          userId,
          'peter',
          `Financial stress elevated: ${briefing.behavioralMetrics.financialStressLevel}`,
          0.8,
          ['finances', 'stress', 'spending']
        );
      }

      // Record pattern discoveries
      if (briefing.crossDomainPatterns.length > 0) {
        peterObserver.pattern(userId, briefing.crossDomainPatterns[0], 0.8, [
          'patterns',
          'research',
          'correlation',
        ]);
      }

      // Record insights about habit correlations
      if (briefing.habitCorrelations.length > 0) {
        peterObserver.insight(userId, briefing.habitCorrelations[0], 0.75, [
          'habits',
          'correlation',
          'data',
        ]);
      }

      // Record anomalies (use pattern for Peter since he's analytical)
      if (briefing.anomalies.length > 0) {
        peterObserver.pattern(userId, `Anomaly detected: ${briefing.anomalies[0]}`, 0.7, [
          'anomaly',
          'research',
          'attention',
        ]);
      }
    } catch (err) {
      // Non-critical - don't block if observation recording fails
      log.debug({ error: String(err) }, 'Failed to record Peter observations (non-blocking)');
    }

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
