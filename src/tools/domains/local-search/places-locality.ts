/**
 * Confirm a city name with Google Places and keep only the locality it returns.
 *
 * Used once, when a caller agrees to be remembered (never on a search). The
 * caller's own words are not stored: only the city and state Places gives back.
 * A street, a business or an unknown name has no locality, so it returns null.
 *
 * @module tools/domains/local-search/places-locality
 */

const PLACES_API_NEW = 'https://places.googleapis.com/v1';

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

export interface CityMatch {
  city: string;
  regionCode?: string;
}

/** The city a name refers to, or null when Places finds no locality for it. Throws when the lookup itself fails. */
export async function findCityByName(name: string): Promise<CityMatch | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) throw new Error('Google Places API key is not configured');

  const response = await fetch(`${PLACES_API_NEW}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.types,places.addressComponents',
    },
    body: JSON.stringify({ textQuery: name, pageSize: 1, languageCode: 'en' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Places lookup failed with status ${response.status}`);

  const data = (await response.json()) as {
    places?: Array<{ types?: string[]; addressComponents?: AddressComponent[] }>;
  };
  const place = data.places?.[0];
  if (!place?.types?.includes('locality')) return null;

  const components = place.addressComponents ?? [];
  const locality = components.find((c) => c.types.includes('locality'));
  if (!locality) return null;
  const region = components.find((c) => c.types.includes('administrative_area_level_1'));
  return { city: locality.longText, regionCode: region?.shortText };
}
