/**
 * A crisis turn records no correction. processTurn started recordCallerCorrection as the turn
 * began, before the crisis read was back, and read neither the read nor the turn's crisis
 * field: an invented 10-turn call with the classifier reading every turn as imminent wrote 9
 * corrections, as many as the same call read as ordinary. Now the correction is taken as the
 * turn starts and written only once processTurn returns a crisis field that crisisReadTurn
 * (voice-agent/crisis-turn-memory.ts) reads as ordinary; a turn that throws, or whose read
 * never comes back, writes nothing.
 *
 * The real processTurn runs. Stubbed at the edges only: the classifier's model call
 * (getGeminiClient), the correction store (userCorrections.autoRecord), FRIEND_REPAIR's
 * Firestore store, the dispute writer, and the routers that pick a bypass return. The turn's
 * crisis read is wrapped only to make it fail or hang. All lines invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Risk = 'none' | 'imminent';
const h = vi.hoisted(() => ({
  risk: 'none' as 'none' | 'imminent',
  /** Which return the routers steer the turn to. */
  route: 'full' as 'full' | 'ftis' | 'semantic',
  /** The crisis read fails: its summary rejects, or never settles. */
  readFault: null as null | 'throws' | 'hangs',
  /** A builder throws after the crisis read started. */
  builderThrows: false,
  writes: [] as Array<[string, ...unknown[]]>,
}));

vi.mock('../../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGeminiClient: async () => ({
    models: { generateContent: async () => ({ text: `{"risk":"${h.risk}","subject":"self"}` }) },
  }),
}));
vi.mock('../../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(async (...args: unknown[]) => {
      h.writes.push(['autoRecord', ...args]);
      return null;
    }),
  },
}));
vi.mock('../../../personas/friend-repair-store.js', () => ({
  firestoreRepairStore: {
    facts: async () => [
      { id: 'f1', entityName: 'sister', key: 'lives_in', value: 'Denver', extractedAt: '' },
    ],
    add: async (...args: unknown[]) => {
      h.writes.push(['repair.add', ...args]);
      return 'c1';
    },
    retire: async (...args: unknown[]) => {
      h.writes.push(['repair.retire', ...args]);
    },
    recent: async () => [],
  },
}));
vi.mock('../../../../memory/recall/dispute.js', () => ({
  disputeForCaller: async (...args: unknown[]) => {
    h.writes.push(['dispute', ...args.slice(0, 3)]);
    return { kind: 'nothing' };
  },
}));
vi.mock('../../../../memory/storage/dispute-store.js', () => ({ firestoreDisputeStore: {} }));
vi.mock('../../../../config/tool-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isFtisEnabled: () => h.route === 'ftis',
}));
vi.mock('../../tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: async () => ({
    attempted: true,
    bypassLLM: true,
    toolResult: { toolId: 'getWeather', output: 'Sunny, 72.', speakableResponse: 'Sunny, 72.' },
    classification: { confidence: 0.99, fineCategory: 'weather' },
    processingTimeMs: 1,
  }),
}));
vi.mock('../../../../tools/semantic-router/integration/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isRoutingEnabled: () => h.route === 'semantic',
  isIntelligentRouterInitialized: () => false,
  startSemanticRouting: async () => ({
    attempted: true,
    executed: true,
    output: 'Sunny, 72.',
    routeResult: {
      matches: [
        {
          toolId: 'getWeather',
          confidence: 0.99,
          layerScores: { pattern: 0.99, keyword: 0, embedding: 0 },
        },
      ],
    },
  }),
}));
vi.mock('../../identity-context-builder.js', async (orig) => {
  const real = await orig<typeof import('../../identity-context-builder.js')>();
  return {
    ...real,
    buildIdentityContext: (...args: Parameters<typeof real.buildIdentityContext>) => {
      if (h.builderThrows) throw new Error('builder failed');
      return real.buildIdentityContext(...args);
    },
  };
});
vi.mock('../turn-crisis.js', async (orig) => {
  const real = await orig<typeof import('../turn-crisis.js')>();
  return {
    ...real,
    startTurnCrisis: (...args: Parameters<typeof real.startTurnCrisis>) => {
      const turn = real.startTurnCrisis(...args);
      if (h.readFault === 'throws')
        return { ...turn, summary: () => Promise.reject(new Error('x')) };
      if (h.readFault === 'hangs') return { ...turn, summary: () => new Promise<never>(() => {}) };
      return turn;
    },
  };
});

import { createMockServices } from '../../__tests__/test-utils.js';

const { processTurn } = await import('../process-turn.js');
const { crisisReadTurn } = await import('../../../voice-agent/crisis-turn-memory.js');
const { resetCrisisClassifierCache } =
  await import('../../../../services/safety/crisis-classifier.js');
const { resetCrisisCallRisk } = await import('../../../../services/safety/crisis-call-risk.js');
const { resetCallRiskSnapshots } =
  await import('../../../../services/safety/crisis-lone-imminent.js');

type Ctx = Parameters<typeof processTurn>[0];
type Result = Awaited<ReturnType<typeof processTurn>>;

const REPLY = 'That sounds like a full day. What was the best part of it?';
const SISTER = 'So your sister in Denver is getting married, that is huge.';
const BROTHER = "Ha, no, it's my brother in Denver, not my sister.";
const CALL = [
  'hey, it is good to hear your voice again',
  'work was long today, lots of meetings',
  'I made pasta for dinner, the garlic kind',
  'my cousin called and we talked about her trip',
  'the dog wanted a second walk tonight',
  'I am thinking about repainting the kitchen',
  'we watched an old movie after dinner',
  'tomorrow I have a dentist appointment',
  'the weather has been nice this week',
  'anyway, tell me something good',
];

function turnCtx(userText: string, userData: Record<string, unknown>, session: string): Ctx {
  return {
    userText,
    userData,
    services: {
      ...createMockServices(),
      sessionId: session,
      userId: 'uid-invented',
      recordResponseSignal: () => undefined,
      getPromptContext: () => ({ phase: 'building' }),
      handoffState: { currentAgent: 'ferni' },
    },
    persona: { id: 'ferni', name: 'Ferni' },
    contextOnly: h.route === 'full',
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  } as unknown as Ctx;
}

/** Fire-and-forget writes land well inside this; the ordinary tests prove it with exact counts. */
const drain = (ms = 150) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Which return of processTurn the result came from. */
function returnPath(result: Result): 'full' | 'ftis-bypass' | 'short-circuit' {
  if ('resonanceCheck' in result) return 'full';
  if (result.response.length?.guidance?.includes('FTIS')) return 'ftis-bypass';
  return 'short-circuit';
}

/** One turn after a reply, then the writes it made. */
async function oneTurn(line: string, risk: Risk, previous = REPLY) {
  h.risk = risk;
  const result = await processTurn(
    turnCtx(
      line,
      { turnCount: 2, recentTranscripts: [line], lastAgentResponse: previous },
      `turn-${h.route}-${risk}`
    )
  );
  await drain();
  return { result, path: returnPath(result), writes: [...h.writes] };
}

/** Snapshot form: the FRIEND_REPAIR record's clock time is the only moving part. */
const stable = (writes: unknown[]): unknown =>
  JSON.parse(JSON.stringify(writes).replace(/"\d{4}-\d\d-\d\dT[\d:.]+Z"/g, '"<at>"'));

beforeEach(() => {
  h.writes.length = 0;
  h.risk = 'none';
  h.route = 'full';
  h.readFault = null;
  h.builderThrows = false;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'live');
  vi.stubEnv('CRISIS_GUARD_MODE', 'live');
});
afterEach(() => vi.unstubAllEnvs());

describe('an invented 10-turn call', () => {
  async function call(risk: Risk): Promise<boolean[]> {
    h.risk = risk;
    const userData: Record<string, unknown> = { turnCount: 0, recentTranscripts: [] };
    const reads: boolean[] = [];
    for (const line of CALL) {
      resetCrisisClassifierCache();
      userData.turnCount = (userData.turnCount as number) + 1;
      (userData.recentTranscripts as string[]).push(line);
      const result = await processTurn(turnCtx(line, userData, `call-${risk}`));
      reads.push(crisisReadTurn(result.crisis));
      userData.lastAgentResponse = REPLY;
    }
    await drain();
    return reads;
  }

  it('read as imminent on every turn: no correction written', async () => {
    expect(await call('imminent')).toEqual(Array(10).fill(true));
    expect(h.writes).toEqual([]);
  }, 60_000);

  it('read as ordinary: the same 9 corrections as before (snapshot from main)', async () => {
    expect(await call('none')).toEqual(Array(10).fill(false));
    expect(h.writes.length).toBe(9);
    expect(stable(h.writes)).toMatchSnapshot();
  }, 60_000);
});

describe('every return of processTurn', () => {
  it.each([
    ['full', 'full'],
    ['ftis', 'ftis-bypass'],
    ['semantic', 'short-circuit'],
  ] as const)(
    'route %s, ordinary read: returns by %s and writes as before',
    async (route, path) => {
      h.route = route;
      const turn = await oneTurn(CALL[1], 'none');
      expect(turn.path).toBe(path);
      expect(turn.writes.length).toBe(1);
      expect(stable(turn.writes)).toMatchSnapshot();
    }
  );

  it.each(['full', 'ftis', 'semantic'] as const)(
    'route %s, crisis read: no bypass, the full return, nothing written',
    async (route) => {
      h.route = route;
      const turn = await oneTurn(CALL[1], 'imminent');
      expect(crisisReadTurn(turn.result.crisis)).toBe(true);
      expect(turn.path).toBe('full');
      expect(turn.writes).toEqual([]);
    }
  );

  it('the empty-text throw writes nothing', async () => {
    await expect(
      processTurn(turnCtx('   ', { lastAgentResponse: REPLY }, 'empty'))
    ).rejects.toThrow('Empty user text');
    await drain();
    expect(h.writes).toEqual([]);
  });
});

describe('no read: nothing written (fail closed)', () => {
  it('the crisis read rejects: processTurn rejects, nothing written', async () => {
    h.readFault = 'throws';
    await expect(oneTurn(CALL[1], 'none')).rejects.toThrow();
    await drain();
    expect(h.writes).toEqual([]);
  });

  it('the crisis read never settles: processTurn never returns, nothing written', async () => {
    h.readFault = 'hangs';
    const settled = vi.fn();
    void processTurn(
      turnCtx(
        CALL[1],
        { turnCount: 2, recentTranscripts: [CALL[1]], lastAgentResponse: REPLY },
        'hangs'
      )
    ).then(settled, settled);
    await drain(1_000);
    expect(settled).not.toHaveBeenCalled();
    expect(h.writes).toEqual([]);
  });

  it('processTurn throws after the read started, before any return: nothing written', async () => {
    h.builderThrows = true;
    await expect(oneTurn(CALL[1], 'none')).rejects.toThrow('builder failed');
    await drain();
    expect(h.writes).toEqual([]);
  });

  it('a returned turn with no crisis field writes nothing; an ordinary field writes', async () => {
    const { heldCallerCorrection } = await import('../caller-correction-hold.js');
    const ctx = turnCtx(CALL[1], { lastAgentResponse: REPLY }, 'no-field');
    const turn = { analysis: {}, context: {}, emotional: {}, response: {}, identity: {} };
    heldCallerCorrection(ctx)(turn as unknown as Result);
    await drain();
    expect(h.writes).toEqual([]);
    const ordinary = { isCrisis: false, severity: 0, indicators: [], shouldOverrideLLM: false };
    heldCallerCorrection(ctx)({ ...turn, crisis: ordinary } as unknown as Result);
    await drain();
    expect(h.writes.map((w) => w.slice(0, 3))).toEqual([['autoRecord', 'uid-invented', CALL[1]]]);
  });
});

describe('FRIEND_REPAIR and DISPUTE_DENIED_FACTS on', () => {
  beforeEach(() => {
    vi.stubEnv('FRIEND_REPAIR', 'on');
    vi.stubEnv('DISPUTE_DENIED_FACTS', 'on');
  });

  it('crisis read: keeps no `said`, retires no fact, records and disputes nothing', async () => {
    const turn = await oneTurn(BROTHER, 'imminent', SISTER);
    expect(crisisReadTurn(turn.result.crisis)).toBe(true);
    expect(turn.writes).toEqual([]);
  });

  it('ordinary read: keeps the correction and retires the fact, as before', async () => {
    const turn = await oneTurn(BROTHER, 'none', SISTER);
    expect(turn.writes.map(([kind]) => kind)).toEqual([
      'repair.add',
      'repair.retire',
      'autoRecord',
      'dispute',
    ]);
    expect(stable(turn.writes)).toMatchSnapshot();
  });
});

/**
 * NOT COVERED: processTurn runs once per final segment of a caller turn, on the text so far.
 * When the first segment alone reads ordinary and the second makes the turn a crisis turn, the
 * first segment's run has already returned an ordinary read and written its correction. (Before
 * this change both segments wrote.) A per-turn verdict closes this; until then this test pins
 * the one write that remains, so the change shows when it lands.
 */
describe('two-segment turn (residual, not covered)', () => {
  it("segment 1 reads ordinary and writes; segment 2's crisis turn writes nothing more", async () => {
    const userData: Record<string, unknown> = { turnCount: 2, lastAgentResponse: REPLY };
    const first = 'work was long today';
    const whole = `${first} and I keep thinking about the meeting`;
    h.risk = 'none';
    userData.recentTranscripts = [first];
    const one = await processTurn(turnCtx(first, userData, 'two-segment'));
    resetCrisisClassifierCache();
    h.risk = 'imminent';
    userData.recentTranscripts = [whole];
    const two = await processTurn(turnCtx(whole, userData, 'two-segment'));
    await drain();
    expect([crisisReadTurn(one.crisis), crisisReadTurn(two.crisis)]).toEqual([false, true]);
    expect(h.writes.map((w) => w.slice(0, 3))).toEqual([['autoRecord', 'uid-invented', first]]);
  });
});
