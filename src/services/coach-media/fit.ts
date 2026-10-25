/**
 * What makes a pick fit this person: what the model knows from the call
 * (level, time, constraints) plus their stored learning and wellness
 * preferences (user-preferences-store, written by the turn processor). It goes
 * to the check, not to search, and is scrubbed of their name and numbers like
 * the query. Health conditions are left out.
 *
 * @module services/coach-media/fit
 */

import { getUserPreferences } from '../user-preferences-store.js';
import { topicOnlyQuery } from './topic-query.js';
import { isMemberIdentity } from '../identity/member-identity.js';

/** Preference categories that say what fits a coaching resource. */
export const FIT_CATEGORIES = [
  'learning_goal',
  'skill_building',
  'exercise_routine',
  'wellness_practice',
  'coaching_media',
];
const MAX_STORED = 4;

/** A short, scrubbed description of what fits them; '' when nothing is known. */
export async function fitContext(
  userId: string | undefined,
  said: string | undefined,
  names: Array<string | undefined>
): Promise<string> {
  const parts: string[] = [];
  if (said) parts.push(said);
  if (isMemberIdentity(userId)) {
    const profile = await getUserPreferences(userId).catch(() => null);
    const stored = [...(profile?.preferences.values() ?? [])]
      .filter((p) => p.isActive && FIT_CATEGORIES.includes(p.category))
      .sort((a, b) => new Date(b.lastConfirmedAt).getTime() - new Date(a.lastConfirmedAt).getTime())
      .slice(0, MAX_STORED)
      .map((p) => (p.isNegative ? `not ${p.value}` : p.value));
    parts.push(...stored);
  }
  return topicOnlyQuery(parts.join('; '), names) ?? '';
}
