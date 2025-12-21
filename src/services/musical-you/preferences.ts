/**
 * Music Preferences Service
 *
 * Loads and provides persona-specific music preferences from bundles.
 * This allows each persona to have their own music taste and recommendations.
 *
 * Usage:
 *   const prefs = await getMusicPreferences('ferni');
 *   const moodRecs = prefs?.mood_recommendations?.focus;
 *   const musicOffer = getMusicOffer('ferni', 'stress');
 */

import { getLogger } from '../../utils/safe-logger.js';
import { loadBundleById } from '../../personas/bundles/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface MoodRecommendation {
  genres: string[];
  example_artists: string[];
  why: string;
}

export interface PersonalFavorite {
  song: string;
  artist: string;
  why: string;
}

export interface MusicPreferences {
  description?: string;
  favorite_genres: string[];
  mood_recommendations: {
    focus?: MoodRecommendation;
    relaxing?: MoodRecommendation;
    energizing?: MoodRecommendation;
    celebrating?: MoodRecommendation;
    reflecting?: MoodRecommendation;
  };
  personal_favorites?: PersonalFavorite[];
  conversational_music_mentions?: string[];
  music_offers?: {
    for_stress?: string[];
    for_focus?: string[];
    for_celebration?: string[];
    for_sadness?: string[];
    for_energy?: string[];
  };
}

// ============================================================================
// CACHE
// ============================================================================

const musicPreferencesCache = new Map<string, MusicPreferences | null>();

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load music preferences for a persona from their bundle.
 * Results are cached.
 */
export async function getMusicPreferences(personaId: string): Promise<MusicPreferences | null> {
  // Check cache first
  if (musicPreferencesCache.has(personaId)) {
    return musicPreferencesCache.get(personaId) || null;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      log.debug({ personaId }, 'No bundle found for music preferences');
      musicPreferencesCache.set(personaId, null);
      return null;
    }

    const behaviors = await bundle.getBehaviors();
    const musicPrefs = behaviors.music_preferences as
      | { music_preferences?: MusicPreferences }
      | undefined;

    if (!musicPrefs?.music_preferences) {
      log.debug({ personaId }, 'No music preferences in bundle');
      musicPreferencesCache.set(personaId, null);
      return null;
    }

    const prefs = musicPrefs.music_preferences;
    log.debug({ personaId, genres: prefs.favorite_genres }, 'Loaded music preferences from bundle');
    musicPreferencesCache.set(personaId, prefs);
    return prefs;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load music preferences from bundle');
    musicPreferencesCache.set(personaId, null);
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a music offer phrase for a specific mood/situation.
 */
export async function getMusicOffer(
  personaId: string,
  situation: 'stress' | 'focus' | 'celebration' | 'sadness' | 'energy'
): Promise<string | null> {
  const prefs = await getMusicPreferences(personaId);
  if (!prefs?.music_offers) return null;

  const offerKey = `for_${situation}` as keyof typeof prefs.music_offers;
  const offers = prefs.music_offers[offerKey];
  if (!offers || offers.length === 0) return null;

  return offers[Math.floor(Math.random() * offers.length)];
}

/**
 * Get mood-based music recommendation.
 */
export async function getMoodRecommendation(
  personaId: string,
  mood: 'focus' | 'relaxing' | 'energizing' | 'celebrating' | 'reflecting'
): Promise<MoodRecommendation | null> {
  const prefs = await getMusicPreferences(personaId);
  if (!prefs?.mood_recommendations) return null;

  return prefs.mood_recommendations[mood] || null;
}

/**
 * Get a random personal favorite song.
 */
export async function getPersonalFavorite(personaId: string): Promise<PersonalFavorite | null> {
  const prefs = await getMusicPreferences(personaId);
  if (!prefs?.personal_favorites || prefs.personal_favorites.length === 0) return null;

  return prefs.personal_favorites[Math.floor(Math.random() * prefs.personal_favorites.length)];
}

/**
 * Get a random conversational music mention phrase.
 */
export async function getMusicMentionPhrase(personaId: string): Promise<string | null> {
  const prefs = await getMusicPreferences(personaId);
  if (!prefs?.conversational_music_mentions || prefs.conversational_music_mentions.length === 0) {
    return null;
  }

  return prefs.conversational_music_mentions[
    Math.floor(Math.random() * prefs.conversational_music_mentions.length)
  ];
}

/**
 * Get favorite genres for a persona.
 */
export async function getFavoriteGenres(personaId: string): Promise<string[]> {
  const prefs = await getMusicPreferences(personaId);
  return prefs?.favorite_genres || [];
}

/**
 * Clear the music preferences cache (for testing or hot reload).
 */
export function clearMusicPreferencesCache(personaId?: string): void {
  if (personaId) {
    musicPreferencesCache.delete(personaId);
  } else {
    musicPreferencesCache.clear();
  }
}

export default {
  getMusicPreferences,
  getMusicOffer,
  getMoodRecommendation,
  getPersonalFavorite,
  getMusicMentionPhrase,
  getFavoriteGenres,
  clearMusicPreferencesCache,
};
