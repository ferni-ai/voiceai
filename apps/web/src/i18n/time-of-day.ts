/**
 * One clock for every "good morning" on screen.
 *
 * The menu header, Our Story So Far and the home helper line each had their own
 * hour buckets, so at 04:50 the menu said "Still up?" while Our Story So Far
 * said "Good morning" (app audit 2026-11-16, item 11). They all ask this module.
 */

import { t } from './index.js';

export type DayPart = 'lateNight' | 'morning' | 'afternoon' | 'evening' | 'night';

/** The part of the day a local hour (0-23) falls in. */
export function dayPart(hour: number): DayPart {
  if (hour < 5) return 'lateNight';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/** The greeting for a moment ("Good morning", "Still up?"), in the current locale. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  return t(`menu.greeting.${dayPart(now.getHours())}`);
}
