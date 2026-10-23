/**
 * Call Machine
 *
 * One pure reducer that says where a call is: connecting, Ferni arriving, whose
 * turn it is, a handoff, the goodbye. Today that answer is spread over a dozen
 * callbacks that each replay their own sounds and poses, which is how a second
 * participant joining re-runs the whole arrival (connection.service.ts:681-688
 * calls onAgentConnected for anyone who joins after connect). Here arrival is
 * latched once per attempt, and every event that does not fit is dropped with a
 * reason the shadow mode can log.
 *
 * Pure: no DOM, no timers, no UI imports. Time arrives on each event (`at`);
 * the timers (connect ticks, arrival length, handoff timeout) and the turn
 * settle debounce belong to the caller.
 *
 * Events and the code that produces them today (origin/main, 2026-10-17):
 *
 * | Event               | Source                                                                  |
 * |---------------------|-------------------------------------------------------------------------|
 * | call_tap            | app.ts `connect()`, before `soundUI.play('connect')` (:645)             |
 * | connect_tick        | caller's timer while connecting; app.ts:662 `connectWithTimeout` (30 s) |
 * | connect_failed      | `connectWithTimeout` → `{ ok: false, failure }` (app/call-connect.ts)   |
 * | agent_connected     | `onAgentConnected`: connection.service.ts:500 (waitForAgent) and :686   |
 * |                     | (participantConnected); app.ts:2724 dispatches `ferni:connected` :2763  |
 * | arrival_done        | caller's timer for the arrival_joined sequence                          |
 * | connection_state    | `onStateChange` from connection.service.ts:1033 `updateState`           |
 * | agent_state         | `lk.agent.state` attribute, ui/speaker-cues-signals.ts:47 (settled)     |
 * | user_vad            | `activeSpeakersChanged`, ui/speaker-cues-signals.ts:71 (settled)        |
 * | handoff_start       | `handoffService.onHandoffStart` (handoff.service.ts:220; app.ts:2935)   |
 * | handoff_soft_open   | `handoffService.onSoftOpenComplete` (handoff.service.ts:271)            |
 * | handoff_complete    | `handoffService.onHandoffComplete` (handoff.service.ts:228)             |
 * | handoff_failed      | `handoffService.onHandoffFailed` (handoff.service.ts:236)               |
 * | handoff_cancelled   | `handoffService.onHandoffCancelled` (handoff.service.ts:261)            |
 * | handoff_timeout     | caller's 20 s timer, mirroring app.ts:2946                              |
 * | conversation_end    | data-message-handlers.ts:2466 `noteConversationEnd` (planned-goodbye)  |
 * | conversation_continue | conversation-continue.ts `handleConversationContinue`                 |
 * |                     | (`ferni:conversation-continue`): the agent took back its goodbye      |
 * | hang_up             | app.ts:760 `disconnect()`                                               |
 * | agent_disconnected  | `onAgentDisconnected`: connection.service.ts:696; app.ts:2766 dispatches |
 * |                     | `ferni:disconnected` :2775                                              |
 * | agent_lost          | `onAgentLost`: services/agent-drop-watch.ts via connection.service:678  |
 * | call_dropped        | `onUnexpectedDisconnect` (app.ts:2913)                                  |
 * | mood                | data-message-handlers.ts: crisis_detected :385, concern_detected :953,  |
 * |                     | anticipation_signal :419, emotional_trajectory :984                     |
 *
 * Turns: the latest edge wins. The user starting to speak takes the turn even
 * while Ferni's state still says speaking (a barge-in shows at once), and Ferni
 * starting to speak takes it back. This differs from `speakerFrom`, which always
 * ranks Ferni first and so holds "speaking" until the agent notices the
 * interruption.
 */

import type { ConnectFailureKind } from '../../services/connect-failure.js';
import type { ConnectionState } from '../../types/events.js';
import type { SpeakerId } from '../../types/persona.js';

export type CallState =
  | 'idle'
  | 'connecting'
  | 'connecting_slow'
  | 'arrival'
  | 'listening'
  | 'user_speaking'
  | 'thinking'
  | 'speaking'
  | 'handoff_out'
  | 'handoff_in'
  | 'ending'
  | 'ended'
  | 'error';

/** Orthogonal to the state: a reconnect never resets the turn. */
export type Link = 'ok' | 'reconnecting';
/** Orthogonal to the state: feeds the conductor's character policy. */
export type Mood = 'neutral' | 'tender' | 'upset' | 'crisis';
export type TurnState = 'listening' | 'user_speaking' | 'thinking' | 'speaking';
/** The `lk.agent.state` values (same set as ui/speaker-cues-signals.ts AgentState). */
export type AgentState = 'initializing' | 'listening' | 'thinking' | 'speaking' | 'unknown';
export type MoodSignal = 'distress' | 'concern' | 'crisis' | 'positive' | 'neutral';

export interface CallContext {
  readonly state: CallState;
  readonly link: Link;
  readonly mood: Mood;
  /** Bumped by call_tap; events stamped with an older attempt are dropped. */
  readonly attempt: number;
  /** Latched on the first agent_connected of an attempt: arrival never replays. */
  readonly arrived: boolean;
  /** Ferni's side ended and the reconnect prompt owns the moment; a new tap may start over. */
  readonly agentLost: boolean;
  /** `ending` is the agent's goodbye, which conversation_continue may take back; a hang-up never. */
  readonly agentEnding: boolean;
  readonly slowStage: 0 | 1 | 2;
  /** The latest turn, kept while arrival, a handoff or a reconnect holds the screen. */
  readonly lastTurn: TurnState;
  readonly agentState: AgentState;
  readonly userSpeaking: boolean;
  readonly persona: SpeakerId | null;
  readonly handoffTo: SpeakerId | null;
  /** Settled user turns since the mood last changed, for the mood decay. */
  readonly neutralTurns: number;
  readonly connectStartedAt: number;
  readonly enteredAt: number;
}

interface Stamp {
  /** The attempt this event belongs to (ignored on call_tap, which starts a new one). */
  readonly attempt: number;
  /** Milliseconds, from the caller's clock. */
  readonly at: number;
}

export type CallEvent = Stamp &
  (
    | { readonly type: 'call_tap' }
    | { readonly type: 'connect_tick' }
    | { readonly type: 'connect_failed'; readonly failure: ConnectFailureKind }
    | { readonly type: 'agent_connected'; readonly identity: string }
    | { readonly type: 'arrival_done' }
    | { readonly type: 'connection_state'; readonly state: ConnectionState }
    | { readonly type: 'agent_state'; readonly state: AgentState }
    | { readonly type: 'user_vad'; readonly speaking: boolean }
    | { readonly type: 'handoff_start'; readonly to: SpeakerId; readonly from: SpeakerId }
    | { readonly type: 'handoff_soft_open'; readonly to: SpeakerId; readonly from: SpeakerId }
    | { readonly type: 'handoff_complete'; readonly to: SpeakerId }
    | { readonly type: 'handoff_failed'; readonly rollbackTo?: SpeakerId }
    | { readonly type: 'handoff_cancelled' }
    | { readonly type: 'handoff_timeout' }
    | { readonly type: 'conversation_end'; readonly reason: string; readonly planned: boolean }
    | { readonly type: 'conversation_continue'; readonly reason: string }
    | { readonly type: 'hang_up' }
    | { readonly type: 'agent_disconnected' }
    | { readonly type: 'agent_lost'; readonly reason: string }
    | { readonly type: 'call_dropped'; readonly reason?: string }
    | { readonly type: 'mood'; readonly signal: MoodSignal }
  );

/** What the caller should do because of a transition (the reducer only describes it). */
export type CallEffect =
  { readonly type: 'announce_connected' } | { readonly type: 'announce_disconnected' };

export interface Transition {
  readonly from: CallState;
  readonly to: CallState;
  readonly event: CallEvent['type'];
  readonly at: number;
}

export interface CallResult {
  readonly ctx: CallContext;
  readonly transition: Transition | null;
  readonly effects: readonly CallEffect[];
  /** Set when the event was ignored: `stale`, `late:<event>` or `<state>:<event>`. */
  readonly dropped?: string;
}

export interface CallMachineConfig {
  /** Connecting this long shows the first slow stage (the `arrival_slow` text). */
  readonly slowMs: number;
  /** Connecting this long shows the second slow stage (`arrival_very_slow`). */
  readonly verySlowMs: number;
  /** `reconnectPromptOn()` (planned-goodbye.ts): when on, a lost agent leaves the state to the prompt. */
  readonly reconnectPromptOn: boolean;
}

export const DEFAULT_CALL_MACHINE_CONFIG: CallMachineConfig = {
  slowMs: 4000,
  verySlowMs: 9000,
  reconnectPromptOn: false,
};

const TURNS: ReadonlySet<CallState> = new Set([
  'listening',
  'user_speaking',
  'thinking',
  'speaking',
]);
const CONNECTING: ReadonlySet<CallState> = new Set(['connecting', 'connecting_slow']);
const IN_CALL: ReadonlySet<CallState> = new Set(['arrival', ...TURNS, 'handoff_out', 'handoff_in']);
const HANDOFF: ReadonlySet<CallState> = new Set(['handoff_out', 'handoff_in']);
/** No call to follow: turn, handoff and mood events here are late. */
const LATE: ReadonlySet<CallState> = new Set(['idle', 'ending', 'ended', 'error']);
/** No call at all: a tap may start one. */
const OVER: ReadonlySet<CallState> = new Set(['idle', 'ended', 'error']);

const NO_EFFECTS: readonly CallEffect[] = [];

export function initialContext(): CallContext {
  return {
    state: 'idle',
    link: 'ok',
    mood: 'neutral',
    attempt: 0,
    arrived: false,
    agentLost: false,
    agentEnding: false,
    slowStage: 0,
    lastTurn: 'listening',
    agentState: 'unknown',
    userSpeaking: false,
    persona: null,
    handoffTo: null,
    neutralTurns: 0,
    connectStartedAt: 0,
    enteredAt: 0,
  };
}

function stay(ctx: CallContext, patch?: Partial<CallContext>): CallResult {
  return { ctx: patch ? { ...ctx, ...patch } : ctx, transition: null, effects: NO_EFFECTS };
}

function drop(ctx: CallContext, dropped: string): CallResult {
  return { ctx, transition: null, effects: NO_EFFECTS, dropped };
}

function illegal(ctx: CallContext, ev: CallEvent): CallResult {
  return drop(ctx, LATE.has(ctx.state) ? `late:${ev.type}` : `${ctx.state}:${ev.type}`);
}

function go(
  ctx: CallContext,
  ev: CallEvent,
  to: CallState,
  patch: Partial<CallContext> = {}
): CallResult {
  if (to === ctx.state) return stay(ctx, patch);
  const next: CallContext = { ...ctx, ...patch, state: to, enteredAt: ev.at };
  const effects: CallEffect[] = [];
  if (to === 'arrival') effects.push({ type: 'announce_connected' });
  if ((to === 'ended' || to === 'error') && ctx.arrived) {
    effects.push({ type: 'announce_disconnected' });
  }
  return { ctx: next, transition: { from: ctx.state, to, event: ev.type, at: ev.at }, effects };
}

function agentTurn(state: AgentState): TurnState {
  if (state === 'speaking') return 'speaking';
  return state === 'thinking' ? 'thinking' : 'listening';
}

/** Upset eases to tender after 2 settled user turns, tender to neutral after 3 more. */
function decay(ctx: CallContext): Partial<CallContext> {
  if (ctx.mood !== 'upset' && ctx.mood !== 'tender') return {};
  const turns = ctx.neutralTurns + 1;
  if (ctx.mood === 'upset' && turns >= 2) return { mood: 'tender', neutralTurns: 0 };
  if (ctx.mood === 'tender' && turns >= 3) return { mood: 'neutral', neutralTurns: 0 };
  return { neutralTurns: turns };
}

function onTurn(
  ctx: CallContext,
  ev: CallEvent,
  raw: Partial<CallContext>,
  turn: TurnState
): CallResult {
  if (LATE.has(ctx.state)) return drop(ctx, `late:${ev.type}`);
  const patch: Partial<CallContext> = { ...raw, lastTurn: turn };
  // Arrival, a handoff and a reconnect hold the screen; the turn is kept for after.
  if (!TURNS.has(ctx.state) || ctx.link === 'reconnecting' || turn === ctx.state) {
    return stay(ctx, patch);
  }
  return go(ctx, ev, turn, turn === 'user_speaking' ? { ...patch, ...decay(ctx) } : patch);
}

function onMood(ctx: CallContext, signal: MoodSignal): CallResult {
  if (ctx.mood === 'crisis') return stay(ctx); // sticky for the rest of the call
  switch (signal) {
    case 'crisis':
      return stay(ctx, { mood: 'crisis', neutralTurns: 0 });
    case 'distress':
    case 'concern':
      return stay(ctx, { mood: 'upset', neutralTurns: 0 });
    case 'positive':
      return ctx.mood === 'upset' ? stay(ctx, { mood: 'tender', neutralTurns: 0 }) : stay(ctx);
    case 'neutral':
      return stay(ctx);
  }
}

function onConnectionState(ctx: CallContext, ev: CallEvent, state: ConnectionState): CallResult {
  if (OVER.has(ctx.state)) return drop(ctx, `late:${ev.type}`);
  switch (state) {
    case 'reconnecting':
      return stay(ctx, { link: 'reconnecting' });
    case 'connected':
      if (ctx.link === 'ok') return stay(ctx);
      // Back from a reconnect: resume the latest turn, never replay arrival.
      return TURNS.has(ctx.state)
        ? go(ctx, ev, ctx.lastTurn, { link: 'ok' })
        : stay(ctx, { link: 'ok' });
    case 'connecting':
      return stay(ctx);
    case 'disconnected':
    case 'error':
      if (ctx.state === 'ending') return go(ctx, ev, 'ended', { link: 'ok' });
      // While connecting, connect_failed reports the outcome.
      if (CONNECTING.has(ctx.state)) return stay(ctx);
      return go(ctx, ev, 'error', { link: 'ok' });
  }
}

function endHandoff(ctx: CallContext, ev: CallEvent, persona: SpeakerId | null): CallResult {
  if (!HANDOFF.has(ctx.state)) return illegal(ctx, ev);
  return go(ctx, ev, ctx.lastTurn, { persona, handoffTo: null });
}

export function reduce(
  ctx: CallContext,
  ev: CallEvent,
  config: CallMachineConfig = DEFAULT_CALL_MACHINE_CONFIG
): CallResult {
  if (ev.type === 'call_tap') {
    if (!OVER.has(ctx.state) && !ctx.agentLost) return illegal(ctx, ev);
    // A new attempt starts clean: not arrived, neutral mood, link ok. The persona carries over.
    return go(ctx, ev, 'connecting', {
      ...initialContext(),
      attempt: ctx.attempt + 1,
      persona: ctx.persona,
      connectStartedAt: ev.at,
    });
  }
  if (ev.attempt !== ctx.attempt) return drop(ctx, 'stale');

  switch (ev.type) {
    case 'connect_tick': {
      if (!CONNECTING.has(ctx.state)) return illegal(ctx, ev);
      const elapsed = ev.at - ctx.connectStartedAt;
      const stage = elapsed >= config.verySlowMs ? 2 : elapsed >= config.slowMs ? 1 : 0;
      if (stage <= ctx.slowStage) return stay(ctx);
      return go(ctx, ev, 'connecting_slow', { slowStage: stage });
    }
    case 'connect_failed':
      return CONNECTING.has(ctx.state) ? go(ctx, ev, 'error') : illegal(ctx, ev);
    case 'agent_connected':
      if (ctx.arrived) return drop(ctx, 'late:agent_connected');
      return CONNECTING.has(ctx.state)
        ? go(ctx, ev, 'arrival', { arrived: true })
        : illegal(ctx, ev);
    case 'arrival_done':
      return ctx.state === 'arrival' ? go(ctx, ev, ctx.lastTurn) : illegal(ctx, ev);
    case 'connection_state':
      return onConnectionState(ctx, ev, ev.state);
    case 'agent_state': {
      const turn =
        ev.state === 'speaking' || !ctx.userSpeaking ? agentTurn(ev.state) : 'user_speaking';
      return onTurn(ctx, ev, { agentState: ev.state }, turn);
    }
    case 'user_vad': {
      const turn = ev.speaking ? 'user_speaking' : agentTurn(ctx.agentState);
      return onTurn(ctx, ev, { userSpeaking: ev.speaking }, turn);
    }
    case 'handoff_start':
      if (!TURNS.has(ctx.state)) return illegal(ctx, ev);
      return go(ctx, ev, 'handoff_out', { handoffTo: ev.to, persona: ev.from });
    case 'handoff_soft_open':
      return ctx.state === 'handoff_out' ? go(ctx, ev, 'handoff_in') : illegal(ctx, ev);
    case 'handoff_complete':
      return endHandoff(ctx, ev, ev.to);
    case 'handoff_failed':
      return endHandoff(ctx, ev, ev.rollbackTo ?? ctx.persona);
    case 'handoff_cancelled':
    case 'handoff_timeout':
      return endHandoff(ctx, ev, ctx.persona);
    case 'conversation_end':
      if (!ev.planned) return drop(ctx, 'unplanned:conversation_end');
      return IN_CALL.has(ctx.state)
        ? go(ctx, ev, 'ending', { agentEnding: true })
        : illegal(ctx, ev);
    case 'conversation_continue':
      // Crisis risk, or the caller kept talking: the call carries on, Ferni listening.
      if (ctx.state !== 'ending' || !ctx.agentEnding) return illegal(ctx, ev);
      return go(ctx, ev, 'listening', { agentEnding: false, lastTurn: 'listening' });
    case 'hang_up':
      return IN_CALL.has(ctx.state) || CONNECTING.has(ctx.state)
        ? go(ctx, ev, 'ending')
        : illegal(ctx, ev);
    case 'agent_disconnected':
      return ctx.state === 'ending' ? go(ctx, ev, 'ended') : illegal(ctx, ev);
    case 'agent_lost':
      if (ctx.state === 'ending') return go(ctx, ev, 'ended');
      if (!IN_CALL.has(ctx.state)) return illegal(ctx, ev);
      return config.reconnectPromptOn ? stay(ctx, { agentLost: true }) : go(ctx, ev, 'error');
    case 'call_dropped':
      if (ctx.state === 'ending') return go(ctx, ev, 'ended');
      return IN_CALL.has(ctx.state) || CONNECTING.has(ctx.state)
        ? go(ctx, ev, 'error')
        : illegal(ctx, ev);
    case 'mood':
      return LATE.has(ctx.state) ? drop(ctx, `late:${ev.type}`) : onMood(ctx, ev.signal);
    default: {
      const unreachable: never = ev;
      return unreachable;
    }
  }
}
