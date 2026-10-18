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

const PLACES_API_NEW = 'https://places.googleapis.com/v1';

export interface CityMatch {
  placeId: string;
}

/** The place ID of the city a name refers to, or null when Places finds no locality for it. Throws when the lookup itself fails. */
export async function findCityByName(name: string): Promise<CityMatch | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) throw new Error('Google Places API key is not configured');

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
  if (!response.ok) throw new Error(`Places lookup failed with status ${response.status}`);

  const data = (await response.json()) as { places?: Array<{ id?: string; types?: string[] }> };
  const place = data.places?.[0];
  if (!place?.types?.includes('locality') || !place.id) return null;
  return { placeId: place.id };
}
