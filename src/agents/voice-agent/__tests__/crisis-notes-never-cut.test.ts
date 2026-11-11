/**
 * #2618: the pushed turn-context note is cut to MAX_PUSHED_CONTEXT_CHARS, and
 * that cut must never reach crisis or safety guidance (safety-note.ts). Safety guidance goes last,
 * whole, and the crisis override last of all: nothing follows "Do NOT deviate". Drives the real handleUserTurn
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

const state = vi.hoisted(() => ({ scenario: undefined as unknown, phoneAsk: false }));

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
// The phone-number ask note, only where a test turns it on.
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getResponseModification: vi.fn(() =>
    state.phoneAsk
      ? {
          injectPhoneAsk: true,
          script: 'Could I text you to check in?',
          momentType: 'warm',
          tone: 'soft',
        }
      : { injectPhoneAsk: false }
  ),
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
const { pushedNotesText } = await import('../../multi-agent/pushed-notes.js');
const { addSafetyNote } = await import('../../processors/turn-processor/safety-note.js');

/** Runs one turn; returns the scratch notes the hook built and the note pushed to the agent. */
async function run(
  s: Scenario,
  userText = "I don't see the point of any of it anymore",
  userData: Record<string, unknown> = { turnCount: 3 }
) {
  state.scenario = s;
  let scratchNotes: string[] = [];
  const hook = async (scratch: llm.ChatContext, msg: llm.ChatMessage) => {
    await handleUserTurn({
      turnCtx: scratch,
      userText: msg.textContent ?? '',
      contextOnly: true,
      persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
      services: { sessionId: `session-2618-${s.name}`, userId: `member-2618-${s.name}` },
      userData,
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
  it('a crisis turn keeps crisis_response whole and last, and keeps the safety injection', async () => {
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
    // The safety guidance is the tail, whole: the other notes and injections all come before it.
    const tail = body.slice(Math.min(body.indexOf(guidance), body.indexOf(SAFETY.content)));
    expect(tail.length).toBe(guidance.length + SAFETY.content.length + 2);
    expect(body.indexOf(CORRELATIONS_HEADER)).toBeLessThan(body.length - tail.length);
    expect(tail).not.toContain('[IDENTITY]');
    // The remainder still gets what budget is left, so the note stays bounded.
    expect(body).toContain(CORRELATIONS_HEADER);
    expect(body.length).toBeLessThanOrEqual(MAX_PUSHED_CONTEXT_CHARS);
  });

  it('a soft-check turn keeps safety_soft_check whole and last', async () => {
    const softGuidance = `${SOFT_CRISIS_CHECK}\n4. ${'Stay gentle. '.repeat(40).trim()}`;
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
    expect(body.endsWith(softGuidance)).toBe(true);
    expect(body.indexOf(CORRELATIONS_HEADER)).toBeLessThan(body.indexOf(softGuidance));
  });

  it('a crisis override keeps the required response whole and last of all', async () => {
    const suggestedResponse = 'I am really glad you told me. Please call or text 988 right now.';
    const s: Scenario = {
      name: 'override',
      kept: [SAFETY],
      memories: [MEMORIES],
      crisis: { isCrisis: true, shouldOverrideLLM: true, suggestedResponse },
      correlations: CORRELATIONS,
    };
    const { body } = await run(s, 'I have the pills right here');
    expect(body.endsWith(`REQUIRED RESPONSE:\n${suggestedResponse}`)).toBe(true);
    expect(body.indexOf(SAFETY.content)).toBeLessThan(body.indexOf('[CRITICAL SAFETY OVERRIDE]'));
    expect(body.indexOf(CORRELATIONS_HEADER)).toBeLessThan(body.indexOf(SAFETY.content));
  });

  it.each([
    ['over budget', [CONTEXT], [MEMORIES]],
    ['under budget', [CONTEXT], ['[MEMORY] They are moving to Denver.']],
    ['essential categories, no safety guidance', [IDENTITY, CONTEXT], [MEMORIES]],
  ])(
    'a turn with no safety guidance is cut exactly as before (%s)',
    async (name, kept, memories) => {
      const s: Scenario = { name, kept, memories, intensity: 0.3, correlations: CORRELATIONS };
      const { scratchNotes, body } = await run(s, 'what should i do about the move?');
      expect(body).toBe(scratchNotes.join('\n\n').slice(0, MAX_PUSHED_CONTEXT_CHARS));
    }
  );

  it('a non-crisis turn carrying safety guidance keeps it whole and last', async () => {
    const s: Scenario = {
      name: 'escalation',
      kept: [CONTEXT, SAFETY],
      memories: [MEMORIES],
      intensity: 0.3,
      correlations: CORRELATIONS,
    };
    const { body } = await run(s, 'what should i do about the move?');
    expect(body.endsWith(SAFETY.content)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(MAX_PUSHED_CONTEXT_CHARS);
  });

  it('safety guidance still waiting is carried whole ahead of a later note (PREEMPT_STABLE_CONTEXT)', async () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    const guidance = buildCrisisGuidance(LONG_CRISIS as never);
    const warning = pad('[EARLY WARNING ACTIVE]', 600);
    let call = 0;
    const hook = async (scratch: llm.ChatContext) => {
      if (++call === 1) {
        // As in a real turn: the correlations note lands before the safety guidance.
        scratch.addMessage({ role: 'system', content: pad(CORRELATIONS_HEADER, 1065) });
        addSafetyNote(scratch, guidance);
        addSafetyNote(scratch, SAFETY.content);
        addSafetyNote(scratch, warning);
      } else {
        scratch.addMessage({ role: 'system', content: MEMORIES });
      }
    };
    let pushed = '';
    const agentCtx = llm.ChatContext.empty();
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
    const pusher = createTurnContextPusher(hook as never, agent as never);
    await pusher.onAgentState('thinking'); // not listening: turn 1's note waits
    await pusher.onFinalTranscript('I cannot do this anymore');
    await pusher.onFinalTranscript('anyway how was your day');
    await pusher.onAgentState('listening');
    vi.unstubAllEnvs();
    const body = pushed.slice(TURN_CONTEXT_HEADER.length + 1);
    // The three safety notes alone are over the cap: all kept whole, the later note dropped.
    expect(body).toBe([guidance, SAFETY.content, warning].join('\n\n'));
  });

  it('only the waiting safety text is carried, never the rest of the held note (PREEMPT_STABLE_CONTEXT)', async () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    const correlations = pad(CORRELATIONS_HEADER, 800);
    let call = 0;
    const hook = async (scratch: llm.ChatContext) => {
      if (++call === 1) {
        addSafetyNote(scratch, SAFETY.content);
        scratch.addMessage({ role: 'system', content: correlations });
      } else {
        scratch.addMessage({ role: 'system', content: MEMORIES });
      }
    };
    let pushed = '';
    const agentCtx = llm.ChatContext.empty();
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
    const pusher = createTurnContextPusher(hook as never, agent as never);
    await pusher.onAgentState('thinking'); // not listening: turn 1's note waits
    await pusher.onFinalTranscript('I cannot do this anymore');
    await pusher.onFinalTranscript('anyway how was your day');
    await pusher.onAgentState('listening');
    vi.unstubAllEnvs();
    const body = pushed.slice(TURN_CONTEXT_HEADER.length + 1);
    expect(body).not.toContain(CORRELATIONS_HEADER);
    // The later note gets all the budget the carried safety text leaves: 2000 - 600 - 2.
    const room = MAX_PUSHED_CONTEXT_CHARS - SAFETY.content.length - 2;
    expect(body).toBe(`${MEMORIES.slice(0, room)}\n\n${SAFETY.content}`);
  });

  it('safety notes over the cap are all kept whole and the rest is dropped', () => {
    const big = 'g'.repeat(MAX_PUSHED_CONTEXT_CHARS + 100);
    const notes = [
      { text: 'correlations' },
      { safety: true, text: big },
      { safety: true, text: 'safety' },
    ];
    expect(pushedNotesText(notes)).toBe(`${big}\n\nsafety`);
  });
});

describe('the crisis override has the final word', () => {
  const SHORT_SAFETY: Injection = { ...SAFETY, content: '[SAFETY] Stay with them.' };
  // Every note the turn can append after the override is written, on at once (turn-handler.ts).
  const LATE_NOTES = [
    'late_night_detected', // behavior events, 23:00-05:00 (behavior-event-dispatcher.ts)
    '[CONTEXT]', // injectTurnContext, the other injections
    '[INTERNAL CONTEXT - DO NOT SPEAK THIS]', // extensibility session prompt
    '[INTERNAL BRIEFING - DO NOT SPEAK THIS]', // pre-session briefing
    '[ALREADY_SPOKEN]', // greeting replay
    '[CRITICAL] You already spoke the greeting', // greeting guidance
    '[CALENDAR AWARENESS - DO NOT ANNOUNCE THIS]', // calendar awareness
    'ask for their phone number', // phone-number ask
  ];

  it('is the last block of the turn and of the pushed note at 00:30, every late note before it', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 10, 9, 0, 30, 0));
    state.phoneAsk = true;
    try {
      const suggestedResponse = 'I am really glad you told me. Please call or text 988 right now.';
      // Small notes, so the pushed note's cap cuts none of them and every one can be checked.
      const s: Scenario = {
        name: 'override-last',
        kept: [SHORT_SAFETY, { ...CONTEXT, content: '[CONTEXT] They called from work.' }],
        memories: [],
        crisis: { isCrisis: true, shouldOverrideLLM: true, suggestedResponse },
      };
      const { scratchNotes, body } = await run(s, 'I have the pills right here', {
        turnCount: 0,
        extensibilitySessionPrompt: 'Session prompt.',
        preSessionBriefing: 'Returning caller.',
        greetingText: 'Hey, good to hear you.',
        calendarAwareness: 'Dentist tomorrow at nine.',
      });
      const override = '[CRITICAL SAFETY OVERRIDE]';
      // The turn's context, as the real handleUserTurn leaves it: every late note was appended
      // after the override was written, so this turn is the case the pushed note must reorder.
      const overrideAt = scratchNotes.findIndex((text) => text.startsWith(override));
      expect(overrideAt).toBeGreaterThanOrEqual(0);
      for (const note of LATE_NOTES) {
        expect(
          scratchNotes.findIndex((text) => text.includes(note)),
          note
        ).toBeGreaterThan(overrideAt);
      }
      // The pushed note the next reply reads: nothing follows "Do NOT deviate".
      expect(body.endsWith(`REQUIRED RESPONSE:\n${suggestedResponse}`)).toBe(true);
      expect(body.length).toBeLessThan(MAX_PUSHED_CONTEXT_CHARS);
      for (const note of [...LATE_NOTES, SHORT_SAFETY.content]) {
        expect(body.indexOf(note), note).toBeGreaterThanOrEqual(0);
        expect(body.indexOf(note), note).toBeLessThan(body.indexOf(override));
      }
    } finally {
      state.phoneAsk = false;
      vi.useRealTimers();
    }
  });
});
