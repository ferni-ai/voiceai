/**
 * The end of a voice session never deletes the user's stored outreach data.
 *
 * Outreach intelligence registers clearUserOutreachData with SessionDataManager, and the call
 * cleanup runs sessionEnded at the end of every voice session. That clear also deleted
 * bogle_users/{uid}/outreach_data/data, so each call end wiped the user's commitments,
 * opportunities and outreach preferences. Session end now drops only the in-memory maps (and
 * saves pending changes first); account erasure is what deletes stored data.
 *
 * Real outreach intelligence, SessionDataManager and persistence store on the Firestore merge
 * fake; assertions read the stored doc.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state = newMergeFakeState();
const base = createMergeFakeFirestore(state);
fake.db = { ...base, batch: () => ({ set: () => undefined, commit: async () => undefined }) };

const outreach = await import('../outreach-intelligence.js');
const { getSessionDataManager } = await import('../../session/session-data-manager.js');

const USER = 'u-session-end';
const PATH = `bogle_users/${USER}/outreach_data/data`;
const ISO = '2026-10-27T15:00:00.000Z';
const stored = {
  commitments: [
    { id: 'c1', what: 'call the dentist', when: ISO, checkInTime: ISO, status: 'pending' },
  ],
  opportunities: [],
  sentLog: [],
};

beforeEach(async () => {
  state.docs.clear();
  state.writes.length = 0;
  await outreach.initializeOutreachPersistence(); // registers the session-end clear
  state.docs.set(PATH, structuredClone(stored));
});

describe('session end and stored outreach data', () => {
  it('the stored doc survives the end of the session', async () => {
    await outreach.detectOutreachOpportunities(USER);
    const result = await getSessionDataManager().sessionEnded(USER);

    expect(result.cleaned).toContain('OutreachIntelligence');
    expect(state.writes.filter((w) => w.path === PATH && w.op === 'delete')).toEqual([]);
    expect(state.docs.get(PATH)?.commitments).toEqual(stored.commitments);
  });

  it('a held caller (save: false) also keeps the stored doc', async () => {
    await getSessionDataManager().sessionEnded(USER, { save: false });
    expect(state.docs.has(PATH)).toBe(true);
  });

  it('a change made in the session is saved, not dropped, when the session ends', async () => {
    await outreach.detectOutreachOpportunities(USER);
    outreach.setPreferences(USER, { maxPerDay: 2 });
    await getSessionDataManager().sessionEnded(USER);
    expect(state.docs.get(PATH)?.preferences).toMatchObject({ maxPerDay: 2 });
    expect(state.docs.get(PATH)?.commitments).toEqual(stored.commitments);
  });
});
