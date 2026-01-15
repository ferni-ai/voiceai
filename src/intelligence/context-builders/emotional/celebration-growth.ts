/**
 * Celebration & Growth Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates the CelebrationEngine and GrowthVisibilityEngine into
 * the context injection system. This makes celebration and growth
 * recognition AUTOMATIC, not something we have to remember to do.
 *
 * Features:
 * - Detects celebration opportunities from user messages
 * - Surfaces growth insights at appropriate moments
 * - Injects celebration/growth guidance into agent prompts
 * - Tracks what resonates with users
 *
 * @module CelebrationGrowthContext
 */

import { getBetterThanHumanTelemetry } from '../../../services/analytics/better-than-human-telemetry.js';
import {
  getCelebrationEngine,
  type CelebrationResponse,
  type CelebrationTrigger,
} from '../../../services/engagement/celebration-engine.js';
import {
  getGrowthVisibilityEngine,
  type GrowthReflection,
} from '../../../services/engagement/growth-visibility-engine.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = getLogger();

// ============================================================================
// CELEBRATION CONTEXT
// ============================================================================

/**
 * Build celebration context injections
 */
async function buildCelebrationContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userProfile, userData, analysis, services, userText } = input;
  const injections: ContextInjection[] = [];

  if (!userProfile || !services.userId) {
    return injections;
  }

  const turnCount = userData.turnCount || 0;
  const userMessage = userText || '';

  // Get celebration engine
  const celebrationEngine = getCelebrationEngine(services.userId, services.personaId || 'ferni');

  // Detect celebration opportunity
  const trigger = celebrationEngine.detectCelebration(userMessage, turnCount, {
    activeGoals: userProfile.goals
      ?.filter((g) => g.status === 'active')
      .map((g) => ({
        id: g.id,
        title: g.name,
        progress: g.progressPercent || g.currentProgress || 0,
      })),
    profile: userProfile,
  });

  if (trigger) {
    const response = celebrationEngine.generateCelebration(trigger);

    // Create high-priority injection for celebration
    injections.push(
      createStandardInjection('celebration', formatCelebrationForPrompt(trigger, response), {
        category: 'celebration',
        confidence: 0.9,
      })
    );

    log.debug(
      { type: trigger.type, intensity: trigger.intensity },
      '🎉 Celebration opportunity detected'
    );

    // Track telemetry
    const telemetry = getBetterThanHumanTelemetry();
    const celebrationType =
      trigger.type === 'goal_completed'
        ? 'goal_completed'
        : trigger.type === 'streak_achieved'
          ? 'streak'
          : trigger.type === 'breakthrough'
            ? 'breakthrough'
            : 'generic';
    telemetry.trackCelebration(celebrationType, services.userId, services.personaId || 'ferni', {
      achievement: trigger.achievement,
      intensity: trigger.intensity,
    });
  }

  return injections;
}

/**
 * Format celebration for prompt injection
 */
function formatCelebrationForPrompt(
  trigger: CelebrationTrigger,
  response: CelebrationResponse
): string {
  const emoji = {
    subtle: '✨',
    warm: '🌟',
    enthusiastic: '🎉',
    ecstatic: '🎊',
  };

  return `[${emoji[trigger.intensity]} CELEBRATION MOMENT]
The user just achieved something worth celebrating!

WHAT HAPPENED: ${trigger.achievement}
WHY IT MATTERS: ${trigger.significance}
ENERGY LEVEL: ${response.energy.toUpperCase()}
EXPRESSION: ${response.expression}

SUGGESTED RESPONSE:
"${response.message}"

IMPORTANT: Celebrate this BEFORE moving on to anything else. Be genuine, not performative.`;
}

// ============================================================================
// GROWTH VISIBILITY CONTEXT
// ============================================================================

/**
 * Build growth visibility context injections
 */
async function buildGrowthContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userProfile, userData, analysis, services, userText } = input;
  const injections: ContextInjection[] = [];

  if (!userProfile || !services.userId) {
    return injections;
  }

  const turnCount = userData.turnCount || 0;
  const currentTopic = analysis.topics.primary || analysis.topics.detected[0];

  // Only surface growth insights at certain moments
  // - Early in session (turns 2-4)
  // - When topic relates to an insight
  // - At relationship milestones
  const isGoodMoment =
    (turnCount >= 2 && turnCount <= 4) || (turnCount > 0 && turnCount % 10 === 0);

  if (!isGoodMoment) {
    return injections;
  }

  // Get growth engine
  const growthEngine = getGrowthVisibilityEngine(services.userId);

  // Record current turn for tracking
  growthEngine.recordTurn({
    userMessage: userText || '',
    topic: currentTopic,
    emotion: analysis.emotion
      ? { primary: analysis.emotion.primary, intensity: analysis.emotion.intensity }
      : undefined,
    wasVulnerable: analysis.emotion?.needsSupport || false,
    hadInsight:
      analysis.intent?.primary === 'realization' || /i (just )?realized/i.test(userText || ''),
  });

  // Import data from profile if not already done
  if (userProfile) {
    growthEngine.importFromProfile(userProfile);
  }

  // Detect growth if we have enough data
  const insights = growthEngine.detectGrowth();

  // Try to get an insight to surface
  const reflection = growthEngine.getInsightToSurface({
    currentTopic,
    sessionStart: turnCount <= 3,
    milestone: turnCount % 10 === 0,
  });

  if (reflection) {
    // Create hint injection for growth reflection
    injections.push(
      createHintInjection('growth_reflection', formatGrowthForPrompt(reflection), {
        category: 'growth',
        confidence: reflection.insight.confidence,
      })
    );

    log.debug(
      { type: reflection.insight.type, area: reflection.insight.area },
      '🌱 Growth insight ready to surface'
    );

    // Track telemetry
    const telemetry = getBetterThanHumanTelemetry();
    telemetry.trackGrowthInsightSurfaced(
      services.userId,
      services.personaId || 'ferni',
      reflection.insight.id
    );
  }

  return injections;
}

/**
 * Format growth reflection for prompt injection
 */
function formatGrowthForPrompt(reflection: GrowthReflection): string {
  return `[🌱 GROWTH OPPORTUNITY]
You've noticed something about the user's growth over time.

GROWTH AREA: ${reflection.insight.area}
BEFORE: ${reflection.insight.before}
NOW: ${reflection.insight.after}
TIMESPAN: ${reflection.insight.timespan.durationDays} days

SUGGESTED REFLECTION:
"${reflection.reflection}"

GUIDANCE:
- Share this naturally, not forced
- Don't use if the conversation is heavy/emotional
- Let them sit with it if they respond positively
- This should feel like an observation from a friend who's been paying attention`;
}

// ============================================================================
// COMBINED BUILDER
// ============================================================================

/**
 * Build celebration and growth context injections
 */
async function buildCelebrationAndGrowthContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const [celebrationInjections, growthInjections] = await Promise.all([
    buildCelebrationContext(input),
    buildGrowthContext(input),
  ]);

  // Celebration takes priority - don't surface growth during celebration
  if (celebrationInjections.length > 0) {
    return celebrationInjections;
  }

  return growthInjections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'celebration_growth',
  description: 'Celebrates achievements and surfaces growth insights',
  priority: 85, // High priority - celebration should come before most things
  build: buildCelebrationAndGrowthContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildCelebrationAndGrowthContext,
  buildCelebrationContext,
  buildGrowthContext,
  formatCelebrationForPrompt,
  formatGrowthForPrompt,
};

export default {
  buildCelebrationContext,
  buildGrowthContext,
  buildCelebrationAndGrowthContext,
};
