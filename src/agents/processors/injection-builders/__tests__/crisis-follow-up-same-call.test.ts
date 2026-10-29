/**
 * #3000: a crisis signal logged earlier on THIS call put the cross-call "CRISIS
 * FOLLOW-UP" note on every later turn of the same call (prod: ~216 turns over 40
 * minutes, after "I can't see." about a text was read as a medical emergency).
 *
 * CRISIS_SIGHT_NEEDS_CUE (off by default) drops only that false note: an everyday
 * "can't see" is never logged, so nothing follows up. Every other same-call crisis
 * keeps main's follow-up. Runs the real writer (buildHumanTransferInjections ->
 * logCrisisSignal) and the real reader (buildCrisisHistoryInjection) on a fake store,
 * with the independent verifier's 20 real crises for #3034, verbatim.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const stores = new Map<string, Array<Record<string, unknown>>>();
  const docsOf = (key: string) => {
    if (!stores.has(key)) stores.set(key, []);
    return stores.get(key)!;
  };
  const query = (docs: Array<Record<string, unknown>>) => {
    let rows = [...docs];
    const chain = {
      where: (field: string, _op: string, value: string) => {
        rows = rows.filter((d) => String(d[field]) >= value);
        return chain;
      },
      orderBy: (field: string) => {
        rows.sort((a, b) => String(b[field]).localeCompare(String(a[field])));
        return chain;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return chain;
      },
      get: async () => ({ docs: rows.map((d) => ({ data: () => structuredClone(d) })) }),
      add: async (doc: Record<string, unknown>) => void docs.push(doc),
    };
    return chain;
  };
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (name: string) => query(docsOf(`${uid}/${name}`)) }),
    }),
  };
  return { db, stores };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));

const { buildCrisisHistoryInjection, buildHumanTransferInjections } =
  await import('../better-than-human-builders.js');

const EVERYDAY = "I can't see your text, it never came through";
/** The verifier's real same-call crises (#3034), verbatim. */
const REAL_CRISES = [
  "i'm having a heart attack",
  "i'm having chest pain and my arm hurts",
  "i can't breathe",
  "i'm bleeding a lot",
  "i think i'm dying",
  "i'm having a stroke",
  "i got bleach in my eyes and i can't see",
  "i can't see, i think i'm having a stroke",
  "i can't see, call 911",
  "i can't see out of my left eye",
  'my husband hit me',
  'he threatened me again tonight',
  "i'm scared to go home",
  'he hit my daughter',
  'i overdosed',
  'i took too much',
  'i want to hurt him',
  "they're watching me through the walls",
  'i cut myself last night',
  'i want to kill myself',
];

let n = 0;
const fresh = () => {
  n += 1;
  return { uid: `uid-fu-${n}`, call: `session-AJ_fu-${n}` };
};
const stored = (uid: string) => fake.stores.get(`${uid}/crisis_signals`)?.length ?? 0;

/** A turn where the caller says `words`, then the next turn's follow-up. */
async function turnThenNext(words: string, expectLogged: boolean) {
  const { uid, call } = fresh();
  await buildHumanTransferInjections(words, uid, call);
  if (expectLogged) await vi.waitFor(() => expect(stored(uid)).toBe(1));
  else
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  return { logged: stored(uid), next: await buildCrisisHistoryInjection(uid, call) };
}

afterEach(() => vi.unstubAllEnvs());

describe('#3000: an everyday "can\'t see", then the next turn of the same call', () => {
  it('flag off (main): a crisis is logged and the follow-up rides the next turn', async () => {
    const { logged, next } = await turnThenNext(EVERYDAY, true);
    expect(logged).toBe(1);
    expect(next?.category).toBe('crisis_follow_up');
    expect(next?.content).toContain('had a difficult moment 0 day(s) ago');
  });

  it('flag on: nothing is logged, so nothing follows up', async () => {
    vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', 'on');
    const { logged, next } = await turnThenNext(EVERYDAY, false);
    expect(logged).toBe(0);
    expect(next).toBeNull();
  });
});

describe("flag on: every real same-call crisis keeps main's follow-up", () => {
  it.each(REAL_CRISES)('%s', async (words) => {
    vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', 'on');
    const { logged, next } = await turnThenNext(words, true);
    expect(logged).toBe(1);
    expect(next?.category).toBe('crisis_follow_up');
  });
});
