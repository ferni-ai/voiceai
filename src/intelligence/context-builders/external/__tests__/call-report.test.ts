/**
 * CALL_REPORT_REACHES_YOU: the report of a call Ferni made for the owner
 * reaches the owner's next call, and is marked delivered only once a reply's
 * request carries it (outreach-memory-audit 2026-10-29, B1, B2, B4).
 *
 * Runs the real turn builder (buildContextInjections), the real dedup and
 * filter in process-turn.ts's order, and the real injectTurnContext, over a
 * fake Firestore holding fictional call results.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: string };
type Update = { col: string; id: string; data: Record<string, unknown> };

const fake = vi.hoisted(() => {
  const state = { docs: {} as Record<string, Row[]>, updates: [] as Update[], delayMs: 0 };
  const rows = (col: string): Row[] => (state.docs[col] ??= []);
  const snapshot = (list: Row[]) => ({
    empty: list.length === 0,
    size: list.length,
    docs: list.map((d) => ({ id: d.id, exists: true, data: () => d })),
    forEach: (fn: (doc: { id: string; data: () => Row }) => void) =>
      list.forEach((d) => fn({ id: d.id, data: () => d })),
  });
  const query = (col: string): Record<string, unknown> => ({
    where: () => query(col),
    orderBy: () => query(col),
    limit: () => query(col),
    get: async () => {
      if (state.delayMs) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, state.delayMs);
        });
      }
      return snapshot([...rows(col)]);
    },
  });
  const ref = (col: string, id: string): Record<string, unknown> => ({
    col,
    id,
    get: async () => {
      const row = rows(col).find((r) => r.id === id);
      return { exists: Boolean(row), data: () => row };
    },
    set: async (data: Record<string, unknown>) => void rows(col).push({ ...data, id }),
    update: async () => undefined,
    collection: (name: string) => collection(name),
  });
  const collection = (col: string): Record<string, unknown> => ({
    ...query(col),
    doc: (id?: string) => ref(col, id ?? 'auto-id'),
    add: async () => ({ id: 'auto-id' }),
  });
  const apply = (u: Update) => {
    state.updates.push(u);
    const row = rows(u.col).find((r) => r.id === u.id);
    if (row) Object.assign(row, u.data);
  };
  const db = {
    collection: (name: string) => collection(name),
    batch: () => {
      const pending: Update[] = [];
      return {
        update: (r: { col: string; id: string }, data: Record<string, unknown>) =>
          void pending.push({ col: r.col, id: r.id, data }),
        set: () => undefined,
        commit: async () => pending.forEach(apply),
      };
    },
  };
  return { state, db };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => fake.db,
}));
vi.mock('../../../../services/outreach/delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(),
}));
vi.mock('livekit-server-sdk', () => ({
  DataPacket_Kind: { RELIABLE: 0 },
  RoomServiceClient: class {
    listRooms = async () => [{ name: 'room' }];
    sendData = async () => undefined;
  },
}));

const { buildContextInjections } =
  await import('../../../../agents/processors/turn-processor/context-injections.js');
const { injectTurnContext } =
  await import('../../../../agents/processors/turn-processor/inject-context.js');
const { deduplicateInjections, detectConversationMode, filterInjections } =
  await import('../../../utils/injection-filter.js');
const { callReportInjection, confirmCallReportReached } = await import('../call-report.js');
const { buildAllPendingResultsContext } = await import('../pending-call-results.js');
const { captureBackgroundResult, getPendingResults } =
  await import('../../../../services/background-agents/unified-result-capture.js');
const { llm } = await import('@livekit/agents');
const { withTurnReminder } = await import('../../../../agents/personas/turn-request.js');
const { TURN_CONTEXT_HEADER } =
  await import('../../../../agents/multi-agent/turn-context-header.js');

const USER = 'uid-owner-fixture';
const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** A call Ferni made: its on_behalf_calls doc and, unless callOnly, its background result. */
function seedCall(
  callId: string,
  name: string,
  said: string,
  minutesAgo: number,
  callOnly = false
) {
  const at = ago(minutesAgo);
  (fake.state.docs.on_behalf_calls ??= []).push({
    id: callId,
    request: { contactName: name },
    outcome: {
      status: 'completed',
      outcome: said,
      objectiveAchieved: true,
      callbackRequired: false,
    },
    capturedAt: at,
    delivered: false,
  });
  if (callOnly) return;
  (fake.state.docs.background_results ??= []).push({
    id: `r-${callId}`,
    userId: USER,
    type: 'on_behalf_call',
    status: 'success',
    summary: `Called ${name} - ${said}`,
    priority: 'normal',
    initiatedBy: 'ferni',
    contactName: name,
    relatedTaskId: callId,
    requiresCallback: false,
    actionItems: [],
    capturedAt: at,
    delivered: false,
  });
}

const delivered = () =>
  fake.state.updates.filter((u) => u.data.delivered === true).map((u) => `${u.col}/${u.id}`);

/** One turn as process-turn.ts runs it: build, dedup, filter, then inject into the request. */
async function turn(sessionId: string, userText: string, userData: Record<string, unknown>) {
  const { injections } = await buildContextInjections(
    ...([
      {
        services: { sessionId, userId: USER },
        userData,
        persona: { id: 'ferni', name: 'Ferni' },
        userText,
        logger: { debug() {}, info() {}, warn() {}, error() {} },
      },
      {
        analysis: { intent: 'chat', emotion: { primary: 'neutral' }, topics: {} },
        currentTopic: undefined,
      },
      { primary: 'neutral', intensity: 0.1, distressLevel: 0 },
      { length: { guidance: 'Keep it short.' } },
      { needsReinforcement: false },
      null,
      undefined,
      {},
    ] as never as Parameters<typeof buildContextInjections>)
  );
  const mode = detectConversationMode(userText, 0.1, false);
  const kept = filterInjections(deduplicateInjections(injections), { mode, userText });
  const request = llm.ChatContext.empty();
  injectTurnContext(request, { context: { injections: kept } } as never, {
    sessionId,
    turnNumber: 1,
  });
  return { built: injections, kept, mode, request };
}

const report = (injections: Array<{ category: string; content: string }>) =>
  injections.find((i) => i.category === 'pending_background_results');

beforeAll(async () => {
  // Loaded once, so the 150 ms first-turn race measures the build, not a cold import.
  await buildAllPendingResultsContext('uid-warm-up');
});

afterEach(() => {
  vi.unstubAllEnvs();
  fake.state.docs = {};
  fake.state.updates = [];
  fake.state.delayMs = 0;
});

describe('CALL_REPORT_REACHES_YOU on', () => {
  it('a casual "hey" first turn keeps the report, and it is marked only once a request holds it', async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    seedCall('call-1', 'Aunt Rosa', 'she loved hearing from you and will bake on Sunday', 30);
    seedCall('call-0', 'Coach Lee', 'practice moved to Thursday at the north field', 90);
    // The live hook: turnCount already stepped twice, callerTurn 1 (caller-turn-count.ts).
    const first = await turn('s-hey', 'hey', { turnCount: 2, callerTurn: 1 });

    expect(first.mode).toBe('casual');
    const block = report(first.kept);
    expect(block?.content).toContain('Aunt Rosa');
    expect(block?.content).toContain('will bake on Sunday');
    expect(block?.content).toContain('north field');
    expect(block?.content.length).toBeGreaterThan(600); // over the casual budget, kept anyway
    const items = first.request.items as Array<{ textContent?: string }>;
    expect(items.some((i) => i.textContent?.includes(block?.content ?? '?'))).toBe(true);
    expect(delivered()).toEqual([]); // built and kept is not delivered

    confirmCallReportReached('s-hey', first.request.items);
    await vi.waitFor(() =>
      expect(delivered().sort()).toEqual([
        'background_results/r-call-0',
        'background_results/r-call-1',
        'on_behalf_calls/call-0',
        'on_behalf_calls/call-1',
      ])
    );
    expect(fake.state.updates.find((u) => u.id === 'r-call-1')?.data.deliveryMethod).toBe('voice');

    const second = await turn('s-hey', 'hey again', { turnCount: 4, callerTurn: 2 });
    expect(report(second.built)).toBeUndefined(); // told once
  }, 30_000);

  it('a build that loses the race marks nothing, and the next turn offers it', async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    seedCall('call-2', 'Coach Lee', 'practice moved to Thursday', 20);
    fake.state.delayMs = 120;
    const base = { userId: USER, sessionId: 's-slow', turnCount: 0, crisis: false, timeoutMs: 20 };

    expect(await callReportInjection({ ...base, callerTurn: 1 })).toBeNull();
    await pause(300); // the late build finishes
    expect(delivered()).toEqual([]);

    const offered = await callReportInjection({ ...base, callerTurn: 2 });
    expect(offered?.content).toContain('practice moved to Thursday');
    expect(delivered()).toEqual([]);
    confirmCallReportReached('s-slow', [{ textContent: `note\n${offered?.content}\nmore` }]);
    await vi.waitFor(() => expect(delivered()).toContain('on_behalf_calls/call-2'));
  });

  it('a block that never reached the request stays undelivered and is offered again, up to turn 3', async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    seedCall('call-3', 'Dr. Patel', 'the appointment is confirmed', 10);
    const base = {
      userId: USER,
      sessionId: 's-dropped',
      turnCount: 0,
      crisis: false,
      timeoutMs: 150,
    };

    const first = await callReportInjection({ ...base, callerTurn: 1 });
    expect(first).not.toBeNull();
    // Filtered out, trimmed or stale-dropped: the request holds other notes only.
    confirmCallReportReached('s-dropped', [{ textContent: 'other notes' }]);
    expect(await callReportInjection({ ...base, crisis: true, callerTurn: 2 })).toBeNull();
    expect((await callReportInjection({ ...base, callerTurn: 3 }))?.content).toBe(first?.content);
    expect(await callReportInjection({ ...base, callerTurn: 4 })).toBeNull();
    await pause(20);
    expect(delivered()).toEqual([]);
  });

  it('with both stores pending: one block, calls first, and only the docs it carries are marked', async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    seedCall('call-a', 'Aunt Rosa', 'she says hi', 50); // both stores, one call
    seedCall('call-b', 'Uncle Joe', 'he will call back tonight', 5, true); // call store only
    seedCall('call-old', 'Neighbor Sam', 'the package arrived', 600, true); // a third call: waits
    fake.state.docs.background_results.push({
      id: 'r-research',
      userId: USER,
      type: 'research_complete',
      status: 'success',
      summary: 'Found three bakeries open late',
      priority: 'urgent',
      initiatedBy: 'ferni',
      requiresCallback: false,
      actionItems: [],
      capturedAt: ago(1),
      delivered: false,
    });

    const offered = await callReportInjection({
      userId: USER,
      sessionId: 's-both',
      turnCount: 0,
      callerTurn: 1,
      crisis: false,
      timeoutMs: 150,
    });
    const text = offered?.content ?? '';
    expect(text.match(/While they were away/g)).toHaveLength(1);
    expect(text).not.toMatch(/PENDING CALL UPDATES|WHILE THEY WERE AWAY/);
    expect(text.match(/Call updates below report/g)).toHaveLength(1); // one guard
    expect(text.indexOf('Uncle Joe')).toBeLessThan(text.indexOf('Aunt Rosa')); // newest call first
    expect(text).not.toContain('bakeries');
    expect(text).not.toContain('Neighbor Sam');
    for (const part of text.split("Reported from Ferni's call").slice(1)) {
      expect(part.length).toBeLessThanOrEqual(360);
    }

    confirmCallReportReached('s-both', [{ textContent: text }]);
    await vi.waitFor(() =>
      expect(delivered().sort()).toEqual([
        'background_results/r-call-a',
        'on_behalf_calls/call-a',
        'on_behalf_calls/call-b',
      ])
    );
  });

  it('a web-UI packet is noted as ui, not voice, and the voice path still offers it', async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    vi.stubEnv('LIVEKIT_URL', 'wss://example.invalid');
    vi.stubEnv('LIVEKIT_API_KEY', 'key');
    vi.stubEnv('LIVEKIT_API_SECRET', 'secret');
    const result = await captureBackgroundResult({
      userId: USER,
      type: 'on_behalf_call',
      status: 'success',
      summary: 'Called Aunt Rosa - she says hi',
      initiatedBy: 'ferni',
      sessionId: 'room-live',
      contactName: 'Aunt Rosa',
    });

    const notice = fake.state.updates.find((u) => u.id === result.id);
    expect(notice?.data).toEqual({ uiNoticeAt: expect.any(String) });
    expect((await getPendingResults(USER)).map((r) => r.id)).toContain(result.id);
    const offered = await callReportInjection({
      userId: USER,
      sessionId: 's-ui',
      turnCount: 0,
      callerTurn: 1,
      crisis: false,
      timeoutMs: 150,
    });
    expect(offered?.content).toContain('she says hi');
  });

  it("a reply's real request marks it; a crisis-guided request never does", async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    seedCall('call-r', 'Aunt Rosa', 'she says hi', 15);
    const sessionId = 's-request';
    const offered = await callReportInjection({
      userId: USER,
      sessionId,
      turnCount: 0,
      callerTurn: 1,
      crisis: false,
      timeoutMs: 150,
    });
    // The pushed note sits after the words it was built for, before Ferni's reply (turn-intelligence.ts).
    const request = llm.ChatContext.empty();
    request.addMessage({ role: 'user', content: 'hey' });
    request.addMessage({ role: 'user', content: `${TURN_CONTEXT_HEADER}\n${offered?.content}` });
    request.addMessage({ role: 'assistant', content: 'Hey you.' });
    request.addMessage({ role: 'user', content: 'how are you' });
    const session = { userData: { personaId: 'ferni', services: { sessionId } } };

    withTurnReminder(request, session, { shape: false, closeLoop: false }); // crisis guidance
    await pause(20);
    expect(delivered()).toEqual([]);
    withTurnReminder(request, session);
    await vi.waitFor(() => expect(delivered()).toContain('on_behalf_calls/call-r'));
  }, 30_000);

  it('the legacy builders (the web API reads one) no longer mark what they build', async () => {
    vi.stubEnv('CALL_REPORT_REACHES_YOU', 'on');
    seedCall('call-api', 'Aunt Rosa', 'she says hi', 15);
    expect(await buildAllPendingResultsContext(USER)).toContain('she says hi');
    await pause(20);
    expect(delivered()).toEqual([]);
  });
});

describe('CALL_REPORT_REACHES_YOU off: as on main', () => {
  it('turn 0 gets the legacy block, built and marked delivered as it is built', async () => {
    seedCall('call-x', 'Aunt Rosa', 'she loved hearing from you', 30);
    const expected = await buildAllPendingResultsContext(USER);
    const both = ['background_results/r-call-x', 'on_behalf_calls/call-x'];
    await vi.waitFor(() => expect(delivered().sort()).toEqual(both));
    fake.state.docs = {};
    fake.state.updates = [];
    seedCall('call-x', 'Aunt Rosa', 'she loved hearing from you', 30);

    // The live hook has stepped turnCount by the first caller turn: main builds nothing then.
    const live = { userId: USER, sessionId: 's-off', crisis: false, timeoutMs: 150 };
    expect(await callReportInjection({ ...live, turnCount: 2, callerTurn: 1 })).toBeNull();
    expect(delivered()).toEqual([]);
    const offered = await callReportInjection({
      userId: USER,
      sessionId: 's-off',
      turnCount: 0,
      crisis: false,
      timeoutMs: 150,
    });
    expect(offered).toEqual({
      category: 'pending_background_results',
      content: expected,
      priority: 90,
    });
    // Marked at build, before any request (B2), and not offered again.
    await vi.waitFor(() => expect(delivered().sort()).toEqual(both));
    const later = { userId: USER, sessionId: 's-off', turnCount: 1, crisis: false, timeoutMs: 150 };
    expect(await callReportInjection({ ...later, callerTurn: 1 })).toBeNull();
  });

  it('the casual first turn drops the block, and a UI packet counts as voice', async () => {
    seedCall('call-y', 'Aunt Rosa', 'she loved hearing from you and will bake on Sunday', 30);
    const { built, kept } = await turn('s-off-hey', 'hey', { turnCount: 0 });
    expect(report(built)).toBeDefined();
    expect(report(kept)).toBeUndefined(); // B4

    fake.state.updates = [];
    vi.stubEnv('LIVEKIT_URL', 'wss://example.invalid');
    vi.stubEnv('LIVEKIT_API_KEY', 'key');
    vi.stubEnv('LIVEKIT_API_SECRET', 'secret');
    const result = await captureBackgroundResult({
      userId: USER,
      type: 'on_behalf_call',
      status: 'success',
      summary: 'Called Aunt Rosa - she says hi',
      initiatedBy: 'ferni',
      sessionId: 'room-live',
    });
    expect(fake.state.updates.find((u) => u.id === result.id)?.data).toMatchObject({
      delivered: true,
      deliveryMethod: 'voice',
    });
  }, 30_000);
});
