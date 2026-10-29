/**
 * #3000: a crisis signal logged earlier on THIS call put the cross-call "CRISIS
 * FOLLOW-UP" note on every later turn of the same call (prod: ~216 turns over 40
 * minutes, after "I can't see." about a text was read as a medical emergency).
 *
 * CRISIS_FOLLOW_UP_PRIOR_CALLS (off by default): the follow-up is for a crisis on an
 * earlier call. One from this call counts only while the safety path holds risk on
 * this call (crisisRiskNoted). Runs the real writer (buildHumanTransferInjections ->
 * logCrisisSignal) and the real reader (buildCrisisHistoryInjection) on a fake store.
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

const { detectCrisisSignals, forgetRecentCrisis, logCrisisSignal } =
  await import('../../../../services/human-transfer/index.js');
const { noteCrisisRisk } = await import('../../../../services/safety/crisis-call-risk.js');
const { buildCrisisHistoryInjection, buildHumanTransferInjections } =
  await import('../better-than-human-builders.js');

const CANT_SEE = "I can't see.";
const CRISIS_LINE = "I want to kill myself. I've got the pills right here.";
let n = 0;
const fresh = () => {
  n += 1;
  return { uid: `uid-fu-${n}`, call: `session-AJ_fu-${n}` };
};

/** A turn where the caller says `words`; resolves once its crisis signal (if any) is stored. */
async function turn(words: string, uid: string, call: string): Promise<void> {
  const before = fake.stores.get(`${uid}/crisis_signals`)?.length ?? 0;
  await buildHumanTransferInjections(words, uid, call);
  if (detectCrisisSignals(words).severity > 0) {
    await vi.waitFor(() =>
      expect(fake.stores.get(`${uid}/crisis_signals`)?.length ?? 0).toBeGreaterThan(before)
    );
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('#3000: "I can\'t see." about a text, then a shopping question on the same call', () => {
  it('flags off (main): a crisis is logged and the follow-up rides the next turn', async () => {
    const { uid, call } = fresh();
    await turn(CANT_SEE, uid, call);
    expect(fake.stores.get(`${uid}/crisis_signals`)).toHaveLength(1);
    const next = await buildCrisisHistoryInjection(uid, call);
    expect(next?.category).toBe('crisis_follow_up');
    expect(next?.content).toContain('had a difficult moment 0 day(s) ago');
  });

  it('CRISIS_SIGHT_NEEDS_CUE on: nothing is logged, so nothing follows up', async () => {
    vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', 'on');
    const { uid, call } = fresh();
    await turn(CANT_SEE, uid, call);
    expect(fake.stores.get(`${uid}/crisis_signals`) ?? []).toHaveLength(0);
    expect(await buildCrisisHistoryInjection(uid, call)).toBeNull();
  });

  it('CRISIS_FOLLOW_UP_PRIOR_CALLS on: a same-call signal with no risk noted on the call gives no follow-up', async () => {
    const { uid, call } = fresh();
    await turn(CANT_SEE, uid, call); // the old lexical read still logs it
    expect(fake.stores.get(`${uid}/crisis_signals`)).toHaveLength(1);
    vi.stubEnv('CRISIS_FOLLOW_UP_PRIOR_CALLS', 'on');
    expect(await buildCrisisHistoryInjection(uid, call)).toBeNull();
    // ...while the next call still hears about it
    expect((await buildCrisisHistoryInjection(uid, `${call}-next`))?.category).toBe(
      'crisis_follow_up'
    );
  });
});

describe('CRISIS_FOLLOW_UP_PRIOR_CALLS on: real crises still follow up', () => {
  it('a crisis earlier on this call that the safety path noted keeps the follow-up', async () => {
    vi.stubEnv('CRISIS_FOLLOW_UP_PRIOR_CALLS', 'on');
    const { uid, call } = fresh();
    await turn(CRISIS_LINE, uid, call);
    noteCrisisRisk(call); // what turn-crisis.ts does on a crisis pattern
    expect((await buildCrisisHistoryInjection(uid, call))?.category).toBe('crisis_follow_up');
  });

  it("yesterday's crisis still follows up when a lexical-only read today is newer", async () => {
    vi.stubEnv('CRISIS_FOLLOW_UP_PRIOR_CALLS', 'on');
    const { uid, call } = fresh();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() - 86_400_000);
    await logCrisisSignal(uid, detectCrisisSignals(CRISIS_LINE), CRISIS_LINE, `${call}-yesterday`);
    vi.useRealTimers();
    await turn(CANT_SEE, uid, call);
    forgetRecentCrisis(uid);
    const followUp = await buildCrisisHistoryInjection(uid, call);
    expect(followUp?.content).toContain('had a difficult moment 1 day(s) ago');
  });
});
