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
 * turn's crisis read, a crisis turn is captured by nothing: its line stays in this call's
 * short-term memory only, and session-end promotion skips it. The transcript handler and
 * processTurn capture before the read; holding them is a follow-up. All lines are fictional.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
}));

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
const CRISIS =
  "honestly i don't want to be here anymore, my friend Marlo Quince keeps asking about Saturday";
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

let n = 0;

interface LiveOptions {
  /** TURN_INTELLIGENCE as the agent's environment sets it. */
  env?: Record<string, string | undefined>;
  /** Run numbers (1-based, in the order runs start) that fail before their crisis read. */
  failRuns?: number[];
}

/** A session wired as agent-setup.ts wires a call: the switch read, the pusher, the handler. */
function liveSession(opts: LiveOptions = {}) {
  const sessionId = `live-path-${++n}`;
  const userId = `member-${sessionId}`;
  const session = new EventEmitter();
  const userData = { userId, turnCount: 3 } as Record<string, unknown>;
  // The session's ids; every other service is a no-op, so the whole turn runs to its end.
  const ids: Record<PropertyKey, unknown> = { sessionId, userId, userProfile: undefined };
  const services = new Proxy(ids, {
    get: (t, k) => (k in t ? t[k] : (stub() as Record<PropertyKey, unknown>)[k]),
  }) as never;
  const persona = { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as never;
  let runs = 0;
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
        if (opts.failRuns?.includes(++runs)) throw new Error('turn run failed before its read');
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

/** Waits for `runs` background turn runs, then lets their fire-and-forget writers finish. */
async function quiet(runs: number, settleMs = 2000): Promise<void> {
  await vi.waitFor(() => expect(spy.handled).toBeGreaterThanOrEqual(runs), {
    timeout: 45_000,
    interval: 100,
  });
  let last = -1;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => {
      setTimeout(r, 100);
    });
    const now = spy.capture.length + spy.record.length;
    if (now === last && i * 100 > settleMs) return;
    last = now;
  }
}

afterEach(() => {
  spy.capture.length = 0;
  spy.captureAt.length = 0;
  spy.record.length = 0;
  spy.handled = 0;
  spy.jobs = 0;
  spy.kg.length = 0;
  spy.stmContext = 0;
  rec.writes.length = 0;
  rec.payloads.length = 0;
  spy.held.length = 0;
  spy.site.length = 0;
  spy.signalsIn.length = 0;
  vi.unstubAllEnvs();
});

/**
 * The captures and short-term records, as main's snapshot compares them. `turnRace` replaces the
 * turn-path sites' turn number (userData.turnCount, read by processTurn at process-turn.ts:352)
 * with "N": each segment's transcript handler adds one to it (transcript-handler.ts:1523) after
 * its capture, so on main as here the number a run reads depends on which finishes first.
 */
function made(turnRace = false): { captures: string[]; records: string[]; jobs: number } {
  const n = (t: unknown) => (turnRace && t !== 0 ? 'N' : t);
  return {
    captures: spy.capture
      .map((c) => JSON.stringify({ ...c, timestamp: undefined, turnNumber: n(c.turnNumber) }))
      .sort(),
    records: spy.record.map((r) => JSON.stringify([r[0], r[1], r[3], n(r[4]), r[5]])).sort(),
    jobs: spy.jobs,
  };
}

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

describe('ordinary turns on the live path make the captures main made', () => {
  it('one segment: same count, same arguments', async () => {
    const call = liveSession();
    call.say(ORDINARY);
    call.agentThinks();
    await quiet(1);
    expect(made()).toMatchSnapshot();
    // Positive control for the site attribution the crisis tests use.
    expect([...spy.site].sort()).toEqual(['process-turn', 'transcript-handler', 'turn-handler']);
    expect(heldRecords()).toEqual([]);
    // No reply reads the short-term memory's entities, on main or here (condition 4).
    expect(spy.stmContext).toBe(0);
    await onSessionEnd(call.sessionId, call.userId);
    // Positive control for the end-of-call probe: the ordinary line's names are promoted.
    expect(carrying(['Dana']).written.length).toBeGreaterThan(0);
    expect(spy.signalsIn).toEqual([[ORDINARY, ORDINARY, ORDINARY]]);
    await call.detach();
  }, 60_000);

  it('P1: three segments: every segment captured, same count and arguments as main', async () => {
    const call = liveSession();
    call.say('So my sister Priya Holt is visiting from Denver.');
    call.say('We are going to the Larkspur farmers market.');
    call.say('Then dinner at her favorite noodle place on Friday.');
    call.agentThinks();
    await quiet(3);
    expect(made(true)).toMatchSnapshot();
    expect(heldRecords()).toEqual([]);
    await call.detach();
    cleanupSession(call.sessionId);
  }, 60_000);

  it('P1: three segments with the middle run failing before its read: still kept, as main', async () => {
    const call = liveSession({ failRuns: [2] });
    call.say('So my sister Priya Holt is visiting from Denver.');
    call.say('We are going to the Larkspur farmers market.');
    call.say('Then dinner at her favorite noodle place on Friday.');
    call.agentThinks();
    await quiet(3);
    expect(made(true)).toMatchSnapshot();
    expect(heldRecords()).toEqual([]);
    await call.detach();
    cleanupSession(call.sessionId);
  }, 60_000);

  it('switch off (TURN_INTELLIGENCE=off): the line of any kind is captured as main', async () => {
    const call = liveSession({ env: { TURN_INTELLIGENCE: 'off' } });
    call.say(ORDINARY);
    call.say(CRISIS);
    await vi.waitFor(() => expect(spy.record.length).toBe(2), { timeout: 30_000, interval: 100 });
    await new Promise((r) => setTimeout(r, 1000));
    expect(made()).toMatchSnapshot();
    expect(heldRecords()).toEqual([]);
    await call.detach();
    cleanupSession(call.sessionId);
  }, 60_000);
});
describe('a crisis turn at the turn handler capture site is session only', () => {
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

  it('end of call: human signals and the emotional arc skip the session-only records and their voice', async () => {
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
