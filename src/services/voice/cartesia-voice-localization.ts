/**
 * Cartesia Voice Localization Service
 *
 * This service handles localizing Ferni voices to different English accents
 * using Cartesia's Voice Localization API.
 *
 * CRITICAL: The `language` parameter in Cartesia TTS does NOT change accents.
 * You must use the Localization API to create accent-specific voice IDs.
 *
 * PERSISTENCE: Localized voice IDs are cached in Firestore to avoid
 * repeated API calls across server restarts.
 *
 * @see https://docs.cartesia.ai/api-reference/voices/localize
 */

import { type EnglishAccent, ACCENT_TO_DIALECT } from '../../config/voice-accents.js';
import { getVoiceIdForPersona } from '../../config/voice-ids.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CartesiaLocalization' });

// Firestore import (lazy loaded to avoid circular deps)
let firestoreDb: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (firestoreDb) return firestoreDb;

  try {
    const { getFirestore: getFs } = await import('firebase-admin/firestore');
    firestoreDb = getFs();
    return firestoreDb;
  } catch (err) {
    log.warn({ error: String(err) }, 'Firestore not available, using in-memory cache only');
    return null;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface LocalizedVoice {
  id: string;
  name: string;
  description: string;
  language: string;
  dialect: string;
  originalVoiceId: string;
  createdAt: string;
}

export interface LocalizationResult {
  voiceId: string;
  isLocalized: boolean;
  accent: EnglishAccent;
  cached: boolean;
}

interface CartesiaLocalizeRequest {
  voice_id: string;
  name: string;
  description: string;
  language: string;
  original_speaker_gender: 'male' | 'female';
  dialect?: string;
}

interface CartesiaLocalizeResponse {
  id: string;
  user_id: string;
  is_public: boolean;
  name: string;
  description: string;
  created_at: string;
  language: string;
}

// =============================================================================
// PERSONA VOICE METADATA
// =============================================================================

/**
 * Metadata about each persona's voice for localization.
 */
const PERSONA_VOICE_META: Record<string, { name: string; gender: 'male' | 'female' }> = {
  ferni: { name: 'Ferni', gender: 'female' },
  'peter-john': { name: 'Peter John', gender: 'male' },
  'alex-chen': { name: 'Alex Chen', gender: 'male' },
  'maya-santos': { name: 'Maya Santos', gender: 'female' },
  'jordan-taylor': { name: 'Jordan Taylor', gender: 'female' },
  'nayan-patel': { name: 'Nayan Patel', gender: 'male' },
};

// =============================================================================
// VOICE CACHE
// =============================================================================

/**
 * In-memory cache of localized voice IDs.
 * Key format: `${personaId}:${accent}`
 * Value: localized voice ID
 */
const localizedVoiceCache = new Map<string, LocalizedVoice>();

/**
 * Firestore collection for persistent storage.
 */
const FIRESTORE_COLLECTION = 'cartesia_localized_voices';

/**
 * Whether the cache has been loaded from Firestore.
 */
let cacheLoadedFromFirestore = false;

// =============================================================================
// FIRESTORE PERSISTENCE
// =============================================================================

/**
 * Save a localized voice to Firestore for persistence across restarts.
 */
async function saveToFirestore(cacheKey: string, voice: LocalizedVoice): Promise<void> {
  try {
    const db = await getFirestore();
    if (!db) return;

    await db
      .collection(FIRESTORE_COLLECTION)
      .doc(cacheKey)
      .set(
        removeUndefined({
          ...voice,
          cacheKey,
          updatedAt: new Date().toISOString(),
        })
      );

    log.debug({ cacheKey, voiceId: voice.id }, '💾 Saved localized voice to Firestore');
  } catch (err) {
    log.warn({ cacheKey, error: String(err) }, 'Failed to save to Firestore');
  }
}

/**
 * Load all cached localized voices from Firestore into memory.
 * Call this at startup to hydrate the in-memory cache.
 */
export async function loadCacheFromFirestore(): Promise<number> {
  if (cacheLoadedFromFirestore) {
    log.debug('Cache already loaded from Firestore');
    return localizedVoiceCache.size;
  }

  try {
    const db = await getFirestore();
    if (!db) {
      cacheLoadedFromFirestore = true;
      return 0;
    }

    const snapshot = await db.collection(FIRESTORE_COLLECTION).get();

    let loaded = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const voice: LocalizedVoice = {
        id: data.id,
        name: data.name,
        description: data.description,
        language: data.language,
        dialect: data.dialect,
        originalVoiceId: data.originalVoiceId,
        createdAt: data.createdAt,
      };

      localizedVoiceCache.set(doc.id, voice);
      loaded++;
    }

    cacheLoadedFromFirestore = true;
    log.info({ loaded, total: snapshot.size }, '📥 Loaded localized voices from Firestore');
    return loaded;
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to load cache from Firestore');
    cacheLoadedFromFirestore = true;
    return 0;
  }
}

/**
 * Delete a cached voice from Firestore.
 */
async function deleteFromFirestore(cacheKey: string): Promise<void> {
  try {
    const db = await getFirestore();
    if (!db) return;

    await db.collection(FIRESTORE_COLLECTION).doc(cacheKey).delete();
    log.debug({ cacheKey }, '🗑️ Deleted localized voice from Firestore');
  } catch (err) {
    log.warn({ cacheKey, error: String(err) }, 'Failed to delete from Firestore');
  }
}

// =============================================================================
// CARTESIA API
// =============================================================================

const CARTESIA_API_URL = 'https://api.cartesia.ai';
const CARTESIA_API_VERSION = '2024-06-10';

/**
 * Call Cartesia's voice localization API.
 */
async function callLocalizeApi(
  request: CartesiaLocalizeRequest
): Promise<CartesiaLocalizeResponse> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error('CARTESIA_API_KEY not set');
  }

  const response = await fetch(`${CARTESIA_API_URL}/voices/localize`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': CARTESIA_API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cartesia localization failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<CartesiaLocalizeResponse>;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Get a localized voice ID for a persona + accent combination.
 *
 * - For American accent: returns the original voice ID (no localization needed)
 * - For other accents: returns a cached localized voice ID, or creates one
 *
 * @param personaId - Canonical persona ID (e.g., 'ferni', 'peter-john')
 * @param accent - Target English accent
 * @returns Localization result with voice ID
 *
 * @example
 * const result = await getLocalizedVoiceId('ferni', 'british');
 * // result.voiceId is the British-accented Ferni voice
 */
export async function getLocalizedVoiceId(
  personaId: string,
  accent: EnglishAccent
): Promise<LocalizationResult> {
  // American accent uses the original voice - no localization needed
  if (accent === 'american') {
    const originalVoiceId = getVoiceIdForPersona(personaId);
    return {
      voiceId: originalVoiceId,
      isLocalized: false,
      accent: 'american',
      cached: true,
    };
  }

  // Check cache first
  const cacheKey = `${personaId}:${accent}`;
  const cached = localizedVoiceCache.get(cacheKey);
  if (cached) {
    log.debug({ personaId, accent, voiceId: cached.id }, '🌍 Using cached localized voice');
    return {
      voiceId: cached.id,
      isLocalized: true,
      accent,
      cached: true,
    };
  }

  // Need to create a new localized voice
  log.info({ personaId, accent }, '🌍 Creating localized voice via Cartesia API');

  const originalVoiceId = getVoiceIdForPersona(personaId);
  const personaMeta = PERSONA_VOICE_META[personaId] || { name: personaId, gender: 'female' };
  const dialect = ACCENT_TO_DIALECT[accent];

  try {
    const response = await callLocalizeApi({
      voice_id: originalVoiceId,
      name: `${personaMeta.name} (${accent})`,
      description: `Localized ${personaMeta.name} voice with ${accent} English accent`,
      language: 'en',
      original_speaker_gender: personaMeta.gender,
      dialect,
    });

    // Cache the result
    const localizedVoice: LocalizedVoice = {
      id: response.id,
      name: response.name,
      description: response.description,
      language: response.language,
      dialect,
      originalVoiceId,
      createdAt: response.created_at,
    };

    localizedVoiceCache.set(cacheKey, localizedVoice);

    // Persist to Firestore for future restarts
    void saveToFirestore(cacheKey, localizedVoice);

    log.info(
      {
        personaId,
        accent,
        originalVoiceId,
        localizedVoiceId: response.id,
      },
      '✅ Localized voice created and cached'
    );

    return {
      voiceId: response.id,
      isLocalized: true,
      accent,
      cached: false,
    };
  } catch (error) {
    log.error({ personaId, accent, error: String(error) }, '❌ Voice localization failed');

    // Fall back to original voice on error
    return {
      voiceId: originalVoiceId,
      isLocalized: false,
      accent: 'american',
      cached: false,
    };
  }
}

/**
 * Synchronous version that returns from cache only.
 * Use this when you can't await (e.g., in TTS constructor).
 *
 * Returns the original voice ID if not cached.
 */
export function getLocalizedVoiceIdSync(personaId: string, accent: EnglishAccent): string {
  if (accent === 'american') {
    return getVoiceIdForPersona(personaId);
  }

  const cacheKey = `${personaId}:${accent}`;
  const cached = localizedVoiceCache.get(cacheKey);

  if (cached) {
    return cached.id;
  }

  // Not cached - return original and log warning
  log.warn(
    { personaId, accent },
    '⚠️ Localized voice not cached, using original. Call preWarmLocalizedVoices() at startup.'
  );
  return getVoiceIdForPersona(personaId);
}

/**
 * Pre-warm the localized voice cache for common persona + accent combinations.
 * Call this at application startup to avoid API calls during user sessions.
 *
 * @param personaIds - Personas to pre-warm (defaults to all)
 * @param accents - Accents to pre-warm (defaults to all non-American)
 */
export async function preWarmLocalizedVoices(
  personaIds: string[] = Object.keys(PERSONA_VOICE_META),
  accents: EnglishAccent[] = ['british', 'australian', 'indian']
): Promise<void> {
  log.info({ personaIds, accents }, '🔥 Pre-warming localized voice cache');

  const results: Array<{ personaId: string; accent: string; success: boolean }> = [];

  for (const personaId of personaIds) {
    for (const accent of accents) {
      try {
        await getLocalizedVoiceId(personaId, accent);
        results.push({ personaId, accent, success: true });
      } catch (error) {
        log.error({ personaId, accent, error: String(error) }, 'Pre-warm failed for voice');
        results.push({ personaId, accent, success: false });
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  log.info(
    { total: results.length, success: successCount, failed: results.length - successCount },
    '✅ Voice cache pre-warming complete'
  );
}

/**
 * Check if a localized voice is cached.
 */
export function isVoiceCached(personaId: string, accent: EnglishAccent): boolean {
  if (accent === 'american') return true;
  const cacheKey = `${personaId}:${accent}`;
  return localizedVoiceCache.has(cacheKey);
}

/**
 * Get cache statistics.
 */
export function getLocalizationCacheStats(): {
  size: number;
  entries: Array<{ personaId: string; accent: string; voiceId: string }>;
} {
  const entries: Array<{ personaId: string; accent: string; voiceId: string }> = [];

  for (const [key, voice] of localizedVoiceCache) {
    const [personaId, accent] = key.split(':');
    entries.push({ personaId, accent, voiceId: voice.id });
  }

  return { size: localizedVoiceCache.size, entries };
}

/**
 * Clear the cache (for testing).
 * @param clearFirestore - Also clear Firestore (default: false for tests)
 */
export async function clearLocalizationCache(clearFirestore = false): Promise<void> {
  const keys = Array.from(localizedVoiceCache.keys());
  localizedVoiceCache.clear();
  cacheLoadedFromFirestore = false;

  if (clearFirestore) {
    for (const key of keys) {
      await deleteFromFirestore(key);
    }
    log.info({ count: keys.length }, '🗑️ Localization cache cleared (including Firestore)');
  } else {
    log.info('🗑️ Localization cache cleared');
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the localization service.
 * Call this at application startup.
 *
 * @param options.loadFromFirestore - Load cached voices from Firestore (default: true)
 * @param options.preWarm - Pre-warm cache by calling Cartesia API (default: false)
 */
export async function initializeLocalizationService(
  options: { loadFromFirestore?: boolean; preWarm?: boolean } = {}
): Promise<void> {
  const { loadFromFirestore = true, preWarm = false } = options;

  log.info('🌍 Cartesia voice localization service initializing...');

  // Load existing localized voices from Firestore
  if (loadFromFirestore) {
    const loaded = await loadCacheFromFirestore();
    if (loaded > 0) {
      log.info({ loaded }, '✅ Loaded localized voices from Firestore cache');
    }
  }

  // Pre-warm by calling Cartesia API for any missing voices
  if (preWarm) {
    // Only pre-warm Ferni initially (most used)
    // Other personas will be localized on-demand
    await preWarmLocalizedVoices(['ferni'], ['british', 'australian', 'indian']);
  }

  log.info({ cacheSize: localizedVoiceCache.size }, '🌍 Cartesia voice localization service ready');
}
