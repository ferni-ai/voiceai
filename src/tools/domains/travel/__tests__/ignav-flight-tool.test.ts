/**
 * The searchFlights tool with FLIGHT_PROVIDER=ignav: what the caller hears.
 * fetch is stubbed to a synthetic Ignav reply; no live calls.
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

type Tools = ReturnType<typeof import('../travel.js').createTravelTools>;

const ctx = { ctx: {} } as never;

const IGNAV_REPLY = {
  itineraries: [
    {
      ignav_id: 'ig_eur',
      price: { amount: 189, currency: 'EUR' },
      outbound: {
        carrier: 'UA',
        duration_minutes: 205,
        segments: [
          {
            departure_airport: 'BOS',
            arrival_airport: 'DEN',
            departure_time_local: '2026-10-16T08:05:00',
            arrival_time_local: '2026-10-16T10:30:00',
          },
        ],
      },
    },
  ],
};

async function loadTools(): Promise<Tools> {
  vi.resetModules();
  const travel = await import('../travel.js');
  return travel.createTravelTools();
}

describe('searchFlights tool with FLIGHT_PROVIDER=ignav', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // "next Friday" needs a fixed clock; pin it to a Wednesday.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    fetchMock = vi.fn(async () => new Response(JSON.stringify(IGNAV_REPLY), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('FLIGHT_PROVIDER', 'ignav');
    vi.stubEnv('IGNAV_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('says a fare in a non-dollar currency with its currency code', async () => {
    const tools = await loadTools();

    const reply = await tools.searchFlights.execute(
      {
        origin: 'BOS',
        destination: 'DEN',
        departureDate: 'next Friday',
        passengers: 1,
        cabinClass: 'economy',
      },
      ctx
    );

    expect(reply).toContain('189 EUR');
    expect(reply).not.toContain('$189');
  });

  it('says one-way only, and does not search, when a return date is given', async () => {
    const tools = await loadTools();

    const reply = await tools.searchFlights.execute(
      {
        origin: 'BOS',
        destination: 'DEN',
        departureDate: 'next Friday',
        returnDate: 'next Sunday',
        passengers: 1,
        cabinClass: 'economy',
      },
      ctx
    );

    expect(reply).toContain('I can only check one-way fares for one passenger right now.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getFlightPrice says the fare in its own currency', async () => {
    const tools = await loadTools();

    const reply = await tools.getFlightPrice.execute(
      { origin: 'BOS', destination: 'DEN', when: 'next Friday' },
      ctx
    );

    expect(reply).toContain('189 EUR');
  });

  it('labels the Google Flights link as a search, not a booking', async () => {
    const tools = await loadTools();

    const reply = await tools.searchFlights.execute(
      {
        origin: 'BOS',
        destination: 'DEN',
        departureDate: 'next Friday',
        passengers: 1,
        cabinClass: 'economy',
      },
      ctx
    );

    expect(reply).toContain('Search at: https://www.google.com/flights?q=BOS+to+DEN');
    expect(reply).not.toContain('Book at:');
  });

  it('keeps "Book at:" on hotel replies, since hotel links are provider booking URLs', async () => {
    vi.stubEnv('BOOKING_AFFILIATE_ID', 'test-affiliate');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          result: [
            {
              hotel_id: 'h1',
              hotel_name: 'Hotel Test',
              review_score: 8.4,
              min_total_price: 480,
              hotel_facilities: 'Wifi,Pool',
              url: 'https://www.booking.com/hotel/test.html',
            },
          ],
        }),
        { status: 200 }
      )
    );
    const tools = await loadTools();

    const reply = await tools.searchHotels.execute(
      {
        destination: 'Lisbon',
        checkIn: 'next Friday',
        checkOut: 'next Sunday',
        guests: 2,
        rooms: 1,
      },
      ctx
    );

    expect(reply).toContain('Book at: https://www.booking.com/hotel/test.html');
    expect(reply).not.toContain('Search at:');
  });
});
