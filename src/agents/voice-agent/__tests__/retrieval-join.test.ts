/**
 * RETRIEVAL_FILTERED: retrieved memories reached the turn's injections after
 * processTurn's dedup and crisis/mode filter, so the crisis filter never saw
 * them. The handler is real; processTurn returns a crisis turn whose guidance
 * fills the filter's budget, and retrieval returns one memory. With the flag
 * on the filter leaves the memory out; with it off it is appended anyway.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Injection = { category: string; content: string; priority: number };

const state = vi.hoisted(() => ({
  result: undefined as { context: { injections: Injection[] } } | undefined,
  /** Characters of guidance padding: 700 fills the filter's budget, 0 leaves room. */
  pad: 700,
}));

const MEMORY = '[MEMORY] Last month they said the move to Denver was stressing them out.';
// The crisis turn's guidance as processTurn leaves it (deduplicated, filtered), long
// enough that with it the memory no longer fits the filter's 1,500 characters.
const SAFETY =
  '[SAFETY] Stay with them and ask directly whether they are thinking of ending their life.';
const GUIDANCE = '[EMOTIONAL GUIDANCE] Use plain words and their name; no advice yet.';

vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async () => {
    state.result = {
      analysis: { analysis: { emotion: 'sad', intent: 'unknown' } },
      context: {
        injections: [
          { category: 'safety', content: `${SAFETY} ${'x'.repeat(state.pad)}`, priority: 99 },
          { category: 'emotional_guidance', content: `${GUIDANCE} ${'y'.repeat(state.pad)}`, priority: 90 }, // prettier-ignore
        ],
        elapsedMs: 0,
      },
      emotional: { primary: 'sad', intensity: 0.9 },
      response: {},
      identity: {},
    } as never;
    return state.result;
  }),
}));
vi.mock('../../../intelligence/context-builders/memory-retrieval-builder.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  buildMemoryRetrievalContext: vi.fn(async () => ({
    injections: [{ category: 'memory', content: MEMORY }],
  })),
}));
vi.mock('../../integrations/unified-intelligence-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getUnifiedIntelligence: vi.fn(async () => null),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

async function crisisTurn(pad = 700): Promise<Injection[]> {
  state.result = undefined;
  state.pad = pad;
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText: "I don't see the point of any of it anymore",
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'session-retrieval-join', userId: 'member-retrieval-join' },
    userData: { turnCount: 3 },
  } as unknown as Ctx);
  const handled = state.result as { context: { injections: Injection[] } } | undefined;
  return handled?.context.injections ?? [];
}

afterEach(() => {
  delete process.env.RETRIEVAL_FILTERED;
});

describe('turn handler: retrieved memories and the crisis filter', () => {
  it('on: the crisis filter leaves out a retrieved memory it would exclude', async () => {
    process.env.RETRIEVAL_FILTERED = 'on';
    const injections = await crisisTurn();
    expect(injections.map((i) => i.category)).toContain('safety');
    expect(injections.map((i) => i.content)).not.toContain(MEMORY);
  });

  it('on: a retrieved memory the crisis filter keeps still reaches the turn', async () => {
    process.env.RETRIEVAL_FILTERED = 'on';
    const injections = await crisisTurn(0);
    expect(injections.map((i) => i.content)).toContain(MEMORY);
  });

  it('off: the memory is appended after the filter (as before)', async () => {
    const injections = await crisisTurn();
    expect(injections.map((i) => i.category)).toContain('safety');
    expect(injections.map((i) => i.content)).toContain(MEMORY);
  });
});
