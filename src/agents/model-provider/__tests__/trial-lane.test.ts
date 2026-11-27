/**
 * CASCADE_TRIAL_MODEL (trial-lane.ts): off unless a listed ID on dev's database, a sticky
 * per-call arm, and the gate's clearance asked when a request reaches the model. The crisis rows
 * on the real reply path live in personas/__tests__/crisis-trial-lane.
 */
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { ThinkingLevel } from '@google/genai';
import { afterEach, describe, expect, it } from 'vitest';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { rejectsMinimalThinking } from '../../../config/thinking-defaults.js';
import { markCrisisTurn } from '../../../services/safety/crisis-turn-mark.js';
import { noteCrisisVerdictPending, signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import { trialClearance } from '../../safety/crisis-trial-clearance.js';
import { cascadeThinking } from '../cartesia-cascade.js';
import { withLane } from '../lane-request.js';
import { withTrialLane } from '../trial-lane.js';
import { armOf, idIn, openClearance } from './trial-arm-ids.js';

const CONN = { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 };
const DEV = { FIRESTORE_DATABASE: 'ferni-dev', CASCADE_TRIAL_MODEL: 'gemini-4-hydrogen' };
/** The IDs CASCADE_TRIAL_MODEL accepts (the list in trial-lane.ts). */
const LISTED = [
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-4-hydrogen',
  'gemini-4-neon',
];

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

/** The model withTrialLane builds under `env`, or null when it returns today's model itself. */
function modelFor(env: Record<string, string>): string | null {
  const main = new StubLLM('main');
  let built: string | null = null;
  const lane = withTrialLane(
    main,
    (model) => {
      built = model;
      return new StubLLM(model);
    },
    env
  );
  return lane === main ? null : built;
}

/** The trial lane over `trial` and `main`, on dev with the trial on (plus `env`). */
function laneOver(trial: llm.LLM, main: llm.LLM, env: Record<string, string> = DEV): llm.LLM {
  const lane = withTrialLane(main, () => trial, { ...DEV, ...env });
  if (lane === main) throw new Error('the trial is off: laneOver needs it on');
  return lane;
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
  return withLane(chatCtx, { mainLane, trial: trialClearance({ userData }) });
}

async function drain(stream: llm.LLMStream): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk.delta?.content ?? '';
  return out;
}

afterEach(() => resetCrisisCallRisk());

describe('which model the trial may use', () => {
  it('is off unless CASCADE_TRIAL_MODEL is a listed ID and the database is ferni-dev exactly', () => {
    expect(modelFor({})).toBeNull();
    expect(modelFor({ FIRESTORE_DATABASE: 'ferni-dev' })).toBeNull();
    expect(modelFor(DEV)).toBe('gemini-4-hydrogen');
    expect(modelFor({ ...DEV, CASCADE_TRIAL_MODEL: ' gemini-4-hydrogen ' })).toBe(
      'gemini-4-hydrogen'
    );
    for (const id of LISTED) expect(modelFor({ ...DEV, CASCADE_TRIAL_MODEL: id })).toBe(id);
    // Not listed: off, whatever the database.
    for (const id of ['on', 'gemini-3.5-flash', 'gemini-4', 'GEMINI-4-HYDROGEN', 'gemini-3.8-live'])
      expect(modelFor({ ...DEV, CASCADE_TRIAL_MODEL: id }), id).toBeNull();
  });

  it('is off on any database but dev: prod, unset, or a misspelt dev name', () => {
    for (const db of ['(default)', '', 'ferni-dev ', 'Ferni-Dev', 'ferni-dev2', 'ferni-prod'])
      expect(modelFor({ ...DEV, FIRESTORE_DATABASE: db }), db).toBeNull();
    expect(modelFor({ CASCADE_TRIAL_MODEL: 'gemini-4-hydrogen' })).toBeNull();
  });

  it('gives each trial model LOW thinking and today’s models MINIMAL', () => {
    // The cascade decides: each trial model rejects MINIMAL, so it gets LOW; today's keep MINIMAL.
    for (const id of LISTED) {
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
    for (let i = 0; i < 5; i++) expect(armOf(id)).toBe('trial');
    let trial = 0;
    for (let i = 0; i < 400; i++) if (armOf(`split-${i}`) === 'trial') trial++;
    // 400 fair draws: 200 +/- 10 (one standard deviation); 160..240 is four either way.
    expect(trial).toBeGreaterThan(160);
    expect(trial).toBeLessThan(240);
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
    const lane = withTrialLane(main, make, DEV);
    expect(lane).not.toBe(main);
    expect(lane.label()).toBe('trial-lane(trial | main)');
    expect(built).toBe(1);
  });

  it('a clear request on a trial call goes to the trial model; on a control call, to today’s', async () => {
    const trial = new StubLLM('trial');
    const main = new StubLLM('main');
    const lane = laneOver(trial, main);
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
        return withLane(chatCtx, { mainLane: false, trial: trialClearance(session) });
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
        return withLane(chatCtx, { mainLane: false, trial: trialClearance({ userData }) });
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
        return withLane(chatCtx, { mainLane: false, trial: trialClearance(session) });
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
    const lane = laneOver(trial, main);
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
    return withLane(chatCtx, { mainLane: false, trial: trialClearance(session, held) });
  }
  const never = (): Promise<unknown> =>
    new Promise(() => {
      // never settles
    });
  const closed = { ...DEV, CRISIS_GATE_FAIL_CLOSED: 'on' };

  async function answer(request: llm.ChatContext, env: Record<string, string>): Promise<string> {
    const lane = laneOver(new StubLLM('trial'), new StubLLM('main'), env);
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

describe('the clearance', () => {
  const ask = async (chatCtx: llm.ChatContext): Promise<string> => {
    const lane = laneOver(new StubLLM('trial'), new StubLLM('main'));
    return drain(lane.chat({ chatCtx, connOptions: CONN }));
  };
  const empty = (): llm.ChatContext => llm.ChatContext.empty();

  it('a request without one goes to today’s model, even on a trial call', async () => {
    expect(await ask(withLane(empty(), { mainLane: false }))).toBe('main');
    expect(await ask(withLane(empty(), undefined))).toBe('main');
    // The same request with a clearance on a trial call: the trial model.
    expect(
      await ask(withLane(empty(), { mainLane: false, trial: openClearance(idIn('trial')) }))
    ).toBe('trial');
  });

  it('is asked when the request reaches the model, not when the gate marks it', async () => {
    const gate = openClearance(idIn('trial'));
    let open = false;
    const clear = gate.clear.bind(gate);
    gate.clear = (env) => clear(env) && open;
    const request = withLane(empty(), { mainLane: false, trial: gate });
    expect(gate.asked).toBe(0);
    open = true; // clear by the time the model is asked
    expect(await ask(request)).toBe('trial');
    expect(gate.asked).toBe(1);
    // Risk noted after the gate marked a clear request: today's model answers.
    const id = idIn('trial');
    const late = requestOn(id);
    noteCrisisRisk(id);
    expect(await ask(late)).toBe('main');
  });

  it('a request marked for today’s model never reaches the trial, whatever the clearance says', async () => {
    const gate = openClearance(idIn('trial'));
    expect(await ask(withLane(empty(), { mainLane: true, trial: gate }))).toBe('main');
    expect(gate.asked).toBe(0);
  });
});
