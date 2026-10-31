/**
 * #2767: a topic the caller asked Ferni to forget never comes back as the next
 * call's "last time you talked about", through the prompt (agent-setup
 * lastTalkedAbout) or the greeting (greeting-direction callerHistory).
 *
 * Real code end to end: forgetTopic and the Firestore forget store, the shared
 * topics read (forgottenWithin), applyCheckedSummary and saveKept, which
 * session-manager calls, the call-end summary pass that runs after the save
 * (realtime-memory summarizeConversationAsync), and the next call's two
 * readers. Fakes: the database, a map of documents (a profile save is a
 * merge, as firestore-store saveProfile's set(..., { merge: true }) is), and
 * the summary model's key points.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { offline: false, txFails: false, points: [] as string[] };
  const snap = (path: string) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const merge = (path: string, data: Record<string, unknown>) =>
    docs.set(path, { ...(docs.get(path) ?? {}), ...data });
  type Ref = { path: string; get: () => Promise<ReturnType<typeof snap>>; collection: unknown };
  /** The documents directly under a collection path, in key order. */
  const under = (path: string) =>
    [...docs.keys()]
      .filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
      .sort()
      .map((k) => ({ id: k.split('/').pop(), data: () => docs.get(k) }));
  const ref = (path: string): Ref & { update: unknown } => ({
    path,
    get: async () => snap(path),
    update: async (data: Record<string, unknown>) => merge(path, data),
    collection: (c: string) => ({
      doc: (id: string) => ref(`${path}/${c}/${id}`),
      get: async () => ({ docs: [] }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ docs: under(`${path}/${c}`) }) }) }),
    }),
  });
  const db = {
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: async (r: Ref) => {
          // only the profile document (bogle_users/<uid>): the forget-time clear's read
          if (state.txFails && r.path.split('/').length === 2)
            throw new Error('profile read failed');
          return snap(r.path);
        },
        set: (r: Ref, data: Record<string, unknown>) => merge(r.path, data),
        update: (r: Ref, data: Record<string, unknown>) => merge(r.path, data),
      });
    },
  };
  return { docs, state, merge, db };
});

vi.mock('../../../utils/firestore-utils.js', async (original) => ({
  ...(await original<object>()),
  getFirestoreDb: () => (fake.state.offline ? null : fake.db),
}));
// realtime-memory opens its own client: the same documents
vi.mock('@google-cloud/firestore', async (original) => ({
  ...(await original<object>()),
  Firestore: function Firestore() {
    return fake.db;
  },
}));
vi.mock('../../../memory/index.js', () => ({
  summarizeWithLLM: async () => ({ keyPoints: fake.state.points }),
}));
vi.mock('../../llm-utils.js', () => ({ createSummarizationLLMCaller: () => ({ call: vi.fn() }) }));

const { forgetForCaller, forgetTopic } = await import('../../../memory/recall/forget.js');
type ForgetStore = import('../../../memory/recall/forget.js').ForgetStore;
const { summarizeConversationAsync } = await import('../../memory/realtime-memory.js');
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
  Object.assign(fake.state, { offline: false, txFails: false, points: [] });
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
    // both last summaries: the system prompt also reads lastConversationSummary (user-awareness.ts)
    expect(stored(uid).lastConversationSummary).toBe('');
  });

  it('(b) the forget-time clear matches all that a save would: a sentence-cased topic', async () => {
    const uid = 'e2e-2767-e';
    const said = 'USER is divorcing and signed the papers';
    fake.merge(`bogle_users/${uid}`, { totalConversations: 3, lastCallerSummary: said });
    expect((await forgetTopic(uid, 'Divorce papers')).kind).toBe('forgotten');
    expect(nextCallSees(stored(uid))).not.toMatch(/divorc/);
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

  it('the call-end summary pass, after the save, writes only what is not forgotten', async () => {
    const uid = 'e2e-2767-f';
    const conv = `bogle_users/${uid}/conversations/c1`;
    fake.merge(`bogle_users/${uid}`, { totalConversations: 3, lastConversationSummary: KEPT });
    fake.merge(`${conv}/turns/1`, { role: 'user', content: 'Dana is filing', timestamp: 1 });
    fake.merge(`${conv}/turns/2`, { role: 'assistant', content: 'I hear you', timestamp: 2 });
    expect((await forgetTopic(uid, "Dana's divorce")).kind).toBe('forgotten');

    fake.state.points = [FORGOTTEN, 'USER is repainting the kitchen'];
    await summarizeConversationAsync(uid, 'c1');
    expect(stored(uid).lastConversationSummary).toBe('USER is repainting the kitchen');
    expect(fake.docs.get(conv)?.summary).not.toMatch(/divorce|Dana/);

    fake.state.offline = true; // topics unreadable: the profile keeps what it had
    resetForgetTopicsSource();
    fake.state.points = [FORGOTTEN];
    await summarizeConversationAsync(uid, 'c1');
    expect(stored(uid).lastConversationSummary).toBe('USER is repainting the kitchen');
  });

  it("#2794: the call's own summary never keeps the caller's words about a forgotten topic", async () => {
    const uid = 'e2e-2794-a';
    const turns = (conv: string, said: string) => {
      fake.merge(`${conv}/turns/1`, { role: 'user', content: said, timestamp: 1 });
      fake.merge(`${conv}/turns/2`, { role: 'assistant', content: 'I hear you', timestamp: 2 });
    };
    const c1 = `bogle_users/${uid}/conversations/c1`;
    const c2 = `bogle_users/${uid}/conversations/c2`;
    const c3 = `bogle_users/${uid}/conversations/c3`;
    turns(c1, 'Dana is filing the divorce papers next week and I am a wreck');
    turns(c2, 'I planted tomatoes in the garden and they are finally coming up');
    turns(c3, 'Dana is filing the divorce papers next week and I am a wreck');
    expect((await forgetTopic(uid, "Dana's divorce")).kind).toBe('forgotten');

    fake.state.points = [FORGOTTEN]; // every point forgotten: the fallback is the caller's words
    await summarizeConversationAsync(uid, 'c1');
    expect(fake.docs.get(c1)?.summary).toBe('Brief conversation');

    fake.state.points = []; // control: words not about a forgotten topic are still kept
    await summarizeConversationAsync(uid, 'c2');
    expect(fake.docs.get(c2)?.summary).toContain('tomatoes');

    fake.state.offline = true; // topics unreadable: no raw words either
    resetForgetTopicsSource();
    await summarizeConversationAsync(uid, 'c3');
    expect(fake.docs.get(c3)?.summary).toBe('Brief conversation');
  });

  it('the forget-time clear runs after the facts are marked, so a failure leaves only it to retry', async () => {
    const marked: string[] = [];
    const store: ForgetStore = {
      facts: async () => [
        { collection: 'dynamic_facts', id: 'f1', data: { value: 'Dana filed the divorce papers' } },
      ],
      markForgotten: async (_u, refs) => void marked.push(...refs.map((r) => r.id)),
      addTopic: async () => undefined,
      topics: async () => [],
      clearSummaries: async () => {
        throw new Error('profile write failed');
      },
    };
    await expect(forgetTopic('e2e-2794-b', "Dana's divorce", store)).rejects.toThrow();
    expect(marked).toEqual(['f1']);
  });

  it('a failed forget-time clear is reported: Ferni never says it forgot', async () => {
    const uid = 'e2e-2767-g';
    fake.merge(`bogle_users/${uid}`, { totalConversations: 3, lastCallerSummary: FORGOTTEN });
    fake.state.txFails = true;
    expect((await forgetForCaller(uid, "Dana's divorce")).kind).toBe('failed');
    expect(fake.docs.get(`bogle_users/${uid}/memory_state/forgotten`)?.topics).toEqual([
      "Dana's divorce",
    ]); // recorded before the clear failed: a retry completes it
  });

  // endSession and the call-end save run for real in last-summary-endsession.test.ts; the
  // periodic autosave is a timer no test drives, so its wiring is pinned here.
  it('the autosave saves through the checked helper (wiring)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../session-manager.ts', import.meta.url), 'utf8');
    expect(src).toContain('saveKept(global.store, updatedProfile, uid)');
    expect(src).not.toMatch(/global\.store\.saveProfile\(/);
  });
});
