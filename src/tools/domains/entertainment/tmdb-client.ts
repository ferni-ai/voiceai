/**
 * The Movie Database (TMDB) v3 API, for the movie and where-to-watch tools.
 *
 * TMDB_API_KEY is read on every call (tests and a late-mounted secret see the
 * current value) and never logged: failures log the path and status only. A
 * v3 key goes in the api_key parameter; a v4 read access token (a JWT, "eyJ…")
 * goes in the Authorization header, which v3 endpoints also accept.
 */

import { getLogger } from '../../../utils/safe-logger.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TIMEOUT_MS = 8000;

type Params = Record<string, string | number | boolean | undefined>;

/** GET a TMDB path. null when the key is unset or the call fails (logged, without the key). */
export async function tmdbGet<T>(path: string, params: Params = {}): Promise<T | null> {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) return null;
  const bearer = key.startsWith('eyJ');
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
  }
  if (!bearer) url.searchParams.set('api_key', key);
  try {
    const response = await fetch(url, {
      headers: bearer ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      getLogger().warn({ path, status: response.status }, '🎬 TMDB request failed');
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    getLogger().warn(
      { path, error: error instanceof Error ? error.name : 'error' },
      '🎬 TMDB unreachable'
    );
    return null;
  }
}

/**
 * The caller's country (ISO 3166-1, from IP geo at session start) for a tool's
 * execute(args, run), else the tool context's, else US. TMDB's release dates
 * and watch providers are per country.
 */
export function callerRegion(run: unknown, fallback?: unknown): string {
  const code = (run as { ctx?: { userData?: { userLocation?: { countryCode?: unknown } } } })?.ctx
    ?.userData?.userLocation?.countryCode;
  for (const c of [code, fallback]) {
    if (typeof c === 'string' && /^[a-z]{2}$/i.test(c.trim())) return c.trim().toUpperCase();
  }
  return 'US';
}

/** "2026-10-24" as "October 24": a calendar date, so read in UTC (local time shifts it a day west of UTC). */
export function spokenDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Speakable list: "A, B and C". */
export function spokenList(items: string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Today in the caller's terms is close enough as UTC for "already out". */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
