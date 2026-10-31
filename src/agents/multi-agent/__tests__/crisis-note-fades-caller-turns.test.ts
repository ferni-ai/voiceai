/**
 * CRISIS_SAME_CALL_NOTE_FADES (#3000, #3034 round 6): the same-call "CRISIS FOLLOW-UP"
 * note shows for the next 3 CALLER turns after a crisis, then stops, and a new signal
 * restarts it.
 *
 * Round 5 counted with userData.turnCount. On the live voice path that steps twice
 * per utterance (handler-setup.ts on every final transcript, then
 * processFinalTranscript), so "3 turns" was 1 reply. The fade now counts caller turns
 * (shared/caller-turn-count.ts), and turnCount is left alone.
 *
 * This runs the live path end to end, faking only the store and the clock:
 *   session final transcript -> createUserInputTranscribedHandler (user-input-transcribed.ts, wired by handler-setup.ts)
 *     -> createTranscriptHandler / processFinalTranscript (steps turnCount again)
 *   the same transcript -> createTurnContextPusher -> createTurnIntelligenceHook
 *     -> the real buildContextInjections (writer: buildHumanTransferInjections,
 *        reader: buildCrisisHistoryInjection), as turn-handler's processTurn runs it.
 * Mutating the two call sites in turn-processor/context-injections.ts back to
 * turnCount makes the fade tests fail.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const stores = new Map<string, Array<Record<string, unknown>>>();
  const docsOf = (key: string) => {
    if (!stores.has(key)) stores.set(key, []);
    return stores.get(key)!;
  };
  const query = (docs: Array<Record<string, unknown>>) => {
    let rows = [...docs];
    const chain = {
      where: (field: string, _op: string, value: string) => {
        rows = rows.filter((d) => String(d[field]) >= value);
        return chain;
      },
      orderBy: (field: string) => {
        rows.sort((a, b) => String(b[field]).localeCompare(String(a[field])));
        return chain;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return chain;
      },
      get: async () => ({ docs: rows.map((d) => ({ data: () => structuredClone(d) })) }),
      add: async (doc: Record<string, unknown>) => void docs.push(doc),
    };
    return chain;
  };
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (name: string) => query(docsOf(`${uid}/${name}`)) }),
    }),
  };
  return { db, stores };
});

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));

const { createUserInputTranscribedHandler } = await import(
  '../../voice-agent-entry/user-input-transcribed.js'
);
const { createTranscriptHandler } = await import('../../voice-agent/transcript-handler.js');
const { createTurnContextPusher, createTurnIntelligenceHook } = await import(
  '../turn-intelligence.js'
);
const { buildContextInjections } = await import(
  '../../processors/turn-processor/context-injections.js'
);

const T0 = Date.parse('2026-10-29T05:40:00Z');
const CRISIS = "i can't breathe, please help me";
const OKAY = 'okay sure, that makes sense to me';
const fades = () => vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', 'on');

let calls = 0;

/** Anything the transcript handler touches that isn't under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

/** One call: the live listeners wired as in prod, and a record of which turns carried the note. */
function liveCall() {
  calls += 1;
  const sessionId = `session-AJ_fade-${calls}`;
  const userId = `uid-fade-${calls}`;
  const persona = { id: 'ferni', name: 'Ferni' };
  const services = { sessionId, userId } as never;
  const userData: Record<string, unknown> = { userId, turnCount: 0 };
  const carried = new Set<number>(); // caller turns (1, 2, 3...) whose context carried the note
  let turns = 0;

  const { handler } = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: persona as never,
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
    autoOptimizer: { processUserMessage: vi.fn() },
  });
  const onTranscribed = createUserInputTranscribedHandler({
    userData,
    userId,
    sessionId,
    crisisGuardMode: 'off' as never,
    transcriptHandler: { handler },
  });

  /** What turn-handler's processTurn does with the hook's userData: the real builders. */
  const handle = async (ctx: { userData: unknown; userText: string }) => {
    const args = [
      {
        services,
        userData: ctx.userData,
        persona,
        userText: ctx.userText,
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      },
      { analysis: { intent: 'chat', emotion: 'neutral', topics: [] }, currentTopic: undefined },
      { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
      { length: { guidance: 'Keep it short.' } },
      { needsReinforcement: false },
      null,
      undefined,
      {},
    ] as never as Parameters<typeof buildContextInjections>;
    const { injections } = await buildContextInjections(...args);
    if (injections.some((i) => i.category === 'crisis_follow_up')) carried.add(turns);
  };
  const newPusher = () =>
    createTurnContextPusher(
      createTurnIntelligenceHook({
        persona: persona as never,
        services,
        userData: userData as never,
        handle: handle as never,
      }),
      { chatCtx: { copy: () => stub() }, updateChatCtx: async () => {} } as never
    );
  let pusher = newPusher();

  const stored = () => fake.stores.get(`${userId}/crisis_signals`)?.length ?? 0;
  const turnCountSteps = () => userData.turnCount as number;

  /** The caller takes a turn made of these final transcripts, then Ferni replies. */
  async function callerTurn(...segments: string[]) {
    turns += 1;
    vi.setSystemTime(T0 + turns * 10_000); // every signal is newer than the last
    const before = stored();
    let heard = '';
    let logged = 0; // the writer logs once per segment whose words so far carry the crisis
    for (const words of segments) {
      const stepsBefore = turnCountSteps();
      onTranscribed({ transcript: words, isFinal: true });
      // handler-setup steps it now; processFinalTranscript steps it again a moment later
      await vi.waitFor(() => expect(turnCountSteps()).toBe(stepsBefore + 2));
      await pusher.onFinalTranscript(words);
      heard = `${heard} ${words}`;
      if (/breathe/.test(heard)) logged += 1;
    }
    await vi.waitFor(() => expect(stored()).toBe(before + logged));
    await pusher.onAgentState('thinking'); // the turn is over; the reply starts
    await pusher.onAgentState('listening');
  }

  return {
    callerTurn,
    /** The caller turns after `turn` that carried the note. (On the turn itself it can ride a later segment.) */
    notedAfter: (turn: number) => [...carried].filter((t) => t > turn).sort((a, b) => a - b),
    userData,
    handOffToANewPusher: () => {
      pusher = newPusher(); // a persona handoff re-attaches the pusher on the same call
    },
    get turns() {
      return turns;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const turnsOf = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('the premise: turnCount cannot count caller turns on the live path', () => {
  it('steps twice for one utterance (left alone; the fade does not read it)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = liveCall();
    await call.callerTurn(OKAY);
    await call.callerTurn(OKAY);
    await call.callerTurn(OKAY);
    expect(call.userData.turnCount).toBe(2 * call.turns);
  }, 30_000);
});

describe('CRISIS_SAME_CALL_NOTE_FADES, through the live handlers', () => {
  it('flag off (main): the note rides every later turn', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = liveCall();
    await call.callerTurn(OKAY);
    await call.callerTurn(CRISIS);
    for (let i = 0; i < 6; i += 1) await call.callerTurn(OKAY);
    expect(call.notedAfter(2)).toEqual(turnsOf(3, 8));
    expect(fake.stores.get(`${call.userData.userId}/crisis_signals`)?.[0]).not.toHaveProperty(
      'turn'
    );
  }, 60_000);

  it('flag on: a crisis on caller turn N shows on N+1, N+2, N+3 and is gone at N+4', async () => {
    fades();
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = liveCall();
    await call.callerTurn(OKAY); // turn 1
    await call.callerTurn(CRISIS); // N = 2
    for (let i = 0; i < 6; i += 1) await call.callerTurn(OKAY); // 3..8
    expect(call.notedAfter(2)).toEqual([3, 4, 5]);
    expect(fake.stores.get(`${call.userData.userId}/crisis_signals`)?.[0]).toMatchObject({
      turn: 2,
    });
  }, 60_000);

  it('flag on: a repeat signal restarts the three turns, inside the window or after it', async () => {
    fades();
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = liveCall();
    await call.callerTurn(CRISIS); // 1
    await call.callerTurn(OKAY); // 2: noted
    await call.callerTurn(CRISIS); // 3: noted, restarts
    for (let i = 0; i < 5; i += 1) await call.callerTurn(OKAY); // 4..8
    await call.callerTurn(CRISIS); // 9: after the note faded
    for (let i = 0; i < 5; i += 1) await call.callerTurn(OKAY); // 10..14
    expect(call.notedAfter(1)).toEqual([2, 3, 4, 5, 6, 10, 11, 12]);
  }, 90_000);

  it('flag on: a turn spoken in several final transcripts is one turn', async () => {
    fades();
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = liveCall();
    await call.callerTurn("okay, so, i can't breathe,", 'please help me', 'right now');
    await call.callerTurn(OKAY, 'and one more thing about that');
    for (let i = 0; i < 4; i += 1) await call.callerTurn(OKAY);
    expect(call.notedAfter(1)).toEqual([2, 3, 4]);
  }, 90_000);

  it('flag on: a persona handoff mid-call (a new pusher) carries on from the call count', async () => {
    fades();
    vi.useFakeTimers({ toFake: ['Date'] });
    const call = liveCall();
    await call.callerTurn(CRISIS); // 1
    await call.callerTurn(OKAY); // 2
    call.handOffToANewPusher();
    for (let i = 0; i < 4; i += 1) await call.callerTurn(OKAY); // 3..6
    expect(call.notedAfter(1)).toEqual([2, 3, 4]);
  }, 60_000);
});
