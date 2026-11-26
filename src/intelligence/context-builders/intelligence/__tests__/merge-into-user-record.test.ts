/**
 * learnTemporalPattern writes a person's own record only, in one transaction (#4293).
 *
 * It read bogle_users/{id}, then merged temporalPatterns into it in a separate write: for an id
 * with no record (a try-first visitor's) that created a record holding only temporalPatterns,
 * and for an account erased or being erased it wrote anyway. With LEARNING_OWNER_GATE on, the
 * read and write are one transaction that stops on a missing, erased or erasing record.
 *
 * Firestore is the in-memory merge fake; learnTemporalPattern is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => fake.db,
}));

const { learnTemporalPattern } = await import('../temporal-intelligence.js');
const { erasingMark } = await import('../../../../utils/erasing-mark.js');

const UID = 'user-test-0102';
const PATH = `bogle_users/${UID}`;
const member = { id: UID, name: 'Robin Testcase', totalConversations: 3 };
const erasing = { ...member, ...erasingMark(new Date('2026-11-01T00:00:00Z')) };

let state: MergeFakeState;

beforeEach(() => {
  state = newMergeFakeState();
  fake.db = createMergeFakeFirestore(state);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LEARNING_OWNER_GATE on', () => {
  beforeEach(() => vi.stubEnv('LEARNING_OWNER_GATE', 'on'));

  it('no record: writes nothing, so no record holding only temporalPatterns appears', async () => {
    await learnTemporalPattern(UID);

    expect(state.docs.has(PATH)).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('a record being erased: writes nothing', async () => {
    state.docs.set(PATH, structuredClone(erasing));

    await learnTemporalPattern(UID);

    expect(state.writes).toEqual([]);
    expect(state.docs.get(PATH)).toEqual(erasing);
  });

  it('a member record: merges temporalPatterns and keeps the profile', async () => {
    state.docs.set(PATH, structuredClone(member));

    await learnTemporalPattern(UID);
    await learnTemporalPattern(UID);

    const doc = state.docs.get(PATH) as Record<string, unknown>;
    expect(doc).toMatchObject(member);
    expect(doc.temporalPatterns).toMatchObject({ preferredTimes: { preferenceStrength: 0.2 } });
  });
});

describe('LEARNING_OWNER_GATE off: written as before', () => {
  beforeEach(() => vi.stubEnv('LEARNING_OWNER_GATE', 'off'));

  it('no record: creates one holding only temporalPatterns', async () => {
    await learnTemporalPattern(UID);

    expect(Object.keys(state.docs.get(PATH) ?? {})).toEqual(['temporalPatterns']);
  });

  it('a record being erased: still written', async () => {
    state.docs.set(PATH, structuredClone(erasing));

    await learnTemporalPattern(UID);

    expect(state.docs.get(PATH)).toMatchObject({ erasing: true, temporalPatterns: {} });
  });
});
