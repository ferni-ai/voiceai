/**
 * The memory flags a cohort may set (CALL_NEWS_OPENER, TURN_MEMORY_RRF_SCALE,
 * TURN_MEMORY_RERANK) reach their readers for one caller: each read is of
 * process.env at the moment of the call, not a value taken when the module
 * loaded. Every module here is imported before any flag is set; the flag then
 * arrives the way a call start puts it there (applyCallerFlags with a cohort),
 * and the next caller, in no cohort, gets the agent's own (off) again.
 * CALL_REPORT_REACHES_YOU is not cohort-capable yet: its result-capture reads
 * (unified-result-capture.ts) run outside the call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({
  search: vi.fn(),
  logTurn: vi.fn(),
  pending: vi.fn(async () => []),
}));
vi.mock('../../../memory/retrieval/hybrid-search.js', async (orig) => ({
  ...(await orig<object>()),
  hybridSearch: spies.search,
}));
vi.mock('../../../memory/retrieval/turn-memory-log.js', async (orig) => ({
  ...(await orig<object>()),
  logTurnMemory: spies.logTurn,
}));
vi.mock('../../background-agents/index.js', async (orig) => ({
  ...(await orig<object>()),
  getPendingResults: spies.pending,
}));
// The owner alone on their own line (callNewsFor loads this on first use).
vi.mock('../../../agents/multi-agent/live-call-behaviors.js', () => ({
  speakerIsAccountOwner: () => true,
}));

import { callNewsFor } from '../../../agents/multi-agent/call-news-opener.js';
import { retrieveForTurn } from '../../../memory/retrieval/turn-memory-retrieval.js';
import {
  gateTurnMemories,
  turnMemoryRerankOn,
} from '../../../memory/retrieval/turn-memory-rerank.js';
import { turnMemoryRrfScaleOn } from '../../../memory/retrieval/turn-memory-scale.js';
import type { HybridSearchResult } from '../../../memory/retrieval/hybrid-search.js';
import {
  applyCallerFlags,
  applyFlags,
  forgetAgentValues,
  type Cohort,
  type CohortStore,
} from '../cohort-flags.js';

const IN_COHORT = 'uid-cohort-fixture';
const NOT_IN_IT = 'uid-no-cohort-fixture';

/** A call starts for this caller; IN_COHORT's cohort sets these flags. */
async function callStartsFor(userId: string, flags: Record<string, string>): Promise<void> {
  const cohort: Cohort = { id: 'memory-first', enabled: true, flags };
  const store: CohortStore = {
    cohortsFor: async (u) => (u === IN_COHORT ? [cohort] : []),
    overridesFor: async () => ({}),
    sampledCohorts: async () => [],
  };
  await applyCallerFlags(userId, { store }); // process.env, as at a real call start
}

const metrics = () => ({ rerankMs: 0, rerankingApplied: false });
const searchOptions = () => spies.search.mock.calls.at(-1)?.[2] as Record<string, unknown>;
const logged = () => spies.logTurn.mock.calls.at(-1)?.[0] as Record<string, unknown>;
const turn = (userId: string) =>
  retrieveForTurn({ userId, sessionId: 's-read-time', transcript: 'how did the bake sale go', turnNumber: 2 }); // prettier-ignore

beforeEach(() => {
  vi.stubEnv('COHORT_FLAGS', 'on');
  vi.stubEnv('AGENT_MAX_JOBS_PER_WORKER', '');
  for (const flag of ['TURN_MEMORY_RRF_SCALE', 'TURN_MEMORY_RERANK', 'CALL_NEWS_OPENER'])
    vi.stubEnv(flag, '');
  spies.search.mockReset().mockResolvedValue({ results: [], metrics: {} });
  spies.logTurn.mockReset();
  spies.pending.mockClear();
});

afterEach(() => {
  applyFlags({}); // the agent's own values back
  forgetAgentValues();
  vi.unstubAllEnvs();
});

describe('TURN_MEMORY_RRF_SCALE and TURN_MEMORY_RERANK, set by a cohort after import', () => {
  it('the per-turn search runs the vector leg only, and its log says so (retrieval :302, :320)', async () => {
    await callStartsFor(IN_COHORT, { TURN_MEMORY_RRF_SCALE: 'on' });
    expect(turnMemoryRrfScaleOn()).toBe(true);
    await turn(IN_COHORT);
    expect(searchOptions()).toMatchObject({ skipBM25: true, minScore: 0 });
    expect(searchOptions()).not.toHaveProperty('withTimestamps');
    expect(logged()).toMatchObject({ rrfScale: true, rerank: false });

    await callStartsFor(NOT_IN_IT, {});
    expect(turnMemoryRrfScaleOn()).toBe(false);
    await turn(NOT_IN_IT);
    expect(searchOptions()).toMatchObject({ skipBM25: false, minScore: 0.3 });
    expect(logged()).toMatchObject({ rrfScale: false, rerank: false });
  });

  it('rerank asks for saved dates and logs rerank, only with the rescale on (:74, rerank :92)', async () => {
    await callStartsFor(IN_COHORT, { TURN_MEMORY_RERANK: 'on' });
    expect(turnMemoryRerankOn()).toBe(false); // needs TURN_MEMORY_RRF_SCALE too
    await callStartsFor(IN_COHORT, { TURN_MEMORY_RRF_SCALE: 'on', TURN_MEMORY_RERANK: 'on' });
    expect(turnMemoryRerankOn()).toBe(true);
    await turn(IN_COHORT);
    expect(searchOptions()).toMatchObject({ skipBM25: true, withTimestamps: true });
    expect(logged()).toMatchObject({ rrfScale: true, rerank: true });

    await callStartsFor(NOT_IN_IT, {});
    expect(turnMemoryRerankOn()).toBe(false);
    await turn(NOT_IN_IT);
    expect(searchOptions()).not.toHaveProperty('withTimestamps');
  });

  it('the gate asks the judge only while rerank is on for this caller (rerank :194)', async () => {
    vi.stubEnv('TURN_MEMORY_RERANK_TIMEOUT_MS', '200'); // agent-wide, inert with the flag off
    const judge = vi.fn(async () => '{"keep":[1],"old":[]}');
    const found = [
      { id: 'm1', text: 'the bake sale is Saturday', score: 0.01, legScores: { vector: 0.8 } },
    ] as unknown as HybridSearchResult[];
    const gate = () =>
      gateTurnMemories(found, { transcript: 'the bake sale' }, true, metrics(), undefined, judge);

    await callStartsFor(IN_COHORT, { TURN_MEMORY_RRF_SCALE: 'on', TURN_MEMORY_RERANK: 'on' });
    await gate();
    expect(judge).toHaveBeenCalledTimes(1);

    await callStartsFor(NOT_IN_IT, {});
    await gate();
    expect(judge).toHaveBeenCalledTimes(1);
  });
});

describe('CALL_NEWS_OPENER, set by a cohort after import', () => {
  it('the hello looks for call news only for the caller whose cohort set it (call-news-opener :121)', async () => {
    await callStartsFor(IN_COHORT, { CALL_NEWS_OPENER: 'on' });
    await callNewsFor({ userId: IN_COHORT, sessionId: 's-news-on' });
    expect(spies.pending).toHaveBeenCalledTimes(1);

    await callStartsFor(NOT_IN_IT, {});
    await callNewsFor({ userId: NOT_IN_IT, sessionId: 's-news-off' });
    expect(spies.pending).toHaveBeenCalledTimes(1);
  });
});
