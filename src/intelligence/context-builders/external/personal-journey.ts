/**
 * Personal Journey Context Builder
 *
 * Injects journey awareness into conversation prompts.
 * Makes the LLM aware of milestones, seasonal memories,
 * chapter context, and growth mirrors.
 *
 * Philosophy: Inject as hints and awareness, not instructions.
 * Let the persona naturally incorporate the awareness.
 *
 * @module intelligence/context-builders/personal-journey
 */

import {
  isPersonalJourneyEnabled,
  isPersonalJourneyFeatureEnabled,
  isUserInPersonalJourneyRollout,
} from '../../../config/feature-flags.js';
import {
  getCurrentChapterSummary,
  getJourneySnapshot,
  getRhythmStats,
  recordDelivery,
  selectMomentForTurn,
  type JourneyMoment,
} from '../../../services/personal-journey/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'PersonalJourneyBuilder' });

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * How to inject different moment types
 */
const MOMENT_INJECTION_CONFIG: Record<
  string,
  {
    style: 'standard' | 'hint';
    prefix: string;
    suffix?: string;
  }
> = {
  rhythm_milestone: {
    style: 'standard',
    prefix: 'MILESTONE: This is a significant moment.',
    suffix: "Acknowledge this naturally, as a friend would. Don't be robotic about it.",
  },
  rhythm_acknowledgment: {
    style: 'hint',
    prefix: 'The user has been consistent.',
  },
  seasonal_memory: {
    style: 'standard',
    prefix: 'TIME MEMORY: You remember something from this time of year.',
    suffix: 'Reference this gently, like a friend recalling a shared memory.',
  },
  seasonal_pattern: {
    style: 'hint',
    prefix: "You've noticed a seasonal pattern.",
  },
  chapter_transition: {
    style: 'standard',
    prefix: 'CHAPTER AWARENESS: The user is in a life transition.',
    suffix: 'Acknowledge this with care, not diagnosis.',
  },
  chapter_reflection: {
    style: 'hint',
    prefix: 'Current life chapter theme detected.',
  },
  growth_mirror: {
    style: 'standard',
    prefix: "GROWTH MOMENT: You've witnessed significant growth.",
    suffix: 'Mirror this back with genuine warmth. This is a gift to give them.',
  },
  community_wisdom: {
    style: 'hint',
    prefix: 'Others on similar journeys have found...',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build injection from a journey moment
 */
function buildMomentInjection(moment: JourneyMoment): ContextInjection {
  const config = MOMENT_INJECTION_CONFIG[moment.type] || {
    style: 'hint',
    prefix: '',
  };

  const content = config.suffix
    ? `${config.prefix}\n\n${moment.content}\n\n${config.suffix}`
    : `${config.prefix}\n\n${moment.content}`;

  if (config.style === 'standard') {
    return createStandardInjection('personal_journey', content, {
      confidence: moment.priority / 10,
    });
  }

  return createHintInjection('personal_journey', content, { confidence: moment.priority / 10 });
}

/**
 * Check if we should inject journey context based on turn
 */
function shouldInjectJourneyContext(
  turnCount: number,
  userText: string | undefined
): { shouldInject: boolean; reason: string } {
  // Always consider on first turn (greeting)
  if (turnCount === 0) {
    return { shouldInject: true, reason: 'greeting_turn' };
  }

  // Check if user is asking about their journey
  if (userText) {
    const lower = userText.toLowerCase();
    const journeyQueries = [
      'how long',
      'how many',
      'first time',
      'when did we',
      'remember when',
      'last year',
      'been talking',
      'our conversations',
      'my progress',
      'my journey',
      'come a long way',
    ];

    for (const query of journeyQueries) {
      if (lower.includes(query)) {
        return { shouldInject: true, reason: 'user_query' };
      }
    }
  }

  // Probabilistic injection on other turns (low chance)
  // This prevents every turn having journey context
  if (Math.random() < 0.08) {
    return { shouldInject: true, reason: 'organic_opportunity' };
  }

  return { shouldInject: false, reason: 'not_appropriate' };
}

/**
 * Build background context about the journey (always included, lightweight)
 */
function buildBackgroundJourneyContext(userId: string): string | null {
  try {
    const stats = getRhythmStats(userId);
    const chapter = getCurrentChapterSummary(userId);

    // Only include if there's meaningful history
    if (stats.totalConversations < 3) {
      return null;
    }

    const parts: string[] = [];

    // Relationship duration
    if (stats.daysKnown > 30) {
      const months = Math.floor(stats.daysKnown / 30);
      parts.push(
        `You've known this person for ${months} month${months === 1 ? '' : 's'} (${stats.totalConversations} conversations).`
      );
    } else if (stats.daysKnown > 7) {
      parts.push(
        `You've been talking for ${stats.daysKnown} days (${stats.totalConversations} conversations).`
      );
    }

    // Current streak (if notable)
    if (stats.currentStreak >= 3) {
      parts.push(`They've checked in ${stats.currentStreak} days in a row.`);
    }

    // Chapter context (if detected)
    if (chapter.hasChapter && chapter.theme) {
      parts.push(
        `Current life focus: ${chapter.theme}${chapter.isInTransition ? ' (in transition)' : ''}.`
      );
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join(' ');
  } catch {
    return null;
  }
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build personal journey context for injection
 */
async function buildPersonalJourneyContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { userText, services } = input;
  const turnCount = input.userData?.turnCount ?? 0;

  const userId = services?.userId || 'anonymous';

  // Skip for anonymous users
  if (userId === 'anonymous') {
    return injections;
  }

  // Check feature flag
  if (!isPersonalJourneyEnabled() || !isUserInPersonalJourneyRollout(userId)) {
    return injections;
  }

  try {
    // 1. Always include lightweight background context (as hint)
    const backgroundContext = buildBackgroundJourneyContext(userId);
    if (backgroundContext) {
      injections.push(
        createHintInjection(
          'journey_background',
          `[RELATIONSHIP CONTEXT: ${backgroundContext}]`,
          { confidence: 0.3 } // Low priority - just background
        )
      );
    }

    // 2. Check if we should inject a journey moment
    const { shouldInject, reason } = shouldInjectJourneyContext(turnCount, userText);

    if (!shouldInject) {
      log.debug('Personal journey context not injected', { userId, reason });
      return injections;
    }

    // 3. Select a moment to potentially share
    const moment = selectMomentForTurn(userId, {
      isGreeting: turnCount === 0,
      userText,
      turnCount,
    });

    if (!moment) {
      log.debug('No journey moment selected', { userId, reason });
      return injections;
    }

    // 4. Build and add the injection
    const momentInjection = buildMomentInjection(moment);
    injections.push(momentInjection);

    // 5. Record that we're delivering this moment
    // (Do this after the turn completes in production, but track intent here)
    recordDelivery(userId, moment);

    log.info('Personal journey moment injected', {
      userId,
      momentType: moment.type,
      priority: moment.priority,
      reason,
    });
  } catch (err) {
    log.warn('Failed to build personal journey context', {
      userId,
      error: String(err),
    });
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

/**
 * Register the personal journey context builder
 * Priority: 50 (after world awareness at 45, before celebration at 55)
 */
registerContextBuilder({
  name: 'personal_journey',
  description:
    'Personal Journey Awareness - milestones, seasonal memory, life chapters, growth mirrors. Better Than Human remembers YOUR journey.',
  priority: 50,
  build: buildPersonalJourneyContext,
});

log.debug('Personal journey context builder registered');

// ============================================================================
// EXPORTS FOR DIRECT USE
// ============================================================================

export { buildBackgroundJourneyContext, buildPersonalJourneyContext, shouldInjectJourneyContext };

/**
 * Get a journey-aware greeting enhancement
 * Can be called directly by greeting systems
 */
export async function getJourneyGreetingEnhancement(userId: string): Promise<{
  hasEnhancement: boolean;
  content?: string;
  type?: string;
}> {
  try {
    // Check feature flag
    if (
      !isPersonalJourneyEnabled() ||
      !isPersonalJourneyFeatureEnabled('greetingEnhancement') ||
      !isUserInPersonalJourneyRollout(userId)
    ) {
      return { hasEnhancement: false };
    }

    const moment = selectMomentForTurn(userId, {
      isGreeting: true,
      turnCount: 0,
    });

    if (!moment) {
      return { hasEnhancement: false };
    }

    // Record delivery
    recordDelivery(userId, moment);

    log.info('🌟 Journey greeting enhancement delivered', {
      userId,
      type: moment.type,
      source: moment.source,
    });

    return {
      hasEnhancement: true,
      content: moment.content,
      type: moment.type,
    };
  } catch (err) {
    log.warn('Failed to get journey greeting enhancement', {
      userId,
      error: String(err),
    });
    return { hasEnhancement: false };
  }
}

/**
 * Get journey stats for debugging/display
 */
export function getJourneyStatsForDisplay(userId: string): {
  totalConversations: number;
  daysKnown: number;
  currentStreak: number;
  relationshipStage: string;
  currentChapter?: string;
  inTransition: boolean;
} {
  try {
    const snapshot = getJourneySnapshot(userId);
    return {
      totalConversations: snapshot.stats.totalConversations,
      daysKnown: snapshot.stats.daysKnown,
      currentStreak: snapshot.stats.currentStreak,
      relationshipStage: snapshot.stats.relationshipStage,
      currentChapter: snapshot.currentChapter,
      inTransition: snapshot.inTransition,
    };
  } catch {
    return {
      totalConversations: 0,
      daysKnown: 0,
      currentStreak: 0,
      relationshipStage: 'new',
      inTransition: false,
    };
  }
}
