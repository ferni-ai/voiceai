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

const US = ['usa', 'us', 'united states'];

/**
 * The state or country a "City, Qualifier" must name to resolve. A qualifier
 * outside this list (Paris, Texas) is asked about rather than guessed.
 */
const QUALIFIERS: Record<string, string[]> = {
  'new york': ['ny', 'new york', ...US],
  'los angeles': ['ca', 'california', ...US],
  chicago: ['il', 'illinois', ...US],
  'san francisco': ['ca', 'california', ...US],
  miami: ['fl', 'florida', ...US],
  boston: ['ma', 'massachusetts', ...US],
  seattle: ['wa', 'washington', ...US],
  denver: ['co', 'colorado', ...US],
  atlanta: ['ga', 'georgia', ...US],
  dallas: ['tx', 'texas', ...US],
  london: ['uk', 'england', 'united kingdom', 'gb'],
  paris: ['france', 'fr'],
  tokyo: ['japan', 'jp'],
  sydney: ['nsw', 'australia', 'au'],
};

/** An airport code for a city or a three-letter code; null when the place is ambiguous or unknown. */
export function findAirportCode(place: string): string | null {
  const trimmed = place.trim();
  const lower = trimmed.toLowerCase();

  if (AMBIGUOUS_PLACES.has(lower)) return null;

  if (lower.includes(',')) {
    const [cityPart, ...qualifier] = lower.split(',');
    const city = cityPart.trim();
    if (!QUALIFIERS[city]?.includes(qualifier.join(',').trim())) return null;
    return AIRPORT_CODES[city][0];
  }

  if (/^[a-z]{3}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Exact city names only: "Paris Texas" or "Montparis" is asked about, not guessed.
  const codes = AIRPORT_CODES[lower];
  return codes ? codes[0] : null;
}

export function unknownAirportText(place: string): string {
  return (
    `I don't have an airport code for "${place}" yet. ` +
    `Which airport should I search from? The main one in that city works best.`
  );
}
