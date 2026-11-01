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
import { takeHandoffArrival } from '../../../../tools/handoff/index.js';
import { flagOn } from '../../../../config/env-flag.js';
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
import { loadBriefingStores } from '../briefing-stores.js';

// V5 Superhuman Persona Intelligence - Causal Inference & Financial Patterns
import {
  buildCausalInferenceContext,
  buildFinancialPatternContext,
} from '../../../../services/superhuman/index.js';

import {
  analyzeGoalTrajectory,
  analyzeSpendingPatterns,
  buildCalendarResearchContext,
  getMayaHabitInsights,
  getMemoryOrchestratorInsights,
  getMoodPatterns,
} from './data-fetchers.js';
import { clearPeterResearchSession, getSession } from './session.js';
// Cross-Domain: CEO Coaching for pending decisions
import { getPendingDecisions } from '../../../../tools/domains/ceo-coaching/storage.js';
import { formatBriefingForInjection } from './formatting.js';
import { analyzeHandoffContext } from './handoff-analysis.js';
import { detectCrossDomainPatterns } from './metrics.js';
import { detectProactiveCoachingInsights } from './opportunities.js';
import type { HabitInsights, MemoryInsights, MoodInsights, UserInsightBriefing } from './types.js';
import { isMemberIdentity } from '../../../../services/identity/member-identity.js';

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
  // The store getters read an empty cache until the member's data is loaded (#3044).
  await loadBriefingStores(userId);
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

  // Parallel fetch from all data sources + calendar context + CEO coaching
  // 🐛 FIX: Each promise has its own catch to prevent one failure from crashing all
  const [
    spendingInsights,
    goalInsights,
    mayaInsights,
    moodPatterns,
    memoryInsights,
    calendarContext,
    ceoPendingDecisions, // Cross-Domain: CEO Coaching
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
    // Cross-Domain: CEO Coaching - Peter helps analyze pending decisions
    getPendingDecisions(userId).catch(() => []),
  ]);

  // Detect proactive coaching triggers (sync, based on already-fetched data)
  // Cross-Domain: Include CEO decisions for Peter's analytical support
  const proactiveCoachingInsights = detectProactiveCoachingInsights(
    userId,
    mayaInsights,
    ceoPendingDecisions // CEO Coaching: Pending decisions Peter can help analyze
  );

  // Patterns the member's own habits, moods and spending show
  const crossDomainPatterns = detectCrossDomainPatterns(
    mayaInsights,
    moodPatterns,
    spendingInsights
  );

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
  if (moodPatterns.lastMood && moodPatterns.averageEnergy < 2.5) {
    proactiveDiscoveries.push('Low energy average - may need to address rest before goals');
  }

  // Cross-domain discoveries
  if (crossDomainPatterns.length > 0) {
    proactiveDiscoveries.push(`Cross-domain pattern: ${crossDomainPatterns[0]}`);
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

  return {
    spendingInsights,
    goalInsights,
    crossDomainPatterns,
    anomalies: spendingInsights.filter(
      (i) => i.includes('over') || i.includes('ahead') || i.includes('behind')
    ),
    proactiveDiscoveries,
    mayaInsights,
    moodPatterns,
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
  if (!isMemberIdentity(userId)) {
    return injections;
  }

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  // His handoff briefing waits behind its flag: it never ran in prod before #3066 (#3044)
  const handoffBriefing = flagOn('PERSONA_BRIEFING_PETER_HANDOFF')
    ? analyzeHandoffContext(takeHandoffArrival(services?.sessionId, 'peter-john'))
    : null;
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
    const briefingLines = formatBriefingForInjection(briefing, handoffBriefing, turnCount);
    if (briefingLines.length === 0) return injections; // nothing true to say

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

    // Add superhuman context if available
    if (superhumanContext) {
      briefingLines.push('\n' + superhumanContext);
    }

    // V5 Superhuman Persona Intelligence - Causal Inference Engine & Financial Patterns
    // Granger causality, counterfactuals, intervention recommendations, behavioral biases
    const [causalContext, financialContext] = await Promise.all([
      buildCausalInferenceContext(userId).catch((e) => {
        log.debug({ error: String(e) }, 'Failed to build causal inference context');
        return '';
      }),
      buildFinancialPatternContext(userId).catch((e) => {
        log.debug({ error: String(e) }, 'Failed to build financial pattern context');
        return '';
      }),
    ]);
    if (causalContext) {
      briefingLines.push('\n' + causalContext);
    }
    if (financialContext) {
      briefingLines.push('\n' + financialContext);
    }

    // 🤝 TEAM HUDDLE: Record Peter's observations for cross-persona intelligence
    try {
      const { peter: peterObserver } =
        await import('../../../../services/cross-persona/observation-recorder.js');

      // Record pattern discoveries (only ones the member's data shows, #3044)
      if (briefing.crossDomainPatterns.length > 0) {
        peterObserver.pattern(userId, briefing.crossDomainPatterns[0], 0.8, [
          'patterns',
          'research',
          'correlation',
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
