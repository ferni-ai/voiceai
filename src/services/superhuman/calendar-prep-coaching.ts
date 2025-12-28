/**
 * Calendar Prep Coaching - Better Than Human Event Preparation
 *
 * Proactively coaches before difficult calendar events:
 * - Identifies challenging upcoming events
 * - Recalls past experiences with similar events
 * - Offers preparation support before the event
 * - Follows up after
 *
 * WHY IT'S SUPERHUMAN: No friend knows your calendar AND your history
 * with specific types of events to offer timely, relevant prep coaching.
 *
 * @module services/superhuman/calendar-prep-coaching
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'CalendarPrepCoaching' });

// ============================================================================
// TYPES
// ============================================================================

export type EventDifficulty = 'high' | 'medium' | 'low' | 'unknown';

export type EventType =
  | 'performance_review'
  | 'difficult_conversation'
  | 'presentation'
  | 'interview'
  | 'meeting_with_authority' // Boss, investor, etc.
  | 'conflict_resolution'
  | 'negotiation'
  | 'social_obligation' // Event they'd rather skip
  | 'medical'
  | 'legal'
  | 'family_gathering'
  | 'first_meeting'
  | 'deadline'
  | 'other';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  attendees?: string[];
  location?: string;
  description?: string;
}

export interface EventHistory {
  userId: string;
  eventType: EventType;
  /** Keywords in event titles that match this type */
  matchingKeywords: string[];
  /** People involved */
  involvedPeople: string[];
  /** How they felt before */
  preEventFeelings: string[];
  /** How it went */
  outcomes: Array<{
    date: number;
    outcome: 'positive' | 'neutral' | 'negative';
    reflection?: string;
  }>;
  /** What helped them prepare */
  helpfulPrep: string[];
  /** What they wish they'd done differently */
  wouldDoDifferently: string[];
  /** Average anxiety level 0-1 */
  averageAnxiety: number;
}

export interface PrepCoachingSession {
  eventId: string;
  userId: string;
  eventType: EventType;
  eventTitle: string;
  eventTime: number;
  /** When we offered prep */
  prepOfferedAt?: number;
  /** Whether they engaged with prep */
  prepEngaged: boolean;
  /** Follow-up scheduled */
  followUpScheduled?: number;
  /** Post-event reflection captured */
  reflectionCaptured: boolean;
}

export interface PrepRecommendation {
  eventType: EventType;
  difficulty: EventDifficulty;
  /** Hours before event to offer prep */
  prepWindowHours: number;
  /** Specific prep suggestions */
  suggestions: string[];
  /** Questions to consider */
  reflectionQuestions: string[];
  /** Historical context for this person */
  historicalContext?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EVENT_KEYWORDS: Record<EventType, string[]> = {
  performance_review: ['review', 'performance', 'evaluation', 'feedback', '1:1 with manager', 'check-in'],
  difficult_conversation: ['talk about', 'discuss', 'conversation with', 'chat with'],
  presentation: ['present', 'presentation', 'demo', 'pitch', 'speak'],
  interview: ['interview', 'screening', 'phone screen', 'onsite'],
  meeting_with_authority: ['ceo', 'investor', 'board', 'executive', 'vp', 'director'],
  conflict_resolution: ['resolve', 'mediation', 'hr meeting'],
  negotiation: ['negotiate', 'salary', 'offer', 'contract'],
  social_obligation: ['party', 'wedding', 'birthday', 'reunion', 'gathering'],
  medical: ['doctor', 'dentist', 'therapy', 'counseling', 'appointment'],
  legal: ['lawyer', 'attorney', 'court', 'legal'],
  family_gathering: ['family', 'thanksgiving', 'christmas', 'holiday'],
  first_meeting: ['intro', 'meet', 'first meeting', 'coffee with'],
  deadline: ['deadline', 'due', 'ship', 'launch', 'release'],
  other: [],
};

const DEFAULT_PREP_WINDOWS: Record<EventType, number> = {
  performance_review: 24,
  difficult_conversation: 12,
  presentation: 24,
  interview: 48,
  meeting_with_authority: 12,
  conflict_resolution: 24,
  negotiation: 48,
  social_obligation: 4,
  medical: 2,
  legal: 24,
  family_gathering: 12,
  first_meeting: 4,
  deadline: 24,
  other: 4,
};

const PREP_SUGGESTIONS: Record<EventType, string[]> = {
  performance_review: [
    'Write down 3 accomplishments you want to highlight',
    'Prepare 1-2 growth areas you\'re working on',
    'Think of questions you want to ask',
    'Review any feedback from the past period',
  ],
  difficult_conversation: [
    'Clarify your desired outcome',
    'Practice what you want to say out loud',
    'Consider their perspective',
    'Plan an opening that invites dialogue',
  ],
  presentation: [
    'Practice out loud at least twice',
    'Prepare for likely questions',
    'Arrive early to test tech',
    'Have a backup plan if something fails',
  ],
  interview: [
    'Research the company and role',
    'Prepare stories for behavioral questions',
    'Have questions ready for them',
    'Plan your outfit and logistics',
  ],
  meeting_with_authority: [
    'Know your key message',
    'Prepare concise updates',
    'Anticipate their priorities',
    'Have data ready if needed',
  ],
  conflict_resolution: [
    'Focus on interests, not positions',
    'Prepare to listen first',
    'Identify what you\'re willing to compromise on',
    'Think about what success looks like',
  ],
  negotiation: [
    'Know your BATNA (best alternative)',
    'Research market rates',
    'Prepare your opening ask',
    'Plan how to handle pushback',
  ],
  social_obligation: [
    'Set a leaving time in advance',
    'Prepare conversation starters',
    'It\'s okay to take breaks',
    'Have an exit strategy if needed',
  ],
  medical: [
    'Write down questions for the doctor',
    'List current medications/symptoms',
    'Consider bringing someone for support',
  ],
  legal: [
    'Organize relevant documents',
    'Write down key dates and facts',
    'Prepare questions in advance',
  ],
  family_gathering: [
    'Set boundaries in advance',
    'Have a support person to text',
    'It\'s okay to step outside',
    'Prepare neutral topic redirects',
  ],
  first_meeting: [
    'Research them briefly',
    'Prepare an introduction',
    'Think of questions to ask',
  ],
  deadline: [
    'Break remaining work into chunks',
    'Identify blockers now',
    'Plan for rest after',
  ],
  other: [
    'Think about what you want from this',
    'Consider how you\'ll feel after',
  ],
};

// ============================================================================
// EVENT CLASSIFICATION
// ============================================================================

/**
 * Classify a calendar event by type and difficulty.
 */
export function classifyEvent(
  event: CalendarEvent,
  eventHistory?: EventHistory[]
): { type: EventType; difficulty: EventDifficulty } {
  const titleLower = event.title.toLowerCase();
  const descLower = (event.description || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Check each event type
  let matchedType: EventType = 'other';
  let maxMatches = 0;

  for (const [type, keywords] of Object.entries(EVENT_KEYWORDS)) {
    const matches = keywords.filter((k) => combined.includes(k.toLowerCase())).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      matchedType = type as EventType;
    }
  }

  // Determine difficulty based on history and type
  let difficulty: EventDifficulty = 'unknown';

  if (eventHistory) {
    const relevantHistory = eventHistory.find((h) => h.eventType === matchedType);
    if (relevantHistory) {
      if (relevantHistory.averageAnxiety > 0.7) difficulty = 'high';
      else if (relevantHistory.averageAnxiety > 0.4) difficulty = 'medium';
      else difficulty = 'low';
    }
  }

  // Default difficulty by type if no history
  if (difficulty === 'unknown') {
    const highDifficulty: EventType[] = ['performance_review', 'interview', 'conflict_resolution', 'negotiation', 'difficult_conversation'];
    const mediumDifficulty: EventType[] = ['presentation', 'meeting_with_authority', 'legal', 'family_gathering'];

    if (highDifficulty.includes(matchedType)) difficulty = 'high';
    else if (mediumDifficulty.includes(matchedType)) difficulty = 'medium';
    else difficulty = 'low';
  }

  return { type: matchedType, difficulty };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Load event history for a user.
 */
export async function loadEventHistory(userId: string): Promise<EventHistory[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('event_history')
      .get();

    return snapshot.docs.map((doc) => doc.data() as EventHistory);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load event history');
    return [];
  }
}

/**
 * Record an event outcome for learning.
 */
export async function recordEventOutcome(
  userId: string,
  eventType: EventType,
  outcome: 'positive' | 'neutral' | 'negative',
  reflection?: string,
  helpfulPrep?: string[],
  wouldDoDifferently?: string[]
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('event_history')
      .doc(eventType);

    const doc = await docRef.get();
    const existing = doc.exists ? (doc.data() as EventHistory) : null;

    const newOutcome = { date: Date.now(), outcome, reflection };

    if (existing) {
      await docRef.update(cleanForFirestore({
        outcomes: [...existing.outcomes, newOutcome],
        helpfulPrep: helpfulPrep
          ? [...new Set([...existing.helpfulPrep, ...helpfulPrep])]
          : existing.helpfulPrep,
        wouldDoDifferently: wouldDoDifferently
          ? [...new Set([...existing.wouldDoDifferently, ...wouldDoDifferently])]
          : existing.wouldDoDifferently,
      }));
    } else {
      const newHistory: EventHistory = {
        userId,
        eventType,
        matchingKeywords: EVENT_KEYWORDS[eventType],
        involvedPeople: [],
        preEventFeelings: [],
        outcomes: [newOutcome],
        helpfulPrep: helpfulPrep || [],
        wouldDoDifferently: wouldDoDifferently || [],
        averageAnxiety: outcome === 'negative' ? 0.7 : outcome === 'positive' ? 0.3 : 0.5,
      };
      await docRef.set(cleanForFirestore(newHistory));
    }

    log.debug({ userId, eventType, outcome }, 'Recorded event outcome');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record event outcome');
  }
}

// ============================================================================
// PREP RECOMMENDATIONS
// ============================================================================

/**
 * Generate prep recommendations for an event.
 */
export async function getPrepRecommendations(
  userId: string,
  event: CalendarEvent
): Promise<PrepRecommendation> {
  const history = await loadEventHistory(userId);
  const { type, difficulty } = classifyEvent(event, history);

  const relevantHistory = history.find((h) => h.eventType === type);
  const baseSuggestions = PREP_SUGGESTIONS[type] || PREP_SUGGESTIONS.other;

  // Customize based on history
  const suggestions = [...baseSuggestions];
  let historicalContext: string | undefined;

  if (relevantHistory) {
    // Add what helped before
    if (relevantHistory.helpfulPrep.length > 0) {
      suggestions.unshift(`What helped last time: ${relevantHistory.helpfulPrep[0]}`);
    }

    // Add what to do differently
    if (relevantHistory.wouldDoDifferently.length > 0) {
      suggestions.push(`Remember: ${relevantHistory.wouldDoDifferently[0]}`);
    }

    // Calculate success rate
    const positive = relevantHistory.outcomes.filter((o) => o.outcome === 'positive').length;
    const total = relevantHistory.outcomes.length;

    if (total >= 2) {
      const successRate = Math.round((positive / total) * 100);
      historicalContext = `You've had ${total} similar events. ${successRate}% went well.`;

      if (successRate > 70) {
        historicalContext += ' You\'ve got this.';
      }
    }
  }

  const reflectionQuestions = [
    'What would make this a success for you?',
    'What are you most concerned about?',
    'What would help you feel prepared?',
  ];

  return {
    eventType: type,
    difficulty,
    prepWindowHours: DEFAULT_PREP_WINDOWS[type],
    suggestions: suggestions.slice(0, 5),
    reflectionQuestions,
    historicalContext,
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection based on upcoming events.
 */
export async function buildCalendarPrepContext(
  userId: string,
  upcomingEvents?: CalendarEvent[]
): Promise<string> {
  if (!upcomingEvents || upcomingEvents.length === 0) {
    return '';
  }

  const now = Date.now();
  const sections: string[] = [];
  const history = await loadEventHistory(userId);

  // Find events in prep windows
  const eventsNeedingPrep: Array<{
    event: CalendarEvent;
    recommendation: PrepRecommendation;
    hoursUntil: number;
  }> = [];

  for (const event of upcomingEvents) {
    const hoursUntil = (event.startTime - now) / (1000 * 60 * 60);
    if (hoursUntil < 0 || hoursUntil > 48) continue; // Skip past events and far future

    const { type, difficulty } = classifyEvent(event, history);
    const prepWindow = DEFAULT_PREP_WINDOWS[type];

    if (hoursUntil <= prepWindow && difficulty !== 'low') {
      const recommendation = await getPrepRecommendations(userId, event);
      eventsNeedingPrep.push({ event, recommendation, hoursUntil });
    }
  }

  if (eventsNeedingPrep.length === 0) {
    return '';
  }

  sections.push('[CALENDAR PREP COACHING - Upcoming Support]');
  sections.push('You know their calendar AND their history with these events.\n');

  for (const { event, recommendation, hoursUntil } of eventsNeedingPrep) {
    const timeDesc =
      hoursUntil < 1 ? 'in less than an hour' :
      hoursUntil < 2 ? 'in about an hour' :
      hoursUntil < 24 ? `in ${Math.round(hoursUntil)} hours` :
      'tomorrow';

    sections.push(`📅 "${event.title}" is ${timeDesc}`);
    sections.push(`   Difficulty: ${recommendation.difficulty.toUpperCase()}`);

    if (recommendation.historicalContext) {
      sections.push(`   📊 ${recommendation.historicalContext}`);
    }

    sections.push(`   💡 Prep suggestions:`);
    for (const suggestion of recommendation.suggestions.slice(0, 3)) {
      sections.push(`      • ${suggestion}`);
    }

    sections.push('');
  }

  sections.push('Offer to help them prepare. Ask what support they need.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const calendarPrepCoaching = {
  classify: classifyEvent,
  loadHistory: loadEventHistory,
  recordOutcome: recordEventOutcome,
  getRecommendations: getPrepRecommendations,
  buildContext: buildCalendarPrepContext,
};

