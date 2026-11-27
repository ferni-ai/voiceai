/**
 * CASCADE_TRIAL_MODEL (trial-lane.ts): off unless a listed ID on dev's database, a sticky
 * per-call arm, and a receipt field that says which model answered and whether it was a hedge
 * backup. The crisis rows on the real reply path live in personas/__tests__/crisis-trial-lane.
 */
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { ThinkingLevel } from '@google/genai';
import { afterEach, describe, expect, it } from 'vitest';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { rejectsMinimalThinking } from '../../../config/thinking-defaults.js';
import { markCrisisTurn } from '../../../services/safety/crisis-turn-mark.js';
import { noteCrisisVerdictPending, signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import { cascadeThinking } from '../cartesia-cascade.js';
import { HedgedLLM } from '../hedged-llm.js';
import { withLane } from '../lane-request.js';
import {
  TRIAL_MODELS,
  trialArm,
  trialField,
  TrialLaneLLM,
  trialModel,
  trialSlot,
  withTrialLane,
} from '../trial-lane.js';

const CONN = { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 };
const DEV = { FIRESTORE_DATABASE: 'ferni-dev', CASCADE_TRIAL_MODEL: 'gemini-4-hydrogen' };

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

class StubLLM extends llm.LLM {
  readonly requests: llm.ChatContext[] = [];
  constructor(
    readonly name: string,
    readonly waitMs = 0
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
    return new StubStream(this, opts);
  }
}
class StubStream extends llm.LLMStream {
  constructor(
    private readonly stub: StubLLM,
    opts: Parameters<llm.LLM['chat']>[0]
  ) {
    super(stub, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: CONN });
  }
  protected async run(): Promise<void> {
    if (this.stub.waitMs) await sleep(this.stub.waitMs);
    this.queue.put({ id: this.stub.name, delta: { role: 'assistant', content: this.stub.name } });
  }
}

let calls = 0;
function idIn(arm: 'trial' | 'control'): string {
  for (let tries = 0; tries < 200; tries++) {
    const id = `trial-lane-unit-${++calls}`;
    if (trialArm(id) === arm) return id;
  }
  throw new Error(`no ${arm} call in 200 session ids: the arm split is broken`);
}

/**
 * A request sent on a call with this session id (or none), as the gate sends it after a live
 * gate's decision for the turn (`gate`; null: no live gate decided it).
 */
function requestOn(
  sessionId: string | undefined,
  mainLane = false,
  gate: string | null = 'pass'
): llm.ChatContext {
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'user', content: 'haha she definitely did it on purpose' });
  const userData = { services: sessionId === undefined ? {} : { sessionId } };
  if (gate) markCrisisTurn(userData, gate);
  return withLane(chatCtx, { mainLane, session: { userData } });
}

async function drain(stream: llm.LLMStream): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk.delta?.content ?? '';
  return out;
}

afterEach(() => resetCrisisCallRisk());

describe('which model the trial may use', () => {
  it('is off unless CASCADE_TRIAL_MODEL is a listed ID and the database is ferni-dev exactly', () => {
    expect(trialModel({})).toBeNull();
    expect(trialModel({ FIRESTORE_DATABASE: 'ferni-dev' })).toBeNull();
    expect(trialModel(DEV)).toBe('gemini-4-hydrogen');
    expect(trialModel({ ...DEV, CASCADE_TRIAL_MODEL: ' gemini-4-hydrogen ' })).toBe(
      'gemini-4-hydrogen'
    );
    for (const id of TRIAL_MODELS) expect(trialModel({ ...DEV, CASCADE_TRIAL_MODEL: id })).toBe(id);
    // Not listed: off, whatever the database.
    for (const id of ['on', 'gemini-3.5-flash', 'gemini-4', 'GEMINI-4-HYDROGEN', 'gemini-3.8-live'])
      expect(trialModel({ ...DEV, CASCADE_TRIAL_MODEL: id }), id).toBeNull();
  });

  it('is off on any database but dev: prod, unset, or a misspelt dev name', () => {
    for (const db of ['(default)', '', 'ferni-dev ', 'Ferni-Dev', 'ferni-dev2', 'ferni-prod'])
      expect(trialModel({ ...DEV, FIRESTORE_DATABASE: db }), db).toBeNull();
    expect(trialModel({ CASCADE_TRIAL_MODEL: 'gemini-4-hydrogen' })).toBeNull();
  });

  it('gives each trial model LOW thinking and today’s models MINIMAL', () => {
    expect(TRIAL_MODELS).toEqual([
      'gemini-3.8-flash',
      'gemini-4-argon',
      'gemini-4-carbon',
      'gemini-4-hydrogen',
      'gemini-4-neon',
    ]);
    // The cascade decides: each trial model rejects MINIMAL, so it gets LOW; today's keep MINIMAL.
    for (const id of TRIAL_MODELS) {
      expect(rejectsMinimalThinking(id), id).toBe(true);
      expect(cascadeThinking(id, {}), id).toEqual({ thinkingLevel: ThinkingLevel.LOW });
    }
    for (const id of ['gemini-3.5-flash', 'gemini-3.5-flash-lite']) {
      expect(cascadeThinking(id, {}), id).toEqual({ thinkingLevel: ThinkingLevel.MINIMAL });
    }
  });
});

describe('the arm', () => {
  it('is the same for every request of a call and splits calls about in half', () => {
    const id = idIn('trial');
    for (let i = 0; i < 5; i++) expect(trialArm(id)).toBe('trial');
    let trial = 0;
    for (let i = 0; i < 2000; i++) if (trialArm(`split-${i}`) === 'trial') trial++;
    expect(trial).toBeGreaterThan(900);
    expect(trial).toBeLessThan(1100);
  });
});

describe('withTrialLane', () => {
  it('returns today’s model itself with the trial off, and never builds the trial model', () => {
    const main = new StubLLM('main');
    let built = 0;
    const make = (): llm.LLM => {
      built++;
      return new StubLLM('trial');
    };
    expect(withTrialLane(main, make, {})).toBe(main);
    expect(withTrialLane(main, make, { ...DEV, FIRESTORE_DATABASE: '(default)' })).toBe(main);
    expect(built).toBe(0);
    expect(withTrialLane(main, make, DEV)).toBeInstanceOf(TrialLaneLLM);
    expect(built).toBe(1);
  });

  it('a clear request on a trial call goes to the trial model; on a control call, to today’s', async () => {
    const trial = new StubLLM('trial');
    const main = new StubLLM('main');
    const lane = new TrialLaneLLM(trial, main);
    expect(await drain(lane.chat({ chatCtx: requestOn(idIn('trial')), connOptions: CONN }))).toBe(
      'trial'
    );
    expect(await drain(lane.chat({ chatCtx: requestOn(idIn('control')), connOptions: CONN }))).toBe(
      'main'
    );
    expect([trial.requests.length, main.requests.length]).toEqual([1, 1]);
  });

  it.each([
    ['marked for the main model', () => requestOn(idIn('trial'), true)],
    ['on a call with risk noted', () => requestOn(noted(idIn('trial')))],
    ['with no session id', () => requestOn(undefined)],
    [
      'whose session throws when read',
      () => {
        const chatCtx = llm.ChatContext.empty();
        const session = {
          get userData(): unknown {
            throw new Error('unreadable');
          },
        };
        return withLane(chatCtx, { mainLane: false, session });
      },
    ],
    [
      'whose crisis state throws when read (after the call id)',
      () => {
        const chatCtx = llm.ChatContext.empty();
        let reads = 0;
        const userData = {
          services: { sessionId: idIn('trial') },
          get crisisGatePassedTurn(): unknown {
            reads++;
            if (reads > 0) throw new Error('unreadable');
            return true;
          },
        };
        return withLane(chatCtx, { mainLane: false, session: { userData } });
      },
    ],
    ['on a turn no live gate decided', () => requestOn(idIn('trial'), false, null)],
    ['on a turn the gate guided', () => requestOn(idIn('trial'), false, 'guide')],
    [
      'on a call the gate decided on, though its turn marks were lost, no risk noted',
      () => {
        const chatCtx = llm.ChatContext.empty();
        const sessionId = idIn('trial');
        const session = { userData: { services: { sessionId } } };
        signalCrisisDecision(session, 'guide');
        // Fresh userData: only the session remembers the decision (crisisDecidedOn).
        session.userData = { services: { sessionId } };
        markCrisisTurn(session.userData, 'pass');
        return withLane(chatCtx, { mainLane: false, session });
      },
    ],
    [
      'sent around the gate (no session on the request)',
      () => {
        const chatCtx = llm.ChatContext.empty();
        chatCtx.addMessage({ role: 'user', content: 'hi' });
        return chatCtx;
      },
    ],
  ])('a trial call’s request %s goes to today’s model', async (_how, request) => {
    const trial = new StubLLM('trial');
    const main = new StubLLM('main');
    const lane = new TrialLaneLLM(trial, main);
    expect(await drain(lane.chat({ chatCtx: request(), connOptions: CONN }))).toBe('main');
    expect(trial.requests).toHaveLength(0);
  });
});

describe('a request held on a pending crisis verdict', () => {
  /** A trial call's request whose session has `pending` noted, held on `own` (if any). */
  function heldOn(pending: Promise<unknown>, own?: Promise<unknown>): llm.ChatContext {
    const chatCtx = llm.ChatContext.empty();
    chatCtx.addMessage({ role: 'user', content: 'haha she definitely did it on purpose' });
    const userData = { services: { sessionId: idIn('trial') } };
    markCrisisTurn(userData, 'pass');
    const session = { userData };
    noteCrisisVerdictPending(session, pending);
    const held = own && { verdict: own, latest: 'haha she definitely did it on purpose' };
    return withLane(chatCtx, { mainLane: false, session, held });
  }
  const never = (): Promise<unknown> => new Promise(() => undefined);
  const closed = { ...DEV, CRISIS_GATE_FAIL_CLOSED: 'on' };

  async function answer(request: llm.ChatContext, env: Record<string, string>): Promise<string> {
    const lane = new TrialLaneLLM(new StubLLM('trial'), new StubLLM('main'), env);
    return drain(lane.chat({ chatCtx: request, connOptions: CONN }));
  }

  it('its own verdict, fail-closed on: the trial model; fail-closed off: today’s', async () => {
    const own = never();
    expect(await answer(heldOn(own, own), closed)).toBe('trial');
    expect(await answer(heldOn(own, own), DEV)).toBe('main');
    expect(await answer(heldOn(own, own), { ...DEV, CRISIS_GATE_FAIL_CLOSED: 'off' })).toBe('main');
  });

  it('an earlier turn’s verdict still pending: today’s model, fail-closed on or not', async () => {
    expect(await answer(heldOn(never(), never()), closed)).toBe('main');
    expect(await answer(heldOn(never()), closed)).toBe('main');
    expect(await answer(heldOn(never()), DEV)).toBe('main');
  });
});

function noted(id: string): string {
  noteCrisisRisk(id);
  return id;
}

describe('the receipt field', () => {
  it('is null with the trial off, so the receipt is unchanged', () => {
    expect(trialSlot(requestOn(idIn('trial')), {})).toBeNull();
    expect(trialSlot(requestOn(idIn('trial')), DEV)).not.toBeNull();
  });

  it('says the arm, the model that answered and whether a trial request was held', async () => {
    const lane = new TrialLaneLLM(new StubLLM('trial'), new StubLLM('main'));
    const clear = requestOn(idIn('trial'));
    await drain(lane.chat({ chatCtx: clear, connOptions: CONN }));
    expect(trialField({ request: clear })).toEqual({
      arm: 'trial',
      held: false,
      model: 'trial',
      backup: false,
    });
    const marked = requestOn(idIn('trial'), true);
    await drain(lane.chat({ chatCtx: marked, connOptions: CONN }));
    expect(trialField({ request: marked })).toEqual({
      arm: 'trial',
      held: true,
      model: 'main',
      backup: false,
    });
    const control = requestOn(idIn('control'));
    await drain(lane.chat({ chatCtx: control, connOptions: CONN }));
    expect(trialField({ request: control })).toMatchObject({ arm: 'control', held: false });
    // Never routed (sent before the lane, or on another model): no arm.
    expect(trialField({ request: requestOn(idIn('trial')) })).toEqual({
      arm: null,
      held: false,
      model: null,
      backup: false,
    });
  });

  it('marks an answer from the hedge backup, so the report leaves it out of the trial arm', async () => {
    const slowTrial = new HedgedLLM(new StubLLM('trial', 300), new StubLLM('fallback'), 20);
    const lane = new TrialLaneLLM(slowTrial, new StubLLM('main'));
    const request = requestOn(idIn('trial'));
    expect(await drain(lane.chat({ chatCtx: request, connOptions: CONN }))).toBe('fallback');
    expect(trialField({ request })).toEqual({
      arm: 'trial',
      held: false,
      model: 'fallback',
      backup: true,
    });
    const fastTrial = new HedgedLLM(new StubLLM('trial'), new StubLLM('fallback', 300), 200);
    const lane2 = new TrialLaneLLM(fastTrial, new StubLLM('main'));
    const request2 = requestOn(idIn('trial'));
    expect(await drain(lane2.chat({ chatCtx: request2, connOptions: CONN }))).toBe('trial');
    expect(trialField({ request: request2 })).toMatchObject({ model: 'trial', backup: false });
  });
});
