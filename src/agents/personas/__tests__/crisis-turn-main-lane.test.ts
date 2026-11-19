/**
 * Crisis turns go to the main model when the fast lane is on (CASCADE_FAST_LANE). The crisis gate
 * decides (gatedReply: crisis guidance on the request, or risk noted on the call), llmNode marks
 * the request it sends (lane-request.ts), and FastLaneLLM and the turn receipt read that one mark
 * (fast-lane.ts routeOf). Dev, fast lane on: flash-lite answered most crisis-guided turns, as the
 * router read only the caller's words.
 *
 * Every turn runs through the real PersonaVoiceAgent.llmNode and the SDK's own llmNode, which
 * hands the request to activity.llm.chat: here a real FastLaneLLM over stub models. Every model
 * the gate can reach is a counting stub (classifier, adjudicator, grounded reads) and fetch
 * throws; each row ends with no fetch. The caller lines are fictional, and each one reads as
 * chit-chat to the router on its own, so only the gate can send it to the main model.
 */
import { EventEmitter } from 'node:events';
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flagOn } from '../../../config/env-flag.js';
import type { CrisisGenerateFn } from '../../../services/safety/crisis-classifier.js';
import { TALK_TO_988 } from '../../../services/safety/crisis-guard-replies.js';

/** The gate's model calls, stubbed: llmNode passes gatedReply none of its own. */
const stub = vi.hoisted(() => ({
  verdict: '{"risk":"none","subject":"self"}',
  /** The classifier never answers: classifyCrisis's deadline aborts it and resolves no verdict. */
  hang: false,
  calls: { generate: 0, adjudicate: 0, grounded: 0 },
}));
vi.mock('../crisis-gate.js', async (load) => {
  const real = await load<typeof import('../crisis-gate.js')>();
  const generate: CrisisGenerateFn = (_prompt, _content, signal) => {
    stub.calls.generate++;
    if (!stub.hang) return Promise.resolve(stub.verdict);
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  };
  const adjudicate: CrisisGenerateFn = async () => {
    stub.calls.adjudicate++;
    return '{"caller_risk":"","decision":"escalate","confidence":"high"}';
  };
  const grounded: CrisisGenerateFn = async () => {
    stub.calls.grounded++;
    return '{"explained":false}';
  };
  return {
    ...real,
    gatedReply: (
      ...[request, session, model, opener, options]: Parameters<typeof real.gatedReply>
    ) =>
      real.gatedReply(request, session, model, opener, {
        generate,
        adjudicate,
        groundedReads: [grounded, grounded],
        ...options,
      }),
  };
});

import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { checkin } from '../../../services/safety/index.js';
import { FastLaneLLM, routeOf } from '../../model-provider/fast-lane.js';
import { HedgedLLM } from '../../model-provider/hedged-llm.js';
import { withLane } from '../../model-provider/lane-request.js';
import type { TurnReceipt } from '../../shared/turn-receipt.js';
import { attachTurnReceipts } from '../../shared/turn-receipt-session.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { decisionFor } from '../crisis-gate.js';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { OpenerGate } from '../opener-gate.js';

/** The patterns guide this line (crisis-gate-911-line.test.ts); the router alone reads chat. */
const GUIDED = 'i wish i could just disappear';
/** Only the classifier finds a crisis here; the router reads chat. */
const CALM = 'long day at work';
const CHAT = 'haha she definitely did it on purpose';
/**
 * Check-in words the patterns pass: a denial with an aside keeps the timeout check-in
 * (crisis-timeout-checkin.ts, "Anything else keeps the check-in"). R10 asserts all three reads.
 */
const CHECKIN_WORDS = "i'm fine, i'm not going to kill myself, i promise";
const CRISIS_VERDICT = '{"risk":"crisis","subject":"self"}';
const SIX_HOURS = 6 * 60 * 60 * 1000;

const CONN = { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 };
const DEFAULTS = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
/** The crisis rows run under the manifest defaults and with the gate's reads held for agreement. */
const GATE_STATES = [
  ['manifest defaults', DEFAULTS],
  [
    'agreement gate on, adjudicator shadow',
    { ...DEFAULTS, CRISIS_AGREEMENT_GATE: 'on', CRISIS_ADJUDICATOR: 'shadow' },
  ],
] as const;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** A model that answers with its own name, after `waitMs`, and logs each request it gets. */
class StubLLM extends llm.LLM {
  readonly requests: llm.ChatContext[] = [];
  constructor(
    readonly name: string,
    private readonly order: string[],
    readonly waitMs = 0
  ) {
    super();
  }
  label(): string {
    return this.name;
  }
  chat(opts: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    this.requests.push(opts.chatCtx);
    this.order.push(this.name);
    return new StubStream(this, opts);
  }
}
class StubStream extends llm.LLMStream {
  constructor(
    private readonly stubModel: StubLLM,
    opts: Parameters<llm.LLM['chat']>[0]
  ) {
    super(stubModel, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: CONN });
  }
  protected async run(): Promise<void> {
    if (this.stubModel.waitMs) await sleep(this.stubModel.waitMs);
    const content = this.stubModel.name;
    this.queue.put({ id: content, delta: { role: 'assistant', content } });
  }
}

let calls = 0;
let fetches = 0;

/**
 * One call: a real PersonaVoiceAgent's llmNode whose session's model is `fastLane` on (a
 * FastLaneLLM over the flash-lite and main stubs) or the main stub alone, as with the fast lane
 * off (buildFastLane returns null). Its turn receipts are kept.
 */
function startCall(o: { fastLane: boolean; sessionId?: boolean }) {
  const order: string[] = [];
  const flash = new StubLLM('flash', order);
  const main = new StubLLM('main', order);
  const model = o.fastLane ? new FastLaneLLM(flash, main) : main;
  const sessionId = `crisis-main-lane-${++calls}`;
  const services = o.sessionId === false ? {} : { sessionId };
  const session = Object.assign(new EventEmitter(), {
    userData: { personaId: 'ferni', services },
  });
  const receipts: TurnReceipt[] = [];
  attachTurnReceipts(session as never, {
    sessionId,
    userId: undefined,
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env: o.fastLane ? { CASCADE_FAST_LANE: 'on' } : {},
  });
  const agent: Record<string, unknown> = {
    session,
    toolCtx: llm.ToolContext.empty(),
    // The SDK's llmNode asks the agent's activity for its model (agent.js Agent.default.llmNode).
    getActivityOrThrow: () => ({
      llm: model,
      agentSession: { connOptions: { llmConnOptions: CONN } },
    }),
  };
  agent.turnTools = { loggedLockedHandoffs: false, agent };
  agent.openerGate = new OpenerGate().forSession(() => session as never);

  /** One caller turn through llmNode; what was said, and the turn's receipt. */
  const turn = async (words: string): Promise<{ said: string; receipt: TurnReceipt }> => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: words });
    const before = receipts.length;
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, transcriptionDelayMs: 90 },
    });
    const reply = await PersonaVoiceAgent.prototype.llmNode.call(
      agent as never,
      ctx,
      llm.ToolContext.empty(),
      {} as never
    );
    let said = '';
    if (reply)
      for await (const chunk of reply as unknown as AsyncIterable<unknown>)
        said +=
          typeof chunk === 'string'
            ? chunk
            : ((chunk as { delta?: { content?: string } }).delta?.content ?? '');
    session.emit('agent_state_changed', { newState: 'speaking' });
    session.emit('agent_state_changed', { newState: 'listening' });
    expect(receipts).toHaveLength(before + 1);
    // Reply shaping capitalises the first word ("main" is spoken "Main"); the rows ask only which
    // model spoke, so they compare in lower case.
    return { said: said.toLowerCase(), receipt: receipts[before] };
  };
  return { sessionId, flash, main, order, turn };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  stub.verdict = '{"risk":"none","subject":"self"}';
  stub.hang = false;
  stub.calls = { generate: 0, adjudicate: 0, grounded: 0 };
  fetches = 0;
  vi.stubGlobal('fetch', async () => {
    fetches++;
    throw new Error('no network in this test');
  });
});
afterEach(() => {
  expect(fetches).toBe(0);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function useEnv(env: Record<string, string>): void {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

describe.each(GATE_STATES)('crisis turns, fast lane on (%s)', (_state, env) => {
  beforeEach(() => useEnv(env));

  it.each(['off', 'on'])(
    'R1 a pattern-guided turn goes to the main model, reason crisis (CUT_REPLY_IN_HISTORY %s)',
    async (cutReply) => {
      vi.stubEnv('CUT_REPLY_IN_HISTORY', cutReply);
      stub.verdict = CRISIS_VERDICT; // the read agrees: no second reply
      const c = startCall({ fastLane: true });
      const { said } = await c.turn(GUIDED);
      // The routing claim: which stub's chat() got the request (said is a secondary check).
      expect(c.order).toEqual(['main']);
      expect(c.flash.requests).toHaveLength(0);
      // CRISIS_GUIDED_LINE_FLOOR: a crisis guide's reply that leaves out 988 gets it said after.
      const floor = flagOn('CRISIS_GUIDED_LINE_FLOOR', process.env);
      expect(said).toBe(floor ? `main ${TALK_TO_988}`.toLowerCase() : 'main'); // turn() lowercases
      expect(routeOf(c.main.requests[0])).toEqual({ lane: 'main', reason: 'crisis' });
      expect(stub.calls.generate).toBeGreaterThan(0);
    }
  );

  it("R9 the receipt records the router's decision on a guided turn, not one recomputed from the words", async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({ fastLane: true });
    const { receipt } = await c.turn(GUIDED);
    // GUIDED alone reads as chat: a receipt recomputed from the caller's words says fast.
    expect(receipt.prompt.lane).toEqual({ lane: 'main', reason: 'crisis' });
    const [sent] = [...c.flash.requests, ...c.main.requests];
    expect(receipt.prompt.lane).toEqual(routeOf(sent));
  });

  it('R1b a pattern-guided turn on a call with no session id (no risk can be noted) goes to main', async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({ fastLane: true, sessionId: false });
    await c.turn(GUIDED);
    expect(c.order).toEqual(['main']);
  });

  it.each(['off', 'on'])(
    'R2 the held reply goes fast; once the read escalates, the guided reply goes to main (CUT_REPLY_IN_HISTORY %s)',
    async (cutReply) => {
      vi.stubEnv('CUT_REPLY_IN_HISTORY', cutReply);
      stub.verdict = CRISIS_VERDICT;
      const c = startCall({ fastLane: true });
      const { said } = await c.turn(CALM);
      expect(c.order).toEqual(['flash', 'main']);
      expect(routeOf(c.flash.requests[0])).toEqual({ lane: 'fast', reason: 'chat' });
      expect(routeOf(c.main.requests[0])).toEqual({ lane: 'main', reason: 'crisis' });
      expect(said).toContain('main');
      expect(said).not.toContain('flash');
    }
  );

  it('R3 a later turn on a call with risk noted goes to main', async () => {
    const c = startCall({ fastLane: true });
    noteCrisisRisk(c.sessionId); // an earlier turn's read found risk
    const { receipt } = await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
    expect(receipt.prompt.lane).toEqual({ lane: 'main', reason: 'crisis' });
  });

  it.each([
    ['rejected (timeout)', () => Promise.reject(new Error('timeout'))],
    ['gave no verdict', () => Promise.resolve(null)],
  ] as const)('R4 a later turn after a read that %s goes to main', async (_how, read) => {
    const c = startCall({ fastLane: true });
    await trackCrisisRead(c.sessionId, 'an earlier fictional line', read()).catch(() => null);
    await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
  });

  // Coverage of the timeout path, where gap 3 lives: the held reply was asked before the read
  // failed, so it went fast; the check-in is guided, and the failed read has noted risk by then.
  it('R10 a classifier timeout with CRISIS_TIMEOUT_CHECKIN on: the check-in reply goes to main', async () => {
    useEnv({ CRISIS_TIMEOUT_CHECKIN: 'on', CRISIS_CLASSIFIER_TIMEOUT_MS: '40' });
    // The line, not the fix, must not decide the row: patterns pass, the router reads chat, and a
    // failed read on it is the timeout check-in.
    expect(decisionFor(detectCrisis(CHECKIN_WORDS))).toEqual({ action: 'pass' });
    const alone = { items: [{ type: 'message', role: 'user', textContent: CHECKIN_WORDS }] };
    expect(routeOf(alone).reason).toBe('chat');
    const failed = {
      decision: { action: 'pass' },
      latest: CHECKIN_WORDS,
      env: { CRISIS_TIMEOUT_CHECKIN: 'on' },
    };
    const checkIn = await checkin.escalation(Promise.resolve(null), failed, async () => null);
    expect(checkIn).toMatchObject({ action: 'guide', guidance: expect.stringContaining('988') });
    stub.hang = true;
    const c = startCall({ fastLane: true });
    const { said, receipt } = await c.turn(CHECKIN_WORDS);
    expect(c.order).toEqual(['flash', 'main']);
    expect(routeOf(c.flash.requests[0])).toEqual({ lane: 'fast', reason: 'chat' });
    expect(routeOf(c.main.requests[0])).toEqual({ lane: 'main', reason: 'crisis' });
    expect(receipt.prompt.lane).toEqual({ lane: 'main', reason: 'crisis' });
    expect(said).toContain('main');
    expect(said).not.toContain('flash');
  });
});

describe('the lane over time and for ordinary turns (fast lane on)', () => {
  beforeEach(() => useEnv(DEFAULTS));

  it('R5 risk noted over 6 hours ago: back to fast; noted just under 6 hours ago: main', async () => {
    const old = startCall({ fastLane: true });
    noteCrisisRisk(old.sessionId, Date.now() - SIX_HOURS - 1000);
    await old.turn(CHAT);
    expect(old.order).toEqual(['flash']);
    const recent = startCall({ fastLane: true });
    noteCrisisRisk(recent.sessionId, Date.now() - SIX_HOURS + 60_000);
    await recent.turn(CHAT);
    expect(recent.order).toEqual(['main']);
  });

  it('R6 an ordinary chat turn with no risk goes fast, unchanged', async () => {
    const c = startCall({ fastLane: true });
    const { said, receipt } = await c.turn(CHAT);
    expect(c.order).toEqual(['flash']);
    expect(said).toBe('flash');
    expect(receipt.prompt.lane).toEqual({ lane: 'fast', reason: 'chat' });
  });
});

describe('fast lane off', () => {
  beforeEach(() => useEnv(DEFAULTS));

  it('R7 a guided turn goes to the one model, and the receipt records no lane', async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({ fastLane: false });
    const { receipt } = await c.turn(GUIDED);
    expect(c.order).toEqual(['main']);
    expect(receipt.prompt.lane).toBeNull();
  });
});

describe('the hedge never hands a marked request to the fast model', () => {
  /** The cascade's shape: FastLaneLLM(HedgedLLM(flash-lite, main), main), main slow to answer. */
  async function reply(mark: boolean) {
    const order: string[] = [];
    const flash = new StubLLM('flash', order);
    const main = new StubLLM('main', order, 200);
    const router = new FastLaneLLM(new HedgedLLM(flash, main, 20), main);
    const chatCtx = llm.ChatContext.empty();
    chatCtx.addMessage({ role: 'user', content: CHAT });
    withLane(chatCtx, { mainLane: mark });
    let out = '';
    for await (const chunk of router.chat({ chatCtx, connOptions: CONN }))
      out += chunk.delta?.content ?? '';
    return { out, order, flash };
  }

  it('R8 a marked request: the flash-lite stub gets no call, though main is silent past the hedge delay', async () => {
    const marked = await reply(true);
    expect(marked.flash.requests).toHaveLength(0);
    expect(marked.order).toEqual(['main']);
    expect(marked.out).toBe('main');
    // The same request unmarked goes to the fast lane: the stubs and the hedge are live.
    const unmarked = await reply(false);
    expect(unmarked.flash.requests).toHaveLength(1);
  });
});
