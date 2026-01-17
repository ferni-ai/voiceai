/**
 * Life Event Detection & Tracking
 *
 * Detects and remembers important dates and life events mentioned
 * in conversations, enabling proactive, thoughtful check-ins.
 *
 * Philosophy: A good friend remembers what's coming up in your life
 * and checks in at the right moments.
 *
 * Event Types:
 * - Deadlines (work projects, applications)
 * - Appointments (doctor, interviews)
 * - Milestones (birthdays, anniversaries)
 * - Events (travel, presentations, parties)
 * - Recurring (weekly meetings, monthly reviews)
 *
 * @module LifeEvents
 */

import { createLogger } from '../../utils/safe-logger.js';
import { indexLifeEvent } from '../data-layer/integrations/trust-integration.js';

const log = createLogger({ module: 'LifeEvents' });

// ============================================================================
// TYPES
// ============================================================================

export type EventType =
  | 'deadline'
  | 'appointment'
  | 'milestone'
  | 'event'
  | 'recurring'
  | 'travel'
  | 'health'
  | 'work'
  | 'personal'
  | 'interview';

export type EventSentiment =
  | 'excited'
  | 'nervous'
  | 'dreading'
  | 'neutral'
  | 'hopeful'
  | 'uncertain';

export interface LifeEvent {
  id: string;
  userId: string;
  description: string;
  date: Date;
  endDate?: Date; // For multi-day events
  type: EventType;
  sentiment?: EventSentiment;
  importance: 'high' | 'medium' | 'low';
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    nextOccurrence?: Date;
  };
  context: {
    mentionedAt: Date;
    originalText: string;
    topic?: string;
  };
  followUp: {
    beforeReminder: boolean;
    afterCheckIn: boolean;
    reminderSent?: Date;
    checkInSent?: Date;
    outcome?: 'positive' | 'negative' | 'neutral' | 'unknown';
  };
  relatedPeople?: string[];
  tags: string[];
}

export interface EventDetectionResult {
  detected: boolean;
  event?: Partial<LifeEvent>;
  confidence: number;
  signals: string[];
}

export interface UpcomingEventSummary {
  today: LifeEvent[];
  thisWeek: LifeEvent[];
  nextWeek: LifeEvent[];
  thisMonth: LifeEvent[];
}

// ============================================================================
// PATTERNS FOR DETECTION
// ============================================================================

const DATE_PATTERNS = {
  // Explicit dates
  explicit:
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\b/gi,
  numeric: /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g,

  // Relative dates
  tomorrow: /\btomorrow\b/i,
  nextWeek: /\bnext\s+week\b/i,
  nextMonth: /\bnext\s+month\b/i,
  thisWeekend: /\bthis\s+weekend\b/i,
  inDays: /\bin\s+(\d+)\s+days?\b/i,
  inWeeks: /\bin\s+(\d+)\s+weeks?\b/i,

  // Day of week
  dayOfWeek: /\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
};

const EVENT_INDICATORS = {
  deadline: [
    /\bdue\s+(date|by)\b/i,
    /\bdeadline\b/i,
    /\bsubmit\s+by\b/i,
    /\bhave\s+to\s+(finish|complete)\s+by\b/i,
    /\bneeds?\s+to\s+be\s+done\b/i,
  ],
  appointment: [
    /\bappointment\b/i,
    /\bmeeting\s+with\b/i,
    /\bscheduled\s+(for|at)\b/i,
    /\bgoing\s+to\s+see\b/i,
    /\b(doctor|dentist|therapist)\b/i,
  ],
  interview: [
    /\binterview\b/i,
    /\bjob\s+(interview|opportunity)\b/i,
    /\bmeeting\s+with\s+(hiring|hr)\b/i,
  ],
  travel: [
    /\b(flying|flight)\s+(to|out)\b/i,
    /\btrip\s+to\b/i,
    /\btraveling\s+to\b/i,
    /\bgoing\s+on\s+vacation\b/i,
    /\bleaving\s+for\b/i,
  ],
  presentation: [
    /\b(presentation|presenting)\b/i,
    /\bspeaking\s+at\b/i,
    /\bpitch(ing)?\s+(to|meeting)\b/i,
    /\bdemo(ing)?\b/i,
  ],
  milestone: [/\bbirthday\b/i, /\banniversary\b/i, /\bgraduation\b/i, /\bwedding\b/i],
  health: [/\bsurgery\b/i, /\bprocedure\b/i, /\btest\s+results?\b/i, /\bcheck[-\s]?up\b/i],
};

const SENTIMENT_INDICATORS: Record<EventSentiment, RegExp[]> = {
  excited: [/\bexcited\b/i, /\bcan't\s+wait\b/i, /\blooking\s+forward\b/i, /\bpumped\b/i],
  nervous: [/\bnervous\b/i, /\banxious\b/i, /\bworried\b/i, /\bstressed\b/i],
  dreading: [/\bdreading\b/i, /\bdon't\s+want\s+to\b/i, /\bnot\s+looking\s+forward\b/i],
  hopeful: [/\bhopeful\b/i, /\bhope\s+it\b/i, /\bfingers\s+crossed\b/i],
  uncertain: [/\bnot\s+sure\b/i, /\buncertain\b/i, /\bwe'll\s+see\b/i],
  neutral: [],
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const userEvents = new Map<string, LifeEvent[]>();

// ============================================================================
// EVENT DETECTION
// ============================================================================

/**
 * Detect life events mentioned in user text
 */
export function detectLifeEvents(
  userId: string,
  text: string,
  context?: { topic?: string; emotion?: string }
): EventDetectionResult[] {
  const results: EventDetectionResult[] = [];
  const signals: string[] = [];

  // Check for date mentions
  const dateInfo = extractDateFromText(text);
  if (!dateInfo.found) {
    return results; // No date = no event to track
  }

  signals.push(`Date detected: ${dateInfo.dateString}`);

  // Detect event type
  const eventType = detectEventType(text);
  if (eventType) {
    signals.push(`Event type: ${eventType}`);
  }

  // Detect sentiment
  const sentiment = detectSentiment(text);
  if (sentiment !== 'neutral') {
    signals.push(`Sentiment: ${sentiment}`);
  }

  // Extract description
  const description = extractEventDescription(text, eventType);

  // Determine importance
  const importance = determineImportance(eventType, sentiment, text);

  // Only create event if we have enough info
  if (dateInfo.date && description) {
    const event: Partial<LifeEvent> = {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      description,
      date: dateInfo.date,
      type: eventType || 'event',
      sentiment,
      importance,
      context: {
        mentionedAt: new Date(),
        originalText: text,
        topic: context?.topic,
      },
      followUp: {
        beforeReminder: importance !== 'low',
        afterCheckIn: true,
      },
      tags: extractTags(text),
    };

    results.push({
      detected: true,
      event,
      confidence: calculateConfidence(dateInfo, eventType, description),
      signals,
    });
  }

  return results;
}

/**
 * Extract date information from text
 */
function extractDateFromText(text: string): {
  found: boolean;
  date?: Date;
  dateString?: string;
} {
  const now = new Date();

  // Check for relative dates first
  if (DATE_PATTERNS.tomorrow.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return { found: true, date, dateString: 'tomorrow' };
  }

  if (DATE_PATTERNS.thisWeekend.test(text)) {
    const date = new Date(now);
    const dayOfWeek = date.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilSaturday);
    return { found: true, date, dateString: 'this weekend' };
  }

  if (DATE_PATTERNS.nextWeek.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    return { found: true, date, dateString: 'next week' };
  }

  if (DATE_PATTERNS.nextMonth.test(text)) {
    const date = new Date(now);
    date.setMonth(date.getMonth() + 1);
    return { found: true, date, dateString: 'next month' };
  }

  // Check "in X days"
  const inDaysMatch = text.match(DATE_PATTERNS.inDays);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return { found: true, date, dateString: `in ${days} days` };
  }

  // Check "in X weeks"
  const inWeeksMatch = text.match(DATE_PATTERNS.inWeeks);
  if (inWeeksMatch) {
    const weeks = parseInt(inWeeksMatch[1], 10);
    const date = new Date(now);
    date.setDate(date.getDate() + weeks * 7);
    return { found: true, date, dateString: `in ${weeks} weeks` };
  }

  // Check day of week
  const dayMatch = text.match(DATE_PATTERNS.dayOfWeek);
  if (dayMatch) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayMatch[2].toLowerCase());
    if (targetDay >= 0) {
      const date = new Date(now);
      const currentDay = date.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0 || dayMatch[1]) {
        daysToAdd += 7; // Next week
      }
      date.setDate(date.getDate() + daysToAdd);
      return { found: true, date, dateString: dayMatch[0] };
    }
  }

  // Check explicit dates
  const explicitMatch = text.match(DATE_PATTERNS.explicit);
  if (explicitMatch) {
    const parsed = new Date(explicitMatch[0]);
    if (!isNaN(parsed.getTime())) {
      return { found: true, date: parsed, dateString: explicitMatch[0] };
    }
  }

  return { found: false };
}

/**
 * Detect event type from text
 */
function detectEventType(text: string): EventType | null {
  for (const [type, patterns] of Object.entries(EVENT_INDICATORS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return type as EventType;
      }
    }
  }
  return null;
}

/**
 * Detect sentiment about the event
 */
function detectSentiment(text: string): EventSentiment {
  for (const [sentiment, patterns] of Object.entries(SENTIMENT_INDICATORS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return sentiment as EventSentiment;
      }
    }
  }
  return 'neutral';
}

/**
 * Extract event description
 */
function extractEventDescription(text: string, eventType: EventType | null): string {
  // Try to extract the key part
  // This is a simplified extraction - in production, use NLP

  // Remove filler words and clean up
  let description = text
    .replace(/\b(i|i'm|i've|got|have|my|the|a|an|to|so|um|uh|like|yeah|well)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Limit length
  if (description.length > 100) {
    description = `${description.slice(0, 100)}...`;
  }

  return description || `${eventType || 'event'} coming up`;
}

/**
 * Determine importance of event
 */
function determineImportance(
  type: EventType | null,
  sentiment: EventSentiment,
  text: string
): 'high' | 'medium' | 'low' {
  // High importance events
  const highTypes: EventType[] = ['health', 'milestone', 'deadline'];
  if (type && highTypes.includes(type)) return 'high';

  // High importance sentiments
  if (sentiment === 'nervous' || sentiment === 'dreading') return 'high';
  if (sentiment === 'excited') return 'medium';

  // Check for importance keywords
  if (/\b(important|big|major|crucial|critical)\b/i.test(text)) return 'high';

  // Interview is always high
  if (/\binterview\b/i.test(text)) return 'high';

  return 'medium';
}

/**
 * Extract tags from text
 */
function extractTags(text: string): string[] {
  const tags: string[] = [];

  if (/\bwork\b/i.test(text)) tags.push('work');
  if (/\b(family|mom|dad|parent|sibling|brother|sister)\b/i.test(text)) tags.push('family');
  if (/\b(friend|buddy|pal)\b/i.test(text)) tags.push('friends');
  if (/\b(health|doctor|medical)\b/i.test(text)) tags.push('health');
  if (/\b(money|financial|pay|bill)\b/i.test(text)) tags.push('financial');

  return tags;
}

/**
 * Calculate confidence in detection
 */
function calculateConfidence(
  dateInfo: { found: boolean; date?: Date },
  eventType: EventType | null,
  description: string
): number {
  let confidence = 0.5; // Base

  if (dateInfo.date) confidence += 0.2;
  if (eventType) confidence += 0.2;
  if (description.length > 20) confidence += 0.1;

  return Math.min(1, confidence);
}

// ============================================================================
// EVENT MANAGEMENT
// ============================================================================

/**
 * Save a detected event
 */
export function saveEvent(event: LifeEvent): void {
  const events = userEvents.get(event.userId) || [];
  events.push(event);
  userEvents.set(event.userId, events);

  // Index to semantic memory
  indexLifeEvent(event.userId, {
    id: event.id,
    event: event.description,
    date: event.date.toISOString().split('T')[0],
    significance: event.importance,
  });

  log.info(
    {
      userId: event.userId,
      eventId: event.id,
      type: event.type,
      date: event.date,
    },
    '📅 Life event saved'
  );
}

/**
 * Get upcoming events for a user
 */
export function getUpcomingEvents(userId: string): UpcomingEventSummary {
  const events = userEvents.get(userId) || [];
  const now = new Date();

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const endOfNextWeek = new Date(now);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 14);

  const endOfMonth = new Date(now);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);

  return {
    today: events.filter((e) => e.date >= now && e.date <= endOfToday),
    thisWeek: events.filter((e) => e.date > endOfToday && e.date <= endOfWeek),
    nextWeek: events.filter((e) => e.date > endOfWeek && e.date <= endOfNextWeek),
    thisMonth: events.filter((e) => e.date > endOfNextWeek && e.date <= endOfMonth),
  };
}

/**
 * Get events needing reminders
 */
export function getEventsNeedingReminders(userId: string): LifeEvent[] {
  const events = userEvents.get(userId) || [];
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return events.filter((e) => {
    if (!e.followUp.beforeReminder) return false;
    if (e.followUp.reminderSent) return false;
    if (e.date < now) return false;

    // Remind 1 day before for most events
    const reminderThreshold = new Date(e.date);
    reminderThreshold.setDate(reminderThreshold.getDate() - 1);

    return now >= reminderThreshold;
  });
}

/**
 * Get events needing follow-up
 */
export function getEventsNeedingFollowUp(userId: string): LifeEvent[] {
  const events = userEvents.get(userId) || [];
  const now = new Date();

  return events.filter((e) => {
    if (!e.followUp.afterCheckIn) return false;
    if (e.followUp.checkInSent) return false;
    if (e.followUp.outcome) return false; // Already know outcome

    // Follow up 1-3 days after event
    const followUpStart = new Date(e.date);
    followUpStart.setDate(followUpStart.getDate() + 1);

    const followUpEnd = new Date(e.date);
    followUpEnd.setDate(followUpEnd.getDate() + 3);

    return now >= followUpStart && now <= followUpEnd;
  });
}

/**
 * Record event outcome
 */
export function recordEventOutcome(
  userId: string,
  eventId: string,
  outcome: 'positive' | 'negative' | 'neutral' | 'unknown'
): void {
  const events = userEvents.get(userId);
  if (!events) return;

  const event = events.find((e) => e.id === eventId);
  if (event) {
    event.followUp.outcome = outcome;
    log.debug({ userId, eventId, outcome }, '📝 Event outcome recorded');
  }
}

/**
 * Mark reminder sent
 */
export function markReminderSent(userId: string, eventId: string): void {
  const events = userEvents.get(userId);
  if (!events) return;

  const event = events.find((e) => e.id === eventId);
  if (event) {
    event.followUp.reminderSent = new Date();
  }
}

/**
 * Mark check-in sent
 */
export function markCheckInSent(userId: string, eventId: string): void {
  const events = userEvents.get(userId);
  if (!events) return;

  const event = events.find((e) => e.id === eventId);
  if (event) {
    event.followUp.checkInSent = new Date();
  }
}

/**
 * Generate reminder message for an event
 */
export function generateReminderMessage(event: LifeEvent): string {
  const messages: Record<EventSentiment, string[]> = {
    excited: [
      `${event.description} is coming up! How are you feeling about it?`,
      `Big day approaching - ${event.description}! You must be excited.`,
    ],
    nervous: [
      `I know ${event.description} is coming up. How are you doing with that?`,
      `${event.description} is almost here. I've been thinking about you.`,
    ],
    dreading: [
      `${event.description} is coming up. I'm here if you want to talk through it.`,
      `Hey, ${event.description} is soon. How can I support you?`,
    ],
    hopeful: [
      `${event.description} is almost here! Fingers crossed for you.`,
      `Thinking of you with ${event.description} coming up.`,
    ],
    uncertain: [
      `${event.description} is approaching. How are you feeling about it?`,
      `With ${event.description} coming up, what's on your mind?`,
    ],
    neutral: [
      `Just a heads up - ${event.description} is coming up.`,
      `${event.description} is soon! Ready for it?`,
    ],
  };

  const sentiment = event.sentiment || 'neutral';
  const options = messages[sentiment];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate follow-up message for an event
 */
export function generateFollowUpMessage(event: LifeEvent): string {
  const messages: Record<EventType, string[]> = {
    deadline: [
      `How did ${event.description} go? Did you hit it?`,
      `${event.description} was recently - how'd it turn out?`,
    ],
    appointment: [
      `How was ${event.description}?`,
      `I've been wondering how ${event.description} went.`,
    ],
    milestone: [`Hope ${event.description} was wonderful!`, `Tell me about ${event.description}!`],
    event: [`How was ${event.description}?`, `${event.description} was recently - how'd it go?`],
    travel: [`How was your trip?`, `Welcome back! How was ${event.description}?`],
    health: [
      `How did ${event.description} go? Everything okay?`,
      `Thinking of you after ${event.description}.`,
    ],
    work: [
      `How did ${event.description} go?`,
      `${event.description} was recently - how'd it turn out?`,
    ],
    personal: [`How did ${event.description} go?`, `Tell me about ${event.description}!`],
    recurring: [
      `How was ${event.description} this time?`,
      `Another ${event.description} done - how was it?`,
    ],
    interview: [
      `How did the interview go? I'm dying to know!`,
      `Tell me about your interview - how did it go?`,
    ],
  };

  const options = messages[event.type] || messages.event;
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectLifeEvents,
  saveEvent,
  getUpcomingEvents,
  getEventsNeedingReminders,
  getEventsNeedingFollowUp,
  recordEventOutcome,
  markReminderSent,
  markCheckInSent,
  generateReminderMessage,
  generateFollowUpMessage,
};
