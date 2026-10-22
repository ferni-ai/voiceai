/**
 * Ignav one-way fare search with fetch stubbed to synthetic replies. CI makes
 * no live calls; the shapes follow https://ignav.com/docs.
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

import { IgnavFlightProvider, IGNAV_BASE_URL } from '../ignav-flights.js';
import type { FlightQuery } from '../amadeus-flights.js';

const QUERY: FlightQuery = {
  origin: 'BOS',
  destination: 'DEN',
  departureDate: new Date(2026, 9, 23, 19, 0),
  passengers: 1,
  cabinClass: 'economy',
};

function itinerary(overrides: {
  ignav_id?: string;
  amount: number;
  carrier?: string;
  segments?: Array<{ dep: string; arr: string }>;
  minutes?: number;
}) {
  const segments = (
    overrides.segments ?? [{ dep: '2026-10-23T08:05:00', arr: '2026-10-23T10:30:00' }]
  ).map((s) => ({
    departure_airport: 'BOS',
    arrival_airport: 'DEN',
    departure_time_local: s.dep,
    arrival_time_local: s.arr,
  }));
  return {
    ignav_id: overrides.ignav_id ?? 'ig_default',
    price: { amount: overrides.amount, currency: 'USD' },
    outbound: {
      carrier: overrides.carrier ?? 'UA',
      duration_minutes: overrides.minutes ?? 205,
      segments,
    },
  };
}

const SEARCH_REPLY = {
  origin: 'BOS',
  destination: 'DEN',
  departure_date: '2026-10-23',
  observed_at: '2026-10-17T12:00:00Z',
  cache_hit: false,
  itineraries: [
    itinerary({ ignav_id: 'ig_a', amount: 312, carrier: 'WN' }),
    itinerary({
      ignav_id: 'ig_b',
      amount: 189,
      carrier: 'UA',
      segments: [
        { dep: '2026-10-23T13:15:00', arr: '2026-10-23T14:40:00' },
        { dep: '2026-10-23T15:30:00', arr: '2026-10-23T16:30:00' },
      ],
      minutes: 265,
    }),
    itinerary({ ignav_id: 'ig_c', amount: 0, carrier: 'AA' }),
    itinerary({
      ignav_id: 'ig_d',
      amount: 224,
      carrier: 'DL',
      segments: [{ dep: '2026-10-23T12:00:00', arr: '2026-10-23T16:00:00' }],
    }),
    itinerary({ ignav_id: 'ig_e', amount: 400, carrier: 'B6' }),
  ],
};

function jsonReply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('IgnavFlightProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts a one-way search with the key in X-Api-Key and the local day', async () => {
    fetchMock.mockResolvedValue(jsonReply(200, SEARCH_REPLY));

    await new IgnavFlightProvider('test-key').search(QUERY);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${IGNAV_BASE_URL}/fares/one-way`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('test-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(init.body as string)).toEqual({
      origin: 'BOS',
      destination: 'DEN',
      departure_date: '2026-10-23',
      cabin_class: 'economy',
    });
  });

  it('maps the three cheapest priced options into the tool result shape', async () => {
    fetchMock.mockResolvedValue(jsonReply(200, SEARCH_REPLY));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({
      status: 'live',
      results: [
        {
          id: 'ig_b',
          airline: 'UA',
          price: 189,
          currency: 'USD',
          departureTime: '1:15 PM',
          arrivalTime: '4:30 PM',
          duration: '4h 25m',
          stops: 1,
          bookingUrl: 'https://www.google.com/flights?q=BOS+to+DEN',
        },
        {
          id: 'ig_d',
          airline: 'DL',
          price: 224,
          currency: 'USD',
          departureTime: '12:00 PM',
          arrivalTime: '4:00 PM',
          duration: '3h 25m',
          stops: 0,
          bookingUrl: 'https://www.google.com/flights?q=BOS+to+DEN',
        },
        {
          id: 'ig_a',
          airline: 'WN',
          price: 312,
          currency: 'USD',
          departureTime: '8:05 AM',
          arrivalTime: '10:30 AM',
          duration: '3h 25m',
          stops: 0,
          bookingUrl: 'https://www.google.com/flights?q=BOS+to+DEN',
        },
      ],
    });
  });

  it('says provider-rejected when the key is refused', async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: { code: 'invalid_api_key' } }));

    const outcome = await new IgnavFlightProvider('bad-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-rejected' });
  });

  it('says provider-rejected when billing has stopped the account', async () => {
    fetchMock.mockResolvedValue(jsonReply(402, { error: { code: 'billing_blocked' } }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-rejected' });
  });

  it('says provider-error when the spend limit is reached', async () => {
    fetchMock.mockResolvedValue(jsonReply(429, { error: { code: 'monthly_spend_limit_reached' } }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('says provider-rejected when the key is forbidden', async () => {
    fetchMock.mockResolvedValue(jsonReply(403, { error: { code: 'email_not_verified' } }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-rejected' });
  });

  it('says provider-error when the upstream fails', async () => {
    fetchMock.mockResolvedValue(jsonReply(424, { error: { code: 'unable_to_complete_request' } }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('says provider-error on a timeout', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('sends the search with a timeout signal', async () => {
    fetchMock.mockResolvedValue(jsonReply(200, SEARCH_REPLY));

    await new IgnavFlightProvider('test-key').search(QUERY);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('says provider-error when a departure time has no date in front of it', async () => {
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        itineraries: [itinerary({ amount: 150, segments: [{ dep: '08:05', arr: '10:30' }] })],
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('says provider-error when an arrival time is not anchored at its date', async () => {
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        itineraries: [
          itinerary({
            amount: 150,
            segments: [{ dep: '2026-10-23T08:05:00', arr: 'x2026-10-23T10:30:00' }],
          }),
        ],
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('says provider-error when a departure time is not anchored at its date', async () => {
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        itineraries: [
          itinerary({
            amount: 150,
            segments: [{ dep: 'x2026-10-23T08:05:00', arr: '2026-10-23T10:30:00' }],
          }),
        ],
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('says provider-error when the reply has no itineraries array', async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { something: 'else' }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  it('answers unsupported-query for a round trip without calling the provider', async () => {
    const outcome = await new IgnavFlightProvider('test-key').search({
      ...QUERY,
      returnDate: new Date(2026, 9, 30),
    });

    expect(outcome).toEqual({ status: 'unavailable', reason: 'unsupported-query' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers unsupported-query for zero passengers', async () => {
    const outcome = await new IgnavFlightProvider('test-key').search({ ...QUERY, passengers: 0 });

    expect(outcome).toEqual({ status: 'unavailable', reason: 'unsupported-query' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers unsupported-query for more than one passenger', async () => {
    const outcome = await new IgnavFlightProvider('test-key').search({ ...QUERY, passengers: 2 });

    expect(outcome).toEqual({ status: 'unavailable', reason: 'unsupported-query' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes the airline from the segment and says N/A when the leg carrier and duration are null', async () => {
    // The documented shape (ItineraryModel, LegModel, SegmentModel): null is allowed for these.
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        origin: 'BOS',
        destination: 'DEN',
        departure_date: '2026-10-23',
        itineraries: [
          {
            ignav_id: 'ig_null',
            price: { amount: 150, currency: 'USD', status: 'verified' },
            outbound: {
              carrier: null,
              duration_minutes: null,
              segments: [
                {
                  marketing_carrier_code: 'WN',
                  flight_number: '1234',
                  operating_carrier_name: 'Southwest Airlines',
                  departure_airport: 'BOS',
                  departure_timezone: null,
                  departure_time_local: '2026-10-23T08:05:00',
                  departure_time_utc: null,
                  arrival_airport: 'DEN',
                  arrival_timezone: null,
                  arrival_time_local: '2026-10-23T10:30:00',
                  arrival_time_utc: null,
                  duration_minutes: 145,
                  aircraft: null,
                },
              ],
            },
            cabin_class: 'economy',
            bags: null,
            requires_self_transfer: null,
          },
        ],
        observed_at: null,
        cache_hit: false,
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({
      status: 'live',
      results: [
        expect.objectContaining({
          id: 'ig_null',
          airline: 'Southwest Airlines',
          price: 150,
          departureTime: '8:05 AM',
          arrivalTime: '10:30 AM',
          duration: 'N/A',
          stops: 0,
        }),
      ],
    });
  });

  it('keeps the valid options when one itinerary has an unexpected shape', async () => {
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        itineraries: [
          itinerary({ ignav_id: 'ig_good', amount: 200, carrier: 'UA' }),
          itinerary({
            ignav_id: 'ig_bad',
            amount: 100,
            carrier: 'AA',
            segments: [{ dep: '2026-10-23T08:00:00', arr: 'x2026-10-23T10:30:00' }],
          }),
        ],
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({
      status: 'live',
      results: [expect.objectContaining({ id: 'ig_good', airline: 'UA', price: 200 })],
    });
  });

  it.each(['economy', 'premium_economy', 'business', 'first'] as const)(
    'sends the %s cabin as the API names it',
    async (cabinClass) => {
      fetchMock.mockResolvedValue(jsonReply(200, SEARCH_REPLY));

      await new IgnavFlightProvider('test-key').search({ ...QUERY, cabinClass });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).cabin_class).toBe(cabinClass);
    }
  );

  it('sends the local calendar day, not the UTC day, for a late-evening departure', async () => {
    // 23:30 in Los Angeles is 06:30 UTC on the next day.
    vi.stubEnv('TZ', 'America/Los_Angeles');
    try {
      const lateDeparture = new Date(2026, 9, 23, 23, 30);
      fetchMock.mockResolvedValue(jsonReply(200, SEARCH_REPLY));

      await new IgnavFlightProvider('test-key').search({ ...QUERY, departureDate: lateDeparture });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).departure_date).toBe('2026-10-23');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('says provider-error for a 503 with a non-JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'unavailable', reason: 'provider-error' });
  });

  describe('airline name fallback', () => {
    function withLegCarrier(carrier: string | null, segmentNames: Record<string, string | null>) {
      const base = itinerary({ ignav_id: 'ig_fallback', amount: 120 });
      return {
        ...base,
        outbound: {
          ...base.outbound,
          carrier,
          segments: [{ ...base.outbound.segments[0], ...segmentNames }],
        },
      };
    }

    it('uses the marketing carrier code when the leg and operating names are null', async () => {
      fetchMock.mockResolvedValue(
        jsonReply(200, {
          itineraries: [
            withLegCarrier(null, { operating_carrier_name: null, marketing_carrier_code: 'WN' }),
          ],
        })
      );

      const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

      expect(outcome).toEqual({
        status: 'live',
        results: [expect.objectContaining({ airline: 'WN' })],
      });
    });

    it("says 'Unknown' when no carrier name is given", async () => {
      fetchMock.mockResolvedValue(
        jsonReply(200, {
          itineraries: [
            withLegCarrier(null, { operating_carrier_name: null, marketing_carrier_code: null }),
          ],
        })
      );

      const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

      expect(outcome).toEqual({
        status: 'live',
        results: [expect.objectContaining({ airline: 'Unknown' })],
      });
    });

    it('prefers the leg carrier over the segment operating carrier name', async () => {
      fetchMock.mockResolvedValue(
        jsonReply(200, {
          itineraries: [
            withLegCarrier('UA', {
              operating_carrier_name: 'Southwest',
              marketing_carrier_code: 'WN',
            }),
          ],
        })
      );

      const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

      expect(outcome).toEqual({
        status: 'live',
        results: [expect.objectContaining({ airline: 'UA' })],
      });
    });
  });

  it('drops an itinerary that has no ignav_id and keeps the others', async () => {
    const withoutId = { ...itinerary({ amount: 90, carrier: 'AA' }) } as Record<string, unknown>;
    delete withoutId.ignav_id;
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        itineraries: [withoutId, itinerary({ ignav_id: 'ig_kept', amount: 200, carrier: 'UA' })],
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({
      status: 'live',
      results: [expect.objectContaining({ id: 'ig_kept', airline: 'UA' })],
    });
  });

  it('returns a live empty result when Ignav finds no itineraries', async () => {
    fetchMock.mockResolvedValue(jsonReply(200, { itineraries: [] }));

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({ status: 'live', results: [] });
  });

  it('drops an itinerary with no segments and keeps the others', async () => {
    const noSegments = itinerary({ ignav_id: 'ig_empty', amount: 90, carrier: 'AA' });
    noSegments.outbound.segments = [];
    fetchMock.mockResolvedValue(
      jsonReply(200, {
        itineraries: [noSegments, itinerary({ ignav_id: 'ig_kept', amount: 200, carrier: 'UA' })],
      })
    );

    const outcome = await new IgnavFlightProvider('test-key').search(QUERY);

    expect(outcome).toEqual({
      status: 'live',
      results: [expect.objectContaining({ id: 'ig_kept', airline: 'UA' })],
    });
  });
});
