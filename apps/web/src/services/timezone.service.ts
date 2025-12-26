/**
 * Timezone Detection Service
 *
 * Automatically detects user timezone and syncs it to the backend.
 * This ensures that outreach calls and notifications respect the user's local time.
 *
 * FEATURES:
 * - Automatic timezone detection using Intl API
 * - Persists to localStorage to avoid redundant API calls
 * - Only updates backend when timezone changes (e.g., user travels)
 * - Provides quiet hours defaults based on detected timezone
 *
 * USAGE:
 * ```typescript
 * import { detectAndSyncTimezone, getUserTimezone } from './services/timezone.service.js';
 *
 * // On app init - detect and sync
 * await detectAndSyncTimezone();
 *
 * // Later - get cached timezone
 * const tz = getUserTimezone();
 * ```
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('TimezoneService');

// ============================================================================
// TYPES
// ============================================================================

interface TimezoneData {
  timezone: string;
  offset: number; // Offset in minutes from UTC
  lastDetected: string; // ISO timestamp
}

interface QuietHoursDefaults {
  start: string; // "22:00"
  end: string; // "08:00"
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_user_timezone';
const API_BASE = '';

// Default quiet hours (10 PM - 8 AM local time)
const DEFAULT_QUIET_HOURS: QuietHoursDefaults = {
  start: '22:00',
  end: '08:00',
};

// ============================================================================
// STATE
// ============================================================================

let cachedTimezone: TimezoneData | null = null;

// ============================================================================
// TIMEZONE DETECTION
// ============================================================================

/**
 * Detect user's timezone using the Intl API
 * Returns IANA timezone string (e.g., "America/Los_Angeles")
 */
export function detectTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone;
  } catch {
    log.warn('Failed to detect timezone, using UTC');
    return 'UTC';
  }
}

/**
 * Get timezone offset in minutes from UTC
 * Positive values = behind UTC, Negative = ahead
 */
export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset();
}

/**
 * Load cached timezone from localStorage
 */
function loadCachedTimezone(): TimezoneData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as TimezoneData;
    }
  } catch {
    log.debug('No cached timezone found');
  }
  return null;
}

/**
 * Save timezone to localStorage
 */
function saveCachedTimezone(data: TimezoneData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    cachedTimezone = data;
  } catch {
    log.warn('Failed to cache timezone');
  }
}

// ============================================================================
// API SYNC
// ============================================================================

/**
 * Sync timezone to backend
 */
async function syncTimezoneToBackend(timezone: string): Promise<boolean> {
  const userId = localStorage.getItem('ferni_user_id');

  if (!userId) {
    log.debug('No user ID, skipping timezone sync');
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/user/timezone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        userId,
        timezone,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    log.info({ timezone }, '🌍 Timezone synced to backend');
    return true;
  } catch (error) {
    log.error({ error, timezone }, 'Failed to sync timezone to backend');
    return false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Detect user timezone and sync to backend if changed
 * Call this on app initialization
 */
export async function detectAndSyncTimezone(): Promise<string> {
  const detectedTimezone = detectTimezone();
  const offset = getTimezoneOffset();
  const now = new Date().toISOString();

  // Load cached timezone
  const cached = loadCachedTimezone();

  // Check if timezone changed
  const hasChanged = !cached || cached.timezone !== detectedTimezone;

  if (hasChanged) {
    log.info(
      { from: cached?.timezone, to: detectedTimezone },
      '🌍 Timezone changed, syncing to backend'
    );

    // Sync to backend
    await syncTimezoneToBackend(detectedTimezone);

    // Cache new timezone
    saveCachedTimezone({
      timezone: detectedTimezone,
      offset,
      lastDetected: now,
    });
  } else {
    log.debug({ timezone: detectedTimezone }, 'Timezone unchanged');
    cachedTimezone = cached;
  }

  return detectedTimezone;
}

/**
 * Get user's cached timezone (call after detectAndSyncTimezone)
 */
export function getUserTimezone(): string {
  if (cachedTimezone) {
    return cachedTimezone.timezone;
  }

  const cached = loadCachedTimezone();
  if (cached) {
    cachedTimezone = cached;
    return cached.timezone;
  }

  // Fall back to detection
  return detectTimezone();
}

/**
 * Get timezone offset in hours
 */
export function getTimezoneOffsetHours(): number {
  return getTimezoneOffset() / 60;
}

/**
 * Get default quiet hours based on typical sleep patterns
 * Returns times in user's local timezone
 */
export function getDefaultQuietHours(): QuietHoursDefaults {
  return { ...DEFAULT_QUIET_HOURS };
}

/**
 * Check if current time is within quiet hours
 * Uses local time for comparison
 */
export function isWithinQuietHours(
  quietStart = DEFAULT_QUIET_HOURS.start,
  quietEnd = DEFAULT_QUIET_HOURS.end
): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startParts = quietStart.split(':').map(Number);
  const endParts = quietEnd.split(':').map(Number);
  const startHour = startParts[0] ?? 22;
  const startMin = startParts[1] ?? 0;
  const endHour = endParts[0] ?? 8;
  const endMin = endParts[1] ?? 0;
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  return currentTime >= startTime && currentTime < endTime;
}

/**
 * Format a date in user's timezone
 */
export function formatInUserTimezone(
  date: Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const timezone = getUserTimezone();
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    ...options,
  });
}

/**
 * Get current local time string for user
 */
export function getCurrentLocalTime(): string {
  return formatInUserTimezone(new Date(), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get friendly timezone name
 */
export function getFriendlyTimezoneName(): string {
  const timezone = getUserTimezone();
  try {
    // Get abbreviated timezone name
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value ?? timezone;
  } catch {
    return timezone;
  }
}

// Export service object
export const timezoneService = {
  detectTimezone,
  detectAndSyncTimezone,
  getUserTimezone,
  getTimezoneOffset,
  getTimezoneOffsetHours,
  getDefaultQuietHours,
  isWithinQuietHours,
  formatInUserTimezone,
  getCurrentLocalTime,
  getFriendlyTimezoneName,
};

export default timezoneService;

