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
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Risk = 'none' | 'crisis' | 'imminent';
const h = vi.hoisted(() => ({
  risk: 'none' as 'none' | 'crisis' | 'imminent',
  /** Which return the routers steer the turn to. */
  route: 'full' as 'full' | 'ftis' | 'semantic',
  /** The crisis read fails: its summary rejects, or never settles. */
  readFault: null as null | 'throws' | 'hangs',
  /** A builder throws after the crisis read started. */
  builderThrows: false,
  /** A builder changes the turn's inputs mid-turn, after processTurn started. */
  builderMutates: false,
  /** The same builder also changes the session's user id and the persona. */
  builderMutatesId: false,
  /** Runs while processTurn awaits the memory response (lastSurfacedMemoryIds set). */
  duringMemoryAwait: null as null | (() => void),
  /** The correction store's write stays pending until the test releases it. */
  storeGate: null as null | Promise<void>,
  /** Correction-store writes that finished. */
  landed: 0,
  /** The classifier's model call answers, fails, never answers, or is blocked by the provider. */
  classifier: 'answers' as 'answers' | 'fails' | 'hangs' | 'blocked' | 'malformed',
  /** What the turn's crisis read showed: the patterns alone, and each bypassAllowed() answer. */
  patternSignal: [] as boolean[],
  bypass: [] as boolean[],
  /** Which routers were asked. */
  routed: [] as string[],
  writes: [] as Array<[string, ...unknown[]]>,
}));

vi.mock('../../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGeminiClient: async () => ({
    models: {
      generateContent: async () => {
        if (h.classifier === 'fails') throw new Error('model unavailable');
        if (h.classifier === 'hangs') return new Promise<never>(() => {});
        if (h.classifier === 'blocked')
          return { text: '', promptFeedback: { blockReason: 'SAFETY' } };
        if (h.classifier === 'malformed') return { text: 'not a verdict' };
        return { text: `{"risk":"${h.risk}","subject":"self"}` };
      },
    },
  }),
}));
vi.mock('../../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(async (...args: unknown[]) => {
      h.writes.push(['autoRecord', ...args]);
      if (h.storeGate) await h.storeGate;
      h.landed += 1;
      return null;
    }),
  },
}));
vi.mock(
  '../../../../intelligence/memory-intelligence/turn-processor-integration.js',
  async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    recordMemoryResponse: async () => {
      await Promise.resolve();
      h.duringMemoryAwait?.();
    },
  })
);
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
  runFTISRouting: async () => {
    h.routed.push('ftis');
    return {
      attempted: true,
      bypassLLM: true,
      toolResult: { toolId: 'getWeather', output: 'Sunny, 72.', speakableResponse: 'Sunny, 72.' },
      classification: { confidence: 0.99, fineCategory: 'weather' },
      processingTimeMs: 1,
    };
  },
}));
vi.mock('../../../../tools/semantic-router/integration/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isRoutingEnabled: () => h.route === 'semantic',
  isIntelligentRouterInitialized: () => false,
  startSemanticRouting: async () => {
    h.routed.push('semantic');
    return {
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
    };
  },
}));
vi.mock('../../identity-context-builder.js', async (orig) => {
  const real = await orig<typeof import('../../identity-context-builder.js')>();
  return {
    ...real,
    buildIdentityContext: (...args: Parameters<typeof real.buildIdentityContext>) => {
      if (h.builderThrows) throw new Error('builder failed');
      if (h.builderMutates) {
        const [ctx] = args;
        ctx.userData.lastAgentResponse = 'A reply written mid-turn.';
        ctx.userData.turnCount = 99;
        Object.assign(ctx, { userText: 'a line written mid-turn' });
      }
      if (h.builderMutatesId) {
        const [ctx] = args as unknown as [{ services: { userId?: string }; persona?: unknown }];
        ctx.services.userId = 'uid-written-mid-turn';
        ctx.persona = { id: 'persona-written-mid-turn', name: 'Other' };
      }
      return real.buildIdentityContext(...args);
    },
  };
});
vi.mock('../turn-crisis.js', async (orig) => {
  const real = await orig<typeof import('../turn-crisis.js')>();
  return {
    ...real,
    startTurnCrisis: (...args: Parameters<typeof real.startTurnCrisis>) => {
      const read = real.startTurnCrisis(...args);
      h.patternSignal.push(real.hasCrisisSignal(read.patterns));
      const turn = {
        ...read,
        bypassAllowed: async () => {
          const allowed = await read.bypassAllowed();
          h.bypass.push(allowed);
          return allowed;
        },
      };
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
const { resetClassifierBlocked } =
  await import('../../../../services/safety/crisis-classifier-blocked.js');

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

function turnCtx(
  userText: string,
  userData: Record<string, unknown>,
  session: string,
  extra: { userId?: string; lastSurfacedMemoryIds?: string[] } = {}
): Ctx {
  return {
    userText,
    userData,
    ...(extra.lastSurfacedMemoryIds && { lastSurfacedMemoryIds: extra.lastSurfacedMemoryIds }),
    services: {
      ...createMockServices(),
      sessionId: session,
      userId: extra.userId ?? 'uid-invented',
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
  h.builderMutates = false;
  h.builderMutatesId = false;
  h.duringMemoryAwait = null;
  h.storeGate = null;
  h.landed = 0;
  h.classifier = 'answers';
  h.patternSignal.length = 0;
  h.bypass.length = 0;
  h.routed.length = 0;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
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
      expect(h.routed).toEqual(route === 'full' ? [] : [route]);
      expect(h.bypass).toEqual(route === 'full' ? [] : [true]);
      expect(turn.writes.length).toBe(1);
      expect(stable(turn.writes)).toMatchSnapshot();
    }
  );

  /**
   * bypassAllowed() settles the turn's read, the live classifier verdict included, before a
   * router may answer: a line no pattern flags, read imminent by the classifier, never takes a
   * bypass return. The full return decides, and writes nothing.
   */
  it.each(['full', 'ftis', 'semantic'] as const)(
    'route %s, a line no pattern flags read imminent by the classifier: bypass refused, the full return, nothing written',
    async (route) => {
      h.route = route;
      const turn = await oneTurn(CALL[1], 'imminent');
      expect(h.patternSignal).toEqual([false]);
      expect(h.routed).toEqual(route === 'full' ? [] : [route]);
      expect(h.bypass).toEqual(route === 'full' ? [] : [false]);
      expect(crisisReadTurn(turn.result.crisis)).toBe(true);
      expect(turn.path).toBe('full');
      expect(turn.writes).toEqual([]);
    }
  );

  it('inputs changed mid-turn: the correction is the one taken as the turn began (snapshot from main)', async () => {
    h.builderMutates = true;
    const turn = await oneTurn(CALL[1], 'none');
    expect(turn.path).toBe('full');
    expect(turn.writes.length).toBe(1);
    expect(stable(turn.writes)).toMatchSnapshot();
  });

  /** Not only the snapshot: the values themselves, so a snapshot update cannot erase the pin. */
  it('the arguments are the values at turn start: user id, turn text, previous reply, persona, call', async () => {
    h.builderMutates = true;
    h.builderMutatesId = true;
    h.risk = 'none';
    const userData = {
      turnCount: 2,
      recentTranscripts: [CALL[1]],
      lastAgentResponse: REPLY,
      userId: 'uid-in-user-data',
    };
    await processTurn(turnCtx(CALL[1], userData, 'values'));
    await drain();
    // The turn did change every one of them before returning.
    expect([userData.lastAgentResponse, userData.turnCount]).toEqual([
      'A reply written mid-turn.',
      99,
    ]);
    // recordCallerCorrection(userId, callerLine, previousReply, personaId, callId): no turn count.
    expect(h.writes).toEqual([['autoRecord', 'uid-invented', CALL[1], REPLY, 'ferni']]);
  });

  /**
   * INTENDED CHANGE on ordinary turns. Main read the previous reply after the memory-response
   * await, so a reply committed during that await (agent-reply-recorder.ts sets
   * lastAgentResponse on each committed assistant item, and the turn pipeline runs beside the
   * reply) was recorded instead of the one the caller answered. The hold keeps the reply that
   * existed when the caller spoke.
   */
  it('the previous reply replaced during the memory-response await: the reply at turn start is kept (intended)', async () => {
    h.risk = 'none';
    const userData = { turnCount: 2, recentTranscripts: [CALL[1]], lastAgentResponse: REPLY };
    h.duringMemoryAwait = () => {
      userData.lastAgentResponse = 'A newer reply, committed during the memory-response await.';
    };
    await processTurn(
      turnCtx(CALL[1], userData, 'memory-await', { lastSurfacedMemoryIds: ['m1'] })
    );
    await drain();
    expect(userData.lastAgentResponse).toMatch(/^A newer reply/);
    expect(h.writes).toEqual([['autoRecord', 'uid-invented', CALL[1], REPLY, 'ferni']]);
  });

  it('the empty-text throw writes nothing', async () => {
    await expect(
      processTurn(turnCtx('   ', { lastAgentResponse: REPLY }, 'empty'))
    ).rejects.toThrow('Empty user text');
    await drain();
    expect(h.writes).toEqual([]);
  });

  it.each([undefined, null])(
    'text %s with an owner id and a previous reply: main\'s "Empty user text" error, nothing written',
    async (text) => {
      const ctx = turnCtx('x', { lastAgentResponse: REPLY }, 'no-text');
      Object.assign(ctx, { userText: text });
      await expect(processTurn(ctx)).rejects.toThrow(new Error('Empty user text'));
      await drain();
      expect(h.writes).toEqual([]);
    }
  );
});

/**
 * Every way crisisReadTurn reads a turn as a crisis turn, each beside an ordinary control under
 * the same mocks: a crisis read that does not replace the reply (isCrisis, no override), and a
 * soft check-in (a classifier read the provider blocked, CRISIS_CLASSIFIER_BLOCKED_SIGNAL on;
 * and, with every switch at its default, a lone imminent read of a goodnight).
 */
describe('a crisis turn that does not replace the reply', () => {
  it.each([
    ['crisis', true],
    ['none', false],
  ] as const)(
    'classifier reads %s: isCrisis without an override is a crisis turn (crisis turn: %s)',
    async (risk, crisisTurn) => {
      const turn = await oneTurn(CALL[1], risk);
      expect(h.patternSignal).toEqual([false]);
      expect(turn.result.crisis).toMatchObject({ isCrisis: crisisTurn, shouldOverrideLLM: false });
      expect(turn.result.crisis?.softCheck).toBeUndefined();
      expect(turn.writes.length).toBe(crisisTurn ? 0 : 1);
    }
  );

  /** A line the patterns read as a crisis that does not replace the reply (invented). */
  const PATTERN_CRISIS = 'sometimes I wish I could just disappear for a while';
  it.each(['answers', 'fails', 'hangs', 'malformed'] as const)(
    'a pattern crisis line, classifier %s: isCrisis without an override, nothing written',
    async (mode) => {
      vi.stubEnv('CRISIS_CLASSIFIER_TIMEOUT_MS', '100');
      h.classifier = mode;
      const turn = await oneTurn(PATTERN_CRISIS, 'crisis');
      expect(h.patternSignal).toEqual([true]);
      expect(turn.result.crisis).toMatchObject({ isCrisis: true, shouldOverrideLLM: false });
      expect(turn.result.crisis?.softCheck).toBeUndefined();
      expect(turn.writes).toEqual([]);
    }
  );

  it.each([
    ['on', true],
    ['off', false],
  ] as const)(
    'a blocked classifier read, blocked signal %s: a soft check-in is a crisis turn (soft: %s)',
    async (signal, soft) => {
      vi.stubEnv('CRISIS_CLASSIFIER_BLOCKED_SIGNAL', signal);
      h.classifier = 'blocked';
      const turn = await oneTurn(CALL[1], 'none');
      expect(h.patternSignal).toEqual([false]);
      expect(turn.result.crisis).toMatchObject({ isCrisis: false, shouldOverrideLLM: false });
      expect(turn.result.crisis?.softCheck === true).toBe(soft);
      expect(turn.writes.length).toBe(soft ? 0 : 1);
    }
  );

  /**
   * The soft check-in a live call gets with every switch at its default: a lone imminent read
   * of a plain goodnight on a quiet call (turn-crisis.ts, loneImminentGoodbye). The control is
   * the same goodnight read as none, which is ordinary and writes.
   */
  it.each([
    ['imminent', true],
    ['none', false],
  ] as const)(
    'a quiet call, then a goodnight the classifier reads %s: a soft check-in is a crisis turn (soft: %s)',
    async (risk, soft) => {
      h.risk = risk;
      const quiet = [
        'we finally got the couch up the stairs',
        'the new place gets a lot of morning light',
        'my neighbor brought over some cookies',
      ];
      const line = 'okay, goodnight, talk to you tomorrow';
      const userData = {
        turnCount: quiet.length + 1,
        recentTranscripts: [...quiet, line],
        lastAgentResponse: REPLY,
      };
      const result = await processTurn(turnCtx(line, userData, `goodnight-${risk}`));
      await drain();
      expect(h.patternSignal).toEqual([false]);
      expect(result.crisis).toMatchObject({ isCrisis: false, shouldOverrideLLM: false });
      expect(result.crisis?.softCheck === true).toBe(soft);
      expect(h.writes.length).toBe(soft ? 0 : 1);
    }
  );
});

/** ownerWriteId (services/identity/owner-write-gate.ts): nothing is stored under these ids. */
describe('ids nothing is written under', () => {
  it.each([
    ['device:demo_invented', 0],
    ['onbehalf:call-invented', 0],
    ['uid-invented', 1],
  ] as const)('ordinary read, user id %s: %i writes', async (userId, count) => {
    const result = await processTurn(
      turnCtx(
        CALL[1],
        { turnCount: 2, recentTranscripts: [CALL[1]], lastAgentResponse: REPLY },
        `id-${userId}`,
        { userId }
      )
    );
    await drain();
    expect(crisisReadTurn(result.crisis)).toBe(false);
    expect(h.writes.length).toBe(count);
  });
});

/** The write is fire-and-forget: processTurn returns while the store write is still pending. */
describe('off the reply path', () => {
  it('a store write that never finishes does not hold the turn; it lands once released', async () => {
    let release = (): void => {};
    h.storeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timedOut = Symbol('timed out');
    const returned = await Promise.race([
      oneTurn(CALL[1], 'none'),
      drain(5_000).then(() => timedOut),
    ]);
    expect(returned).not.toBe(timedOut);
    // The store was called, and its write had not finished when the turn returned.
    expect(h.writes.map((w) => w.slice(0, 3))).toEqual([['autoRecord', 'uid-invented', CALL[1]]]);
    expect(h.landed).toBe(0);
    release();
    await drain(50);
    expect(h.landed).toBe(1);
  }, 10_000);
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

  /** Intended change: main started the write before this throw and wrote 1; now nothing. */
  it('processTurn throws after the read started, before any return: nothing written (intended; main wrote 1)', async () => {
    h.builderThrows = true;
    await expect(oneTurn(CALL[1], 'none')).rejects.toThrow('builder failed');
    await drain();
    expect(h.writes).toEqual([]);
  });

  it('a returned turn with no crisis field writes nothing; an ordinary field writes', async () => {
    const { heldCallerCorrection } = await import('../caller-correction-crisis-hold.js');
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

/**
 * KNOWN GAP (not changed here): a classifier that gives no answer is indistinguishable from an
 * ordinary read. A timeout, an error or an unusable reply resolves the verdict to null
 * (services/safety/crisis-classifier.ts), a null verdict leaves the patterns as they are
 * (crisis-classifier-verdict.ts), and the settled read carries no mark of the missing answer.
 * So a line no pattern flags, whose classifier read never came, writes its correction and may
 * take a bypass return, as on main.
 */
describe('known gap: the classifier gives no answer', () => {
  it.each(['fails', 'hangs'] as const)(
    'known gap: model call %s on a line no pattern flags: read as ordinary, 1 write as on main',
    async (mode) => {
      vi.stubEnv('CRISIS_CLASSIFIER_TIMEOUT_MS', '100');
      h.classifier = mode;
      const turn = await oneTurn(CALL[1], 'imminent');
      expect(h.patternSignal).toEqual([false]);
      expect(crisisReadTurn(turn.result.crisis)).toBe(false);
      expect(turn.writes.map((w) => w.slice(0, 3))).toEqual([
        ['autoRecord', 'uid-invented', CALL[1]],
      ]);
    }
  );

  it('known gap: model call never answers on the FTIS route: the bypass return, 1 write', async () => {
    vi.stubEnv('CRISIS_CLASSIFIER_TIMEOUT_MS', '100');
    h.classifier = 'hangs';
    h.route = 'ftis';
    const turn = await oneTurn(CALL[1], 'imminent');
    expect(h.bypass).toEqual([true]);
    expect(turn.path).toBe('ftis-bypass');
    expect(turn.writes.map((w) => w.slice(0, 3))).toEqual([
      ['autoRecord', 'uid-invented', CALL[1]],
    ]);
  });
});

/** A new return path writes nothing until it is wrapped; this row says so when it is added. */
describe('the shape of processTurn', () => {
  /** Each top-level return of processTurn: 'wrapped' when its expression IS withCorrection(x). */
  function returnShapes(source: string): string[] {
    const file = ts.createSourceFile('process-turn.ts', source, ts.ScriptTarget.Latest, true);
    const fn = file.statements.find(
      (st): st is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(st) && st.name?.text === 'processTurn'
    );
    const shapes: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) return; // a nested function's returns are its own
      if (ts.isReturnStatement(node)) {
        const e = node.expression;
        const wrapped =
          !!e &&
          ts.isCallExpression(e) &&
          ts.isIdentifier(e.expression) &&
          e.expression.text === 'withCorrection' &&
          e.arguments.length === 1;
        shapes.push(wrapped ? 'wrapped' : (e?.getText(file) ?? '<bare return>'));
      }
      ts.forEachChild(node, visit);
    };
    fn?.body?.statements.forEach(visit);
    return shapes;
  }

  it('every return of processTurn is exactly withCorrection(result)', () => {
    const source = readFileSync(new URL('../process-turn.ts', import.meta.url), 'utf8');
    expect(returnShapes(source)).toEqual(['wrapped', 'wrapped', 'wrapped']);
  });

  it('the check is exact: a return that only contains the call is caught', () => {
    const planted = (body: string) =>
      returnShapes(`export async function processTurn() { ${body} }`);
    expect(planted('return withCorrection(a);')).toEqual(['wrapped']);
    expect(planted('return withCorrection(a) && b;')).toEqual(['withCorrection(a) && b']);
    expect(planted('return other(withCorrection(a));')).toEqual(['other(withCorrection(a))']);
    expect(planted('return withCorrection;')).toEqual(['withCorrection']);
    expect(planted('return;')).toEqual(['<bare return>']);
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
 * KNOWN GAP, closed by the follow-up "recorder 5 uses the per-turn verdict". processTurn runs
 * once per final segment of a caller turn, on the text so far. When the first segment alone
 * reads ordinary and the second makes the turn a crisis turn, the first segment's run has
 * already returned an ordinary read and written its correction (main wrote for both). This row
 * pins the one write that remains; that follow-up flips its last assertion to `[]`.
 */
describe('two-segment turn (known gap)', () => {
  it("known gap: segment 1 reads ordinary and writes; segment 2's crisis turn writes nothing more", async () => {
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
