/**
 * The caller-correction crisis hold (caller-correction-crisis-hold.ts) under the crisis read's
 * non-default flags. The hold reads only the turn result's crisis field (crisisReadTurn); with
 * the agreement gate on or the adjudicator not off, the turn's read also waits on, or is decided
 * by, the turn's other reads (turn-crisis.ts: turnVerdicts, agreementOutcome,
 * adjudicatedCheckin). Each row names its flag state:
 *
 *   D1  every crisis flag at its default: a classifier-only crisis read is held, an ordinary read
 *       writes (the positive control, under the same mocks as every row below).
 *   G1  CRISIS_AGREEMENT_GATE=on: a classifier-only crisis read escalates, held; control writes.
 *   G2  CRISIS_AGREEMENT_GATE=on: a short question back made of Ferni's own words is a soft
 *       check-in, held; control writes.
 *   G3  CRISIS_AGREEMENT_GATE=on: a bare presence reply or call to Ferni, read as crisis by the
 *       classifier, is eased: the turn records as an ordinary turn. A NAMED PIN of current
 *       behaviour, not a claim that it is right: whether a gate-eased turn counts as crisis for
 *       the hold is policy with the owner; a ruling of "held" is its own crisis-lane production
 *       PR, where this row flips. Beside it, the same lines with the gate off are held.
 *   A1  CRISIS_ADJUDICATOR=shadow: a classifier-only crisis read, held; the adjudicator is asked
 *       once and the turn does not wait for it.
 *   A2  CRISIS_ADJUDICATOR=live WITH the tests-only switch (allowCrisisAdjudicatorLiveForTests):
 *       checkin = soft, held; escalate, fails, no answer = held; control writes.
 *   A3  CRISIS_ADJUDICATOR=live WITHOUT the switch: runs as shadow, held.
 *   L1  CRISIS_AGREEMENT_GATE=on + CRISIS_ADJUDICATOR=live (switch): the read lands after the
 *       correction was taken; processTurn does not return before it lands, and nothing is
 *       written before or after.
 *   E1  CRISIS_CLASSIFIER_ONLY_CHECKIN=live WITHOUT the switch (held mode): with no scope no
 *       easing read starts; with a scope (adjudicator shadow) it starts and changes nothing.
 *   H1  Through the real turn hook (createTurnIntelligenceHook), gate off and on: the hook hands
 *       processTurn Ferni's previous reply only with the gate on
 *       (multi-agent/turn-intelligence.ts:155-160), so with it off nothing is recorded; with it
 *       on, a crisis read is held and an ordinary read writes. The handler stand-in builds the
 *       turn context field for field as voice-agent/turn-handler.ts:555-564 does.
 *
 * Every other row calls processTurn directly with userData.lastAgentResponse set.
 *
 * Not covered here: the live classifier-only easing read (CRISIS_CLASSIFIER_ONLY_CHECKIN=live
 * with the switch); its reply is the easing-facts extraction (crisis-classifier-only-live.ts,
 * readEasingFacts). The scripted-imminent read (CRISIS_SCRIPT_IMMINENT_READ) is not reachable
 * from these rows: its only caller is the reply gate (agents/personas/crisis-gate.ts:217), which
 * neither processTurn nor the turn hook calls.
 *
 * Stubbed at the edges only: the model client (getGeminiClient), which answers each reader by
 * its own request shape and counts it; fetch, which throws and counts; and the correction store
 * (a recording mock: one "write" below is one autoRecord CALL, not a stored correction). All
 * lines invented.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Risk = 'none' | 'crisis' | 'imminent';
type Answer = 'checkin' | 'escalate' | 'fails' | 'hangs';
type Reader = 'classifier' | 'who' | 'afterCheck' | 'grounded' | 'adjudicator' | 'easing' | 'other';
const h = vi.hoisted(() => ({
  risk: 'none' as 'none' | 'crisis' | 'imminent',
  /** What the adjudicator's model call answers. */
  adjudicator: 'escalate' as 'checkin' | 'escalate' | 'fails' | 'hangs',
  /** The adjudicator's answer waits for this when set. */
  adjudicatorGate: null as null | Promise<void>,
  /** Model calls per reader, told apart by request shape (maxOutputTokens, then the prompt). */
  calls: {} as Record<string, number>,
  fetches: 0,
  writes: [] as Array<[string, ...unknown[]]>,
  /** parseAdjudicatorReply: a checkin needs high confidence and no caller risk quoted. */
  replies: {
    checkin: '{"decision":"checkin","confidence":"high","caller_risk":""}',
    escalate: '{"decision":"escalate","confidence":"high","caller_risk":""}',
  },
}));

/** 60: the classifier's generate, also used by the who read and the after-check read (by prompt). */
function readerOf(req: { config?: { maxOutputTokens?: number; systemInstruction?: unknown } }) {
  const tokens = req?.config?.maxOutputTokens;
  const prompt = String(req?.config?.systemInstruction ?? '');
  if (tokens === 120) return 'adjudicator';
  if (tokens === 400) return 'easing';
  if (tokens === 256) return 'grounded';
  if (tokens !== 60) return 'other';
  if (prompt.startsWith('You decide WHO')) return 'who';
  if (prompt.startsWith('You re-check one turn')) return 'afterCheck';
  return 'classifier';
}

vi.mock('../../../../config/gemini-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGeminiClient: async () => ({
    models: {
      generateContent: async (req: Parameters<typeof readerOf>[0]) => {
        const reader = readerOf(req);
        h.calls[reader] = (h.calls[reader] ?? 0) + 1;
        if (reader === 'adjudicator') {
          if (h.adjudicatorGate) await h.adjudicatorGate;
          if (h.adjudicator === 'fails') throw new Error('model unavailable');
          if (h.adjudicator === 'hangs') return new Promise<never>(() => {});
          return { text: h.replies[h.adjudicator] };
        }
        if (reader !== 'classifier') return { text: '' };
        return { text: `{"risk":"${h.risk}","subject":"self"}` };
      },
    },
  }),
}));
/** A recording mock: a "write" below is one autoRecord CALL, not a stored correction. */
vi.mock('../../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(async (...args: unknown[]) => {
      h.writes.push(['autoRecord', ...args]);
      return null;
    }),
  },
}));
vi.mock('../../../../config/tool-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isFtisEnabled: () => false,
}));
vi.mock('../../../../tools/semantic-router/integration/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isRoutingEnabled: () => false,
  isIntelligentRouterInitialized: () => false,
}));

import { createMockServices } from '../../__tests__/test-utils.js';

const { processTurn } = await import('../process-turn.js');
const { createTurnIntelligenceHook } = await import('../../../multi-agent/turn-intelligence.js');
const { resetCrisisClassifierCache } =
  await import('../../../../services/safety/crisis-classifier.js');
const { resetCrisisCallRisk } = await import('../../../../services/safety/crisis-call-risk.js');
const { resetCallRiskSnapshots } =
  await import('../../../../services/safety/crisis-lone-imminent.js');
const { resetClassifierBlocked } =
  await import('../../../../services/safety/crisis-classifier-blocked.js');
const { allowCrisisAdjudicatorLiveForTests, resetCrisisAdjudicatorCache } =
  await import('../../../../services/safety/crisis-adjudicator.js');
const { resetEasingReads } =
  await import('../../../../services/safety/crisis-classifier-only-live.js');

type Ctx = Parameters<typeof processTurn>[0];
type Result = Awaited<ReturnType<typeof processTurn>>;
type HookDeps = Parameters<typeof createTurnIntelligenceHook>[0];

const REPLY = 'That sounds like a full day. What was the best part of it?';
const EARLIER = 'work was long today, lots of meetings';
/** No pattern risk; the classifier is told what to read. */
const ORDINARY = 'I made pasta for dinner, the garlic kind';
/** A short question back made only of Ferni's words and function words (agreementOutcome 'soft'). */
const QUESTION_BACK = 'what was the best part?';
const STILL_THERE = 'Are you still there?';
const logger = { info: () => undefined, warn: () => undefined, debug: () => undefined };

function services(session: string) {
  return {
    ...createMockServices(),
    sessionId: session,
    userId: 'uid-invented',
    recordResponseSignal: () => undefined,
    getPromptContext: () => ({ phase: 'building' }),
    handoffState: { currentAgent: 'ferni' },
  };
}

const persona = { id: 'ferni', name: 'Ferni' };
const writes = () => h.writes.filter((w) => w[0] === 'autoRecord').length;
const drain = (ms = 150) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** One turn after Ferni's line, with an earlier caller line so the adjudicator can judge it. */
function start(
  line: string,
  risk: Risk,
  previous = REPLY,
  history = [EARLIER, line]
): Promise<Result> {
  h.risk = risk;
  const userData = { turnCount: 3, recentTranscripts: history, lastAgentResponse: previous };
  return processTurn({
    userText: line,
    userData,
    services: services(`flags-${risk}-${line.length}`),
    persona,
    contextOnly: true,
    turnCtx: { addMessage: () => undefined, items: [] },
    logger,
  } as unknown as Ctx);
}

async function oneTurn(line: string, risk: Risk, previous = REPLY, history?: string[]) {
  const result = await start(line, risk, previous, history);
  await drain();
  return { crisis: result.crisis, writes: writes() };
}

/** Model calls per reader, as literals; no reader not named here was asked, and no fetch. */
function expectReads(expected: Partial<Record<Reader, number>>): void {
  expect(h.calls).toEqual(expected);
  expect(h.fetches).toBe(0);
}

beforeEach(() => {
  h.writes.length = 0;
  h.risk = 'none';
  h.adjudicator = 'escalate';
  h.adjudicatorGate = null;
  h.calls = {};
  h.fetches = 0;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
  resetCrisisAdjudicatorCache();
  resetEasingReads();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      h.fetches += 1;
      throw new Error('no network in this test');
    })
  );
  vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'live');
  vi.stubEnv('CRISIS_GUARD_MODE', 'live');
});
afterEach(() => {
  allowCrisisAdjudicatorLiveForTests(false);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('every crisis flag at its default (positive control)', () => {
  it.each([
    ['crisis', 0],
    ['none', 1],
  ] as const)('D1 classifier-only %s read: writes %i', async (risk, count) => {
    const turn = await oneTurn(ORDINARY, risk);
    expect(turn.crisis).toMatchObject({ isCrisis: risk === 'crisis', shouldOverrideLLM: false });
    expect(turn.writes).toBe(count);
    expectReads({ classifier: 1 });
  });
});

describe('CRISIS_AGREEMENT_GATE=on', () => {
  beforeEach(() => vi.stubEnv('CRISIS_AGREEMENT_GATE', 'on'));

  it.each([
    ['crisis', 0],
    ['none', 1],
  ] as const)('G1 classifier-only %s read: escalates, writes %i', async (risk, count) => {
    const turn = await oneTurn(ORDINARY, risk);
    expect(turn.crisis).toMatchObject({ isCrisis: risk === 'crisis', shouldOverrideLLM: false });
    expect(turn.writes).toBe(count);
    expectReads({ classifier: 1 });
  });

  it.each([
    ['crisis', true, 0],
    ['none', false, 1],
  ] as const)(
    'G2 a question back read %s: a soft check-in is held (soft: %s, writes %i)',
    async (risk, soft, count) => {
      const turn = await oneTurn(QUESTION_BACK, risk);
      expect(turn.crisis).toMatchObject({ isCrisis: false, shouldOverrideLLM: false });
      expect(turn.crisis?.softCheck === true).toBe(soft);
      expect(turn.writes).toBe(count);
      expectReads({ classifier: 1 });
    }
  );

  it.each([
    ["yeah, I'm still here", STILL_THERE],
    ['Ferni?', REPLY],
  ])(
    'G3 NAMED PIN, policy with the owner: "%s" read as crisis is eased and records as an ordinary turn (one autoRecord call; the mock stores nothing)',
    async (line, previous) => {
      const turn = await oneTurn(line, 'crisis', previous);
      expect(turn.crisis).toMatchObject({ isCrisis: false, shouldOverrideLLM: false });
      expect(turn.crisis?.softCheck).toBeUndefined();
      expect(turn.writes).toBe(1);
      expectReads({ classifier: 1 });
    }
  );
});

describe('G3 beside it: the same lines with the gate off', () => {
  it.each([
    ["yeah, I'm still here", STILL_THERE],
    ['Ferni?', REPLY],
  ])('"%s" read as crisis: a crisis turn, nothing written', async (line, previous) => {
    const turn = await oneTurn(line, 'crisis', previous);
    expect(turn.crisis).toMatchObject({ isCrisis: true });
    expect(turn.writes).toBe(0);
    expectReads({ classifier: 1 });
  });
});

describe('CRISIS_ADJUDICATOR=shadow', () => {
  beforeEach(() => vi.stubEnv('CRISIS_ADJUDICATOR', 'shadow'));

  it('A1 classifier-only crisis: held, the adjudicator asked once, the turn does not wait', async () => {
    let release = (): void => undefined;
    h.adjudicatorGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.adjudicator = 'checkin';
    const result = await start(ORDINARY, 'crisis'); // returns while the adjudicator is held
    await drain();
    expect(result.crisis).toMatchObject({ isCrisis: true });
    expect(result.crisis?.softCheck).toBeUndefined(); // a shadow checkin changes nothing
    release();
    await drain();
    expect(writes()).toBe(0);
    expectReads({ classifier: 1, adjudicator: 1 });
  });

  it('A1 control: an ordinary read asks no adjudicator and writes', async () => {
    const turn = await oneTurn(ORDINARY, 'none');
    expect(turn.writes).toBe(1);
    expectReads({ classifier: 1 });
  });
});

describe('CRISIS_ADJUDICATOR=live with the tests-only switch', () => {
  beforeEach(() => {
    vi.stubEnv('CRISIS_ADJUDICATOR', 'live');
    vi.stubEnv('CRISIS_ADJUDICATOR_TIMEOUT_MS', '100');
    allowCrisisAdjudicatorLiveForTests(true);
  });

  it.each([
    ['checkin', true],
    ['escalate', false],
    ['fails', false],
    ['hangs', false],
  ] as const satisfies ReadonlyArray<readonly [Answer, boolean]>)(
    'A2 adjudicator %s: held (soft: %s)',
    async (answer, soft) => {
      h.adjudicator = answer;
      const turn = await oneTurn(ORDINARY, 'crisis');
      expect(turn.crisis?.softCheck === true).toBe(soft);
      expect(turn.crisis?.isCrisis).toBe(!soft);
      expect(turn.writes).toBe(0);
      expectReads({ classifier: 1, adjudicator: 1 });
    }
  );

  it('A2 control: an ordinary read asks no adjudicator and writes', async () => {
    const turn = await oneTurn(ORDINARY, 'none');
    expect(turn.writes).toBe(1);
    expectReads({ classifier: 1 });
  });
});

describe('CRISIS_ADJUDICATOR=live without the switch', () => {
  it('A3 runs as shadow: a checkin changes nothing, held', async () => {
    vi.stubEnv('CRISIS_ADJUDICATOR', 'live');
    h.adjudicator = 'checkin';
    const turn = await oneTurn(ORDINARY, 'crisis');
    expect(turn.crisis).toMatchObject({ isCrisis: true });
    expect(turn.crisis?.softCheck).toBeUndefined();
    expect(turn.writes).toBe(0);
    expectReads({ classifier: 1, adjudicator: 1 });
  });
});

describe('the read lands after the correction was taken', () => {
  it.each(['checkin', 'escalate'] as const)(
    'L1 gate on + adjudicator live (switch), adjudicator %s late: no return before it, nothing written',
    async (answer) => {
      vi.stubEnv('CRISIS_AGREEMENT_GATE', 'on');
      vi.stubEnv('CRISIS_ADJUDICATOR', 'live');
      allowCrisisAdjudicatorLiveForTests(true);
      let release = (): void => undefined;
      h.adjudicatorGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.adjudicator = answer;
      let returned = false;
      const turn = start(ORDINARY, 'crisis').then((r) => {
        returned = true;
        return r;
      });
      await drain(300); // well under the 1200 ms adjudicator timeout
      expect(returned).toBe(false);
      expect(h.writes).toEqual([]);
      release();
      const result = await turn;
      await drain();
      expect(result.crisis?.softCheck === true).toBe(answer === 'checkin');
      expect(writes()).toBe(0);
      expectReads({ classifier: 1, adjudicator: 1 });
    }
  );
});

describe('CRISIS_CLASSIFIER_ONLY_CHECKIN=live without the switch (held)', () => {
  // No scope without the gate or the adjudicator (turn-crisis.ts:210-211): the easing check reads
  // [null] and stops at missing_read (crisis-classifier-only.ts:137-139), so no easing call.
  it.each([
    ['crisis', 0],
    ['none', 1],
  ] as const)('E1 held, no scope: no easing read, %s read writes %i', async (risk, count) => {
    vi.stubEnv('CRISIS_CLASSIFIER_ONLY_CHECKIN', 'live');
    const turn = await oneTurn(ORDINARY, risk);
    await drain();
    expect(turn.crisis).toMatchObject({ isCrisis: risk === 'crisis' });
    expect(turn.crisis?.softCheck).toBeUndefined();
    expect(turn.writes).toBe(count);
    expectReads({ classifier: 1 });
  });

  it('E1 held with a scope: the easing read starts and changes nothing, writes 0', async () => {
    vi.stubEnv('CRISIS_CLASSIFIER_ONLY_CHECKIN', 'live');
    vi.stubEnv('CRISIS_ADJUDICATOR', 'shadow'); // sets the scope; shadow never holds the turn
    // Three earlier caller lines with no risk words: the turn is eligible for the easing read.
    const history = [
      'the bus came on time this morning',
      'I watered the tomato garden',
      'my sister called about the weekend',
      ORDINARY,
    ];
    const turn = await oneTurn(ORDINARY, 'crisis', REPLY, history);
    await drain(); // held decides off the reply path
    expect(turn.crisis).toMatchObject({ isCrisis: true });
    expect(turn.crisis?.softCheck).toBeUndefined();
    expect(turn.writes).toBe(0);
    // One read of the call's lines plus one per caller sentence (crisis-easing-extract.ts:275-278).
    expectReads({ classifier: 1, adjudicator: 1, easing: 5 });
  });
});

/** The real turn hook; the handler stand-in builds the turn context as turn-handler.ts:555-564. */
async function hookTurn(line: string, risk: Risk): Promise<Result | undefined> {
  h.risk = risk;
  let result: Result | undefined;
  const callData = { turnCount: 3, recentTranscripts: [EARLIER, line], lastAgentResponse: REPLY };
  const hook = createTurnIntelligenceHook({
    persona: persona as unknown as HookDeps['persona'],
    services: services(`hook-${risk}-${line.length}`) as unknown as HookDeps['services'],
    userData: callData as unknown as HookDeps['userData'],
    revivedStore: { summaries: async () => [] },
    handle: async (ctx) => {
      result = await processTurn({
        turnCtx: ctx.turnCtx,
        userText: ctx.userText,
        contextOnly: ctx.contextOnly,
        persona: ctx.persona,
        bundleRuntime: ctx.bundleRuntime,
        services: ctx.services,
        userData: ctx.userData,
        logger,
      } as unknown as Ctx);
    },
  });
  await hook(llm.ChatContext.empty(), llm.ChatMessage.create({ role: 'user', content: line }));
  await drain();
  return result;
}

describe('through the real turn hook', () => {
  it.each([
    ['off', 'none', 0],
    ['off', 'crisis', 0],
    ['on', 'none', 1],
    ['on', 'crisis', 0],
  ] as const)('H1 gate %s, classifier-only %s read: writes %i', async (gate, risk, count) => {
    vi.stubEnv('CRISIS_AGREEMENT_GATE', gate === 'on' ? 'on' : '');
    const result = await hookTurn(ORDINARY, risk);
    expect(result?.crisis).toMatchObject({ isCrisis: risk === 'crisis' });
    expect(writes()).toBe(count);
    expectReads({ classifier: 1 });
  });
});
