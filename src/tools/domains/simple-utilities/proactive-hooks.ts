/**
 * Proactive Hooks for Simple Utilities
 *
 * Don't wait to be asked - offer help at the right moment.
 * This is what makes Ferni feel like a friend who anticipates your needs.
 *
 * HOOK TRIGGERS:
 * 1. Time of day - "It's 3pm, want your usual tea timer?"
 * 2. Topic detection - "Sounds like you're cooking, need conversions?"
 * 3. Pattern recognition - "Third Tokyo check, planning a trip?"
 * 4. Calendar awareness - "Your meeting's in Tokyo time tomorrow..."
 * 5. Life event proximity - "7 days until your anniversary!"
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { getUserPatterns, getProactiveSuggestions } from './pattern-intelligence.js';
import { loadUtilityPreferences, getUpcomingMilestones } from './persistence.js';
import { onCountdownMilestone, onProactiveSuggestion } from './voice-callbacks.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveContext {
  userId: string;
  currentTime: Date;
  conversationTopics?: string[];
  recentUserInput?: string;
  lifeEvents?: Array<{ event: string; date: Date; type: string }>;
  travelPlans?: Array<{ destination: string; startDate: Date }>;
}

export interface ProactiveOffer {
  type: 'timer' | 'conversion' | 'timezone' | 'countdown' | 'tip' | 'decision';
  message: string;
  action?: string; // Tool to call if accepted
  actionParams?: Record<string, unknown>;
  priority: 'high' | 'normal' | 'low';
  expiresAt?: Date;
}

// Track what we've offered to avoid repetition
const recentOffers = new Map<string, Array<{ offer: string; timestamp: Date }>>();

// ============================================================================
// PROACTIVE EVALUATION
// ============================================================================

/**
 * Evaluate all proactive hooks and return offers
 * Call this at conversation start and periodically during long conversations
 */
export async function evaluateProactiveHooks(context: ProactiveContext): Promise<ProactiveOffer[]> {
  const offers: ProactiveOffer[] = [];
  const { userId, currentTime } = context;

  // Dedupe - don't offer same thing twice in a session
  const userOffers = recentOffers.get(userId) || [];
  const recentOfferMessages = new Set(
    userOffers
      .filter((o) => currentTime.getTime() - o.timestamp.getTime() < 30 * 60 * 1000)
      .map((o) => o.offer)
  );

  // 1. Time-of-day timer suggestions
  const timerOffer = await evaluateTimerHook(userId, currentTime);
  if (timerOffer && !recentOfferMessages.has(timerOffer.message)) {
    offers.push(timerOffer);
  }

  // 2. Topic-based conversion offers
  if (context.conversationTopics || context.recentUserInput) {
    const conversionOffer = evaluateConversionHook(
      context.conversationTopics || [],
      context.recentUserInput
    );
    if (conversionOffer && !recentOfferMessages.has(conversionOffer.message)) {
      offers.push(conversionOffer);
    }
  }

  // 3. Travel planning timezone help
  if (context.travelPlans?.length) {
    const timezoneOffer = evaluateTimezoneHook(userId, context.travelPlans);
    if (timezoneOffer && !recentOfferMessages.has(timezoneOffer.message)) {
      offers.push(timezoneOffer);
    }
  }

  // 4. Countdown milestones
  const milestones = await getUpcomingMilestones(userId);
  for (const milestone of milestones) {
    const countdownOffer = evaluateCountdownHook(milestone);
    if (countdownOffer && !recentOfferMessages.has(countdownOffer.message)) {
      offers.push(countdownOffer);
      // Also trigger voice callback for important milestones
      if (milestone.daysRemaining <= 1) {
        await onCountdownMilestone(
          userId,
          milestone.event,
          milestone.daysRemaining,
          milestone.targetDate
        );
      }
    }
  }

  // 5. Life event proximity
  if (context.lifeEvents?.length) {
    const eventOffers = evaluateLifeEventHooks(context.lifeEvents, currentTime);
    for (const offer of eventOffers) {
      if (!recentOfferMessages.has(offer.message)) {
        offers.push(offer);
      }
    }
  }

  // 6. Pattern-based suggestions from intelligence layer
  const patternSuggestions = getProactiveSuggestions(userId);
  for (const suggestion of patternSuggestions) {
    if (!recentOfferMessages.has(suggestion)) {
      offers.push({
        type: 'timer', // Default, could be smarter
        message: suggestion,
        priority: 'low',
      });
    }
  }

  // Record offers to avoid repetition
  const newOffers = offers.map((o) => ({ offer: o.message, timestamp: currentTime }));
  recentOffers.set(userId, [...userOffers.slice(-10), ...newOffers]);

  // Sort by priority
  offers.sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return offers;
}

// ============================================================================
// INDIVIDUAL HOOK EVALUATORS
// ============================================================================

/**
 * Evaluate timer hook - suggest usual timers at usual times
 */
async function evaluateTimerHook(
  userId: string,
  currentTime: Date
): Promise<ProactiveOffer | null> {
  const patterns = getUserPatterns(userId);
  const prefs = await loadUtilityPreferences(userId);
  const hour = currentTime.getHours();

  // Determine current time of day
  const timeOfDay =
    hour >= 5 && hour < 12
      ? 'morning'
      : hour >= 12 && hour < 17
        ? 'afternoon'
        : hour >= 17 && hour < 21
          ? 'evening'
          : 'night';

  // Look for usual timer at this time
  const usualTimer =
    prefs.timers.usual.find((t) => t.timeOfDay === timeOfDay && t.count >= 3) ||
    patterns.patterns.commonTimerDurations.find((t) => t.usualTime === timeOfDay && t.count >= 3);

  if (usualTimer) {
    const label = usualTimer.label || 'timer';
    const { minutes } = usualTimer;

    return {
      type: 'timer',
      message: `Want me to set your usual ${minutes}-minute ${label}?`,
      action: 'setTimer',
      actionParams: { minutes, label },
      priority: 'low',
    };
  }

  return null;
}

/**
 * Evaluate conversion hook - detect cooking/baking context
 */
function evaluateConversionHook(topics: string[], recentInput?: string): ProactiveOffer | null {
  const cookingKeywords = [
    'cooking',
    'baking',
    'recipe',
    'ingredient',
    'dinner',
    'lunch',
    'breakfast',
    'meal',
    'food',
    'kitchen',
    'oven',
    'stove',
  ];

  const combined = [...topics, recentInput || ''].join(' ').toLowerCase();

  const isCooking = cookingKeywords.some((k) => combined.includes(k));

  if (isCooking) {
    return {
      type: 'conversion',
      message: "Sounds like you're cooking! Need help with any measurements or conversions?",
      priority: 'low',
    };
  }

  return null;
}

/**
 * Evaluate timezone hook - help with travel planning
 */
function evaluateTimezoneHook(
  userId: string,
  travelPlans: Array<{ destination: string; startDate: Date }>
): ProactiveOffer | null {
  const now = new Date();

  for (const plan of travelPlans) {
    const daysUntil = Math.ceil((plan.startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 7 && daysUntil > 0) {
      return {
        type: 'timezone',
        message: `Your ${plan.destination} trip is in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}! Want to check the time difference or best times to call home?`,
        action: 'timeInCity',
        actionParams: { city: plan.destination },
        priority: 'normal',
      };
    }
  }

  return null;
}

/**
 * Evaluate countdown hook - celebrate milestones
 */
function evaluateCountdownHook(milestone: {
  event: string;
  daysRemaining: number;
  targetDate: Date;
}): ProactiveOffer | null {
  const { event, daysRemaining } = milestone;

  let message: string;
  let priority: ProactiveOffer['priority'] = 'normal';

  if (daysRemaining === 0) {
    message = `🎉 Today's the day - it's ${event}!`;
    priority = 'high';
  } else if (daysRemaining === 1) {
    message = `${event} is tomorrow! Excited?`;
    priority = 'high';
  } else if (daysRemaining === 7) {
    message = `One week until ${event}!`;
  } else if (daysRemaining === 30) {
    message = `One month until ${event} - time flies!`;
  } else if (daysRemaining === 100) {
    message = `100 days until ${event}! 🎯`;
  } else {
    return null;
  }

  return {
    type: 'countdown',
    message,
    priority,
  };
}

/**
 * Evaluate life event hooks - birthdays, anniversaries, etc.
 */
function evaluateLifeEventHooks(
  events: Array<{ event: string; date: Date; type: string }>,
  currentTime: Date
): ProactiveOffer[] {
  const offers: ProactiveOffer[] = [];

  for (const event of events) {
    const daysUntil = Math.ceil(
      (event.date.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Anniversaries and birthdays
    if (event.type === 'anniversary' || event.type === 'birthday') {
      if (daysUntil === 7) {
        offers.push({
          type: 'countdown',
          message: `${event.event} is in one week! Need help planning anything?`,
          priority: 'normal',
        });
      } else if (daysUntil === 1) {
        offers.push({
          type: 'countdown',
          message: `${event.event} is tomorrow! All set?`,
          priority: 'high',
        });
      } else if (daysUntil === 0) {
        offers.push({
          type: 'countdown',
          message: `Happy ${event.type === 'birthday' ? 'Birthday' : 'Anniversary'}! 🎉`,
          priority: 'high',
        });
      }
    }
  }

  return offers;
}

// ============================================================================
// CONVERSATION INTEGRATION
// ============================================================================

/**
 * Get proactive opener for conversation start
 * Returns the best proactive offer to mention naturally
 */
export async function getProactiveOpener(
  userId: string,
  context?: Partial<ProactiveContext>
): Promise<string | null> {
  const fullContext: ProactiveContext = {
    userId,
    currentTime: new Date(),
    ...context,
  };

  const offers = await evaluateProactiveHooks(fullContext);

  if (offers.length === 0) {
    return null;
  }

  // Get highest priority offer
  const topOffer = offers[0];

  // Log that we're making a proactive suggestion
  getLogger().info(
    { userId, offerType: topOffer.type, priority: topOffer.priority },
    'Proactive utility suggestion'
  );

  return topOffer.message;
}

/**
 * Check if we should inject a proactive suggestion mid-conversation
 */
export async function shouldInjectProactiveSuggestion(
  userId: string,
  conversationTurnCount: number,
  lastActivityMinutes: number
): Promise<string | null> {
  // Only inject during natural pauses
  if (conversationTurnCount < 3) return null; // Too early
  if (lastActivityMinutes < 2) return null; // Too recent

  const context: ProactiveContext = {
    userId,
    currentTime: new Date(),
  };

  const offers = await evaluateProactiveHooks(context);

  // Only inject high-priority offers mid-conversation
  const highPriority = offers.find((o) => o.priority === 'high');

  return highPriority?.message || null;
}

// ============================================================================
// DAILY PROACTIVE CHECK
// ============================================================================

/**
 * Run daily proactive checks for all users
 * Call this from a scheduled function
 */
export async function runDailyProactiveChecks(
  userIds: string[]
): Promise<Map<string, ProactiveOffer[]>> {
  const results = new Map<string, ProactiveOffer[]>();

  for (const userId of userIds) {
    try {
      const context: ProactiveContext = {
        userId,
        currentTime: new Date(),
      };

      const offers = await evaluateProactiveHooks(context);

      // Only keep high/normal priority for daily checks
      const significantOffers = offers.filter((o) => o.priority !== 'low');

      if (significantOffers.length > 0) {
        results.set(userId, significantOffers);

        // Trigger voice callbacks for milestones
        for (const offer of significantOffers) {
          if (offer.type === 'countdown' && offer.priority === 'high') {
            await onProactiveSuggestion(userId, offer.message, {
              type: offer.type,
              action: offer.action,
            });
          }
        }
      }
    } catch (err) {
      getLogger().error({ err, userId }, 'Failed daily proactive check');
    }
  }

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  evaluateProactiveHooks,
  getProactiveOpener,
  shouldInjectProactiveSuggestion,
  runDailyProactiveChecks,
};
