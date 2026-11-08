/**
 * One Google Maps Platform key for every Maps-family call (lane GM-A). The new
 * API-restricted GOOGLE_MAPS_SERVER_KEY wins; until it is mounted, each caller
 * falls back to its own legacy chain, exactly as it read it before.
 */
import { describe, expect, it } from 'vitest';
import {
  googleMapsKey,
  googleMapsKeySource,
  MAPS_KEY_LEGACY,
  mapsHttpOutcome,
  mapsStatusOutcome,
} from '../google-maps-key.js';

const ALL = {
  GOOGLE_MAPS_SERVER_KEY: 'server-k',
  GOOGLE_MAPS_API_KEY: 'maps-k',
  GOOGLE_PLACES_API_KEY: 'places-k',
  GOOGLE_API_KEY: 'general-k',
};
const { GOOGLE_MAPS_SERVER_KEY: _server, ...NO_SERVER } = ALL;
const key = (legacy: (typeof MAPS_KEY_LEGACY)[keyof typeof MAPS_KEY_LEGACY], env: object) =>
  googleMapsKey({ legacy, env: env as Record<string, string> });

describe('googleMapsKey resolution order', () => {
  it('prefers GOOGLE_MAPS_SERVER_KEY for every chain', () => {
    for (const legacy of Object.values(MAPS_KEY_LEGACY)) {
      expect(key(legacy, ALL)).toBe('server-k');
      expect(googleMapsKeySource({ legacy, env: ALL })).toBe('GOOGLE_MAPS_SERVER_KEY');
    }
  });

  it('mapsThenGeneral: GOOGLE_MAPS_API_KEY, then GOOGLE_API_KEY (traffic, directions)', () => {
    expect(key(MAPS_KEY_LEGACY.mapsThenGeneral, NO_SERVER)).toBe('maps-k');
    expect(
      key(MAPS_KEY_LEGACY.mapsThenGeneral, {
        GOOGLE_API_KEY: 'general-k',
        GOOGLE_PLACES_API_KEY: 'places-k',
      })
    ).toBe('general-k');
  });

  it('placesThenGeneral: GOOGLE_PLACES_API_KEY, then GOOGLE_API_KEY (Places)', () => {
    expect(key(MAPS_KEY_LEGACY.placesThenGeneral, NO_SERVER)).toBe('places-k');
    expect(googleMapsKeySource({ legacy: MAPS_KEY_LEGACY.placesThenGeneral, env: NO_SERVER })).toBe(
      'GOOGLE_PLACES_API_KEY'
    );
    expect(
      key(MAPS_KEY_LEGACY.placesThenGeneral, {
        GOOGLE_API_KEY: 'general-k',
        GOOGLE_MAPS_API_KEY: 'maps-k',
      })
    ).toBe('general-k');
  });

  it('generalOnly never moves onto GOOGLE_MAPS_API_KEY (geocoding, weather)', () => {
    expect(key(MAPS_KEY_LEGACY.generalOnly, NO_SERVER)).toBe('general-k');
    expect(key(MAPS_KEY_LEGACY.generalOnly, { GOOGLE_MAPS_API_KEY: 'maps-k' })).toBe('');
  });

  it('mapsOnly never starts calling on GOOGLE_API_KEY (travel time, integration hub)', () => {
    expect(key(MAPS_KEY_LEGACY.mapsOnly, NO_SERVER)).toBe('maps-k');
    expect(
      key(MAPS_KEY_LEGACY.mapsOnly, {
        GOOGLE_API_KEY: 'general-k',
        GOOGLE_PLACES_API_KEY: 'places-k',
      })
    ).toBe('');
  });

  it('skips blank values and trims the key', () => {
    const env = { GOOGLE_MAPS_SERVER_KEY: '  ', GOOGLE_MAPS_API_KEY: ' maps-k\n' };
    expect(key(MAPS_KEY_LEGACY.mapsOnly, env)).toBe('maps-k');
    expect(googleMapsKeySource({ legacy: MAPS_KEY_LEGACY.mapsOnly, env })).toBe(
      'GOOGLE_MAPS_API_KEY'
    );
  });

  it('is empty, with no source, when nothing is set', () => {
    expect(key(MAPS_KEY_LEGACY.mapsThenGeneral, {})).toBe('');
    expect(
      googleMapsKeySource({ legacy: MAPS_KEY_LEGACY.placesThenGeneral, env: {} })
    ).toBeUndefined();
  });

  it('reads process.env per call, so a key mounted after import is used', () => {
    const before = process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.GOOGLE_MAPS_SERVER_KEY = 'mounted-later';
    try {
      expect(googleMapsKey({ legacy: MAPS_KEY_LEGACY.generalOnly })).toBe('mounted-later');
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
