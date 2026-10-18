/**
 * What we already know about how a caller eats: diet, cuisines they like and
 * dislike, allergies. Read for pickRestaurant, so the pick fits them without
 * asking again.
 *
 * Preference extraction (transcript-handler saveLifestylePreference) writes
 * bogle_users/{uid}/lifestyle_preferences/food as likes/dislikes plus a
 * `preferences` list that keeps each value's category. A diet like "vegan" is
 * saved as a like, so the category is what tells a diet from a cuisine; the
 * user-knowledge aggregator reads `restrictions`, which nothing writes.
 *
 * @module tools/domains/local-search/food-profile
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { getUserPreferences } from '../information/preferences/storage.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';

const log = getLogger();

export interface FoodProfile {
  diet: string[];
  likes: string[];
  dislikes: string[];
  allergies: string[];
}

export const EMPTY_FOOD_PROFILE: FoodProfile = { diet: [], likes: [], dislikes: [], allergies: [] };

interface FoodDoc {
  likes?: unknown;
  dislikes?: unknown;
  preferences?: Array<{ category?: unknown; value?: unknown }>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').map((v) => v.toLowerCase().trim())
    : [];

/** The food doc's values, split by the category each was saved under. */
export function foodProfileFromDoc(doc: FoodDoc | undefined, allergies: string[]): FoodProfile {
  const likes = new Set(strings(doc?.likes));
  const dislikes = new Set(strings(doc?.dislikes));
  const ofCategory = (category: string): string[] =>
    (doc?.preferences ?? [])
      .filter((p) => p.category === category && typeof p.value === 'string')
      .map((p) => String(p.value).toLowerCase().trim());
  const cuisines = ofCategory('cuisine_preference');
  return {
    diet: [...new Set(ofCategory('dietary_restriction'))],
    likes: cuisines.filter((c) => likes.has(c) && !dislikes.has(c)),
    dislikes: cuisines.filter((c) => dislikes.has(c)),
    allergies: strings(allergies),
  };
}

/** The caller's food profile; empty when nothing is stored or the read fails. */
export async function readFoodProfile(userId: string): Promise<FoodProfile> {
  if (!isMemberIdentity(userId)) return EMPTY_FOOD_PROFILE;
  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const db = await getFirestoreStore().getDatabase();
    const [snap, prefs] = await Promise.all([
      db
        .collection('bogle_users')
        .doc(userId)
        .collection('lifestyle_preferences')
        .doc('food')
        .get(),
      getUserPreferences(userId),
    ]);
    return foodProfileFromDoc(snap.exists ? (snap.data() as FoodDoc) : undefined, prefs.allergies);
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not read the food profile');
    return EMPTY_FOOD_PROFILE;
  }
}
