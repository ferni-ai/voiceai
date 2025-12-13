/**
 * Temporal Context Engine
 *
 * > "It's Sunday evening—how are you feeling about the week ahead?"
 *
 * Awareness of life rhythms and temporal context:
 *
 * - **Time of Day**: Adjust tone for morning vs. late night
 * - **Day of Week**: Monday mornings vs. Friday evenings feel different
 * - **Life Rhythms**: Sunday scaries, Monday blues, TGIF energy
 * - **Seasonal Awareness**: Holidays, seasons affecting mood
 * - **Upcoming Events**: Track mentioned events, check in proactively
 * - **Temporal Language**: Use time-appropriate greetings/closings
 *
 * This is what makes Ferni feel like someone who understands YOUR life.
 *
 * @module @ferni/temporal-context
 */

import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'TemporalContext' });

// ============================================================================
// TYPES
// ============================================================================

export type TimeOfDay =
  | 'early_morning'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night';

export type DayType = 'monday' | 'weekday' | 'friday' | 'saturday' | 'sunday';

export type TemporalMood =
  | 'fresh_start' // Monday morning, new year, etc.
  | 'grinding' // Midweek work mode
  | 'anticipation' // Thursday/Friday anticipation
  | 'freedom' // Weekend freedom
  | 'winding_down' // Sunday evening
  | 'reflective' // Late night, end of year
  | 'transition'; // Between states

export interface UpcomingEvent {
  /** What the event is */
  description: string;

  /** When it happens */
  date: Date;

  /** Category */
  category: 'work' | 'personal' | 'social' | 'health' | 'milestone' | 'other';

  /** User's sentiment about it */
  sentiment: 'positive' | 'neutral' | 'anxious' | 'dreading';

  /** Has it been followed up on? */
  followedUp: boolean;

  /** Turn when mentioned */
  mentionedTurn: number;
}

export interface TemporalState {
  /** Current time */
  now: Date;

  /** Time of day */
  timeOfDay: TimeOfDay;

  /** Day type */
  dayType: DayType;

  /** Temporal mood */
  mood: TemporalMood;

  /** Is it late? */
  isLate: boolean;

  /** Days until weekend */
  daysUntilWeekend: number;

  /** Any special context */
  specialContext: string | null;

  /** Upcoming events */
  upcomingEvents: UpcomingEvent[];
}

export interface TemporalGuidance {
  /** Greeting appropriate for time */
  greeting: string | null;

  /** Closing appropriate for time */
  closing: string | null;

  /** Time-aware check-in */
  checkIn: string | null;

  /** Proactive event follow-up */
  eventFollowUp: string | null;

  /** Tone adjustment */
  toneAdjustment: string;

  /** Energy expectation */
  expectedEnergy: 'lower' | 'normal' | 'higher';
}

// ============================================================================
// TEMPORAL PATTERNS
// ============================================================================

/** Life rhythm patterns */
const TEMPORAL_MOODS: Record<
  string,
  Array<{ days: number[]; hours: number[]; mood: TemporalMood }>
> = {
  // Monday morning = fresh start
  fresh_start: [{ days: [1], hours: [5, 6, 7, 8, 9, 10, 11], mood: 'fresh_start' }],
  // Tuesday-Thursday = grinding
  grinding: [
    { days: [2, 3, 4], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17], mood: 'grinding' },
    { days: [1], hours: [12, 13, 14, 15, 16, 17], mood: 'grinding' },
  ],
  // Thursday evening + Friday = anticipation
  anticipation: [
    { days: [4], hours: [17, 18, 19, 20, 21, 22], mood: 'anticipation' },
    {
      days: [5],
      hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      mood: 'anticipation',
    },
  ],
  // Friday evening + Saturday = freedom
  freedom: [
    { days: [5], hours: [18, 19, 20, 21, 22, 23], mood: 'freedom' },
    {
      days: [6],
      hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      mood: 'freedom',
    },
  ],
  // Sunday evening = winding down (the dreaded Sunday scaries)
  winding_down: [{ days: [0], hours: [16, 17, 18, 19, 20, 21, 22, 23], mood: 'winding_down' }],
  // Late nights = reflective
  reflective: [{ days: [0, 1, 2, 3, 4, 5, 6], hours: [23, 0, 1, 2, 3], mood: 'reflective' }],
};

// ============================================================================
// CONTENT
// ============================================================================

const GREETINGS: Record<TimeOfDay, string[]> = {
  early_morning: [
    "You're up early. Everything okay?",
    "Early morning check-in. What's on your mind?",
    'The early hours—sometimes the best time to think.',
  ],
  morning: [
    'Good morning.',
    'Morning. How are you starting your day?',
    'Hey, morning. How are you?',
  ],
  midday: ['Hey there.', "How's your day going?", 'Middle of the day check-in—how are things?'],
  afternoon: [
    'Good afternoon.',
    "Hey. How's your afternoon going?",
    "Afternoon. What's on your mind?",
  ],
  evening: ['Good evening.', 'Evening. How was your day?', 'Hey. Winding down for the day?'],
  night: [
    'Hey, late one tonight?',
    'Burning the midnight oil?',
    "Night owl mode. What's keeping you up?",
  ],
  late_night: [
    "It's late. Everything okay?",
    'Late night thoughts?',
    "Can't sleep, or don't want to?",
  ],
};

const CLOSINGS: Record<TimeOfDay, string[]> = {
  early_morning: ['I hope your day starts well.', 'Have a good day.', "Go get 'em today."],
  morning: ['Have a great day.', 'I hope the rest of your morning goes well.', 'Good luck today.'],
  midday: ['Enjoy the rest of your day.', 'Hope the afternoon treats you well.'],
  afternoon: ['Have a good rest of your day.', 'I hope your evening is nice.'],
  evening: ['Have a good night.', 'Rest well tonight.', 'I hope you sleep well.'],
  night: [
    'Get some rest when you can.',
    'I hope you sleep well.',
    'Take care of yourself tonight.',
  ],
  late_night: [
    'Try to get some rest.',
    "I'll be here whenever you need.",
    'Take care of yourself.',
  ],
};

const DAY_CONTEXT_PHRASES: Record<DayType, Record<TimeOfDay, string[]>> = {
  monday: {
    early_morning: [
      'Monday morning—new week energy?',
      'Monday already. How are you feeling about this week?',
    ],
    morning: ["Monday morning. How's the week starting?", 'Fresh week. Any goals?'],
    midday: ["How's Monday treating you?"],
    afternoon: ['Monday afternoon—surviving?'],
    evening: ["Monday down. How'd it go?"],
    night: ['Monday night. Made it through day one.'],
    late_night: ["Monday's almost over. Rough start to the week?"],
  },
  weekday: {
    early_morning: ['Early start today?'],
    morning: ["How's this morning going?"],
    midday: ["Midday—how's work going?"],
    afternoon: ['Getting through the day okay?'],
    evening: ['How was today?'],
    night: ['How was your day?'],
    late_night: ['Late night midweek—a lot going on?'],
  },
  friday: {
    early_morning: ['Friday! Almost there.'],
    morning: ['Friday morning—the finish line is in sight.'],
    midday: ['Happy Friday. Plans for the weekend?'],
    afternoon: ['Friday afternoon vibes. Almost free.'],
    evening: ['Friday night. What are you up to?', 'The weekend begins!'],
    night: ['Friday night. How are you spending it?'],
    late_night: ['Friday night adventures?'],
  },
  saturday: {
    early_morning: ['Saturday morning. Sleeping in?'],
    morning: ['Good Saturday morning. No obligations I hope?'],
    midday: ["Saturday midday—how's the weekend going?"],
    afternoon: ['Enjoying your Saturday?'],
    evening: ['Saturday evening. Having a good weekend?'],
    night: ["Saturday night. What's happening?"],
    late_night: ['Saturday night owl. Fun plans?'],
  },
  sunday: {
    early_morning: ['Sunday morning—my favorite kind of slow.'],
    morning: ["Lazy Sunday morning? Or up and at 'em?"],
    midday: ['Sunday midday. Hopefully relaxed?'],
    afternoon: ['Sunday afternoon—doing something nice?'],
    evening: [
      'Sunday evening. How are you feeling about the week ahead?',
      'The Sunday feeling... how are you doing?',
    ],
    night: ['Sunday night. Ready for the week?', 'Sunday scaries? Or feeling okay?'],
    late_night: ['Sunday night—trouble sleeping before the week?'],
  },
};

const EVENT_FOLLOW_UPS = {
  approaching: [
    'You mentioned you have {event} coming up {timeframe}. How are you feeling about it?',
    '{event} is {timeframe}, right? How are you doing with that?',
    "I've been thinking about your {event}—{timeframe}. Nervous? Excited?",
  ],
  today: [
    "Today's the day—{event}, right? How are you feeling?",
    'Your {event} is today. Good luck!',
    "Big day—{event}. You've got this.",
  ],
  past: [
    'How did {event} go?',
    "You had {event} recently—how'd it turn out?",
    "I've been curious about {event}. How was it?",
  ],
};

// ============================================================================
// TEMPORAL CONTEXT ENGINE
// ============================================================================

export class TemporalContextEngine {
  private upcomingEvents: UpcomingEvent[] = [];
  private lastCheckInTurn = -10;
  private turnCount = 0;

  constructor() {
    logger.debug('TemporalContextEngine initialized');
  }

  /**
   * Get current temporal state
   */
  getState(now: Date = new Date()): TemporalState {
    const hour = now.getHours();
    const day = now.getDay();

    const timeOfDay = this.getTimeOfDay(hour);
    const dayType = this.getDayType(day);
    const mood = this.getTemporalMood(day, hour);
    const daysUntilWeekend = this.getDaysUntilWeekend(day);
    const specialContext = this.getSpecialContext(now);

    return {
      now,
      timeOfDay,
      dayType,
      mood,
      isLate: hour >= 23 || hour < 5,
      daysUntilWeekend,
      specialContext,
      upcomingEvents: this.upcomingEvents.filter((e) => !e.followedUp),
    };
  }

  /**
   * Get temporal guidance for response
   *
   * @param turnCount - Current turn
   * @param now - Current time
   * @returns Guidance for response
   */
  getGuidance(turnCount: number, now: Date = new Date()): TemporalGuidance {
    this.turnCount = turnCount;
    const state = this.getState(now);

    const guidance: TemporalGuidance = {
      greeting: null,
      closing: null,
      checkIn: null,
      eventFollowUp: null,
      toneAdjustment: this.getToneAdjustment(state),
      expectedEnergy: this.getExpectedEnergy(state),
    };

    // Greeting only on turn 1
    if (turnCount === 1) {
      guidance.greeting = this.getGreeting(state);
    }

    // Time-contextual check-in
    if (turnCount <= 3 && turnCount - this.lastCheckInTurn >= 2) {
      guidance.checkIn = this.getContextualCheckIn(state);
      this.lastCheckInTurn = turnCount;
    }

    // Event follow-up
    const eventFollowUp = this.getEventFollowUp(now);
    if (eventFollowUp && turnCount > 1) {
      guidance.eventFollowUp = eventFollowUp;
    }

    return guidance;
  }

  /**
   * Get a closing appropriate for time
   */
  getClosing(now: Date = new Date()): string {
    const state = this.getState(now);
    const closings = CLOSINGS[state.timeOfDay];
    return closings[Math.floor(Math.random() * closings.length)];
  }

  /**
   * Record an upcoming event mentioned by user
   */
  recordEvent(
    description: string,
    date: Date,
    category: UpcomingEvent['category'],
    sentiment: UpcomingEvent['sentiment'],
    turnCount: number
  ): void {
    // Check for duplicate
    const existing = this.upcomingEvents.find(
      (e) => e.description.toLowerCase() === description.toLowerCase()
    );

    if (!existing) {
      this.upcomingEvents.push({
        description,
        date,
        category,
        sentiment,
        followedUp: false,
        mentionedTurn: turnCount,
      });

      logger.debug({ description, date, sentiment }, 'Event recorded');
    }
  }

  /**
   * Extract events from user message
   */
  extractEvents(message: string, turnCount: number): UpcomingEvent[] {
    const extracted: UpcomingEvent[] = [];
    const now = new Date();

    // Patterns for upcoming events
    const patterns = [
      {
        pattern: /i have (?:a |an |my )?(.+?) (tomorrow|today|next week|this week)/i,
        timeframe: 1,
      },
      {
        pattern:
          /(?:interview|meeting|appointment|date|exam|test|deadline|presentation) (?:is |on )?(.+)/i,
        timeframe: 1,
      },
      {
        pattern:
          /(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday) i (?:have|'ve got) (.+)/i,
        timeframe: 0,
      },
    ];

    for (const { pattern } of patterns) {
      const match = pattern.exec(message);
      if (match) {
        const description = match[1]?.trim();
        if (description && description.length > 3) {
          // Estimate date
          const date = this.estimateDate(message, now);

          // Estimate sentiment
          const sentiment = this.estimateSentiment(message);

          // Categorize
          const category = this.categorizeEvent(description);

          const event: UpcomingEvent = {
            description,
            date,
            category,
            sentiment,
            followedUp: false,
            mentionedTurn: turnCount,
          };

          extracted.push(event);
          this.upcomingEvents.push(event);
        }
      }
    }

    return extracted;
  }

  /**
   * Mark event as followed up
   */
  markEventFollowedUp(description: string): void {
    const event = this.upcomingEvents.find(
      (e) => e.description.toLowerCase() === description.toLowerCase()
    );
    if (event) {
      event.followedUp = true;
    }
  }

  /**
   * Get all events
   */
  getEvents(): UpcomingEvent[] {
    return [...this.upcomingEvents];
  }

  /**
   * Reset for new session (keeps events)
   */
  resetSession(): void {
    this.lastCheckInTurn = -10;
    this.turnCount = 0;
    logger.debug('TemporalContextEngine session reset');
  }

  /**
   * Full reset
   */
  reset(): void {
    this.upcomingEvents = [];
    this.lastCheckInTurn = -10;
    this.turnCount = 0;
    logger.debug('TemporalContextEngine fully reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getTimeOfDay(hour: number): TimeOfDay {
    if (hour >= 5 && hour < 7) return 'early_morning';
    if (hour >= 7 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'midday';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 21) return 'evening';
    if (hour >= 21 && hour < 24) return 'night';
    return 'late_night';
  }

  private getDayType(day: number): DayType {
    if (day === 1) return 'monday';
    if (day === 5) return 'friday';
    if (day === 6) return 'saturday';
    if (day === 0) return 'sunday';
    return 'weekday';
  }

  private getTemporalMood(day: number, hour: number): TemporalMood {
    for (const [, patterns] of Object.entries(TEMPORAL_MOODS)) {
      for (const pattern of patterns) {
        if (pattern.days.includes(day) && pattern.hours.includes(hour)) {
          return pattern.mood;
        }
      }
    }
    return 'transition';
  }

  private getDaysUntilWeekend(day: number): number {
    if (day === 0) return 0; // Sunday
    if (day === 6) return 0; // Saturday
    return 6 - day; // Days until Saturday
  }

  private getSpecialContext(now: Date): string | null {
    const month = now.getMonth();
    const date = now.getDate();

    // Holiday awareness
    if (month === 11 && date >= 20) return 'holiday_season';
    if (month === 0 && date <= 3) return 'new_year';
    if (month === 1 && date === 14) return 'valentines';

    // Season awareness
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    if (month === 11 || month <= 1) return 'winter';

    return null;
  }

  private getGreeting(state: TemporalState): string {
    const greetings = GREETINGS[state.timeOfDay];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private getContextualCheckIn(state: TemporalState): string | null {
    const dayPhrases = DAY_CONTEXT_PHRASES[state.dayType];
    if (!dayPhrases) return null;

    const timePhrases = dayPhrases[state.timeOfDay];
    if (!timePhrases || timePhrases.length === 0) return null;

    return timePhrases[Math.floor(Math.random() * timePhrases.length)];
  }

  private getToneAdjustment(state: TemporalState): string {
    switch (state.mood) {
      case 'fresh_start':
        return 'Energetic, optimistic, forward-looking';
      case 'grinding':
        return 'Supportive, steady, efficient';
      case 'anticipation':
        return 'Lighter, excited energy';
      case 'freedom':
        return 'Relaxed, casual, warm';
      case 'winding_down':
        return 'Gentle, understanding, possibly addressing anxiety';
      case 'reflective':
        return 'Quiet, thoughtful, deeper';
      default:
        return 'Adaptive';
    }
  }

  private getExpectedEnergy(state: TemporalState): 'lower' | 'normal' | 'higher' {
    if (state.isLate) return 'lower';
    if (state.timeOfDay === 'early_morning') return 'lower';
    if (state.mood === 'freedom' || state.mood === 'anticipation') return 'higher';
    if (state.mood === 'winding_down') return 'lower';
    return 'normal';
  }

  private getEventFollowUp(now: Date): string | null {
    const unfollowedEvents = this.upcomingEvents.filter((e) => !e.followedUp);
    if (unfollowedEvents.length === 0) return null;

    for (const event of unfollowedEvents) {
      const daysUntil = Math.floor((event.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let templates: string[];
      let timeframe: string;

      if (daysUntil < 0) {
        // Past event
        templates = EVENT_FOLLOW_UPS.past;
        timeframe = '';
      } else if (daysUntil === 0) {
        // Today
        templates = EVENT_FOLLOW_UPS.today;
        timeframe = 'today';
      } else if (daysUntil === 1) {
        templates = EVENT_FOLLOW_UPS.approaching;
        timeframe = 'tomorrow';
      } else if (daysUntil <= 7) {
        templates = EVENT_FOLLOW_UPS.approaching;
        timeframe = `in ${daysUntil} days`;
      } else {
        continue; // Too far out
      }

      const template = templates[Math.floor(Math.random() * templates.length)];
      event.followedUp = true;

      return template.replace('{event}', event.description).replace('{timeframe}', timeframe);
    }

    return null;
  }

  private estimateDate(message: string, now: Date): Date {
    const lower = message.toLowerCase();
    const date = new Date(now);

    if (/today/.test(lower)) {
      return date;
    }
    if (/tomorrow/.test(lower)) {
      date.setDate(date.getDate() + 1);
      return date;
    }
    if (/next week/.test(lower)) {
      date.setDate(date.getDate() + 7);
      return date;
    }
    if (/this week/.test(lower)) {
      date.setDate(date.getDate() + 3);
      return date;
    }

    // Day of week
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const currentDay = now.getDay();
        let daysUntil = i - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        date.setDate(date.getDate() + daysUntil);
        return date;
      }
    }

    // Default: assume this week
    date.setDate(date.getDate() + 3);
    return date;
  }

  private estimateSentiment(message: string): UpcomingEvent['sentiment'] {
    const lower = message.toLowerCase();

    if (/(excited|looking forward|can't wait|pumped)/i.test(lower)) return 'positive';
    if (/(nervous|anxious|worried|scared|stressed)/i.test(lower)) return 'anxious';
    if (/(dreading|hate|don't want|ugh)/i.test(lower)) return 'dreading';

    return 'neutral';
  }

  private categorizeEvent(description: string): UpcomingEvent['category'] {
    const lower = description.toLowerCase();

    if (/(interview|meeting|presentation|deadline|work|boss|client)/i.test(lower)) return 'work';
    if (/(doctor|dentist|therapy|appointment|health)/i.test(lower)) return 'health';
    if (/(party|dinner|date|friend|wedding|birthday)/i.test(lower)) return 'social';
    if (/(anniversary|graduation|birthday|milestone)/i.test(lower)) return 'milestone';
    if (/(family|mom|dad|brother|sister|kid)/i.test(lower)) return 'personal';

    return 'other';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../utils/session-registry.js';

const temporalContextRegistry = createSessionRegistry(
  (userId: string) => new TemporalContextEngine(),
  { name: 'TemporalContext', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(temporalContextRegistry);

export function getTemporalContextEngine(userId: string): TemporalContextEngine {
  return temporalContextRegistry.get(userId);
}

export function resetTemporalContextEngine(userId: string): void {
  const engine = temporalContextRegistry.get(userId);
  engine.reset();
}

export function clearTemporalContextEngine(userId: string): void {
  temporalContextRegistry.reset(userId);
}

export function getActiveTemporalContextCount(): number {
  return temporalContextRegistry.getActiveCount();
}

export default TemporalContextEngine;
