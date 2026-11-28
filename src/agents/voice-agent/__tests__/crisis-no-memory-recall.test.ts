/**
 * CRISIS_NO_MEMORY_RECALL: the caller's recalled memories never reach a crisis reply.
 *
 * Each call drives the real path: the real handleUserTurn builds a turn's note (processTurn,
 * memory retrieval and unified intelligence stubbed, as in crisis-notes-never-cut.test.ts), the
 * real createTurnContextPusher puts it into the agent's chat, and the real gatedReply answers the
 * caller's next line from that chat. The crisis classifier, the adjudicator, the grounded reads
 * and the reply model are counted stubs; the network is guarded. Riley Test and every line here
 * are invented.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

interface Scenario {
  memories: string[];
  /** processTurn's crisis field; null: the turn has none. */
  crisis: Record<string, unknown> | null;
}

const state = vi.hoisted(() => ({ scenario: undefined as unknown, searches: 0 }));

/** Live guidance: no stored memory (caller-memory-categories.ts). */
const CONTEXT = {
  category: 'guidance',
  priority: 50,
  content: '[CONTEXT] They are making dinner.',
};
const MEMORY = "[RELEVANT MEMORIES]\n- Riley Test's dog Biscuit died in March.";
const BISCUIT = 'Biscuit';
const MEMORY_2 = '[RELEVANT MEMORIES]\n- Riley Test plays the cello on Sundays.';

vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(async () => {
    const s = state.scenario as Scenario;
    return {
      analysis: { analysis: { emotion: 'calm', intent: 'unknown' } },
      context: { injections: [{ ...CONTEXT }], elapsedMs: 0 },
      emotional: { primary: 'calm', intensity: 0.2 },
      response: {},
      identity: {},
      ...(s.crisis && { crisis: s.crisis }),
    };
  }),
}));
vi.mock('../../../intelligence/context-builders/memory-retrieval-builder.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  buildMemoryRetrievalContext: vi.fn(async () => ({
    searches: ++state.searches,
    injections: (state.scenario as Scenario).memories.map((content) => ({
      category: 'memory',
      content,
    })),
  })),
}));
vi.mock('../../integrations/unified-intelligence-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getUnifiedIntelligence: vi.fn(async () => null),
}));

const { handleUserTurn } = await import('../turn-handler.js');
const { createTurnContextPusher } = await import('../../multi-agent/turn-intelligence.js');
const { TURN_CONTEXT_FOR, TURN_CONTEXT_HEADER } =
  await import('../../multi-agent/turn-context-header.js');
const { gatedReply } = await import('../../personas/crisis-gate.js');

const ORDINARY_READ = { isCrisis: false, severity: 0, indicators: [], shouldOverrideLLM: false };
const LINE_1 = "We're making pasta tonight.";
const REPLY_1 = 'Oh nice, what kind?';
const COOK = 'what should I cook tomorrow?';
const CRISIS_LINE = "I hope I don't wake up tomorrow";
/** No crisis words the patterns know; the classifier stub reads it as risk. */
const CLASSIFIER_ONLY = 'I just want all of it to stop for good';
/**
 * A safety word the patterns read as nothing (crisis-timeout-checkin.ts). Not "unsafe with
 * myself": CRISIS_MEANS forms read that as suicidal, so it is guided at once, never checked in.
 */
const UNSAFE = "i'm scared of what i might do tonight";

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const CLASSIFIER_LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const TIMEOUT_CHECKIN = {
  ...CLASSIFIER_LIVE,
  CRISIS_CLASSIFIER_TIMEOUT_MS: '40',
  CRISIS_TIMEOUT_CHECKIN: 'on',
};

const counts = { fetch: 0, generate: 0, adjudicate: 0, grounded: 0 };
let calls = 0;

beforeEach(() => {
  resetCrisisCallRisk();
  resetCrisisClassifierCache();
  Object.assign(counts, { fetch: 0, generate: 0, adjudicate: 0, grounded: 0 });
  state.searches = 0;
  vi.stubGlobal('fetch', async () => {
    counts.fetch++;
    throw new Error('no network in this test');
  });
  vi.spyOn(Math, 'random').mockReturnValue(0.42); // the turn reminder's style picks
  // A day hour: the late-night note stays out of every turn (behavior-event-dispatcher.ts).
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 9, 14, 30, 0));
});
afterEach(() => {
  expect(counts.fetch).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Classifier stubs: `read` answers every line, throws, or answers after the 40 ms cap. */
function models(read: Read) {
  const generate: CrisisGenerateFn = async (_prompt, content) => {
    counts.generate++;
    if (read === 'throws') throw new Error('provider down');
    if (read === 'late')
      await new Promise<void>((done) => {
        setTimeout(done, 400);
      });
    const risky = read === 'crisis' && String(content).includes(CLASSIFIER_ONLY);
    return JSON.stringify({ risk: risky ? 'crisis' : 'none', subject: 'self' });
  };
  const adjudicate: CrisisGenerateFn = async () => {
    counts.adjudicate++;
    return '{"caller_risk":"","decision":"escalate","confidence":"high"}';
  };
  const grounded: CrisisGenerateFn = async () => {
    counts.grounded++;
    return '{"explained":false}';
  };
  return { generate, adjudicate, groundedReads: [grounded, grounded] };
}

const textOf = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n');

const isNote = (item: unknown): boolean =>
  ((item as llm.ChatMessage).textContent ?? '').startsWith(TURN_CONTEXT_HEADER);

type Read = 'none' | 'crisis' | 'throws' | 'late';

interface CallOptions {
  /** Turn 1's line (default: an ordinary one) and its recalled memories (default: MEMORY). */
  line1?: string;
  memories?: string[];
  /** Turn 1's crisis field (default: an ordinary read); null: none. */
  turn1Crisis?: Record<string, unknown> | null;
  /** Crisis risk noted on the call before turn 1, or between turn 1 and the line asked. */
  risk?: 'before' | 'after';
  read?: Read;
}

/**
 * One call: turn 1's note is built and pushed, then the gate answers `said`. `before` is the
 * request as the gate got it, `sent` the text of each request the gate sent the model.
 */
async function call(
  flag: 'on' | 'off',
  env: Record<string, string>,
  said: string,
  opts: CallOptions = {}
) {
  vi.stubEnv('CRISIS_NO_MEMORY_RECALL', flag); // the turn note reads process.env
  const sessionId = `s-crisis-memory-${++calls}`;
  if (opts.risk === 'before') noteCrisisRisk(sessionId);
  state.scenario = {
    memories: opts.memories ?? [MEMORY],
    crisis: opts.turn1Crisis === undefined ? ORDINARY_READ : opts.turn1Crisis,
  } satisfies Scenario;

  let chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'system', content: 'You are Ferni.' });
  chat.addMessage({ role: 'user', content: LINE_1 });
  chat.addMessage({ role: 'assistant', content: REPLY_1 });
  const agent = {
    get chatCtx() {
      return chat;
    },
    updateChatCtx: async (next: llm.ChatContext) => {
      chat = next;
    },
  };
  const hook = async (scratch: llm.ChatContext, msg: llm.ChatMessage) => {
    await handleUserTurn({
      turnCtx: scratch,
      userText: msg.textContent ?? '',
      contextOnly: true,
      persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
      services: { sessionId, userId: 'member-riley-test' },
      userData: { turnCount: 3 },
    } as never);
  };
  await createTurnContextPusher(hook as never, agent as never).onFinalTranscript(
    opts.line1 ?? LINE_1
  );
  // From here the flag reaches the gate only through the env it is handed (production hands it
  // none, so process.env), so a gate that drops that env is seen.
  vi.stubEnv('CRISIS_NO_MEMORY_RECALL', undefined);
  if (opts.risk === 'after') noteCrisisRisk(sessionId);

  const request = chat.copy();
  request.addMessage({ role: 'user', content: said });
  const note = request.items.find(isNote) as llm.ChatMessage | undefined;
  const before = textOf(request);
  const sent: string[] = [];
  const model = async (ctx: llm.ChatContext) => {
    sent.push(textOf(ctx));
    return new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue('I hear you.');
        controller.close();
      },
    });
  };
  const opener = { wrap: (s: unknown) => s } as never;
  const reply = await gatedReply(
    request,
    { userData: { services: { sessionId } } },
    model as never,
    opener,
    {
      env: { ...env, CRISIS_NO_MEMORY_RECALL: flag },
      ...models(opts.read ?? 'none'),
    }
  );
  let spoken = '';
  if (reply)
    for await (const chunk of reply as unknown as AsyncIterable<unknown>) spoken += String(chunk);
  return { before, sent, spoken, noteExtra: note?.extra ?? {} };
}

/** A request as it reads with the turn note's recalled memory taken out. */
const withoutMemory = (text: string): string => text.replace(`\n\n${MEMORY}`, '');

describe('CRISIS_NO_MEMORY_RECALL through the real turn note and the real gatedReply', () => {
  it('crisis-guided turn, flag on: no recalled memory reaches the model, every other word as with the flag off', async () => {
    const off = await call('off', PATTERNS_ONLY, CRISIS_LINE);
    const on = await call('on', PATTERNS_ONLY, CRISIS_LINE);
    expect(on.before).toContain(MEMORY); // in the chat before the gate
    expect(off.sent.at(-1)).toContain(MEMORY); // main: the guided reply reads it
    expect(on.sent.length).toBeGreaterThan(0);
    for (const sent of on.sent) expect(sent).not.toContain(BISCUIT);
    // The guidance, the override and every other note: exactly the flag off's.
    expect(on.sent).toEqual(off.sent.map(withoutMemory));
    expect(on.sent.at(-1)).toContain(CONTEXT.content);
    expect(on.spoken).toBe(off.spoken);
  });

  it('crisis read pending (reply held), flag on: the guided re-ask carries no recalled memory, every other word as with the flag off', async () => {
    const off = await call('off', CLASSIFIER_LIVE, CLASSIFIER_ONLY, { read: 'crisis' });
    const on = await call('on', CLASSIFIER_LIVE, CLASSIFIER_ONLY, { read: 'crisis' });
    expect(counts.generate).toBeGreaterThan(0);
    expect(on.sent.length).toBeGreaterThanOrEqual(2); // the held reply, then the guided one
    expect(off.sent.at(-1)).toContain(MEMORY);
    expect(on.sent.at(-1)).not.toContain(BISCUIT);
    expect(on.sent.at(-1)).toBe(withoutMemory(off.sent.at(-1)!));
    // Not changed: the held first request, whose words are dropped once the read escalates.
    expect(on.sent[0]).toBe(off.sent[0]);
    expect(on.spoken).toBe(off.spoken);
  });

  it('failed or late crisis read on a safety word (CRISIS_TIMEOUT_CHECKIN), flag on: the check-in carries no recalled memory', async () => {
    for (const read of ['throws', 'late'] as const) {
      const off = await call('off', TIMEOUT_CHECKIN, UNSAFE, { read });
      const on = await call('on', TIMEOUT_CHECKIN, UNSAFE, { read });
      expect(counts.generate).toBeGreaterThan(0);
      expect(on.sent.length).toBeGreaterThanOrEqual(2); // the held reply, then the check-in
      expect(off.sent.at(-1)).toContain(MEMORY);
      expect(on.sent.at(-1)).toBe(withoutMemory(off.sent.at(-1)!));
    }
  });

  it('a line with crisis words or a call with crisis risk, flag on: no memory search runs; flag off, it runs', async () => {
    const guided = { ...ORDINARY_READ, isCrisis: true, severity: 0.8 };
    await call('off', PATTERNS_ONLY, COOK, { line1: CRISIS_LINE, turn1Crisis: guided });
    expect(state.searches).toBe(1);
    state.searches = 0;
    const on = await call('on', PATTERNS_ONLY, COOK, { line1: CRISIS_LINE, turn1Crisis: guided });
    expect(state.searches).toBe(0);
    expect(on.before).not.toContain(BISCUIT);
    await call('on', PATTERNS_ONLY, COOK, { risk: 'before' });
    expect(state.searches).toBe(0);
    await call('on', PATTERNS_ONLY, COOK);
    expect(state.searches).toBe(1); // an ordinary line searches as before
  });

  it('a turn with no crisis read, flag on: its note is built without recalled memory, and the next reply gets none', async () => {
    const off = await call('off', PATTERNS_ONLY, COOK, { turn1Crisis: null });
    const on = await call('on', PATTERNS_ONLY, COOK, { turn1Crisis: null });
    expect(off.before).toContain(MEMORY);
    expect(off.sent.at(-1)).toContain(MEMORY);
    expect(on.before).not.toContain(BISCUIT);
    expect(on.before).toContain(CONTEXT.content);
    expect(on.sent.at(-1)).not.toContain(BISCUIT);
  });

  it('a turn the read guided, flag on: its note is built without recalled memory', async () => {
    const guided = { ...ORDINARY_READ, isCrisis: true, severity: 0.8 };
    const soft = { ...ORDINARY_READ, softCheck: true };
    for (const turn1Crisis of [guided, soft]) {
      expect((await call('off', PATTERNS_ONLY, COOK, { turn1Crisis })).before).toContain(MEMORY);
      const on = await call('on', PATTERNS_ONLY, COOK, { turn1Crisis });
      expect(on.before).not.toContain(BISCUIT);
      expect(on.sent.at(-1)).not.toContain(BISCUIT);
    }
  });

  it('a call with crisis risk noted, flag on: the turn note leaves memory out, and a later reply strips an earlier note', async () => {
    const before = await call('on', PATTERNS_ONLY, COOK, { risk: 'before' });
    expect(before.before).not.toContain(BISCUIT);
    // Risk noted after the note was pushed (a crisis read that failed notes it too).
    const offAfter = await call('off', PATTERNS_ONLY, COOK, { risk: 'after' });
    const onAfter = await call('on', PATTERNS_ONLY, COOK, { risk: 'after' });
    expect(onAfter.before).toContain(MEMORY);
    expect(offAfter.sent.at(-1)).toContain(MEMORY);
    expect(onAfter.sent.at(-1)).toBe(withoutMemory(offAfter.sent.at(-1)!));
  });

  it('ordinary turn, flag on: the same memories in the same order reach the model, the request byte-equal to the flag off', async () => {
    const memories = [MEMORY, MEMORY_2];
    const off = await call('off', PATTERNS_ONLY, COOK, { memories });
    const on = await call('on', PATTERNS_ONLY, COOK, { memories });
    expect(state.searches).toBe(2); // one search each
    const last = off.sent.at(-1)!;
    expect(last.indexOf(MEMORY)).toBeGreaterThan(-1);
    expect(last.indexOf(MEMORY_2)).toBeGreaterThan(last.indexOf(MEMORY));
    expect(on.sent).toEqual(off.sent);
    expect(on.spoken).toBe(off.spoken);
  });

  it('flag off: the pushed note carries what main gives it and nothing more', async () => {
    const off = await call('off', PATTERNS_ONLY, COOK);
    expect(Object.keys(off.noteExtra)).toEqual([TURN_CONTEXT_FOR]);
    const on = await call('on', PATTERNS_ONLY, COOK);
    expect(Object.keys(on.noteExtra).sort()).toEqual(
      [TURN_CONTEXT_FOR, 'withoutRecalledMemory'].sort()
    );
  });
});
