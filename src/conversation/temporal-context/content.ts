/**
 * Temporal Content
 *
 * Greetings, closings, and context-aware phrases.
 *
 * @module @ferni/conversation/temporal-context/content
 */

import type { DayType, TemporalMood, TimeOfDay } from './types.js';

// ============================================================================
// TEMPORAL MOODS
// ============================================================================

export const TEMPORAL_MOODS: Record<
  string,
  Array<{ days: number[]; hours: number[]; mood: TemporalMood }>
> = {
  fresh_start: [{ days: [1], hours: [5, 6, 7, 8, 9, 10, 11], mood: 'fresh_start' }],
  grinding: [
    { days: [2, 3, 4], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17], mood: 'grinding' },
    { days: [1], hours: [12, 13, 14, 15, 16, 17], mood: 'grinding' },
  ],
  anticipation: [
    { days: [4], hours: [17, 18, 19, 20, 21, 22], mood: 'anticipation' },
    {
      days: [5],
      hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      mood: 'anticipation',
    },
  ],
  freedom: [
    { days: [5], hours: [18, 19, 20, 21, 22, 23], mood: 'freedom' },
    {
      days: [6],
      hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      mood: 'freedom',
    },
  ],
  winding_down: [{ days: [0], hours: [16, 17, 18, 19, 20, 21, 22, 23], mood: 'winding_down' }],
  reflective: [{ days: [0, 1, 2, 3, 4, 5, 6], hours: [23, 0, 1, 2, 3], mood: 'reflective' }],
};

// ============================================================================
// GREETINGS
// ============================================================================

export const GREETINGS: Record<TimeOfDay, string[]> = {
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

// ============================================================================
// CLOSINGS
// ============================================================================

export const CLOSINGS: Record<TimeOfDay, string[]> = {
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

// ============================================================================
// DAY CONTEXT PHRASES
// ============================================================================

export const DAY_CONTEXT_PHRASES: Record<DayType, Record<TimeOfDay, string[]>> = {
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

// ============================================================================
// EVENT FOLLOW-UPS
// ============================================================================

export const EVENT_FOLLOW_UPS = {
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
