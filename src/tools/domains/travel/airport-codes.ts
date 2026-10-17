/**
 * Turn what the caller said about a place into an airport code, or ask.
 *
 * A guessed code is worse than a question: "Rio" is a city name, not the
 * airport code RIO, and "Paris, Texas" is not Paris, France. Both return null
 * and the caller asks which airport was meant.
 *
 * @module tools/domains/travel/airport-codes
 */

// ============================================================================
// AIRPORT CODES (Common ones)
// ============================================================================

const AIRPORT_CODES: Record<string, string[]> = {
  'new york': ['JFK', 'LGA', 'EWR'],
  'los angeles': ['LAX'],
  chicago: ['ORD', 'MDW'],
  'san francisco': ['SFO', 'OAK'],
  miami: ['MIA', 'FLL'],
  boston: ['BOS'],
  seattle: ['SEA'],
  denver: ['DEN'],
  atlanta: ['ATL'],
  dallas: ['DFW', 'DAL'],
  london: ['LHR', 'LGW'],
  paris: ['CDG', 'ORY'],
  tokyo: ['NRT', 'HND'],
  sydney: ['SYD'],
};

/**
 * Names that are three letters or that exist in several countries and states.
 * Always asked about, even when they look like a code.
 */
const AMBIGUOUS_PLACES = new Set(['rio', 'portland', 'springfield', 'santiago', 'cambridge']);

/** An airport code for a city or a three-letter code; null when the place is ambiguous or unknown. */
export function findAirportCode(place: string): string | null {
  const trimmed = place.trim();
  const lower = trimmed.toLowerCase();

  // "Paris, Texas" names a qualified place the table does not cover.
  if (trimmed.includes(',') || AMBIGUOUS_PLACES.has(lower)) return null;

  if (/^[a-z]{3}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  for (const [cityName, codes] of Object.entries(AIRPORT_CODES)) {
    if (new RegExp(`\\b${cityName}\\b`).test(lower)) {
      return codes[0];
    }
  }
  return null;
}

export function unknownAirportText(place: string): string {
  return (
    `I don't have an airport code for "${place}" yet. ` +
    `Which airport should I search from? The main one in that city works best.`
  );
}
