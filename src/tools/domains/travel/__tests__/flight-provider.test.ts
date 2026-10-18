/**
 * Flight provider selection (FLIGHT_PROVIDER) and the place-to-airport rules
 * that run before any search. fetch is stubbed; no live calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    safeLog: () => mockLogger,
  };
});

import { FLAG_MANIFEST } from '../../../../config/flag-manifest.js';
import { findAirportCode } from '../airport-codes.js';
import {
  flightProviderConfigured,
  searchFlights,
  selectedFlightProvider,
} from '../flight-provider.js';

const QUERY = {
  origin: 'BOS',
  destination: 'DEN',
  departureDate: new Date(2026, 9, 23, 19, 0),
  passengers: 1,
  cabinClass: 'economy' as const,
};

describe('FLIGHT_PROVIDER in the flag manifest', () => {
  it('defaults to amadeus, so nothing changes until the flag is set', () => {
    expect(FLAG_MANIFEST.FLIGHT_PROVIDER.default).toBe('amadeus');
  });
});

describe('selectedFlightProvider', () => {
  beforeEach(() => {
    vi.stubEnv('FLIGHT_PROVIDER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is amadeus when the flag is unset', () => {
    expect(selectedFlightProvider()).toBe('amadeus');
  });

  it('is ignav when the flag says ignav, in any case or spacing', () => {
    vi.stubEnv('FLIGHT_PROVIDER', ' IGNAV ');
    expect(selectedFlightProvider()).toBe('ignav');
  });

  it('falls back to amadeus for an unknown value', () => {
    vi.stubEnv('FLIGHT_PROVIDER', 'skyscanner');
    expect(selectedFlightProvider()).toBe('amadeus');
  });
});

describe('flightProviderConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('needs the Ignav key when ignav is selected', () => {
    vi.stubEnv('FLIGHT_PROVIDER', 'ignav');
    vi.stubEnv('IGNAV_API_KEY', '');
    vi.stubEnv('AMADEUS_API_KEY', 'k');
    vi.stubEnv('AMADEUS_API_SECRET', 's');
    expect(flightProviderConfigured()).toBe(false);

    vi.stubEnv('IGNAV_API_KEY', 'test-key');
    expect(flightProviderConfigured()).toBe(true);
  });

  it('needs the Amadeus key and secret by default', () => {
    vi.stubEnv('FLIGHT_PROVIDER', '');
    vi.stubEnv('IGNAV_API_KEY', 'test-key');
    vi.stubEnv('AMADEUS_API_KEY', 'k');
    vi.stubEnv('AMADEUS_API_SECRET', '');
    expect(flightProviderConfigured()).toBe(false);
  });
});

describe('searchFlights provider choice', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('calls Ignav when the flag selects it', async () => {
    vi.stubEnv('FLIGHT_PROVIDER', 'ignav');
    vi.stubEnv('IGNAV_API_KEY', 'test-key');

    await searchFlights(QUERY);

    expect(fetchMock.mock.calls[0][0]).toBe('https://ignav.com/api/fares/one-way');
  });

  it('answers not-configured without any call when the selected provider has no key', async () => {
    vi.stubEnv('FLIGHT_PROVIDER', 'ignav');
    vi.stubEnv('IGNAV_API_KEY', '');

    const outcome = await searchFlights(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call Ignav when the flag is unset', async () => {
    vi.stubEnv('FLIGHT_PROVIDER', '');
    vi.stubEnv('IGNAV_API_KEY', 'test-key');
    vi.stubEnv('AMADEUS_API_KEY', '');
    vi.stubEnv('AMADEUS_API_SECRET', '');

    const outcome = await searchFlights(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('findAirportCode', () => {
  it('maps a known city to its main airport', () => {
    expect(findAirportCode('New York')).toBe('JFK');
    expect(findAirportCode('paris')).toBe('CDG');
  });

  it('passes a three-letter airport code through in capitals', () => {
    expect(findAirportCode('BOS')).toBe('BOS');
    expect(findAirportCode('den')).toBe('DEN');
  });

  it('asks for "Rio" rather than treating it as the code RIO', () => {
    expect(findAirportCode('Rio')).toBeNull();
    expect(findAirportCode('rio')).toBeNull();
  });

  it('asks for "Paris, Texas" rather than mapping it to Paris, France', () => {
    expect(findAirportCode('Paris, Texas')).toBeNull();
  });

  it('resolves a city with its own state or country as the qualifier', () => {
    expect(findAirportCode('New York, NY')).toBe('JFK');
    expect(findAirportCode('Boston, MA')).toBe('BOS');
    expect(findAirportCode('London, UK')).toBe('LHR');
    expect(findAirportCode('Paris, France')).toBe('CDG');
  });

  it('asks about a city name with extra words and no comma, such as "Paris Texas"', () => {
    expect(findAirportCode('Paris Texas')).toBeNull();
  });

  it('asks about a qualifier that does not match the city', () => {
    expect(findAirportCode('Paris, Texas')).toBeNull();
    expect(findAirportCode('Boston, UK')).toBeNull();
  });

  it('asks for a place it does not know', () => {
    expect(findAirportCode('Smallville')).toBeNull();
  });

  it('does not match a city name inside a longer word', () => {
    expect(findAirportCode('Parisian Quarter')).toBeNull();
    expect(findAirportCode('Montparis')).toBeNull();
  });
});
