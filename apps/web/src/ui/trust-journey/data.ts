/**
 * Trust Journey Data Layer
 *
 * Handles data fetching, caching, and offline support.
 */

import { createLogger } from '../../utils/logger.js';
import type { TrustJourneyData, TrustJourneyState } from './types.js';

const log = createLogger('TrustJourneyData');

const CACHE_KEY_PREFIX = 'ferni_trust_journey_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedData {
  data: TrustJourneyData;
  timestamp: number;
}

/**
 * Get the user-scoped cache key
 * @returns Cache key unique to the current user
 */
function getCacheKey(): string {
  const userId = getUserId();
  // Include userId in key to prevent cross-user data leakage
  return userId ? `${CACHE_KEY_PREFIX}_${userId}` : CACHE_KEY_PREFIX;
}

/**
 * Get the current user ID
 * @returns User ID or null if not logged in
 */
export function getUserId(): string | null {
  const userId = localStorage.getItem('ferni_user_id');
  if (!userId) {
    log.warn('No user ID found - user may not be logged in');
    return null;
  }
  return userId;
}

/**
 * Load cached data from localStorage
 */
export function loadFromCache(): TrustJourneyData | null {
  try {
    const cacheKey = getCacheKey();
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed: CachedData = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    if (age > CACHE_TTL) {
      log.debug('Cache expired');
      return null;
    }

    log.debug('Loaded from cache', { age: Math.round(age / 1000) + 's' });
    return parsed.data;
  } catch {
    log.warn('Failed to load from cache');
    return null;
  }
}

/**
 * Save data to localStorage cache
 */
export function saveToCache(data: TrustJourneyData): void {
  try {
    const cacheKey = getCacheKey();
    const cached: CachedData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cached));
    log.debug('Saved to cache');
  } catch {
    log.warn('Failed to save to cache');
  }
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  const cacheKey = getCacheKey();
  localStorage.removeItem(cacheKey);
}

/**
 * Check if we're online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Fetch journey data from the API
 */
export async function fetchJourneyData(
  state: TrustJourneyState,
  forceRefresh = false
): Promise<{ data: TrustJourneyData | null; error: string | null; fromCache: boolean }> {
  // Return cached in-memory data if available
  if (state.cachedData && !forceRefresh) {
    return { data: state.cachedData, error: null, fromCache: true };
  }

  const userId = getUserId();
  if (!userId) {
    return { 
      data: null, 
      error: 'notLoggedIn',
      fromCache: false 
    };
  }

  // Check offline first
  if (!isOnline()) {
    const cached = loadFromCache();
    if (cached) {
      return { data: cached, error: null, fromCache: true };
    }
    return { 
      data: null, 
      error: 'offline',
      fromCache: false 
    };
  }

  try {
    const response = await fetch(`/api/trust-journey?userId=${encodeURIComponent(userId)}`, {
      headers: {
        'x-user-id': userId,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { data: null, error: 'unauthorized', fromCache: false };
      }
      if (response.status === 429) {
        return { data: null, error: 'rateLimited', fromCache: false };
      }
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data: TrustJourneyData = await response.json();

    // Normalize data (handle backend/frontend type differences)
    const normalizedData = normalizeData(data);

    // Cache the data
    saveToCache(normalizedData);

    return { data: normalizedData, error: null, fromCache: false };
  } catch (err) {
    log.error('Failed to fetch trust journey data:', err);

    // Try to load from cache on error
    const cached = loadFromCache();
    if (cached) {
      return { data: cached, error: 'fetchFailedUsingCache', fromCache: true };
    }

    return { data: null, error: 'fetchFailed', fromCache: false };
  }
}

/**
 * Normalize data from backend to match frontend expectations
 */
function normalizeData(data: TrustJourneyData): TrustJourneyData {
  // Handle growth pattern type differences
  // Backend sends `significance`, frontend uses `count`
  if (data.growth?.patterns) {
    data.growth.patterns = data.growth.patterns.map((p) => ({
      ...p,
      // Ensure count exists (backend may send it as timesObserved or similar)
      count: p.count || 1,
    }));
  }

  // Handle wins type differences
  if (data.celebrations?.wins) {
    data.celebrations.wins = data.celebrations.wins.map((w) => ({
      ...w,
      // Normalize description field
      whatHappened: w.whatHappened || w.description || '',
    }));
  }

  // Handle inside jokes type differences
  if (data.sharedHistory?.insideJokes) {
    data.sharedHistory.insideJokes = data.sharedHistory.insideJokes.map((j) => ({
      ...j,
      // Normalize reference count
      timesReferenced: j.timesReferenced || j.callbackCount || 0,
    }));
  }

  return data;
}

/**
 * Export trust data as JSON file
 */
export async function exportTrustData(): Promise<{ success: boolean; error?: string }> {
  const userId = getUserId();
  if (!userId) {
    return { success: false, error: 'notLoggedIn' };
  }

  if (!isOnline()) {
    return { success: false, error: 'offline' };
  }

  try {
    const response = await fetch(`/api/trust-journey?userId=${encodeURIComponent(userId)}`, {
      headers: { 'x-user-id': userId },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();

    // Create downloadable JSON file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ferni-trust-journey-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log.info('Trust journey exported');
    return { success: true };
  } catch (err) {
    log.error('Failed to export trust data:', err);
    return { success: false, error: 'exportFailed' };
  }
}

