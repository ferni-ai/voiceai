/**
 * Past Chats from a call the agent records: realtime-memory writes the call, the user's
 * turns and its summary; getHistory (GET /api/conversations) lists it and counts it.
 *
 * A call is a session together only when the user spoke (sessions-together). The user's
 * turn counts once persistTurn resolves, so a caller that awaits it reads its call as
 * counted. Before: the count was a fire-and-forget write, so a history read right after
 * the turn saw no session (the menu-history emulator contract went red, total 0, no rows).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  class IncrementTransform {
    constructor(readonly by: number) {}
    isEqual(): boolean {
      return false;
    }
  }
  type Data = Record<string, unknown>;
  const docs = new Map<string, Data>();
  const writes = { delayMs: 0 };
  const settle = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, writes.delayMs);
    });
  const apply = (path: string, data: Data, merge: boolean) => {
    const next: Data = merge ? { ...(docs.get(path) ?? {}) } : {};
    for (const [key, value] of Object.entries(data)) {
      next[key] =
        value instanceof IncrementTransform
          ? (typeof next[key] === 'number' ? (next[key] as number) : 0) + value.by
          : value;
    }
    docs.set(path, next);
  };
  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
  const docRef = (path: string): unknown => ({
    id: path.split('/').pop(),
    collection: (name: string) => colRef(`${path}/${name}`),
    set: async (data: Data) => {
      await settle();
      apply(path, data, false);
    },
    update: async (data: Data) => {
      await settle();
      apply(path, data, true);
    },
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
  });
  const query = (path: string, order?: [string, string], max = Infinity): unknown => ({
    select: () => query(path, order, max),
    orderBy: (field: string, dir = 'asc') => query(path, [field, dir], max),
    limit: (n: number) => query(path, order, n),
    get: async () => {
      const rows = [...docs]
        .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map(([p, d]) => ({ id: p.split('/').pop(), data: () => d }));
      if (order) {
        const [field, dir] = order;
        rows.sort(
          (a, b) => (ms(a.data()[field]) - ms(b.data()[field])) * (dir === 'desc' ? -1 : 1)
        );
      }
      return { docs: rows.slice(0, max) };
    },
  });
  let added = 0;
  const colRef = (path: string): unknown => ({
    ...(query(path) as object),
    doc: (id: string) => docRef(`${path}/${id}`),
    add: async (data: Data) => {
      const id = `t${++added}`;
      await (docRef(`${path}/${id}`) as { set: (d: Data) => Promise<void> }).set(data);
      return { id };
    },
  });
  const db = { collection: (name: string) => colRef(name) };
  const web: Data[] = [];
  return { IncrementTransform, docs, writes, db, web };
});

vi.mock('@google-cloud/firestore', () => ({
  FieldValue: { increment: (n: number) => new fake.IncrementTransform(n) },
  Firestore: class {
    collection = (name: string) => fake.db.collection(name);
  },
}));

vi.mock('../../engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({ getConversationSessions: async () => fake.web }),
}));

const realtime = await import('../../memory/realtime-memory.js');
const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
const { getConversationHistoryService } = await import('../conversation-history.js');

beforeEach(() => {
  fake.docs.clear();
  fake.web.length = 0;
  fake.writes.delayMs = 0;
  vi.mocked(getFirestoreDb).mockReturnValue(fake.db as never);
});

let n = 0;
const newUser = () => `u${++n}`;
const turn = (role: 'user' | 'assistant', content: string) => ({
  role,
  content,
  timestamp: new Date(),
});

/** What session-manager.ts does for a call: open it, persist each turn, end it, summarize. */
async function call(uid: string, userSpeaks: boolean, summary: string): Promise<string> {
  const id = await realtime.startConversation(uid, 'ferni');
  await realtime.persistTurn(uid, id, turn('assistant', 'Hey, good to hear you.'));
  if (userSpeaks) await realtime.persistTurn(uid, id, turn('user', 'Hi Ferni.'));
  await realtime.endConversation(uid, id);
  await realtime.markSummarized(uid, id, summary);
  return id;
}

describe('Past Chats, call to panel', () => {
  it('a call where the user spoke is listed and counted', async () => {
    const uid = newUser();
    const id = await call(uid, true, 'Talked through the move');

    const history = await getConversationHistoryService().getHistory(uid);
    expect(history.totalSessions).toBe(1);
    expect(history.sessions).toEqual([
      expect.objectContaining({
        id,
        personaId: 'ferni',
        personaName: 'Ferni',
        highlights: ['Talked through the move'],
      }),
    ]);
  });

  it('a call where only the greeting played is neither listed nor counted', async () => {
    const uid = newUser();
    await call(uid, false, 'Greeting only');

    const history = await getConversationHistoryService().getHistory(uid);
    expect(history.totalSessions).toBe(0);
    expect(history.sessions).toEqual([]);
  });

  it("a web call shows once, with the web app's hang-up insights", async () => {
    const uid = newUser();
    const id = await call(uid, true, 'Sleep and the new job');
    fake.web.push({
      id: 'web1',
      date: new Date().toISOString(),
      personaId: 'ferni',
      personaName: 'Ferni',
      duration: 12,
      messageCount: 20,
      insights: ['Mornings matter to you'],
      highlights: [],
      topicsDiscussed: ['Sleep'],
    });

    const { sessions } = await getConversationHistoryService().getHistory(uid);
    expect(sessions.map((s) => [s.id, s.insights, s.highlights])).toEqual([
      [id, ['Mornings matter to you'], ['Sleep and the new job']],
    ]);
  });

  it("once persistTurn resolves, the user's turn counts (slow writes)", async () => {
    fake.writes.delayMs = 5; // every Firestore write takes a moment, as on the network
    const uid = newUser();
    const id = await realtime.startConversation(uid, 'ferni');
    await realtime.endConversation(uid, id);
    // session-manager persists turns in the background: the last one can land after the end
    await realtime.persistTurn(uid, id, turn('user', 'One more thing.'));

    const history = await getConversationHistoryService().getHistory(uid);
    expect(history.totalSessions).toBe(1);
    expect(history.sessions.map((s) => s.id)).toEqual([id]);
  });
});
