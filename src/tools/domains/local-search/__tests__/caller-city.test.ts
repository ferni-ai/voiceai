/**
 * Where "near me" searches look (PLACES_LOCATION). Order: the city said on
 * this call, then the city the caller agreed to have remembered, then the
 * phone's city, then ask. Only a city is ever stored, and only after a yes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
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
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const places = vi.hoisted(() => ({
  searchRestaurants: vi.fn(async (_opts: { query: string; location: string }) => []),
}));
vi.mock('../../../../services/google-places.js', () => ({
  searchRestaurants: places.searchRestaurants,
  getPlaceDetails: vi.fn(),
  findNearbyRestaurants: vi.fn(),
  formatRestaurantListForSpeech: vi.fn(),
  isGooglePlacesConfigured: () => true,
}));
vi.mock('../../../../services/yelp.js', () => ({
  searchBusinesses: vi.fn(async () => []),
  searchRestaurants: vi.fn(async () => []),
  getBusinessDetails: vi.fn(),
  getBusinessReviews: vi.fn(),
  getBusinessByPhone: vi.fn(),
  formatBusinessForSpeech: vi.fn(),
  formatReviewForSpeech: vi.fn(),
  isYelpConfigured: () => false,
}));

// Stands in for Firestore-backed preferences. updateUserPreferences merges like the real one.
type SavedCity = { placeId?: string; city: string; regionCode?: string; savedAt: string };
const store = vi.hoisted(() => ({
  prefs: new Map<string, { callerCity?: SavedCity | undefined }>(),
  failWrites: false,
}));
vi.mock('../../information/preferences/storage.js', () => ({
  getUserPreferences: async (userId: string) => ({
    callerCity: store.prefs.get(userId)?.callerCity,
  }),
  // Like saveUserPreferences: the cache takes the update first, then the Firestore write may fail.
  updateUserPreferences: async (userId: string, update: { callerCity?: SavedCity | undefined }) => {
    store.prefs.set(userId, { ...store.prefs.get(userId), ...update });
    if (store.failWrites) return { success: false, message: 'Could not save preferences.' };
    return { success: true, message: 'Preferences updated!' };
  },
}));

import { cleanForFirestore } from '../../../../utils/firestore-utils.js';

// Places confirms a city name with a place ID. Only these names have a locality; everything else has none.
const knownCities: Record<string, string> = {
  'philadelphia, pa': 'place-philadelphia',
  'philly, pa': 'place-philadelphia',
  'philadelphia': 'place-philadelphia',
  'boston, ma': 'place-boston',
  'st. george': 'place-st-george',
  'st. louis': 'place-st-louis',
  'two harbors': 'place-two-harbors',
  'high point': 'place-high-point',
  'west point': 'place-west-point',
  'dade city': 'place-dade-city',
};
const geo = vi.hoisted(() => ({
  findCityByName: vi.fn(async (query: string): Promise<{ placeId: string } | null> => null),
}));
vi.mock('../places-locality.js', () => ({
  findCityByName: geo.findCityByName,
}));
import type { ToolContext } from '../../../registry/types.js';

type UserLocation = { city?: string; regionCode?: string; countryCode?: string };
type Executable = {
  execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string>;
};

/** The shared fast-path context: no userId of a caller, like buildEssentialTools({ userId: 'shared' }). */
const sharedCtx = {
  userId: 'shared',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as unknown as ToolContext;

/** What LiveKit passes as the tool's second argument for a call from this caller. */
const callFrom = (userId?: string, userLocation?: UserLocation) => ({
  ctx: { userData: { userId, userLocation } },
});
const phoneInStGeorge = callFrom('u1', { city: 'St. George', regionCode: 'UT' });

async function domainTool(id: string): Promise<Executable> {
  const mod = await import('../index.js');
  const def = (await mod.getToolDefinitions()).find((d) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  return def.create(sharedCtx) as Executable;
}

const findRestaurants = () => domainTool('findRestaurants');
const rememberCity = () => domainTool('rememberCallerCity');
const forgetCity = () => domainTool('forgetCallerCity');

beforeEach(() => {
  geo.findCityByName.mockReset();
  geo.findCityByName.mockImplementation(async (q: string) => {
    const placeId = knownCities[q.toLowerCase()];
    return placeId ? { placeId } : null;
  });
  process.env.PLACES_LOCATION = 'on';
  process.env.REQUIRE_FIX_MEMORY = 'on';
  store.prefs.clear();
  store.failWrites = false;
  places.searchRestaurants.mockClear();
});

afterEach(() => {
  delete process.env.PLACES_LOCATION;
  delete process.env.REQUIRE_FIX_MEMORY;
});

describe('PLACES_LOCATION off', () => {
  beforeEach(() => {
    process.env.PLACES_LOCATION = 'off';
  });

  it('does not register the caller-city tools', async () => {
    const mod = await import('../index.js');
    const ids = (await mod.getToolDefinitions()).map((d) => d.id);
    expect(ids).not.toContain('rememberCallerCity');
    expect(ids).not.toContain('forgetCallerCity');
  });

  it('ignores a saved city and searches the phone city, as before', async () => {
    store.prefs.set('u1', { callerCity: { city: 'Philadelphia', regionCode: 'PA', savedAt: 'x' } });
    await (await findRestaurants()).execute({ cuisine: 'tacos' }, phoneInStGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
  });
});

describe('REQUIRE_FIX_MEMORY off', () => {
  beforeEach(() => {
    process.env.REQUIRE_FIX_MEMORY = 'off';
  });

  it('does not offer the remember or forget tools', async () => {
    const mod = await import('../index.js');
    const ids = (await mod.getToolDefinitions()).map((d) => d.id);
    expect(ids).not.toContain('rememberCallerCity');
    expect(ids).not.toContain('forgetCallerCity');
  });

  it('does not read a saved city, so the phone city is used', async () => {
    store.prefs.set('u1', { callerCity: { city: 'Philadelphia', regionCode: 'PA', savedAt: 'x' } });
    await (await findRestaurants()).execute({ cuisine: 'coffee' }, phoneInStGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
  });
});

describe('source order (PLACES_LOCATION on)', () => {
  it('the city said on this call wins over a saved city and the phone city', async () => {
    store.prefs.set('u1', { callerCity: { city: 'Philadelphia', regionCode: 'PA', savedAt: 'x' } });
    await (await findRestaurants()).execute({ location: 'Las Vegas' }, phoneInStGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('Las Vegas');
  });

  it('a saved city wins over the phone city', async () => {
    store.prefs.set('u1', { callerCity: { city: 'Philadelphia', regionCode: 'PA', savedAt: 'x' } });
    await (await findRestaurants()).execute({ cuisine: 'coffee' }, phoneInStGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('Philadelphia, PA');
  });

  it('falls back to the phone city when nothing is saved', async () => {
    await (await findRestaurants()).execute({ cuisine: 'coffee' }, phoneInStGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
  });

  it('asks where when no source knows the city, and does not search', async () => {
    const result = await (await findRestaurants()).execute(
      { cuisine: 'coffee' },
      callFrom('u1', undefined)
    );
    expect(result).toMatch(/Where should I look/);
    expect(places.searchRestaurants).not.toHaveBeenCalled();
  });

  it('a placeholder id is not a caller, so a saved city is not read for it', async () => {
    store.prefs.set('anonymous', { callerCity: { city: 'Dallas', savedAt: 'x' } });
    const result = await (await findRestaurants()).execute(
      { cuisine: 'coffee' },
      callFrom('anonymous')
    );
    expect(result).toMatch(/Where should I look/);
    expect(places.searchRestaurants).not.toHaveBeenCalled();
  });

  it('a call with no user id does not borrow the shared context id', async () => {
    store.prefs.set('anonymous', { callerCity: { city: 'Dallas', savedAt: 'x' } });
    const anonymousCtx = { ...sharedCtx, userId: 'anonymous' } as unknown as ToolContext;
    const mod = await import('../index.js');
    const def = (await mod.getToolDefinitions()).find((d) => d.id === 'findRestaurants');
    const tool = def?.create(anonymousCtx) as Executable;
    const result = await tool.execute({ cuisine: 'coffee' }, callFrom(undefined));
    expect(result).toMatch(/Where should I look/);
  });

  it('never reads the shared context as a caller', async () => {
    store.prefs.set('shared', { callerCity: { city: 'Dallas', savedAt: 'x' } });
    const result = await (await findRestaurants()).execute(
      { cuisine: 'coffee' },
      callFrom(undefined)
    );
    expect(result).toMatch(/Where should I look/);
    expect(places.searchRestaurants).not.toHaveBeenCalled();
  });
});

describe('saving the city', () => {
  it('stores the place ID and the caller\'s own words, with no coordinates or address fields', async () => {
    const result = await (await rememberCity()).execute(
      { city: 'Philly', region: 'PA', callerSaidYes: true },
      phoneInStGeorge
    );
    expect(result).toMatch(/Saved Philly, PA\./);
    expect(geo.findCityByName).toHaveBeenCalledWith('Philly, PA');
    // Only the place ID and the caller's own words are persisted: no Google name, address or coordinates.
    const saved = store.prefs.get('u1')?.callerCity;
    expect(Object.keys(saved ?? {}).sort()).toEqual(['city', 'placeId', 'regionCode', 'savedAt']);
    expect(saved?.placeId).toBe('place-philadelphia');
    expect(saved?.city).toBe('Philly');
    expect(saved?.regionCode).toBe('PA');
  });

  it('asks which city when Places finds no locality, and stores nothing', async () => {
    const result = await (await rememberCity()).execute(
      { city: 'Baker Street London', callerSaidYes: true },
      phoneInStGeorge
    );
    expect(result).toMatch(/Which city is it in/);
    expect(store.prefs.get('u1')?.callerCity).toBeUndefined();
  });

  it('says so when the Places check fails, and stores nothing', async () => {
    geo.findCityByName.mockRejectedValueOnce(new Error('Places lookup failed with status 503'));
    const result = await (await rememberCity()).execute(
      { city: 'Philadelphia', region: 'PA', callerSaidYes: true },
      phoneInStGeorge
    );
    expect(result).toMatch(/couldn't check that place/);
    expect(result).not.toMatch(/^Saved /);
    expect(store.prefs.get('u1')?.callerCity).toBeUndefined();
  });

  it('refuses a street address or coordinates and stores nothing', async () => {
    const remember = await rememberCity();
    const street = await remember.execute(
      { city: '1600 Pennsylvania Ave', callerSaidYes: true },
      phoneInStGeorge
    );
    const point = await remember.execute(
      { city: '39.95, -75.16', callerSaidYes: true },
      phoneInStGeorge
    );
    expect(street).toMatch(/Which city is it in/);
    expect(point).toMatch(/Which city is it in/);
    expect(store.prefs.get('u1')?.callerCity).toBeUndefined();
  });

  it.each([
    'Baker Street',
    'Main St',
    'N. Main St',
    'Pennsylvania Avenue',
    'Palm Drive',
    'Elm St. Apt B',
    'Rue de Rivoli',
    'My house',
    'Thirty Nine Point Nine',
    'Thirty Nine',
    'Baker Street London',
    'Abbey Road London',
    'Ocean Parkway',
    'Fifth and Main',
    'Elm Terrace',
    'Flat B',
    'Philly 19103',
    'Wall Street area',
  ])('saves nothing for "%s": a digit is refused first, else Places gives no locality', async (name) => {
    const result = await (await rememberCity()).execute(
      { city: name, callerSaidYes: true },
      phoneInStGeorge
    );
    expect(result).toMatch(/Which city is it in/);
    expect(store.prefs.get('u1')?.callerCity).toBeUndefined();
  });

  it.each(['St. George', 'St. Louis', 'Two Harbors', 'High Point', 'West Point', 'Dade City', 'Philadelphia'])(
    'accepts "%s" when Places confirms it as a city',
    async (name) => {
      const result = await (await rememberCity()).execute(
        { city: name, callerSaidYes: true },
        phoneInStGeorge
      );
      expect(result).toMatch(/Saved/);
      expect(store.prefs.get('u1')?.callerCity?.city).toBe(name);
    }
  );

  it('does not ask Places during a search', async () => {
    await (await findRestaurants()).execute({ cuisine: 'coffee' }, phoneInStGeorge);
    expect(geo.findCityByName).not.toHaveBeenCalled();
  });

  it('does not save for a placeholder or on-behalf caller, whose id is never read again', async () => {
    for (const userId of ['anon:3f2a', 'onbehalf:call-9']) {
      const result = await (await rememberCity()).execute(
        { city: 'Philadelphia', region: 'PA', callerSaidYes: true },
        callFrom(userId)
      );
      expect(result).toMatch(/can't save a city/);
    }
    expect(store.prefs.size).toBe(0);
  });

  it('a failed save puts the previously saved city back', async () => {
    store.prefs.set('u1', { callerCity: { city: 'Philadelphia', regionCode: 'PA', savedAt: 'x' } });
    store.failWrites = true;
    const result = await (await rememberCity()).execute(
      { city: 'Boston', region: 'MA', callerSaidYes: true },
      phoneInStGeorge
    );
    expect(result).toMatch(/couldn't save/);
    expect(store.prefs.get('u1')?.callerCity?.city).toBe('Philadelphia');
  });

  it('saves nothing without the caller saying yes', async () => {
    const result = await (await rememberCity()).execute(
      { city: 'Philadelphia', callerSaidYes: false },
      phoneInStGeorge
    );
    expect(result).toMatch(/haven't saved/);
    expect(store.prefs.get('u1')?.callerCity).toBeUndefined();
  });

  it('says so honestly when the write fails, and does not keep the city', async () => {
    store.failWrites = true;
    const result = await (await rememberCity()).execute(
      { city: 'Philadelphia', region: 'PA', callerSaidYes: true },
      phoneInStGeorge
    );
    expect(result).toMatch(/couldn't save/);
    expect(result).not.toMatch(/^Saved /);
    expect(store.prefs.get('u1')?.callerCity).toBeUndefined();
  });

  it('will not save for the shared context, which has no caller', async () => {
    const tool = (await import('../index.js')).getToolDefinitions;
    const def = (await tool()).find((d) => d.id === 'rememberCallerCity');
    const bound = def?.create(sharedCtx) as Executable;
    const result = await bound.execute({ city: 'Philadelphia', callerSaidYes: true }, callFrom());
    expect(result).toMatch(/can't save a city/);
    expect(store.prefs.size).toBe(0);
  });
});

describe('forgetting the city', () => {
  it('removes the saved city, and the stored record no longer carries it', async () => {
    await (
      await rememberCity()
    ).execute({ city: 'Philadelphia', region: 'PA', callerSaidYes: true }, phoneInStGeorge);
    const result = await (await forgetCity()).execute({}, phoneInStGeorge);
    expect(result).toMatch(/forgotten/);

    const written = cleanForFirestore(store.prefs.get('u1') ?? {});
    expect(written).not.toHaveProperty('callerCity');

    await (await findRestaurants()).execute({ cuisine: 'coffee' }, phoneInStGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
  });

  it('says so honestly when the forget write fails', async () => {
    store.prefs.set('u1', { callerCity: { city: 'Philadelphia', regionCode: 'PA', savedAt: 'x' } });
    store.failWrites = true;
    const result = await (await forgetCity()).execute({}, phoneInStGeorge);
    expect(result).toMatch(/couldn't forget/);
    expect(result).not.toMatch(/forgotten\./);
  });
});

describe('forget phrases load local-search only while city memory is on', () => {
  it('maps them while PLACES_LOCATION and REQUIRE_FIX_MEMORY are on', async () => {
    vi.resetModules();
    const { LOCAL_PLACE_TOPICS } = await import('../../../dynamic-loader/local-place-topics.js');
    expect(LOCAL_PLACE_TOPICS['forget where i live']).toEqual(['local-search']);
  });

  it('does not map them while REQUIRE_FIX_MEMORY is off', async () => {
    process.env.REQUIRE_FIX_MEMORY = 'off';
    vi.resetModules();
    const { LOCAL_PLACE_TOPICS } = await import('../../../dynamic-loader/local-place-topics.js');
    expect(LOCAL_PLACE_TOPICS['forget where i live']).toBeUndefined();
    expect(LOCAL_PLACE_TOPICS['coffee shop']).toEqual(['local-search']);
  });
});

describe('a failed search', () => {
  it('says it had trouble rather than listing places it did not get', async () => {
    places.searchRestaurants.mockRejectedValueOnce(new Error('Places quota exceeded'));
    const result = await (await findRestaurants()).execute({ cuisine: 'coffee' }, phoneInStGeorge);
    expect(result).toMatch(/trouble finding restaurants/);
    expect(result).not.toMatch(/Options near/);
  });
});
