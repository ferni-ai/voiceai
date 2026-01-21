/**
 * Maya's Coaching Insights Context Builder
 *
 * > "Progress isn't linear. Setbacks are data, not failure."
 *
 * This builder loads Maya with DEEP coaching intelligence when:
 * 1. A user transfers TO Maya from another persona
 * 2. A user starts talking directly with Maya
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights
 */

import { getHabitCalendarContextForBuilder } from '../../../../services/habits/habit-calendar-integration.js';
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

// V5 Superhuman Persona Intelligence - Computational Behavior Science
import {
  buildBiometricHabitContext,
  buildExperimentationContext,
  buildHabitEconomicsContext,
  buildHabitOptimizationContext,
} from '../../../../services/superhuman/index.js';

import {
  analyzeHabitHealth,
  analyzeMoodIntelligence,
  getJordanGoalInsights,
  getMemoryInsights,
  getPeterPatternInsights,
} from './data-fetchers.js';
import { formatMayaBriefing } from './formatting.js';
import { analyzeHandoffForMaya } from './handoff-analysis.js';
import { computeCoachingMetrics, detectFourTendency } from './metrics.js';
import { clearMayaCoachingSession, getSession } from './session.js';
import { detectProactiveTriggers } from './triggers.js';
import type {
  HabitHealthSummary,
  MayaInsightBriefing,
  MemoryInsights,
  MoodIntelligence,
} from './types.js';

const log = createLogger({ module: 'context:maya-coaching-insights' });

// Re-export session functions for external use
export { clearMayaCoachingSession };

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

    // V5 Superhuman Persona Intelligence - Computational Behavior Science
    // Fogg Model scoring, MCII/WOOP, chronotype, habit economics, biometric correlation, N=1 experiments
    const [habitOptimizationContext, habitEconomicsContext, biometricContext, n1Context] =
      await Promise.all([
        buildHabitOptimizationContext(userId).catch((e) => {
          log.debug({ error: String(e) }, 'Failed to build habit optimization context');
          return '';
        }),
        buildHabitEconomicsContext(userId).catch((e) => {
          log.debug({ error: String(e) }, 'Failed to build habit economics context');
          return '';
        }),
        buildBiometricHabitContext(userId).catch((e) => {
          log.debug({ error: String(e) }, 'Failed to build biometric habit context');
          return '';
        }),
        buildExperimentationContext(userId).catch((e: unknown) => {
          log.debug({ error: String(e) }, 'Failed to build N=1 experimentation context');
          return '';
        }),
      ]);
    if (habitOptimizationContext) {
      briefingLines.push(`\n${habitOptimizationContext}`);
    }
    if (habitEconomicsContext) {
      briefingLines.push(`\n${habitEconomicsContext}`);
    }
    if (biometricContext) {
      briefingLines.push(`\n${biometricContext}`);
    }
    if (n1Context) {
      briefingLines.push(`\n${n1Context}`);
    }

    const content = briefingLines.join('\n');

    // 🤝 TEAM HUDDLE: Record Maya's observations for cross-persona intelligence
    // This enables Ferni and other personas to know what Maya has noticed
    try {
      const { maya: mayaObserver } =
        await import('../../../../services/cross-persona/observation-recorder.js');

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
        mayaObserver.concern(userId, 'Mood trend has been declining recently', 0.7, [
          'mood',
          'energy',
          'wellbeing',
        ]);
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
