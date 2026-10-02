/**
 * Mood calendar - entry windowing, pattern detection and text helpers. Extracted from mood-calendar.ts.
 */

import type { MoodEntry, MoodType } from '../types.js';

/**
 * Get the last N entries, padding with null if needed.
 */
export function getLastNEntries(entries: MoodEntry[], n: number): (MoodEntry | null)[] {
  const result: (MoodEntry | null)[] = [];
  const startIdx = Math.max(0, entries.length - n);

  // Pad with nulls if not enough entries
  for (let i = 0; i < n - entries.length; i++) {
    result.push(null);
  }

  // Add actual entries
  for (let i = startIdx; i < entries.length; i++) {
    const entry = entries[i];
    result.push(entry ?? null);
  }

  return result;
}

/**
 * Detect mood patterns for insights.
 */
export function detectPattern(entries: MoodEntry[]): string | null {
  if (entries.length < 7) return null;

  // Group by day of week
  const dayMoods: Record<number, MoodType[]> = {};
  entries.forEach((entry) => {
    const day = new Date(entry.date).getDay();
    if (!dayMoods[day]) dayMoods[day] = [];
    dayMoods[day].push(entry.mood);
  });

  // Find day with most anxiety
  let maxAnxietyDay = -1;
  let maxAnxietyCount = 0;

  for (const [day, moods] of Object.entries(dayMoods)) {
    const anxietyCount = moods.filter((m) => m === 'anxious' || m === 'stressed').length;
    if (anxietyCount > maxAnxietyCount) {
      maxAnxietyCount = anxietyCount;
      maxAnxietyDay = parseInt(day);
    }
  }

  if (maxAnxietyCount >= 2) {
    const dayNames = [
      'Sundays',
      'Mondays',
      'Tuesdays',
      'Wednesdays',
      'Thursdays',
      'Fridays',
      'Saturdays',
    ];
    return `${dayNames[maxAnxietyDay]} show highest anxiety. Your mood tends to dip mid-week.`;
  }

  return null;
}

/**
 * Capitalize first letter.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
