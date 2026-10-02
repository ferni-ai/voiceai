/**
 * Geolocation Service - "Better Than Human" Edition
 *
 * Unlike a human friend who awkwardly asks "Where are you?", Ferni learns
 * your location gracefully through layered detection:
 *
 * 1. PASSIVE (no permission needed):
 *    - Timezone → rough region (America/Los_Angeles → California)
 *    - Accept-Language → country hint
 *    - IP lookup (backend) → city-level estimate
 *
 * 2. PRECISE (permission required):
 *    - Browser Geolocation API → GPS-level accuracy
 *    - Only asked when genuinely helpful (first weather mention, etc.)
 *    - Warm, human explanation shown BEFORE browser prompt
 *
 * 3. MANUAL OVERRIDE:
 *    - Users can set their city manually (privacy-conscious)
 *    - Respected permanently
 *
 * BETTER THAN HUMAN PHILOSOPHY:
 * - Never ask on page load (jarring)
 * - Explain the benefit warmly ("So I can mention your local weather")
 * - Remember forever (localStorage + backend sync)
 * - Graceful silence if denied (no guilt, no nagging)
 *
 * @example
 * import { getLocation, requestPreciseLocation, setManualLocation } from './services/geolocation.service.js';
 *
 * // Get current best-known location (passive sources)
 * const loc = await getLocation();
 * console.log(loc.city, loc.countryCode);
 *
 * // Request precise location (with warm prompt)
 * const precise = await requestPreciseLocation('weather');
 * if (precise.success) {
 *   console.log('Got precise location:', precise.city);
 * }
 *
 * // Let user set manually
 * await setManualLocation({ city: 'Portland', regionCode: 'OR', countryCode: 'US' });
 */

import { createLogger } from '../utils/logger.js';
import { getApiHeadersAsync } from '../utils/api.js';
import { getUserTimezone } from './timezone.service.js';

const log = createLogger('GeolocationService');

// ============================================================================
// TYPES
// ============================================================================

export interface LocationData {
  /** City name (e.g., "San Francisco") */
  city?: string;
  /** Region/state code (e.g., "CA") */
  regionCode?: string;
  /** ISO 3166-1 country code (e.g., "US") */
  countryCode?: string;
  /** Latitude (only from precise location) */
  latitude?: number;
  /** Longitude (only from precise location) */
  longitude?: number;
  /** How this location was determined */
  source: LocationSource;
  /** When this was last updated */
  lastUpdated: string;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

export type LocationSource =
  | 'browser-gps' // Browser Geolocation API (most precise)
  | 'manual' // User set manually
  | 'ip-geo' // IP geolocation (backend)
  | 'timezone' // Inferred from timezone
  | 'accept-language' // Inferred from language
  | 'default'; // No data available

export interface PreciseLocationResult {
  success: boolean;
  location?: LocationData;
  /** If denied, why (user denied, timeout, unavailable) */
  deniedReason?: 'user-denied' | 'timeout' | 'unavailable' | 'already-denied';
}

/** Context for why we're asking for location (affects the warm prompt) */
export type LocationRequestContext =
  | 'weather' // "So I can mention your local weather"
  | 'events' // "So I can find events near you"
  | 'timezone' // "So I know what time it is for you"
  | 'personalization'; // "So I can personalize our conversations"

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'ferni_location';
const PERMISSION_KEY = 'ferni_location_permission';

interface StoredLocationData extends LocationData {
  /** Stored permission state */
  permissionState?: 'granted' | 'denied' | 'prompt';
}

function loadStoredLocation(): StoredLocationData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredLocationData;
    }
  } catch {
    log.debug('No stored location found');
  }
  return null;
}

function saveLocation(data: LocationData): void {
  try {
    const stored: StoredLocationData = {
      ...data,
      permissionState: getStoredPermissionState(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    log.debug({ source: data.source, city: data.city }, '💾 Location saved');
  } catch {
    log.warn('Failed to save location to localStorage');
  }
}

function getStoredPermissionState(): 'granted' | 'denied' | 'prompt' | undefined {
  try {
    return localStorage.getItem(PERMISSION_KEY) as 'granted' | 'denied' | 'prompt' | undefined;
  } catch {
    return undefined;
  }
}

function setStoredPermissionState(state: 'granted' | 'denied' | 'prompt'): void {
  try {
    localStorage.setItem(PERMISSION_KEY, state);
  } catch {
    log.warn('Failed to save permission state');
  }
}

// ============================================================================
// TIMEZONE → LOCATION INFERENCE
// ============================================================================

/**
 * Timezone to approximate location mapping.
 * Not precise, but gives us a starting point without any permissions.
 */
const TIMEZONE_LOCATION_MAP: Record<
  string,
  { city: string; regionCode?: string; countryCode: string }
> = {
  // US
  'America/New_York': { city: 'New York', regionCode: 'NY', countryCode: 'US' },
  'America/Chicago': { city: 'Chicago', regionCode: 'IL', countryCode: 'US' },
  'America/Denver': { city: 'Denver', regionCode: 'CO', countryCode: 'US' },
  'America/Los_Angeles': { city: 'Los Angeles', regionCode: 'CA', countryCode: 'US' },
  'America/Phoenix': { city: 'Phoenix', regionCode: 'AZ', countryCode: 'US' },
  'America/Anchorage': { city: 'Anchorage', regionCode: 'AK', countryCode: 'US' },
  'Pacific/Honolulu': { city: 'Honolulu', regionCode: 'HI', countryCode: 'US' },

  // UK
  'Europe/London': { city: 'London', countryCode: 'GB' },

  // Europe
  'Europe/Paris': { city: 'Paris', countryCode: 'FR' },
  'Europe/Berlin': { city: 'Berlin', countryCode: 'DE' },
  'Europe/Rome': { city: 'Rome', countryCode: 'IT' },
  'Europe/Madrid': { city: 'Madrid', countryCode: 'ES' },
  'Europe/Amsterdam': { city: 'Amsterdam', countryCode: 'NL' },
  'Europe/Brussels': { city: 'Brussels', countryCode: 'BE' },
  'Europe/Zurich': { city: 'Zurich', countryCode: 'CH' },
  'Europe/Vienna': { city: 'Vienna', countryCode: 'AT' },
  'Europe/Stockholm': { city: 'Stockholm', countryCode: 'SE' },
  'Europe/Oslo': { city: 'Oslo', countryCode: 'NO' },
  'Europe/Copenhagen': { city: 'Copenhagen', countryCode: 'DK' },
  'Europe/Helsinki': { city: 'Helsinki', countryCode: 'FI' },
  'Europe/Dublin': { city: 'Dublin', countryCode: 'IE' },
  'Europe/Lisbon': { city: 'Lisbon', countryCode: 'PT' },
  'Europe/Athens': { city: 'Athens', countryCode: 'GR' },
  'Europe/Prague': { city: 'Prague', countryCode: 'CZ' },
  'Europe/Warsaw': { city: 'Warsaw', countryCode: 'PL' },

  // Asia
  'Asia/Tokyo': { city: 'Tokyo', countryCode: 'JP' },
  'Asia/Shanghai': { city: 'Shanghai', countryCode: 'CN' },
  'Asia/Hong_Kong': { city: 'Hong Kong', countryCode: 'HK' },
  'Asia/Singapore': { city: 'Singapore', countryCode: 'SG' },
  'Asia/Seoul': { city: 'Seoul', countryCode: 'KR' },
  'Asia/Bangkok': { city: 'Bangkok', countryCode: 'TH' },
  'Asia/Kolkata': { city: 'Mumbai', countryCode: 'IN' },
  'Asia/Dubai': { city: 'Dubai', countryCode: 'AE' },
  'Asia/Jerusalem': { city: 'Tel Aviv', countryCode: 'IL' },

  // Australia
  'Australia/Sydney': { city: 'Sydney', regionCode: 'NSW', countryCode: 'AU' },
  'Australia/Melbourne': { city: 'Melbourne', regionCode: 'VIC', countryCode: 'AU' },
  'Australia/Brisbane': { city: 'Brisbane', regionCode: 'QLD', countryCode: 'AU' },
  'Australia/Perth': { city: 'Perth', regionCode: 'WA', countryCode: 'AU' },
  'Australia/Adelaide': { city: 'Adelaide', regionCode: 'SA', countryCode: 'AU' },

  // New Zealand
  'Pacific/Auckland': { city: 'Auckland', countryCode: 'NZ' },

  // Canada
  'America/Toronto': { city: 'Toronto', regionCode: 'ON', countryCode: 'CA' },
  'America/Vancouver': { city: 'Vancouver', regionCode: 'BC', countryCode: 'CA' },
  'America/Edmonton': { city: 'Edmonton', regionCode: 'AB', countryCode: 'CA' },
  'America/Winnipeg': { city: 'Winnipeg', regionCode: 'MB', countryCode: 'CA' },
  'America/Halifax': { city: 'Halifax', regionCode: 'NS', countryCode: 'CA' },

  // Latin America
  'America/Mexico_City': { city: 'Mexico City', countryCode: 'MX' },
  'America/Sao_Paulo': { city: 'São Paulo', countryCode: 'BR' },
  'America/Buenos_Aires': { city: 'Buenos Aires', countryCode: 'AR' },
  'America/Bogota': { city: 'Bogotá', countryCode: 'CO' },
  'America/Lima': { city: 'Lima', countryCode: 'PE' },
  'America/Santiago': { city: 'Santiago', countryCode: 'CL' },
};

function inferLocationFromTimezone(): LocationData | null {
  const timezone = getUserTimezone();
  const mapped = TIMEZONE_LOCATION_MAP[timezone];

  if (mapped) {
    return {
      ...mapped,
      source: 'timezone',
      lastUpdated: new Date().toISOString(),
      confidence: 'low',
    };
  }

  return null;
}

// ============================================================================
// REVERSE GEOCODING (coordinates → city name)
// ============================================================================

interface ReverseGeocodeResult {
  city?: string;
  regionCode?: string;
  countryCode?: string;
}

/**
 * Reverse geocode coordinates to city name.
 * Uses free Nominatim API (OpenStreetMap).
 */
async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
      {
        headers: {
          // Required by Nominatim usage policy
          'User-Agent': 'FerniAI/1.0 (contact@ferni.ai)',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
        country_code?: string;
      };
    };

    const address = data.address;
    if (!address) return null;

    return {
      city: address.city || address.town || address.village || address.municipality,
      regionCode: address.state,
      countryCode: address.country_code?.toUpperCase(),
    };
  } catch (error) {
    log.debug({ error }, 'Reverse geocode failed');
    return null;
  }
}

// ============================================================================
// BROWSER GEOLOCATION API
// ============================================================================

/**
 * Request precise location from browser.
 * Returns the raw coordinates and reverse-geocoded city.
 */
async function getBrowserLocation(timeoutMs = 10000): Promise<{
  success: boolean;
  coords?: { latitude: number; longitude: number };
  error?: GeolocationPositionError;
}> {
  if (!navigator.geolocation) {
    return { success: false };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          success: true,
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      },
      (error) => {
        resolve({ success: false, error });
      },
      {
        enableHighAccuracy: false, // Don't need GPS precision, city-level is fine
        timeout: timeoutMs,
        maximumAge: 5 * 60 * 1000, // Accept cached position up to 5 min old
      }
    );
  });
}

// ============================================================================
// BACKEND SYNC
// ============================================================================

/**
 * Sync location to backend so voice agent knows where user is.
 */
async function syncLocationToBackend(location: LocationData): Promise<boolean> {
  const userId = localStorage.getItem('ferni_user_id');
  if (!userId) {
    log.debug('No user ID, skipping location sync');
    return false;
  }

  try {
    // Use getApiHeadersAsync for proper Firebase auth
    const authHeaders = await getApiHeadersAsync(true);
    
    const response = await fetch('/api/user/location', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        userId,
        ...location,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    log.info({ city: location.city, source: location.source }, '🌍 Location synced to backend');
    return true;
  } catch (error) {
    log.debug({ error }, 'Failed to sync location to backend (non-fatal)');
    return false;
  }
}

// ============================================================================
// WARM PROMPT MESSAGES
// ============================================================================

const WARM_PROMPTS: Record<LocationRequestContext, { title: string; message: string }> = {
  weather: {
    title: 'Local weather',
    message: 'So I can mention your local weather and help you plan your day.',
  },
  events: {
    title: 'Nearby events',
    message: 'So I can tell you about interesting things happening near you.',
  },
  timezone: {
    title: 'Your time zone',
    message: 'So I know what time it is for you and can be more helpful.',
  },
  personalization: {
    title: 'Personalization',
    message: 'So our conversations can feel more personal and relevant to you.',
  },
};

// ============================================================================
// PUBLIC API
// ============================================================================

let cachedLocation: LocationData | null = null;

/**
 * Get the best-known location without requesting new permissions.
 *
 * Priority:
 * 1. Cached precise location (browser GPS or manual)
 * 2. Stored location from localStorage
 * 3. Inferred from timezone
 * 4. Default (no location)
 */
export async function getLocation(): Promise<LocationData> {
  // 1. Check memory cache
  if (cachedLocation && cachedLocation.confidence !== 'low') {
    return cachedLocation;
  }

  // 2. Check localStorage
  const stored = loadStoredLocation();
  if (stored && stored.source !== 'default') {
    cachedLocation = stored;
    return stored;
  }

  // 3. Infer from timezone (low confidence but immediate)
  const fromTimezone = inferLocationFromTimezone();
  if (fromTimezone) {
    cachedLocation = fromTimezone;
    // Don't save timezone inference - it's just a fallback
    return fromTimezone;
  }

  // 4. Default - no location available
  const defaultLocation: LocationData = {
    source: 'default',
    lastUpdated: new Date().toISOString(),
    confidence: 'low',
  };
  return defaultLocation;
}

/**
 * Request precise location from the browser.
 *
 * BETTER THAN HUMAN BEHAVIOR:
 * - If already denied, returns immediately (no nagging)
 * - If already granted, silently refreshes
 * - If first time, caller should show warm prompt first
 *
 * @param context - Why we're asking (affects potential future prompts)
 * @param showWarmPrompt - If true, dispatch event for UI to show warm prompt
 */
export async function requestPreciseLocation(
  context: LocationRequestContext = 'personalization',
  showWarmPrompt = false
): Promise<PreciseLocationResult> {
  // Check if previously denied - respect their choice
  const storedPermission = getStoredPermissionState();
  if (storedPermission === 'denied') {
    log.debug('Location previously denied, respecting user choice');
    return { success: false, deniedReason: 'already-denied' };
  }

  // Check if geolocation is available
  if (!navigator.geolocation) {
    return { success: false, deniedReason: 'unavailable' };
  }

  // Optionally show warm prompt before browser prompt
  if (showWarmPrompt && storedPermission !== 'granted') {
    const promptData = WARM_PROMPTS[context];
    // Dispatch event for UI to handle
    window.dispatchEvent(
      new CustomEvent('ferni:location-prompt', {
        detail: {
          context,
          title: promptData.title,
          message: promptData.message,
        },
      })
    );

    // Wait a moment for UI to show
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Request from browser
  const result = await getBrowserLocation();

  if (!result.success) {
    const reason =
      result.error?.code === 1
        ? 'user-denied'
        : result.error?.code === 3
          ? 'timeout'
          : 'unavailable';

    // Remember denial (don't ask again)
    if (reason === 'user-denied') {
      setStoredPermissionState('denied');
    }

    log.debug({ reason }, 'Precise location request failed');
    return { success: false, deniedReason: reason };
  }

  // Success! Reverse geocode to get city name
  const { latitude, longitude } = result.coords!;
  const geocoded = await reverseGeocode(latitude, longitude);

  const location: LocationData = {
    city: geocoded?.city,
    regionCode: geocoded?.regionCode,
    countryCode: geocoded?.countryCode,
    latitude,
    longitude,
    source: 'browser-gps',
    lastUpdated: new Date().toISOString(),
    confidence: 'high',
  };

  // Save and sync
  setStoredPermissionState('granted');
  saveLocation(location);
  cachedLocation = location;

  // Fire-and-forget backend sync
  syncLocationToBackend(location).catch(() => {});

  log.info({ city: location.city, country: location.countryCode }, '📍 Precise location obtained');
  return { success: true, location };
}

/**
 * Set location manually (for privacy-conscious users).
 * This is the highest priority source - we respect manual overrides.
 */
export async function setManualLocation(location: {
  city: string;
  regionCode?: string;
  countryCode: string;
}): Promise<void> {
  const data: LocationData = {
    ...location,
    source: 'manual',
    lastUpdated: new Date().toISOString(),
    confidence: 'high',
  };

  saveLocation(data);
  cachedLocation = data;

  // Sync to backend
  await syncLocationToBackend(data);

  log.info({ city: location.city }, '📍 Manual location set');
}

/**
 * Update location from backend response (IP geolocation).
 * Only updates if we don't have a better source.
 */
export function updateFromBackend(location: {
  city?: string;
  regionCode?: string;
  countryCode?: string;
}): void {
  const current = loadStoredLocation();

  // Don't override better sources
  if (current && (current.source === 'browser-gps' || current.source === 'manual')) {
    log.debug('Ignoring backend location - have better source');
    return;
  }

  if (location.city || location.countryCode) {
    const data: LocationData = {
      city: location.city,
      regionCode: location.regionCode,
      countryCode: location.countryCode,
      source: 'ip-geo',
      lastUpdated: new Date().toISOString(),
      confidence: 'medium',
    };

    saveLocation(data);
    cachedLocation = data;
    log.debug({ city: location.city }, 'Updated location from backend');
  }
}

/**
 * Clear stored location (for testing or privacy reset).
 */
export function clearLocation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERMISSION_KEY);
    cachedLocation = null;
    log.info('Location data cleared');
  } catch {
    log.warn('Failed to clear location');
  }
}

/**
 * Check if we have any location data.
 */
export function hasLocation(): boolean {
  const loc = loadStoredLocation();
  return loc !== null && loc.source !== 'default';
}

/**
 * Check if user has denied location permission.
 */
export function isLocationDenied(): boolean {
  return getStoredPermissionState() === 'denied';
}

/**
 * Get the warm prompt text for a given context.
 * Useful for UI components that want to show the prompt.
 */
export function getWarmPrompt(context: LocationRequestContext): { title: string; message: string } {
  return WARM_PROMPTS[context];
}

/**
 * Format location for display (e.g., "San Francisco, CA" or "London, UK").
 */
export function formatLocation(location: LocationData): string {
  if (!location.city && !location.countryCode) {
    return '';
  }

  const parts: string[] = [];

  if (location.city) {
    parts.push(location.city);
  }

  if (location.regionCode && location.countryCode === 'US') {
    parts.push(location.regionCode);
  } else if (location.countryCode) {
    parts.push(location.countryCode);
  }

  return parts.join(', ');
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const geolocationService = {
  getLocation,
  requestPreciseLocation,
  setManualLocation,
  updateFromBackend,
  clearLocation,
  hasLocation,
  isLocationDenied,
  getWarmPrompt,
  formatLocation,
};

export default geolocationService;
