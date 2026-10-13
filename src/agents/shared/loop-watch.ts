/**
 * Event-loop stall watch for live calls.
 *
 * Every call runs on the worker's one Node event loop, beside the Silero VAD,
 * the TTS frame pump and LiveKit's audio source. A synchronous block longer
 * than the audio already queued in the room output is heard as Ferni's voice
 * hanging mid-word. (Prod 2026-10-12, AJ_B8EJgUk8qGdj: the VAD fell 1.27 s
 * behind during session start, with 211 ms and 250 ms blocks either side of
 * the greeting's first audio frame.)
 *
 * A 10 ms timer notes each late tick. A tick late by >= LOOP_STALL_MS (default
 * 100) is logged as LOOP_STALL with what the agent was doing; each call ends
 * with one LOOP_SUMMARY: event-loop delay percentiles over the call and stall
 * counts overall, while Ferni spoke, and in the first second of a reply (the
 * audio queue is thinnest then, so a stall is most audible).
 *
 * @module agents/shared/loop-watch
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

import { registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

const TICK_MS = 10;
/** The first second of a reply: the room output's queue is still filling. */
const REPLY_START_MS = 1000;
const MAX_STALL_LOGS = 100;

export interface Stall {
  /** Epoch ms the late tick was noticed; the block began `ms` earlier. */
  at: number;
  ms: number;
  agentState: string;
  /** How long Ferni had been speaking when the block began; null when not speaking. */
  speakingMs: number | null;
}

export interface CallLoopSummary {
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  stalls: number;
  stallMs: number;
  stalls250: number;
  speakingStalls: number;
  replyStartStalls: number;
  worst: Array<{ atMs: number; ms: number; state: string }>;
}

// ---------------------------------------------------------------- agent state

let agentState = 'unknown';
let speakingSince: number | null = null;

/** Called on every agent_state_changed, so stalls say what the agent was doing. */
export function noteAgentState(state: string, at: number = Date.now()): void {
  if (state === 'speaking' && agentState !== 'speaking') speakingSince = at;
  if (state !== 'speaking') speakingSince = null;
  agentState = state;
}

/** Feeds a session's agent_state_changed events to noteAgentState (sessions without events are skipped). */
export function watchAgentState(session: unknown): void {
  const on = (session as { on?: (e: string, fn: (ev: { newState?: string }) => void) => unknown })
    ?.on;
  if (typeof on !== 'function') return;
  on.call(session, 'agent_state_changed', (ev) => {
    if (ev?.newState) noteAgentState(ev.newState);
  });
}

// ---------------------------------------------------------------- the watcher

type Listener = (s: Stall) => void;
const listeners = new Set<Listener>();
let stopTicker: (() => void) | null = null;

export interface Ticker {
  now: () => number;
  every: (ms: number, fn: () => void) => () => void;
}

const realTicker: Ticker = {
  now: () => Date.now(),
  every: (ms, fn) => registerInterval('loop-stall-watch', fn, ms),
};

/** Starts the process-wide tick (once) and returns a detach for `fn`. */
export function onStall(
  fn: Listener,
  thresholdMs: number,
  ticker: Ticker = realTicker
): () => void {
  listeners.add(fn);
  if (!stopTicker) {
    let last = ticker.now();
    stopTicker = ticker.every(TICK_MS, () => {
      const now = ticker.now();
      const late = now - last - TICK_MS;
      last = now;
      if (late < thresholdMs) return;
      const began = now - late;
      const s: Stall = {
        at: now,
        ms: late,
        agentState,
        speakingMs: speakingSince === null ? null : Math.max(0, began - speakingSince),
      };
      for (const l of listeners) l(s);
    });
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && stopTicker) {
      stopTicker();
      stopTicker = null;
    }
  };
}

export function summarizeStalls(
  stalls: Stall[],
  startedAt: number,
  hist: { p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number },
  endedAt: number
): CallLoopSummary {
  const speaking = stalls.filter((s) => s.speakingMs !== null);
  return {
    durationMs: endedAt - startedAt,
    ...hist,
    stalls: stalls.length,
    stallMs: stalls.reduce((a, s) => a + s.ms, 0),
    stalls250: stalls.filter((s) => s.ms >= 250).length,
    speakingStalls: speaking.length,
    replyStartStalls: speaking.filter((s) => (s.speakingMs ?? 0) < REPLY_START_MS).length,
    worst: [...stalls]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((s) => ({ atMs: s.at - s.ms - startedAt, ms: s.ms, state: s.agentState })),
  };
}

// ---------------------------------------------------------------- per call

/** Watches the loop for one call; the returned finish logs LOOP_SUMMARY. */
export function watchCallLoop(
  jobId: string,
  env: Record<string, string | undefined> = process.env
): () => void {
  const thresholdMs = Number(env.LOOP_STALL_MS) > 0 ? Number(env.LOOP_STALL_MS) : 100;
  const startedAt = Date.now();
  const stalls: Stall[] = [];
  const hist = monitorEventLoopDelay({ resolution: TICK_MS });
  hist.enable();
  const detach = onStall((s) => {
    stalls.push(s);
    if (stalls.length <= MAX_STALL_LOGS) {
      log.info(
        {
          jobId,
          ms: s.ms,
          agentState: s.agentState,
          speakingMs: s.speakingMs,
          sinceStartMs: s.at - s.ms - startedAt,
        },
        'LOOP_STALL'
      );
    }
  }, thresholdMs);

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    detach();
    hist.disable();
    const ms = (ns: number): number =>
      Number.isFinite(ns) ? Math.max(0, Math.round(ns / 1e6 - TICK_MS)) : 0;
    const summary = summarizeStalls(
      stalls,
      startedAt,
      {
        p50Ms: ms(hist.percentile(50)),
        p95Ms: ms(hist.percentile(95)),
        p99Ms: ms(hist.percentile(99)),
        maxMs: ms(hist.max),
      },
      Date.now()
    );
    log.info({ jobId, thresholdMs, ...summary }, 'LOOP_SUMMARY');
  };
}
