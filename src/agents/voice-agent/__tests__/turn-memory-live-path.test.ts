/**
 * Caller turns through the live voice path as agent-setup.ts wires it for a call (the multi-agent
 * path, the default): the switch read (resolveTurnIntelligenceMode), the turn pusher
 * (turn-intelligence.ts -> hook -> handleUserTurn -> processTurn) and the transcript handler
 * (transcript-handler.ts), both on the session's user_input_transcribed event. The real
 * handlers, turn handler and turn processor run; Firestore and Redis are write recorders;
 * fastCapture and recordTurn are counted and call through to the real ones.
 *
 * Ordinary turns make exactly the captures main made (same count, same arguments: the snapshots
 * are written by this file on main). At the turn handler's capture site, which runs after the
 * turn's crisis read, a crisis turn is not captured: that copy of the line stays in this call's
 * short-term memory only, and session-end promotion skips it. The transcript handler and
 * processTurn capture and record the line before the read, unmarked, so the line is still
 * extracted and promoted through them: the KNOWN GAP block pins that until the follow-ups close
 * it. All lines are fictional.
 */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rec = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../tests/helpers/write-recorder.js');
  return createWriteRecorder();
});
const spy = vi.hoisted(() => ({
  capture: [] as Record<string, unknown>[],
  /** When each capture started, ms since the test's clock was set. */
  captureAt: [] as number[],
  record: [] as unknown[][],
  handled: 0,
  /** Each run's text in the order it passed the row's gate into the turn handler (driven rows). */
  landed: [] as string[],
  /** Deep extraction jobs queued (a fastCapture result with a job id). */
  jobs: 0,
  /** Turns queued for the knowledge graph. */
  kg: [] as string[],
  /** buildSTMContext calls: the reader of the short-term memory's entities (condition 4). */
  stmContext: 0,
  t0: 0,
  /** The caller site of each capture, from its stack. */
  site: [] as string[],
  /** The hold's words-free TURN_MEMORY_HELD log lines (their first argument). */
  held: [] as Record<string, unknown>[],
  /** The lines each end-of-call human signals read was handed (stm-promotion.ts). */
  signalsIn: [] as string[][],
  /** The turn read's summary() result, when a row makes it missing; 'real' passes through. */
  crisisRead: 'real' as 'real' | undefined | null,
  /** How many summary() calls returned the row's missing read (precondition for those rows). */
  missingReads: 0,
  /** Each run's pattern read of its text: true when the patterns found a crisis. */
  patterns: [] as boolean[],
  /** The classifier-on rows: the stub classifier reads MODEL_ONLY's marker as crisis. */
  gemini: false,
  /** Every model call answered here, by reader: classifier, adjudicator, other, llm-utils. */
  modelCalls: [] as string[],
  /** The adjudicator stub's answer: escalate, or the opposite of the classifier's crisis. */
  adjudicatorSays: 'escalate' as 'escalate' | 'checkin',
  /** What each classifier call was handed: lengths and where the marker sat, never words. */
  handed: [] as Array<{ latest: number; earlier: number[]; inLatest: boolean; inEarlier: boolean }>,
  /**
   * The guard: real model clients built and network calls attempted since the last row's check,
   * each with the row it landed in and the stack that made it (printed only on failure). Not
   * cleared by resetSpies, so a row that resets mid-way is still checked whole.
   */
  realCalls: 0,
  realSdk: [] as string[],
  realLog: [] as string[],
  /** Rows' real calls, file-wide, for the after-all check. */
  realTotal: 0,
  /** Model reads by any reader the stub does not know ('other'), since the last row's check. */
  otherCalls: 0,
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

vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const base = await orig<Record<string, unknown>>();
  const quiet = () => undefined;
  const hold: Record<string, unknown> = {
    info: (fields: Record<string, unknown>, msg: string) => {
      if (msg === 'TURN_MEMORY_HELD') spy.held.push(fields);
    },
    debug: quiet,
    warn: quiet,
    error: quiet,
    trace: quiet,
    fatal: quiet,
  };
  hold.child = () => hold;
  const create = base.createLogger as (opts?: unknown) => unknown;
  return {
    ...base,
    createLogger: (opts?: { module?: string }) =>
      opts?.module === 'TurnMemoryCapture' ? hold : create(opts),
  };
});

vi.mock('../../../memory/dynamic/fast-capture.js', async (orig) => {
  const real = await orig<typeof import('../../../memory/dynamic/fast-capture.js')>();
  return {
    ...real,
    fastCapture: vi.fn(async (input: Parameters<typeof real.fastCapture>[0]) => {
      spy.capture.push({ ...input });
      spy.site.push(
        /(transcript-handler|process-turn|turn-handler)\.ts/.exec(new Error().stack ?? '')?.[1] ??
          'unknown'
      );
      spy.captureAt.push(Date.now() - spy.t0);
      const result = await real.fastCapture(input);
      if (result.asyncJobId) spy.jobs++;
      return result;
    }),
  };
});
vi.mock('../../../memory/dynamic/stm-buffer.js', async (orig) => {
  const real = await orig<typeof import('../../../memory/dynamic/stm-buffer.js')>();
  return {
    ...real,
    recordTurn: vi.fn((...args: Parameters<typeof real.recordTurn>) => {
      spy.record.push([...args]);
      return real.recordTurn(...args);
    }),
    buildSTMContext: vi.fn((sessionId: string) => {
      spy.stmContext++;
      return real.buildSTMContext(sessionId);
    }),
  };
});
vi.mock('../../../memory/human-signal-extractor.js', async (orig) => {
  const real = await orig<typeof import('../../../memory/human-signal-extractor.js')>();
  return {
    ...real,
    extractHumanSignals: vi.fn((...args: Parameters<typeof real.extractHumanSignals>) => {
      spy.signalsIn.push(args[0].map((t) => t.content));
      return real.extractHumanSignals(...args);
    }),
  };
});
// The turn's crisis read, real unless a row makes its summary missing (undefined or null).
vi.mock('../../processors/turn-processor/turn-crisis.js', async (orig) => {
  const real = await orig<typeof import('../../processors/turn-processor/turn-crisis.js')>();
  return {
    ...real,
    startTurnCrisis: (...args: Parameters<typeof real.startTurnCrisis>) => {
      const turn = real.startTurnCrisis(...args);
      spy.patterns.push(turn.patterns.isCrisis);
      if (spy.crisisRead === 'real') return turn;
      const missing = spy.crisisRead;
      return Object.assign(turn, {
        summary: async () => {
          spy.missingReads++;
          return missing as never;
        },
      });
    },
  };
});
// Every caller, in every row, gets this stub client: never a real one. It tells readers apart by
// the request's own prompt: the classifier answers crisis for a line carrying MODEL_ONLY's marker
// while the row turns it on (spy.gemini), none otherwise; the adjudicator answers as the row asks;
// any other reader is 'other', and every row asserts 'other' is 0 (afterEach).
vi.mock('../../../config/gemini-config.js', async (orig) => {
  const real = await orig<typeof import('../../../config/gemini-config.js')>();
  const generateContent = async (req: { config?: { systemInstruction?: unknown } }) => {
    // Each reader by its own prompt's opening (CRISIS_CLASSIFIER_PROMPT, CRISIS_ADJUDICATOR_PROMPT);
    // any other model read on the path counts as 'other', which the rows assert is 0.
    const system = String(req.config?.systemInstruction);
    const which = system.startsWith('You triage suicide and self-harm risk')
      ? 'classifier'
      : system.startsWith('You are a trained crisis counselor')
        ? 'adjudicator'
        : 'other';
    spy.modelCalls.push(which);
    if (which === 'other') {
      spy.otherCalls++;
      return { text: '' };
    }
    if (which === 'adjudicator') {
      return spy.adjudicatorSays === 'checkin'
        ? { text: '{"caller_risk":"","decision":"checkin","confidence":"high"}' }
        : { text: '{"caller_risk":"","decision":"escalate","confidence":"high"}' };
    }
    const crisis = spy.gemini && JSON.stringify(req).includes('Quillmere');
    // The classifier's user content is JSON {latest, earlier, companion} (classifyCrisis).
    const parts = (req as { contents?: Array<{ parts?: Array<{ text?: string }> }> }).contents;
    let seen: { latest?: string; earlier?: string[] };
    try {
      seen = JSON.parse(parts?.[0]?.parts?.[0]?.text ?? '{}');
    } catch {
      seen = { latest: '<not json>' }; // another prompt's call: shows up in the LATEST lengths
    }
    spy.handed.push({
      latest: (seen.latest ?? '').length,
      earlier: (seen.earlier ?? []).map((m) => m.length),
      inLatest: (seen.latest ?? '').includes('Quillmere'),
      inEarlier: (seen.earlier ?? []).some((m) => m.includes('Quillmere')),
    });
    return { text: `{"risk":"${crisis ? 'crisis' : 'none'}","subject":"self"}` };
  };
  const getGeminiClient = async () => ({ models: { generateContent } });
  // createGeminiClient is the real module's alias of its own getGeminiClient: replaced too.
  return { ...real, getGeminiClient, createGeminiClient: getGeminiClient };
});
// The semantic detector is out of scope here: "nothing detected", no model call. Its regex-first
// fallback is not copied; the turn path keeps its own regex reads (integration.ts:779-797).
vi.mock('../../../services/superhuman/semantic-intelligence/llm-detector.js', () => {
  const noAdvice = () => ({
    containsAdvice: false,
    adviceText: null,
    category: null,
    confidence: 0,
  });
  return {
    detectAdviceWithLLM: async () => noAdvice(),
    extractPersonsWithLLM: async () => [],
    detectAdviceOutcomeWithLLM: async () => ({
      referencesAdvice: false,
      outcome: null,
      sentiment: null,
      confidence: 0,
    }),
    detectAdviceHybrid: async () => noAdvice(),
    extractPersonsHybrid: async () => [],
    clearLLMDetectorCache: () => undefined,
    resetLLMDetectorClient: () => undefined,
    getLLMDetectorStats: () => ({ cacheSize: 0, circuitOpen: false }),
  };
});
// Every row, not only the classifier rows: llm-utils answers as a FAILED real call does (callLLM and
// callLLMForJSON give null, the two caller factories '' and the warm-up false), counted as 'llm-utils'.
// An explicit factory, no import of the real module: an export not named here fails loudly.
vi.mock('../../../services/llm-utils.js', () => {
  const asked = <T>(answer: T) => {
    spy.modelCalls.push('llm-utils');
    return answer;
  };
  const api = {
    callLLM: async () => asked(null),
    callLLMForJSON: async () => asked(null),
    createEmotionLLMCaller: () => async () => asked(''),
    createSummarizationLLMCaller: () => async () => asked(''),
  };
  return { ...api, warmVertexClient: async () => false, default: api };
});
// The model SDKs' clients: any path that still builds one is counted and refused (the guard).
vi.mock('@google-cloud/vertexai', async (orig) => ({
  ...(await orig<object>()),
  VertexAI: noModelClient('vertexai'),
}));
vi.mock('@google/genai', async (orig) => ({
  ...(await orig<object>()),
  GoogleGenAI: noModelClient('genai'),
}));
vi.mock('openai', async (orig) => ({
  ...(await orig<object>()),
  default: noModelClient('openai'),
  OpenAI: noModelClient('openai'),
}));
vi.mock('../../../memory/knowledge-graph/index.js', async (orig) => ({
  ...(await orig<object>()),
  isKnowledgeCaptureReady: () => true,
  queueTurnCapture: (turn: { transcript: string }) => void spy.kg.push(turn.transcript),
}));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<object>()),
  getFirestore: () => rec.db,
}));
vi.mock('../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<object>()),
  sharedFirestore: () => rec.db,
}));
vi.mock('../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));

import { createTranscriptHandler } from '../transcript-handler.js';
import {
  attachTurnContextPusher,
  createTurnIntelligenceHook,
  resolveTurnIntelligenceMode,
} from '../../multi-agent/turn-intelligence.js';
import { cleanupSession, getRecentTurns } from '../../../memory/dynamic/stm-buffer.js';
import { onSessionEnd } from '../../../memory/dynamic/stm-promotion.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { resetCrisisAdjudicatorCache } from '../../../services/safety/crisis-adjudicator.js';
import { resetClassifierBlocked } from '../../../services/safety/crisis-classifier-blocked.js';
import { resetEasingReads } from '../../../services/safety/crisis-classifier-only-live.js';
import { createDeterministicTrigger } from '../../../conversation/humanizer/utils.js';
import {
  getConversationHumanizer,
  resetConversationHumanizer,
} from '../../../conversation/humanizer/humanizer.js';

/** Anything a handler touches that is not under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

const ORDINARY =
  "My friend Dana Fielding and I are hiking at Pinecrest Lake on Saturday, I'm looking forward to it.";
/** An ordinary invented sentence the patterns cannot read; the classifier-on row's stub calls it a crisis. */
const MODEL_ONLY = 'We drove out past the Quillmere overlook after lunch.';
const CRISIS =
  "honestly i don't want to be here anymore, my friend Marlo Quince keeps asking about Saturday";
/** The agreement rows' call before the turn: Ferni's last line and an earlier caller line. */
const FERNI_BEFORE = 'That sounds like a lovely plan for the weekend.';
const CALLER_BEFORE = 'I finally finished painting the spare room yesterday.';
/** An invented analyzer reading for a strained voice (speech/audio-prosody/types.ts). */
const SHAKY_VOICE = {
  primary: 'fearful',
  confidence: 0.8,
  valence: -0.6,
  arousal: 0.7,
  dominance: -0.5,
  stressLevel: 0.85,
  anxietyMarkers: true,
  prosody: {
    pitchMean: 240,
    pitchVariance: 900,
    pitchRange: 160,
    pitchContour: 'dynamic',
    energyMean: -18,
    energyVariance: 40,
    energyPeaks: 6,
    speechRate: 5.5,
    pauseDuration: 300,
    pauseFrequency: 18,
    jitter: 0.02,
    shimmer: 0.08,
    breathiness: 0.4,
    utteranceDuration: 4,
    speakingRatio: 0.7,
  },
  sampleCount: 40,
  processingTimeMs: 3,
};

/**
 * The sessions the running test made. Ids come from the test's name, not a file-wide counter,
 * so a row's snapshot is the same in any test order; each is cleaned up after its test.
 */
const sessions: string[] = [];
function nextSessionId(): string {
  const name = expect.getState().currentTestName ?? '';
  const tag = createHash('sha1').update(name).digest('hex').slice(0, 8);
  sessions.push(`live-path-${tag}-${sessions.length + 1}`);
  return sessions.at(-1)!;
}

interface LiveOptions {
  /** TURN_INTELLIGENCE as the agent's environment sets it. */
  env?: Record<string, string | undefined>;
  /** Fails a run before its crisis read, by the text it carries (the turn so far). */
  fails?: (userText: string) => boolean;
  /** Holds a run, by the text it carries (the turn so far), until the row releases it. */
  gate?: (userText: string) => Promise<void>;
  /** More of the call's userData before the first line (Ferni's last line, earlier lines). */
  userData?: Record<string, unknown>;
}

/** A session wired as agent-setup.ts wires a call: the switch read, the pusher, the handler. */
function liveSession(opts: LiveOptions = {}) {
  const sessionId = nextSessionId();
  const userId = `member-${sessionId}`;
  const session = new EventEmitter();
  const userData = { userId, turnCount: 3, ...opts.userData } as Record<string, unknown>;
  // The session's ids; every other service is a no-op, so the whole turn runs to its end.
  const ids: Record<PropertyKey, unknown> = { sessionId, userId, userProfile: undefined };
  const services = new Proxy(ids, {
    get: (t, k) => (k in t ? t[k] : (stub() as Record<PropertyKey, unknown>)[k]),
  }) as never;
  const persona = { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as never;
  // agent-setup.ts:1569, the same read and the same moment.
  const turnPath = resolveTurnIntelligenceMode(opts.env ?? {}) === 'on';
  const hook = createTurnIntelligenceHook({
    persona,
    services,
    userData: userData as never,
    revivedStore: stub(),
    // The real turn handler; counted, so the test waits for every background run to finish.
    handle: async (ctx) => {
      const { handleUserTurn } = await import('../turn-handler.js');
      try {
        await opts.gate?.(ctx.userText);
        spy.landed.push(String(ctx.userText));
        if (opts.fails?.(ctx.userText)) throw new Error('turn run failed before its read');
        await handleUserTurn(ctx);
      } finally {
        spy.handled++;
      }
    },
  });
  const agent = { chatCtx: llm.ChatContext.empty(), updateChatCtx: async () => undefined };
  // agent-setup.ts:1630-1640: the pusher only when the switch is on.
  const detach = turnPath
    ? attachTurnContextPusher(
        hook,
        agent as never,
        session as never,
        { userData, sessionId } as never
      )
    : async () => undefined;
  // agent-setup.ts:1927-1975: the call's transcript handler, on the same event.
  const transcriptHandler = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: persona,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: userData as never,
    userId,
    sessionId,
    silenceContext: { topicsDiscussed: [], memorableMoments: [] } as never,
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getToolsForDomains: () => ({}),
    },
    agent: stub(),
    autoOptimizer: { processUserMessage: () => undefined },
  });
  session.on('user_input_transcribed', (event) => transcriptHandler.handler(event as never));
  const state = (newState: string) =>
    void session.emit('agent_state_changed', { oldState: 'listening', newState });
  return {
    sessionId,
    userId,
    userData,
    say: (words: string) =>
      void session.emit('user_input_transcribed', {
        type: 'user_input_transcribed',
        transcript: words,
        isFinal: true,
        itemId: null,
        speakerId: null,
        createdAt: Date.now(),
        language: null,
      }),
    /** Ferni starts the reply: the caller turn ends. */
    agentThinks: () => state('thinking'),
    agentSpeaks: () => state('speaking'),
    agentListens: () => state('listening'),
    detach,
  };
}

/** Everything a row's writers produce: captures, records, store writes, hold lines. */
const activity = (): number =>
  spy.capture.length + spy.record.length + rec.payloads.length + spy.held.length;

/**
 * Waits for `runs` background turn runs, then lets their fire-and-forget writers finish. Bounded
 * (about 10 s); resolves false when the writers never went quiet.
 */
async function quiet(runs: number, settleMs = 2000): Promise<boolean> {
  await vi.waitFor(() => expect(spy.handled).toBeGreaterThanOrEqual(runs), {
    timeout: 45_000,
    interval: 100,
  });
  let last = -1;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => {
      setTimeout(r, 100);
    });
    const now = activity();
    if (now === last && i * 100 > settleMs) return true;
    last = now;
  }
  return false;
}

function resetSpies(): void {
  spy.capture.length = 0;
  spy.captureAt.length = 0;
  spy.record.length = 0;
  spy.handled = 0;
  spy.landed.length = 0;
  spy.jobs = 0;
  spy.kg.length = 0;
  spy.stmContext = 0;
  rec.writes.length = 0;
  rec.payloads.length = 0;
  spy.held.length = 0;
  spy.site.length = 0;
  spy.signalsIn.length = 0;
  spy.crisisRead = 'real';
  spy.missingReads = 0;
  spy.patterns.length = 0;
  spy.gemini = false;
  spy.modelCalls.length = 0;
  spy.handed.length = 0;
  spy.adjudicatorSays = 'escalate';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  guardNetwork(); // a row that resets mid-way (the landing-order row) stays guarded
  // The classifier's per-line verdicts and the call's reads: no row inherits another's.
  resetCrisisClassifierCache();
  resetCrisisAdjudicatorCache();
  resetCrisisCallRisk();
  resetClassifierBlocked();
  resetEasingReads();
}

/** The network guard, in every row: a call counts as a real call and fails. */
function guardNetwork(): void {
  vi.stubGlobal('fetch', async () => {
    guardHit('fetch');
    throw new Error('no network in this test');
  });
}
beforeEach(guardNetwork);

/**
 * The humanizer's roll, pinned. Unpinned, its id carries the process start time
 * (humanizer.ts:38-41), so whether a turn's question suggestion asks llm-utils after the turn
 * (pre-llm.ts:188-200, then llm-dynamic-content.ts:563 and :490) is a draw per process. This id
 * fires at turns 3 to 7, every number a row's run can read (each call starts at 3 and each
 * transcript adds one, transcript-handler.ts:1523), so a row's model-helper count is a fact.
 */
const HUMANIZER_PIN = 'live-path-humanizer-pin-110';
/** The id the roll is made with (pre-llm.ts:129). Private: read here only to prove the pin held. */
const rollIdOf = (humanizer: unknown): unknown =>
  (humanizer as { preLlm?: { sessionId?: unknown } }).preLlm?.sessionId;
beforeEach(() => getConversationHumanizer('ferni').setSessionContext(HUMANIZER_PIN));

/** The guard's hits, counted by name: "N network calls blocked, M real model clients constructed". */
function guardReport(sdks: string[], log: string[]): string {
  const fetches = sdks.filter((s) => s === 'fetch').length;
  const clients = sdks.length - fetches;
  return [
    `${fetches} network calls blocked, ${clients} real model clients constructed (${sdks.join(', ')})`,
    ...log,
  ].join('\n\n');
}

/**
 * A row's writers must finish inside the row: after it goes quiet and its sessions are cleaned up,
 * nothing more may arrive. A leak fails the row that leaked, by name, not a later one. Nor may a
 * row build a real model client or reach the network (the guard's counter, not log text).
 */
afterEach(async () => {
  const row = expect.getState().currentTestName ?? '';
  const settled = await quiet(0, 500);
  for (const id of sessions.splice(0)) cleanupSession(id);
  const end = activity();
  await new Promise((r) => {
    setTimeout(r, 300);
  });
  const late = activity() - end;
  // The guard's counts span the whole row: resetSpies leaves them, so they are cleared here. A hit
  // from a row's late work is counted in the row it lands in; its record names that row and the
  // stack that made it.
  const realCalls = spy.realCalls;
  const real = guardReport([...spy.realSdk], [...spy.realLog]);
  const otherCalls = spy.otherCalls;
  spy.realTotal += realCalls;
  spy.realCalls = 0;
  spy.realSdk.length = 0;
  spy.realLog.length = 0;
  spy.otherCalls = 0;
  resetSpies();
  expect(settled, `${row}: its writers were still running after about 10 s`).toBe(true);
  expect(late, `${row}: ${late} write(s) arrived after the row ended`).toBe(0);
  expect(realCalls, `${row}: ${real}`).toBe(0);
  expect(otherCalls, `${row}: model read(s) by a reader the stub does not know`).toBe(0);
}, 20_000);

/** Work still pending after the last row (fire-and-forget model calls) is guarded too. */
afterAll(async () => {
  try {
    await new Promise((r) => {
      setTimeout(r, 500);
    });
    const real = guardReport([...spy.realSdk], [...spy.realLog]);
    const hits = spy.realTotal + spy.realCalls;
    const since = `since the last row's check: ${real}`;
    expect(hits, `after the last row: ${hits} guard hit(s) in the file; ${since}`).toBe(0);
    expect(spy.otherCalls, 'after the last row: model read(s) by an unknown reader').toBe(0);
  } finally {
    // The pin ends with the file: the next caller gets a fresh humanizer, as production does.
    resetConversationHumanizer('ferni');
  }
});

/**
 * The captures and short-term records, as main's snapshot compares them. `turnRace` replaces the
 * turn-path sites' turn number (userData.turnCount, read by processTurn at process-turn.ts:352)
 * with "N": each segment's transcript handler adds one to it (transcript-handler.ts:1523) after
 * its capture, so on main as here the number a run reads depends on which finishes first.
 */
function made(
  call: { sessionId: string; userId: string },
  turnRace = false
): { captures: string[]; records: string[]; jobs: number } {
  const n = (t: unknown) => (turnRace && t !== 0 ? 'N' : t);
  return {
    captures: spy.capture
      .map((c) =>
        ownIds(call, JSON.stringify({ ...c, timestamp: undefined, turnNumber: n(c.turnNumber) }))
      )
      .sort(),
    records: spy.record
      .map((r) => ownIds(call, JSON.stringify([r[0], r[1], r[3], n(r[4]), r[5]])))
      .sort(),
    jobs: spy.jobs,
  };
}

/** The call's own ids as <user> and <session>; another session's id stays visible. */
const ownIds = (call: { sessionId: string; userId: string }, s: string): string =>
  s.split(call.userId).join('<user>').split(call.sessionId).join('<session>');

/**
 * The long-term stores this change gates: deep extraction's (its job never runs here, so the
 * queued-job count covers it) and the end-of-call promotion's. Other writers that store a turn's
 * words (the relationship network, semantic intelligence, the stored conversation) are not
 * gated here; the PR body lists them.
 */
const GATED_STORES = [
  'dynamic_entities',
  'dynamic_facts',
  'dynamic_relations',
  '/human_signals',
  '/promoted_entities/',
  '/emotional_arcs/',
  '/topic_patterns/',
  '/shared_memories',
];

/** Every capture's words, and every gated store's write, that carry any of these. */
function carrying(words: string[]): { captured: string[]; queued: string[]; written: string[] } {
  const has = (text: string) => words.some((w) => text.includes(w));
  const gated = (payload: string) =>
    GATED_STORES.some((store) => payload.split(' ')[1]?.includes(store));
  return {
    captured: spy.capture.map((c) => String(c.transcript)).filter(has),
    queued: spy.kg.filter(has),
    written: rec.payloads.filter((p) => gated(p) && has(p)),
  };
}

/** recordTurn's 8th argument: true for a session-only (held) turn. */
const heldRecords = () => spy.record.filter((r) => r[7] === true).map((r) => r[3]);

const heldLog = (): Record<string, unknown>[] => spy.held;

/** A path segment that is a generated document id. */
const ID_SEGMENT = /^(auto-\d+|[a-z]+_\d{10,}_[a-z0-9]+|\d{10,})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const isClock = (v: unknown): boolean =>
  (typeof v === 'string' && ISO.test(v)) || (typeof v === 'number' && v > 1e12);
/**
 * The only body fields normalised: the keys whose values change on every run, and only when the
 * value has that shape. Anything else, under any key, is compared as written.
 */
const VOLATILE: Record<string, { is: (v: unknown) => boolean; as: string }> = {
  capturedAt: { is: isClock, as: '<time>' },
  promotedAt: { is: isClock, as: '<time>' },
  id: { is: (v) => typeof v === 'string' && ID_SEGMENT.test(v), as: '<id>' },
};

function normalised(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalised);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => {
        const volatile = Object.hasOwn(VOLATILE, k) ? VOLATILE[k] : undefined;
        return [k, volatile?.is(v) ? volatile.as : normalised(v)];
      })
    );
  }
  return value;
}

/**
 * The real end of the call (stm-promotion.ts onSessionEnd): every Firestore write it makes, in
 * order, as `<op> <path> <body>` with ids and clock readings normalised, and the lines each
 * human signals read was handed.
 */
async function callEnd(call: { sessionId: string; userId: string }) {
  const from = rec.payloads.length;
  const signalsFrom = spy.signalsIn.length;
  await onSessionEnd(call.sessionId, call.userId);
  const writes = rec.payloads.slice(from).map((payload) => {
    const [op, path, ...body] = ownIds(call, payload).split(' ');
    const segments = path.split('/').map((s) => (ID_SEGMENT.test(s) ? '<id>' : s));
    const json = body.join(' ');
    return `${op} ${segments.join('/')} ${JSON.stringify(normalised(json ? JSON.parse(json) : null))}`;
  });
  return { writes, signals: spy.signalsIn.slice(signalsFrom) };
}

/**
 * A call end's writes without what depends on which run of a turn landed last (each entity's
 * context lines, the arc's entries): the store and entity with its mention count, sorted, and the
 * arc's length. Main lands a turn's runs in any order (the known out-of-order finding); this PR
 * does not change that, so a snapshot of that text would pin timing, not behaviour.
 */
function endShape(end: { writes: string[] }): unknown[][] {
  return end.writes
    .map((w) => {
      const [op, path, ...json] = w.split(' ');
      const body = JSON.parse(json.join(' ')) as Record<string, unknown>;
      if (path.includes('/emotional_arcs/')) {
        return [op, path, 'arc entries', (body.trajectory as unknown[]).length];
      }
      return [op, path, body.name ?? String(body.content).split('.')[0], body.mentionCount];
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** The four entities of the three-segment rows, in each store, at `n` mentions; the arc's length. */
const PRIYA_END = (n: number, arc: number): unknown[][] =>
  [
    ...['sister (person)', 'Priya (person)', 'Holt (person)', 'Denver (place)'].map((e) => [
      'set',
      'users/<user>/shared_memories/<id>',
      `${e}: mentioned ${n}x`,
      undefined,
    ]),
    ...['sister', 'Priya', 'Holt', 'Denver'].map((e) => [
      'set',
      'bogle_users/<user>/promoted_entities/<id>',
      e,
      n,
    ]),
    ['set', 'bogle_users/<user>/emotional_arcs/<session>', 'arc entries', arc],
  ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const PRIYA = [
  'So my sister Priya Holt is visiting from Denver.',
  'We are going to the Larkspur farmers market.',
  'Then dinner at her favorite noodle place on Friday.',
];
/** What run k carries: the turn so far, segments 1 to k. */
const turnSoFar = (segments: readonly string[]): string[] =>
  segments.map((_s, i) => segments.slice(0, i + 1).join(' '));

/**
 * One caller turn whose runs land in `order` (runs named by how many segments they carry): each
 * run waits before the turn handler until the row releases it, and the next is released only when
 * the last has finished and, unless it failed, the turn handler's record of it is in.
 */
async function drivenTurn(
  segments: readonly string[],
  order: readonly number[],
  opts: LiveOptions = {}
): Promise<ReturnType<typeof liveSession>> {
  const texts = turnSoFar(segments);
  const waiting = new Map<number, () => void>();
  const call = liveSession({
    ...opts,
    gate: (text) =>
      new Promise((go) => {
        waiting.set(texts.indexOf(text) + 1, go);
      }),
  });
  for (const segment of segments) call.say(segment);
  call.agentThinks();
  let records = 0;
  for (const [i, k] of order.entries()) {
    const at = `run ${k} of order ${order.join(',')}`;
    await vi.waitFor(() => expect(waiting.has(k), at).toBe(true), {
      timeout: 30_000,
      interval: 20,
    });
    waiting.get(k)!();
    if (!opts.fails?.(texts[k - 1])) records++;
    await vi.waitFor(
      () => {
        expect(spy.handled, at).toBe(i + 1);
        expect(spy.record.filter((r) => r[5] === 'ferni').length, at).toBe(records);
      },
      { timeout: 45_000, interval: 50 }
    );
  }
  return call;
}

describe('the model guard', () => {
  // The real llm-utils (the path the ordinary turn reaches, here stubbed) builds its Vertex client
  // inside the guard: the build is counted and refused, and the call returns what a failed call
  // returns. Vertex on, as the agents run it (vertex-flag.ts), whatever this shell sets.
  it('a real llm-utils call is stopped at the client build, counted, and answers null', async () => {
    vi.stubEnv('USE_VERTEX_AI', 'true');
    const real = await vi.importActual<typeof import('../../../services/llm-utils.js')>(
      '../../../services/llm-utils.js'
    );
    expect(spy.realSdk).toEqual([]);
    expect(await real.callLLM('An invented prompt about a picnic.')).toBeNull();
    expect(spy.realSdk).toContain('vertexai');
    // This row's own refused builds are expected; the guard's after-row check covers the rest.
    spy.realCalls = 0;
    spy.realSdk.length = 0;
    spy.realLog.length = 0;
  });
});

describe('ordinary turns on the live path: the captures and the call end main made', () => {
  it('one segment: same captures; call end writes the same records in the same order', async () => {
    const call = liveSession();
    call.say(ORDINARY);
    call.agentThinks();
    await quiet(1);
    expect(made(call)).toMatchSnapshot();
    // Positive control for the site attribution the crisis tests use.
    expect([...spy.site].sort()).toEqual(['process-turn', 'transcript-handler', 'turn-handler']);
    expect(heldRecords()).toEqual([]);
    // No reply reads the short-term memory's entities, on main or here (condition 4).
    expect(spy.stmContext).toBe(0);
    // Positive control for the model guard: the turn's question suggestion reaches llm-utils (the
    // stub) through the real chain, exactly once. Preconditions: the pin held, and the production
    // trigger fires at every turn number a run can read.
    expect(rollIdOf(getConversationHumanizer('ferni'))).toBe(HUMANIZER_PIN);
    const fires = createDeterministicTrigger(HUMANIZER_PIN, 'ferni');
    const misses = [3, 4, 5, 6, 7].filter((n) => !fires(n, 'guidance_question_suggestion', 0.4));
    expect(misses).toEqual([]);
    expect(spy.modelCalls.filter((m) => m === 'llm-utils').length).toBe(1);
    // Call end: every write, in order, and human signals' input, as on main.
    expect(await callEnd(call)).toMatchSnapshot();
    // Positive control for the store probe the KNOWN GAP row uses: the ordinary names are promoted.
    expect(carrying(['Dana']).written.length).toBeGreaterThan(0);
    expect(spy.signalsIn).toEqual([[ORDINARY, ORDINARY, ORDINARY]]);
    await call.detach();
  }, 60_000);

  // Natural scheduling (the only row through the real cold arrival path): order-insensitive facts
  // only. Its call end's text depends on which run lands last (see endShape), so the call-end
  // snapshot lives in the driven rows below, one per landing order.
  it('P1: three segments: same captures; call end as main', async () => {
    const call = liveSession();
    for (const line of PRIYA) call.say(line);
    call.agentThinks();
    await quiet(3);
    expect(made(call, true)).toMatchSnapshot();
    expect(heldRecords()).toEqual([]);
    const end = await callEnd(call);
    // By shape: every record handed to human signals once, the same entities and counts, and the
    // same set of written keys.
    expect([...end.signals[0]].sort()).toEqual(spy.record.map((r) => String(r[3])).sort());
    expect(endShape(end)).toEqual(PRIYA_END(7, 9));
    const keys = (rows: unknown[][]) => [...new Set(rows.map(([op, path]) => `${op} ${path}`))];
    expect(keys(endShape(end))).toEqual(keys(PRIYA_END(7, 9)));
    await call.detach();
  }, 60_000);

  // The same turn driven in three landing orders: the call end as main wrote it for each, with
  // `landed` (each run's segment count in the order it entered the turn handler), so a swapped order
  // is red even where the call end's text is the same.
  for (const order of [
    [1, 2, 3],
    [2, 3, 1],
    [3, 1, 2],
  ] as const) {
    it(`P1: three segments landing ${order.join(', ')}: captures and call end as main`, async () => {
      const texts = turnSoFar(PRIYA);
      const call = await drivenTurn(PRIYA, order);
      expect(await quiet(3)).toBe(true);
      expect(made(call, true)).toMatchSnapshot();
      expect(heldRecords()).toEqual([]);
      const landed = spy.landed.map((t) => texts.indexOf(t) + 1);
      expect({ landed, end: await callEnd(call) }).toMatchSnapshot();
      await call.detach();
    }, 60_000);
  }

  // The failing run is the one carrying segments 1 and 2, whichever order the runs reach the
  // handler in (on a first turn they can reach it out of segment order: first-turn-defer.ts:168-176).
  // Each order is driven by the row and snapshotted by name, with `landed` (the order runs entered
  // the turn handler, the failing one included), since main's call end is the same in every order.
  for (const [name, order] of [
    ['the failing run lands first', [2, 1, 3]],
    ['in segment order', [1, 2, 3]],
    ['the failing run lands last', [1, 3, 2]],
  ] as const) {
    it(`P1: three segments with the middle run failing before its read, ${name}: kept; call end as main`, async () => {
      const call = await drivenTurn(PRIYA, order, {
        fails: (text) => text === turnSoFar(PRIYA)[1],
      });
      expect(await quiet(3)).toBe(true);
      expect(made(call, true)).toMatchSnapshot();
      expect(heldRecords()).toEqual([]);
      const landed = spy.landed.map((t) => turnSoFar(PRIYA).indexOf(t) + 1);
      expect({ landed, end: await callEnd(call) }).toMatchSnapshot();
      await call.detach();
    }, 60_000);
  }

  it('switch off (TURN_INTELLIGENCE=off): any line captured as main; call end as main', async () => {
    const call = liveSession({ env: { TURN_INTELLIGENCE: 'off' } });
    call.say(ORDINARY);
    call.say(CRISIS);
    await vi.waitFor(() => expect(spy.record.length).toBe(2), { timeout: 30_000, interval: 100 });
    await new Promise((r) => {
      setTimeout(r, 1000);
    });
    expect(made(call)).toMatchSnapshot();
    expect(heldRecords()).toEqual([]);
    expect(await callEnd(call)).toMatchSnapshot();
    await call.detach();
    cleanupSession(call.sessionId);
  }, 60_000);
});
describe("a crisis turn: the turn handler's copy is session only (early sites: KNOWN GAP below)", () => {
  it('nothing captured from the turn handler; its record is session only, with nothing extracted', async () => {
    const call = liveSession();
    call.say(CRISIS);
    call.agentThinks();
    await quiet(1);
    expect(spy.site.filter((s) => s === 'turn-handler')).toEqual([]);
    // The turn handler's record of the line: this call only, nothing extracted from it.
    expect(heldRecords()).toEqual([CRISIS]);
    expect(
      getRecentTurns(call.sessionId)
        .filter((t) => t.sessionOnly)
        .map((t) => [t.transcript, t.entities, t.topics])
    ).toEqual([[CRISIS, [], []]]);
    // Words-free: site, reason and session only.
    expect(heldLog()).toEqual([
      { site: 'turn-handler', reason: 'crisis', sessionId: call.sessionId },
    ]);
    await call.detach();
    cleanupSession(call.sessionId);
  }, 60_000);

  // A read that is missing fails closed: the turn handler holds the line as for a crisis read.
  for (const [name, missing] of [
    ['undefined', undefined],
    ['null', null],
  ] as const) {
    it(`a crisis read that comes back ${name}: held at the turn handler like a crisis read`, async () => {
      spy.crisisRead = missing;
      const call = liveSession();
      call.say(ORDINARY);
      call.agentThinks();
      await quiet(1);
      expect(spy.missingReads).toBeGreaterThan(0); // the turn really ran on a missing read
      expect(spy.site.filter((s) => s === 'turn-handler')).toEqual([]);
      expect(heldRecords()).toEqual([ORDINARY]);
      expect(heldLog()).toEqual([
        { site: 'turn-handler', reason: 'crisis', sessionId: call.sessionId },
      ]);
      await call.detach();
      cleanupSession(call.sessionId);
    }, 60_000);
  }

  // Landing order: each run decides on its own read of the turn so far (turn-handler.ts:2202,
  // :2639), so which run lands last cannot change what is held. Driven, not timed (drivenTurn).
  it('three segments, one a crisis line, each run landing last in turn: the same holds in every order', async () => {
    const marlo = (t: unknown) => String(t).includes('Marlo');
    const sorted = <T>(xs: T[]) =>
      [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    // What each crisis position gives in its first order; the other orders must give the same.
    const first = new Map<number, unknown>();
    for (const p of [1, 2, 3]) {
      for (const lastRun of [1, 2, 3]) {
        const at = `crisis line ${p} of 3, run ${lastRun} lands last`;
        const segments = PRIYA.map((l, i) => (i + 1 === p ? CRISIS : l));
        const texts = turnSoFar(segments);
        const call = await drivenTurn(segments, [
          ...[1, 2, 3].filter((k) => k !== lastRun),
          lastRun,
        ]);
        expect(await quiet(3), at).toBe(true);
        const held = texts.slice(p - 1);
        const kept = texts.slice(0, p - 1);
        // The turn handler: no text it captures carries the crisis line; the runs before it are captured.
        const atHandler = spy.capture
          .filter((_c, i) => spy.site[i] === 'turn-handler')
          .map((c) => String(c.transcript));
        expect(atHandler.filter(marlo), at).toEqual([]);
        expect(sorted(atHandler), at).toEqual(sorted(kept));
        // Its records: every run from the crisis line on is held, session only, nothing extracted.
        expect(sorted(heldRecords()), at).toEqual(sorted(held));
        const turns = getRecentTurns(call.sessionId);
        expect(
          sorted(
            turns.filter((t) => t.sessionOnly).map((t) => [t.transcript, t.entities, t.topics])
          ),
          at
        ).toEqual(sorted(held.map((t) => [t, [], []])));
        // One identical, words-free line per held run.
        expect(heldLog(), at).toEqual(
          held.map(() => ({ site: 'turn-handler', reason: 'crisis', sessionId: call.sessionId }))
        );
        // KNOWN GAP (not held here): the early sites copy the line before the read. LITERAL counts,
        // so the follow-ups that hold processTurn's and the transcript handler's copies must edit
        // this row: transcript handler 1 (its segment), processTurn 1 per run carrying the line.
        const earlySites = spy.site.filter((_s, i) => marlo(spy.capture[i].transcript));
        expect(earlySites.filter((x) => x === 'transcript-handler').length, at).toBe(1);
        expect(earlySites.filter((x) => x === 'process-turn').length, at).toBe(4 - p);
        expect(sorted(earlySites), at).toEqual(sorted(earlyCopies(held.length)));
        // Captured-record keys, held records and the early footprint: the same in every order.
        const footprint = {
          captured: sorted(spy.capture.map((c, i) => `${spy.site[i]}: ${String(c.transcript)}`)),
          held: sorted(heldRecords()),
          earlySites: sorted(earlySites),
          jobs: spy.jobs,
          kg: sorted(spy.kg.map(marlo)),
        };
        if (!first.has(p)) first.set(p, footprint);
        expect(footprint, at).toEqual(first.get(p));
        // Call end: human signals and the arc get every record but the held ones.
        const promotable = turns.filter((t) => !t.sessionOnly);
        const end = await callEnd(call);
        expect(end.signals, at).toEqual([promotable.map((t) => t.transcript)]);
        expect(endShape(end).find((w) => w[2] === 'arc entries')?.[3], at).toBe(promotable.length);
        await call.detach();
        cleanupSession(call.sessionId);
        resetSpies();
      }
    }
  }, 300_000);

  // The classifier on, as a stub (every model call answered here, none to the network), on a line
  // only the model reads as a crisis: this pins the classifier's RUN CACHE under landing order for
  // a classifier-only crisis, nothing more. Segment 1 is the order asked for (its run lands last);
  // segment 2 puts an ordinary read of an earlier run in the cache before the crisis run's read.
  for (const [p, order] of [
    [1, [2, 3, 1]],
    [2, [1, 3, 2]],
  ] as const) {
    it(`run cache, classifier on: a line only the model reads as a crisis at segment ${p}, its run landing last: held from it on`, async () => {
      spy.gemini = true;
      vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'live');
      const segments = PRIYA.map((l, i) => (i + 1 === p ? MODEL_ONLY : l));
      const texts = turnSoFar(segments);
      const call = await drivenTurn(segments, order);
      expect(await quiet(3)).toBe(true);
      // Live and contained: the patterns read no crisis in any run, the classifier was asked once
      // per run (the path: a cached verdict served to a later run lowers this count), and nothing
      // reached the network.
      expect(spy.patterns.length).toBeGreaterThanOrEqual(3);
      expect(spy.patterns.filter(Boolean)).toEqual([]);
      expect(spy.modelCalls.filter((m) => m === 'classifier').length).toBe(3);
      // Scope is unset with the adjudicator and the agreement gate off (their defaults), so this row
      // never reaches the adjudicator or the turn-read maps; a row with those flags on belongs to the
      // follow-up that holds processTurn's copies.
      expect(spy.modelCalls.filter((m) => m === 'adjudicator').length).toBe(0);
      expect(spy.modelCalls.filter((m) => m === 'other').length).toBe(0);
      expect(spy.realCalls).toBe(0);
      const atHandler = spy.capture
        .filter((_c, i) => spy.site[i] === 'turn-handler')
        .map((c) => String(c.transcript));
      expect(atHandler.filter((t) => t.includes('Quillmere'))).toEqual([]);
      expect([...atHandler].sort()).toEqual(texts.slice(0, p - 1).sort());
      expect([...heldRecords()].sort()).toEqual(texts.slice(p - 1).sort());
      expect(heldLog()).toEqual(
        texts
          .slice(p - 1)
          .map(() => ({ site: 'turn-handler', reason: 'crisis', sessionId: call.sessionId }))
      );
      await call.detach();
    }, 60_000);
  }

  // The same line and orders with the agreement gate on: the turn's read now has scope, so it
  // waits for the turn's other reads (turn-read maps) before it settles, and the turn's earlier
  // lines reach each read (turn-intelligence.ts:155-160). The stub answers by marker on everything
  // it is handed, so a run is held when the marker reached its read by any field: the row asserts
  // what each read was handed (lengths, marker field) and that the hold follows it.
  // B1: the adjudicator at its default (off). B2: in shadow, answering escalate, and answering the
  // opposite of the classifier (checkin): shadow must not change the hold, so B2's held set is
  // derived exactly as B1's, from the reads alone.
  for (const [adjudicator, says] of [
    [undefined, 'escalate'],
    ['shadow', 'escalate'],
    ['shadow', 'checkin'],
  ] as const) {
    for (const [p, order] of [
      [1, [2, 3, 1]],
      [2, [1, 3, 2]],
    ] as const) {
      const flags = adjudicator ? `adjudicator shadow answering ${says}` : 'adjudicator default';
      it(`agreement gate on, ${flags}: model-only line at segment ${p}, its run landing last: the hold follows each read`, async () => {
        spy.gemini = true;
        spy.adjudicatorSays = says;
        vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'live');
        vi.stubEnv('CRISIS_AGREEMENT_GATE', 'on');
        if (adjudicator) vi.stubEnv('CRISIS_ADJUDICATOR', adjudicator);
        const segments = PRIYA.map((l, i) => (i + 1 === p ? MODEL_ONLY : l));
        const texts = turnSoFar(segments);
        // The adjudicator judges a line only with Ferni's line and an earlier caller line before
        // it (crisis-adjudicator.ts normalizeTranscript); without them it escalates unasked.
        const call = await drivenTurn(segments, order, {
          userData: { lastAgentResponse: FERNI_BEFORE, recentTranscripts: [CALLER_BEFORE] },
        });
        expect(await quiet(3)).toBe(true);
        expect(spy.patterns.filter(Boolean)).toEqual([]);
        expect(spy.realCalls).toBe(0);
        // One read per run, each handed its own run's text as LATEST.
        expect(spy.handed.map((h) => h.latest).sort()).toEqual(texts.map((t) => t.length).sort());
        expect(spy.handed.filter((h) => h.inLatest).length).toBe(3 - p + 1);
        const adjudicated = spy.modelCalls.filter((m) => m === 'adjudicator').length;
        if (adjudicator) expect(adjudicated).toBeGreaterThan(0);
        else expect(adjudicated).toBe(0);
        expect(spy.modelCalls.filter((m) => m === 'other').length).toBe(0);
        // The hold follows each read: held exactly the runs whose read was handed the marker.
        const read = new Map(spy.handed.map((h) => [h.latest, h.inLatest || h.inEarlier]));
        const held = texts.filter((t) => read.get(t.length));
        expect(held.length).toBeGreaterThanOrEqual(3 - p + 1);
        expect([...heldRecords()].sort()).toEqual([...held].sort());
        const atHandler = spy.capture
          .filter((_c, i) => spy.site[i] === 'turn-handler')
          .map((c) => String(c.transcript));
        expect(atHandler.filter((t) => t.includes('Quillmere'))).toEqual([]);
        expect([...atHandler].sort()).toEqual(texts.filter((t) => !held.includes(t)).sort());
        const line = { site: 'turn-handler', reason: 'crisis', sessionId: call.sessionId };
        expect(heldLog()).toEqual(held.map(() => line));
        await call.detach();
      }, 60_000);
    }
  }

  it('an ordinary turn after it is captured at the turn handler as main', async () => {
    const call = liveSession();
    call.say(CRISIS);
    call.agentThinks();
    await quiet(1);
    call.agentSpeaks();
    call.agentListens();
    call.say(ORDINARY);
    call.agentThinks();
    await quiet(2);
    const atTurnHandler = spy.capture.filter((_c, i) => spy.site[i] === 'turn-handler');
    expect(atTurnHandler.map((c) => c.transcript)).toEqual([ORDINARY]);
    expect(heldRecords()).toEqual([CRISIS]);
    await call.detach();
    cleanupSession(call.sessionId);
  }, 60_000);

  it("end of call: human signals and the emotional arc skip the turn handler's session-only copies and their voice", async () => {
    const call = liveSession();
    call.say(ORDINARY);
    call.agentThinks();
    await quiet(1);
    call.agentSpeaks();
    call.agentListens();
    // The caller sounds different on the crisis turn. With BACKGROUND_VOICE_EMOTION on (its
    // default is off, and then no turn-path record carries a voice), the turn handler records it.
    vi.stubEnv('BACKGROUND_VOICE_EMOTION', 'on');
    call.userData.voiceEmotion = SHAKY_VOICE;
    call.say(CRISIS);
    call.say('yeah');
    call.agentThinks();
    await quiet(3);
    const turns = getRecentTurns(call.sessionId);
    const promotable = turns.filter((t) => !t.sessionOnly);
    // Precondition: the turn handler's two records of the crisis turn (one per run) are session
    // only and carry the voice; no other record carries one.
    const held = turns.filter((t) => t.sessionOnly).map((t) => t.transcript);
    expect(held).toHaveLength(2); // a run's text is the turn so far: the line, then line + "yeah"
    expect(held.every((t) => t.startsWith(CRISIS))).toBe(true);
    expect(turns.filter((t) => t.sessionOnly && t.voiceEmotion)).toHaveLength(2);
    expect(promotable.filter((t) => t.voiceEmotion)).toHaveLength(0);
    await onSessionEnd(call.sessionId, call.userId);
    // Row 6: human signals is handed every record but the session-only ones, in order.
    expect(spy.signalsIn).toEqual([promotable.map((t) => t.transcript)]);
    // Row 8: the promotion's arc has one entry per promotable record and no voice at all.
    const arcs = rec.payloads.filter((p) =>
      p.split(' ')[1]?.endsWith(`/emotional_arcs/${call.sessionId}`)
    );
    expect(arcs).toHaveLength(1);
    const arc = JSON.parse(arcs[0].split(' ').slice(2).join(' ')) as Record<string, unknown>;
    expect(arc.trajectory).toHaveLength(promotable.length);
    expect(arc.voiceTrajectory).toBeUndefined();
    expect(JSON.stringify(arc.trajectory)).not.toContain('voiceEmotion');
    await call.detach();
  }, 90_000);
});

/**
 * What this PR does NOT do yet, pinned so it cannot read as held: the transcript handler and
 * processTurn capture and record the line before the turn's crisis read, unmarked, so through the
 * live path a crisis line is still extracted and promoted at call end. The follow-up PRs that
 * hold those sites flip this block to "nothing captured, nothing promoted".
 */
/**
 * The KNOWN GAP's copies of a crisis line: the transcript handler captures its segment once, and
 * processTurn captures each run that carries the line. The landing-order row uses the same counts.
 */
const EARLY_COPIES = { transcriptHandler: 1, processTurnPerRun: 1 };
const earlyCopies = (runs: number): string[] => [
  ...Array<string>(EARLY_COPIES.transcriptHandler).fill('transcript-handler'),
  ...Array<string>(EARLY_COPIES.processTurnPerRun * runs).fill('process-turn'),
];

describe('KNOWN GAP (closed by the follow-up PRs): the two early capture sites', () => {
  it('a crisis line is still captured before the read and promoted through their unmarked copies', async () => {
    const call = liveSession();
    call.say(CRISIS);
    call.agentThinks();
    await quiet(1);
    const marlo = (t: unknown) => String(t).includes('Marlo');
    // Rows 1 to 4: both early sites capture it (two deep extraction jobs) and one queues it for
    // the knowledge graph; the turn handler does not capture it.
    const sites = spy.site.filter((_s, i) => marlo(spy.capture[i].transcript));
    expect(sites.sort()).toEqual(['process-turn', 'transcript-handler']);
    expect(sites.sort()).toEqual(earlyCopies(1).sort());
    expect(spy.jobs).toBe(2);
    expect(carrying(['Marlo']).queued).toHaveLength(1);
    // Their two records are promotable and extracted; only the turn handler's is session only.
    const turns = getRecentTurns(call.sessionId).filter((t) => marlo(t.transcript));
    expect(turns.map((t) => Boolean(t.sessionOnly)).sort()).toEqual([false, false, true]);
    // Call end, every write in order: the line's two names reach shared memories and promoted
    // entities from the two unmarked copies, and human signals is handed both copies.
    const end = await callEnd(call);
    expect(end.signals).toEqual([[CRISIS, CRISIS]]);
    const what = end.writes.map((w) => {
      const [op, path, ...json] = w.split(' ');
      const body = JSON.parse(json.join(' ')) as Record<string, unknown>;
      return [op, path, body.name ?? String(body.content).split('.')[0], body.mentionCount];
    });
    expect(what).toEqual([
      ['set', 'users/<user>/shared_memories/<id>', 'friend (person): mentioned 2x', undefined],
      ['set', 'users/<user>/shared_memories/<id>', 'Marlo (person): mentioned 2x', undefined],
      ['set', 'bogle_users/<user>/promoted_entities/<id>', 'friend', 2],
      ['set', 'bogle_users/<user>/promoted_entities/<id>', 'Marlo', 2],
    ]);
    await call.detach();
    cleanupSession(call.sessionId);
  }, 90_000);
});
