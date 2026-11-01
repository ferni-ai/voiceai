/**
 * Conductor: the one place that turns call-state transitions and semantic
 * beats into channel writes. Today a dozen callbacks each write their own
 * sounds and poses, so a second participant joining replays the arrival chord
 * and three services buzz the phone for one moment.
 *
 * - State layer: one pose per CallState, replaced on every transition, never
 *   queued, so a celebration can never block the listening pose.
 * - Moment layer: one sequence at a time, by priority. Higher preempts an
 *   interruptible moment; normal waits; low is dropped. The user speaking cuts
 *   interruptible moments to their end pose. Arrival, failure and handoff run
 *   here so a state change cannot cut them.
 *
 * Every rule about WHETHER a write happens (dedupe, cooldowns, reduced motion,
 * character, mood) lives in the injected ConductorPolicy; every write and drop
 * is traced. Time is injected. An adapter that fails 3 times turns the
 * conductor off for the call (`policy fallback`) and the legacy paths resume.
 * Not wired yet: nothing constructs a conductor outside tests.
 */

import type { Sequence, SequenceStep } from '../../config/motion-sequences.js';
import type { CallState, Mood, Transition } from './call-types.js';
import { createTrace, type ChannelId, type TraceEntry } from './conductor-trace.js';

export type Priority = 'critical' | 'high' | 'normal' | 'low';
export type Layer = 'state' | 'moment';
/** What the user DID. Never a streak: Ferni doesn't celebrate how often you showed up. */
export type DelightReason = 'achievement' | 'breakthrough' | 'laughter' | 'first_meeting';

export interface ChannelCommand {
  readonly channel: ChannelId;
  /** Token step `animation`, `play`/`duck` for sound, the pattern for haptic. */
  readonly action: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
  readonly easing?: string;
  /** Sequence id, 'beat' for a direct beat, 'mood' for a policy pin. */
  readonly origin: string;
  readonly loop?: boolean;
}

/** Exactly one writer per channel. */
export interface ChannelAdapter {
  readonly id: ChannelId;
  /** Bind to the live DOM; false → the write is traced as 'unmounted'. */
  mount(): boolean;
  /** Resolves when done; the sound adapter resolves when the sound ends. */
  play(cmd: ChannelCommand, signal: AbortSignal): Promise<void>;
  /** Jump in-flight work to its END state (never snap back). */
  settle(): void;
}

export interface ConductorClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The call-machine context the conductor reads (#1686's CallContext is assignable). */
export interface ConductorCallContext {
  readonly attempt: number;
  readonly mood: Mood;
  readonly slowStage: 0 | 1 | 2;
  readonly persona?: string | null;
  readonly handoffTo?: string | null;
}

export type Beat =
  | { readonly kind: 'expression'; readonly name: string; readonly holdMs?: number }
  | { readonly kind: 'micro'; readonly name: string }
  | { readonly kind: 'emotion'; readonly id: string; readonly intensity: number }
  | { readonly kind: 'delight'; readonly size: 'small' | 'big'; readonly reason: DelightReason }
  | { readonly kind: 'sequence'; readonly id: string };
export type MomentBeat = Extract<Beat, { kind: 'delight' | 'sequence' }>;

export interface WriteContext {
  readonly layer: Layer;
  readonly sequenceId: string;
  readonly runId: number;
  readonly state: CallState;
  readonly mood: Mood;
  readonly now: number;
}

/** Per-attempt policy state (cooldowns, budgets, pins). */
export interface CallPolicy {
  /** The shaped write, or the reason it is dropped. */
  write(cmd: ChannelCommand, w: WriteContext): ChannelCommand | string;
  /** The sequence a moment beat plays, or the reason it is dropped. */
  moment(beat: MomentBeat, mood: Mood, now: number): { readonly play: string } | string;
  /** A face to pin when the mood changes (crisis), or null. */
  onMood(mood: Mood): ChannelCommand | null;
  /** True when a moment playing or queued must yield to this mood (a celebration while upset). */
  yieldsTo?(mood: Mood, sequenceId: string): boolean;
  soundStarted(track: string): void;
  soundEnded(track: string): void;
}

export interface ConductorPolicy {
  readonly maxQueue: number;
  readonly minGapMs: number;
  readonly failuresBeforeFallback: number;
  readonly bargeInDuckDb: number;
  priorityOf(sequenceId: string): Priority;
  /** The channel that writes a token step `element`; null → owned by legacy UI. */
  channelFor(element: string): ChannelId | null;
  /** The steps to play (reduced-motion simplifications applied). */
  steps(sequenceId: string, seq: Sequence): readonly SequenceStep[];
  forCall(): CallPolicy;
}

export interface ConductorDeps {
  readonly adapters: Readonly<Partial<Record<ChannelId, ChannelAdapter>>>;
  readonly clock: ConductorClock;
  readonly sequences: Readonly<Record<string, Sequence | undefined>>;
  readonly policy: ConductorPolicy;
}

export interface Conductor {
  onTransition(t: Transition, ctx: ConductorCallContext): void;
  /** Context changes without a transition (mood, a new attempt). */
  onContext(ctx: ConductorCallContext): void;
  beat(b: Beat): void;
  trace(): readonly TraceEntry[];
  /** False after a fallback: the legacy paths own the call again. */
  active(): boolean;
  dispose(): void;
}

interface Run {
  readonly id: number;
  readonly seq: string;
  readonly layer: Layer;
  readonly priority: Priority;
  readonly interruptible: boolean;
  readonly controller: AbortController;
  /** Pending step timers → their command (null: the end-of-sequence timer). */
  readonly timers: Map<unknown, ChannelCommand | null>;
  readonly pending: Set<Promise<void>>;
  readonly channels: Set<ChannelId>;
  timeUp: boolean;
  finished: boolean;
}

const RANK: Readonly<Record<Priority, number>> = { critical: 3, high: 2, normal: 1, low: 0 };
const outranks = (a: Priority, b: Priority): boolean => RANK[a] > RANK[b];

/** State → pose (state layer) and state → moment (moment layer). */
const POSE: Readonly<Partial<Record<CallState, string>>> = {
  connecting: 'arrival_calling',
  user_speaking: 'turn_user',
  speaking: 'arrival_speaking',
  listening: 'arrival_listening',
  ending: 'session_end',
};
const MOMENT_STATE: Readonly<Partial<Record<CallState, string>>> = {
  arrival: 'arrival_joined',
  error: 'arrival_failed',
  handoff_out: 'handoff_out',
  handoff_in: 'handoff_in',
};

const cmd = (
  channel: ChannelId,
  action: string,
  origin: string,
  params?: Readonly<Record<string, unknown>>
): ChannelCommand => ({ channel, action, origin, params, durationMs: 0 });

/** A fresh run: nothing scheduled, nothing pending, not finished. */
function makeRun(
  id: number,
  seq: string,
  layer: Layer,
  priority: Priority,
  interruptible: boolean
): Run {
  return {
    id,
    seq,
    layer,
    priority,
    interruptible,
    controller: new AbortController(),
    timers: new Map(),
    pending: new Set(),
    channels: new Set(),
    timeUp: true,
    finished: false,
  };
}

export function createConductor(deps: ConductorDeps): Conductor {
  const { clock, adapters, policy } = deps;
  const log = createTrace();
  const trace = (ch: TraceEntry[1], action: string, detail?: string): void =>
    log.push(clock.now(), ch, action, detail);
  const drop = (reason: string): void => trace('policy', 'drop', reason);

  let call = policy.forCall();
  let ctx: ConductorCallContext = { attempt: -1, mood: 'neutral', slowStage: 0 };
  let state: CallState = 'idle';
  let thoughtSinceArrival = false;
  let disabled = false;
  let disposed = false;
  let runIds = 0;
  let pose: Run | null = null;
  let moment: Run | null = null;
  let queue: { seq: string; priority: Priority }[] = [];
  let lastMomentEnd = -Infinity;
  let pumpTimer: unknown = null;
  const mounted = new Set<ChannelId>();
  const failures = new Map<ChannelId, number>();

  const newRun = (seq: string, layer: Layer, priority: Priority, interruptible = true): Run =>
    makeRun(++runIds, seq, layer, priority, interruptible);

  function cancel(run: Run | null, settle: boolean): void {
    if (!run || run.finished) return;
    run.finished = true;
    run.controller.abort();
    run.timers.forEach((_c, h) => clock.clearTimeout(h));
    if (settle) run.channels.forEach((ch) => safely(ch, () => adapters[ch]?.settle()));
  }

  function stopAll(): void {
    cancel(pose, false);
    cancel(moment, false);
    queue = [];
    if (pumpTimer !== null) clock.clearTimeout(pumpTimer);
    pumpTimer = null;
  }

  function safely(ch: ChannelId, fn: () => unknown): unknown {
    try {
      return fn();
    } catch {
      fail(ch);
      return undefined;
    }
  }

  function fail(ch: ChannelId): void {
    const n = (failures.get(ch) ?? 0) + 1;
    failures.set(ch, n);
    if (n < policy.failuresBeforeFallback || disabled) return;
    disabled = true;
    trace('policy', 'fallback', `${ch}:${n} failures`);
    stopAll();
  }

  function finishIfDone(run: Run): void {
    if (!run.timeUp || run.pending.size > 0 || run.finished) return;
    run.finished = true;
    if (run !== moment) return;
    moment = null;
    lastMomentEnd = clock.now();
    pump();
  }

  function dispatch(run: Run, raw: ChannelCommand): void {
    if (disabled || run.finished) return;
    const w = { layer: run.layer, sequenceId: run.seq, runId: run.id, state, mood: ctx.mood };
    const shaped = call.write(raw, { ...w, now: clock.now() });
    if (typeof shaped === 'string') return drop(shaped);
    const ch = shaped.channel;
    const adapter = adapters[ch];
    if (!adapter) return drop(`${ch}:no-adapter`);
    if (!mounted.has(ch)) {
      if (safely(ch, () => adapter.mount()) !== true) return trace(ch, 'unmounted', shaped.action);
      mounted.add(ch);
      trace(ch, 'attach');
    }
    const p = shaped.params;
    const detail = p?.track ?? p?.expression ?? p?.text;
    trace(ch, shaped.action, detail === undefined ? undefined : String(detail));
    run.channels.add(ch);
    const track = ch === 'sound' && shaped.action === 'play' ? String(p?.track) : null;
    let done: Promise<void>;
    try {
      done = adapter.play(shaped, run.controller.signal);
    } catch {
      return fail(ch);
    }
    if (track) call.soundStarted(track);
    const tracked: Promise<void> = done
      .catch(() => {
        if (!run.controller.signal.aborted) fail(ch);
      })
      .finally(() => {
        if (track) call.soundEnded(track);
        run.pending.delete(tracked);
        finishIfDone(run);
      });
    run.pending.add(tracked);
  }

  function schedule(run: Run, delay: number, c: ChannelCommand | null): void {
    if (delay <= 0 && c) return dispatch(run, c);
    const h = clock.setTimeout(() => {
      run.timers.delete(h);
      if (c) return dispatch(run, c);
      run.timeUp = true;
      finishIfDone(run);
    }, delay);
    run.timers.set(h, c);
  }

  function start(seqId: string, layer: Layer, priority: Priority): Run | null {
    const seq = deps.sequences[seqId];
    if (!seq) {
      drop(`sequence:${seqId}:missing`);
      return null;
    }
    const run = newRun(seqId, layer, priority, seq.interruptible);
    run.timeUp = false;
    for (const s of policy.steps(seqId, seq)) {
      const channel = policy.channelFor(s.element);
      if (!channel) {
        trace('policy', 'skip', `element:${s.element}`);
        continue;
      }
      const loop = (s.repeat ?? 0) !== 0;
      const step = { ...cmd(channel, s.animation, seqId, s.properties), loop };
      schedule(run, s.delay, { ...step, durationMs: s.duration, easing: s.easing });
    }
    if (seq.sound) {
      const track = seq.sound.track.replace(/\{[^}]+\}/, ctx.handoffTo ?? ctx.persona ?? '');
      const play = cmd('sound', 'play', seqId, { track, volume: seq.sound.volume });
      schedule(run, seq.sound.delay, { ...play, loop: seq.sound.loop === true });
    }
    if (seq.haptic) schedule(run, seq.haptic.delay, cmd('haptic', seq.haptic.pattern, seqId));
    schedule(run, seq.totalDuration, null);
    return run;
  }

  function pump(): void {
    if (moment !== null || queue.length === 0 || pumpTimer !== null || disabled) return;
    const wait = lastMomentEnd + policy.minGapMs - clock.now();
    if (wait > 0) {
      pumpTimer = clock.setTimeout(() => {
        pumpTimer = null;
        pump();
      }, wait);
      return;
    }
    const next = queue.shift();
    if (next) moment = start(next.seq, 'moment', next.priority);
  }

  function submit(seq: string): void {
    const priority = policy.priorityOf(seq);
    if (moment?.seq === seq || queue.at(-1)?.seq === seq) return drop(`moment:${seq}:merged`);
    const gapOk = clock.now() - lastMomentEnd >= policy.minGapMs;
    if (!moment && (gapOk || outranks(priority, 'normal'))) {
      moment = start(seq, 'moment', priority);
      return;
    }
    if (moment && outranks(priority, moment.priority) && moment.interruptible) {
      trace('policy', 'preempt', `${moment.seq}>${seq}`);
      cancel(moment, true);
      moment = start(seq, 'moment', priority);
      return;
    }
    if (priority === 'low') return drop(`moment:${seq}:low-priority`);
    if (queue.length >= policy.maxQueue) return drop(`moment:${seq}:queue-full`);
    queue.push({ seq, priority });
    queue.sort((a, b) => RANK[b.priority] - RANK[a.priority]);
    pump();
  }

  function onMomentBeat(b: MomentBeat): void {
    const verdict = call.moment(b, ctx.mood, clock.now());
    return typeof verdict === 'string' ? drop(verdict) : submit(verdict.play);
  }

  /** The user started speaking: cut what may be cut, hush what may not. */
  function bargeIn(): void {
    if (moment?.interruptible) {
      cutMoment('interrupt');
    } else if (moment) {
      const run = moment;
      run.timers.forEach((c, h) => {
        if (c?.channel !== 'haptic') return;
        clock.clearTimeout(h);
        run.timers.delete(h);
        drop(`haptic:${c.action}:barge-in`);
      });
      const duck = cmd('sound', 'duck', run.seq, { db: policy.bargeInDuckDb });
      if (run.channels.has('sound')) dispatch(run, duck);
    }
    const kept = queue.filter((q) => outranks(q.priority, 'normal'));
    queue.filter((q) => !kept.includes(q)).forEach((q) => drop(`moment:${q.seq}:barge-in`));
    queue = kept;
    safely('sound', () => adapters.sound?.settle());
  }

  /** Cut the moment short: it settles to its end pose, never snaps back. */
  function cutMoment(why: 'interrupt' | 'yield'): void {
    if (!moment) return;
    trace('policy', why, moment.seq);
    cancel(moment, true);
    moment = null;
    lastMomentEnd = clock.now();
  }

  /** A mood the policy says a celebration must yield to: cut it, and forget it in the queue. */
  function yieldTo(mood: Mood): void {
    const yields = (seq: string): boolean => call.yieldsTo?.(mood, seq) === true;
    if (moment && yields(moment.seq)) cutMoment('yield');
    queue.filter((q) => yields(q.seq)).forEach((q) => drop(`moment:${q.seq}:mood=${mood}`));
    queue = queue.filter((q) => !yields(q.seq));
  }

  function onContext(next: ConductorCallContext): void {
    if (disposed) return;
    if (next.attempt !== ctx.attempt) {
      stopAll();
      call = policy.forCall();
      failures.clear();
      disabled = false;
      thoughtSinceArrival = false;
    }
    const moodChanged = next.mood !== ctx.mood;
    ctx = next;
    if (moodChanged && !disabled) yieldTo(next.mood);
    const pin = moodChanged && !disabled ? call.onMood(next.mood) : null;
    if (!pin) return pump(); // a yielded moment may free the queue
    cancel(moment, true);
    moment = null;
    queue = [];
    dispatch(newRun('mood', 'state', 'critical', false), pin);
  }

  return {
    onTransition(t, next) {
      onContext(next);
      if (disabled) return;
      trace('state', `${t.from}>${t.to}`);
      state = t.to;
      cancel(pose, false);
      pose = null;
      if (t.to === 'user_speaking') bargeIn();
      if (t.to === 'arrival') thoughtSinceArrival = false;
      const momentSeq = MOMENT_STATE[t.to];
      if (momentSeq) return onMomentBeat({ kind: 'sequence', id: momentSeq });
      let seq = POSE[t.to];
      if (t.to === 'connecting_slow') {
        seq = ctx.slowStage === 2 ? 'arrival_very_slow' : 'arrival_slow';
      }
      if (t.to === 'thinking') {
        seq = thoughtSinceArrival ? 'turn_thinking' : 'arrival_ready';
        thoughtSinceArrival = true;
      }
      if (seq) pose = start(seq, 'state', 'normal');
    },
    onContext,
    beat(b) {
      if (disabled) return;
      if (b.kind === 'sequence' || b.kind === 'delight') return onMomentBeat(b);
      const run = newRun('beat', 'moment', 'normal');
      if (b.kind === 'emotion') {
        return dispatch(
          run,
          cmd('colour', 'emotion', 'beat', { emotion: b.id, intensity: b.intensity })
        );
      }
      const holdMs = b.kind === 'expression' ? b.holdMs : undefined;
      const action = b.kind === 'micro' ? 'micro' : 'expression';
      dispatch(run, cmd('face', action, 'beat', { expression: b.name, holdMs }));
    },
    trace: () => log.entries(),
    active: () => !disabled,
    dispose() {
      stopAll();
      disabled = true;
      disposed = true;
    },
  };
}
