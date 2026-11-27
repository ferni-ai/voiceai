/**
 * The dev model trial (CASCADE_TRIAL_MODEL, trial-lane.ts) keeps crisis turns on today's model.
 *
 * Every turn runs through the real PersonaVoiceAgent.llmNode, the real gatedReply and the SDK's
 * own llmNode, which hands the request to activity.llm.chat: here the model withTrialLane builds
 * over two stubs, `trial` and `main` (today's model). Every model the gate can reach is a
 * counting stub and fetch throws; each row ends with no fetch. All caller lines are fictional.
 *
 * The routing claim in each row is which stub's chat() got the request.
 */
import { EventEmitter } from 'node:events';
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrisisGenerateFn } from '../../../services/safety/crisis-classifier.js';

const stub = vi.hoisted(() => ({
  verdict: '{"risk":"none","subject":"self"}',
  /** Hold the classifier's answer until this settles. */
  held: null as null | Promise<void>,
  /** The classifier's model throws. */
  fail: false,
  calls: { generate: 0 },
}));
vi.mock('../crisis-gate.js', async (load) => {
  const real = await load<typeof import('../crisis-gate.js')>();
  const generate: CrisisGenerateFn = async () => {
    stub.calls.generate++;
    if (stub.held) await stub.held;
    if (stub.fail) throw new Error('classifier model down');
    return stub.verdict;
  };
  const other: CrisisGenerateFn = async () =>
    '{"caller_risk":"","decision":"escalate","confidence":"high","explained":false}';
  return {
    ...real,
    gatedReply: (
      ...[request, session, model, opener, options]: Parameters<typeof real.gatedReply>
    ) =>
      real.gatedReply(request, session, model, opener, {
        generate,
        adjudicate: other,
        groundedReads: [other, other],
        ...options,
      }),
  };
});

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { idIn } from '../../model-provider/__tests__/trial-arm-ids.js';
import { withTrialLane } from '../../model-provider/trial-lane.js';
import { attachTurnReceipts } from '../../shared/turn-receipt-session.js';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { OpenerGate } from '../opener-gate.js';

/** The patterns guide this line (crisis-turn-main-lane.test.ts). */
const GUIDED = 'i wish i could just disappear';
const CHAT = 'haha she definitely did it on purpose';
/** Only the classifier finds a crisis here (crisis-turn-main-lane.test.ts). */
const CALM = 'long day at work';
const NO_RISK = '{"risk":"none","subject":"self"}';
const CRISIS_VERDICT = '{"risk":"crisis","subject":"self"}';

const CONN = { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 };
const GATE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const DEV = { FIRESTORE_DATABASE: 'ferni-dev', CASCADE_TRIAL_MODEL: 'gemini-4-hydrogen' };
/** Dev with CRISIS_GATE_FAIL_CLOSED on, the only way a held reply may reach the trial model. */
const DEV_CLOSED = { ...DEV, CRISIS_GATE_FAIL_CLOSED: 'on' };

class StubLLM extends llm.LLM {
  readonly requests: llm.ChatContext[] = [];
  constructor(
    readonly name: string,
    private readonly order: string[]
  ) {
    super();
  }
  get model(): string {
    return this.name;
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
    const content = this.stubModel.name;
    this.queue.put({ id: content, delta: { role: 'assistant', content } });
  }
}

let fetches = 0;

/** One call through the real llmNode, its model built by withTrialLane under `env`. */
function startCall(
  o: { arm?: 'trial' | 'control'; sessionId?: string; env?: Record<string, string> } = {}
) {
  const env = o.env ?? DEV;
  // The gate reads process.env: the same fail-closed setting as the trial's.
  const closed: unknown = Object.getOwnPropertyDescriptor(env, 'CRISIS_GATE_FAIL_CLOSED')?.value;
  if (typeof closed === 'string') vi.stubEnv('CRISIS_GATE_FAIL_CLOSED', closed);
  const order: string[] = [];
  const trial = new StubLLM('trial', order);
  const main = new StubLLM('main', order);
  const model = withTrialLane(main, () => trial, env);
  const sessionId = o.sessionId ?? (o.arm === undefined ? undefined : idIn(o.arm));
  const services = sessionId === undefined ? {} : { sessionId };
  const session = Object.assign(new EventEmitter(), {
    userData: { personaId: 'ferni', services },
  });
  attachTurnReceipts(session as never, {
    sessionId: sessionId ?? 'no-call-id',
    userId: undefined,
    persona: () => 'ferni',
    emit: () => undefined, // the receipt path runs as on a real call; nothing here reads it
    env: { ...env },
  });
  const agent: Record<string, unknown> = {
    session,
    toolCtx: llm.ToolContext.empty(),
    getActivityOrThrow: () => ({
      llm: model,
      agentSession: { connOptions: { llmConnOptions: CONN } },
    }),
  };
  agent.turnTools = { loggedLockedHandoffs: false, agent };
  agent.openerGate = new OpenerGate().forSession(() => session as never);

  const turn = async (words: string): Promise<{ said: string }> => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: words });
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
    return { said: said.toLowerCase() };
  };
  return { sessionId, model, trial, main, order, turn };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  stub.verdict = '{"risk":"none","subject":"self"}';
  stub.held = null;
  stub.fail = false;
  stub.calls = { generate: 0 };
  fetches = 0;
  vi.stubGlobal('fetch', async () => {
    fetches++;
    throw new Error('no network in this test');
  });
  for (const [k, v] of Object.entries(GATE)) vi.stubEnv(k, v);
});
afterEach(() => {
  expect(fetches).toBe(0);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('crisis turns on a trial call keep today’s model (dev, trial on)', () => {
  it('T1 a pattern-guided turn goes to today’s model', async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({ arm: 'trial' });
    const { said } = await c.turn(GUIDED);
    expect(c.trial.requests).toHaveLength(0);
    expect(c.order[0]).toBe('main');
    expect(said).toContain('main');
  });

  it('T2 every later turn on that call goes to today’s model, a chat line included', async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({ arm: 'trial' });
    await c.turn(GUIDED);
    stub.verdict = NO_RISK;
    await c.turn(CHAT);
    expect(c.trial.requests).toHaveLength(0);
  });

  it('T3 a turn on a call with risk noted goes to today’s model', async () => {
    const c = startCall({ arm: 'trial' });
    noteCrisisRisk(c.sessionId!);
    await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
  });

  it('T4 a read that escalates sends the guided reply to today’s model', async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({ arm: 'trial' });
    const { said } = await c.turn(CALM);
    expect(c.order.at(-1)).toBe('main');
    expect(said).toContain('main');
    expect(said).not.toContain('trial');
    expect(c.main.requests.length).toBeGreaterThan(0);
  });

  it('T5 a call with no session id never reaches the trial model', async () => {
    stub.verdict = CRISIS_VERDICT;
    const c = startCall({});
    await c.turn(GUIDED);
    await c.turn(CHAT);
    expect(c.trial.requests).toHaveLength(0);
  });
});

describe('the trial off', () => {
  it.each([
    ['unset', { FIRESTORE_DATABASE: 'ferni-dev' }],
    ['on prod’s database', { ...DEV, FIRESTORE_DATABASE: '(default)' }],
    ['a misspelt dev database', { ...DEV, FIRESTORE_DATABASE: 'ferni_dev' }],
    ['an unlisted model', { ...DEV, CASCADE_TRIAL_MODEL: 'gemini-3.8-live' }],
  ] as const)('T6 %s: the session’s model is today’s itself', async (_how, env) => {
    const c = startCall({ arm: 'trial', env });
    expect(c.model).toBe(c.main);
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
    expect(said).toBe('main');
  });
});

describe('a control call (dev, trial on)', () => {
  it('T7 every turn goes to today’s model', async () => {
    const c = startCall({ arm: 'control' });
    await c.turn(CHAT);
    await c.turn(CHAT);
    expect(c.trial.requests).toHaveLength(0);
    expect(c.order).toEqual(['main', 'main']);
  });
});

/** A promise and its resolver, to hold the classifier mid-read. */
function gate(): { held: Promise<void>; release: () => void } {
  let release = (): void => undefined;
  const held = new Promise<void>((r) => {
    release = r;
  });
  return { held, release };
}
const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 20);
  });

describe('a held reply on a trial call (dev, trial on)', () => {
  it('T8 fail-closed on: an ordinary turn reaches the trial model, and its clean read lets it out', async () => {
    const c = startCall({ arm: 'trial', env: DEV_CLOSED });
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['trial']);
    expect(said).toBe('trial');
  });

  it('T15 across 24 calls, the gate’s clearance lets an ordinary turn reach the trial model on some calls and today’s on the rest', async () => {
    // Ids taken in order, not picked by arm: the gate's clearance must reach the lane for any
    // call to get the trial model, and the split must leave some calls on today's.
    const models: string[] = [];
    for (let i = 0; i < 24; i++) {
      const c = startCall({ sessionId: `crisis-trial-lane-split-${i}`, env: DEV_CLOSED });
      await c.turn(CHAT);
      expect(c.order, `call ${i}`).toHaveLength(1);
      models.push(c.order[0]);
    }
    // A fair split puts all 24 on one side by chance at 2^-23.
    expect(models).toContain('trial');
    expect(models).toContain('main');
  });

  it('T9 fail-closed off: a turn held on its own pending verdict goes to today’s model', async () => {
    const c = startCall({ arm: 'trial', env: { ...DEV, CRISIS_GATE_FAIL_CLOSED: 'off' } });
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
    expect(said).toBe('main');
  });

  it('T10 a read that fails: the held trial reply is dropped and today’s model answers', async () => {
    stub.fail = true;
    const c = startCall({ arm: 'trial', env: DEV_CLOSED });
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['trial', 'main']);
    expect(said).toContain('main');
    expect(said).not.toContain('trial');
  });

  it('T11 a read that times out: the held trial reply is dropped and today’s model answers', async () => {
    vi.stubEnv('CRISIS_CLASSIFIER_TIMEOUT_MS', '40');
    stub.held = new Promise<void>(() => {
      // never answers
    });
    const c = startCall({ arm: 'trial', env: DEV_CLOSED });
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['trial', 'main']);
    expect(said).toContain('main');
    expect(said).not.toContain('trial');
  });

  it('T12 an earlier turn’s read still in flight: the next turn goes to today’s model', async () => {
    const read = gate();
    stub.held = read.held;
    const c = startCall({ arm: 'trial', env: DEV_CLOSED });
    const first = c.turn(CALM);
    await settle();
    const second = c.turn(CHAT);
    await settle();
    read.release();
    await Promise.all([first, second]);
    expect(c.order).toEqual(['trial', 'main']);
    expect(c.trial.requests).toHaveLength(1);
  });

  it('T13 a turn the gate never read (guard off): today’s model answers', async () => {
    vi.stubEnv('CRISIS_GUARD_MODE', 'off');
    vi.stubEnv('CRISIS_CLASSIFIER_MODE', 'off');
    const c = startCall({ arm: 'trial', env: DEV_CLOSED });
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
    expect(said).toBe('main');
  });

  it('T14 a crisis check that throws: today’s model answers', async () => {
    const env = Object.defineProperty({ ...DEV }, 'CRISIS_GATE_FAIL_CLOSED', {
      enumerable: false,
      get: () => {
        throw new Error('setting unreadable');
      },
    }) as Record<string, string>;
    vi.stubEnv('CRISIS_GATE_FAIL_CLOSED', 'on');
    const c = startCall({ arm: 'trial', env });
    const { said } = await c.turn(CHAT);
    expect(c.order).toEqual(['main']);
    expect(said).toBe('main');
  });
});
