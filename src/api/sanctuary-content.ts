/**
 * Sanctuary content tables.
 *
 * Static data for the Sanctuary routes. These hold translation KEYS (never
 * translated text) so each request can render them in its own locale with
 * tFor(). The English copy lives in src/i18n/locales/en-US.json under
 * `sanctuary.`.
 *
 * @module SanctuaryContent
 */

export type TimeContext = 'morning' | 'afternoon' | 'evening' | 'night';

export const GREETING_KEYS: Record<TimeContext, string> = {
  morning: 'sanctuary.greeting.morning',
  afternoon: 'sanctuary.greeting.afternoon',
  evening: 'sanctuary.greeting.evening',
  night: 'sanctuary.greeting.night',
};

/** Quote text is translated; the author's name is kept as-is (null = no known author). */
export interface QuoteEntry {
  key: string;
  author: string | null;
}

export const INSPIRATIONS: Record<TimeContext, QuoteEntry[]> = {
  morning: [
    { key: 'sanctuary.quotes.morning.getStarted', author: 'Walt Disney' },
    { key: 'sanctuary.quotes.morning.newPotential', author: null },
    { key: 'sanctuary.quotes.morning.wonderfulDay', author: 'Maya Angelou' },
  ],
  afternoon: [
    { key: 'sanctuary.quotes.afternoon.greatWork', author: 'Steve Jobs' },
    { key: 'sanctuary.quotes.afternoon.smallSteps', author: null },
    { key: 'sanctuary.quotes.afternoon.anotherGoal', author: 'C.S. Lewis' },
  ],
  evening: [
    { key: 'sanctuary.quotes.evening.restNotIdleness', author: 'John Lubbock' },
    { key: 'sanctuary.quotes.evening.judgedOnLove', author: 'St. John of the Cross' },
    { key: 'sanctuary.quotes.evening.dailyGifts', author: 'Marcus Aurelius' },
  ],
  night: [
    { key: 'sanctuary.quotes.night.newDay', author: 'L.M. Montgomery' },
    { key: 'sanctuary.quotes.night.bestMeditation', author: 'Dalai Lama' },
    { key: 'sanctuary.quotes.night.betterHalf', author: 'Goethe' },
  ],
};

export const INSIGHT_SOURCE_TITLE_KEYS: Record<string, string> = {
  correlation: 'sanctuary.insights.sources.correlation',
  trajectory: 'sanctuary.insights.sources.trajectory',
  relational: 'sanctuary.insights.sources.relational',
  counterfactual: 'sanctuary.insights.sources.counterfactual',
  growth: 'sanctuary.insights.sources.growth',
  threading: 'sanctuary.insights.sources.threading',
  open_loop: 'sanctuary.insights.sources.openLoop',
  commitment: 'sanctuary.insights.sources.commitment',
  temporal: 'sanctuary.insights.sources.temporal',
  behavioral: 'sanctuary.insights.sources.behavioral',
};

export interface PracticeBase {
  id: string;
  category: 'ground' | 'reflect' | 'connect' | 'grow';
  icon: string;
  tags: string[];
  /** Translation key prefix; holds .name, .description, .duration, .prompt, .reason */
  key: string;
}

export const ALL_PRACTICES: PracticeBase[] = [
  {
    id: 'brainstorm',
    key: 'sanctuary.practices.brainstorm',
    category: 'grow',
    icon: 'lightbulb',
    tags: ['creativity', 'problem-solving', 'clarity'],
  },
  {
    id: 'daily-checkin',
    key: 'sanctuary.practices.dailyCheckin',
    category: 'reflect',
    icon: 'sun',
    tags: ['morning', 'reflection', 'awareness'],
  },
  {
    id: 'gratitude',
    key: 'sanctuary.practices.gratitude',
    category: 'ground',
    icon: 'heart',
    tags: ['gratitude', 'positivity', 'grounding'],
  },
  {
    id: 'wind-down',
    key: 'sanctuary.practices.windDown',
    category: 'ground',
    icon: 'moon',
    tags: ['evening', 'rest', 'closure'],
  },
  {
    id: 'weekly-review',
    key: 'sanctuary.practices.weeklyReview',
    category: 'reflect',
    icon: 'calendar',
    tags: ['weekly', 'progress', 'planning'],
  },
  {
    id: 'breath-focus',
    key: 'sanctuary.practices.breathFocus',
    category: 'ground',
    icon: 'wind',
    tags: ['breathing', 'calm', 'present'],
  },
  {
    id: 'future-letter',
    key: 'sanctuary.practices.futureLetter',
    category: 'grow',
    icon: 'mail',
    tags: ['growth', 'reflection', 'intention'],
  },
  {
    id: 'values-check',
    key: 'sanctuary.practices.valuesCheck',
    category: 'reflect',
    icon: 'compass',
    tags: ['values', 'meaning', 'alignment'],
  },
];
