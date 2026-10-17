/**
 * What getCurrentContext and getTodaySignificance report, in the caller's time.
 *
 * Prod call 2026-10-17: a caller in Florida asked about the weather at 9:14 pm
 * on a Friday. getCurrentContext was called with includeWeather and said
 * "1:14 AM, Saturday, UTC": it formatted the server's clock (LiveKit Cloud runs
 * in UTC) and never read includeWeather, though the call had a weather reading
 * cached from its start. The agent then asked for a city and later made up a
 * temperature.
 *
 * With AWARENESS_CALLER_TIME on (the default) the time, day, part of the day
 * and holidays are the caller's: the zone the call settled (browser, else a
 * verified owner's profile zone: agents/voice-agent-entry/phone-parity.ts),
 * read from the tool's run context or the per-call store. With no zone known
 * the tool says so instead of giving the server's clock. includeWeather adds
 * the reading cached at call start (services/world-awareness), or says plainly
 * that there is none. AWARENESS_CALLER_TIME=off: the server's clock, no weather,
 * as before.
 *
 * @module tools/domains/awareness/current-context
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { cachedHomeWeather, getWorldSnapshot } from '../../../services/world-awareness/index.js';
import { runContextTimeZone, userTimeZone } from '../../../utils/caller-time-zone.js';
import { isValidTimeZone, wallTimeIn, type WallTime } from '../../../utils/time-zone.js';

export function awarenessCallerTimeEnabled(env: Env = process.env): boolean {
  return flagOn('AWARENESS_CALLER_TIME', env);
}

/** A weather reading older than this is not "now". */
const WEATHER_MAX_AGE_MS = 60 * 60 * 1000;

export interface ZoneSources {
  /** The model's own `timezone` argument, if it passed a real zone. */
  explicit?: string;
  /** LiveKit's run context (`execute(args, { ctx })`): userData carries the call's zone. */
  runCtx?: unknown;
  sessionId?: string;
  userId?: string;
}

/**
 * The caller's zone, or undefined when this call has none. Never the server's.
 * The call's own zone wins over the model's argument, which is only a guess
 * (on the 10-17 call it would have been the server's UTC).
 */
export function callerZone(src: ZoneSources): string | undefined {
  return (
    runContextTimeZone(src.runCtx) ??
    userTimeZone({ sessionId: src.sessionId, userId: src.userId }) ??
    (isValidTimeZone(src.explicit) ? src.explicit : undefined)
  );
}

/** The server's zone: only for AWARENESS_CALLER_TIME=off. */
const serverZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The zone the tools read a time in: the caller's when on; with the flag off, the old server fallback. */
export function zoneFor(src: ZoneSources, env: Env = process.env): string | undefined {
  if (!awarenessCallerTimeEnabled(env))
    return isValidTimeZone(src.explicit) ? src.explicit : serverZone();
  return callerZone(src);
}

const HOLIDAYS: Record<string, string> = {
  '1-1': "New Year's Day",
  '2-14': "Valentine's Day",
  '7-4': 'Independence Day (US)',
  '10-31': 'Halloween',
  '12-25': 'Christmas',
  '12-31': "New Year's Eve",
};

function partOfDay(hour: number): { timeOfDay: string; greeting: string } {
  if (hour >= 5 && hour < 12) return { timeOfDay: 'morning', greeting: 'Good morning' };
  if (hour >= 12 && hour < 17) return { timeOfDay: 'afternoon', greeting: 'Good afternoon' };
  if (hour >= 17 && hour < 21) return { timeOfDay: 'evening', greeting: 'Good evening' };
  return { timeOfDay: 'night', greeting: 'Good evening' };
}

/** Northern Hemisphere, by month 1-12. */
function seasonOf(month: number): string {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

/** 0 = Sunday, for a wall-clock date. */
const weekdayOf = (w: WallTime): number =>
  new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();

function contextualAwareness(timeOfDay: string, weekday: number, season: string): string {
  const insights: string[] = [];
  if (timeOfDay === 'morning') {
    insights.push('User is starting their day - energy may be fresh, goals setting is natural');
  } else if (timeOfDay === 'evening') {
    insights.push('User is winding down - reflection and next-day planning fit well');
  } else if (timeOfDay === 'night') {
    insights.push('Late hour - keep conversation calming, avoid stimulating topics');
  }
  if (weekday === 1) insights.push('Monday energy - week planning, goal setting, fresh starts');
  else if (weekday === 5) {
    insights.push('Friday energy - week review, celebration of wins, weekend planning');
  } else if (weekday === 0 || weekday === 6) {
    insights.push('Weekend - more relaxed pace, personal time, reflection');
  }
  const seasonInsights: Record<string, string> = {
    spring: 'Spring - themes of renewal, growth, new beginnings',
    summer: 'Summer - energy, activity, abundance, outdoor time',
    fall: 'Fall - harvest, reflection, preparation, cozy settling',
    winter: 'Winter - introspection, rest, planning, warmth-seeking',
  };
  insights.push(seasonInsights[season]);
  return insights.join('. ');
}

export const NO_ZONE_NOTE =
  "You don't know the caller's local time or day: don't state a time or day for them. If it matters, ask.";
export const NO_WEATHER_NOTE =
  "No weather reading is available here. Look it up with a weather tool if you have one; otherwise say you can't check it right now. Never guess a temperature or conditions.";

/** The cached weather for this user, if one was read in the last hour. */
export function cachedWeather(userId: string, now: Date): string | undefined {
  if (!userId || userId === 'anonymous') return undefined;
  const { weather } = getWorldSnapshot(userId);
  if (weather?.current && now.getTime() - weather.fetchedAt.getTime() <= WEATHER_MAX_AGE_MS) {
    const minutes = Math.max(0, Math.round((now.getTime() - weather.fetchedAt.getTime()) / 60000));
    return `${weather.current} (read ${minutes} min ago for ${weather.location})`;
  }
  // WORLD_NOW's home-weather cache (the home the caller saved), already age-checked there.
  return cachedHomeWeather(userId, now.getTime());
}

export interface CurrentContextInput {
  now: Date;
  /** The zone to read the time in; undefined = the caller's time is unknown. */
  zone?: string;
  includeWeather?: boolean;
  /** The weather reading to report, when includeWeather (cachedWeather). */
  weather?: string;
}

/** getCurrentContext's result. Pure: the clock, zone and weather are inputs. */
export function currentContext(p: CurrentContextInput): Record<string, unknown> {
  const weatherPart = p.includeWeather ? { weather: p.weather ?? NO_WEATHER_NOTE } : {};
  if (!p.zone) {
    return {
      caller_local_time: 'unknown',
      timezone: 'unknown',
      note: NO_ZONE_NOTE,
      ...weatherPart,
    };
  }
  const { zone } = p;
  const fmt = (o: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone: zone }).format(p.now);
  const wall = wallTimeIn(p.now, zone);
  const weekday = weekdayOf(wall);
  const { timeOfDay, greeting } = partOfDay(wall.hour);
  const season = seasonOf(wall.month);
  const holiday = HOLIDAYS[`${wall.month}-${wall.day}`];
  return {
    current_time: fmt({ hour: 'numeric', minute: '2-digit', hour12: true }),
    current_date: fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    timezone: zone,
    time_of_day: timeOfDay,
    greeting,
    is_weekend: weekday === 0 || weekday === 6,
    is_friday: weekday === 5,
    is_monday: weekday === 1,
    season,
    special_days: holiday ? [holiday] : [],
    contextual_awareness: contextualAwareness(timeOfDay, weekday, season),
    ...weatherPart,
  };
}

/** Month (1-12), day and weekday name for getTodaySignificance; the server's date with no zone. */
export function todayIn(
  now: Date,
  zone: string | undefined
): { month: number; day: number; weekday: string; date: string; known: boolean } {
  const tz = zone ?? 'UTC';
  const wall = wallTimeIn(now, tz);
  const fmt = (o: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone: tz }).format(now);
  return {
    month: wall.month,
    day: wall.day,
    weekday: fmt({ weekday: 'long' }),
    date: fmt({ month: 'long', day: 'numeric', year: 'numeric' }),
    known: Boolean(zone),
  };
}
