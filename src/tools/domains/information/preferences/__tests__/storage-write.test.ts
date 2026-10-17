/**
 * A preferences write must never replace the stored document with defaults.
 * If the read before a write fails, the write is refused. A write builds on
 * what is stored, not on this worker's cache, which lives 60 seconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});

const fake = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  readFails: false,
  writes: [] as string[],
}));
vi.mock('../../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: (path: string) => ({
      doc: (id: string) => {
        const key = `${path}/${id}`;
        return {
          get: async () => {
            if (fake.readFails) throw new Error('Firestore unavailable');
            const data = fake.docs.get(key);
            return { exists: data !== undefined, data: () => data };
          },
          set: async (data: Record<string, unknown>) => {
            fake.writes.push(key);
            fake.docs.set(key, data);
          },
        };
      },
    }),
  }),
}));

import { DEFAULT_PREFERENCES } from '../types.js';
import {
  addFavoriteTeam,
  getUserPreferences,
  setAllergies,
  updateUserPreferences,
} from '../storage.js';

const docPath = (userId: string) => `bogle_users/${userId}/info_preferences/current`;
const stored = (userId: string) => fake.docs.get(docPath(userId)) as Record<string, unknown>;

beforeEach(() => {
  process.env.REQUIRE_FIX_MEMORY = 'on';
  fake.docs.clear();
  fake.readFails = false;
  fake.writes.length = 0;
});

afterEach(() => {
  delete process.env.REQUIRE_FIX_MEMORY;
  vi.restoreAllMocks();
});

describe('preferences writes', () => {
  it('refuses a write when the read before it fails, and writes nothing', async () => {
    const uid = 'u-read-fails';
    fake.docs.set(docPath(uid), { ...DEFAULT_PREFERENCES, allergies: ['pollen'] });
    fake.readFails = true;

    const result = await updateUserPreferences(uid, { sportAlerts: true });

    expect(result.success).toBe(false);
    expect(fake.writes).toEqual([]);
    expect(stored(uid).allergies).toEqual(['pollen']);
  });

  it('keeps the other stored fields when it writes a single field', async () => {
    const uid = 'u-keeps-fields';
    fake.docs.set(docPath(uid), {
      ...DEFAULT_PREFERENCES,
      allergies: ['pollen'],
      homeLocation: { name: 'Home', address: 'Philadelphia, PA' },
    });

    const result = await updateUserPreferences(uid, { stockWatchlist: ['AAPL'] });

    expect(result.success).toBe(true);
    expect(stored(uid).allergies).toEqual(['pollen']);
    expect(stored(uid).homeLocation).toEqual({ name: 'Home', address: 'Philadelphia, PA' });
    expect(stored(uid).stockWatchlist).toEqual(['AAPL']);
  });

  it('builds the write on the stored document, not on a stale cached copy', async () => {
    const uid = 'u-stale-cache';
    fake.docs.set(docPath(uid), { ...DEFAULT_PREFERENCES, allergies: ['pollen'] });
    await getUserPreferences(uid); // this worker now caches allergies: pollen
    fake.docs.set(docPath(uid), { ...DEFAULT_PREFERENCES, allergies: ['cats'] }); // another worker changed it

    await updateUserPreferences(uid, { sportAlerts: true });

    expect(stored(uid).allergies).toEqual(['cats']);
  });

  it('an allergy added during a failed read is refused, not replaced by defaults', async () => {
    const uid = 'u-add-allergy-read-fails';
    fake.docs.set(docPath(uid), { ...DEFAULT_PREFERENCES, allergies: ['peanuts'] });
    fake.readFails = true;

    const result = await setAllergies(uid, ['pollen'], 'add');

    expect(result.success).toBe(false);
    expect(fake.writes).toEqual([]);
    expect(stored(uid).allergies).toEqual(['peanuts']);
  });

  it('a team added from a stale cache keeps the team another worker added', async () => {
    const uid = 'u-stale-team';
    fake.docs.set(docPath(uid), {
      ...DEFAULT_PREFERENCES,
      favoriteTeams: [{ name: 'Eagles', league: 'NFL', priority: 'primary' }],
    });
    await getUserPreferences(uid); // this worker caches Eagles only
    fake.docs.set(docPath(uid), {
      ...DEFAULT_PREFERENCES,
      favoriteTeams: [
        { name: 'Eagles', league: 'NFL', priority: 'primary' },
        { name: 'Phillies', league: 'MLB', priority: 'secondary' },
      ],
    }); // another worker added Phillies

    await addFavoriteTeam(uid, { name: 'Sixers', league: 'NBA', priority: 'secondary' });

    expect((stored(uid).favoriteTeams as Array<{ name: string }>).map((t) => t.name)).toEqual([
      'Eagles',
      'Phillies',
      'Sixers',
    ]);
  });

  it('stops serving a cached copy after 60 seconds', async () => {
    const uid = 'u-ttl';
    const now = Date.now();
    fake.docs.set(docPath(uid), { ...DEFAULT_PREFERENCES, allergies: ['pollen'] });
    await getUserPreferences(uid);
    fake.docs.set(docPath(uid), { ...DEFAULT_PREFERENCES, allergies: ['cats'] });

    vi.spyOn(Date, 'now').mockReturnValue(now + 59_000);
    expect((await getUserPreferences(uid)).allergies).toEqual(['pollen']);

    vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    expect((await getUserPreferences(uid)).allergies).toEqual(['cats']);
  });
});
