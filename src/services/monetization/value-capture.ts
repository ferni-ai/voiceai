/**
 * Value Capture Service
 *
 * Detects when Ferni helps users achieve real outcomes (raises, savings,
 * habits, breakthroughs) and offers them the opportunity to share a
 * portion of that value.
 *
 * Philosophy: "I helped you, share what it's worth - if you want to."
 * Not a gate. Not a fee. An invitation to participate in mutual success.
 */

import {
  THANK_YOU_MESSAGES,
  VALUE_CAPTURE_PROMPTS,
  type ValueEvent,
  type ValueType,
} from '../../types/monetization.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getUserValueCapture, saveValueEvent, type ValueCaptureRecord } from './persistence.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'ValueCapture' });

// ============================================================================
// IN-MEMORY CACHE (backed by Firestore)
// ============================================================================

const valueEventsCache: Map<string, ValueEvent> = new Map();
let totalValueCapturedCents = 0;
let contributionCount = 0;

// ============================================================================
// VALUE DETECTION PATTERNS
// ============================================================================

/**
 * Keywords and patterns that suggest a value event
 */
const VALUE_DETECTION_PATTERNS: Record<ValueType, RegExp[]> = {
  financial_gain: [
    /got (?:a |the )?raise/i,
    /negotiated? (?:a )?\$?\d+/i,
    /salary (?:increase|bump|went up)/i,
    /bonus of \$?\d+/i,
    /closed (?:a |the )?deal/i,
    /new job.{0,20}\$?\d+/i,
    /offer.{0,20}\$?\d+/i,
  ],
  financial_save: [
    /saved? \$?\d+/i,
    /cut (?:my |our )?(?:spending|expenses)/i,
    /cancel(?:ed|led)?.{0,30}subscription/i,
    /didn'?t (?:buy|spend|waste)/i,
    /under budget/i,
    /paid off.{0,20}debt/i,
  ],
  habit_milestone: [
    /\d+ days? (?:in a row|streak)/i,
    /(?:hit|reached) (?:my |a )\d+ day/i,
    /haven'?t missed a day/i,
    /\d+ weeks? straight/i,
    /finally (?:sticking|stuck) (?:with|to)/i,
    /habit is automatic now/i,
  ],
  career_win: [
    /got (?:the |a )?(?:job|offer|promotion)/i,
    /they (?:hired|promoted) me/i,
    /starting (?:my |a )?new (?:job|role|position)/i,
    /interview went (?:great|amazing|well)/i,
    /accepted (?:the |my )?offer/i,
  ],
  relationship_improvement: [
    /(?:had|we had) (?:a )?(?:great|real|deep) (?:conversation|talk)/i,
    /(?:resolved|worked out).{0,20}(?:conflict|argument|fight)/i,
    /finally (?:talked|communicated)/i,
    /relationship.{0,20}(?:better|improved|stronger)/i,
    /apologized? and.{0,20}(?:accepted|forgave)/i,
  ],
  health_improvement: [
    /lost \d+ (?:pounds?|lbs?|kg)/i,
    /sleeping (?:better|through|well)/i,
    /anxiety.{0,20}(?:down|better|manageable|gone)/i,
    /exercis(?:ed|ing).{0,20}\d+.{0,10}(?:days?|weeks?)/i,
    /blood pressure.{0,20}(?:down|normal|better)/i,
    /quit(?:ting)? (?:smoking|drinking)/i,
  ],
  productivity_gain: [
    /finished (?:the |my |a )?(?:project|task)/i,
    /saved?.{0,20}(?:hours?|time)/i,
    /finally (?:done|finished|completed)/i,
    /ahead of (?:schedule|deadline)/i,
    /(?:cleared|conquered).{0,20}(?:inbox|backlog|todo)/i,
  ],
  clarity_moment: [
    /finally (?:know|understand|figured out)/i,
    /(?:it |everything )?(?:clicked|makes sense)/i,
    /i (?:know|realized) what (?:i need|to do)/i,
    /decided to/i,
    /breakthrough/i,
    /aha moment/i,
  ],
  emotional_breakthrough: [
    /(?:first time|finally).{0,20}(?:cried|let myself)/i,
    /(?:processing|processed).{0,20}(?:grief|trauma|loss)/i,
    /let go of/i,
    /forgave (?:myself|them|him|her)/i,
    /healing/i,
    /weight (?:off|lifted)/i,
  ],
};

/**
 * Extract monetary value from text if present
 */
function extractMonetaryValue(text: string): number | undefined {
  const patterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g, // $1,000 or $1000.00
    /(\d{1,3}(?:,\d{3})*) dollars?/gi, // 1000 dollars
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      return Math.round(value * 100); // Convert to cents
    }
  }

  return undefined;
}

// ============================================================================
// VALUE CAPTURE SERVICE
// ============================================================================

/**
 * Detect if a message indicates a value event
 */
export async function detect(params: {
  userId: string;
  message: string;
  conversationId: string;
}): Promise<ValueEvent | null> {
  const { userId, message, conversationId } = params;

  // Check each value type for matches
  for (const [type, patterns] of Object.entries(VALUE_DETECTION_PATTERNS) as [
    ValueType,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        const estimatedValue = extractMonetaryValue(message);

        const event: ValueEvent = {
          id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          userId,
          type,
          description: message.slice(0, 200), // First 200 chars for context
          estimatedValueCents: estimatedValue,
          suggestedContributionCents: estimatedValue
            ? Math.round(estimatedValue * 0.01) // Suggest 1% of quantifiable value
            : undefined,
          contributed: false,
          conversationId,
          createdAt: new Date(),
        };

        // Cache and persist
        valueEventsCache.set(event.id, event);

        const record: ValueCaptureRecord = {
          id: event.id,
          type: event.type,
          estimatedValueCents: event.estimatedValueCents,
          status: 'detected',
          createdAt: event.createdAt.toISOString(),
        };
        await saveValueEvent(userId, record);

        log.info(
          {
            eventId: event.id,
            type,
            estimatedValue: estimatedValue ? `$${estimatedValue / 100}` : 'N/A',
          },
          'Value event detected'
        );

        return event;
      }
    }
  }

  return null;
}

/**
 * Get the value capture prompt for an event
 */
export function getPrompt(event: ValueEvent): string {
  const prompts = VALUE_CAPTURE_PROMPTS[event.type];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

/**
 * Record a contribution for a value event
 */
export async function recordContribution(params: {
  eventId: string;
  amountCents: number;
  stripePaymentId?: string;
}): Promise<ValueEvent> {
  const { eventId, amountCents, stripePaymentId } = params;

  const event = valueEventsCache.get(eventId);
  if (!event) {
    throw new Error('Value event not found');
  }

  event.contributionCents = amountCents;
  event.contributed = true;
  event.contributedAt = new Date();

  // Update totals
  totalValueCapturedCents += amountCents;
  contributionCount++;

  // Persist the update
  const record: ValueCaptureRecord = {
    id: event.id,
    type: event.type,
    estimatedValueCents: event.estimatedValueCents,
    contributionCents: amountCents,
    stripePaymentId,
    status: 'contributed',
    createdAt: event.createdAt.toISOString(),
    contributedAt: event.contributedAt.toISOString(),
  };
  await saveValueEvent(event.userId, record);

  log.info(
    {
      eventId,
      type: event.type,
      amountCents,
      totalValueCapturedCents,
    },
    'Value contribution recorded'
  );

  return event;
}

/**
 * Get a thank you message for value contribution
 */
export function getThankYou(): string {
  const messages = THANK_YOU_MESSAGES.valueCapture;
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get user's value events (for history/display)
 */
export async function getUserEvents(userId: string): Promise<ValueEvent[]> {
  const data = await getUserValueCapture(userId);

  return data.events.map((e) => ({
    id: e.id,
    userId,
    type: e.type as ValueType,
    estimatedValueCents: e.estimatedValueCents,
    suggestedContributionCents: e.estimatedValueCents
      ? Math.round(e.estimatedValueCents * 0.01)
      : undefined,
    contributionCents: e.contributionCents,
    contributed: e.status === 'contributed',
    createdAt: new Date(e.createdAt),
    contributedAt: e.contributedAt ? new Date(e.contributedAt) : undefined,
    conversationId: '',
    description: '',
  }));
}

/**
 * Get value capture statistics
 */
export function getStats(): {
  totalValueCapturedCents: number;
  contributionCount: number;
  averageContributionCents: number;
  eventsByType: Record<ValueType, number>;
} {
  const eventsByType = {} as Record<ValueType, number>;

  for (const event of valueEventsCache.values()) {
    eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
  }

  return {
    totalValueCapturedCents,
    contributionCount,
    averageContributionCents:
      contributionCount > 0 ? Math.round(totalValueCapturedCents / contributionCount) : 0,
    eventsByType,
  };
}

/**
 * Should we show the value capture prompt?
 * Only show if we haven't recently, and the event seems significant
 */
export function shouldShow(params: {
  event: ValueEvent;
  recentValuePromptCount: number;
  conversationTurnCount: number;
}): boolean {
  const { event, recentValuePromptCount, conversationTurnCount } = params;

  // Don't show too often (max 1 per conversation)
  if (recentValuePromptCount > 0) return false;

  // Only show after some back-and-forth (not immediately)
  if (conversationTurnCount < 3) return false;

  // For financial events, always show if value detected
  if (event.estimatedValueCents && event.estimatedValueCents >= 10000) {
    // $100+
    return true;
  }

  // For milestones and breakthroughs, sometimes show
  const significantTypes: ValueType[] = [
    'habit_milestone',
    'career_win',
    'emotional_breakthrough',
    'clarity_moment',
  ];

  if (significantTypes.includes(event.type)) {
    return Math.random() < 0.5; // 50% chance for significant non-monetary wins
  }

  // For others, rarely show
  return Math.random() < 0.2; // 20% chance
}

// ============================================================================
// EXPORTS
// ============================================================================

export const valueCapture = {
  detect,
  getPrompt,
  recordContribution,
  getThankYou,
  getUserEvents,
  getStats,
  shouldShow,
};

export default valueCapture;
