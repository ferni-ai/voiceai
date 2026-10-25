/**
 * Wins: a commitment marked done becomes one win, named once by the next
 * opener. Only the store and the forgotten-topics read are fakes, plus one
 * test that drives the real updateCommitmentStatus with a fake Firestore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersonFlagLookup } from '../../../config/person-flag.js';
import {
  isWinsOn,
  markWinSurfaced,
  recordWinFromCommitment,
  winForOpener,
  winFromCommitment,
  type Win,
  type WinStore,
} from '../wins.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const promise = {
  statement: "I'll call my sister Sunday",
  summary: 'call sister',
  status: 'completed',
};

function memoryStore(commitments: Record<string, Record<string, unknown>> = {}, wins: Win[] = []) {
  const store: WinStore = {
    commitment: async (_u, id) => commitments[id] ?? null,
    create: async (_u, win) => {
      if (wins.some((w) => w.id === win.id)) return false;
      wins.push(win);
      return true;
    },
    recent: async () => [...wins].sort((a, b) => b.doneAt.localeCompare(a.doneAt)),
    markSurfaced: async (_u, id, at) => {
      const w = wins.find((x) => x.id === id);
      if (w) w.surfacedAt = at;
    },
  };
  return { store, wins };
}
const none = async () => [] as string[];

// The behaviour below runs with the flag on; 'the flag' checks both states.
beforeEach(() => {
  vi.stubEnv('COACH_WINS', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('COACH_WINS per person', () => {
  afterEach(() => usePersonFlagLookup(async () => undefined));

  it('a "done" on a server whose own flag is off records a win only for the cohort member', async () => {
    usePersonFlagLookup(async (u) => (u === 'seth' ? 'on' : undefined));
    const env = { COACH_WINS: 'off' };
    const seth = memoryStore({ c1: promise });
    const mom = memoryStore({ c1: promise });

    expect(
      await recordWinFromCommitment('seth', 'c1', { store: seth.store, forgotten: none, env })
    ).toBe(true);
    expect(
      await recordWinFromCommitment('mom', 'c1', { store: mom.store, forgotten: none, env })
    ).toBe(false);
    expect(seth.wins.map((w) => w.id)).toEqual(['c1']);
    expect(mom.wins).toEqual([]);
  });

  it("a person's own off beats the server's on", async () => {
    usePersonFlagLookup(async () => 'off');
    const { store, wins } = memoryStore({ c1: promise });
    const env = { COACH_WINS: 'on' };
    expect(await recordWinFromCommitment('mom', 'c1', { store, forgotten: none, env })).toBe(false);
    expect(wins).toEqual([]);
  });
});

describe('the flag', () => {
  it('is off by default; COACH_WINS=on turns it on', () => {
    expect(isWinsOn({})).toBe(false);
    expect(isWinsOn({ COACH_WINS: 'off' })).toBe(false);
    expect(isWinsOn({ COACH_WINS: 'on' })).toBe(true);
  });

  it('with the flag unset, nothing is written or offered', async () => {
    const { store, wins } = memoryStore({ c1: promise }, [
      { id: 'c0', commitmentId: 'c0', text: 'went for a run', doneAt: NOW.toISOString() },
    ]);
    const env = {};
    expect(await recordWinFromCommitment('u', 'c1', { store, forgotten: none, env })).toBe(false);
    expect(wins).toHaveLength(1);
    expect(await winForOpener('u', { store, forgotten: none, env, now: NOW })).toBeUndefined();
  });
});

describe('recording a win', () => {
  it("stores the caller's words, keyed by the commitment, with doneAt", async () => {
    const { store, wins } = memoryStore({ c1: promise });
    expect(wins).toEqual([]);
    const ok = await recordWinFromCommitment('voice-eval-u1', 'c1', {
      store,
      forgotten: none,
      now: NOW,
    });
    expect(ok).toBe(true);
    expect(wins).toEqual([
      {
        id: 'c1',
        commitmentId: 'c1',
        text: "I'll call my sister Sunday",
        doneAt: NOW.toISOString(),
      },
    ]);
  });

  it('marking it done twice keeps one win', async () => {
    const { store, wins } = memoryStore({ c1: promise });
    await recordWinFromCommitment('u', 'c1', { store, forgotten: none, now: NOW });
    expect(await recordWinFromCommitment('u', 'c1', { store, forgotten: none })).toBe(false);
    expect(wins).toHaveLength(1);
  });

  it('writes nothing for a forgotten topic, unreadable forgotten topics, a goodbye plan, or flag off', async () => {
    const cases: Array<[Record<string, unknown>, Parameters<typeof recordWinFromCommitment>[2]]> = [
      [promise, { forgotten: async () => ['sister'] }],
      [promise, { forgotten: async () => null }],
      [
        { ...promise, statement: 'off to dinner with Ana', source: 'goodbye_plan' },
        { forgotten: none },
      ],
      [{ statement: 'gym' }, { forgotten: none }],
      [promise, { forgotten: none, env: { COACH_WINS: 'off' } }],
    ];
    for (const [doc, deps] of cases) {
      const { store, wins } = memoryStore({ c1: doc });
      await recordWinFromCommitment('u', 'c1', { ...deps, store });
      expect(wins, JSON.stringify(doc)).toEqual([]);
    }
  });

  it('never throws when the store fails', async () => {
    const { store } = memoryStore();
    store.commitment = async () => {
      throw new Error('down');
    };
    await expect(recordWinFromCommitment('u', 'c1', { store, forgotten: none })).resolves.toBe(
      false
    );
  });

  it('winFromCommitment trims long text', () => {
    const w = winFromCommitment('c', { statement: `I will ${'really '.repeat(40)}do it` }, NOW);
    expect(w?.text.length).toBe(140);
  });
});

describe('the opener reads it once', () => {
  const win = (id: string, daysAgo: number, extra: Partial<Win> = {}): Win => ({
    id,
    commitmentId: id,
    text: `I'll finish task ${id}`,
    doneAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    ...extra,
  });

  it('offers the newest fresh unnamed win, then not again once marked', async () => {
    const { store } = memoryStore({}, [win('old', 20), win('a', 3), win('b', 1)]);
    const first = await winForOpener('u', { store, forgotten: none, now: NOW });
    expect(first?.id).toBe('b');
    await markWinSurfaced('u', 'b', { store, now: NOW });
    expect((await winForOpener('u', { store, forgotten: none, now: NOW }))?.id).toBe('a');
    await markWinSurfaced('u', 'a', { store, now: NOW });
    // Only the 20-day-old one is left: too old to bring up.
    expect(await winForOpener('u', { store, forgotten: none, now: NOW })).toBeUndefined();
  });

  it('offers nothing when forgotten topics cannot be read, and skips a forgotten one', async () => {
    const { store } = memoryStore({}, [win('a', 1, { text: "I'll call my sister" }), win('b', 2)]);
    expect(
      await winForOpener('u', { store, forgotten: async () => null, now: NOW })
    ).toBeUndefined();
    expect(
      (await winForOpener('u', { store, forgotten: async () => ['sister'], now: NOW }))?.id
    ).toBe('b');
  });
});

describe('every "done" goes through updateCommitmentStatus', () => {
  it("marking a commitment completed records its win; other statuses don't", async () => {
    vi.resetModules();
    const recordWin = vi.fn(async () => true);
    vi.doMock('../wins.js', () => ({ recordWinFromCommitment: recordWin }));
    vi.doMock('../firestore-utils.js', () => ({
      getFirestoreDb: () => ({
        collection: () => ({
          doc: () => ({ collection: () => ({ doc: () => ({ update: async () => undefined }) }) }),
        }),
      }),
      cleanForFirestore: (x: unknown) => x,
      recordDegradation: () => undefined,
    }));
    const { updateCommitmentStatus } = await import('../commitment-keeper.js');
    await updateCommitmentStatus('voice-eval-u1', 'c1', 'deferred');
    expect(recordWin).not.toHaveBeenCalled();
    await updateCommitmentStatus('voice-eval-u1', 'c1', 'completed');
    expect(recordWin).toHaveBeenCalledWith('voice-eval-u1', 'c1');
    vi.doUnmock('../wins.js');
    vi.doUnmock('../firestore-utils.js');
  });
});
