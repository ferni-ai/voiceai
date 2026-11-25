/**
 * MEMORY_TIME_LABELS (#2530) on the per-turn memory block: when each memory
 * was said and where the times it names stand now. Driven through
 * buildMemoryRetrievalContext, the turn handler's entry; only the search
 * (retrieveForTurn) is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MemoryContext,
  RetrievedMemoryForTurn,
} from '../../../memory/retrieval/turn-memory-retrieval.js';
import { forgetCallerTimeZone, rememberCallerTimeZone } from '../../../utils/caller-time-zone.js';

const { retrieveForTurn } = vi.hoisted(() => ({ retrieveForTurn: vi.fn() }));
vi.mock('../../../memory/retrieval/turn-memory-retrieval.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../memory/retrieval/turn-memory-retrieval.js')>()),
  retrieveForTurn,
}));

const { formatMemoryContextForPrompt, formatProactiveMemory } =
  await import('../../../memory/retrieval/turn-memory-retrieval.js');
const { buildMemoryRetrievalContext } = await import('../memory-retrieval-builder.js');

const ZONE = 'America/New_York';
const SESSION = 'session-2530-test';
/** Wednesday 2026-11-18, 8 pm in New York: when the snack-mom line was saved. */
const SAVED_WED_EVENING = Date.parse('2026-11-19T01:00:00Z');
const SNACK_MOM = "I'm the snack mom at Saturday's tournament";

function memory(content: string, savedAt?: number, id = 'mem-1'): RetrievedMemoryForTurn {
  return {
    id,
    content,
    relevance: 0.8,
    type: 'memory',
    attribution: 'You shared with me that',
    source: 'vector',
    ...(savedAt !== undefined && { timestamp: new Date(savedAt) }),
  };
}

function context(memories: RetrievedMemoryForTurn[]): MemoryContext {
  return {
    memories,
    hasProactiveSuggestion: true,
    proactiveMemory: memories[0],
    metrics: {
      totalTimeMs: 1,
      hybridSearchMs: 1,
      rerankMs: 0,
      rawResultCount: memories.length,
      filteredResultCount: memories.length,
      dedupedResultCount: memories.length,
      rerankingApplied: false,
      cacheHit: false,
    },
  };
}

/** One turn through the builder at `now`; the memory block and the proactive hint. */
async function turn(ctx: MemoryContext, now: number, sessionId = SESSION) {
  vi.setSystemTime(now);
  retrieveForTurn.mockResolvedValueOnce(ctx);
  const result = await buildMemoryRetrievalContext({
    userText: 'so anyway, the tournament is going to be a lot',
    userData: { turnCount: 3 },
    services: { userId: 'user-2530-test', sessionId },
    surfacedMemoryIds: new Set<string>(),
  } as unknown as Parameters<typeof buildMemoryRetrievalContext>[0]);
  const block = result.injections.find((i) => i.source === 'memory_retrieval')?.content;
  const proactive = result.injections.find((i) => i.source === 'memory_proactive');
  return { block, hint: proactive?.content, hintConfidence: proactive?.confidence };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  rememberCallerTimeZone(ZONE, SESSION);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  forgetCallerTimeZone(SESSION);
  retrieveForTurn.mockReset();
});

describe('flag off', () => {
  it('leaves the memory block and proactive hint byte-identical to main', async () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'off');
    const ctx = context([memory(SNACK_MOM, SAVED_WED_EVENING)]);
    const { block, hint, hintConfidence } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toBe(formatMemoryContextForPrompt(ctx));
    expect(hint).toBe(formatProactiveMemory(ctx.proactiveMemory as RetrievedMemoryForTurn));
    expect(hintConfidence).toBe(0.8);
  });
});

describe('flag on', () => {
  beforeEach(() => vi.stubEnv('MEMORY_TIME_LABELS', 'on'));

  it('an upcoming event reaches the prompt marked coming up (Thursday night, tournament Saturday)', async () => {
    const ctx = context([memory(SNACK_MOM, SAVED_WED_EVENING)]);
    // Thursday 2026-11-19, 11 pm in New York.
    const { block, hint } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    const marked = `${SNACK_MOM} [coming up, not happened yet]`;
    expect(block).toContain(`• (likely) Said yesterday: "${marked}"`);
    expect(hint).toContain(`You might want to bring up: "${marked}"`);
    // No instruction is added: the note's header says notes carry no instructions.
    expect(block?.split('\n').at(-1)).toBe(formatMemoryContextForPrompt(ctx)?.split('\n').at(-1));
  });

  it('a line from two minutes ago, at night, is a few minutes ago', async () => {
    // Thursday 2026-11-19, 10:58 pm and 11 pm in New York.
    const ctx = context([
      memory('I want to start running again', Date.parse('2026-11-20T03:58:00Z')),
    ]);
    const { block } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toContain('• (likely) Said a few minutes ago: "I want to start running again"');
  });

  it('with no known zone, 6 pm to 8 pm Eastern is hours ago, not yesterday', async () => {
    const ctx = context([
      memory('I want to start running again', Date.parse('2026-11-19T23:00:00Z')),
    ]);
    const { block } = await turn(ctx, Date.parse('2026-11-20T01:00:00Z'), 'session-without-zone');
    expect(block).toContain('• (likely) Said about 2 hours ago: "');
  });

  it('leaves a memory with no saved time as it was', async () => {
    const ctx = context([memory(SNACK_MOM)]);
    const { block } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toBe(formatMemoryContextForPrompt(ctx));
  });
});
