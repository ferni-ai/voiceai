/**
 * CRISIS_TURN_NO_ACK, through the real voice turn handler (turn-handler.ts).
 *
 * The naturalness engine can hand the turn a spoken acknowledgment: a remark about the caller's
 * surroundings on the first turn, or a rapport repair cue. The handler said it through the speech
 * coordinator on every turn that had one, a turn the crisis read replaced, guided or gave a soft
 * check-in included (#4451). With the flag on, a crisis turn (the turn's own verdict,
 * crisisReadTurn: the same one that holds its memory) says none; an ordinary turn says it as
 * before, and nothing else of the naturalness step changes.
 *
 * processTurn hands back a canned result whose crisis field each row sets; the naturalness engine
 * hands back an acknowledgment and one context injection; the coordinator's coordinatedSay and the
 * stores are spies. All lines fictional.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Crisis = { isCrisis: boolean; shouldOverrideLLM: boolean; softCheck?: boolean } | undefined;

const state = vi.hoisted(() => ({
  crisis: undefined as unknown,
  result: undefined as unknown,
  said: [] as Array<{ line: string; options: unknown }>,
}));

const ACK = 'Sounds like it is a bit noisy where you are, that is fine.';

vi.mock('../../../speech/coordination/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  coordinatedSay: vi.fn((_sessionId: string, line: string, options: unknown) => {
    state.said.push({ line, options });
  }),
}));
vi.mock('../../../speech/naturalness/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTurn: vi.fn(() => ({
    ttsAdjustments: {
      speedMultiplier: 1,
      volumeBoost: 0,
      clarityMode: false,
      extraPauseMs: 0,
      warmthLevel: 'neutral',
      reasons: [],
    },
    contextInjections: [
      { shouldInject: true, context: 'Speak a little slower.', priority: 1, source: 'ambient' },
    ],
    acknowledgment: {
      phrase: ACK,
      source: 'ambient',
      shouldPause: true,
      pauseDurationMs: 500,
    },
    rapportLevel: 'good',
    activeSystems: [],
  })),
}));
vi.mock('../../processors/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTurn: vi.fn(async () => {
    const emotion = { primary: 'sad', intensity: 0.5 };
    const result = {
      analysis: { analysis: { emotion, intent: 'unknown' } },
      context: { injections: [], elapsedMs: 0 },
      emotional: { ...emotion, distressLevel: 0.2 },
      response: {},
      identity: {},
      crisis: state.crisis,
    };
    state.result = result;
    return result;
  }),
}));

// The stores the handler writes after a turn: none is under test, none may reach a database.
vi.mock('../../../memory/dynamic/index.js', async (orig) => {
  const { noCapture } = await import('../../../memory/third-party-call.js');
  return {
    ...(await orig<Record<string, unknown>>()),
    fastCapture: vi.fn(async () => noCapture()),
  };
});
vi.mock('../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGeminiClient: async () => {
    throw new Error('no real model client in this test');
  },
}));
vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: { autoRecord: async () => {}, recordImplicitPreference: async () => {} },
}));
vi.mock('../../../services/superhuman/semantic-intelligence/integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processSemanticIntelligence: vi.fn(async () => {}),
}));
vi.mock('../../../personality/bridge/personality-bridge.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordUnifiedMoment: vi.fn(async () => ({ success: true })),
}));
vi.mock('../../../services/superhuman/relational-memory/engine.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRelationalMemory: () => ({ addMilestone: vi.fn(async () => {}) }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

const LEVELS: Array<[string, Crisis]> = [
  ['the patterns replace the reply', { isCrisis: true, shouldOverrideLLM: true }],
  ['the reply is guided', { isCrisis: true, shouldOverrideLLM: false }],
  ['a soft check-in', { isCrisis: false, shouldOverrideLLM: false, softCheck: true }],
  ['no crisis read at all (fail closed)', undefined],
];
const ORDINARY: Crisis = { isCrisis: false, shouldOverrideLLM: false };

/** One turn through the real handler: what coordinatedSay was asked to say, and the turn result. */
async function turn(crisis: Crisis) {
  state.said.length = 0;
  state.crisis = crisis && {
    ...crisis,
    severity: 'high',
    indicators: [],
    suggestedResponse: crisis.shouldOverrideLLM ? 'I am here with you.' : undefined,
  };
  const session = { say: vi.fn() };
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText: 'the quiet in this apartment is getting to me tonight',
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'crisis-no-ack', userId: 'user-crisis-no-ack' },
    userData: { turnCount: 1 },
    currentSession: session,
    sendDataMessage: async () => {},
  } as unknown as Ctx);
  const injections = (state.result as { context: { injections: Array<{ category: string }> } })
    .context.injections;
  return {
    acks: state.said.filter((s) => s.line === ACK),
    naturalness: injections.filter((i) => i.category === 'naturalness'),
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('CRISIS_TURN_NO_ACK: the naturalness acknowledgment on a crisis turn', () => {
  it('on: no crisis level says it, and the rest of the naturalness step still runs', async () => {
    vi.stubEnv('CRISIS_TURN_NO_ACK', 'on');

    for (const [name, crisis] of LEVELS) {
      // Turns share the handler's state, so they run one after another.
      // eslint-disable-next-line no-await-in-loop
      const { acks, naturalness } = await turn(crisis);

      expect(acks, name).toEqual([]);
      expect(naturalness, name).toHaveLength(1);
    }
  });

  it('off: every crisis level says it, as on main', async () => {
    for (const [name, crisis] of LEVELS) {
      // eslint-disable-next-line no-await-in-loop
      const { acks } = await turn(crisis);

      expect(acks, name).toEqual([{ line: ACK, options: { allowInterruptions: true } }]);
    }
  });

  it('on: an ordinary turn says it, unchanged', async () => {
    vi.stubEnv('CRISIS_TURN_NO_ACK', 'on');

    const { acks, naturalness } = await turn(ORDINARY);

    expect(acks).toEqual([{ line: ACK, options: { allowInterruptions: true } }]);
    expect(naturalness).toHaveLength(1);
  });

  it('off: an ordinary turn says it', async () => {
    const { acks } = await turn(ORDINARY);

    expect(acks).toHaveLength(1);
  });
});
