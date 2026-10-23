/**
 * TURN_MEMORY_RERANK through the real retrieveForTurn, runHybridSearchWithTimeout,
 * hybridSearch, fusion and turn-memory-rerank. Only the vector store and the
 * judge model are fake. Each case first shows what reaches the prompt without
 * the flag, then what the stage changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Hit = { documentId: string; score: number; text: string; savedAt?: Date };
const fake = vi.hoisted(() => ({
  memories: [] as Hit[],
  timestampsAsked: 0,
  crossEncoderCalls: 0,
  prompts: [] as string[],
  reply: async (_prompt: string): Promise<string> => '{"keep":[],"old":[]}',
}));

vi.mock('../semantic-memory-search.js', () => ({
  // The vector store's contract: cosine, best first, >= minScore; saved date only when asked.
  searchMemories: async (
    _q: string,
    _u: string,
    o: { topK: number; minScore: number; includeTimestamp?: boolean }
  ) => {
    if (o.includeTimestamp) fake.timestampsAsked++;
    return {
      results: fake.memories
        .filter((m) => m.score >= o.minScore)
        .slice(0, o.topK)
        .map(({ savedAt, ...m }) => ({ ...m, source: 'conversation', sourceId: 's1', ...(o.includeTimestamp && savedAt && { timestamp: savedAt.toISOString() }) })), // prettier-ignore
    };
  },
}));
vi.mock('../bm25-search.js', () => ({ searchEntitiesBM25: async () => [] }));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
vi.mock('../cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, results: unknown[]) => {
    fake.crossEncoderCalls++;
    return results;
  },
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

import { retrieveForTurn } from '../turn-memory-retrieval.js';
import {
  MIN_JUDGE_CONFIDENCE,
  gateTurnMemories,
  readVerdict,
  turnMemoryJudgeTimeoutMs,
  turnMemoryRerankOn,
} from '../turn-memory-rerank.js';

let session = 0;
const turn = async (transcript: string) => {
  const context = await retrieveForTurn({ userId: 'u1', sessionId: `s${++session}`, transcript, turnNumber: 2 }); // prettier-ignore
  return { ids: context.memories.map((m) => m.id), metrics: context.metrics };
};
const flags = (rerank: 'on' | 'off', timeoutMs?: number) => {
  vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
  vi.stubEnv('TURN_MEMORY_RERANK', rerank);
  vi.stubEnv('TURN_MEMORY_RERANK_TIMEOUT_MS', timeoutMs === undefined ? '' : String(timeoutMs));
};

const SISTER = { documentId: 'wedding', score: 0.66, text: 'sister Jess is getting married in Lisbon in November' }; // prettier-ignore
const COUSIN = { documentId: 'cousin', score: 0.68, text: 'cousin Mark is getting married in Chicago in the fall' }; // prettier-ignore
const ERRAND = { documentId: 'errand', score: 0.47, text: 'got a haircut on Tuesday' };
const GYM_OLD = { documentId: 'gym-old', score: 0.71, text: 'gym membership at Crunch, goes before work', savedAt: new Date('2025-03-02T10:00:00Z') }; // prettier-ignore
const GYM_NEW = { documentId: 'gym-new', score: 0.69, text: 'cancelled Crunch, now climbs at a bouldering gym after work', savedAt: new Date('2026-08-19T10:00:00Z') }; // prettier-ignore

/** A judge that keeps the candidates whose text matches, by their number in the prompt. */
const keepByText =
  (keep: string[], old: string[] = []) =>
  async (prompt: string) => {
    const numberOf = (text: string) => Number(new RegExp(`^(\\d+)\\. (?:\\[[^\\]]*\\] )?${text}`, 'm').exec(prompt)?.[1]); // prettier-ignore
    return JSON.stringify({ keep: keep.map((t) => [numberOf(t), 0.9]), old: old.map(numberOf) });
  };

describe('TURN_MEMORY_RERANK', () => {
  beforeEach(() => {
    fake.memories = [COUSIN, SISTER, ERRAND];
    fake.timestampsAsked = 0;
    fake.crossEncoderCalls = 0;
    fake.prompts = [];
    fake.reply = keepByText([SISTER.text]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('flag off: the near miss reaches the prompt, no judge, the old reranker runs, no dates asked', async () => {
    flags('off', 2000);
    expect((await turn("my sister's big day is coming up soon")).ids).toEqual([
      'cousin',
      'wedding',
    ]);
    expect([fake.prompts.length, fake.crossEncoderCalls, fake.timestampsAsked]).toEqual([0, 1, 0]);
  });

  it('needs TURN_MEMORY_RRF_SCALE: rerank on with it off gives what both off give', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'off');
    const run = async () => {
      const { ids } = await turn("my sister's big day is coming up soon");
      return [ids, fake.prompts.length, fake.crossEncoderCalls, fake.timestampsAsked];
    };
    const bothOff = await run();
    vi.stubEnv('TURN_MEMORY_RERANK', 'on');
    vi.stubEnv('TURN_MEMORY_RERANK_TIMEOUT_MS', '2000');
    expect(await run()).toEqual(bothOff);
    expect(fake.prompts).toEqual([]);
  });

  it('judge: rejects the same-subject near miss and keeps the true hit', async () => {
    flags('on', 2000);
    const { ids, metrics } = await turn("my sister's big day is coming up soon");
    expect(ids).toEqual(['wedding']);
    expect(metrics.rerankingApplied).toBe(true);
    expect(fake.crossEncoderCalls).toBe(0); // the old stage is skipped
    // The judge read the turn and every candidate at cosine >= 0.45.
    expect(fake.prompts[0]).toContain("my sister's big day");
    for (const m of [COUSIN, SISTER, ERRAND]) expect(fake.prompts[0]).toContain(m.text);
  });

  it('judge: two kept memories go to the cap without the old cross-encoder stage', async () => {
    flags('on', 2000);
    fake.reply = keepByText([SISTER.text, COUSIN.text]);
    expect((await turn('both weddings are this year')).ids).toEqual(['cousin', 'wedding']);
    expect(fake.crossEncoderCalls).toBe(0);
  });

  it('judge: keeps nothing when it finds nothing about the turn', async () => {
    flags('on', 2000);
    fake.reply = async () => '{"keep":[],"old":[]}';
    expect((await turn('nice weather we are having today')).ids).toEqual([]);
  });

  it('judge: the newer fact wins over the older one it replaces, by saved date', async () => {
    fake.memories = [GYM_OLD, GYM_NEW];
    flags('off');
    expect((await turn("I'm heading to the gym after this")).ids).toEqual(['gym-old', 'gym-new']);
    flags('on', 2000);
    fake.reply = keepByText([GYM_OLD.text, GYM_NEW.text], [GYM_OLD.text]);
    expect((await turn("I'm heading to the gym after this")).ids).toEqual(['gym-new']);
    // The saved dates came through the real hybrid search into the prompt.
    expect(fake.prompts[0]).toContain(`[2025-03-02] ${GYM_OLD.text}`);
    expect(fake.prompts[0]).toContain(`[2026-08-19] ${GYM_NEW.text}`);
  });

  it('timeout: a judge slower than TURN_MEMORY_RERANK_TIMEOUT_MS falls back to the runner-up gate', async () => {
    flags('on', 40);
    fake.reply = async (p) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 400);
      });
      return keepByText([COUSIN.text, SISTER.text])(p);
    };
    const started = Date.now();
    const { ids, metrics } = await turn("my sister's big day is coming up soon");
    expect(Date.now() - started).toBeLessThan(300);
    // 0.68 vs 0.66: no clear winner, so the gate sends nothing rather than the near miss.
    expect(ids).toEqual([]);
    expect(metrics.rerankingApplied).toBe(false);
    // A clear winner still goes through on timeout.
    fake.memories = [{ ...SISTER, score: 0.74 }, ERRAND];
    expect((await turn("my sister's big day is coming up soon")).ids).toEqual(['wedding']);
  });

  it('an unreadable verdict falls back to the runner-up gate', async () => {
    flags('on', 2000);
    fake.memories = [{ ...SISTER, score: 0.74 }, COUSIN, ERRAND];
    fake.reply = async () => 'Sure! The sister one.';
    const { ids, metrics } = await turn("my sister's big day is coming up soon");
    expect(ids).toEqual(['wedding']);
    expect(metrics.rerankingApplied).toBe(false);
  });

  it('runner-up gate alone (timeout 0): sends the best only when it clears the next by 0.04', async () => {
    flags('on');
    expect((await turn("my sister's big day is coming up soon")).ids).toEqual([]); // 0.68 vs 0.66
    fake.memories = [{ ...COUSIN, score: 0.71 }, SISTER, ERRAND];
    expect((await turn("my sister's big day is coming up soon")).ids).toEqual(['cousin']); // 0.71 vs 0.66
    fake.memories = [{ ...SISTER, score: 0.54 }, ERRAND];
    expect((await turn("my sister's big day is coming up soon")).ids).toEqual([]); // under 0.55
    expect(fake.prompts).toEqual([]);
  });
});

describe('readVerdict', () => {
  it('keeps listed candidates, drops old ones, out-of-range numbers and low confidence', () => {
    const v = readVerdict(`{"keep":[[1,0.9],[2,0.8],[3,${MIN_JUDGE_CONFIDENCE - 0.1}],[9,1]],"old":[2]}`, 3); // prettier-ignore
    expect([...(v ?? [])]).toEqual([0]);
  });
  it('reads fenced JSON and bare numbers; null for prose or a missing keep list', () => {
    expect([...(readVerdict('```json\n{"keep":[2]}\n```', 2) ?? [])]).toEqual([1]);
    expect(readVerdict('the first one', 2)).toBeNull();
    expect(readVerdict('{"old":[1]}', 2)).toBeNull();
  });
  it('gateTurnMemories with TURN_MEMORY_RRF_SCALE off hands back the fused results untouched', async () => {
    const fused = [
      { id: 'a', score: 0.0098, legScores: { vector: 0.4 }, text: 'a', type: 'memory' as const, sources: ['vector'], scoreBreakdown: {} }, // prettier-ignore
    ];
    const env = { TURN_MEMORY_RERANK: 'on', TURN_MEMORY_RERANK_TIMEOUT_MS: '2000' };
    const metrics = { rerankMs: 0, rerankingApplied: false };
    expect(await gateTurnMemories(fused, 'some turn text', false, metrics, env)).toBe(fused);
    expect(fake.prompts).toEqual([]);
  });
  it('TURN_MEMORY_RERANK is on only with TURN_MEMORY_RRF_SCALE', () => {
    expect(turnMemoryRerankOn({ TURN_MEMORY_RERANK: 'on' })).toBe(false);
    expect(turnMemoryRerankOn({ TURN_MEMORY_RERANK: 'on', TURN_MEMORY_RRF_SCALE: 'on' })).toBe(
      true
    );
  });
  it('TURN_MEMORY_RERANK_TIMEOUT_MS: 0 by default, clamped to 0-5000', () => {
    const t = (v?: string) => turnMemoryJudgeTimeoutMs({ TURN_MEMORY_RERANK_TIMEOUT_MS: v });
    expect([t(), t('abc'), t('150'), t('-5'), t('99999')]).toEqual([0, 0, 150, 0, 5000]);
  });
});
