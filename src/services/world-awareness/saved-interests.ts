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
  return { favoriteTeams: names(d.favoriteTeams), topics: names(d.newsInterests) };
}

/** The caller's saved teams and news topics; empty when off, unsaved or unreadable. */
export async function loadSavedInterests(
  userId: string,
  env: Record<string, string | undefined> = process.env
): Promise<SavedInterests> {
  if (!isSavedInterestsOn(env)) return NONE;
  const db = getFirestoreDb();
  if (!db) return NONE;
  try {
    const doc = await db.collection(`bogle_users/${userId}/info_preferences`).doc('current').get();
    return doc.exists ? toSavedInterests(doc.data()) : NONE;
  } catch {
    return NONE;
  }
}
