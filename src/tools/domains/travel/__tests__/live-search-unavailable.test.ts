/**
 * Live travel search without provider keys.
 *
 * With no Amadeus or Booking key, the search must say it is unavailable and
 * return no fares or rates. The real module is loaded so the env read at
 * import time is exercised.
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

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncTravelToCalendar: vi.fn(),
}));

type Travel = typeof import('../travel.js');
type Tools = ReturnType<Travel['createTravelTools']>;

async function loadTravel(env: Record<string, string>): Promise<{ travel: Travel; tools: Tools }> {
  vi.resetModules();
  for (const key of ['AMADEUS_API_KEY', 'AMADEUS_API_SECRET', 'BOOKING_AFFILIATE_ID']) {
    vi.stubEnv(key, env[key] ?? '');
  }
  const travel = await import('../travel.js');
  return { travel, tools: travel.createTravelTools() };
}

const ctx = { ctx: {} } as never;
const FLIGHT_ARGS = {
  origin: 'New York',
  destination: 'Los Angeles',
  departureDate: 'next Friday',
  passengers: 1,
  cabinClass: 'economy' as const,
};
const HOTEL_ARGS = {
  destination: 'Lisbon',
  checkIn: 'next Friday',
  checkOut: 'next Sunday',
  guests: 2,
  rooms: 1,
};

describe('live travel search without provider keys', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // "next Friday" to "next Sunday" only parses as a forward stay on some
    // weekdays, so pin the clock to a Wednesday.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    fetchSpy = vi.fn(() => {
      throw new Error('no network call expected');
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('searchFlights is unavailable and returns no fares, with no network call', async () => {
    const { travel } = await loadTravel({});
    const outcome = await travel.searchFlights({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: new Date('2026-11-06'),
      passengers: 1,
      cabinClass: 'economy',
    });
    expect(outcome).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('searchHotels is unavailable and returns no rates, with no network call', async () => {
    const { travel } = await loadTravel({});
    const outcome = await travel.searchHotels({
      destination: 'Lisbon',
      checkIn: new Date('2026-11-06'),
      checkOut: new Date('2026-11-08'),
      guests: 2,
      rooms: 1,
    });
    expect(outcome).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the searchFlights tool says plainly it cannot look up live fares and quotes no prices', async () => {
    const { tools } = await loadTravel({});
    const text = String(await tools.searchFlights.execute(FLIGHT_ARGS, ctx));
    expect(text).toContain("I can't look up live flight prices right now");
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/United|Delta|American|Southwest|JetBlue|Alaska/);
    expect(text).toContain('Google Flights');
  });

  it('the searchHotels tool says plainly it cannot look up live rates and quotes no prices', async () => {
    const { tools } = await loadTravel({});
    const text = String(await tools.searchHotels.execute(HOTEL_ARGS, ctx));
    expect(text).toContain("I can't look up live hotel rates right now");
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/Marriott|Hilton|Hyatt|Holiday Inn|Sheraton/);
  });

  it('getFlightPrice gives no price range without a key', async () => {
    const { tools } = await loadTravel({});
    const text = String(
      await tools.getFlightPrice.execute(
        { origin: 'New York', destination: 'Los Angeles', when: 'next month' },
        ctx
      )
    );
    expect(text).toContain("I can't look up live flight prices right now");
    expect(text).not.toMatch(/\$\d/);
  });
});

describe('live travel search with provider keys', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns the provider results when Amadeus answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 'offer-1',
                  price: { total: '212.50' },
                  itineraries: [
                    {
                      duration: 'PT5H30M',
                      segments: [
                        {
                          departure: { at: '2026-11-06T08:00:00' },
                          arrival: { at: '2026-11-06T13:30:00' },
                          carrierCode: 'XX',
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
            { status: 200 }
          )
        )
    );
    const { travel } = await loadTravel({ AMADEUS_API_KEY: 'k', AMADEUS_API_SECRET: 's' });
    const outcome = await travel.searchFlights({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: new Date('2026-11-06'),
      passengers: 1,
      cabinClass: 'economy',
    });
    expect(outcome.status).toBe('live');
    if (outcome.status === 'live') {
      expect(outcome.results).toHaveLength(1);
      expect(outcome.results[0]).toMatchObject({ id: 'offer-1', price: 212.5, airline: 'XX' });
    }
  });

  it('is unavailable, not mock data, when the provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { travel } = await loadTravel({ AMADEUS_API_KEY: 'k', AMADEUS_API_SECRET: 's' });
    const outcome = await travel.searchFlights({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: new Date('2026-11-06'),
      passengers: 1,
      cabinClass: 'economy',
    });
    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('is unavailable when Amadeus answers with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }))
        .mockResolvedValueOnce(new Response('nope', { status: 500 }))
    );
    const { travel } = await loadTravel({ AMADEUS_API_KEY: 'k', AMADEUS_API_SECRET: 's' });
    const outcome = await travel.searchFlights({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: new Date('2026-11-06'),
      passengers: 1,
      cabinClass: 'economy',
    });
    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('lists live offers cheapest first', async () => {
    const offer = (id: string, total: string) => ({
      id,
      price: { total },
      itineraries: [
        {
          duration: 'PT2H',
          segments: [
            {
              departure: { at: '2026-11-06T08:00:00' },
              arrival: { at: '2026-11-06T10:00:00' },
              carrierCode: 'XX',
            },
          ],
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: [offer('dear', '400.00'), offer('cheap', '99.00')] }),
            {
              status: 200,
            }
          )
        )
    );
    const { travel } = await loadTravel({ AMADEUS_API_KEY: 'k', AMADEUS_API_SECRET: 's' });
    const outcome = await travel.searchFlights({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: new Date('2026-11-06'),
      passengers: 1,
      cabinClass: 'economy',
    });
    expect(outcome.status).toBe('live');
    if (outcome.status === 'live') {
      expect(outcome.results.map((r) => r.id)).toEqual(['cheap', 'dear']);
    }
  });
});
