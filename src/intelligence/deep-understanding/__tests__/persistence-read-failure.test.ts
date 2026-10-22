/**
 * A failed deep understanding read never overwrites the stored profile.
 *
 * Before: loadSystemProfile caught a Firestore read error and answered null,
 * exactly as for a user with nothing stored. The session then learned on top
 * of defaults (getLifeRhythmProfile even creates one on read), and the save
 * at session end wrote those defaults over the user's real profiles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../../services/engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fake.db,
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}));

import {
  loadDeepUnderstandingProfiles,
  saveDeepUnderstandingProfiles,
} from '../persistence.js';
import {
  getSilencePattern,
  importSilencePattern,
  resetSilenceIntelligence,
  type SilencePattern,
} from '../silence.js';
import { getLifeRhythmProfile, resetLifeRhythmPrediction } from '../life-rhythm.js';

const USER = 'user-1';
const BASE = `bogle_users/${USER}/deep_understanding`;
const SILENCE_PATH = `${BASE}/silence_pattern`;
const RHYTHM_PATH = `${BASE}/life_rhythm`;

const silence = (avgProcessingDuration: number): SilencePattern =>
  ({ userId: USER, avgProcessingDuration, heavyTopics: ['work'] }) as unknown as SilencePattern;

const storedDoc = (profile: unknown) => ({ data: JSON.stringify(profile), version: 1 });
const storedSilence = storedDoc(silence(4200));
const storedRhythm = storedDoc({ userId: USER, marker: 'stored-rhythm' });

const savedData = (path: string): unknown =>
  JSON.parse(String(firestore.docs.get(path)?.data ?? 'null'));

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
fake.db = firestore.db;

beforeEach(() => {
  firestore.docs.clear();
  firestore.failReads.match = null;
  resetSilenceIntelligence();
  resetLifeRhythmPrediction();
});

describe('deep understanding reads', () => {
  it('a read that throws leaves the stored profiles unwritten', async () => {
    firestore.docs.set(SILENCE_PATH, structuredClone(storedSilence));
    firestore.docs.set(RHYTHM_PATH, structuredClone(storedRhythm));
    firestore.failReads.match = new RegExp(`^${BASE}/`);

    await loadDeepUnderstandingProfiles(USER);
    // The session learns on top of defaults.
    importSilencePattern(silence(1));
    getLifeRhythmProfile(USER);

    const { saved, failed } = await saveDeepUnderstandingProfiles(USER);
    expect(saved).toEqual([]);
    expect(failed).toEqual(expect.arrayContaining(['silencePattern', 'lifeRhythm']));
    expect(firestore.docs.get(SILENCE_PATH)).toEqual(storedSilence);
    expect(firestore.docs.get(RHYTHM_PATH)).toEqual(storedRhythm);
    expect([...firestore.docs.keys()].sort()).toEqual([RHYTHM_PATH, SILENCE_PATH]);
  });

  it('only the system whose read failed is held back', async () => {
    firestore.docs.set(SILENCE_PATH, structuredClone(storedSilence));
    firestore.docs.set(RHYTHM_PATH, structuredClone(storedRhythm));
    firestore.failReads.match = new RegExp(`^${SILENCE_PATH}$`);

    await loadDeepUnderstandingProfiles(USER);
    importSilencePattern(silence(1));

    const { saved, failed } = await saveDeepUnderstandingProfiles(USER);
    expect(failed).toContain('silencePattern');
    expect(saved).toContain('lifeRhythm');
    expect(firestore.docs.get(SILENCE_PATH)).toEqual(storedSilence);
    expect(savedData(RHYTHM_PATH)).toMatchObject({ marker: 'stored-rhythm' });
  });

  it('a missing document still saves the new profile', async () => {
    await loadDeepUnderstandingProfiles(USER);
    importSilencePattern(silence(900));

    const { saved } = await saveDeepUnderstandingProfiles(USER);
    expect(saved).toContain('silencePattern');
    expect(savedData(SILENCE_PATH)).toMatchObject({ avgProcessingDuration: 900 });
  });

  it('a profile that loaded saves its changes', async () => {
    firestore.docs.set(SILENCE_PATH, structuredClone(storedSilence));

    await loadDeepUnderstandingProfiles(USER);
    const loaded = getSilencePattern(USER);
    expect(loaded?.avgProcessingDuration).toBe(4200);
    importSilencePattern({ ...loaded!, avgProcessingDuration: 4300 });

    await saveDeepUnderstandingProfiles(USER);
    expect(savedData(SILENCE_PATH)).toMatchObject({
      avgProcessingDuration: 4300,
      heavyTopics: ['work'],
    });
  });

  it('a later read that succeeds allows saving again', async () => {
    firestore.docs.set(SILENCE_PATH, structuredClone(storedSilence));
    firestore.failReads.match = new RegExp(`^${SILENCE_PATH}$`);
    await loadDeepUnderstandingProfiles(USER);
    importSilencePattern(silence(1));
    await saveDeepUnderstandingProfiles(USER);
    expect(firestore.docs.get(SILENCE_PATH)).toEqual(storedSilence);

    firestore.failReads.match = null;
    await loadDeepUnderstandingProfiles(USER);
    expect(getSilencePattern(USER)?.avgProcessingDuration).toBe(4200);
    importSilencePattern({ ...getSilencePattern(USER)!, avgProcessingDuration: 4400 });

    const { saved } = await saveDeepUnderstandingProfiles(USER);
    expect(saved).toContain('silencePattern');
    expect(savedData(SILENCE_PATH)).toMatchObject({ avgProcessingDuration: 4400 });
  });
});
