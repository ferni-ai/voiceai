/**
 * FIRST_TURN_CALM=on: the caller's first turn's background work waits for
 * Ferni's first reply to start.
 *
 * A call's first reply is its slowest. On dev (REPLY_GAP since 2026-10-09,
 * 68 sessions), the first turn of a process's first call waited 2331 ms p50
 * from the caller stopping to Ferni's audio vs 1142 ms for later turns, with
 * the event loop stalled 782 ms p50 (p90 987) in that window vs 84 ms later.
 * The per-turn intelligence (turn-intelligence.ts) starts on the first final
 * transcript and initialises, on first use, everything the turn pipeline
 * touches: Firestore clients, the memory store adapters, the
 * better-than-human orchestrator and more. On the 3b1411274 smoke it ran 3.6 s
 * from the final transcript while the reply waited 2.4 s from commit to audio,
 * and its note can only inform the next reply anyway (it lands when Ferni is
 * listening again). Started once the reply has been audible for
 * FIRST_REPLY_SETTLE_MS, that work overlaps playback instead of the caller's
 * wait: by then the reply's audio has queued up (LiveKit's output holds up to
 * 1 s and Cartesia delivers faster than real time), so a stall of a few
 * hundred ms doesn't starve it. Released at the first audio frame, a stall
 * could cut into the reply's first words.
 *
 * Only a process's first call is held: once the turn pipeline has run in a
 * process it is warm, and later calls' first turns stalled 99 ms p50 (n=58),
 * like any turn. Later turns are never held. With AGENT_JOB_EXECUTOR=process
 * every call runs in a fresh process, so every call's first turn is held.
 *
 * @module agents/multi-agent/first-turn-calm
 */

import { flagOn } from '../../config/env-flag.js';

type Env = Record<string, string | undefined>;

/** The longest a first turn's work waits for the reply to start. */
export const FIRST_TURN_HOLD_CAP_MS = 4_000;
/** How long the reply plays before the held work starts, so its audio has queued. */
export const FIRST_REPLY_SETTLE_MS = 600;

export function firstTurnCalmEnabled(env: Env = process.env): boolean {
  return flagOn('FIRST_TURN_CALM', env);
}

let pipelineWarm = false;

/** The turn pipeline has run in this process: later calls' first turns need no hold. */
export function markTurnPipelineWarm(): void {
  pipelineWarm = true;
}

/** Tests: a fresh process. */
export function resetTurnPipelineWarm(): void {
  pipelineWarm = false;
}

export interface FirstReplyGate {
  /** Resolves once the first reply has settled in, the cap has passed, or at once when off or past. */
  ready(): Promise<void>;
  /** The agent's state, as agent_state_changed reports it. */
  onAgentState(state: string | undefined): void;
}

/**
 * Holds work for the caller's first turn until Ferni's reply to it has played
 * for settleMs, when the flag is on and the turn pipeline hasn't run in this process
 * yet. The greeting doesn't count: only speech after the first ready() call
 * releases the hold.
 */
export function createFirstReplyGate(
  options: { enabled?: boolean; capMs?: number; settleMs?: number } = {}
): FirstReplyGate {
  const enabled = options.enabled ?? (firstTurnCalmEnabled() && !pipelineWarm);
  const capMs = options.capMs ?? FIRST_TURN_HOLD_CAP_MS;
  const settleMs = options.settleMs ?? FIRST_REPLY_SETTLE_MS;
  let released = !enabled;
  let waiting: Promise<void> | null = null;
  let release: (() => void) | null = null;

  const open = (): void => {
    released = true;
    release?.();
    release = null;
  };

  return {
    ready() {
      if (released) return Promise.resolve();
      waiting ??= new Promise<void>((resolve) => {
        const timer = setTimeout(open, capMs);
        timer.unref?.();
        release = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      return waiting;
    },
    onAgentState(state) {
      // Only a reply that starts while a first turn is waiting releases it.
      if (state !== 'speaking' || !waiting || released) return;
      setTimeout(open, settleMs).unref?.();
    },
  };
}
