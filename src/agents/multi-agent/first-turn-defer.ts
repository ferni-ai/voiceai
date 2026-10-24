/**
 * FIRST_TURN_DEFER_BACKGROUND=on: build turn 1's per-turn context only once Ferni speaks.
 *
 * Per-turn intelligence (turn-intelligence.ts) runs beside each reply, and on
 * turn 1 it is cold: the context builders' modules load, the Vertex client,
 * memory stores and BetterThanHuman orchestrator initialise, the semantic
 * context build takes >1 s and hybrid search runs past its budget. Dev,
 * 2026-10-11 08:13-08:18Z, eval calls: turn 1 ran it twice (FIRST_TURN_FAST's
 * early end, then Ink's own end), 2.2-3.2 s each, beside the reply; the event
 * loop stalled up to 300-381 ms on turn 1 (loopLagMaxMs) against 48-81 ms after.
 *
 * Nothing in turn 1's reply request comes from that work: its note can only
 * reach the chat context while Ferni is listening, after a build that takes
 * longer than the reply takes to start (createTurnContextPusher), and the
 * request path (llmNode: turn-request.ts, crisis-gate.ts, director-notes.ts,
 * fast-lane.ts) reads no other output of it. The reply's crisis decision is
 * CrisisGate's own, from the request's words and the caller's voice reading.
 * (Its incrementTurn moves the session turnCount that ttsNode reads for
 * isFirstTurn; deferred, turn 1 keeps its turn-1 count.) So on turn 1 the
 * work waits until Ferni starts speaking, which is after the reply's first
 * token, and its note reaches turn 2 as before. MAX_DEFER_MS bounds the wait
 * when turn 1 gets no spoken reply. Turns 2+ are never deferred.
 *
 * FIRST_TURN_DEFER_RELEASE picks when Ferni's reply lifts the hold: `settle`
 * (the default) 600 ms into it; `reply_end` when it ends or is interrupted
 * (the agent leaves 'speaking'), so the build's stalls (531-777 ms on dev,
 * 2026-10-22) land while Ferni listens instead of cutting into its audio. Its
 * note still reaches turn 2 unless turn 2's words come first: the pusher then
 * merges it into the next push (createTurnContextPusher).
 *
 * Safety work is never deferred. The same build also runs crisis detection
 * and sends its signals (the crisis override note, `crisis_detected` to the
 * app, the outreach crisis signal, the emotional state cache), so the hold
 * is lifted for it:
 * - when the crisis guard's patterns find any signal in a turn-1 segment, with
 *   the caller's voice reading (the check CrisisGate makes), turn 1 runs at
 *   once, exactly as with the flag off;
 * - when CrisisGate decides anything but 'pass' (CRISIS_GATE_SIGNAL), which
 *   covers what only the classifier catches, it runs then: the gate holds the
 *   reply until that verdict, so before the crisis reply is spoken.
 * Every turn-1 segment is built, none dropped. With CRISIS_GUARD_MODE off or
 * shadow there is no live CrisisGate decision to lean on, so nothing is deferred.
 *
 * @module agents/multi-agent/first-turn-defer
 */

import { setImmediate } from 'node:timers';
import { flagOn } from '../../config/env-flag.js';
import { getProviderIdSync } from '../../config/model-provider-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import { type FirstTurnRelease } from './first-turn-release.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import {
  resolveCrisisGuardMode,
  toGuardVoiceEmotion,
  type ProsodyEmotionLike,
} from '../safety/crisis-shadow.js';
import type { UserTurnHook } from './turn-intelligence.js';

const log = createLogger({ module: 'FirstTurnDefer' });

/** The longest turn 1's context waits for Ferni to speak. */
export const MAX_DEFER_MS = 6000;

/** How long session end waits for released turn-1 work before cleanup goes on. */
export const SESSION_END_WAIT_MS = 3000;

/**
 * How long the reply plays before the held work starts, so its audio has
 * queued (LiveKit's output holds up to 1 s; Cartesia delivers faster than real
 * time) and a stall of a few hundred ms doesn't cut into its first words.
 * From #1084 (FIRST_TURN_CALM), which this supersedes.
 */
export const SPEAKING_SETTLE_MS = 600;

/**
 * Once the turn pipeline has run in a process it is warm: later calls' first
 * turns stalled 99 ms p50 on dev (n=58) against 782 ms for a process's first
 * call (n=10), so only a cold process defers. With AGENT_JOB_EXECUTOR=process
 * every call is a fresh process. (#1084's measurement.)
 */
let pipelineWarm = false;
export const turnPipelineWarm = (): boolean => pipelineWarm;
/** Tests: a fresh process. */
export const resetTurnPipelineWarm = (): void => {
  pipelineWarm = false;
};

/**
 * On by flag, only while CrisisGate decides each reply's crisis handling live,
 * which needs the cascade's llmNode path: the realtime models (OpenAI
 * Realtime, Gemini Live, Gemini native audio) reply without it.
 */
export function firstTurnDeferEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    flagOn('FIRST_TURN_DEFER_BACKGROUND', env) &&
    resolveCrisisGuardMode(env) === 'live' &&
    getProviderIdSync(env) === 'cartesia-cascade'
  );
}

/** Sessions whose caller has finished a turn: a later persona (handoff) never defers. */
const pastFirstTurn = new WeakSet<object>();
export const noteUserTurn = (session: object): void => {
  pastFirstTurn.add(session);
};
export const hadUserTurn = (session: object): boolean => pastFirstTurn.has(session);

/** Any crisis-guard signal at all in these words, with the caller's voice reading. */
export function hasSafetySignal(text: string, voiceEmotion?: unknown): boolean {
  const crisis = detectCrisis(text, toGuardVoiceEmotion(voiceEmotion as ProsodyEmotionLike));
  return crisis.isCrisis || crisis.severity > 0 || crisis.indicators.length > 0;
}

export interface FirstTurnDeferral {
  /** The hook to give createTurnContextPusher. */
  hook: UserTurnHook;
  /** Feed each non-empty final transcript as it arrives, before the pusher sees it. */
  onFinalTranscript: (transcript: string) => void;
  /** Feed every agent state change; Ferni's reply to turn 1 releases it (FirstTurnRelease). */
  onAgentState: (newState: string | undefined) => void;
  /** Feed CrisisGate's decisions; anything but 'pass' releases turn 1 at once. */
  onCrisisDecision: (action: string | undefined) => void;
  /**
   * At session end: releases anything still held, so turn 1 is delayed, never
   * dropped, and waits up to SESSION_END_WAIT_MS for that work (its crisis
   * signals) before cleanup goes on and the job can exit.
   */
  dispose: () => Promise<void>;
}

export function deferFirstTurn(
  hook: UserTurnHook,
  options: {
    maxDeferMs?: number;
    endWaitMs?: number;
    settleMs?: number;
    releaseOn?: FirstTurnRelease;
    voiceEmotion?: () => unknown;
    safetySignal?: (text: string, voiceEmotion: unknown) => boolean;
  } = {}
): FirstTurnDeferral {
  const {
    maxDeferMs = MAX_DEFER_MS,
    endWaitMs = SESSION_END_WAIT_MS,
    settleMs = SPEAKING_SETTLE_MS,
    releaseOn = 'settle',
    voiceEmotion = () => undefined,
    safetySignal = hasSafetySignal,
  } = options;
  const held = new Set<Promise<void>>();
  let released = false;
  let armedAt = 0;
  let calls = 0;
  let firstTurnSegments = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let replying = false;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const open = (reason: string): void => {
    if (released) return;
    released = true;
    if (timer) clearTimeout(timer);
    if (settle) clearTimeout(settle);
    // Nothing was held when no turn-1 words arrived (e.g. a session ending at the greeting).
    if (armedAt) log.info({ reason, waitedMs: Date.now() - armedAt }, 'FIRST_TURN_DEFER released');
    release();
  };

  const armTimeout = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => open('timeout'), maxDeferMs);
    timer.unref?.();
  };

  return {
    // The pusher calls this once per final transcript, in order.
    hook: async (turnCtx, newMessage) => {
      const built = (): Promise<void> =>
        hook(turnCtx, newMessage).finally(() => {
          pipelineWarm = true;
        });
      if (++calls > firstTurnSegments) return built();
      const run = gate.then(built);
      held.add(run);
      try {
        await run;
      } finally {
        held.delete(run);
      }
    },
    onFinalTranscript(transcript) {
      if (released) return;
      firstTurnSegments++;
      if (!armedAt) {
        armedAt = Date.now();
        armTimeout();
      }
      try {
        if (safetySignal(transcript, voiceEmotion())) open('safety');
      } catch (error) {
        log.warn({ error: String(error) }, 'FIRST_TURN_DEFER safety check failed');
        open('error');
      }
    },
    onAgentState(newState) {
      if (!armedAt || released) return;
      if (releaseOn === 'reply_end') {
        // Hold while Ferni speaks; leaving 'speaking' (the reply's end, or an
        // interruption) releases. The bound restarts with the reply, so it
        // fires into the reply's audio only when the reply runs past it.
        if (newState !== 'speaking') {
          if (replying) open('reply_end');
        } else if (!replying) {
          replying = true;
          armTimeout();
        }
        return;
      }
      // Ferni has started the reply: let its audio queue first. A reply that
      // already ended (any other state) needs no settle.
      if (newState === 'speaking' && !settle) {
        settle = setTimeout(() => open('speaking'), settleMs);
        settle.unref?.(); // never keeps a finished process alive
      } else if (settle) open('speaking');
    },
    onCrisisDecision(action) {
      if (action && action !== 'pass') open('crisis_gate');
    },
    // Held work still runs when the session ends, as it would without the flag.
    async dispose() {
      open('session_end');
      // A segment that just arrived reaches the hook after the pusher's import.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      if (held.size === 0) return;
      let waited: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        Promise.allSettled([...held]).then(() => 'done' as const),
        new Promise<'late'>((resolve) => {
          waited = setTimeout(() => resolve('late'), endWaitMs);
        }),
      ]);
      clearTimeout(waited);
      if (outcome === 'late') log.warn({ endWaitMs }, 'FIRST_TURN_DEFER work outlived session end');
    },
  };
}
