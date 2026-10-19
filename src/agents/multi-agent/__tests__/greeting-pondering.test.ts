/**
 * The call opener asks about one thing the nightly pondering pass left
 * (PONDERING=on): once, never on a first call or after a recent crisis, never
 * about a forgotten topic, and never with "I was just thinking about you".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let actorLine: string | undefined;
const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) =>
  actorLine === undefined
    ? { text: req.fallback, source: 'understudy' as const, ms: 0 }
    : { text: actorLine, source: 'actor' as const, ms: 0 }
);
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

let openCommitments: Array<{ statement: string }> = [];
vi.mock('../../../services/superhuman/commitment-follow-up.js', () => ({
  coachFollowThroughMode: () => openCommitments.length > 0,
  callCheckIns: async () => openCommitments,
}));

/** A path-keyed fake of the Firestore calls the opener makes. */
let docs: Record<string, Record<string, unknown>> = {};
const sets: Array<{ path: string; data: Record<string, unknown>; opts: unknown }> = [];
const reads: string[] = [];
function doc(path: string): unknown {
  return {
    get: async () => {
      reads.push(path);
      return { exists: path in docs, data: () => docs[path] };
    },
    set: async (data: Record<string, unknown>, opts: unknown) => {
      sets.push({ path, data, opts });
    },
    collection: (name: string) => collection(`${path}/${name}`),
  };
}
function collection(path: string): unknown {
  const atLeast: Array<[string, unknown]> = []; // where(field, '>=', value)
  const query = {
    where: (field: string, _op: '>=', value: unknown) => (atLeast.push([field, value]), query),
    orderBy: () => query,
    limit: () => query,
    get: async () => {
      reads.push(path);
      const rows = Object.entries(docs)
        .filter(([k]) => k.startsWith(`${path}/`))
        .filter(([, d]) => atLeast.every(([f, v]) => String(d[f]) >= String(v)))
        .map(([, data]) => ({ data: () => data }));
      return { docs: rows };
    },
  };
  return { ...query, doc: (id: string) => doc(`${path}/${id}`) };
}
const getFirestoreDb = vi.fn(() => ({ collection }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb }));

const { directedGreeting, GREETING_DIRECTION, PONDER_DIRECTION, rememberCallerHistory } =
  await import('../greeting-direction.js');
const { takeOpenerClaim } = await import('../../../memory/recall/opener-claim.js');

type Request = { direction: string; facts: Record<string, string> };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;
const ASK = 'something to ask about from an earlier call';
const PONDERING = 'bogle_users/u1/predictive_intelligence/pondering';

const due = (over: Record<string, unknown> = {}) => ({
  [PONDERING]: {
    followUps: [{ text: 'How is your martial arts training going?', basis: 's1' }],
    thinkingOf: [],
    generatedAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    surfaced: [],
    ...over,
  },
});

let session = 0;
async function greet(history?: { calls: number }) {
  const id = `ponder-${++session}`;
  if (history) rememberCallerHistory(id, history);
  return directedGreeting(id, 'ferni', { userId: 'u1', userName: 'Sam' });
}

beforeEach(() => {
  vi.stubEnv('PONDERING', 'on');
  actorLine = undefined;
  openCommitments = [];
  docs = {};
  sets.length = 0;
  reads.length = 0;
  getFirestoreDb.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('opening on a pondered follow-up', () => {
  it('reads nothing and asks nothing with PONDERING off', async () => {
    vi.stubEnv('PONDERING', '');
    docs = due();
    await greet({ calls: 5 });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    expect(getFirestoreDb).not.toHaveBeenCalled();
  });

  it('offers the one due item and marks it raised once the line asks it', async () => {
    docs = due();
    actorLine = "Hey Sam. How's the martial arts going?";
    expect(await greet({ calls: 5 })).toBe("Hey Sam. How's the martial arts going?");
    expect(lastRequest().direction).toBe(GREETING_DIRECTION + PONDER_DIRECTION);
    expect(lastRequest().facts[ASK]).toBe('How is your martial arts training going?');
    await vi.waitFor(() => expect(sets).toHaveLength(1));
    expect(sets[0]).toMatchObject({ path: PONDERING, opts: { merge: true } });
  });

  it('never asks an item already raised', async () => {
    docs = due({ surfaced: ['s1:how is your martial arts training going'] });
    await greet({ calls: 5 });
    expect(lastRequest().facts[ASK]).toBeUndefined();
  });

  it('opens plainly on a first call without reading anything', async () => {
    docs = due();
    await greet({ calls: 1 });
    expect(lastRequest().facts[ASK]).toBeUndefined();
    expect(reads).toEqual([]);
  });

  it('opens plainly within two weeks of a crisis-level signal, not after', async () => {
    // As logCrisisSignal writes it (human-transfer/index.ts)
    const crisis = (daysAgo: number) => ({
      timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      signals: { suicidalIdeation: true, severity: 8 },
    });
    docs = { ...due(), 'bogle_users/u1/crisis_signals/c1': crisis(3) };
    await greet({ calls: 5 });
    expect(lastRequest().facts[ASK]).toBeUndefined();

    docs = { ...due(), 'bogle_users/u1/crisis_signals/c1': crisis(20) };
    await greet({ calls: 5 });
    expect(lastRequest().facts[ASK]).toBe('How is your martial arts training going?');
  });

  it('never opens on a topic they asked to forget since the pass ran', async () => {
    docs = { ...due(), 'bogle_users/u1/memory_state/forgotten': { topics: ['martial arts'] } };
    await greet({ calls: 5 });
    expect(lastRequest().facts[ASK]).toBeUndefined();
  });

  it('asks about what they said they would do instead, never both', async () => {
    docs = due();
    openCommitments = [{ statement: 'start running again' }];
    actorLine = 'Hey Sam. How did the martial arts and the running go?';
    await greet({ calls: 5 });
    expect(lastRequest().facts[ASK]).toBeUndefined();
    expect(lastRequest().direction).not.toContain(PONDER_DIRECTION);
    expect(sets).toEqual([]);
  });

  it('drops a line that says it was thinking about them, and keeps the item for later', async () => {
    docs = due();
    actorLine = 'Hey Sam, I was just thinking about you. How is the martial arts going?';
    const said = await greet({ calls: 5 });
    expect(said).not.toMatch(/thinking about you/i);
    expect(sets).toEqual([]);
  });

  it('claims the call opener when its line asked, so recall asks no second follow-up', async () => {
    docs = due();
    actorLine = "Hey Sam. How's the martial arts going?";
    await greet({ calls: 5 });
    expect(takeOpenerClaim('u1')).toBe('greeting');

    openCommitments = [{ statement: 'start running again' }];
    actorLine = 'Hey Sam. How did the running go?';
    await greet({ calls: 5 });
    expect(takeOpenerClaim('u1')).toBe('greeting');

    // Asked nothing, or the line was swapped for the plain hello: recall may ask.
    openCommitments = [];
    for (const line of [
      'Hey Sam. How has your week been?',
      'Hey Sam, I was just thinking about you. How is the martial arts going?',
    ]) {
      actorLine = line;
      await greet({ calls: 5 });
      expect(takeOpenerClaim('u1')).toBeUndefined();
    }
  });

  it('does not mark an item the line never asked', async () => {
    docs = due();
    actorLine = 'Hey Sam. How has your week been?';
    await greet({ calls: 5 });
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    expect(sets).toEqual([]);
  });
});
