/**
 * Location Preference Service
 *
 * Stores and retrieves user's preferred location for weather and other
 * location-based tools.
 *
 * Location is detected at session start from the user's IP address via the
 * UI server (which can see the real client IP). The voice agent receives this
 * in the token metadata and should call `setSessionLocation()` to make it
 * available for tools.
 *
 * Priority:
 * 1. Session location (from IP geo at token generation - most accurate)
 * 2. User's explicit preference (if they told us their city)
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 10000; // Prevent unbounded memory growth

// In-memory cache for user locations with LRU eviction
// Key: userId, Value: { location, timestamp, source }
const locationCache = new Map<
  string,
  { location: string; timestamp: number; source: 'session' | 'explicit' }
>();

/**
 * Evict oldest entries if cache exceeds max size (LRU-style).
 * Prioritizes removing session entries over explicit user preferences.
 */
function evictStaleEntries(): void {
  if (locationCache.size <= MAX_CACHE_SIZE) return;

  const now = Date.now();
  const entriesToRemove: string[] = [];

  // First pass: remove expired entries
  for (const [userId, entry] of locationCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      entriesToRemove.push(userId);
    }
  }
  entriesToRemove.forEach((id) => locationCache.delete(id));

  // If still over limit, remove oldest session entries first
  if (locationCache.size > MAX_CACHE_SIZE) {
    const sessionEntries = [...locationCache.entries()]
      .filter(([, entry]) => entry.source === 'session')
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = locationCache.size - MAX_CACHE_SIZE;
    sessionEntries.slice(0, toRemove).forEach(([userId]) => {
      locationCache.delete(userId);
    });

    if (entriesToRemove.length > 0 || toRemove > 0) {
      log.debug({ evicted: entriesToRemove.length + toRemove }, '📍 Cache eviction completed');
    }
  }
}

/**
 * Set user's location from session metadata (IP geolocation done by UI server)
 *
 * This should be called when the voice agent receives the session metadata
 * which contains the user's IP-detected city from the token endpoint.
 *
 * @param userId - User ID
 * @param city - City name (e.g., "San Francisco")
 * @param regionCode - State/region code (e.g., "CA" or "California")
 * @param countryCode - Country code (e.g., "US")
 */
export function setSessionLocation(
  userId: string,
  city?: string,
  regionCode?: string,
  _countryCode?: string
): void {
  if (!city) {
    log.debug({ userId }, '📍 No city in session metadata');
    return;
  }

  // Format as "City, Region" for weather lookups
  const location = regionCode ? `${city}, ${regionCode}` : city;

  // Only set if we don't have an explicit user preference
  const existing = locationCache.get(userId);
  if (existing?.source === 'explicit') {
    log.debug(
      { userId, existing: existing.location, new: location },
      '📍 Keeping explicit location'
    );
    return;
  }

  locationCache.set(userId, { location, timestamp: Date.now(), source: 'session' });
  evictStaleEntries();
  log.info({ userId, location, source: 'session' }, '📍 Session location set from IP geo');
}

/**
 * Get user's location preference
 * Returns the cached location (from session or explicit preference)
 *
 * Note: Currently sync but kept async for future Firestore persistence
 */
export function getUserLocationPreference(userId: string): string | null {
  // Check in-memory cache
  const cached = locationCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    log.debug(
      { userId, location: cached.location, source: cached.source },
      '📍 Using cached location'
    );
    return cached.location;
  }

  // No location available - will need to ask user
  log.debug({ userId }, '📍 No location available for user');
  return null;
}

/**
 * Save user's explicit location preference
 * Called when user tells us their city in conversation
 * This overrides the IP-detected session location
 *
 * Note: Currently sync but kept with Promise return for future Firestore persistence
 */
export function setUserLocationPreference(userId: string, location: string): boolean {
  // Normalize location (capitalize first letter of each word)
  const normalized = location
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Save to in-memory cache (marked as explicit - overrides session location)
  locationCache.set(userId, { location: normalized, timestamp: Date.now(), source: 'explicit' });
  evictStaleEntries();

  log.info({ userId, location: normalized, source: 'explicit' }, '📍 User set explicit location');

  // Future: Persist to Firestore
  // await store.saveUserPreference(userId, 'defaultLocation', normalized);

  return true;
}

/**
 * Clear user's location preference cache (useful for testing or explicit clear)
 */
export function clearLocationCache(userId?: string): void {
  if (userId) {
    locationCache.delete(userId);
    log.debug({ userId }, '📍 Cleared location cache for user');
  } else {
    locationCache.clear();
    log.debug('📍 Cleared all location cache');
  }
}

/**
 * Check if a string looks like a location (not "current" or empty)
 */
export function isValidLocation(location: string | undefined | null): boolean {
  if (!location) return false;
  const normalized = location.trim().toLowerCase();
  return (
    normalized !== '' &&
    normalized !== 'current' &&
    normalized !== 'here' &&
    normalized !== 'my location' &&
    normalized.length > 1
  );
}
