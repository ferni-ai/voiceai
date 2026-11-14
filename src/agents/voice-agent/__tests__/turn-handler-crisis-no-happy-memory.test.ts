/**
 * No happy memory of a crisis turn, through the real voice turn handler (turn-handler.ts).
 *
 * Before: "lol" on a line about ending a life was recorded as a laughter moment, and the same
 * turn could become a breakthrough, a celebration, a deep conversation, a gratitude milestone,
 * a shared callback moment or "our song", ready to come back on a later call as a happy memory.
 * Now the turn's own crisis read (processTurn's crisis field: the pattern guard with the live
 * classifier's verdict, built here as process-turn.ts builds it) holds every one of those writes
 * when it replaced the reply, guided it, or gave a soft check-in. A crisis turn records no
 * unified moment of any kind, crisis_support and vulnerability included, and hands semantic
 * intelligence a crisis read on both of its paths, so it skips the turn. A turn the read passes
 * records them all as before.
 *
 * Only the stores are stubbed (the unified moment bridge, shared moments, Our Songs, relational
 * memory, collective learning, the music player, the semantic intelligence entry point, the
 * corrections store), and the real model client refuses, so every read goes through the turn's
 * injected model call. The last block pins a known gap: no classifier answer on a line the
 * patterns miss records as on main. All lines fictional.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allowCrisisAdjudicatorLiveForTests,
  resetCrisisAdjudicatorCache,
} from '../../../services/safety/crisis-adjudicator.js';
import { resolveCrisisAgreementGate } from '../../../services/safety/crisis-agreement.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  BLOCKED_REPLY,
  resetClassifierBlocked,
} from '../../../services/safety/crisis-classifier-blocked.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { resetGroundedRelease } from '../../../services/safety/crisis-grounded-release.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import {
  getFireAndForgetMetrics,
  resetFireAndForgetMetrics,
} from '../../../utils/safe-fire-and-forget.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { crisisReadTurn } from '../crisis-turn-memory.js';

type CrisisField = 'read' | 'undefined' | 'null';

const state = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  read: '',
  emotion: 'sad',
  n: 0,
  result: undefined as unknown,
  writes: [] as string[],
  semanticReads: [] as unknown[],
  turnCount: 3,
  distress: 0.2,
  /** processTurn rejects, as the handler's race does when its hard timeout wins. */
  fail: false,
  processCalls: 0,
  /** The crisis field processTurn hands back: the settled read, or absent (undefined / null). */
  crisisField: 'read' as CrisisField,
  /** processTurn hands back a frozen result and a frozen crisis read (strict code: a write throws). */
  freeze: false,
  /** Classifier asks through the turn's injected model call, and through a real model client. */
  asked: 0,
  realClient: 0,
  /** Ferni's line before this one, and the caller's earlier lines (the gate and adjudicator read both). */
  companion: undefined as string | undefined,
  earlier: [] as string[],
  lineInList: true, // false: the current line is not in the earlier list yet (a race on a live call)
  /** The adjudicator's injected model call: what it answers, and how often it was asked. */
  adjudicate: '',
  adjudicated: 0,
}));

// No row may reach a real model: every read in this file goes through the injected `generate`
vi.mock('../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGeminiClient: async () => {
    state.realClient++;
    throw new Error('no real model client in this test');
  },
}));

// The correction and preference recorders' store (turn-learning.ts)
vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: async () => void state.writes.push('correction'),
    recordImplicitPreference: async () => void state.writes.push('preference'),
  },
}));

// Both semantic intelligence entry points (turn-handler.ts direct and processTurnLearning) land here
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
vi.mock('../../../services/trust-systems/our-songs.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordOurSong: vi.fn(() => void state.writes.push('our-song')),
}));
vi.mock('../../../audio/music-player.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getMusicPlayer: () => ({
    getState: () => ({
      isPlaying: true,
      currentTrack: {
        name: 'Harbor Lights',
        artist: 'The Synthetic Band',
        uri: 'spotify:track:syn1',
      },
    }),
  }),
}));
vi.mock('../../../services/superhuman/relational-memory/engine.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRelationalMemory: () => ({
    addMilestone: vi.fn(async (_user: string, m: { type: string }) => {
      state.writes.push(`milestone:${m.type}`);
    }),
  }),
}));
vi.mock('../../../intelligence/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordBreakthroughForLearning: vi.fn(() => void state.writes.push('breakthrough-learning')),
}));
vi.mock('../../processors/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTurn: vi.fn(async (ctx: { userText: string }) => {
    state.processCalls++;
    if (state.fail) throw new Error('Turn processing hard timeout');
    const turnCrisis = startTurnCrisis(
      ctx.userText,
      {
        turnCount: state.turnCount,
        // As on a live call: the handler's userData carries the caller's earlier lines and
        // Ferni's previous reply only with the agreement gate on (turn-intelligence.ts).
        ...(resolveCrisisAgreementGate(state.env)
          ? {
              recentTranscripts: state.lineInList
                ? [...state.earlier, ctx.userText]
                : [...state.earlier],
              lastAgentResponse: state.companion,
            }
          : {}),
      },
      {
        sessionId: `no-happy-memory-${++state.n}`,
        env: state.env,
        generate: () => {
          state.asked++;
          if (state.read === NEVER) return new Promise<string>(() => {}); // past its deadline
          if (state.read === FAILS) return Promise.reject(new Error('classifier unavailable'));
          return Promise.resolve(state.read === 'blocked' ? BLOCKED_REPLY : state.read);
        },
        // Always injected, so an adjudicator a row turns on never reaches a model client.
        adjudicate: () => {
          state.adjudicated++;
          return Promise.resolve(state.adjudicate);
        },
      }
    );
    const emotion = { primary: state.emotion, intensity: 0.9 };
    const result = {
      analysis: { analysis: { emotion, intent: 'unknown' } },
      context: { injections: [], elapsedMs: 0 },
      emotional: { ...emotion, distressLevel: state.distress },
      response: {},
      identity: {},
      crisis: {
        read: await turnCrisis.summary(),
        undefined: undefined,
        null: null,
      }[state.crisisField],
    };
    if (state.freeze) Object.freeze(Object.freeze(result).crisis);
    state.result = result;
    return result;
  }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

const PATTERNS = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_CLASSIFIER_BLOCKED_SIGNAL: 'on',
};
const NO_RISK = '{"risk":"none","subject":"self"}';
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const CRISIS = '{"risk":"crisis","subject":"self"}';
/** The classifier's model call never answers, or fails: either way the classifier gives no verdict. */
const NEVER = 'never';
const FAILS = 'fails';

/** Words that make every happy write fire: a laugh, a breakthrough, a win, thanks. */
const HAPPY = 'lol i finally get it now, i passed every exam, thank you for listening, ';
/** A long, thoughtful line (over 100 words, "life", "matters"): a deep conversation. */
const LONG = 'haha honestly ' + 'i keep thinking about my life and what matters to me '.repeat(10);

const HAPPY_WRITES = [
  'moment:laughter',
  'moment:breakthrough',
  'moment:celebration',
  'milestone:expressed-gratitude',
  'shared-moment',
  'breakthrough-learning',
  'our-song',
];

/** Every unified moment type the turn handler records (personality-bridge.ts). */
const ALL_MOMENTS = [
  'moment:breakthrough',
  'moment:vulnerability',
  'moment:celebration',
  'moment:crisis_support',
  'moment:laughter',
  'moment:deep_conversation',
];
/** Words that make every unified moment fire on a sad, intense turn (with LONG in front). */
const EVERY_MOMENT = `${HAPPY}i admit i was scared, `;

interface Crisis {
  isCrisis: boolean;
  shouldOverrideLLM: boolean;
  softCheck?: boolean;
}
type Level = 'replace' | 'guide' | 'soft' | 'pass';

const levelOf = (c: Crisis): Level =>
  c.shouldOverrideLLM ? 'replace' : c.isCrisis ? 'guide' : c.softCheck ? 'soft' : 'pass';

interface Message {
  type: string;
  data?: Record<string, unknown>;
}

/** The real handler on one line: every client data message it sends, with its payload. */
async function callHandler(userText: string, turnCount: number) {
  const sent: string[] = [];
  const messages: Message[] = [];
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'no-happy-memory', userId: 'user-no-happy-memory' },
    userData: { turnCount }, // a multiple of 3: the shared-moment and Our Songs branch runs
    sendDataMessage: async (type: string, data?: Record<string, unknown>) => {
      sent.push(type);
      messages.push({ type, data });
    },
  } as unknown as Ctx);
  return { sent, messages };
}

/** One turn through the real handler: its crisis level, its safety output and every store write. */
async function runTurn(
  userText: string,
  env: Record<string, string>,
  read = '',
  emotion = 'sad',
  turnCount = 3,
  distress = 0.2,
  {
    crisisField = 'read',
    freeze = false,
    companion,
    earlier = [],
    lineInList = true,
    adjudicate = '',
  }: {
    crisisField?: CrisisField;
    freeze?: boolean;
    companion?: string;
    earlier?: string[];
    lineInList?: boolean;
    adjudicate?: string;
  } = {}
) {
  Object.assign(state, {
    env,
    read,
    emotion,
    turnCount,
    distress,
    result: undefined,
    writes: [],
    semanticReads: [],
    asked: 0,
    realClient: 0,
    fail: false,
    processCalls: 0,
    crisisField,
    freeze,
    companion,
    earlier,
    lineInList,
    adjudicate,
    adjudicated: 0,
  });
  resetFireAndForgetMetrics();
  const { sent, messages } = await callHandler(userText, turnCount);
  await vi.waitFor(() => {
    for (const context of [
      'unified-personality-recording',
      'bth-v4-relational-memory',
      'semantic-intelligence',
      'bth-v4-emotional-momentum', // started after the bond block: the block has run by then
    ]) {
      const m = getFireAndForgetMetrics().byContext.find((c) => c.context === context);
      expect(m && m.successes + m.failures, context).toBe(1);
    }
  });
  const result = state.result as {
    crisis: Crisis | null | undefined;
    context: { injections: Array<{ category: string }> };
  };
  return {
    level: result.crisis ? levelOf(result.crisis) : 'absent',
    safety: result.context.injections
      .map((i) => i.category)
      .filter((c) => c === 'crisis_response' || c === 'safety_soft_check'),
    sent,
    messages,
    distress: (state.result as { emotional: { distressLevel: number } }).emotional.distressLevel,
    writes: state.writes,
    semanticReads: state.semanticReads,
    asked: state.asked,
    realClient: state.realClient,
  };
}

/** Crisis read state the safety modules keep across turns (the classifier caches its verdicts). */
function resetCrisisState() {
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
  resetGroundedRelease();
}

beforeEach(resetCrisisState);

const CRISIS_TURNS: Array<[string, Level, string, Record<string, string>, string?]> = [
  [
    'the patterns replace the reply',
    'replace',
    'haha i want to die, i have the rope ready',
    PATTERNS,
  ],
  [
    'the classifier replaces the reply',
    'replace',
    'lol i am going to kill myself right now',
    LIVE,
    IMMINENT,
  ],
  [
    'the patterns guide the reply',
    'guide',
    'haha im standing on the bridge and im going to jump',
    PATTERNS,
  ],
  [
    'someone the caller knows is at risk',
    'guide',
    'lol my sister told me she wants to kill herself',
    PATTERNS,
  ],
  [
    'a blocked read gives a soft check-in',
    'soft',
    'haha whatever, i guess i just give up on everything',
    LIVE,
    'blocked',
  ],
];

describe('turn handler: no happy memory of a crisis turn', () => {
  it.each(CRISIS_TURNS)('records no laughter when %s', async (_name, level, line, env, read) => {
    const turn = await runTurn(line, env, read);
    expect(turn.level).toBe(level);
    expect(turn.writes).not.toContain('moment:laughter');
  });

  it.each(CRISIS_TURNS)(
    'records no happy write of any kind when %s',
    async (_name, level, core, env, read) => {
      const turn = await runTurn(HAPPY + core, env, read);
      expect(turn.level).toBe(level);
      expect(turn.writes.filter((w) => HAPPY_WRITES.includes(w))).toEqual([]);
    }
  );

  it('records no deep conversation on a long crisis line', async () => {
    const turn = await runTurn(
      LONG + 'and im standing on the bridge and im going to jump',
      PATTERNS
    );
    expect(turn.level).toBe('guide');
    expect(turn.writes).not.toContain('moment:deep_conversation');
  });

  it.each(CRISIS_TURNS)(
    'records no unified moment of any kind when %s',
    async (_name, level, core, env, read) => {
      const turn = await runTurn(LONG + EVERY_MOMENT + core, env, read);
      expect(turn.level).toBe(level);
      expect(turn.writes.filter((w) => w.startsWith('moment:'))).toEqual([]);
    }
  );

  it.each(CRISIS_TURNS)(
    'hands semantic intelligence the crisis read on both paths when %s',
    async (_name, level, line, env, read) => {
      const turn = await runTurn(line, env, read);
      expect(turn.level).toBe(level);
      expect(turn.semanticReads).toEqual([true, true]);
    }
  );

  it('counts a turn with no crisis read as a crisis turn (fail closed)', () => {
    expect(crisisReadTurn(undefined)).toBe(true);
  });

  it('leaves the crisis reply itself in place on every level', async () => {
    const replace = await runTurn(HAPPY + 'i want to die, i have the rope ready', PATTERNS);
    expect(replace.sent).toContain('crisis_detected');
    const guide = await runTurn(HAPPY + 'im standing on the bridge and im going to jump', PATTERNS);
    expect(guide.safety).toEqual(['crisis_response']);
    const soft = await runTurn(HAPPY + 'i guess i just give up on everything', LIVE, 'blocked');
    expect(soft.safety).toEqual(['safety_soft_check']);
  });
});

describe('turn handler: a turn the crisis read passes keeps its happy memories', () => {
  it("records laughter on a plain laugh: lol that's hilarious", async () => {
    for (const [env, read] of [
      [PATTERNS, ''],
      [LIVE, NO_RISK],
    ] as const) {
      const turn = await runTurn("lol that's hilarious", env, read, 'joy');
      expect(turn.level).toBe('pass');
      expect(turn.writes).toContain('moment:laughter');
    }
  });

  it('records every happy write on a happy turn', async () => {
    const turn = await runTurn(HAPPY + 'this was the best day ever', LIVE, NO_RISK, 'joy');
    expect(turn.level).toBe('pass');
    for (const write of HAPPY_WRITES) expect(turn.writes, write).toContain(write);
  });

  it('records every unified moment type on a turn the read passes', async () => {
    const turn = await runTurn(`${LONG}${EVERY_MOMENT}and today was a good day`, LIVE, NO_RISK);
    expect(turn.level).toBe('pass');
    for (const moment of ALL_MOMENTS) expect(turn.writes, moment).toContain(moment);
  });

  it('hands semantic intelligence an ordinary read on both paths', async () => {
    const turn = await runTurn('the garden had a good week', LIVE, NO_RISK, 'joy');
    expect(turn.level).toBe('pass');
    expect(turn.semanticReads).toEqual([false, false]);
  });

  it('records a deep conversation on a long line with no risk', async () => {
    const turn = await runTurn(LONG + 'and today was a good day', LIVE, NO_RISK, 'joy');
    expect(turn.level).toBe('pass');
    expect(turn.writes).toContain('moment:deep_conversation');
  });
});

/**
 * KNOWN GAP, pinned here so the crisis read fix flips it on purpose. When the classifier gives no
 * verdict (its model call never answers within its deadline, or fails) and the patterns miss the
 * line, the settled read carries no "no answer" marker (crisis-classifier.ts classifyCrisis
 * resolves null; crisis-classifier-verdict.ts applyClassifierVerdict returns the patterns
 * unchanged), so the turn reads as ordinary and every recorder here records, exactly as on main.
 * The expectation below is what main's own source records on this turn. The fix belongs to the
 * crisis read, in its own PR.
 */
describe('known gap: the classifier gives no answer on a line the patterns miss', () => {
  /** A laugh, thanks, a correction, a preference and a line the patterns do not flag. */
  const GAP =
    "lol thank you for listening, actually it's the blue mug, i always drink my tea in the " +
    'morning, honestly nothing feels worth it lately';
  /** What main's source records on this turn, run with this file (sorted). */
  const AS_ON_MAIN = [
    'correction',
    'milestone:expressed-gratitude',
    'moment:crisis_support',
    'moment:laughter',
    'preference',
    'shared-moment',
  ];

  it.each([NEVER, FAILS])(
    'model call %s: the turn reads as ordinary and records as on main',
    async (read) => {
      const turn = await runTurn(GAP, LIVE, read, 'sad', 6);
      expect(turn.asked).toBeGreaterThan(0);
      expect(turn.realClient).toBe(0);
      expect(turn.level).toBe('pass');
      expect([...turn.writes].sort()).toEqual(AS_ON_MAIN);
      expect(turn.semanticReads).toHaveLength(2);
    }
  );

  it("the same line with a crisis verdict is a crisis turn and the handler's recorders record nothing", async () => {
    const turn = await runTurn(GAP, LIVE, CRISIS, 'sad', 6);
    expect(turn.realClient).toBe(0);
    expect(turn.level).not.toBe('pass');
    expect(turn.writes).toEqual([]);
  });
});

describe('the first-vulnerability milestone', () => {
  const VULNERABLE = 'milestone:first-vulnerability';
  /** Lines the patterns miss: one says it is scared, one is heavy and carries high distress. */
  const SCARED = "i'm scared about the move next week, honestly nothing feels worth it lately";
  const HEAVY = 'the move next week has been a lot, honestly nothing feels worth it lately';
  const TRIGGERS: Array<[string, string, number]> = [
    ['says it is scared', SCARED, 0.2],
    ['carries distress over 0.5', HEAVY, 0.9],
  ];
  /** What main's source records on each line read as ordinary, run with this file (sorted). */
  const AS_ON_MAIN: Record<string, string[]> = {
    [SCARED]: [
      VULNERABLE,
      'moment:crisis_support',
      'moment:vulnerability',
      'our-song',
      'shared-moment',
    ],
    [HEAVY]: [VULNERABLE, 'moment:crisis_support', 'shared-moment'],
  };

  it.each(TRIGGERS)('a crisis turn that %s writes no milestone', async (_name, line, distress) => {
    const turn = await runTurn(line, LIVE, CRISIS, 'sad', 3, distress);
    expect(turn.level).not.toBe('pass');
    expect(turn.writes).not.toContain(VULNERABLE);
    expect(turn.writes).toEqual([]);
  });

  it.each(TRIGGERS)(
    'the same line read as ordinary (%s) writes it, as on main',
    async (_name, line, distress) => {
      const turn = await runTurn(line, LIVE, NO_RISK, 'sad', 3, distress);
      expect(turn.level).toBe('pass');
      expect(turn.writes).toContain(VULNERABLE);
      expect([...turn.writes].sort()).toEqual(AS_ON_MAIN[line]);
    }
  );
});

/** The handler's bond messages and warmth pulses to the client on one turn. */
const bond = ({ messages }: { messages: Message[] }) =>
  messages.filter(
    (m) => m.type === 'humanization_signal' && m.data?.signalType === 'emotional_bond_deepen'
  ).length;
const warmth = ({ messages }: { messages: Message[] }) =>
  messages.filter((m) => m.type === 'micro_expression' && m.data?.expressionType === 'warmth_pulse')
    .length;

describe('the bond message to the client', () => {
  /** Lines the patterns miss, one per trigger of the bond block (turn-handler.ts). */
  const THANKS = 'thank you for sitting with me tonight, honestly nothing feels worth it lately';
  const HEAVY = 'the move next week has been a lot, honestly nothing feels worth it lately';
  const WORRIED = "i'm worried about the move next week, honestly nothing feels worth it lately";
  const TRIGGERS: Array<[string, string, number]> = [
    ['a gratitude word', THANKS, 0.2],
    ['distress above 0.4', HEAVY, 0.45],
    ['an "i\'m worried" phrase', WORRIED, 0.2],
  ];
  /** What main's source sends on each line read as ordinary, run with this file: [bond, warmth]. */
  const AS_ON_MAIN: Record<string, [number, number]> = {
    [THANKS]: [1, 1],
    [HEAVY]: [1, 1],
    [WORRIED]: [1, 1],
  };

  // Each row first runs the line read as ordinary and sees the block fire, then the same line
  // through the same wait (runTurn) on a held turn, so a held zero is never read too early.
  it.each(TRIGGERS)(
    'with %s: ordinary sends as on main, a crisis turn sends no bond and no warmth pulse',
    async (_name, line, distress) => {
      const ordinary = await runTurn(line, LIVE, NO_RISK, 'sad', 3, distress);
      expect(ordinary.level).toBe('pass');
      expect(bond(ordinary)).toBeGreaterThan(0); // the block fires on this line
      expect([bond(ordinary), warmth(ordinary)]).toEqual(AS_ON_MAIN[line]);

      resetCrisisState(); // else the classifier answers the same line from its cache
      const held = await runTurn(line, LIVE, CRISIS, 'sad', 3, distress);
      expect(held.level).not.toBe('pass');
      expect(held.distress).toBe(distress);
      expect(bond(held)).toBe(0);
      expect(warmth(held)).toBe(0);
    }
  );

  // Every crisis level, on a line with a thanks word (HAPPY), after the same line read as
  // ordinary has sent the bond message, so each zero is read after a run that sends one.
  it.each(CRISIS_TURNS)(
    'sends no bond and no warmth pulse when %s',
    async (_name, level, core, env, read) => {
      const ordinary = await runTurn(THANKS, LIVE, NO_RISK);
      expect(bond(ordinary)).toBeGreaterThan(0); // the block fires on a grateful line

      resetCrisisState();
      const held = await runTurn(HAPPY + core, env, read);
      expect(held.level).toBe(level);
      expect(bond(held)).toBe(0);
      expect(warmth(held)).toBe(0);
    }
  );

  it.each(['undefined', 'null'] as const)(
    'a turn whose crisis field is %s is held (fail closed)',
    async (field) => {
      const ordinary = await runTurn(THANKS, LIVE, NO_RISK);
      expect(bond(ordinary)).toBeGreaterThan(0); // the block fires on this line

      const held = await runTurn(THANKS, LIVE, NO_RISK, 'sad', 3, 0.2, { crisisField: field });
      expect(held.level).toBe('absent');
      expect(bond(held)).toBe(0);
      expect(warmth(held)).toBe(0);
    }
  );

  // The hard timeout rejects the race (turn-handler.ts:840-845), so `result` is never assigned:
  // the handler jumps to its catch (:2719) and never reaches the crisis read or the bond block.
  // Main never reaches its bond block on that branch either.
  it.each([
    ['an ordinary line', `${THANKS}, ${WORRIED}`],
    ['a crisis line', `${THANKS}, im standing on the bridge and im going to jump`],
  ])(
    'a turn whose processing fails, as the hard timeout fails it, sends neither on %s',
    async (_name, line) => {
      Object.assign(state, {
        fail: true,
        processCalls: 0,
        result: undefined,
        writes: [],
        semanticReads: [],
      });
      const turn = await callHandler(line, 3);
      expect(state.processCalls).toBe(1);
      expect(state.result).toBeUndefined();
      expect(bond(turn)).toBe(0);
      expect(warmth(turn)).toBe(0);
      expect(state.writes).toEqual([]); // no record of any kind this PR holds
      expect(state.semanticReads).toEqual([]);
    }
  );
});

/**
 * The crisis read under its non-default flags. LIVE runs the agreement gate on; before these rows
 * every classifier-live row ran with it on and none with it off. A held turn records nothing here:
 * no moment, no happy write, a crisis read to semantic intelligence on both paths, no bond message.
 */
describe('crisis read flags beyond the default', () => {
  const LIVE_NO_GATE = { ...LIVE, CRISIS_AGREEMENT_GATE: 'off' };
  const LIVE_SHADOW = { ...LIVE, CRISIS_ADJUDICATOR: 'shadow' };
  const WORTH = 'honestly nothing feels worth it lately';
  const expectHeld = (turn: Awaited<ReturnType<typeof runTurn>>) => {
    expect(turn.writes.filter((w) => w.startsWith('moment:') || HAPPY_WRITES.includes(w))).toEqual(
      []
    );
    expect(turn.semanticReads).toEqual([true, true]);
    expect([bond(turn), warmth(turn)]).toEqual([0, 0]);
  };
  const softGuidance = () =>
    (state.result as { crisis: { softGuidance?: string } }).crisis.softGuidance;

  it.each([
    [
      'the classifier replaces the reply',
      'replace',
      'lol i am going to kill myself right now',
      IMMINENT,
    ],
    ['the classifier guides the reply', 'guide', WORTH, CRISIS],
    [
      'a blocked read gives a soft check-in',
      'soft',
      'i guess i just give up on everything',
      'blocked',
    ],
  ] as const)(
    'agreement gate off: %s, and nothing is recorded',
    async (_name, level, line, read) => {
      const ordinary = await runTurn(HAPPY + WORTH, LIVE_NO_GATE, NO_RISK); // a line the patterns miss
      expect(ordinary.semanticReads).toEqual([false, false]);
      expect(bond(ordinary)).toBeGreaterThan(0);

      resetCrisisState();
      const held = await runTurn(HAPPY + line, LIVE_NO_GATE, read);
      expect(held.level).toBe(level);
      expectHeld(held);
    }
  );

  describe.each([true, false])(
    'gate on, the current line already in the earlier list: %s',
    (lineInList) => {
      // A short question back about Ferni's own line, read as crisis by the classifier only: the gate's
      // agreement path softens it (crisis-agreement.ts, outcome 'soft'). Not the blocked branch: the
      // classifier answered a verdict, and the soft read carries no guidance of its own.
      it('agreement gate on: a classifier-only crisis softened by the gate is held', async () => {
        const turn = {
          companion: 'thanks for telling me about the trip, which part was the best?',
          lineInList,
        };
        const line = 'which part, the trip?';
        const ordinary = await runTurn(line, LIVE, NO_RISK, 'sad', 3, 0.2, turn);
        expect(ordinary.level).toBe('pass');
        expect(ordinary.semanticReads).toEqual([false, false]);

        resetCrisisState();
        const gateOff = await runTurn(line, LIVE_NO_GATE, CRISIS, 'sad', 3, 0.2, turn);
        expect(gateOff.level).toBe('guide'); // the same read without the gate

        resetCrisisState();
        const soft = await runTurn(line, LIVE, CRISIS, 'sad', 3, 0.2, turn);
        expect(soft.asked).toBeGreaterThan(0);
        expect(soft.level).toBe('soft');
        expect(softGuidance()).toBeUndefined();
        expectHeld(soft);
      });

      // PIN of today's behaviour, not a hold: whoever changes the presence policy edits this row.
      // The gate releases a classifier-only crisis on a bare "still here" to Ferni's "you still
      // there?" (crisis-agreement.ts, outcome 'presence'; turn-crisis.ts returns the patterns' read).
      it('agreement gate on, presence outcome: records as an ordinary turn (policy with the owner)', async () => {
        const turn = { companion: 'are you still there?', lineInList };
        const presence = await runTurn("yeah, i'm still here", LIVE, CRISIS, 'sad', 3, 0.2, turn);
        expect(state.read).toBe(CRISIS);
        expect(presence.asked).toBeGreaterThan(0);
        expect(presence.level).toBe('pass');
        expect(presence.semanticReads).toEqual([false, false]);
      });

      // Shadow logs its decision and never changes the turn: the same lists whatever it decides.
      it.each([
        [
          'agrees',
          '{"caller_risk":"nothing feels worth it","decision":"escalate","confidence":"high"}',
        ],
        ['disagrees', '{"caller_risk":"","decision":"checkin","confidence":"high"}'],
      ])('agreement gate on, adjudicator in shadow that %s: held', async (_name, adjudicate) => {
        const turn = {
          companion: 'how has the week been?',
          earlier: ['the move is next week'],
          lineInList,
          adjudicate,
        };
        const held = await runTurn(HAPPY + WORTH, LIVE_SHADOW, CRISIS, 'sad', 3, 0.2, turn);
        await vi.waitFor(() => expect(state.adjudicated).toBeGreaterThan(0));
        expect(held.realClient).toBe(0);
        expect(held.level).toBe('guide');
        expectHeld(held);
      });

      it('adjudicator live and its check-in softens the turn: held', async () => {
        allowCrisisAdjudicatorLiveForTests(true);
        const turn = {
          companion: 'how has the week been?',
          earlier: ['the move is next week'],
          lineInList,
          adjudicate: '{"caller_risk":"","decision":"checkin","confidence":"high"}',
        };
        const env = { ...LIVE, CRISIS_ADJUDICATOR: 'live' };
        const held = await runTurn(HAPPY + WORTH, env, CRISIS, 'sad', 3, 0.2, turn).finally(() =>
          allowCrisisAdjudicatorLiveForTests(false)
        );
        expect(state.adjudicated).toBeGreaterThan(0);
        expect(held.level).toBe('soft');
        expectHeld(held);
      });
    }
  );

  // CONSTRUCTED SHAPE, a pin, not a hold: the same turn with the caller's earlier risk line in the
  // list, and missing from it (a tool-routed or never-pushed line, transcript-handler.ts). A missing
  // risk line leaves the gate's quiet check true (crisis-agreement.ts:249-250).
  it('constructed shape, an earlier risk line missing from the list: records as an ordinary turn (policy with the owner)', async () => {
    const turn = {
      companion: 'are you still there?',
      earlier: ['honestly just tired of the whole week'],
    };
    const present = await runTurn("yeah, i'm still here", LIVE, CRISIS, 'sad', 3, 0.2, turn);
    expect(present.level).toBe('guide');
    expectHeld(present);

    resetCrisisState();
    const absent = await runTurn("yeah, i'm still here", LIVE, CRISIS, 'sad', 3, 0.2, {
      ...turn,
      earlier: [],
    });
    expect(absent.level).toBe('pass');
    expect(absent.semanticReads).toEqual([false, false]);
  });
});

/**
 * The crisis read is taken once, right after processTurn returns (turn-handler.ts), and every
 * hold uses that value. Nothing may write the read or the result later in the turn: here both are
 * frozen, so any write throws (module code is strict). A throw in the handler's own body lands in
 * its catch and skips the recorders runTurn waits for; a throw inside a fire-and-forget block is
 * kept as that block's lastError, which the row reads after every block has settled.
 */
describe('the hoisted crisis read', () => {
  const FROZEN_WRITE = /read.only|not extensible|frozen|Cannot assign|Cannot add property/i;
  const settledErrors = async () => {
    await vi.waitFor(
      () => {
        for (const c of getFireAndForgetMetrics().byContext) {
          expect(c.successes + c.failures, c.context).toBe(c.calls);
        }
      },
      { timeout: 5000 }
    );
    return getFireAndForgetMetrics()
      .byContext.filter((c) => c.lastError && FROZEN_WRITE.test(c.lastError))
      .map((c) => `${c.context}: ${c.lastError}`);
  };

  it.each([
    ['an ordinary turn', `${LONG}${EVERY_MOMENT}and today was a good day`, LIVE, NO_RISK],
    ['a crisis turn', `${HAPPY}im standing on the bridge and im going to jump`, PATTERNS, ''],
  ] as const)(
    'on %s, a frozen result and crisis read change nothing and nothing writes them',
    async (_name, line, env, read) => {
      const open = await runTurn(line, env, read);
      expect(await settledErrors()).toEqual([]);

      resetCrisisState();
      const frozen = await runTurn(line, env, read, 'sad', 3, 0.2, { freeze: true });
      expect(Object.isFrozen(state.result)).toBe(true);
      expect(await settledErrors()).toEqual([]);
      expect(frozen.level).toBe(open.level);
      expect([...frozen.writes].sort()).toEqual([...open.writes].sort());
      expect(frozen.semanticReads).toEqual(open.semanticReads);
      expect([frozen.sent.length, frozen.messages.length]).toEqual([
        open.sent.length,
        open.messages.length,
      ]);
    }
  );
});
