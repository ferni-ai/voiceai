/**
 * OpenTable, Resy and Yelp booking are gone (2026-10-30): OpenTable is
 * partner-only, Resy has no public API, and Yelp's terms ban generative-model
 * use. The restaurant tool books by saving the request and offering to call
 * the restaurant (call-on-behalf), and searches through Google Places.
 *
 * Keys for all three old providers are set here: they must change nothing.
 * Real tools and the real Places client; only fetch is faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
  process.env.OPENTABLE_API_KEY = 'opentable-key-that-must-never-be-used';
  process.env.RESY_API_KEY = 'resy-key-that-must-never-be-used';
  process.env.YELP_API_KEY = 'yelp-key-that-must-never-be-used';
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({ description: config.description, execute: config.execute })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/scheduling/appointment-followup.js', () => ({
  getAppointmentFollowUpService: () => ({
    trackAppointment: vi.fn(),
    recordCallAttempt: vi.fn(),
    updateStatus: vi.fn(),
  }),
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncAppointmentToCalendar: vi.fn(async () => ({ success: false })),
  updateCalendarSyncedItem: vi.fn(),
  removeCalendarSyncedItem: vi.fn(),
}));
// The real Places client, with "is a key configured" under test control.
const places = vi.hoisted(() => ({ configured: true }));
vi.mock('../../../../services/google-places.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isGooglePlacesConfigured: () => places.configured,
}));

import { BUSINESS_CALL_OFFER } from '../../../scheduling/appointment-core.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

type Exec = { execute: (args: object, opts: unknown) => Promise<unknown> };
const ctx = { userId: 'u-dinner', agentId: 'ferni' } as ToolContext;
const opts = { toolCallId: 't', ctx: { userData: { userId: 'u-dinner' } } };

const THAI = {
  id: 'ChIJ-test-thai-1',
  displayName: { text: 'Bangkok Garden' },
  formattedAddress: '200 Central Ave, St. Petersburg, FL 33701, USA',
  location: { latitude: 27.771, longitude: -82.637 },
  rating: 4.5,
  userRatingCount: 320,
  types: ['thai_restaurant', 'restaurant', 'food'],
};

const fetchSpy = vi.fn();
const calledUrls = (): string[] => fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));
const OLD_PROVIDERS = /opentable|resy|yelp/i;

async function restaurant(args: object): Promise<string> {
  const def = (await getToolDefinitions()).find((d: ToolDefinition) => d.id === 'restaurant');
  if (!def) throw new Error('restaurant not registered');
  return String(await (def.create(ctx) as Exec).execute(args, opts));
}

beforeEach(() => {
  places.configured = true;
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(
    async () =>
      new Response(JSON.stringify({ places: [THAI] }), {
        headers: { 'Content-Type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchSpy);
});

describe('restaurant reserve is call-on-behalf', () => {
  it('saves the request, offers the call, claims no booking and makes no request', async () => {
    const reply = await restaurant({
      action: 'reserve',
      restaurantName: 'Bangkok Garden',
      restaurantPhone: '+15555550142',
      dateTime: 'tomorrow at 7pm',
      partySize: 2,
    });

    expect(reply).toContain('I saved the restaurant request for Bangkok Garden');
    expect(reply).toContain(BUSINESS_CALL_OFFER);
    expect(reply).not.toMatch(/booked|confirmation|book instantly|online/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('without a phone number it asks for one, still with no booking claim', async () => {
    const reply = await restaurant({
      action: 'reserve',
      restaurantName: 'Bangkok Garden',
      dateTime: 'tomorrow at 7pm',
    });

    expect(reply).toContain('If you give me their number, I can call them.');
    expect(reply).not.toMatch(/booked/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('restaurant search runs on Google Places', () => {
  it('returns the Places result and calls nothing but Places', async () => {
    const reply = await restaurant({
      action: 'search',
      query: 'thai',
      location: 'St. Petersburg FL',
    });

    expect(reply).toContain('Bangkok Garden');
    expect(calledUrls()).toEqual(['https://places.googleapis.com/v1/places:searchText']);
    expect(calledUrls().join(' ')).not.toMatch(OLD_PROVIDERS);
  });

  it('with no Places key says it cannot search, not "couldn\'t find any"', async () => {
    places.configured = false;
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ places: [] }), {
          headers: { 'Content-Type': 'application/json' },
        })
    );

    const reply = await restaurant({ action: 'search', query: 'thai', location: 'Tampa' });

    expect(reply).toBe("I can't search restaurants right now.");
    expect(calledUrls().join(' ')).not.toMatch(OLD_PROVIDERS);
  });
});
