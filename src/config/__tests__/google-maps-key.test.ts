/**
 * One Google Maps Platform key for every Maps-family call (lane GM-A). The new
 * API-restricted GOOGLE_MAPS_SERVER_KEY wins; until it is mounted, each family
 * falls back to the names its callers read before, so nothing breaks.
 */
import { describe, expect, it } from 'vitest';
import {
  googleMapsKey,
  googleMapsKeySource,
  mapsHttpOutcome,
  mapsStatusOutcome,
} from '../google-maps-key.js';

const ALL = {
  GOOGLE_MAPS_SERVER_KEY: 'server-k',
  GOOGLE_MAPS_API_KEY: 'maps-k',
  GOOGLE_PLACES_API_KEY: 'places-k',
  GOOGLE_API_KEY: 'general-k',
};

describe('googleMapsKey resolution order', () => {
  it('prefers GOOGLE_MAPS_SERVER_KEY for both families', () => {
    expect(googleMapsKey('maps', ALL)).toBe('server-k');
    expect(googleMapsKey('places', ALL)).toBe('server-k');
    expect(googleMapsKeySource('maps', ALL)).toBe('GOOGLE_MAPS_SERVER_KEY');
  });

  it('falls back to GOOGLE_MAPS_API_KEY, then GOOGLE_API_KEY, for Maps calls', () => {
    const { GOOGLE_MAPS_SERVER_KEY: _s, ...noServer } = ALL;
    expect(googleMapsKey('maps', noServer)).toBe('maps-k');
    expect(
      googleMapsKey('maps', { GOOGLE_API_KEY: 'general-k', GOOGLE_PLACES_API_KEY: 'places-k' })
    ).toBe('general-k');
  });

  it('falls back to GOOGLE_PLACES_API_KEY, then GOOGLE_API_KEY, for Places calls', () => {
    const { GOOGLE_MAPS_SERVER_KEY: _s, ...noServer } = ALL;
    expect(googleMapsKey('places', noServer)).toBe('places-k');
    expect(googleMapsKeySource('places', noServer)).toBe('GOOGLE_PLACES_API_KEY');
    expect(
      googleMapsKey('places', { GOOGLE_API_KEY: 'general-k', GOOGLE_MAPS_API_KEY: 'maps-k' })
    ).toBe('general-k');
  });

  it('defaults to the Maps family', () => {
    expect(
      googleMapsKey(undefined, { GOOGLE_MAPS_API_KEY: 'maps-k', GOOGLE_PLACES_API_KEY: 'places-k' })
    ).toBe('maps-k');
  });

  it('skips blank values and trims the key', () => {
    const env = { GOOGLE_MAPS_SERVER_KEY: '  ', GOOGLE_MAPS_API_KEY: ' maps-k\n' };
    expect(googleMapsKey('maps', env)).toBe('maps-k');
    expect(googleMapsKeySource('maps', env)).toBe('GOOGLE_MAPS_API_KEY');
  });

  it('is empty, with no source, when nothing is set', () => {
    expect(googleMapsKey('maps', {})).toBe('');
    expect(googleMapsKeySource('places', {})).toBeUndefined();
  });

  it('reads process.env per call, so a key mounted after import is used', () => {
    const before = process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.GOOGLE_MAPS_SERVER_KEY = 'mounted-later';
    try {
      expect(googleMapsKey()).toBe('mounted-later');
    } finally {
      if (before === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY;
      else process.env.GOOGLE_MAPS_SERVER_KEY = before;
    }
  });
});

describe('Maps outcomes', () => {
  it('reads 401 and 403 as unauthorized', () => {
    expect(mapsHttpOutcome(403)).toBe('unauthorized');
    expect(mapsHttpOutcome(401)).toBe('unauthorized');
  });

  it('reads 429 as rate_limited, 5xx as unreachable, other 4xx as no_data', () => {
    expect(mapsHttpOutcome(429)).toBe('rate_limited');
    expect(mapsHttpOutcome(503)).toBe('unreachable');
    expect(mapsHttpOutcome(404)).toBe('no_data');
  });

  it('reads a legacy REQUEST_DENIED (HTTP 200) as unauthorized, not as a bad address', () => {
    expect(mapsStatusOutcome('REQUEST_DENIED')).toBe('unauthorized');
    expect(mapsStatusOutcome('OVER_QUERY_LIMIT')).toBe('rate_limited');
    expect(mapsStatusOutcome('UNKNOWN_ERROR')).toBe('unreachable');
    expect(mapsStatusOutcome('ZERO_RESULTS')).toBe('no_data');
    expect(mapsStatusOutcome('OK')).toBe('ok');
  });
});
