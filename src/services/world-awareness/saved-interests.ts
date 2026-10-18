/**
 * The interests a caller saved through Ferni ("add the Eagles to my teams",
 * news topics), for seeding world awareness at the start of a call.
 *
 * Session start called initWorldAwareness with no profile, so favourite
 * teams were always guessed from the caller's IP location ("local teams")
 * and the teams they had actually saved (information/preferences, stored at
 * bogle_users/{uid}/info_preferences/current) were never read. Off unless
 * SAVED_INTERESTS=on.
 *
 * @module services/world-awareness/saved-interests
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export function isSavedInterestsOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.SAVED_INTERESTS === 'on';
}

export interface SavedInterests {
  favoriteTeams: string[];
  topics: string[];
  /** The home the caller saved ("my home is in Tampa"), for its weather (WORLD_NOW). */
  home?: string;
}

const NONE: SavedInterests = { favoriteTeams: [], topics: [] };
const MAX = 5;

function names(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((t) => {
      if (typeof t === 'string') return t;
      const team = t as { fullName?: unknown; name?: unknown } | null;
      if (typeof team?.fullName === 'string' && team.fullName) return team.fullName;
      return typeof team?.name === 'string' ? team.name : '';
    })
    .filter((n) => n.trim() !== '')
    .slice(0, MAX);
}

/** The saved preference document, reduced to what world awareness uses. */
export function toSavedInterests(data: unknown): SavedInterests {
  const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const home = d.homeLocation as { address?: unknown } | undefined;
  const address = typeof home?.address === 'string' ? home.address.trim() : '';
  return {
    favoriteTeams: names(d.favoriteTeams),
    topics: names(d.newsInterests),
    ...(address ? { home: address } : {}),
  };
}

/**
 * The caller's saved teams and news topics (SAVED_INTERESTS=on) and home
 * (WORLD_NOW=on); empty when both are off, or unsaved or unreadable.
 */
export async function loadSavedInterests(
  userId: string,
  env: Record<string, string | undefined> = process.env
): Promise<SavedInterests> {
  if (!isSavedInterestsOn(env) && env.WORLD_NOW !== 'on') return NONE;
  const db = getFirestoreDb();
  if (!db) return NONE;
  try {
    const doc = await db.collection(`bogle_users/${userId}/info_preferences`).doc('current').get();
    return doc.exists ? toSavedInterests(doc.data()) : NONE;
  } catch {
    return NONE;
  }
}
