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
 *   Q1  The humanizer's question suggestion pinned to fire: one model-helper call per turn whose
 *       line has no "?", none otherwise; the hold is unchanged.
 *   Q2  KNOWN, current behaviour pinned: that call's prompt carries the caller line.
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
 *
 * The model guard, in every row: embeddings answer locally, the model SDKs' client constructors
 * and the auth library's client are counted and refused, and fetch is counted and refused. A row
 * that builds a real model client or reaches the network fails, by name, with the stack that did
 * it. After the last row the file waits for detached generations (up to 10 s), then counts.
 *
 * llm-utils is stubbed. The rows reach it only through the humanizer's question suggestion
 * (pre-llm.ts:188-200 -> question-patterns/engine.ts:308 -> llm-dynamic-content.ts:563 -> :490),
 * which rolls on a per-process session id carrying Date.now() (humanizer.ts:40, :157-164; #3875).
 * Unpinned, the roll (threshold 0.4, humanizer/utils.ts:17-37) decides each run: in the runs where
 * it fired, every row without a "?" reached it. The rows pin it to a session that does not ask,
 * and Q1/Q2 pin one that does.
 */
import { llm } from '@livekit/agents';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Risk = 'none' | 'crisis' | 'imminent';
type Answer = 'checkin' | 'escalate' | 'fails' | 'hangs';
type Reader = 'classifier' | 'who' | 'afterCheck' | 'grounded' | 'adjudicator' | 'easing' | 'other';
const h = vi.hoisted(() => {
  /** Model calls per reader, told apart by request shape (maxOutputTokens, then the prompt). */
  const calls: Record<string, number> = {};
  return {
    risk: 'none' as 'none' | 'crisis' | 'imminent',
    /** What the adjudicator's model call answers. */
    adjudicator: 'escalate' as 'checkin' | 'escalate' | 'fails' | 'hangs',
    /** The adjudicator's answer waits for this when set. */
    adjudicatorGate: null as null | Promise<void>,
    calls,
    fetches: 0,
    /** Prompts the stubbed model helper got, and how many this row expects. */
    llmPrompts: [] as string[],
    expectedLLM: 0,
    writes: [] as Array<[string, ...unknown[]]>,
    /** parseAdjudicatorReply: a checkin needs high confidence and no caller risk quoted. */
    replies: {
      checkin: '{"decision":"checkin","confidence":"high","caller_risk":""}',
      escalate: '{"decision":"escalate","confidence":"high","caller_risk":""}',
    },
  };
});
const spy = vi.hoisted(() => ({
  /**
   * The guard: real model clients built and network calls attempted since the last row's check,
   * each with the row it landed in and the stack that made it (printed only on failure).
   */
  realCalls: 0,
  realSdk: [] as string[],
  realLog: [] as string[],
  /** Rows' real calls, file-wide, for the after-all check. */
  realTotal: 0,
}));
/** One guard hit: counted, with where it landed and who made it. */
const guardHit = vi.hoisted(() => (what: string) => {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40; // deep enough to show the caller past the SDK and our own frames
  const stack = (new Error().stack ?? '').split('\n').slice(2, 14).join('\n');
  Error.stackTraceLimit = limit;
  spy.realCalls++;
  spy.realSdk.push(what);
  spy.realLog.push(
    `${what} during "${expect.getState().currentTestName ?? '(between rows)'}"\n${stack}`
  );
});
/** A model SDK's client constructor: counted and refused, so a path left unstubbed fails its row. */
const noModelClient = vi.hoisted(
  () => (sdk: string) =>
    class {
      constructor() {
        guardHit(sdk);
        throw new Error(`no model client in this test (${sdk})`);
      }
    }
);

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
// llm-utils answers as a FAILED real call does (null, '' and false), recording callLLM's prompts.
// An explicit factory, no import of the real module: an export not named here fails loudly.
vi.mock('../../../../services/llm-utils.js', () => {
  const api = {
    callLLM: async (prompt: string) => {
      h.llmPrompts.push(prompt);
      return null;
    },
    callLLMForJSON: async () => null,
    createEmotionLLMCaller: () => async () => '',
    createSummarizationLLMCaller: () => async () => '',
  };
  return { ...api, warmVertexClient: async () => false, default: api };
});
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
// The model SDKs' clients: any path that still builds one is counted and refused (the guard).
// outbound-guard: own-refusing-mock (rest kept; new VertexAI counts and throws)
vi.mock('@google-cloud/vertexai', async (orig) => ({
  ...(await orig<object>()),
  VertexAI: noModelClient('vertexai'),
}));
// outbound-guard: own-refusing-mock (rest kept; new GoogleGenAI counts and throws)
vi.mock('@google/genai', async (orig) => ({
  ...(await orig<object>()),
  GoogleGenAI: noModelClient('genai'),
}));
// outbound-guard: own-refusing-mock (rest kept; new OpenAI or new default counts and throws)
vi.mock('openai', async (orig) => ({
  ...(await orig<object>()),
  default: noModelClient('openai'),
  OpenAI: noModelClient('openai'),
}));
// The auth library's client, as the embeddings path builds it for a Vertex token.
// outbound-guard: own-refusing-mock (rest kept; new GoogleAuth counts and throws)
vi.mock('google-auth-library', async (orig) => ({
  ...(await orig<object>()),
  GoogleAuth: noModelClient('google-auth'),
}));

import { createMockServices } from '../../__tests__/test-utils.js';
import {
  expectFileClean,
  expectRealEmbeddingRefused,
  expectRealLlmUtilsRefused,
  expectRowClean,
  expectSameContentStats,
} from '../../__tests__/model-guard.js';

const { processTurn } = await import('../process-turn.js');
const { createTurnIntelligenceHook } = await import('../../../multi-agent/turn-intelligence.js');
const { resetCrisisClassifierCache } =
  await import('../../../../services/safety/crisis-classifier.js');
const { resetCrisisCallRisk } = await import('../../../../services/safety/crisis-call-risk.js');
const { resetCallRiskSnapshots } =
  await import('../../../../services/safety/crisis-lone-imminent.js');
const { resetClassifierBlocked } =
  await import('../../../../services/safety/crisis-classifier-blocked.js');
const { LocalEmbeddings, setEmbeddingProvider } =
  await import('../../../../memory/vectors/embeddings.js');
const { allowCrisisAdjudicatorLiveForTests, resetCrisisAdjudicatorCache } =
  await import('../../../../services/safety/crisis-adjudicator.js');
const { resetEasingReads } =
  await import('../../../../services/safety/crisis-classifier-only-live.js');
/** Bound once at load, before G2's module reset, so the after-all check reads the rows' copy. */
const contentStats = await import('../../../../services/llm/llm-dynamic-content.js');
const { getConversationHumanizer } =
  await import('../../../../conversation/humanizer/humanizer.js');
const { createDeterministicTrigger } = await import('../../../../conversation/humanizer/utils.js');

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

/**
 * The humanizer's question roll, as pre-llm.ts:188-190 makes it at turn 3 (every row's turnCount,
 * read at context-injections.ts:1029). Session ids are picked by computing it, and pinned through
 * setSessionContext (humanizer.ts:53): it has no production caller; this test uses it as the seam.
 */
const asksQuestion = (session: string) =>
  createDeterministicTrigger(session, persona.id)(3, 'guidance_question_suggestion', 0.4);
const SESSIONS = Array.from({ length: 16 }, (_, i) => `flag-rows-humanizer-${i}`);
const QUIET = SESSIONS.find((s) => !asksQuestion(s)) ?? 'none found';
const ASKS = SESSIONS.find((s) => asksQuestion(s)) ?? 'none found';
const pinHumanizer = (session: string) =>
  getConversationHumanizer(persona.id).setSessionContext(session);
const writes = () => h.writes.filter((w) => w[0] === 'autoRecord').length;
const drain = (ms = 150) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Read first in every turn row; production reads it per call (llm-dynamic-content.ts:451). */
function expectGenerationOn(): void {
  expect(process.env.LLM_DYNAMIC_CONTENT_ENABLED, 'generation switch').toBe('true');
}

/** One turn after Ferni's line, with an earlier caller line so the adjudicator can judge it. */
function start(
  line: string,
  risk: Risk,
  previous = REPLY,
  history = [EARLIER, line]
): Promise<Result> {
  expectGenerationOn();
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
  h.llmPrompts.length = 0;
  h.expectedLLM = 0;
  pinHumanizer(QUIET);
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
  resetCrisisAdjudicatorCache();
  resetEasingReads();
  // The network guard, in every row: a call counts, as a fetch and as a real call, and fails.
  // Not unstubbed after a row, so work landing after the last row is guarded too.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      h.fetches += 1;
      guardHit('fetch');
      throw new Error('no network in this test');
    })
  );
  vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'live');
  vi.stubEnv('CRISIS_GUARD_MODE', 'live');
  // The generation stays on in every row, whatever the shared test setup writes (#3882 sets
  // 'false' for every file; unset, as on main, it is on): 28 turn rows assert zero model-helper
  // calls, and a zero only means something while the generation could have run.
  vi.stubEnv('LLM_DYNAMIC_CONTENT_ENABLED', 'true');
});

/**
 * Embeddings answer locally in every row, whatever is configured: with a project set and Vertex
 * on, the provider is Vertex (embeddings.ts:594-605) and every token builds an auth client
 * (:577-579). With nothing configured the provider is already local (:615-616).
 */
beforeEach(() => setEmbeddingProvider(new LocalEmbeddings()));

/**
 * No row may build a real model client or reach the network (the guard's counter, not log text),
 * and each row calls the stubbed model helper exactly as often as it says (0 unless set).
 */
afterEach(() => {
  allowCrisisAdjudicatorLiveForTests(false);
  vi.unstubAllEnvs();
  expectRowClean(spy);
  const row = expect.getState().currentTestName ?? '';
  expect(h.llmPrompts.length, `${row}: model-helper calls`).toBe(h.expectedLLM);
});

/** After the last row: waits up to 10 s for detached generations, then counts the file's hits. */
afterAll(async () => {
  await expectFileClean(spy, contentStats);
}, 15_000);

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
  expectGenerationOn();
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

/**
 * The humanizer's question suggestion fired (the ASKS session): a turn whose line has no "?" calls
 * the model helper once (pre-llm.ts:188-200 -> engine.ts:84 -> :308 -> llm-dynamic-content.ts:575
 * -> :563 -> :490; a null answer is never cached, :499-508), a line with "?" never (pre-llm.ts:189).
 * The hold is unchanged, and the stub builds no real client.
 */
describe('the humanizer question suggestion fires (pinned session)', () => {
  beforeEach(() => pinHumanizer(ASKS));
  it.each([
    ['crisis', ORDINARY, 1, 0],
    ['none', ORDINARY, 1, 1],
    ['crisis', QUESTION_BACK, 0, 0],
  ] as const)(
    'Q1 %s read of "%s": %i model-helper call, writes %i',
    async (risk, line, calls, count) => {
      h.expectedLLM = calls;
      const turn = await oneTurn(line, risk);
      expect(turn.crisis).toMatchObject({ isCrisis: risk === 'crisis' });
      expect(turn.writes).toBe(count);
      expectReads({ classifier: 1 });
    }
  );

  it("Q2 KNOWN, #3874 (current behaviour, not a ruling): on a held crisis turn the suggestion sends the caller line as the prompt's USER SAID field", async () => {
    // pre-llm.ts:195 previousUserStatement -> engine.ts:300 userMessage -> llm-dynamic-content.ts:814.
    h.expectedLLM = 1;
    const turn = await oneTurn(ORDINARY, 'crisis');
    expect(turn.crisis).toMatchObject({ isCrisis: true });
    expect(h.llmPrompts[0]).toContain(`USER SAID: "${ORDINARY}"`);
  });
});

/**
 * The guard's own rows, last in the file (the last resets the module registry). G0 and R0 check
 * what the after-all check and the rows rely on. G1 and G2 each build through a real production
 * path with the guard's mocks in place: the build is counted and refused, and the call fails as
 * it does with no client. Their own refused builds are expected, so each clears its counts at the
 * end; the after-row check covers the rest.
 */
describe('the model guard', () => {
  it('G0 the content module the rows load is the one the after-all check reads', async () => {
    // Production imports it through the re-export (question-patterns/engine.ts:13).
    const viaReExport = await import('../../../../services/llm-dynamic-content.js');
    expectSameContentStats(viaReExport, contentStats);
  });

  it('R0 the humanizer roll is pinned: the quiet session does not ask, the asking one does, rows run on the quiet one', () => {
    expect(SESSIONS).toEqual(expect.arrayContaining([QUIET, ASKS]));
    expect(asksQuestion(QUIET)).toBe(false);
    expect(asksQuestion(ASKS)).toBe(true);
    // A private field, read as the pin's evidence (humanizer.ts:34, set at :54).
    const humanizer = getConversationHumanizer(persona.id) as unknown as { sessionId: string };
    expect(humanizer.sessionId).toBe(QUIET);
  });

  // The real llm-utils (the rows' copy is stubbed), Vertex on and an invented OpenAI key.
  it('a real llm-utils call: the Vertex and OpenAI builds are counted and refused, and it answers null', () =>
    expectRealLlmUtilsRefused(spy, () =>
      vi.importActual<typeof import('../../../../services/llm-utils.js')>(
        '../../../../services/llm-utils.js'
      )
    ));

  // A fresh embeddings module (the registry is reset), project and Vertex on (model-guard.ts).
  it('a real Vertex embedding: the auth client build is counted and refused, and the embed rejects', () =>
    expectRealEmbeddingRefused(spy, () => import('../../../../memory/vectors/embeddings.js')));
});
