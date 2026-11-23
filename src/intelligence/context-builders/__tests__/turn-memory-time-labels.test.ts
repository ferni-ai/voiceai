/**
 * TURN_MEMORY_TIME_LABELS (#2530): per-turn memories reach the prompt with
 * when they were said and whether the event they name is still ahead, under
 * way or over. Driven through buildMemoryRetrievalContext, the turn handler's
 * entry; only the search (retrieveForTurn) is stubbed.
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
const { turnMemoryPrompts } = await import('../memory/turn-memory-time-labels.js');

const ZONE = 'America/New_York';
const SESSION = 'session-2530-test';
/** Wednesday 2026-11-18, 8 pm in New York: when the snack-mom line was saved. */
const SAVED_WED_EVENING = Date.parse('2026-11-19T01:00:00Z');
const SNACK_MOM = "I'm the snack mom at Saturday's tournament";
/** The example line that follows a block in which a memory names a time. */
const EXAMPLE_START = 'Go by these time labels.';

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
async function turn(ctx: MemoryContext, now: number) {
  vi.setSystemTime(now);
  retrieveForTurn.mockResolvedValueOnce(ctx);
  const result = await buildMemoryRetrievalContext({
    userText: 'so anyway, the tournament is going to be a lot',
    userData: { turnCount: 3 },
    services: { userId: 'user-2530-test', sessionId: SESSION },
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
    vi.stubEnv('TURN_MEMORY_TIME_LABELS', 'off');
    const ctx = context([memory(SNACK_MOM, SAVED_WED_EVENING)]);
    const { block, hint, hintConfidence } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toBe(formatMemoryContextForPrompt(ctx));
    expect(hint).toBe(formatProactiveMemory(ctx.proactiveMemory as RetrievedMemoryForTurn));
    expect(hintConfidence).toBe(0.8);
    expect(block).toContain('You shared with me that: "');
  });
});

describe('flag on: the event state reaches the prompt', () => {
  beforeEach(() => vi.stubEnv('TURN_MEMORY_TIME_LABELS', 'on'));

  it('marks an upcoming event as still ahead (Thursday night, tournament Saturday)', async () => {
    const ctx = context([memory(SNACK_MOM, SAVED_WED_EVENING)]);
    // Thursday 2026-11-19, 11 pm in New York.
    const { block, hint } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toContain(
      `• (likely) Said yesterday (still ahead, not happened yet): "${SNACK_MOM}"`
    );
    expect(block?.split('\n').at(-1)?.startsWith(EXAMPLE_START)).toBe(true);
    expect(hint).toContain('Said yesterday (still ahead, not happened yet) this might be relevant');
  });

  it('marks it under way on the Saturday itself', async () => {
    const ctx = context([memory(SNACK_MOM, SAVED_WED_EVENING)]);
    // Saturday 2026-11-21, 10 am in New York.
    const { block } = await turn(ctx, Date.parse('2026-11-21T15:00:00Z'));
    expect(block).toContain(`• (likely) Said 3 days ago (going on now): "${SNACK_MOM}"`);
  });

  it('marks it over once the Saturday has gone', async () => {
    const ctx = context([memory(SNACK_MOM, SAVED_WED_EVENING)]);
    // Monday 2026-11-23, noon in New York.
    const { block } = await turn(ctx, Date.parse('2026-11-23T17:00:00Z'));
    expect(block).toContain(`• (likely) Said 5 days ago (already over): "${SNACK_MOM}"`);
  });

  it('labels a line from two minutes ago, at night, as a few minutes ago', async () => {
    // Thursday 2026-11-19, 10:58 pm and 11 pm in New York.
    const ctx = context([
      memory('I want to start running again', Date.parse('2026-11-20T03:58:00Z')),
    ]);
    const { block } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toContain('• (likely) Said a few minutes ago: "I want to start running again"');
    // Names no time, so no state and no example line.
    expect(block).not.toContain(EXAMPLE_START);
  });

  it('leaves a memory with no saved time as it was', async () => {
    const ctx = context([memory(SNACK_MOM)]);
    const { block } = await turn(ctx, Date.parse('2026-11-20T04:00:00Z'));
    expect(block).toBe(formatMemoryContextForPrompt(ctx));
  });
});

/** The label a memory saved at `savedAt` gets at `now`, straight from turnMemoryPrompts. */
function labelOf(content: string, savedAt: number, now: number): string | undefined {
  const { memory: block } = turnMemoryPrompts(
    context([memory(content, savedAt)]),
    { sessionId: SESSION },
    now,
    {
      TURN_MEMORY_TIME_LABELS: 'on',
    }
  );
  return /• \(likely\) (.*): "/.exec(block ?? '')?.[1];
}

describe('when said', () => {
  const now = Date.parse('2026-11-20T04:00:00Z'); // Thursday 11 pm in New York
  const plain = 'I want to start running again';

  it('reads minutes, then calendar days on the caller clock', () => {
    expect(labelOf(plain, now - 2 * 60_000, now)).toBe('Said a few minutes ago');
    expect(labelOf(plain, now - 40 * 60_000, now)).toBe('Said within the last hour');
    expect(labelOf(plain, now - 5 * 3_600_000, now)).toBe('Said earlier today');
    // 9 am Thursday, after 9 pm Wednesday: the same UTC day, yesterday for the caller.
    const nineAm = Date.parse('2026-11-19T14:00:00Z');
    expect(labelOf(plain, Date.parse('2026-11-19T02:00:00Z'), nineAm)).toBe('Said yesterday');
  });
});

describe('event state', () => {
  const thursday = Date.parse('2026-11-20T04:00:00Z');

  it('calls a line with a time gone and a time ahead still ahead', () => {
    const line = 'the first round was last Saturday, the final is next Saturday';
    expect(labelOf(line, SAVED_WED_EVENING, thursday)).toBe(
      'Said yesterday (still ahead, not happened yet)'
    );
  });
});
