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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
type Ref = { set: (d: object, o?: object) => Promise<void> };
const batch = () => {
  const queued: Array<() => Promise<void>> = [];
  return {
    set: (ref: Ref, d: object, o?: object) => void queued.push(() => ref.set(d, o)),
    commit: async () => void (await Promise.all(queued.map((w) => w()))),
  };
};
fake.db = { ...base, batch };

const outreach = await import('../outreach-intelligence.js');
const { getSessionDataManager } = await import('../../session/session-data-manager.js');
const { heldAfter, resetMinorCare } = await import('../../../utils/minor-care.js');

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
afterEach(() => {
  vi.unstubAllEnvs();
  resetMinorCare();
});

const pathOf = (userId: string) => `bogle_users/${userId}/outreach_data/data`;
/** A user with the stored doc, mid-session (their data loaded). */
async function inSession(userId: string): Promise<string> {
  state.docs.set(pathOf(userId), structuredClone(stored));
  await outreach.detectOutreachOpportunities(userId);
  return pathOf(userId);
}

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

  it('the in-memory maps (commitments, preferences) are dropped at session end', async () => {
    const user = 'u-maps';
    await inSession(user);
    outreach.setPreferences(user, { maxPerDay: 2 });
    expect(outreach.getOutreachMemoryStats()).toMatchObject({ commitments: 1, preferences: 1 });
    await getSessionDataManager().sessionEnded(user);
    expect(outreach.getOutreachMemoryStats()).toMatchObject({ commitments: 0, preferences: 0 });
    expect(outreach.getPreferences(user).maxPerDay).not.toBe(2);
  });

  it("the next session reads the doc again: another process's update between sessions is kept", async () => {
    const user = 'u-other-process';
    const path = await inSession(user);
    outreach.setPreferences(user, { maxPerDay: 2 });
    await getSessionDataManager().sessionEnded(user);
    // Between sessions, another process (wellbeing jobs) adds a commitment
    const added = { ...stored.commitments[0], id: 'c2', what: 'walk the dog' };
    const doc = state.docs.get(path)!;
    state.docs.set(path, { ...doc, commitments: [...(doc.commitments as object[]), added] });

    await outreach.detectOutreachOpportunities(user);
    outreach.setPreferences(user, { maxPerWeek: 4 });
    await getSessionDataManager().sessionEnded(user);
    const ids = (state.docs.get(path)?.commitments as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual(['c1', 'c2']);
    expect(state.docs.get(path)?.preferences).toMatchObject({ maxPerDay: 2, maxPerWeek: 4 });
  });

  it('a save that fails at session end is kept for the next sync, not dropped', async () => {
    const user = 'u-flush-fails';
    const path = await inSession(user);
    outreach.setPreferences(user, { maxPerDay: 3 });
    state.failWrites.add(path);
    await getSessionDataManager().sessionEnded(user);
    state.failWrites.delete(path);
    await outreach.shutdownOutreachPersistence(); // the next sync
    expect(state.docs.get(path)?.preferences).toMatchObject({ maxPerDay: 3 });
  });

  it("a held caller's opt-out (outreach off, quiet hours) is stored, not dropped, at session end", async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const user = 'u-held-optout';
    heldAfter('held-session', "I'm 16 years old and kind of bored", { userId: user });
    const path = await inSession(user);
    outreach.setPreferences(user, {
      enabled: false,
      quietHoursStart: '21:00',
      quietHoursEnd: '09:00',
    });
    await getSessionDataManager().sessionEnded(user, { save: false });
    await outreach.shutdownOutreachPersistence(); // the store's flush (held parts are written here)
    expect(state.docs.get(path)?.preferences).toMatchObject({
      enabled: false,
      quietHoursStart: '21:00',
      quietHoursEnd: '09:00',
    });
    expect(state.docs.get(path)?.commitments).toEqual(stored.commitments);
  });

  it('save: false for a caller who is not held drops their unsaved changes (nothing is flushed)', async () => {
    const user = 'u-save-false';
    const path = await inSession(user);
    outreach.setPreferences(user, { maxPerDay: 7 });
    await getSessionDataManager().sessionEnded(user, { save: false });
    await outreach.shutdownOutreachPersistence();
    expect(state.writes.filter((w) => w.path === path)).toEqual([]);
    expect(state.docs.get(path)).toEqual(stored);
  });

  it('account erasure during a live session: nothing the session does writes the doc back', async () => {
    const user = 'u-erased';
    const path = await inSession(user);
    outreach.setPreferences(user, { maxPerDay: 2 }); // pending at erasure
    outreach.eraseUserOutreachData(user);
    state.docs.delete(path); // the record sweep (erase-user-record.ts)
    outreach.setPreferences(user, { enabled: false });
    outreach.extractCommitments(user, "I'll call my sister tomorrow");
    await getSessionDataManager().sessionEnded(user);
    await outreach.shutdownOutreachPersistence();
    expect(state.docs.has(path)).toBe(false);
    expect(state.writes.filter((w) => w.path === path && w.op !== 'delete')).toEqual([]);
  });
});
