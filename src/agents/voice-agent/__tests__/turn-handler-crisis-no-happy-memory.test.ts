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
 * memory, collective learning, the music player, the semantic intelligence entry point). All lines
 * fictional.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const state = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  read: '',
  emotion: 'sad',
  n: 0,
  result: undefined as unknown,
  writes: [] as string[],
  semanticReads: [] as unknown[],
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
    const turnCrisis = startTurnCrisis(
      ctx.userText,
      { recentTranscripts: [ctx.userText], turnCount: 3 },
      {
        sessionId: `no-happy-memory-${++state.n}`,
        env: state.env,
        generate: async () => (state.read === 'blocked' ? BLOCKED_REPLY : state.read),
      }
    );
    const emotion = { primary: state.emotion, intensity: 0.9 };
    state.result = {
      analysis: { analysis: { emotion, intent: 'unknown' } },
      context: { injections: [], elapsedMs: 0 },
      emotional: { ...emotion, distressLevel: 0.2 },
      response: {},
      identity: {},
      crisis: await turnCrisis.summary(),
    };
    return state.result;
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
const EVERY_MOMENT = HAPPY + 'i admit i was scared, ';

interface Crisis {
  isCrisis: boolean;
  shouldOverrideLLM: boolean;
  softCheck?: boolean;
}
type Level = 'replace' | 'guide' | 'soft' | 'pass';

const levelOf = (c: Crisis): Level =>
  c.shouldOverrideLLM ? 'replace' : c.isCrisis ? 'guide' : c.softCheck ? 'soft' : 'pass';

/** One turn through the real handler: its crisis level, its safety output and every store write. */
async function runTurn(userText: string, env: Record<string, string>, read = '', emotion = 'sad') {
  Object.assign(state, { env, read, emotion, result: undefined, writes: [], semanticReads: [] });
  resetFireAndForgetMetrics();
  const sent: string[] = [];
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText,
    contextOnly: true,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'no-happy-memory', userId: 'user-no-happy-memory' },
    userData: { turnCount: 3 }, // a multiple of 3: the shared-moment and Our Songs branch runs
    sendDataMessage: async (type: string) => void sent.push(type),
  } as unknown as Ctx);
  await vi.waitFor(() => {
    for (const context of [
      'unified-personality-recording',
      'bth-v4-relational-memory',
      'semantic-intelligence',
    ]) {
      const m = getFireAndForgetMetrics().byContext.find((c) => c.context === context);
      expect(m && m.successes + m.failures, context).toBe(1);
    }
  });
  const result = state.result as {
    crisis: Crisis;
    context: { injections: Array<{ category: string }> };
  };
  return {
    level: levelOf(result.crisis),
    safety: result.context.injections
      .map((i) => i.category)
      .filter((c) => c === 'crisis_response' || c === 'safety_soft_check'),
    sent,
    writes: state.writes,
    semanticReads: state.semanticReads,
  };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
  resetGroundedRelease();
});

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
    const turn = await runTurn(LONG + EVERY_MOMENT + 'and today was a good day', LIVE, NO_RISK);
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
