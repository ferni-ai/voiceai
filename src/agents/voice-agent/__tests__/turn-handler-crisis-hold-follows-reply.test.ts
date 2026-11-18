/**
 * CRISIS_HOLD_FOLLOWS_REPLY through the real voice turn handler (turn-handler.ts) and the real
 * reply gate (personas/crisis-gate.ts startCrisisGate).
 *
 * The reply follows the more severe of the two engines, but on main the handler's memory writers
 * key on the turn pipeline's read alone (crisis-turn-memory.ts crisisReadTurn). Here the pipeline
 * reads patterns only, so it calls the line ordinary, while the gate's classifier reads it as a
 * crisis and guides the reply: a gate-only crisis, as on a turn whose classifier read the pipeline
 * did not wait for. Flag off, the handler records the turn as on main. Flag on, every writer that
 * consults the hold (bond message, learning, unified moments, trust milestone, semantic
 * intelligence, fast capture) waits for the call's reads and holds.
 *
 * Only the stores are stubbed; every classifier read goes through an injected model call, and
 * the real model client refuses. All lines fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { CRISIS_READ_WAIT } from '../../../utils/crisis-memory-hold.js';
import {
  getFireAndForgetMetrics,
  resetFireAndForgetMetrics,
} from '../../../utils/safe-fire-and-forget.js';
import { startCrisisGate } from '../../personas/crisis-gate.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';

const state = vi.hoisted(() => ({
  pipelineEnv: {} as Record<string, string>,
  sessionId: '',
  writes: [] as string[],
  semanticReads: [] as unknown[],
  captures: 0,
  realClient: 0,
  level: '',
}));

vi.mock('../../../memory/dynamic/index.js', async (orig) => {
  const { noCapture } = await import('../../../memory/third-party-call.js');
  return {
    ...(await orig<Record<string, unknown>>()),
    fastCapture: vi.fn(async () => {
      state.captures++;
      return noCapture();
    }),
  };
});
vi.mock('../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGeminiClient: async () => {
    state.realClient++;
    throw new Error('no real model client in this test');
  },
}));
vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: async () => void state.writes.push('correction'),
    recordImplicitPreference: async () => void state.writes.push('preference'),
  },
}));
vi.mock('../../../services/superhuman/semantic-intelligence/integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processSemanticIntelligence: vi.fn(async (data: { crisisTurn?: unknown }) => {
    state.semanticReads.push(data.crisisTurn);
  }),
}));
vi.mock('../../../personality/bridge/personality-bridge.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordUnifiedMoment: vi.fn(async (moment: { type: string }) => {
    state.writes.push(`moment:${moment.type}`);
    return { success: true, vulnerabilityDetected: false, isFirstTimeVulnerability: false };
  }),
}));
vi.mock(
  '../../../intelligence/context-builders/relationship/deep-relationship.js',
  async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    recordSharedMoment: vi.fn(async () => void state.writes.push('shared-moment')),
  })
);
vi.mock('../../../services/superhuman/relational-memory/engine.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRelationalMemory: () => ({
    addMilestone: vi.fn(async (_user: string, m: { type: string }) => {
      state.writes.push(`milestone:${m.type}`);
    }),
  }),
}));
vi.mock('../../processors/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTurn: vi.fn(async (ctx: { userText: string }) => {
    // The turn pipeline's read, on the handler's own call (turn-crisis.ts)
    const crisis = await startTurnCrisis(
      ctx.userText,
      { turnCount: 6 },
      { sessionId: state.sessionId, env: state.pipelineEnv }
    ).summary();
    state.level = crisis.shouldOverrideLLM ? 'replace' : crisis.isCrisis ? 'guide' : 'pass';
    const emotion = { primary: 'sad', intensity: 0.9 };
    return {
      analysis: { analysis: { emotion, intent: 'unknown' } },
      context: { injections: [], elapsedMs: 0 },
      emotional: { ...emotion, distressLevel: 0.2 },
      response: {},
      identity: {},
      crisis,
    };
  }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

/** The pipeline reads patterns only; the gate reads with the live classifier. */
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const GATE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const NO_RISK = '{"risk":"none","subject":"self"}';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const FAILS = 'fails';
const NEVER = 'never';

/** A laugh, thanks, a correction and a preference the patterns do not flag: every writer fires. */
const LINE =
  "lol thank you for listening, actually it's the blue mug, i always drink my tea in the " +
  'morning, honestly nothing feels worth it lately';
/** A line the patterns guide: a crisis the pipeline reads itself. */
const PATTERN_CRISIS = 'haha im standing on the bridge and im going to jump';

const WRITERS = [
  'unified-personality-recording',
  'bth-v4-relational-memory',
  'semantic-intelligence',
  'dynamic-memory-capture',
];

let n = 0;
const WAIT = { ...CRISIS_READ_WAIT };

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetFireAndForgetMetrics();
  Object.assign(CRISIS_READ_WAIT, { startMs: 500, settleMs: 500 });
  Object.assign(state, { writes: [], semanticReads: [], captures: 0, realClient: 0, level: '' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  Object.assign(CRISIS_READ_WAIT, WAIT);
});

/**
 * One turn: the reply gate starts its read of the line (its model call answers `gateRead` once
 * released), the handler runs it with the pipeline's read, then the gate's read is released.
 * `gateStarts: 'late'`: the gate reads the line only after the handler's writers have asked.
 * Returns the pipeline's level, the gate's final action and every write the handler made.
 */
async function turn(
  line: string,
  gateRead: string | null,
  flag: 'on' | 'off',
  gateStarts: 'first' | 'late' = 'first'
) {
  vi.stubEnv('CRISIS_HOLD_FOLLOWS_REPLY', flag);
  const sessionId = `hold-follows-reply-${++n}`;
  Object.assign(state, { sessionId, pipelineEnv: PATTERNS_ONLY });
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: line });
  const startGate = (): ReturnType<typeof startCrisisGate> =>
    gateRead === null
      ? null
      : startCrisisGate(
          chat,
          { services: { sessionId } },
          {
            env: { ...GATE, CRISIS_HOLD_FOLLOWS_REPLY: flag },
            generate: async () => {
              await released;
              if (gateRead === NEVER) {
                return new Promise<string>(() => {
                  // past the wait, as a classifier that never answers
                });
              }
              if (gateRead === FAILS) throw new Error('classifier unavailable');
              return gateRead;
            },
          }
        );
  let gate = gateStarts === 'first' ? startGate() : null;
  const messages: Array<{ type: string; data?: Record<string, unknown> }> = [];
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText: line,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId, userId: 'user-riley-test' },
    userData: { turnCount: 6 },
    sendDataMessage: async (type: string, data?: Record<string, unknown>) =>
      void messages.push({ type, data }),
  } as unknown as Ctx);
  if (gateStarts === 'late') {
    await new Promise((resolve) => {
      setTimeout(resolve, 150); // past the writers' first check of the turn's reads
    });
    gate = startGate();
  }
  release();
  const escalated = await gate?.escalation;
  const contexts = flag === 'on' ? [...WRITERS, 'learning-trust-recording'] : WRITERS;
  await vi.waitFor(
    () => {
      for (const context of contexts) {
        const m = getFireAndForgetMetrics().byContext.find((c) => c.context === context);
        expect(m && m.successes + m.failures, context).toBe(1);
      }
    },
    { timeout: 5000 }
  );
  const bond = messages.filter(
    (m) => m.type === 'humanization_signal' && m.data?.signalType === 'emotional_bond_deepen'
  ).length;
  return {
    pipeline: state.level,
    gate: escalated?.action ?? gate?.decision.action ?? 'none',
    writes: [...state.writes].sort(),
    bond,
    captures: state.captures,
    semantic: state.semanticReads,
    realClient: state.realClient,
  };
}

describe('a gate-only crisis: the pipeline reads the turn as ordinary, the gate guides the reply', () => {
  it('flag off: the handler records the turn as on main (the B3 gap)', async () => {
    const t = await turn(LINE, CRISIS, 'off');
    expect(t.realClient).toBe(0);
    expect(t.pipeline).toBe('pass');
    expect(t.gate).toBe('guide');
    expect(t.writes).toEqual(
      expect.arrayContaining(['moment:laughter', 'milestone:expressed-gratitude', 'correction'])
    );
    expect(t.bond).toBe(1);
    expect(t.captures).toBe(1);
    expect(t.semantic).toEqual([false]);
  });

  it('flag on: every writer that consults the hold records nothing', async () => {
    const t = await turn(LINE, CRISIS, 'on');
    expect(t.realClient).toBe(0);
    expect(t.pipeline).toBe('pass');
    expect(t.gate).toBe('guide');
    expect(t.writes).toEqual([]);
    expect(t.bond).toBe(0);
    expect(t.captures).toBe(0);
    expect(t.semantic).toEqual([true]);
  });
});

describe('the gate reads the turn only after the pipeline read settled clean and the writers asked', () => {
  it('flag on: held, the pipeline read never standing in for the gate', async () => {
    const t = await turn(LINE, CRISIS, 'on', 'late');
    expect(t.realClient).toBe(0);
    expect(t.pipeline).toBe('pass');
    expect(t.gate).toBe('guide');
    expect(t.writes).toEqual([]);
    expect(t.bond).toBe(0);
    expect(t.captures).toBe(0);
    expect(t.semantic).toEqual([true]);
  });
});

describe('flag on: fail closed while the gate has no verdict', () => {
  it.each([
    ['fails', FAILS],
    ['never answers within the wait', NEVER],
  ])("the gate's classifier read %s: held", async (_name, read) => {
    const t = await turn(LINE, read, 'on');
    expect(t.pipeline).toBe('pass');
    expect(t.writes).toEqual([]);
    expect(t.bond).toBe(0);
    expect(t.captures).toBe(0);
    expect(t.semantic).toEqual([true]);
  });
});

describe('flag on: everything else as on main', () => {
  it('an ordinary turn both engines pass records exactly what flag off records', async () => {
    const off = await turn(LINE, NO_RISK, 'off');
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    resetFireAndForgetMetrics();
    Object.assign(state, { writes: [], semanticReads: [], captures: 0 });
    const on = await turn(LINE, NO_RISK, 'on');
    expect([off.gate, on.gate]).toEqual(['pass', 'pass']);
    expect(off.writes.length).toBeGreaterThan(0);
    expect(on.writes).toEqual(off.writes);
    expect([on.bond, on.captures, on.semantic]).toEqual([off.bond, off.captures, off.semantic]);
  });

  it.each(['off', 'on'] as const)(
    'flag %s: a crisis the pipeline reads itself is held, as on main',
    async (flag) => {
      const t = await turn(PATTERN_CRISIS, null, flag);
      expect(t.pipeline).toBe('guide');
      expect(t.writes).toEqual([]);
      expect(t.captures).toBe(0);
      expect(t.semantic).toEqual([true]);
    }
  );
});
