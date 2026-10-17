/**
 * Where to get the weather for when the caller names no place.
 *
 * Order: the place the caller named; the home they saved (info preferences,
 * "my home is ..."); the location on their profile (set from the app's GPS or by
 * hand); this call's IP-detected city; any other profile location. Only when
 * none is known does the tool ask. Every answer logs its source, so a wrong city
 * can be traced.
 *
 * Prod 2026-10-17: the caller's city was known from the start of the call (IP
 * detection, and the world-awareness weather warmed for it), yet the persona
 * asked "what city or zip code are we looking at?".
 *
 * WEATHER_SAVED_HOME=off skips the saved home and profile and goes back to the
 * named place, then this call's city.
 *
 * @module tools/domains/information/weather-location
 */
import { flagOn } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext } from '../../registry/types.js';
import { callerLocation, isUnspecifiedLocation } from '../../shared/caller-location.js';
import { getUserPreferences } from './preferences/storage.js';

export type WeatherLocationSource =
  'asked' | 'saved-home' | 'profile' | 'call-ip' | 'profile-approximate';

export interface WeatherLocation {
  location: string;
  source: WeatherLocationSource;
}

interface ProfileLocation {
  city?: string;
  regionCode?: string;
  source?: string;
}

interface CallData {
  userId?: string;
  services?: { userProfile?: { id?: string; location?: ProfileLocation } | null };
}

/** Longest the saved-home lookup (a Firestore read when not cached) may take. */
const SAVED_HOME_TIMEOUT_MS = 400;

/** Profile locations the person gave us, rather than ones guessed from IP or timezone. */
const PRECISE_PROFILE_SOURCES = new Set(['browser-gps', 'manual']);

function callData(opts: unknown): CallData | undefined {
  return (opts as { ctx?: { userData?: CallData } } | undefined)?.ctx?.userData;
}

function cityOf(location: ProfileLocation | undefined): string | undefined {
  if (!location?.city) return undefined;
  return location.regionCode ? `${location.city}, ${location.regionCode}` : location.city;
}

async function savedHome(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const prefs = await Promise.race([
      getUserPreferences(userId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SAVED_HOME_TIMEOUT_MS);
      }),
    ]);
    return prefs?.homeLocation?.address?.trim() || undefined;
  } catch (error) {
    getLogger().warn({ error: String(error) }, '🌤️ Saved home lookup failed');
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The place to get the weather for, and where it came from; undefined when nothing is known. */
export async function resolveWeatherLocation(
  asked: string | undefined,
  opts: unknown,
  ctx?: ToolContext
): Promise<WeatherLocation | undefined> {
  if (!isUnspecifiedLocation(asked)) return { location: asked!.trim(), source: 'asked' };

  const data = callData(opts);
  const fromCall = callerLocation(opts, ctx);
  if (!flagOn('WEATHER_SAVED_HOME')) {
    return fromCall ? { location: fromCall, source: 'call-ip' } : undefined;
  }

  const profile = data?.services?.userProfile;
  const home = await savedHome(data?.userId ?? profile?.id);
  if (home) return { location: home, source: 'saved-home' };

  const profileCity = cityOf(profile?.location ?? undefined);
  if (profileCity && PRECISE_PROFILE_SOURCES.has(profile?.location?.source ?? '')) {
    return { location: profileCity, source: 'profile' };
  }
  if (fromCall) return { location: fromCall, source: 'call-ip' };
  if (profileCity) return { location: profileCity, source: 'profile-approximate' };
  return undefined;
}
