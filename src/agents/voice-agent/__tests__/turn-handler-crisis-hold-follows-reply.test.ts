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
 * intelligence, fast capture) waits for the gate's read of THIS caller turn and holds. Each turn
 * is named as the live turn context pusher names it (multi-agent/caller-turn-builder.ts), so an
 * earlier turn's read never stands in for it, however its words overlap (lane 28, #4090).
 *
 * Only the stores are stubbed; every classifier read goes through an injected model call, and
 * the real model client refuses. All lines fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { CRISIS_READ_WAIT, crisisMemoryHeld } from '../../../utils/crisis-memory-hold.js';
import {
  getFireAndForgetMetrics,
  resetFireAndForgetMetrics,
} from '../../../utils/safe-fire-and-forget.js';
import { callerTurnBuilder } from '../../multi-agent/caller-turn-builder.js';
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

/** What the handler records for LINE on a turn nothing holds (flag off, ordinary). */
const RECORDED = [
  'correction',
  'milestone:expressed-gratitude',
  'moment:crisis_support',
  'moment:laughter',
  'preference',
  'shared-moment',
];

const WRITERS = [
  'unified-personality-recording',
  'bth-v4-relational-memory',
  'semantic-intelligence',
  'dynamic-memory-capture',
];

let n = 0;
const WAIT = { ...CRISIS_READ_WAIT };

// LIMIT (a), lane 28: the first handler turn ran cold (imports, ~925 ms) while the gate's
// classifier, started first, waited on it, and under load timed out. One warm turn first.
beforeAll(async () => {
  await turn(LINE, NO_RISK, 'off');
  vi.unstubAllEnvs();
}, 30_000);

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

interface TurnShape {
  /** 'late': the gate reads the line only after the handler's writers have asked. */
  gateStarts?: 'first' | 'late';
  /** Earlier caller turns of the same call, each read clean by the gate (and so recorded). */
  earlier?: readonly string[];
  /** A preflight fragment of this turn the gate read clean first, under this turn's name. */
  fragment?: string;
  /** How long the gate's classifier takes once released: longer than the writers' poll. */
  readTakesMs?: number;
}

const gateEnv = (flag: 'on' | 'off') => ({ ...GATE, CRISIS_HOLD_FOLLOWS_REPLY: flag });

/**
 * One turn: the reply gate starts its read of the line (its model call answers `gateRead` once
 * released), the handler runs it with the pipeline's read, then the gate's read is released.
 * Every turn of the call is named by the pusher's real builder (caller-turn-builder.ts), which
 * notes each name for the call, and the handler gets the name as the hook hands it (userData).
 * Returns the pipeline's level, the gate's final action and every write the handler made.
 */
async function turn(
  line: string,
  gateRead: string | null,
  flag: 'on' | 'off',
  { gateStarts = 'first', earlier = [], fragment, readTakesMs = 0 }: TurnShape = {}
) {
  vi.stubEnv('CRISIS_HOLD_FOLLOWS_REPLY', flag);
  const sessionId = `hold-follows-reply-${++n}`;
  Object.assign(state, { sessionId, pipelineEnv: PATTERNS_ONLY });
  const names = callerTurnBuilder(sessionId, { CRISIS_HOLD_FOLLOWS_REPLY: flag });
  const chat = llm.ChatContext.empty();
  const clean = async () => NO_RISK;
  for (const said of earlier) {
    names.add(said);
    chat.addMessage({ role: 'user', content: said });
    const read = startCrisisGate(
      chat.copy(),
      { services: { sessionId } },
      {
        env: gateEnv(flag),
        generate: clean,
      }
    );
    await read?.escalation;
    chat.addMessage({ role: 'assistant', content: 'Mm, I hear you.' });
    names.end(); // Ferni replied: the turn ended
  }
  names.heard(); // the turn's first interim (or preflight) segment
  if (fragment) {
    const preflight = chat.copy();
    preflight.addMessage({ role: 'user', content: fragment });
    const read = startCrisisGate(
      preflight,
      { services: { sessionId } },
      {
        env: gateEnv(flag),
        generate: clean,
      }
    );
    await read?.escalation;
  }
  const { key } = names.add(line);
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  chat.addMessage({ role: 'user', content: line });
  const startGate = (): ReturnType<typeof startCrisisGate> =>
    gateRead === null
      ? null
      : startCrisisGate(
          chat,
          { services: { sessionId } },
          {
            env: gateEnv(flag),
            generate: async () => {
              await released;
              await new Promise((resolve) => {
                setTimeout(resolve, readTakesMs);
              });
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
    userData: { turnCount: 6, callerTurnKey: key }, // as the hook hands it (turn-intelligence.ts)
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
    const t = await turn(LINE, CRISIS, 'on', { gateStarts: 'late' });
    expect(t.realClient).toBe(0);
    expect(t.pipeline).toBe('pass');
    expect(t.gate).toBe('guide');
    expect(t.writes).toEqual([]);
    expect(t.bond).toBe(0);
    expect(t.captures).toBe(0);
    expect(t.semantic).toEqual([true]);
  });
});

/** Earlier turns with no word of this turn's line in them. */
const FILLERS = (k: number) => Array.from({ length: k }, (_, i) => `the bus ran late again ${i}`);

const resetCall = () => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetFireAndForgetMetrics();
  Object.assign(state, { writes: [], semanticReads: [], captures: 0 });
};

/**
 * Lane 28 (#4090): the gate reads this turn only after the writers asked, and finds a crisis.
 * On the old head an earlier turn's gate read whose words overlapped this turn's (substring)
 * stood in for it, and every writer kept the turn. Now only the read of this caller turn counts.
 */
describe('flag on: an earlier turn of the call never stands in for the gate read of this one', () => {
  it.each([
    ["an earlier 'no' (inside this turn's words)", ['no']],
    ["an earlier 'thank you', 'lol' and 'honestly'", ['thank you', 'lol', 'honestly']],
    ['an exact repeat of this turn, read clean earlier', [LINE]],
    ["'no' 15 turns back", ['no', ...FILLERS(14)]],
    ['an earlier turn that contains this one', [`${LINE} and the cat agrees`]],
    ['an earlier turn this one contains', ['lol thank you for listening']],
    ['an unrelated earlier turn (control)', FILLERS(1)],
  ])('%s: the late gate read holds every writer', async (_shape, earlier) => {
    const t = await turn(LINE, CRISIS, 'on', { gateStarts: 'late', earlier, readTakesMs: 250 });
    expect(t.realClient).toBe(0);
    expect([t.pipeline, t.gate]).toEqual(['pass', 'guide']);
    // no correction, preference, gratitude milestone, crisis_support moment, laughter or shared moment
    expect(t.writes).toEqual([]);
    expect([t.bond, t.captures, t.semantic]).toEqual([0, 0, [true]]);
  });

  it('a fragment of this turn the gate read clean first (a preflight) does not stand in for it', async () => {
    const fragment = 'lol thank you for listening';
    const t = await turn(LINE, CRISIS, 'on', { gateStarts: 'late', fragment, readTakesMs: 250 });
    expect([t.pipeline, t.gate]).toEqual(['pass', 'guide']);
    expect(t.writes).toEqual([]);
    expect([t.bond, t.captures, t.semantic]).toEqual([0, 0, [true]]);
  });

  it('a clean turn after an overlapping earlier turn records exactly what flag off records', async () => {
    const shape = { gateStarts: 'late', earlier: ['no'] } as const;
    const off = await turn(LINE, NO_RISK, 'off', shape);
    resetCall();
    const on = await turn(LINE, NO_RISK, 'on', shape);
    expect([off.gate, on.gate]).toEqual(['pass', 'pass']);
    expect(off.writes).toEqual(RECORDED);
    expect(on.writes).toEqual(RECORDED);
    expect([on.bond, on.captures, on.semantic]).toEqual([1, 1, [false]]);
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

/**
 * The reply gate's whole answer for one line, its classifier answering `gateRead` at once, and
 * whether the call's memory is held after it.
 */
async function gateAnswer(line: string, gateRead: string, flag: 'on' | 'off') {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  const sessionId = `hold-follows-reply-gate-${++n}`;
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: line });
  const gate = startCrisisGate(
    chat,
    { services: { sessionId } },
    {
      env: { ...GATE, CRISIS_HOLD_FOLLOWS_REPLY: flag },
      generate: async () => {
        if (gateRead === FAILS) throw new Error('classifier unavailable');
        return gateRead;
      },
    }
  );
  const answer = { ...gate, escalation: await gate?.escalation };
  return { answer, held: crisisMemoryHeld(sessionId) };
}

// The census rows (crisis-flag-homes.ts MEMORY_ONLY): reply unchanged, nothing kept.
describe('flag on, a crisis-guided turn and a held turn (the gate read fails)', () => {
  it('on a crisis-guided turn and a held turn, the reply gate decides as with the flag off', async () => {
    for (const [line, read] of [
      [LINE, CRISIS],
      [PATTERN_CRISIS, CRISIS],
      [LINE, FAILS],
    ] as const) {
      const off = await gateAnswer(line, read, 'off');
      const action = off.answer.escalation?.action ?? off.answer.decision?.action;
      expect(read === FAILS ? off.held : action !== 'pass', `${read}: guided, or held`).toBe(true);
      expect(await gateAnswer(line, read, 'on'), read).toEqual(off);
    }
  });

  it("what the handler keeps holds none of the caller's words, on a guided turn and a held turn", async () => {
    for (const read of [CRISIS, FAILS]) {
      resetCrisisClassifierCache();
      resetCrisisCallRisk();
      resetFireAndForgetMetrics();
      Object.assign(state, { writes: [], semanticReads: [], captures: 0 });
      const t = await turn(LINE, read, 'on');
      expect(t.realClient).toBe(0);
      expect([t.writes, t.bond, t.captures, t.semantic], read).toEqual([[], 0, 0, [true]]);
    }
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
