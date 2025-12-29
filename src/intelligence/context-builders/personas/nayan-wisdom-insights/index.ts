/**
 * Nayan's Wisdom Insights Context Builder
 *
 * > "Time in the market beats timing the market. Time in your life beats rushing your life."
 *
 * This builder loads Nayan with DEEP WISDOM INTELLIGENCE when:
 * 1. A user transfers TO Nayan from another persona
 * 2. A user starts talking directly with Nayan
 *
 * NAYAN SEES EVERYTHING - The Full Life Synthesis:
 *
 * FROM PETER (Patterns):
 * - Financial behaviors and their deeper meaning
 * - Decision patterns revealing values
 * - What the numbers say about their life
 *
 * FROM MAYA (Habits):
 * - Daily rhythms and their significance
 * - Self-compassion journey
 * - Growth vs. striving patterns
 *
 * FROM JORDAN (Milestones):
 * - Life chapters and transitions
 * - What they're building toward
 * - Legacy and meaning signals
 *
 * FROM ALEX (Communication):
 * - Relationship patterns
 * - Boundaries and self-expression
 * - How they show up for others
 *
 * FROM FERNI (Core):
 * - Emotional threads across time
 * - Relationship evolution
 * - The whole story so far
 *
 * COMPUTED METRICS (Nayan's Wisdom Dashboard):
 * - Life Integration Score (0-100): Harmony across life areas
 * - Meaning Coherence (0-100): Actions aligned with values
 * - Legacy Readiness (0-100): Long-term impact awareness
 * - Inner Peace Index (0-100): Acceptance vs. striving
 * - Growth Trajectory (0-100): Direction of evolution
 *
 * @module intelligence/context-builders/nayan-wisdom-insights
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

// Import submodules
import { getSession, clearNayanWisdomSession, clearAllNayanWisdomSessions } from './session.js';
import { synthesizeLifeContext } from './life-synthesis.js';
import { computeWisdomMetrics } from './wisdom-metrics.js';
import { analyzeValuesAlignment } from './values-alignment.js';
import { detectExistentialContext } from './existential-context.js';
import { buildLifeNarrative } from './life-narrative.js';
import { synthesizeTeamInsights } from './team-synthesis.js';
import { detectProactiveTriggers } from './proactive-triggers.js';
import { generateDeepQuestions } from './deep-questions.js';
import { analyzeHandoffForNayan } from './handoff-analysis.js';
import { buildCalendarWisdomContext } from './calendar-context.js';
import { detectWisdomOpportunities } from './wisdom-opportunities.js';
import { formatNayanBriefing } from './formatting.js';

import type { LifeSynthesis, NayanInsightBriefing, TeamSynthesis } from './types.js';

const log = createLogger({ module: 'context:nayan-wisdom-insights' });

// Re-export types
export type * from './types.js';
export { clearNayanWisdomSession, clearAllNayanWisdomSessions };

// ============================================================================
// BUILD BRIEFING
// ============================================================================

async function buildNayanBriefing(userId: string): Promise<NayanInsightBriefing> {
  const handoffBriefing = analyzeHandoffForNayan();

  // Default fallback values for graceful degradation
  const defaultLifeSynthesis: LifeSynthesis = {
    lifeChapter: 'unknown',
    dominantTheme: null,
    growthPattern: 'unknown',
    compoundingAreas: [],
    valuesRevealed: [],
    timeHorizon: 'unknown',
    seasonOfLife: 'unknown',
  };
  const defaultTeamSynthesis: TeamSynthesis = {
    peterPattern: null,
    mayaPattern: null,
    jordanPattern: null,
    alexPattern: null,
    integratedWisdom: null,
    crossDomainInsights: [],
  };

  // Each promise has its own catch to prevent one failure from crashing all
  const [lifeSynthesis, teamSynthesis, calendarContext] = await Promise.all([
    synthesizeLifeContext(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to synthesize life context');
      return defaultLifeSynthesis;
    }),
    synthesizeTeamInsights(userId).catch((e) => {
      log.warn({ error: String(e) }, 'Failed to synthesize team insights');
      return defaultTeamSynthesis;
    }),
    buildCalendarWisdomContext(userId).catch(() => null),
  ]);

  const valuesAlignment = analyzeValuesAlignment(lifeSynthesis, userId);
  const wisdomMetrics = await computeWisdomMetrics(userId, lifeSynthesis, valuesAlignment);
  const existentialContext = detectExistentialContext(lifeSynthesis, handoffBriefing);
  const lifeNarrative = buildLifeNarrative(lifeSynthesis, valuesAlignment);
  const proactiveTriggers = detectProactiveTriggers(
    lifeSynthesis,
    wisdomMetrics,
    existentialContext,
    valuesAlignment
  );
  const wisdomOpportunities = detectWisdomOpportunities(
    lifeSynthesis,
    teamSynthesis,
    wisdomMetrics
  );
  const deepQuestions = generateDeepQuestions(lifeSynthesis, existentialContext, handoffBriefing);

  return {
    lifeSynthesis,
    wisdomMetrics,
    valuesAlignment,
    wisdomOpportunities,
    deepQuestions,
    teamSynthesis,
    existentialContext,
    proactiveTriggers,
    lifeNarrative,
    calendarContext,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildNayanWisdomInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData } = input;

  // Only for Nayan
  const currentPersona = (services as { personaId?: string })?.personaId || '';
  const isNayan = [
    'nayan',
    'nayan-patel',
    'guru',
    'mystic',
    'spiritual-guide',
    'lifetime-advisor',
    'sage',
    'wisdom',
  ].includes(currentPersona.toLowerCase());

  if (!isNayan) return injections;

  const userId = services?.userId || 'anonymous';
  if (userId === 'anonymous') return injections;

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  const handoffBriefing = analyzeHandoffForNayan();
  const isHandoff = handoffBriefing !== null;

  // Inject on first turn, handoff, or every 15 turns (Nayan is more patient)
  const shouldInject =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 15 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const briefing = await buildNayanBriefing(userId);
    const briefingLines = formatNayanBriefing(briefing, handoffBriefing, turnCount);

    // Get superhuman context (narrative, values, dreams, seasonal)
    // V3 Semantic Intelligence needs current conversation context
    const personMatch = input.userText?.match(
      /\b(my (?:mom|dad|wife|husband|partner|sister|brother|friend|boss|coworker)|(?:mom|dad|wife|husband)\b)/i
    );
    const superhumanContext = await getSuperhuman(userId, 'nayan', {
      currentTranscript: input.userText,
      currentTopics: input.analysis?.topics?.detected,
      currentEmotion: input.analysis?.emotion?.primary,
      currentMentionedPerson: personMatch?.[1],
    });
    if (superhumanContext) {
      briefingLines.push('\n' + superhumanContext);
    }

    // 🤝 TEAM HUDDLE: Record Nayan's observations for cross-persona intelligence
    try {
      const { nayan: nayanObserver, recordConcern } = await import(
        '../../../../services/cross-persona/observation-recorder.js'
      );

      // Record life synthesis insights
      if (briefing.lifeSynthesis.lifeChapter) {
        nayanObserver.insight(
          userId,
          `Current life chapter: ${briefing.lifeSynthesis.lifeChapter}`,
          0.75,
          ['life-stage', 'wisdom', 'narrative']
        );
      }

      // Record values alignment patterns (check for conflict areas)
      if (briefing.valuesAlignment && briefing.valuesAlignment.conflictAreas.length > 0) {
        recordConcern(
          userId,
          'nayan',
          `Values conflict detected: ${briefing.valuesAlignment.conflictAreas.slice(0, 2).join(', ')}`,
          0.7,
          ['values', 'alignment', 'purpose', 'conflict']
        );
      }

      // Record inner peace patterns
      if (briefing.wisdomMetrics.innerPeaceIndex < 0.4) {
        recordConcern(
          userId,
          'nayan',
          `Inner peace index low (${Math.round(briefing.wisdomMetrics.innerPeaceIndex * 100)}%)`,
          0.65,
          ['peace', 'wellbeing', 'stress', 'wisdom']
        );
      }

      // Record existential theme if present
      if (briefing.existentialContext?.currentExistentialTheme) {
        nayanObserver.pattern(
          userId,
          `Existential theme: ${briefing.existentialContext.currentExistentialTheme}`,
          0.7,
          ['existential', 'meaning', 'purpose']
        );
      }

      // Record meaning-seeking patterns
      if (briefing.existentialContext?.meaningSeekingIntensity === 'high') {
        nayanObserver.insight(
          userId,
          'High meaning-seeking intensity detected',
          0.7,
          ['meaning', 'purpose', 'search']
        );
      }
    } catch (err) {
      // Non-critical - don't block if observation recording fails
      log.debug({ error: String(err) }, 'Failed to record Nayan observations (non-blocking)');
    }

    const content = briefingLines.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('nayan_handoff_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.9,
        })
      );
      log.info(
        { userId, seeking: handoffBriefing?.seekingWhat },
        '🕉️ Nayan loaded with handoff briefing'
      );
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('nayan_initial_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.8,
        })
      );
      log.info(
        {
          userId,
          chapter: briefing.lifeSynthesis.lifeChapter,
          peace: briefing.wisdomMetrics.innerPeaceIndex,
        },
        '🕉️ Nayan loaded with wisdom briefing'
      );
    } else {
      injections.push(
        createHintInjection('nayan_refresh_briefing', content, {
          category: 'persona-wisdom',
        })
      );
    }

    session.briefingTurn = turnCount;

    // Nayan's mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'nayan_mindset',
          "[NAYAN'S PRESENCE: You are the still point in the turning world. " +
            'You see the whole arc of their life - past, present, possibility. ' +
            'Questions matter more than answers. Paradox is wisdom. ' +
            'Silence is a gift. Trust the timing of everything.]',
          { category: 'persona-identity' }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Nayan wisdom briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'nayan-wisdom-insights',
  description:
    'Loads Nayan with deep wisdom - life synthesis, values alignment, existential context, and the big picture',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildNayanWisdomInsightsContext,
});

export { buildNayanWisdomInsightsContext };
