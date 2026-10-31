/**
 * CALL_REPORT_REACHES_YOU on a call with a crisis: the report of a call Ferni
 * made for the owner waits for the next call. It never rides beside the crisis
 * follow-up note, never pushes it out of a casual turn's budget, and nothing is
 * marked delivered. (Verify of #3080, round 1: on the turns after "i can't
 * breathe", a casual "okay" kept the report and dropped crisis_follow_up.)
 *
 * The live path, faking only the store and the clock (as
 * crisis-note-fades-caller-turns.test.ts does): session final transcript ->
 * user-input-transcribed + the transcript handler (turnCount steps) -> the turn
 * context pusher -> the turn intelligence hook -> the real buildContextInjections,
 * then the real dedup and filter in process-turn.ts's order.
 */
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const stores = new Map<string, Row[]>();
  const marks: Array<{ id: string; data: Row }> = [];
  const docsOf = (key: string) => {
    if (!stores.has(key)) stores.set(key, []);
    return stores.get(key)!;
  };
  const query = (docs: Row[]) => {
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
      get: async () => ({
        empty: rows.length === 0,
        size: rows.length,
        docs: rows.map((d) => ({ id: String(d.id ?? 'x'), data: () => structuredClone(d) })),
        forEach: (fn: (x: { id: string; data: () => Row }) => void) =>
          rows.forEach((d) => fn({ id: String(d.id ?? 'x'), data: () => structuredClone(d) })),
      }),
      add: async (doc: Row) => void docs.push(doc),
      doc: (id: string) => ({ id }),
    };
    return chain;
  };
  const db = {
    collection: () => ({
      doc: (uid: string) => ({ collection: (name: string) => query(docsOf(`${uid}/${name}`)) }),
    }),
    batch: () => ({
      update: (ref: { id: string }, data: Row) => void marks.push({ id: ref.id, data }),
      commit: async () => undefined,
    }),
  };
  return { db, stores, marks };
});

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));

const { createUserInputTranscribedHandler } =
  await import('../../voice-agent-entry/user-input-transcribed.js');
const { createTranscriptHandler } = await import('../../voice-agent/transcript-handler.js');
const { createTurnContextPusher, createTurnIntelligenceHook } =
  await import('../turn-intelligence.js');
const { deduplicateInjections, detectConversationMode, filterInjections } =
  await import('../../../intelligence/utils/injection-filter.js');
const { buildContextInjections } =
  await import('../../processors/turn-processor/context-injections.js');
const { buildAllPendingResultsContext } =
  await import('../../../intelligence/context-builders/external/pending-call-results.js');

const T0 = Date.parse('2026-10-29T05:40:00Z');
const CRISIS = "i can't breathe, please help me";
const OKAY = 'okay sure, that makes sense to me';

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

/** One call with a pending call report, wired as in prod; what each caller turn built and kept. */
function liveCall() {
  calls += 1;
  const sessionId = `session-report-crisis-${calls}`;
  const userId = `uid-report-crisis-${calls}`;
  fake.stores.set(`${userId}/on_behalf_calls`, [
    {
      id: `call-rosa-${calls}`,
      request: { contactName: 'Aunt Rosa' },
      outcome: {
        status: 'completed',
        outcome: 'she says hi and will bake on Sunday',
        objectiveAchieved: true,
        callbackRequired: false,
      },
      capturedAt: new Date(T0).toISOString(),
      delivered: false,
    },
  ]);
  const persona = { id: 'ferni', name: 'Ferni' };
  const services = { sessionId, userId } as never;
  const userData: Record<string, unknown> = { userId, turnCount: 0 };
  const seen: Array<{ built: string[]; kept: string[] }> = [];
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

  /** What turn-handler's processTurn does with the hook's userData. */
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
    const crisisDetected = injections.some(
      (i) => i.category === 'safety' || i.category === 'crisis_response'
    );
    const mode = detectConversationMode(ctx.userText, 0.2, crisisDetected);
    const kept = filterInjections(deduplicateInjections(injections), {
      mode,
      userText: ctx.userText,
      emotionalIntensity: 0.2,
      crisisDetected,
    });
    seen[turns] = { built: injections.map((i) => i.category), kept: kept.map((i) => i.category) };
  };
  const pusher = createTurnContextPusher(
    createTurnIntelligenceHook({
      persona: persona as never,
      services,
      userData: userData as never,
      handle: handle as never,
    }),
    { chatCtx: { copy: () => stub() }, updateChatCtx: async () => {} } as never
  );

  /** The caller says this, then Ferni replies. */
  async function callerTurn(words: string) {
    turns += 1;
    vi.setSystemTime(T0 + turns * 10_000);
    const steps = userData.turnCount as number;
    onTranscribed({ transcript: words, isFinal: true });
    await vi.waitFor(() => expect(userData.turnCount).toBe(steps + 2));
    await pusher.onFinalTranscript(words);
    await vi.waitFor(() => expect(seen[turns]).toBeDefined());
    // The crisis signal is written in the background; the next turn's follow-up reads it.
    if (words === CRISIS)
      await vi.waitFor(() => expect(fake.stores.get(`${userId}/crisis_signals`)?.length).toBe(1));
    await pusher.onAgentState('thinking');
    await pusher.onAgentState('listening');
    return seen[turns];
  }

  return { callerTurn };
}

beforeAll(async () => {
  // Loaded once, so the 150 ms race measures the build, not a cold import.
  await buildAllPendingResultsContext('uid-warm-up');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  fake.marks.length = 0;
});

it('with no crisis, a casual "okay" first turn carries the report (the store and path work)', async () => {
  vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
  vi.useFakeTimers({ toFake: ['Date'] });
  const call = liveCall();
  expect((await call.callerTurn(OKAY)).kept).toContain('pending_background_results');
}, 90_000);

it('after a crisis turn, "okay" turns build crisis_follow_up, keep no report, keep what main keeps, and mark nothing', async () => {
  vi.stubEnv('CRISIS_SAME_CALL_NOTE_FADES', 'on');
  vi.useFakeTimers({ toFake: ['Date'] });
  /** Caller turns 1 to 3 of one call: a crisis, then "okay" twice. */
  const run = async () => {
    const call = liveCall();
    const turns = [await call.callerTurn(CRISIS)];
    for (const _ of [2, 3]) turns.push(await call.callerTurn(OKAY));
    return turns;
  };
  vi.stubEnv('CALL_REPORT_REACHES_YOU', 'off');
  const main = await run();
  vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
  const on = await run();

  expect(on[0].built).not.toContain('pending_background_results');
  expect(on[0].kept).toContain('crisis_follow_up');
  for (const turn of [1, 2]) {
    expect(on[turn].built, `turn ${turn + 1}`).toContain('crisis_follow_up');
    expect(on[turn].kept, `turn ${turn + 1}`).not.toContain('pending_background_results');
    // The report changes nothing on this call: the filter keeps what main keeps.
    expect(on[turn].kept, `turn ${turn + 1}`).toEqual(main[turn].kept);
  }
  expect(fake.marks).toEqual([]);
}, 90_000);
