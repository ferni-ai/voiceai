/**
 * The call machine is a pure reducer, so every case here drives the real
 * `reduce` from a context reached by real events (never a hand-built one), and
 * reads only what it returns: the next context, the transition, the effects and
 * the drop reason.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALL_MACHINE_CONFIG,
  initialContext,
  reduce,
  type CallContext,
  type CallEvent,
  type CallMachineConfig,
  type CallResult,
  type CallState,
} from '../../src/app/call/call-machine.js';

type Body = CallEvent extends infer E
  ? E extends unknown
    ? Omit<E, 'attempt' | 'at'>
    : never
  : never;

const T0 = 1_000;

/** Freezes every context so a mutating reducer throws (ES modules run strict). */
function step(
  ctx: CallContext,
  body: Body,
  at: number,
  config: CallMachineConfig = DEFAULT_CALL_MACHINE_CONFIG,
  attempt = ctx.attempt
): CallResult {
  const result = reduce(Object.freeze(ctx), { ...body, attempt, at } as CallEvent, config);
  Object.freeze(result.ctx);
  return result;
}

/** Runs events one ms apart from T0 and returns every result. */
function run(
  bodies: readonly Body[],
  from: CallContext = initialContext(),
  config: CallMachineConfig = DEFAULT_CALL_MACHINE_CONFIG
): CallResult[] {
  const results: CallResult[] = [];
  let ctx = from;
  bodies.forEach((body, i) => {
    const result = step(ctx, body, (from.enteredAt || T0) + i + 1, config);
    results.push(result);
    ctx = result.ctx;
  });
  return results;
}

function last(results: readonly CallResult[]): CallContext {
  const result = results[results.length - 1];
  if (!result) throw new Error('no results');
  return result.ctx;
}

const TAP: Body = { type: 'call_tap' };
const JOIN: Body = { type: 'agent_connected', identity: 'agent-ferni' };
const ARRIVED: Body = { type: 'arrival_done' };
const agent = (state: 'listening' | 'thinking' | 'speaking'): Body => ({
  type: 'agent_state',
  state,
});
const vad = (speaking: boolean): Body => ({ type: 'user_vad', speaking });
const link = (state: 'reconnecting' | 'connected' | 'disconnected'): Body => ({
  type: 'connection_state',
  state,
});
const HANDOFF_START: Body = { type: 'handoff_start', to: 'maya-santos', from: 'ferni' };
const SOFT_OPEN: Body = { type: 'handoff_soft_open', to: 'maya-santos', from: 'ferni' };

const IN_CALL_PATH: readonly Body[] = [TAP, JOIN, ARRIVED];

/** Real event paths into each state. */
const PATHS: Readonly<Record<CallState, readonly Body[]>> = {
  idle: [],
  connecting: [TAP],
  connecting_slow: [TAP, { type: 'connect_tick' }],
  arrival: [TAP, JOIN],
  listening: IN_CALL_PATH,
  user_speaking: [...IN_CALL_PATH, vad(true)],
  thinking: [...IN_CALL_PATH, agent('thinking')],
  speaking: [...IN_CALL_PATH, agent('speaking')],
  handoff_out: [...IN_CALL_PATH, HANDOFF_START],
  handoff_in: [...IN_CALL_PATH, HANDOFF_START, SOFT_OPEN],
  ending: [...IN_CALL_PATH, { type: 'hang_up' }],
  ended: [...IN_CALL_PATH, { type: 'hang_up' }, link('disconnected')],
  error: [TAP, { type: 'connect_failed', failure: 'timeout' }],
};

const STATES = Object.keys(PATHS) as CallState[];

/** The tick in PATHS.connecting_slow must already be past the slow threshold. */
const SLOW_CONFIG: CallMachineConfig = {
  ...DEFAULT_CALL_MACHINE_CONFIG,
  slowMs: 1,
  verySlowMs: 50,
};

function reach(state: CallState): CallContext {
  const results = run(PATHS[state], initialContext(), SLOW_CONFIG);
  const ctx = results.length > 0 ? last(results) : initialContext();
  expect(ctx.state).toBe(state);
  return ctx;
}

describe('call machine: reaching every state', () => {
  it.each(STATES)('%s is reachable by real events', (state) => {
    expect(reach(state).state).toBe(state);
  });
});

/**
 * Every state × every event. An outcome is a target state (a transition),
 * 'stay' (accepted, no state change) or 'drop' (ignored, with a reason).
 * Rows not listed for an event are 'drop'.
 */
type Outcome = CallState | 'stay' | 'drop';
const IN_CALL: readonly CallState[] = [
  'arrival',
  'listening',
  'user_speaking',
  'thinking',
  'speaking',
  'handoff_out',
  'handoff_in',
];
const CONNECTING: readonly CallState[] = ['connecting', 'connecting_slow'];
const each = (
  states: readonly CallState[],
  outcome: Outcome
): Partial<Record<CallState, Outcome>> => Object.fromEntries(states.map((s) => [s, outcome]));

const MATRIX: ReadonlyArray<[string, Body, Partial<Record<CallState, Outcome>>]> = [
  ['call_tap', TAP, { idle: 'connecting', ended: 'connecting', error: 'connecting' }],
  [
    'connect_tick (very slow)',
    { type: 'connect_tick' },
    { connecting: 'connecting_slow', connecting_slow: 'stay' },
  ],
  ['connect_failed', { type: 'connect_failed', failure: 'network' }, each(CONNECTING, 'error')],
  ['agent_connected', JOIN, each(CONNECTING, 'arrival')],
  ['arrival_done', ARRIVED, { arrival: 'listening' }],
  [
    'agent_state speaking',
    agent('speaking'),
    {
      ...each([...CONNECTING, 'arrival', 'handoff_out', 'handoff_in', 'speaking'], 'stay'),
      listening: 'speaking',
      user_speaking: 'speaking',
      thinking: 'speaking',
    },
  ],
  [
    'user_vad start',
    vad(true),
    {
      ...each([...CONNECTING, 'arrival', 'handoff_out', 'handoff_in', 'user_speaking'], 'stay'),
      listening: 'user_speaking',
      thinking: 'user_speaking',
      speaking: 'user_speaking',
    },
  ],
  ['link reconnecting', link('reconnecting'), each([...CONNECTING, ...IN_CALL, 'ending'], 'stay')],
  ['link connected', link('connected'), each([...CONNECTING, ...IN_CALL, 'ending'], 'stay')],
  [
    'link disconnected',
    link('disconnected'),
    { ...each(CONNECTING, 'stay'), ...each(IN_CALL, 'error'), ending: 'ended' },
  ],
  [
    'handoff_start',
    HANDOFF_START,
    each(['listening', 'user_speaking', 'thinking', 'speaking'], 'handoff_out'),
  ],
  ['handoff_soft_open', SOFT_OPEN, { handoff_out: 'handoff_in' }],
  [
    'handoff_complete',
    { type: 'handoff_complete', to: 'maya-santos' },
    each(['handoff_out', 'handoff_in'], 'listening'),
  ],
  [
    'handoff_failed',
    { type: 'handoff_failed', rollbackTo: 'ferni' },
    each(['handoff_out', 'handoff_in'], 'listening'),
  ],
  [
    'handoff_cancelled',
    { type: 'handoff_cancelled' },
    each(['handoff_out', 'handoff_in'], 'listening'),
  ],
  [
    'handoff_timeout',
    { type: 'handoff_timeout' },
    each(['handoff_out', 'handoff_in'], 'listening'),
  ],
  [
    'conversation_end planned',
    { type: 'conversation_end', reason: 'goodbye_complete', planned: true },
    each(IN_CALL, 'ending'),
  ],
  ['hang_up', { type: 'hang_up' }, each([...CONNECTING, ...IN_CALL], 'ending')],
  ['agent_disconnected', { type: 'agent_disconnected' }, { ending: 'ended' }],
  [
    'agent_lost (no prompt)',
    { type: 'agent_lost', reason: 'agent_left' },
    { ...each(IN_CALL, 'error'), ending: 'ended' },
  ],
  [
    'call_dropped',
    { type: 'call_dropped' },
    { ...each([...CONNECTING, ...IN_CALL], 'error'), ending: 'ended' },
  ],
  [
    'mood distress',
    { type: 'mood', signal: 'distress' },
    each([...CONNECTING, ...IN_CALL], 'stay'),
  ],
];

describe('call machine: every state × every event', () => {
  const rows = MATRIX.flatMap(([name, body, outcomes]) =>
    STATES.map((state) => [name, state, outcomes[state] ?? 'drop', body] as const)
  );

  it.each(rows)('%s in %s → %s', (_name, state, outcome, body) => {
    const ctx = reach(state);
    // Far enough after the last event to pass both slow thresholds.
    const result = step(ctx, body, ctx.enteredAt + 10_000, SLOW_CONFIG);
    if (outcome === 'drop') {
      expect(result.dropped).toBeTruthy();
      expect(result.ctx).toBe(ctx);
      expect(result.transition).toBeNull();
      expect(result.effects).toEqual([]);
    } else if (outcome === 'stay') {
      expect(result.dropped).toBeUndefined();
      expect(result.transition).toBeNull();
      expect(result.ctx.state).toBe(state);
    } else {
      expect(result.dropped).toBeUndefined();
      expect(result.ctx.state).toBe(outcome);
      expect(result.transition).toMatchObject({ from: state, to: outcome, event: body.type });
    }
  });
});

describe('call machine: arrival happens once per attempt', () => {
  it('a second agent_connected (participantConnected re-fire) is a no-op in every later state', () => {
    for (const state of [...IN_CALL, 'ending', 'ended'] as const) {
      const ctx = reach(state);
      const result = step(ctx, JOIN, ctx.enteredAt + 1);
      expect(result.dropped).toBe('late:agent_connected');
      expect(result.ctx).toBe(ctx);
      expect(result.effects).toEqual([]);
    }
  });

  it('announces connected exactly once across a call with re-fires, a reconnect and a handoff', () => {
    const results = run([
      TAP,
      JOIN,
      JOIN,
      ARRIVED,
      { type: 'agent_connected', identity: 'second-participant' },
      link('reconnecting'),
      JOIN,
      link('connected'),
      HANDOFF_START,
      { type: 'agent_connected', identity: 'agent-jack' },
      SOFT_OPEN,
      { type: 'handoff_complete', to: 'maya-santos' },
      JOIN,
    ]);
    const announced = results
      .flatMap((r) => r.effects)
      .filter((e) => e.type === 'announce_connected');
    expect(announced).toHaveLength(1);
    expect(results.filter((r) => r.transition?.to === 'arrival')).toHaveLength(1);
    expect(results.filter((r) => r.dropped === 'late:agent_connected')).toHaveLength(5);
  });

  it('a new attempt after the call ends may arrive again', () => {
    const results = run([...PATHS.ended, TAP, JOIN]);
    const ctx = last(results);
    expect(ctx.state).toBe('arrival');
    expect(ctx.attempt).toBe(2);
    expect(
      results.flatMap((r) => r.effects).filter((e) => e.type === 'announce_connected')
    ).toHaveLength(2);
  });

  it('drops an event stamped with an older attempt as stale', () => {
    const ctx = last(run([...PATHS.error, TAP]));
    expect(ctx.attempt).toBe(2);
    const result = step(ctx, JOIN, ctx.enteredAt + 1, DEFAULT_CALL_MACHINE_CONFIG, 1);
    expect(result.dropped).toBe('stale');
    expect(result.ctx).toBe(ctx);
  });
});

describe('call machine: slow connect', () => {
  const config: CallMachineConfig = {
    ...DEFAULT_CALL_MACHINE_CONFIG,
    slowMs: 4000,
    verySlowMs: 9000,
  };

  it('stays connecting before the threshold, then stage 1, then stage 2 in the same state', () => {
    let ctx = step(initialContext(), TAP, T0, config).ctx;
    const early = step(ctx, { type: 'connect_tick' }, T0 + 3999, config);
    expect(early.transition).toBeNull();
    expect(early.ctx.state).toBe('connecting');
    expect(early.ctx.slowStage).toBe(0);

    const slow = step(early.ctx, { type: 'connect_tick' }, T0 + 4000, config);
    expect(slow.transition).toMatchObject({ from: 'connecting', to: 'connecting_slow' });
    expect(slow.ctx.slowStage).toBe(1);

    const verySlow = step(slow.ctx, { type: 'connect_tick' }, T0 + 9000, config);
    expect(verySlow.transition).toBeNull();
    expect(verySlow.ctx.state).toBe('connecting_slow');
    expect(verySlow.ctx.slowStage).toBe(2);

    ctx = step(verySlow.ctx, JOIN, T0 + 9500, config).ctx;
    expect(ctx.state).toBe('arrival');
  });

  it('reads the thresholds from config', () => {
    const fast: CallMachineConfig = { ...config, slowMs: 100, verySlowMs: 200 };
    const ctx = step(initialContext(), TAP, T0, fast).ctx;
    expect(step(ctx, { type: 'connect_tick' }, T0 + 100, fast).ctx.state).toBe('connecting_slow');
    expect(step(ctx, { type: 'connect_tick' }, T0 + 100, config).ctx.state).toBe('connecting');
  });
});

describe('call machine: turns', () => {
  it('a user barge-in during speaking goes to user_speaking at once', () => {
    const results = run([vad(true), agent('listening'), vad(false)], reach('speaking'));
    expect(results.map((r) => r.ctx.state)).toEqual([
      'user_speaking',
      'user_speaking',
      'listening',
    ]);
    expect(results[0]?.transition).toMatchObject({
      from: 'speaking',
      to: 'user_speaking',
      event: 'user_vad',
    });
  });

  it('Ferni starting to speak takes the turn back from the user', () => {
    const results = run([agent('speaking'), vad(false)], reach('user_speaking'));
    expect(results.map((r) => r.ctx.state)).toEqual(['speaking', 'speaking']);
  });

  it('a turn during arrival is kept and shown when arrival finishes', () => {
    const results = run([agent('speaking'), ARRIVED], reach('arrival'));
    expect(results[0]?.transition).toBeNull();
    expect(last(results).state).toBe('speaking');
  });
});

describe('call machine: reconnect during speaking', () => {
  it('keeps the state, freezes turns, and resumes the latest turn without replaying arrival', () => {
    const results = run(
      [link('reconnecting'), vad(true), JOIN, link('connected')],
      reach('speaking')
    );
    const [reconnecting, frozen, rejoin, connected] = results;
    expect(reconnecting?.ctx).toMatchObject({ state: 'speaking', link: 'reconnecting' });
    expect(frozen?.transition).toBeNull();
    expect(frozen?.ctx.state).toBe('speaking');
    expect(rejoin?.dropped).toBe('late:agent_connected');
    expect(connected?.ctx).toMatchObject({ state: 'user_speaking', link: 'ok' });
    expect(connected?.effects).toEqual([]);
  });

  it('a disconnect while reconnecting is an error, and announces disconnected', () => {
    const result = last(run([link('reconnecting'), link('disconnected')], reach('speaking')));
    expect(result).toMatchObject({ state: 'error', link: 'ok' });
    const effects = run([link('reconnecting'), link('disconnected')], reach('speaking'))[1]
      ?.effects;
    expect(effects).toEqual([{ type: 'announce_disconnected' }]);
  });
});

describe('call machine: handoff', () => {
  it('goes out, in, then back to the latest turn with the new persona', () => {
    const results = run(
      [HANDOFF_START, SOFT_OPEN, { type: 'handoff_complete', to: 'maya-santos' }],
      reach('listening')
    );
    expect(results.map((r) => r.ctx.state)).toEqual(['handoff_out', 'handoff_in', 'listening']);
    expect(last(results)).toMatchObject({ persona: 'maya-santos', handoffTo: null });
    expect(results[0]?.ctx.handoffTo).toBe('maya-santos');
  });

  it('a failed handoff rolls the persona back', () => {
    const ctx = last(
      run([HANDOFF_START, { type: 'handoff_failed', rollbackTo: 'ferni' }], reach('listening'))
    );
    expect(ctx).toMatchObject({ state: 'listening', persona: 'ferni', handoffTo: null });
  });

  it('drops a soft open with no handoff out, and a second handoff start', () => {
    expect(step(reach('listening'), SOFT_OPEN, T0 + 99).dropped).toBe(
      'listening:handoff_soft_open'
    );
    expect(step(reach('handoff_out'), HANDOFF_START, T0 + 99).dropped).toBe(
      'handoff_out:handoff_start'
    );
  });
});

describe('call machine: ending', () => {
  it.each([...CONNECTING, ...IN_CALL])(
    'hang_up from %s goes to ending, then the room closing ends it',
    (state) => {
      const ending = step(reach(state), { type: 'hang_up' }, T0 + 99);
      expect(ending.ctx.state).toBe('ending');
      const ended = step(ending.ctx, link('disconnected'), T0 + 100);
      expect(ended.ctx.state).toBe('ended');
    }
  );

  it("drops Ferni's turn events after ending", () => {
    const ctx = reach('ending');
    expect(step(ctx, agent('speaking'), T0 + 99).dropped).toBe('late:agent_state');
    expect(step(ctx, vad(true), T0 + 99).dropped).toBe('late:user_vad');
    expect(step(ctx, { type: 'handoff_complete', to: 'maya-santos' }, T0 + 99).dropped).toBe(
      'late:handoff_complete'
    );
  });

  it('an unplanned conversation_end does not start the goodbye', () => {
    const result = step(
      reach('listening'),
      { type: 'conversation_end', reason: 'error', planned: false },
      T0 + 99
    );
    expect(result.dropped).toBe('unplanned:conversation_end');
  });

  it('announces disconnected only for a call that arrived', () => {
    expect(run(PATHS.ended).flatMap((r) => r.effects)).toContainEqual({
      type: 'announce_disconnected',
    });
    expect(run(PATHS.error).flatMap((r) => r.effects)).toEqual([]);
  });
});

describe('call machine: agent lost', () => {
  const prompt: CallMachineConfig = { ...DEFAULT_CALL_MACHINE_CONFIG, reconnectPromptOn: true };

  it('with the reconnect prompt on, the state stays and a new tap may start over', () => {
    const lost = step(
      reach('listening'),
      { type: 'agent_lost', reason: 'agent_left' },
      T0 + 99,
      prompt
    );
    expect(lost.transition).toBeNull();
    expect(lost.ctx).toMatchObject({ state: 'listening', agentLost: true });
    const retry = step(lost.ctx, TAP, T0 + 100, prompt);
    expect(retry.ctx).toMatchObject({
      state: 'connecting',
      attempt: 2,
      arrived: false,
      agentLost: false,
    });
  });

  it('a tap mid-call without a lost agent is dropped', () => {
    expect(step(reach('speaking'), TAP, T0 + 99).dropped).toBe('speaking:call_tap');
  });
});

describe('call machine: mood', () => {
  it('distress makes it upset, 2 user turns ease it to tender, 3 more to neutral', () => {
    const turn: Body[] = [vad(true), vad(false)];
    const results = run(
      [{ type: 'mood', signal: 'distress' }, ...turn, ...turn, ...turn, ...turn, ...turn],
      reach('listening')
    );
    const moods = results
      .filter((r) => r.transition?.to === 'user_speaking')
      .map((r) => r.ctx.mood);
    expect(results[0]?.ctx.mood).toBe('upset');
    expect(moods).toEqual(['upset', 'tender', 'tender', 'tender', 'neutral']);
  });

  it('crisis is sticky for the rest of the call and resets on a new attempt', () => {
    const results = run(
      [
        { type: 'mood', signal: 'crisis' },
        { type: 'mood', signal: 'positive' },
        vad(true),
        vad(false),
        vad(true),
      ],
      reach('listening')
    );
    expect(results.every((r) => r.ctx.mood === 'crisis')).toBe(true);
    const fresh = last(run([{ type: 'hang_up' }, link('disconnected'), TAP], last(results)));
    expect(fresh.mood).toBe('neutral');
  });

  it('positive softens upset to tender but does not lift neutral', () => {
    const upset = step(reach('listening'), { type: 'mood', signal: 'concern' }, T0 + 99).ctx;
    expect(step(upset, { type: 'mood', signal: 'positive' }, T0 + 100).ctx.mood).toBe('tender');
    expect(step(reach('listening'), { type: 'mood', signal: 'positive' }, T0 + 99).ctx.mood).toBe(
      'neutral'
    );
  });
});
