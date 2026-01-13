/**
 * Shared Geocoding Utilities
 *
 * Fast geocoding with provider fallbacks:
 * 1. Google Geocoding API (primary, ~50-150ms)
 * 2. Open-Meteo Geocoding API (fallback, free, no key required)
 *
 * Used by weather tools, traffic tools, and other location-based services.
 */
export interface GeocodingResult {
    latitude: number;
    longitude: number;
    name: string;
    country?: string;
    admin1?: string;
}
/**
 * Google Geocoding API (~50-150ms, very fast)
 * Requires GOOGLE_API_KEY environment variable
 */
export declare function geocodeWithGoogle(location: string): Promise<GeocodingResult | null>;
/**
 * Open-Meteo Geocoding (free fallback, ~200-500ms)
 * No API key required
 */
export declare function geocodeWithOpenMeteo(location: string): Promise<GeocodingResult | null>;
/**
 * Geocode a location using available providers with automatic fallback.
 * Priority: Google (fast) → Open-Meteo (free fallback)
 *
 * @param location - City name, address, or place name
 * @returns Geocoding result with coordinates and location name, or null if not found
 */
export declare function geocodeLocation(location: string): Promise<GeocodingResult | null>;
/**
 * Format a geocoding result as a display name.
 * E.g., "San Francisco, California" or "Paris"
 */
export declare function formatLocationName(geo: GeocodingResult): string;
//# sourceMappingURL=geocoding.d.ts.map