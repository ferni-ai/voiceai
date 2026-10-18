import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  reads: 0,
}));

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => {
          store.reads += 1;
          return { exists: store.doc !== null, data: () => store.doc };
        },
      }),
    }),
  }),
}));

const warm = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('../index.js', () => ({ warmWorldCache: warm, clearUserCache: vi.fn() }));

import { loadSavedInterests, toSavedInterests } from '../saved-interests.js';
import { initWorldAwareness } from '../session-integration.js';

afterEach(() => {
  store.doc = null;
  warm.mockClear();
  delete process.env.SAVED_INTERESTS;
  delete process.env.WORLD_NOW;
});

describe('toSavedInterests', () => {
  it('takes team full names (else names), news topics, skips blanks, keeps five', () => {
    expect(
      toSavedInterests({
        favoriteTeams: [
          { name: 'Eagles', fullName: 'Philadelphia Eagles' },
          { name: 'Phillies' },
          { name: '' },
          'Sixers',
        ],
        newsInterests: ['space', 'ai', 'f1', 'climate', 'chess', 'jazz'],
      })
    ).toEqual({
      favoriteTeams: ['Philadelphia Eagles', 'Phillies', 'Sixers'],
      topics: ['space', 'ai', 'f1', 'climate', 'chess'],
    });
    expect(toSavedInterests(null)).toEqual({ favoriteTeams: [], topics: [] });
  });
});

describe('loadSavedInterests', () => {
  it('reads nothing when SAVED_INTERESTS is off', async () => {
    store.doc = { favoriteTeams: [{ name: 'Eagles' }] };
    const before = store.reads;
    expect(await loadSavedInterests('u1', {})).toEqual({ favoriteTeams: [], topics: [] });
    expect(store.reads).toBe(before);
  });

  it('returns the saved teams when on', async () => {
    store.doc = { favoriteTeams: [{ name: 'Eagles' }] };
    expect(await loadSavedInterests('u1', { SAVED_INTERESTS: 'on' })).toEqual({
      favoriteTeams: ['Eagles'],
      topics: [],
    });
  });
});

describe('initWorldAwareness', () => {
  const philly = { city: 'Philadelphia', regionCode: 'PA' } as never;

  it("warms with the caller's saved teams instead of guessing local ones", async () => {
    process.env.SAVED_INTERESTS = 'on';
    store.doc = {
      favoriteTeams: [{ name: 'Broncos', fullName: 'Denver Broncos' }],
      newsInterests: ['space'],
    };
    await initWorldAwareness('u1', null, philly);
    const interests = warm.mock.calls[0]?.[1] as { favoriteTeams?: string[]; topics?: string[] };
    expect(interests.favoriteTeams).toEqual(['Denver Broncos']);
    expect(interests.topics).toEqual(['space']);
  });

  it('with the flag off, still guesses local teams as before', async () => {
    store.doc = { favoriteTeams: [{ name: 'Broncos', fullName: 'Denver Broncos' }] };
    await initWorldAwareness('u1', null, philly);
    const interests = warm.mock.calls[0]?.[1] as { favoriteTeams?: string[] };
    expect(interests.favoriteTeams ?? []).not.toContain('Denver Broncos');
  });
});

describe('WORLD_NOW=on', () => {
  const stGeorge = { city: 'St. George', regionCode: 'UT' } as never;

  it('warms only the weather at the home the caller saved, never at their IP city', async () => {
    process.env.WORLD_NOW = 'on';
    store.doc = { homeLocation: { name: 'Home', address: 'Tampa, FL' }, favoriteTeams: ['Rays'] };
    await initWorldAwareness('u1', null, stGeorge);
    expect(warm.mock.calls[0]?.slice(1)).toEqual([
      { location: 'Tampa, FL' },
      { weatherOnly: true },
    ]);

    warm.mockClear();
    store.doc = null;
    await initWorldAwareness('u1', null, stGeorge);
    expect(warm.mock.calls[0]?.slice(1)).toEqual([{ location: undefined }, { weatherOnly: true }]);
  });

  it('reads the saved home only with WORLD_NOW on', async () => {
    store.doc = { homeLocation: { address: 'Tampa, FL' } };
    expect((await loadSavedInterests('u1', {})).home).toBeUndefined();
    expect((await loadSavedInterests('u1', { WORLD_NOW: 'on' })).home).toBe('Tampa, FL');
  });
});
