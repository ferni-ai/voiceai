/**
 * A failed predictive model read never overwrites the stored model state.
 *
 * Before: each load*State caught a read error and answered null, the same as
 * "nothing stored", and the model marked the user loaded ("don't retry"). The
 * model then learned from scratch and the 5-minute flush wrote that state over
 * the stored doc (merge replaces the time series arrays and the counters).
 * The loaded marker was also shared by all three models, so one model loading
 * kept the next model from ever reading its own doc.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../../services/engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
  cleanForFirestore: <T>(data: T): T => data,
}));

import {
  forceFlushUser,
  isUserLoaded,
  loadMarkovState,
  loadTimeSeriesState,
  markUserLoaded,
  saveMarkovState,
  type MarkovPersistenceData,
  type TimeSeriesPersistenceData,
} from '../persistence.js';

const BASE = 'bogle_users';
let userSeq = 0;
let user: string;
const markovPath = (): string => `${BASE}/${user}/predictive_ml/markov`;
const seriesPath = (): string => `${BASE}/${user}/predictive_ml/time_series`;

const markov = (totalObservations: number): MarkovPersistenceData => ({
  firstOrder: {},
  secondOrder: {},
  totalObservations,
  lastUpdated: 1,
});

const series = (moodValues: number[]): TimeSeriesPersistenceData =>
  ({
    mood: moodValues.map((value, i) => ({ timestamp: Date.now() - i * 1000, value })),
    energy: [],
    engagement: [],
    stress: [],
    seasonality: {},
    lastUpdated: 1,
  }) as unknown as TimeSeriesPersistenceData;

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
fake.db = firestore.db;

const storeDoc = (path: string, data: object): void => {
  firestore.docs.set(path, structuredClone(data) as Record<string, unknown>);
};

/** The session-end flush, with the in-memory state a fresh model would hold. */
const flushDefaults = (): Promise<void> =>
  forceFlushUser(
    user,
    () => markov(0),
    () => series([]),
    () => null
  );

beforeEach(() => {
  // Module state (loaded and failed markers) lives for the whole file, so each test gets its own user.
  user = `user-${++userSeq}`;
  firestore.docs.clear();
  firestore.failReads.match = null;
});

describe('predictive model reads', () => {
  it('a read that throws is not marked loaded and leaves the stored state unwritten', async () => {
    const storedMarkov = markov(41);
    const storedSeries = series([7, 6, 8]);
    storeDoc(markovPath(), storedMarkov);
    storeDoc(seriesPath(), storedSeries);
    firestore.failReads.match = new RegExp(`^${BASE}/${user}/predictive_ml/`);

    await expect(loadMarkovState(user)).rejects.toThrow(); // not "nothing stored": the model retries
    await expect(loadTimeSeriesState(user)).rejects.toThrow();
    markUserLoaded(user, 'markov');
    markUserLoaded(user, 'time_series');
    expect(isUserLoaded(user, 'markov')).toBe(false);
    expect(isUserLoaded(user, 'time_series')).toBe(false);

    await flushDefaults();
    expect(firestore.docs.get(markovPath())).toEqual(storedMarkov);
    expect(firestore.docs.get(seriesPath())).toEqual(storedSeries);
  });

  it('a missing document still saves the new state', async () => {
    expect(await loadMarkovState(user)).toBeNull();
    markUserLoaded(user, 'markov');
    expect(isUserLoaded(user, 'markov')).toBe(true);

    await saveMarkovState(user, markov(3));
    expect(firestore.docs.get(markovPath())).toMatchObject({ totalObservations: 3 });
  });

  it('a state that loaded saves its changes', async () => {
    storeDoc(markovPath(), markov(41));

    const loaded = await loadMarkovState(user);
    expect(loaded?.totalObservations).toBe(41);
    await saveMarkovState(user, { ...loaded!, totalObservations: 42 });

    expect(firestore.docs.get(markovPath())).toMatchObject({ totalObservations: 42 });
  });

  it('one model loading does not mark the others loaded', async () => {
    await loadMarkovState(user);
    markUserLoaded(user, 'markov');

    expect(isUserLoaded(user, 'markov')).toBe(true);
    expect(isUserLoaded(user, 'time_series')).toBe(false);
    expect(isUserLoaded(user, 'reinforcement')).toBe(false);
  });

  it('a later read that succeeds allows saving again', async () => {
    storeDoc(markovPath(), markov(41));
    firestore.failReads.match = new RegExp(`^${markovPath()}$`);
    await expect(loadMarkovState(user)).rejects.toThrow();
    await saveMarkovState(user, markov(0));
    expect(firestore.docs.get(markovPath())).toMatchObject({ totalObservations: 41 });

    firestore.failReads.match = null;
    expect((await loadMarkovState(user))?.totalObservations).toBe(41);
    markUserLoaded(user, 'markov');
    expect(isUserLoaded(user, 'markov')).toBe(true);
    await saveMarkovState(user, markov(43));

    expect(firestore.docs.get(markovPath())).toMatchObject({ totalObservations: 43 });
  });
});
