/**
 * TURN_MEMORY_JUDGE_ASYNC through the real retrieveForTurn, hybrid search,
 * fusion, turn-memory-rerank and turn-memory-pending. Only the vector store
 * (a fixed result list per turn text) and the judge model are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Hit = { documentId: string; score: number; text: string };
const fake = vi.hoisted(() => ({
  byTurn: new Map<string, Hit[]>(),
  prompts: [] as string[],
  reply: async (_prompt: string): Promise<string> => '{"keep":[],"old":[]}',
}));

vi.mock('../semantic-memory-search.js', () => ({
  searchMemories: async (q: string, _u: string, o: { topK: number; minScore: number }) => ({
    results: (fake.byTurn.get(q) ?? [])
      .filter((m) => m.score >= o.minScore)
      .slice(0, o.topK)
      .map((m) => ({ ...m, source: 'conversation', sourceId: 's1' })),
  }),
}));
vi.mock('../bm25-search.js', () => ({ searchEntitiesBM25: async () => [] }));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
vi.mock('../cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, r: unknown[]) => r,
}));
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async (prompt: string) => {
      fake.prompts.push(prompt);
      const text = await fake.reply(prompt);
      return { response: { text: () => text } };
    },
  }),
}));

import type { HybridSearchResult } from '../hybrid-search.js';
import { retrieveForTurn } from '../turn-memory-retrieval.js';
import { gateWithPendingRecall, settleTurnMemoryJudges, worthJudging } from '../turn-memory-pending.js'; // prettier-ignore

const SISTER = { documentId: 'wedding', text: 'sister Jess is getting married in Lisbon in November' }; // prettier-ignore
const COUSIN = { documentId: 'cousin', text: 'cousin Mark is getting married in Chicago in the fall' }; // prettier-ignore
const HAIRCUT = { documentId: 'haircut', text: 'got a haircut on Tuesday' };
const GYM_OLD = { documentId: 'gym-old', text: 'gym membership at Crunch, goes before work' };
const GYM_NEW = { documentId: 'gym-new', text: 'cancelled Crunch, now climbs at a bouldering gym' };

const BIG_DAY = "my sister's big day is coming up soon";
const TOAST = "I still haven't written a toast for her";
const POTTERY = 'my clay class got cancelled again this week';

/** A judge that keeps the candidates whose text matches, by their number in the prompt. */
const keepByText =
  (keep: string[], old: string[] = []) =>
  async (prompt: string) => {
    const numberOf = (text: string) => Number(new RegExp(`^(\\d+)\\. (?:\\[[^\\]]*\\] )?${text}`, 'm').exec(prompt)?.[1]); // prettier-ignore
    return JSON.stringify({ keep: keep.map((t) => [numberOf(t), 0.9]), old: old.map(numberOf) });
  };

let sessionCount = 0;
let sessionId = '';
const turn = async (transcript: string, turnNumber: number) => {
  const context = await retrieveForTurn({ userId: 'u1', sessionId, transcript, turnNumber });
  return context.memories.map((m) => m.id);
};
const flags = (async: 'on' | 'off') => {
  vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
  vi.stubEnv('TURN_MEMORY_RERANK', 'on');
  vi.stubEnv('TURN_MEMORY_RERANK_TIMEOUT_MS', '');
  vi.stubEnv('TURN_MEMORY_JUDGE_ASYNC', async);
};

describe('TURN_MEMORY_JUDGE_ASYNC', () => {
  beforeEach(() => {
    sessionId = `pending-${++sessionCount}`;
    fake.prompts = [];
    // Turn t: a near-miss cluster, so the gate sends nothing; the follow-up finds the sister lower.
    fake.byTurn.set(BIG_DAY, [{ ...COUSIN, score: 0.68 }, { ...SISTER, score: 0.66 }, { ...HAIRCUT, score: 0.47 }]); // prettier-ignore
    fake.byTurn.set(TOAST, [
      { ...SISTER, score: 0.5 },
      { ...COUSIN, score: 0.48 },
    ]);
    fake.byTurn.set(POTTERY, [{ ...HAIRCUT, score: 0.46 }]);
    fake.reply = keepByText([SISTER.text]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('off: the follow-up gets nothing, and no judge runs', async () => {
    flags('off');
    expect([await turn(BIG_DAY, 2), await turn(TOAST, 3)]).toEqual([[], []]);
    expect(fake.prompts).toEqual([]);
  });

  it("carries the judge's pick into the next turn when that turn's search finds it", async () => {
    flags('on');
    expect(await turn(BIG_DAY, 2)).toEqual([]); // the gate's answer, unchanged
    await settleTurnMemoryJudges(sessionId);
    expect(await turn(TOAST, 3)).toEqual(['wedding']);
  });

  it('never waits for the judge: the turn returns with the gate pick while the judge is out', async () => {
    flags('on');
    fake.byTurn.set(BIG_DAY, [
      { ...SISTER, score: 0.74 },
      { ...COUSIN, score: 0.6 },
    ]);
    fake.reply = async (p) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 400);
      });
      return keepByText([SISTER.text])(p);
    };
    const started = Date.now();
    expect(await turn(BIG_DAY, 2)).toEqual(['wedding']);
    expect(Date.now() - started).toBeLessThan(300);
    expect(fake.prompts).toHaveLength(1);
    await settleTurnMemoryJudges(sessionId);
  });

  it('drops a pending pick when the subject moves on, and does not bring it back later', async () => {
    flags('on');
    await turn(BIG_DAY, 2);
    await settleTurnMemoryJudges(sessionId);
    expect(await turn(POTTERY, 3)).toEqual([]); // sister not found at >= 0.45 on this turn
    expect(await turn(TOAST, 4)).toEqual([]);
  });

  it('a pick lives 2 caller turns: still carried at t+2, not at t+3', async () => {
    flags('on');
    await turn(BIG_DAY, 2);
    await settleTurnMemoryJudges(sessionId);
    expect(await turn(TOAST, 4)).toEqual(['wedding']);
    sessionId = `pending-${++sessionCount}`;
    await turn(BIG_DAY, 2);
    await settleTurnMemoryJudges(sessionId);
    expect(await turn(TOAST, 5)).toEqual([]);
  });

  it('never carries a fact a judge marked superseded, even if a later judge keeps it', async () => {
    flags('on');
    const GYM = "I'm heading to the gym after work today";
    const GYM_AGAIN = 'my forearms are still sore from the gym';
    fake.byTurn.set(GYM, [
      { ...GYM_OLD, score: 0.62 },
      { ...GYM_NEW, score: 0.61 },
    ]);
    fake.byTurn.set(GYM_AGAIN, [
      { ...GYM_OLD, score: 0.52 },
      { ...GYM_NEW, score: 0.51 },
    ]);
    fake.reply = keepByText([GYM_OLD.text, GYM_NEW.text], [GYM_OLD.text]);
    expect(await turn(GYM, 2)).toEqual([]);
    await settleTurnMemoryJudges(sessionId);
    fake.reply = keepByText([GYM_OLD.text]); // turn 3's judge disagrees
    expect(await turn(GYM_AGAIN, 3)).toEqual(['gym-new']);
    await settleTurnMemoryJudges(sessionId);
    expect(await turn(GYM_AGAIN, 4)).toEqual([]);
  });

  it('skips the judge on short turns and turns whose best candidate is under 0.50', async () => {
    flags('on');
    fake.byTurn.set('oh wow, really?', [{ ...SISTER, score: 0.6 }]);
    await turn('oh wow, really?', 2);
    await turn(POTTERY, 3); // best candidate 0.46
    expect(fake.prompts).toEqual([]);
    expect(worthJudging('uh huh, go on', [{ score: 0.9 }])).toBe(true);
    expect(worthJudging('yeah yeah, totally', [{ score: 0.9 }])).toBe(false);
  });

  it('a failed judge leaves no pending recall and the turn still gets the gate pick', async () => {
    flags('on');
    fake.reply = async () => {
      throw new Error('Vertex 503');
    };
    expect(await turn(BIG_DAY, 2)).toEqual([]);
    await settleTurnMemoryJudges(sessionId);
    expect(await turn(TOAST, 3)).toEqual([]);
  });
});

describe('gateWithPendingRecall', () => {
  const r = (id: string, score: number) => ({ id, score, text: id, type: 'memory' as const, sources: ['vector'], scoreBreakdown: {} }); // prettier-ignore
  const turnAt = (turnNumber: number) => ({ transcript: 'she is so nervous about the whole thing', sessionId: 'direct', turnNumber }); // prettier-ignore

  it('does not hold back what the gate already sent this turn', async () => {
    const both = [r('a', 0.7), r('b', 0.6)];
    const judge = async (_c: HybridSearchResult[]) => ({ keep: new Set([0, 1]), old: new Set<number>() }); // prettier-ignore
    expect(gateWithPendingRecall([r('a', 0.7)], both, both, turnAt(2), judge).map((x) => x.id)).toEqual(['a']); // prettier-ignore
    await settleTurnMemoryJudges('direct');
    // Next turn the gate sends nothing; only b was pending.
    expect(gateWithPendingRecall([], both, both, turnAt(3), judge).map((x) => x.id)).toEqual(['b']);
  });

  it('lets go of a background judge that never answers, with nothing left pending', async () => {
    const both = [r('a', 0.7), r('b', 0.6)];
    const hung = async (_c: HybridSearchResult[]) => new Promise<null>(() => {});
    const t = { ...turnAt(2), sessionId: 'hung' };
    gateWithPendingRecall([], both, both, t, hung, 30);
    await settleTurnMemoryJudges('hung'); // would never resolve without the timeout
    const answers = async (_c: HybridSearchResult[]) => ({ keep: new Set<number>(), old: new Set<number>() }); // prettier-ignore
    expect(gateWithPendingRecall([], both, both, { ...t, turnNumber: 3 }, answers)).toEqual([]);
  });
});
