/**
 * Shared Geocoding Utilities
 *
 * Fast geocoding with provider fallbacks:
 * 1. Google Geocoding API (primary, ~50-150ms)
 * 2. Open-Meteo Geocoding API (fallback, free, no key required)
 *
 * Used by weather tools, traffic tools, and other location-based services.
 */

import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  admin1?: string; // State/Province
}

// ============================================================================
// GOOGLE GEOCODING API
// ============================================================================

/**
 * Google Geocoding API (~50-150ms, very fast)
 * Requires GOOGLE_API_KEY environment variable
 */
export async function geocodeWithGoogle(location: string): Promise<GeocodingResult | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    log.debug({ location }, '📍 Google geocoding skipped - no API key');
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });

    if (!response.ok) {
      log.warn({ location, status: response.status }, '📍 Google geocoding HTTP error');
      return null;
    }

    const data = (await response.json()) as {
      status: string;
      error_message?: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
        address_components?: Array<{
          long_name: string;
          types: string[];
        }>;
      }>;
    };

    if (data.status !== 'OK' || !data.results?.length) {
      log.warn(
        { location, status: data.status, error: data.error_message },
        '📍 Google geocoding returned no results'
      );
      return null;
    }

    const result = data.results[0];
    const coords = result.geometry?.location;
    if (!coords) return null;

    // Extract city and state from address components
    const components = result.address_components || [];
    const city = components.find((c) => c.types.includes('locality'))?.long_name;
    const state = components.find((c) =>
      c.types.includes('administrative_area_level_1')
    )?.long_name;
    const country = components.find((c) => c.types.includes('country'))?.long_name;

    return {
      latitude: coords.lat,
      longitude: coords.lng,
      name: city || location,
      admin1: state,
      country,
    };
  } catch (error) {
    log.warn({ location, error: String(error) }, '📍 Google geocoding exception');
    return null;
  }
}

// ============================================================================
// OPEN-METEO GEOCODING API
// ============================================================================

/**
 * Open-Meteo Geocoding (free fallback, ~200-500ms)
 * No API key required
 */
export async function geocodeWithOpenMeteo(location: string): Promise<GeocodingResult | null> {
  // Open-Meteo doesn't like "City, State" format - extract just the city name
  // "San Francisco, California" → "San Francisco"
  // "New York, New York" → "New York"
  const cityOnly = location.split(',')[0].trim();

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityOnly)}&count=1`;
    log.debug({ location, cityOnly, url }, '📍 Open-Meteo geocoding request');

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      log.warn(
        { location, cityOnly, status: response.status },
        '📍 Open-Meteo geocoding HTTP error'
      );
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        country?: string;
        admin1?: string;
      }>;
    };

    if (!data.results?.length) {
      log.warn({ location, cityOnly }, '📍 Open-Meteo returned no results');
      return null;
    }

    const result = data.results[0];
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      name: result.name,
      country: result.country,
      admin1: result.admin1,
    };
  } catch (error) {
    log.warn({ location, cityOnly, error: String(error) }, '📍 Open-Meteo geocoding exception');
    return null;
  }
}

// ============================================================================
// UNIFIED GEOCODING
// ============================================================================

/**
 * Geocode a location using available providers with automatic fallback.
 * Priority: Google (fast) → Open-Meteo (free fallback)
 *
 * @param location - City name, address, or place name
 * @returns Geocoding result with coordinates and location name, or null if not found
 */
export async function geocodeLocation(location: string): Promise<GeocodingResult | null> {
  const startTime = Date.now();

  // Try Google first (faster, ~50-150ms vs ~200-500ms)
  const googleResult = await geocodeWithGoogle(location);
  if (googleResult) {
    log.debug({ location, provider: 'google', ms: Date.now() - startTime }, '📍 Geocoded');
    return googleResult;
  }

  // Fall back to Open-Meteo (free, no API key needed)
  const openMeteoResult = await geocodeWithOpenMeteo(location);
  if (openMeteoResult) {
    log.debug({ location, provider: 'open-meteo', ms: Date.now() - startTime }, '📍 Geocoded');
    return openMeteoResult;
  }

  log.warn({ location, ms: Date.now() - startTime }, '📍 Geocoding failed');
  return null;
}

/**
 * Format a geocoding result as a display name.
 * E.g., "San Francisco, California" or "Paris"
 */
export function formatLocationName(geo: GeocodingResult): string {
  return geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;
}
