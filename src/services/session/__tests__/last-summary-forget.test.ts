/**
 * #2767: a topic the caller asked Ferni to forget never comes back as the next
 * call's "last time you talked about", through the prompt (agent-setup
 * lastTalkedAbout) or the greeting (greeting-direction callerHistory).
 *
 * Real code end to end: forgetTopic and the Firestore forget store, the shared
 * topics read (forgottenWithin), applyCheckedSummary and saveKept, which
 * session-manager calls, and the next call's two readers. Only the
 * database is a fake, a map of documents; a profile save is a merge, as
 * firestore-store saveProfile's set(..., { merge: true }) is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { offline: false };
  const snap = (path: string) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const merge = (path: string, data: Record<string, unknown>) =>
    docs.set(path, { ...(docs.get(path) ?? {}), ...data });
  type Ref = { path: string; get: () => Promise<ReturnType<typeof snap>>; collection: unknown };
  const ref = (path: string): Ref => ({
    path,
    get: async () => snap(path),
    collection: (c: string) => ({
      doc: (id: string) => ref(`${path}/${c}/${id}`),
      get: async () => ({ docs: [] }),
    }),
  });
  const db = {
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: Ref) => snap(r.path),
        set: (r: Ref, data: Record<string, unknown>) => merge(r.path, data),
        update: (r: Ref, data: Record<string, unknown>) => merge(r.path, data),
      }),
  };
  return { docs, state, merge, db };
});

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => (fake.state.offline ? null : fake.db),
}));

const { forgetTopic } = await import('../../../memory/recall/forget.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');
const { applyCheckedSummary, applyLastSummary, keptSummaries, lastSummaryCheck, saveKept } =
  await import('../last-summary.js');
const { lastTalkedAbout } = await import('../../../agents/multi-agent/teammate-relationship.js');
const { callerHistory } = await import('../../../agents/multi-agent/greeting-direction.js');

type Profile = {
  totalConversations: number;
  lastConversationSummary?: string;
  lastCallerSummary?: string;
};

const FORGOTTEN = 'USER said Dana is filing the divorce papers';
const KEPT = 'USER planted tomatoes in the garden';

/** The stored profile, as the next call loads it. */
const stored = (uid: string) => fake.docs.get(`bogle_users/${uid}`) as Profile;
/** session-manager's save paths, onto a store whose save is a merge. */
async function save(uid: string, profile: Profile) {
  const store = { saveProfile: async (p: Profile) => void fake.merge(`bogle_users/${uid}`, p) };
  await saveKept(store, profile, uid);
}
/** What the next call's prompt and greeting say about last time. */
function nextCallSees(p: Profile): string {
  const prompt = p.lastCallerSummary ? lastTalkedAbout(false, p.lastCallerSummary) : '';
  return `${prompt} | ${callerHistory(p)?.lastTopic ?? ''}`;
}

beforeEach(() => {
  fake.docs.clear();
  fake.state.offline = false;
  resetForgetTopicsSource();
});

describe('#2767: a forgotten topic stays out of the next call', () => {
  it('(a) forgotten during the call: its key point is not written, the other one is', async () => {
    const uid = 'e2e-2767-a';
    const profile: Profile = { totalConversations: 3, lastCallerSummary: 'USER talked about work' };
    fake.merge(`bogle_users/${uid}`, profile);
    expect((await forgetTopic(uid, "Dana's divorce")).kind).toBe('forgotten');

    // endSession, as session-manager calls it
    const summary = { keyPoints: [FORGOTTEN, KEPT], callerProvenance: 1 };
    await applyCheckedSummary(profile, summary, uid);
    await save(uid, profile);

    const sees = nextCallSees(stored(uid));
    expect(sees).not.toMatch(/divorce|Dana/);
    expect(sees).toContain('tomatoes');
  });

  it('(b) forgotten after the call: the stored summary is cleared when the forget is recorded', async () => {
    const uid = 'e2e-2767-b';
    const profile: Profile = { totalConversations: 3 };
    applyLastSummary(profile, { keyPoints: [FORGOTTEN, KEPT], callerProvenance: 1 }, {});
    await save(uid, profile);
    expect(nextCallSees(stored(uid))).toContain('divorce'); // the leak before the forget

    expect((await forgetTopic(uid, "Dana's divorce")).kind).toBe('forgotten');
    expect(nextCallSees(stored(uid))).not.toMatch(/divorce|Dana/);
  });

  it('(b) a call that loaded the summary before the forget does not save it back', async () => {
    const uid = 'e2e-2767-c';
    fake.merge(`bogle_users/${uid}`, {
      totalConversations: 3,
      lastConversationSummary: FORGOTTEN,
      lastCallerSummary: FORGOTTEN,
    });
    const inCall = { ...stored(uid) }; // loaded at call start
    expect((await forgetTopic(uid, "Dana's divorce")).kind).toBe('forgotten');

    // No caller-provenance marker: the old lastCallerSummary is left on the profile
    await applyCheckedSummary(inCall, { keyPoints: [KEPT] }, uid);
    await save(uid, inCall);

    const after = stored(uid);
    expect(nextCallSees(after)).not.toMatch(/divorce|Dana/);
    expect(after.lastConversationSummary).toBe(KEPT);
  });

  it('topics unreadable: no new summary is written and the stored ones are left as they were', async () => {
    const uid = 'e2e-2767-d';
    fake.merge(`bogle_users/${uid}`, { totalConversations: 3, lastCallerSummary: KEPT });
    fake.state.offline = true; // the forgotten topics can't be read
    const forgotten = await lastSummaryCheck(uid);
    expect(forgotten).toBeNull();

    const profile: Profile = { ...stored(uid) };
    applyLastSummary(profile, { keyPoints: [FORGOTTEN], callerProvenance: 1 }, {}, forgotten);
    expect(profile.lastCallerSummary).toBe(KEPT); // not written
    fake.merge(
      `bogle_users/${uid}`,
      keptSummaries({ ...profile, lastCallerSummary: FORGOTTEN }, null)
    );
    expect(stored(uid).lastCallerSummary).toBe(KEPT);
  });

  it('a caller with no account has nothing stored to check', async () => {
    const forgotten = await lastSummaryCheck('anonymous');
    expect(forgotten?.(FORGOTTEN)).toBe(false);
  });
});
