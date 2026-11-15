/**
 * TURN_PATH_SINGLE_CAPTURE: once the turn path is attached to the call's session
 * (noteTurnPathAttached, from attachTurnContextPusher), the transcript handler no longer captures
 * a final transcript into dynamic memory (process-turn and the turn handler capture every run
 * that carries it). Where nothing attached the turn path (the single-agent path, or
 * TURN_INTELLIGENCE=off) it captures as before, and with the flag off nothing changes.
 *
 * The real transcript handler runs; fastCapture and recordTurn are spies, stores record writes
 * only (tests/helpers/write-recorder.ts), no model is called and fetch is refused. The mocked
 * module is the one the handler loads: transcript-handler.ts imports fastCapture and recordTurn
 * from '../../memory/dynamic/index.js', the file mocked below. Each row
 * waits for the handler's turn-count step, which comes after the capture block, so a row with
 * zero captures passed that block rather than stopping early. All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  recordTurn: vi.fn(),
}));
vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: vi.fn(async () => ({})),
}));
vi.mock('../../processors/tool-routing-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  runFTISRouting: vi.fn(async () => ({ handled: false })),
}));
const rec = await vi.hoisted(async () => {
  const { createWriteRecorder } = await import('../../../tests/helpers/write-recorder.js');
  return createWriteRecorder();
});
vi.mock('../../../utils/shared-firestore.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sharedFirestore: () => rec.db,
}));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => rec.db,
}));
vi.mock('../../../memory/storage/redis-cache/factory.js', async (orig) => ({
  ...(await orig<object>()),
  getRedisCache: () => rec.redis,
  getRedisCacheAsync: async () => rec.redis,
}));
// No model call from a test: the low-confidence emotion pass gets no answer.
vi.mock('../../../services/llm-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createEmotionLLMCaller: () => async () => Promise.reject(new Error('no model in tests')),
}));
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: w.fastCapture,
  recordTurn: w.recordTurn,
}));

import { crisisGuidedTurn } from '../../../services/safety/crisis-turn-mark.js';
import {
  crisisDecidedOn,
  crisisVerdictPending,
  noteCrisisVerdictPending,
  signalGateDecisions,
} from '../../safety/crisis-gate-signal.js';
import { noteTurnPathAttached } from '../../shared/turn-path-capture.js';
import { createTranscriptHandler } from '../transcript-handler.js';

const MEMBER = 'member-uid-7c2d';
const SAID = 'my neighbor Quill Harrowby is moving to Lakeview next month';
/** A fictional crisis-worded caller line, written for this file. */
const CRISIS_SAID = 'honestly i dont see the point anymore, i keep thinking about not waking up';

let fetches = 0;
beforeEach(() => {
  fetches = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    fetches += 1;
    throw new Error('no network in tests');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  w.fastCapture.mockClear();
  w.recordTurn.mockClear();
});

/** Anything the handler touches that isn't under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

let n = 0;
/** One final transcript through a real handler built on the given call session; its sessionId. */
async function finalTranscript(
  session: object,
  { said = SAID, userData = { userId: MEMBER, turnCount: 2 } } = {}
): Promise<string> {
  const sessionId = `turn-path-single-capture-${++n}`;
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: session as never,
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: userData as never,
    userId: MEMBER,
    sessionId,
    silenceContext: { topicsDiscussed: [], memorableMoments: [] } as never,
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getToolsForDomains: () => ({}),
    },
    agent: stub(),
    autoOptimizer: { processUserMessage: vi.fn() },
  });
  handler({ transcript: said, isFinal: true } as never);
  // transcript-handler steps turnCount after the capture block, so the block has run by then
  await vi.waitFor(() => expect(userData.turnCount).toBe(3), { timeout: 10_000 });
  return sessionId;
}

/**
 * A call session that records every method call made on it, at any depth, as [path, ...args].
 * Children are cached, so `session.userData` is one object; it is the call's userData, as in a
 * live call, so a mark the gate leaves on session.userData lands where the handler sees it.
 */
function recordingSession(userData: object): { session: object; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const made = new Map<string, unknown>();
  const make = (path: string): unknown => {
    if (made.has(path)) return made.get(path);
    // The root is an object, as a live session is (the gate's marks key on typeof 'object').
    const proxy: unknown = new Proxy(path === 'session' ? {} : () => undefined, {
      get: (_t, k) => {
        if (k === 'then') return undefined;
        if (k === Symbol.toPrimitive) return () => '';
        if (path === 'session' && k === 'userData') return userData;
        return make(`${path}.${String(k)}`);
      },
      apply: (_t, _this, args: unknown[]) => {
        calls.push([path, ...args]);
        return make(`${path}()`);
      },
    });
    made.set(path, proxy);
    return proxy;
  };
  return { session: make('session') as object, calls };
}

/** A recorded call, comparable across two calls: functions and cycles named, the sessionId masked. */
function comparable(call: unknown[], sessionId: string): string[] {
  return call.map((arg) => {
    if (typeof arg === 'function') return '[function]';
    try {
      return (JSON.stringify(arg) ?? String(arg)).replaceAll(sessionId, '<sessionId>');
    } catch {
      return '[unserializable]';
    }
  });
}

/** Waits until no session call has been recorded for 150 ms (3 s at most): the turn's work is done. */
async function quiet(calls: unknown[][]): Promise<void> {
  for (let waited = 0, seen = -1; seen !== calls.length && waited < 3_000; waited += 150) {
    seen = calls.length;
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
  }
}

/**
 * One crisis-worded final transcript on a call with the turn path attached and `mark` left on the
 * session first, with TURN_PATH_SINGLE_CAPTURE set to `flag`. Returns the captures, their
 * arguments, the calls the mark itself made, and every session call the handler made after it.
 */
async function crisisTurn(flag: 'on' | 'off', mark: (session: object, userData: object) => void) {
  vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', flag);
  w.fastCapture.mockClear();
  w.recordTurn.mockClear();
  const userData = { userId: MEMBER, turnCount: 2 };
  const { session, calls } = recordingSession(userData);
  noteTurnPathAttached(session);
  mark(session, userData);
  const marked = calls.length;
  const sessionId = await finalTranscript(session, { said: CRISIS_SAID, userData });
  await quiet(calls);
  return {
    session,
    userData,
    sessionId,
    captures: captures(),
    fastCapture: [...w.fastCapture.mock.calls],
    recordTurn: [...w.recordTurn.mock.calls],
    markCalls: calls.slice(0, marked),
    handlerCalls: calls.slice(marked).map((call) => comparable(call, sessionId)),
  };
}

/** The off run captures exactly as main does (the 'flag off' row's arguments). */
function capturedAsMain(off: Awaited<ReturnType<typeof crisisTurn>>): void {
  expect(off.captures).toEqual({ fastCapture: 1, recordTurn: 1 });
  expect(off.fastCapture[0]).toEqual([
    expect.objectContaining({
      userId: MEMBER,
      sessionId: off.sessionId,
      turnNumber: 0,
      transcript: CRISIS_SAID,
    }),
  ]);
  expect(off.recordTurn[0]).toEqual([off.sessionId, MEMBER, expect.anything(), CRISIS_SAID, 0]);
}

const captures = () => ({
  fastCapture: w.fastCapture.mock.calls.length,
  recordTurn: w.recordTurn.mock.calls.length,
});

describe('TURN_PATH_SINGLE_CAPTURE', { timeout: 60_000 }, () => {
  it('B1: the turn path attached, flag on: the transcript handler captures nothing', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    const session = stub();
    // In-row control: on the same session before the turn path attaches, the handler reaches
    // the mocked capture, so the 0 added below is the skip, not a mock the handler never imports.
    await finalTranscript(session);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    noteTurnPathAttached(session);
    await finalTranscript(session);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  });

  it('B2: no turn path attached (single-agent or TURN_INTELLIGENCE=off): captures', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    await finalTranscript(stub()); // handler-setup.ts never calls attachTurnContextPusher
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  });

  it('B2: another call attached the turn path, flag on: this call still captures', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'on');
    noteTurnPathAttached(stub()); // a different session in the same process
    await finalTranscript(stub());
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(fetches).toBe(0);
  });

  it('flag off: the turn path attached still captures exactly as main', async () => {
    vi.stubEnv('TURN_PATH_SINGLE_CAPTURE', 'off'); // explicit: a run with every flag on stays honest
    const session = stub();
    noteTurnPathAttached(session);
    await finalTranscript(session);
    expect(captures()).toEqual({ fastCapture: 1, recordTurn: 1 });
    expect(w.fastCapture).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MEMBER, turnNumber: 0, transcript: SAID })
    );
    expect(w.recordTurn).toHaveBeenCalledWith(
      expect.stringMatching(/^turn-path-single-capture-/),
      MEMBER,
      expect.anything(),
      SAID,
      0
    );
    expect(fetches).toBe(0);
  });

  // The transcript handler reads none of the gate's crisis signals: no gate decision, no pending
  // verdict. The flag only removes its duplicate capture of the line; the reply is made by the
  // LLM node (crisis-gate.ts), which this flag does not touch. These two rows cover this one
  // capture site. The all-sites row, "no more capture for the turn" across every capture site, is
  // pending: the early-memory-hold PR owns it, on the live-path harness.
  it('crisis-guided turn, turn path attached: flag on captures nothing, the handler acts the same on and off', async () => {
    // The real call the gate makes on a guided reply (crisis-gate.ts:362).
    const guided = (session: object): void =>
      signalGateDecisions(session, { decision: { action: 'guide' }, escalation: null });
    const on = await crisisTurn('on', guided);
    const off = await crisisTurn('off', guided);
    for (const run of [on, off]) {
      // The guide landed: the session and its userData carry the gate's real marks.
      expect(crisisDecidedOn(run.session)).toBe(true);
      expect(crisisGuidedTurn(run.userData)).toBe(true);
      expect(run.markCalls).toEqual([
        ['session.emit', 'crisis_gate_decision', { action: 'guide' }],
      ]);
    }
    expect(on.captures).toEqual({ fastCapture: 0, recordTurn: 0 });
    capturedAsMain(off);
    expect(on.handlerCalls).toEqual(off.handlerCalls);
    expect(fetches).toBe(0);
  });

  it('crisis read pending (reply held), turn path attached: flag on captures nothing, the handler acts the same on and off', async () => {
    // The real call the gate makes while the classifier holds the reply (crisis-gate.ts:365).
    const held = (session: object): void =>
      noteCrisisVerdictPending(
        session,
        new Promise<never>(() => {
          /* never settles: the read stays pending */
        })
      );
    const on = await crisisTurn('on', held);
    const off = await crisisTurn('off', held);
    for (const run of [on, off]) {
      expect(crisisVerdictPending(run.session)).not.toBeNull(); // still held when the line came
      expect(run.markCalls).toEqual([]);
    }
    expect(on.captures).toEqual({ fastCapture: 0, recordTurn: 0 });
    capturedAsMain(off);
    expect(on.handlerCalls).toEqual(off.handlerCalls);
    expect(fetches).toBe(0);
  });
});
