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
 *
 * CRISIS_SAME_CALL_NOTE_FADES (off by default; Seth: "fade after a few turns"): a
 * same-call note shows for the 3 caller turns after its signal, then stops; a new
 * signal restarts the 3 turns. Cross-call notes are unchanged.
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

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

// ============================================================================
// CRISIS_SAME_CALL_NOTE_FADES
// ============================================================================

const T0 = Date.parse('2026-10-29T05:40:00Z');
/** The clock at a caller turn: ten seconds a turn, so every signal is newer than the last. */
const at = (turn: number, daysAgo = 0) =>
  vi.setSystemTime(T0 - daysAgo * 86_400_000 + turn * 10_000);

/** One caller turn through the real writer and reader, as context-injections.ts runs them. */
async function callerTurn(uid: string, call: string, turn: number, words = 'okay sure') {
  at(turn);
  const before = stored(uid);
  await buildHumanTransferInjections(words, uid, call, turn);
  if (words !== 'okay sure') await vi.waitFor(() => expect(stored(uid)).toBe(before + 1));
  return buildCrisisHistoryInjection(uid, call, turn);
}

/** Which of turns from..to carry the follow-up note. */
async function notedTurns(uid: string, call: string, from: number, to: number) {
  const noted: number[] = [];
  for (let turn = from; turn <= to; turn += 1) {
    if ((await callerTurn(uid, call, turn))?.category === 'crisis_follow_up') noted.push(turn);
  }
  return noted;
}

const fades = () => vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', 'on');
const clock = () => vi.useFakeTimers({ toFake: ['Date'] });

describe('CRISIS_SAME_CALL_NOTE_FADES: the prod shape, a bare "I can\'t see."', () => {
  it('flag off (main): the note rides every later turn, and the doc has no turn', async () => {
    clock();
    const { uid, call } = fresh();
    await callerTurn(uid, call, 5, "I can't see.");
    expect(await notedTurns(uid, call, 6, 20)).toEqual(Array.from({ length: 15 }, (_, i) => 6 + i));
    expect(fake.stores.get(`${uid}/crisis_signals`)?.[0]).not.toHaveProperty('turn');
  });

  it('flag on: the note shows on turns +1..+3, then never again', async () => {
    fades();
    clock();
    const { uid, call } = fresh();
    await callerTurn(uid, call, 5, "I can't see.");
    expect(fake.stores.get(`${uid}/crisis_signals`)?.[0]).toMatchObject({ turn: 5 });
    expect(await notedTurns(uid, call, 6, 20)).toEqual([6, 7, 8]);
  });
});

describe('CRISIS_SAME_CALL_NOTE_FADES: real crises fade, and a new signal restarts', () => {
  it.each(REAL_CRISES)('%s', async (words) => {
    fades();
    clock();
    const { uid, call } = fresh();
    await callerTurn(uid, call, 10, words);
    expect(await notedTurns(uid, call, 11, 14)).toEqual([11, 12, 13]);
    await callerTurn(uid, call, 15, words); // the same crisis said again on +5
    expect(await notedTurns(uid, call, 16, 19)).toEqual([16, 17, 18]);
  });
});

describe('CRISIS_SAME_CALL_NOTE_FADES: a crisis from an earlier call is unchanged', () => {
  it.each([
    [0.01, 'had a difficult moment 0 day(s) ago'],
    [1, 'had a difficult moment 1 day(s) ago'],
    [6, 'had a difficult moment 6 day(s) ago'],
    [8, null],
  ] as const)('%s days ago', async (daysAgo, said) => {
    clock();
    const contents: Array<string | null> = [];
    for (const v of ['off', 'on'] as const) {
      vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', v);
      const { uid, call } = fresh();
      at(0, daysAgo);
      await buildHumanTransferInjections('i want to kill myself', uid, `${call}-earlier`, 2);
      await vi.waitFor(() => expect(stored(uid)).toBe(1));
      for (const turn of [1, 4, 40]) {
        at(turn);
        contents.push((await buildCrisisHistoryInjection(uid, call, turn))?.content ?? null);
      }
    }
    for (const content of contents) {
      if (said === null) expect(content).toBeNull();
      else expect(content).toContain(said);
    }
  });
});
