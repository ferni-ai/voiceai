/**
 * Confirm a city name with Google Places. Returns only the place ID.
 *
 * Used once, when a caller agrees to be remembered (never on a search). Google
 * may not be stored beyond the place ID, so the name, address and coordinates
 * are never requested or kept. The caller's own words are what gets saved.
 * A street, a business or an unknown name has no locality, so it returns null.
 *
 * @module tools/domains/local-search/places-locality
 */

import {
  googleMapsKey,
  MAPS_KEY_LEGACY,
  mapsHttpOutcome,
} from '../../../config/google-maps-key.js';

/** The key chain this caller read before GOOGLE_MAPS_SERVER_KEY (config/google-maps-key.ts). */
const MAPS_KEY = { legacy: MAPS_KEY_LEGACY.placesThenGeneral };

const PLACES_API_NEW = 'https://places.googleapis.com/v1';

export interface CityMatch {
  placeId: string;
}

/** The place ID of the city a name refers to, or null when Places finds no locality for it. Throws when the lookup itself fails. */
export async function findCityByName(name: string): Promise<CityMatch | null> {
  const apiKey = googleMapsKey(MAPS_KEY);
  if (!apiKey) throw new Error('Places lookup failed: unconfigured');

  const response = await fetch(`${PLACES_API_NEW}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.types',
    },
    body: JSON.stringify({ textQuery: name, pageSize: 1, languageCode: 'en' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(
      `Places lookup failed: ${mapsHttpOutcome(response.status)} (${response.status})`
    );
  }

  // A non-JSON reply's parse error quotes the start of the body, so it is replaced, not passed on.
  let data: { places?: Array<{ id?: unknown; types?: unknown }> };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error('Places lookup returned an unreadable reply');
  }
  const place = data.places?.[0];
  if (typeof place?.id !== 'string' || !Array.isArray(place.types)) return null;
  if (!place.types.includes('locality')) return null;
  return { placeId: place.id };
}
