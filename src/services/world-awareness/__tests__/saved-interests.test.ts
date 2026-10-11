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
