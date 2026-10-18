/**
 * Amadeus flight search: date, airport and host handling, the cabin name, the
 * error-to-result mapping, and one synthetic offers response. Every network
 * call is faked; nothing here reaches Amadeus.
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

async function loadTravel(): Promise<ReturnType<Travel['createTravelTools']>> {
  vi.resetModules();
  vi.stubEnv('AMADEUS_API_KEY', 'test-key');
  vi.stubEnv('AMADEUS_API_SECRET', 'test-secret');
  const travel = await import('../travel.js');
  return travel.createTravelTools();
}

const ctx = { ctx: {} } as never;

function tokenOk(): Response {
  return new Response(JSON.stringify({ access_token: 'token-1' }), { status: 200 });
}

/** The URLs and the search parameters the tool actually sent. */
function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('amadeus flight search', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Denver is behind UTC. In the evening of Saturday 17 October its UTC date is
    // already Sunday 18, so a UTC-based date would send the wrong day.
    vi.stubEnv('TZ', 'America/Denver');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T02:30:00Z'));
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('date and airport resolution', () => {
    it('sends the local calendar day for "next Friday", not the UTC day', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      const tools = await loadTravel();
      await tools.searchFlights.execute(
        {
          origin: 'Boston',
          destination: 'Denver',
          departureDate: 'next Friday',
          passengers: 1,
          cabinClass: 'economy',
        },
        ctx
      );
      const search = new URL(requestedUrls(fetchMock)[1]);
      expect(search.searchParams.get('departureDate')).toBe('2026-10-23');
    });

    it('maps Boston and Denver to BOS and DEN', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      const tools = await loadTravel();
      await tools.searchFlights.execute(
        {
          origin: 'Boston',
          destination: 'Denver',
          departureDate: 'next Friday',
          passengers: 1,
          cabinClass: 'economy',
        },
        ctx
      );
      const search = new URL(requestedUrls(fetchMock)[1]);
      expect(search.searchParams.get('originLocationCode')).toBe('BOS');
      expect(search.searchParams.get('destinationLocationCode')).toBe('DEN');
    });

    it('asks for the airport instead of sending a guessed code for an unknown city', async () => {
      const tools = await loadTravel();
      const text = String(
        await tools.searchFlights.execute(
          {
            origin: 'Phoenix',
            destination: 'Denver',
            departureDate: 'next Friday',
            passengers: 1,
            cabinClass: 'economy',
          },
          ctx
        )
      );
      expect(text).toContain('I don\'t have an airport code for "Phoenix"');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('host and request shape', () => {
    it('uses the production Amadeus host for the token and the search', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      const tools = await loadTravel();
      await tools.searchFlights.execute(
        {
          origin: 'Boston',
          destination: 'Denver',
          departureDate: 'next Friday',
          passengers: 1,
          cabinClass: 'economy',
        },
        ctx
      );
      const [tokenUrl, searchUrl] = requestedUrls(fetchMock);
      expect(tokenUrl).toBe('https://api.amadeus.com/v1/security/oauth2/token');
      expect(searchUrl.startsWith('https://api.amadeus.com/v2/shopping/flight-offers?')).toBe(true);
    });

    it('sends the cabin as Amadeus names it, PREMIUM_ECONOMY with an underscore', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      const tools = await loadTravel();
      await tools.searchFlights.execute(
        {
          origin: 'Boston',
          destination: 'Denver',
          departureDate: 'next Friday',
          passengers: 2,
          cabinClass: 'premium_economy',
        },
        ctx
      );
      const search = new URL(requestedUrls(fetchMock)[1]);
      expect(search.searchParams.get('travelClass')).toBe('PREMIUM_ECONOMY');
      expect(search.searchParams.get('adults')).toBe('2');
    });
  });

  describe('error-to-result mapping', () => {
    it('reports a refused key (token 410) as provider-rejected, not as no flights', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 410 }));
      const tools = await loadTravel();
      const text = String(
        await tools.searchFlights.execute(
          {
            origin: 'Boston',
            destination: 'Denver',
            departureDate: 'next Friday',
            passengers: 1,
            cabinClass: 'economy',
          },
          ctx
        )
      );
      expect(text).toContain('turned down our request');
      expect(text).not.toContain('No flights found');
      expect(text).not.toMatch(/\$\d/);
    });

    it('reports a failed token call that is not a refusal as provider-error', async () => {
      fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
      const tools = await loadTravel();
      const text = String(
        await tools.searchFlights.execute(
          {
            origin: 'Boston',
            destination: 'Denver',
            departureDate: 'next Friday',
            passengers: 1,
            cabinClass: 'economy',
          },
          ctx
        )
      );
      expect(text).toContain('did not answer');
    });

    it('reports a refused search (401) as provider-rejected', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(new Response('{}', { status: 401 }));
      await loadTravel();
      const { searchFlights } = await import('../travel.js');
      const outcome = await searchFlights({
        origin: 'BOS',
        destination: 'DEN',
        departureDate: new Date('2026-10-23T12:00:00'),
        passengers: 1,
        cabinClass: 'economy',
      });
      expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-rejected' });
    });

    it('tells the model not to name airlines or prices from memory when the lookup fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
      const tools = await loadTravel();
      const text = String(
        await tools.searchFlights.execute(
          {
            origin: 'Boston',
            destination: 'Denver',
            departureDate: 'next Friday',
            passengers: 1,
            cabinClass: 'economy',
          },
          ctx
        )
      );
      expect(text).toContain('did not answer');
      expect(text).toMatch(/Don't name airlines, flight times or prices from general knowledge/);
    });

    it('getFlightPrice says there were no fares for the day, rather than calling the lookup unavailable', async () => {
      fetchMock
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      const tools = await loadTravel();
      const text = String(
        await tools.getFlightPrice.execute(
          { origin: 'Boston', destination: 'Denver', when: 'next Friday' },
          ctx
        )
      );
      expect(text).toContain('returned no fares');
      expect(text).not.toContain('did not answer');
    });
  });

  describe('one synthetic offers response', () => {
    it('maps an offer to a flight result with the carrier code and a stop count', async () => {
      fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'offer-synthetic-1',
                price: { total: '212.50' },
                itineraries: [
                  {
                    duration: 'PT5H30M',
                    segments: [
                      {
                        departure: { at: '2026-10-23T08:00:00' },
                        arrival: { at: '2026-10-23T09:30:00' },
                        carrierCode: 'AA',
                      },
                      {
                        departure: { at: '2026-10-23T10:15:00' },
                        arrival: { at: '2026-10-23T13:30:00' },
                        carrierCode: 'AA',
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 }
        )
      );
      const { searchFlights } = await import('../travel.js');
      const outcome = await searchFlights({
        origin: 'BOS',
        destination: 'DEN',
        departureDate: new Date('2026-10-23T12:00:00'),
        passengers: 1,
        cabinClass: 'economy',
      });
      const departure = new Date('2026-10-23T08:00:00').toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      expect(outcome).toEqual({
        status: 'live',
        results: [
          expect.objectContaining({
            id: 'offer-synthetic-1',
            airline: 'AA',
            price: 212.5,
            departureTime: departure,
            duration: '5h30m',
            stops: 1,
          }),
        ],
      });
    });
  });
});
