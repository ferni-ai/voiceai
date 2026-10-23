/**
 * #2618: the pushed turn-context note is cut to MAX_PUSHED_CONTEXT_CHARS, and
 * that cut must never reach crisis guidance. Drives the real handleUserTurn
 * through the real createTurnContextPusher; only processTurn, memory retrieval
 * and unified intelligence are stubbed (as in the #2568 verify harness).
 */
import { llm } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { buildCrisisGuidance } from '../../../services/safety/crisis-guard.js';
import { SOFT_CRISIS_CHECK } from '../../../services/safety/crisis-agreement.js';

interface Injection {
  category: string;
  content: string;
  priority: number;
}
interface Scenario {
  name: string;
  kept: Injection[];
  memories: string[];
  intensity?: number;
  crisis?: Record<string, unknown>;
  correlations?: Array<{ insight: string; suggestion?: string; confidence: string }>;
}

const state = vi.hoisted(() => ({ scenario: undefined as unknown }));

vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async () => {
    const s = state.scenario as Scenario;
    return {
      analysis: { analysis: { emotion: 'sad', intent: 'unknown' } },
      context: { injections: s.kept.map((i) => ({ ...i })), elapsedMs: 0 },
      emotional: { primary: 'sad', intensity: s.intensity ?? 0.9 },
      response: {},
      identity: {},
      ...(s.crisis && { crisis: { severity: 0.5, indicators: [], ...s.crisis } }),
    };
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
  getUnifiedIntelligence: vi.fn(async () => {
    const correlations = (state.scenario as Scenario).correlations;
    return correlations ? { correlations } : null;
  }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
const { createTurnContextPusher } = await import('../../multi-agent/turn-intelligence.js');
const { MAX_PUSHED_CONTEXT_CHARS, TURN_CONTEXT_HEADER } =
  await import('../../multi-agent/turn-context-header.js');
const { pushedNotesText, safetyNoteId } = await import('../../multi-agent/safety-notes.js');

/** Runs one turn; returns the scratch notes the hook built and the note pushed to the agent. */
async function run(s: Scenario, userText = "I don't see the point of any of it anymore") {
  state.scenario = s;
  let scratchNotes: string[] = [];
  const hook = async (scratch: llm.ChatContext, msg: llm.ChatMessage) => {
    await handleUserTurn({
      turnCtx: scratch,
      userText: msg.textContent ?? '',
      contextOnly: true,
      persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
      services: { sessionId: `session-2618-${s.name}`, userId: `member-2618-${s.name}` },
      userData: { turnCount: 3 },
    } as never);
    scratchNotes = scratch.items
      .map((i) => (i as { textContent?: string }).textContent?.trim() ?? '')
      .filter(Boolean);
  };
  const agentCtx = llm.ChatContext.empty();
  agentCtx.addMessage({ role: 'user', content: userText });
  let pushed = '';
  const agent = {
    get chatCtx() {
      return agentCtx;
    },
    updateChatCtx: async (c: { items: Array<{ textContent?: string }> }) => {
      pushed =
        c.items.map((i) => i.textContent ?? '').find((t) => t.startsWith(TURN_CONTEXT_HEADER)) ??
        '';
    },
  };
  await createTurnContextPusher(hook as never, agent as never).onFinalTranscript(userText);
  return { scratchNotes, body: pushed.slice(TURN_CONTEXT_HEADER.length + 1) };
}

const pad = (tag: string, n: number) => `${tag} ${'x'.repeat(Math.max(0, n - tag.length - 1))}`;
const MEMORIES = `[RELEVANT MEMORIES]\n${'They talked about their sister, the move, the job and the dog. '.repeat(64)}`;
const SAFETY: Injection = {
  category: 'safety',
  priority: 99,
  content: pad(
    '[SAFETY] Stay with them and ask whether they are thinking of ending their life.',
    600
  ),
};
const IDENTITY: Injection = {
  category: 'identity',
  priority: 95,
  content: pad('[IDENTITY] You are Ferni.', 400),
};
const CONTEXT: Injection = { category: 'context', priority: 50, content: pad('[CONTEXT]', 300) };
const CORRELATIONS = [
  {
    insight: pad('When they sleep under six hours their mood drops.', 300),
    suggestion: pad('Ask about sleep.', 150),
    confidence: 'confirmed',
  },
  {
    insight: pad('Work deadlines precede their low weeks.', 300),
    suggestion: pad('Ask about work.', 150),
    confidence: 'likely',
  },
];
const CORRELATIONS_HEADER = '[CROSS-DOMAIN PATTERNS';
const LONG_CRISIS = {
  isCrisis: true,
  severity: 0.95,
  language: 'es',
  indicators: [
    'suicidal_ideation',
    'hopelessness',
    'plan_mentioned',
    'means_access',
    'isolation',
    'burden_language',
    'farewell_language',
    'joking_frame',
    'crisis_history',
    'self_harm',
    'substance_use',
    'recent_loss',
    'giving_away_possessions',
    'timeline_mentioned',
  ],
};

describe('crisis guidance survives the pushed-context cut (#2618)', () => {
  it('a crisis turn keeps crisis_response whole and first, and keeps the safety injection', async () => {
    const s: Scenario = {
      name: 'crisis',
      kept: [SAFETY, IDENTITY, CONTEXT],
      memories: [MEMORIES],
      crisis: LONG_CRISIS,
      correlations: CORRELATIONS,
    };
    const { scratchNotes, body } = await run(s);
    // Precondition: main's raw cut would have had to drop something.
    expect(scratchNotes.join('\n\n').length).toBeGreaterThan(MAX_PUSHED_CONTEXT_CHARS);

    const guidance = buildCrisisGuidance(LONG_CRISIS as never);
    expect(body).toContain(guidance);
    expect(body).toContain(SAFETY.content);
    expect(body.startsWith(guidance)).toBe(true);
    expect(body.indexOf(SAFETY.content)).toBeLessThan(body.indexOf(CORRELATIONS_HEADER));
    // The remainder still gets what budget is left, so the note stays bounded.
    expect(body).toContain(CORRELATIONS_HEADER);
    expect(body.length).toBeLessThanOrEqual(MAX_PUSHED_CONTEXT_CHARS);
  });

  it('a soft-check turn keeps safety_soft_check whole and first', async () => {
    const softGuidance = `${SOFT_CRISIS_CHECK}\n4. ${'Stay gentle. '.repeat(40)}`;
    const s: Scenario = {
      name: 'soft',
      intensity: 0.1,
      kept: [IDENTITY, CONTEXT],
      memories: [MEMORIES],
      crisis: { isCrisis: false, softCheck: true, severity: 0.25, softGuidance },
      correlations: CORRELATIONS,
    };
    const { body } = await run(s, 'meh whatever');
    expect(body).toContain(softGuidance);
    expect(body.startsWith(softGuidance)).toBe(true);
    expect(body.indexOf(softGuidance)).toBeLessThan(body.indexOf(CORRELATIONS_HEADER));
  });

  it('a crisis override keeps the required response whole and first', async () => {
    const suggestedResponse = 'I am really glad you told me. Please call or text 988 right now.';
    const s: Scenario = {
      name: 'override',
      kept: [SAFETY],
      memories: [MEMORIES],
      crisis: { isCrisis: true, shouldOverrideLLM: true, suggestedResponse },
      correlations: CORRELATIONS,
    };
    const { body } = await run(s, 'I have the pills right here');
    expect(body.startsWith('[CRITICAL SAFETY OVERRIDE]')).toBe(true);
    expect(body).toContain(`REQUIRED RESPONSE:\n${suggestedResponse}`);
    expect(body).toContain(SAFETY.content);
  });

  it.each([
    ['over budget', [CONTEXT], [MEMORIES]],
    ['under budget', [CONTEXT], ['[MEMORY] They are moving to Denver.']],
    ['protected categories, no crisis', [SAFETY, IDENTITY], [MEMORIES]],
  ])('a non-crisis turn is cut exactly as before (%s)', async (name, kept, memories) => {
    const s: Scenario = { name, kept, memories, intensity: 0.3, correlations: CORRELATIONS };
    const { scratchNotes, body } = await run(s, 'what should i do about the move?');
    expect(body).toBe(scratchNotes.join('\n\n').slice(0, MAX_PUSHED_CONTEXT_CHARS));
  });

  it('safety notes over the cap are all kept whole and the rest is dropped', () => {
    const big = 'g'.repeat(MAX_PUSHED_CONTEXT_CHARS + 100);
    const notes = [
      { id: 'ctx', text: 'correlations' },
      { id: safetyNoteId(), text: big },
      { id: safetyNoteId(), text: 'safety' },
    ];
    expect(pushedNotesText(notes)).toBe(`${big}\n\nsafety`);
  });
});
