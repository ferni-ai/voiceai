/**
 * The Home line's plain greetings: the ones that need nothing from the person's
 * data, used when no follow-up qualifies (or the flag is off).
 *
 * No name here: the app keeps the name on the device and adds it ("Morning, Sam.").
 *
 * @module api/home/home-greeting
 */
import { partOfDayFor } from '../../agents/multi-agent/greeting-direction.js';

export interface HomeGreeting {
  kind: 'followUp' | 'timeOfDay' | 'firstVisit';
  text: string;
  /** Only with kind "followUp": an opaque id for the follow-up's topic. */
  topicId?: string;
}

export const FIRST_VISIT_TEXT = "Hi, I'm Ferni.";

const BY_PART: Record<string, string> = {
  'late night': "You're up late.",
  morning: 'Good morning.',
  afternoon: 'Good afternoon.',
  evening: 'Good evening.',
  'late evening': 'Good evening.',
};

/** The hour (0-23) in an IANA zone, or undefined for a zone Intl doesn't know. */
export function hourIn(zone: string | undefined, now: Date): number | undefined {
  if (!zone) return undefined;
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now);
    const n = Number.parseInt(hour, 10);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** A time-of-day greeting; "Hi." when the app didn't say which zone it is in. */
export function timeOfDayGreeting(zone: string | undefined, now: Date): HomeGreeting {
  const hour = hourIn(zone, now);
  return {
    kind: 'timeOfDay',
    text: hour === undefined ? 'Hi.' : (BY_PART[partOfDayFor(hour)] ?? 'Hi.'),
  };
}
