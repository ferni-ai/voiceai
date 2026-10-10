/**
 * Practice View copy
 *
 * Builds the user-facing text the practice view API returns. Tables hold i18n
 * keys; text is rendered with tFor() for the requesting locale at response time.
 *
 * @module api/routes/practice-view-copy
 */

import { tFor, type SupportedLocale } from '../../i18n/index.js';

export const PERSONA_NAME = {
  ferni: 'Ferni',
  maya: 'Maya',
  peter: 'Peter',
  alex: 'Alex',
  jordan: 'Jordan',
  nayan: 'Nayan',
} as const;
export type PersonaId = keyof typeof PERSONA_NAME;

const ATTRIBUTION_KEY = {
  notes: 'practiceView.attribution.notes',
  suggests: 'practiceView.attribution.suggests',
  notices: 'practiceView.attribution.notices',
  reflects: 'practiceView.attribution.reflects',
  tracks: 'practiceView.attribution.tracks',
  found: 'practiceView.attribution.found',
} as const;
export type Attribution = keyof typeof ATTRIBUTION_KEY;

/** "Peter found" style label; the client uppercases it in CSS. */
export function attribute(locale: SupportedLocale, persona: PersonaId, verb: Attribution): string {
  return tFor(locale, ATTRIBUTION_KEY[verb], { persona: PERSONA_NAME[persona] });
}

/** Event titles are matched on these (English) keywords to pick a note. */
const EVENT_CONTEXT_RULES: ReadonlyArray<{
  words: string[];
  persona: PersonaId;
  verb?: Attribution;
  key: string;
}> = [
  {
    words: ['meeting', 'sync', '1:1', 'standup'],
    persona: 'jordan',
    verb: 'suggests',
    key: 'practiceView.eventContext.meeting',
  },
  {
    words: ['doctor', 'therapy', 'gym', 'yoga', 'workout'],
    persona: 'maya',
    verb: 'notices',
    key: 'practiceView.eventContext.wellness',
  },
  {
    words: ['class', 'workshop', 'lesson', 'course'],
    persona: 'nayan',
    verb: 'reflects',
    key: 'practiceView.eventContext.learning',
  },
  {
    words: ['party', 'celebration', 'birthday'],
    persona: 'ferni',
    key: 'practiceView.eventContext.social',
  },
];

const CATEGORY_ATTRIBUTION: Record<string, [PersonaId, Attribution]> = {
  health: ['maya', 'notices'],
  wellness: ['maya', 'notices'],
  work: ['jordan', 'suggests'],
  career: ['jordan', 'suggests'],
  relationship: ['alex', 'notes'],
  family: ['alex', 'notes'],
  growth: ['nayan', 'reflects'],
  learning: ['nayan', 'reflects'],
  research: ['peter', 'found'],
  finance: ['peter', 'found'],
};

/** Monday-Friday day insights, indexed by Date.getDay(). */
const WEEKDAY_INSIGHT: Record<number, { key: string; persona?: PersonaId }> = {
  1: { key: 'practiceView.dayInsight.freshStart', persona: 'jordan' },
  2: { key: 'practiceView.dayInsight.buildMomentum', persona: 'maya' },
  3: { key: 'practiceView.dayInsight.midWeek', persona: 'ferni' },
  4: { key: 'practiceView.dayInsight.almostThere', persona: 'jordan' },
  5: { key: 'practiceView.dayInsight.windDown', persona: 'maya' },
};

export function weekdayName(locale: SupportedLocale, date: Date, width: 'long' | 'short'): string {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(date);
}

/**
 * Generate emotional context for an event based on its title/content
 */
export function generateEventEmotionalContext(
  title: string,
  locale: SupportedLocale
): { persona: string; insight: string } | undefined {
  const lowerTitle = title.toLowerCase();
  const rule = EVENT_CONTEXT_RULES.find(({ words }) => words.some((w) => lowerTitle.includes(w)));
  if (!rule) return undefined;
  const persona = rule.verb
    ? attribute(locale, rule.persona, rule.verb)
    : PERSONA_NAME[rule.persona];
  return { persona, insight: tFor(locale, rule.key) };
}

/**
 * Generate insight for a habit based on streak/completion patterns
 */
export function generateHabitInsight(
  habitData: Record<string, unknown>,
  locale: SupportedLocale
): string | undefined {
  const streak = (habitData.streak as number) || 0;
  const completedDates = (habitData.completedDates as string[]) || [];

  if (streak >= 7) return tFor(locale, 'practiceView.habit.streakWeek', { streak });
  if (streak >= 3) return tFor(locale, 'practiceView.habit.streakDays', { streak });
  if (completedDates.length > 0) return tFor(locale, 'practiceView.habit.momentum');

  return undefined;
}

/**
 * Generate insight for a task
 */
export function generateTaskInsight(
  taskData: Record<string, unknown>,
  locale: SupportedLocale
): string | undefined {
  const priority = taskData.priority as string;
  const dueDate = taskData.dueDate as string;

  if (dueDate) {
    const due = new Date(dueDate);
    const today = new Date();
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 0) return tFor(locale, 'practiceView.task.dueToday');
    if (daysUntil === 1) return tFor(locale, 'practiceView.task.dueTomorrow');
    if (daysUntil <= 3) return tFor(locale, 'practiceView.task.dueInDays', { days: daysUntil });
  }

  if (priority === 'high') return tFor(locale, 'practiceView.task.highPriority');

  return undefined;
}

/**
 * Get the persona for a task insight
 */
export function getTaskInsightPersona(
  taskData: Record<string, unknown>,
  locale: SupportedLocale
): string {
  const match = CATEGORY_ATTRIBUTION[taskData.category as string];
  return match ? attribute(locale, match[0], match[1]) : PERSONA_NAME.ferni;
}

/**
 * Get daily insight based on date and context
 */
export function getDayInsight(
  date: Date,
  isToday: boolean,
  locale: SupportedLocale
): { insight: string; persona?: string } {
  const dayOfWeek = date.getDay();
  const hour = new Date().getHours();
  const pick = (key: string, persona?: PersonaId) => ({
    insight: tFor(locale, key),
    persona: persona && PERSONA_NAME[persona],
  });

  // Today gets time-sensitive insights
  if (isToday) {
    if (hour < 12) return pick('practiceView.dayInsight.morningIntention', 'ferni');
    if (hour < 17) return pick('practiceView.dayInsight.stayPresent', 'maya');
    return pick('practiceView.dayInsight.reflectAndCelebrate', 'jordan');
  }

  // New Year's Day
  if (date.getMonth() === 0 && date.getDate() === 1) {
    return pick('practiceView.dayInsight.newBeginning', 'nayan');
  }

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) return pick('practiceView.dayInsight.recharge', 'maya');

  const weekday = WEEKDAY_INSIGHT[dayOfWeek];
  return pick(weekday.key, weekday.persona);
}
