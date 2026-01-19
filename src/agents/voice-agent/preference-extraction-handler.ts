/**
 * Preference Extraction Handler
 *
 * Handles extraction and saving of user preferences from conversation.
 * Enables "Better than Human" - Ferni learns from natural conversation.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/preference-extraction-handler
 */

import { diag } from '../../services/diagnostic-logger.js';
import {
  extractPreferences,
  hasPreferenceContent,
  type ExtractedPreference,
} from '../../intelligence/preference-extractor.js';
import {
  addAvoidTopic,
  addFavoriteTeam,
  addNewsInterest,
  addToWatchlist,
  saveLocation,
  setAllergies,
} from '../../tools/domains/information/preferences/index.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
import {
  extractMusicPreferences,
  hasMusicContext,
} from '../../audio/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PreferenceExtractionContext {
  /** User ID */
  userId: string;
  /** The transcript to extract preferences from */
  transcript: string;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Process transcript for music preferences.
 * Detects: "I love jazz", "I don't like country", "Taylor Swift is my favorite"
 *
 * @param transcript - The transcript to check
 */
export function processMusicPreferences(transcript: string): void {
  if (!hasMusicContext(transcript)) {
    return;
  }

  const extractedPrefs = extractMusicPreferences(transcript);
  if (extractedPrefs.length > 0) {
    diag.state('Extracted music preferences from conversation', {
      count: extractedPrefs.length,
      preferences: extractedPrefs.map((p) => `${p.type} ${p.category}: ${p.value}`),
    });
  }
}

/**
 * Process transcript for general preferences.
 * Detects: sports teams, stocks, news interests, avoid topics, locations, allergies
 *
 * @param ctx - Preference extraction context
 */
export function processGeneralPreferences(ctx: PreferenceExtractionContext): void {
  const { userId, transcript } = ctx;

  if (!hasPreferenceContent(transcript)) {
    return;
  }

  const extractedPrefs = extractPreferences(transcript);
  if (extractedPrefs.length === 0) {
    return;
  }

  // Fire-and-forget: save each preference to the appropriate store
  for (const pref of extractedPrefs) {
    fireAndForget(async () => {
      await saveExtractedPreference(userId, pref);
    }, 'preference-extraction');
  }

  diag.state('Extracted general preferences from conversation', {
    count: extractedPrefs.length,
    preferences: extractedPrefs.map((p) => `${p.category}: ${p.value}`),
  });
}

// ============================================================================
// PREFERENCE SAVING
// ============================================================================

/**
 * Save an extracted preference to the appropriate storage
 * Enables "Better than Human" - Ferni learns from natural conversation
 */
async function saveExtractedPreference(userId: string, pref: ExtractedPreference): Promise<void> {
  try {
    switch (pref.category) {
      // =======================================================================
      // ORIGINAL CATEGORIES (specific storage functions)
      // =======================================================================
      case 'sports_team':
        await addFavoriteTeam(userId, {
          name: pref.value,
          league: pref.context || 'Unknown',
          priority: 'secondary', // Auto-extracted = secondary, explicit = primary
        });
        diag.info('Learned favorite team from conversation', {
          team: pref.value,
          league: pref.context,
        });
        break;

      case 'stock_watchlist':
        await addToWatchlist(userId, pref.value);
        diag.info('Learned stock interest from conversation', { ticker: pref.value });
        break;

      case 'news_interest':
        await addNewsInterest(userId, pref.value);
        diag.info('Learned news interest from conversation', { topic: pref.value });
        break;

      case 'avoid_topic':
        await addAvoidTopic(userId, pref.value);
        diag.info('Learned topic to avoid from conversation', { topic: pref.value });
        break;

      case 'home_location':
        await saveLocation(userId, { name: 'Home', address: pref.value });
        diag.info('Learned home location from conversation', { location: pref.value });
        break;

      case 'work_location':
        await saveLocation(userId, { name: 'Work', address: pref.value });
        diag.info('Learned work location from conversation', { location: pref.value });
        break;

      case 'allergy':
        await setAllergies(userId, [pref.value], 'add');
        diag.info('Learned allergy from conversation', { allergy: pref.value });
        break;

      case 'health_condition':
        // Health conditions are sensitive - log but don't auto-store without confirmation
        diag.info('Detected health condition mention (not auto-stored)', {
          condition: pref.value,
        });
        break;

      // =======================================================================
      // NEW "BETTER THAN HUMAN" LIFESTYLE PREFERENCES
      // Stored in Firestore: bogle_users/{userId}/lifestyle_preferences/{category}
      // =======================================================================
      case 'music_genre':
      case 'music_artist':
        await saveLifestylePreference(userId, 'music', pref.category, pref.value, pref.isNegative);
        diag.info('Learned music preference from conversation', {
          type: pref.category,
          value: pref.value,
          isNegative: pref.isNegative,
        });
        break;

      case 'movie_genre':
      case 'tv_show':
        await saveLifestylePreference(
          userId,
          'entertainment',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info('Learned entertainment preference from conversation', {
          type: pref.category,
          value: pref.value,
          isNegative: pref.isNegative,
        });
        break;

      case 'cuisine_preference':
      case 'dietary_restriction':
      case 'drink_preference':
      case 'restaurant_favorite':
        await saveLifestylePreference(userId, 'food', pref.category, pref.value, pref.isNegative);
        diag.info('Learned food preference from conversation', {
          type: pref.category,
          value: pref.value,
          isNegative: pref.isNegative,
        });
        break;

      case 'exercise_routine':
      case 'wellness_practice':
      case 'sleep_pattern':
        await saveLifestylePreference(
          userId,
          'wellness',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info('Learned wellness preference from conversation', {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'travel_style':
      case 'bucket_list_destination':
      case 'favorite_place':
        await saveLifestylePreference(userId, 'travel', pref.category, pref.value, pref.isNegative);
        diag.info('Learned travel preference from conversation', {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'learning_goal':
      case 'skill_building':
        await saveLifestylePreference(
          userId,
          'learning',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info('Learned learning goal from conversation', {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'communication_preference':
      case 'social_style':
      case 'pet_preference':
        await saveLifestylePreference(userId, 'social', pref.category, pref.value, pref.isNegative);
        diag.info('Learned social preference from conversation', {
          type: pref.category,
          value: pref.value,
        });
        break;

      case 'productivity_style':
      case 'morning_routine':
      case 'shopping_preference':
        await saveLifestylePreference(
          userId,
          'daily_life',
          pref.category,
          pref.value,
          pref.isNegative
        );
        diag.info('Learned daily life preference from conversation', {
          type: pref.category,
          value: pref.value,
        });
        break;

      default:
        diag.debug('Unknown preference category', { category: pref.category, value: pref.value });
    }
  } catch (error) {
    diag.warn('Failed to save extracted preference', {
      category: pref.category,
      value: pref.value,
      error: String(error),
    });
  }
}

/**
 * Save a lifestyle preference to Firestore
 * Stores in: bogle_users/{userId}/lifestyle_preferences/{domain}
 *
 * Each domain (music, food, wellness, etc.) has arrays for:
 * - likes: things the user enjoys
 * - dislikes: things the user doesn't enjoy
 * - preferences: specific preference items with metadata
 */
async function saveLifestylePreference(
  userId: string,
  domain: string,
  category: string,
  value: string,
  isNegative?: boolean
): Promise<void> {
  try {
    const { getFirestoreStore } = await import('../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('lifestyle_preferences')
      .doc(domain);

    const doc = await docRef.get();
    const data = doc.exists ? (doc.data() as Record<string, unknown>) : {};

    // Get or initialize arrays
    const likes = (data.likes as string[]) || [];
    const dislikes = (data.dislikes as string[]) || [];
    const preferences =
      (data.preferences as Array<{ category: string; value: string; timestamp: string }>) || [];

    // Add to appropriate list
    if (isNegative) {
      if (!dislikes.includes(value)) {
        dislikes.push(value);
      }
    } else {
      if (!likes.includes(value)) {
        likes.push(value);
      }
    }

    // Also store with metadata
    const existingPrefIndex = preferences.findIndex(
      (p) => p.category === category && p.value === value
    );
    if (existingPrefIndex === -1) {
      preferences.push({
        category,
        value,
        timestamp: new Date().toISOString(),
      });
    }

    await docRef.set(
      {
        likes,
        dislikes,
        preferences,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    diag.debug('Saved lifestyle preference to Firestore', { userId, domain, category, value });
  } catch (error) {
    // Non-fatal - preference saving shouldn't break the session
    diag.debug('Could not save lifestyle preference to Firestore', {
      userId,
      domain,
      category,
      value,
      error: String(error),
    });
  }
}

export default {
  processMusicPreferences,
  processGeneralPreferences,
};
