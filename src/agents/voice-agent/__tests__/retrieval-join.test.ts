/**
 * RETRIEVAL_FILTERED: retrieved memories reached the turn's injections after
 * processTurn's dedup and crisis/mode filter, so the filter never weighed
 * them. The handler is real; processTurn returns the turn's kept injections
 * (and its crisis read), retrieval returns memories. With the flag on, the
 * kept list stays exactly as processTurn left it and memories enter only the
 * budget it leaves, in the turn's mode; with it off they are appended anyway.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { retrievalFilteredEnabled, retrievalMode } from '../retrieval-join.js';
import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';

type Injection = { category: string; content: string; priority: number };
interface Scenario {
  userText: string;
  kept: Injection[];
  memories: string[];
  intensity?: number;
  crisis?: { isCrisis: boolean; softCheck?: boolean };
}

const state = vi.hoisted(() => ({
  scenario: undefined as unknown,
  result: undefined as { context: { injections: Injection[] } } | undefined,
}));

vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async () => {
    const s = state.scenario as Scenario;
    state.result = {
      analysis: { analysis: { emotion: 'sad', intent: 'unknown' } },
      context: { injections: s.kept.map((i) => ({ ...i })), elapsedMs: 0 },
      emotional: { primary: 'sad', intensity: s.intensity ?? 0.9 },
      response: {},
      identity: {},
      ...(s.crisis && { crisis: { severity: 0.5, indicators: [], ...s.crisis } }),
    } as never;
    return state.result;
  }),
}));
vi.mock('../../../intelligence/context-builders/memory-retrieval-builder.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  buildMemoryRetrievalContext: vi.fn(async () => ({
    injections: (state.scenario as Scenario).memories.map((content) => ({
      category: 'memory',
      content,
    })),
  })),
}));
vi.mock('../../integrations/unified-intelligence-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getUnifiedIntelligence: vi.fn(async () => null),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

const MEMORY = '[MEMORY] Last month they said the move to Denver was stressing them out.';
const PROACTIVE = '[PROACTIVE MEMORY OPPORTUNITY]\nYou might want to bring up: "the Denver move"';
const SAFETY = (pad: number) => ({
  category: 'safety',
  priority: 99,
  content: `[SAFETY] Stay with them and ask directly whether they are thinking of ending their life. ${'x'.repeat(pad)}`,
});
const GUIDANCE = (pad: number) => ({
  category: 'emotional_guidance',
  priority: 90,
  content: `[EMOTIONAL GUIDANCE] Use plain words and their name; no advice yet. ${'y'.repeat(pad)}`,
});
const CRISIS_TEXT = "I don't see the point of any of it anymore";

async function turn(s: Scenario): Promise<Injection[]> {
  state.scenario = s;
  state.result = undefined;
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText: s.userText,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'session-retrieval-join', userId: 'member-retrieval-join' },
    userData: { turnCount: 3 },
  } as unknown as Ctx);
  const handled = state.result as { context: { injections: Injection[] } } | undefined;
  return handled?.context.injections ?? [];
}

const contents = (list: Injection[]) => list.map((i) => i.content);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('turn handler: retrieved memories and the crisis filter', () => {
  it('on: a crisis turn whose guidance fills the budget leaves the memory out', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const out = await turn({
      userText: CRISIS_TEXT,
      kept: [SAFETY(700), GUIDANCE(700)],
      memories: [MEMORY],
    });
    expect(contents(out)).not.toContain(MEMORY);
    expect(out.slice(0, 2).map((i) => i.category)).toEqual(['safety', 'emotional_guidance']);
  });

  it('on: with room left, the memory reaches the turn', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const out = await turn({ userText: CRISIS_TEXT, kept: [SAFETY(0)], memories: [MEMORY] });
    expect(contents(out)).toContain(MEMORY);
  });

  it('off: the memory is appended after the filter (as before)', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'off');
    const out = await turn({
      userText: CRISIS_TEXT,
      kept: [SAFETY(700), GUIDANCE(700)],
      memories: [MEMORY],
    });
    expect(contents(out)).toContain(MEMORY);
  });
});

describe('the count budget', () => {
  it('on: six short kept injections leave no slot for a memory', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const kept = Array.from({ length: 6 }, (_, i) => ({
      category: `context_${i}`,
      priority: 50,
      content: `[CONTEXT ${i}] short`,
    }));
    const out = await turn({
      userText: 'what should i do about the move?',
      intensity: 0.3,
      kept,
      memories: [MEMORY],
    });
    expect(contents(out)).not.toContain(MEMORY);
  });
});

describe('the kept list is never re-filtered or deduplicated against memories', () => {
  it('keeps tool_hint, resonance_check and unsaid; admits the proactive hint and a memory', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const kept: Injection[] = [
      { category: 'tool_hint', priority: 20, content: '[TOOL HINT] They may want the timer.' },
      { category: 'resonance_check', priority: 15, content: '[RESONANCE] Check it landed.' },
      {
        category: 'unsaid',
        priority: 75,
        content:
          '[UNSAID SIGNAL: DEFLECTION]\nWhat I noticed: "changed subject"\nUnderlying: avoiding',
      },
    ];
    // Same category, and the unsaid signal shares words: the old dedup collapsed these.
    const memory = '[MEMORY] They told you: "she changed the subject, avoiding the breakup"';
    const out = await turn({
      userText: 'it was fine, i guess. why does it even matter?',
      intensity: 0.3,
      kept,
      memories: [memory, PROACTIVE],
    });
    expect(out.slice(0, 3)).toEqual(kept); // untouched, in order
    expect(contents(out)).toEqual(expect.arrayContaining([memory, PROACTIVE]));
  });
});

describe('the crisis read decides the budget', () => {
  // Casual words, low intensity: fast mode gives 600 characters; crisis mode 1,500.
  const kept = [{ category: 'context', priority: 50, content: `[CONTEXT] ${'z'.repeat(560)}` }];

  it('a classifier-only crisis (no safety injection kept) gets the crisis budget', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const out = await turn({
      userText: 'ok',
      intensity: 0.1,
      kept,
      memories: [MEMORY],
      crisis: { isCrisis: true },
    });
    expect(contents(out)).toContain(MEMORY);
  });

  it('a soft check alone keeps the casual budget processTurn filtered the turn at', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const out = await turn({
      userText: 'ok',
      intensity: 0.1,
      kept,
      memories: [MEMORY],
      crisis: { isCrisis: false, softCheck: true },
    });
    expect(contents(out)).not.toContain(MEMORY);
  });

  it('no crisis: the casual budget leaves the memory out', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const out = await turn({ userText: 'ok', intensity: 0.1, kept, memories: [MEMORY] });
    expect(contents(out)).not.toContain(MEMORY);
  });
});

describe('retrievalMode: crisis versus emotional', () => {
  const words = { userText: 'I feel so worried about all of it', emotionalIntensity: 0.7 };

  it('emotional words without a crisis read are emotional mode', () => {
    expect(retrievalMode([], words)).toEqual({ mode: 'emotional', crisisDetected: false });
  });

  it('the same words with a crisis read, or a kept crisis injection, are crisis mode', () => {
    expect(retrievalMode([], words, { isCrisis: true }).mode).toBe('crisis');
    expect(retrievalMode([], words, { isCrisis: false, softCheck: true }).mode).toBe('emotional');
    expect(retrievalMode([SAFETY(0)], words).mode).toBe('crisis');
  });
});

describe('on a crisis turn the crisis guidance comes first', () => {
  it('safety and crisis_response stay ahead of an admitted memory', async () => {
    vi.stubEnv('RETRIEVAL_FILTERED', 'on');
    const crisisResponse = {
      category: 'crisis_response',
      priority: 98,
      content: '[CRISIS SUPPORT] Validate first. Resource if appropriate: 988.',
    };
    const out = await turn({
      userText: CRISIS_TEXT,
      kept: [SAFETY(0), crisisResponse],
      memories: [MEMORY],
      crisis: { isCrisis: true },
    });
    const at = (c: string) => out.findIndex((i) => i.category === c || i.content === c);
    expect(at(MEMORY)).toBeGreaterThan(-1);
    expect(at('safety')).toBeLessThan(at(MEMORY));
    expect(at('crisis_response')).toBeLessThan(at(MEMORY));
  });
});

describe('RETRIEVAL_FILTERED ships off', () => {
  it('defaults to off in the manifest, and unset means off', () => {
    expect(FLAG_MANIFEST.RETRIEVAL_FILTERED.default).toBe('off');
    expect(retrievalFilteredEnabled({})).toBe(false);
    expect(retrievalFilteredEnabled({ RETRIEVAL_FILTERED: 'on' })).toBe(true);
  });
});
