/**
 * PREEMPT_STABLE_CONTEXT (off by default): stop throwing away LiveKit's preemptive reply.
 *
 * LiveKit starts the reply from Ink's preflight transcript and, at the commit,
 * keeps it only if the chat context and the tools are unchanged (agent_activity.js
 * userTurnCompletedImpl; our patch logs it as PREEMPTIVE_DECISION). Real prod calls,
 * 2026-10-15..22: 318 of 818 decisions dropped it, and a dropped turn waited ~350 ms
 * longer (commit to audio p50 1.51 s vs 1.15 s). What changed in the window:
 *
 * - 205: a memory recall note (memory-recall-hook.ts). Interims wait for the turn's
 *   embedding, so the facts come with the final transcript, a median 144 ms after
 *   the preflight started the reply.
 * - 14: the tool closure for a caller who is not a verified owner, run inside the
 *   preemptive reply's own llmNode (turn-request.ts).
 * - 10: a turn-context note pushed between the caller's last word and the commit
 *   (turn-intelligence.ts createTurnContextPusher).
 * - 29: the caller kept talking (a restart is right); 60: no logged cause.
 *
 * With the flag, the writers ask here first. Turn-context notes and the tool closure
 * wait until the preemptive reply is decided: the notes are built for the next reply,
 * and the request already leaves those tools out. A note carrying safety guidance goes
 * in at once, because a restart is right for it. A recall note is for this reply: `on`
 * adds it at once and starts the preemptive reply again from it now, not at the commit;
 * `defer` holds it like the others, so it reaches the next reply instead.
 *
 * @module agents/multi-agent/preempt-stable-context
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PreemptStableContext' });

export type PreemptStableMode = 'off' | 'on' | 'defer';

export function preemptStableMode(
  env: Record<string, string | undefined> = process.env
): PreemptStableMode {
  const mode = env.PREEMPT_STABLE_CONTEXT?.trim().toLowerCase();
  return mode === 'on' || mode === 'defer' ? mode : 'off';
}

/** The parts of LiveKit's AgentActivity (agent._agentActivity) this reads. */
interface ActivityView {
  _preemptiveGeneration?: { info?: { newTranscript?: string } };
  _preemptiveGenerationCount?: number;
  agentSession?: {
    sessionOptions?: { turnHandling?: { preemptiveGeneration?: { maxRetries?: number } } };
  };
  cancelPreemptiveGeneration?(source?: string): void;
  onPreemptiveGeneration?(info: unknown): void;
}

const activityOf = (agent: object): ActivityView | undefined =>
  (agent as { _agentActivity?: ActivityView })._agentActivity;

/** A preemptive reply has started and the turn is not committed yet. */
export function preemptiveInFlight(agent: object): boolean {
  return activityOf(agent)?._preemptiveGeneration !== undefined;
}

/** crisis-guard.ts, turn-handler.ts and crisis-agreement.ts open their notes this way. */
const SAFETY_NOTE = /\[(CRITICAL|SAFETY)\b/;

export function hasSafetyGuidance(note: string): boolean {
  return SAFETY_NOTE.test(note);
}

const POLL_MS = 50;
/** A write never waits longer than this, even if the turn never commits. */
export const MAX_WAIT_MS = 5000;
const queues = new WeakMap<object, { writes: Array<() => void>; labels: string[] }>();

/**
 * Runs `write` now, or, with the flag on and a preemptive reply in flight, once it
 * has been decided (kept, dropped or cancelled), at most MAX_WAIT_MS later.
 * Returns true when the write was held.
 */
export function afterPreemptive(
  agent: object,
  label: string,
  write: () => void,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (preemptStableMode(env) === 'off' || !preemptiveInFlight(agent)) {
    write();
    return false;
  }
  const held = queues.get(agent);
  if (held) {
    held.writes.push(write);
    held.labels.push(label);
    return true;
  }
  const queue = { writes: [write], labels: [label] };
  queues.set(agent, queue);
  const started = Date.now();
  const poll = (): void => {
    if (preemptiveInFlight(agent) && Date.now() - started < MAX_WAIT_MS) {
      setTimeout(poll, POLL_MS);
      return;
    }
    queues.delete(agent);
    log.info({ held: queue.labels, waitedMs: Date.now() - started }, 'PREEMPT_STABLE_CONTEXT');
    for (const run of queue.writes) {
      try {
        run();
      } catch (error) {
        log.warn({ error: String(error) }, 'held context write failed');
      }
    }
  };
  setTimeout(poll, POLL_MS);
  return true;
}

/**
 * For a writer that can try again: with the flag on and a preemptive reply in
 * flight, calls `retry` once it is decided and returns true; otherwise returns
 * false and calls nothing, so the writer goes ahead itself. A retry that still
 * finds the reply undecided after MAX_WAIT_MS is held again, until the commit.
 */
export function heldForPreemptive(
  agent: object,
  label: string,
  retry: () => void,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (preemptStableMode(env) === 'off' || !preemptiveInFlight(agent)) return false;
  return afterPreemptive(agent, label, retry, env);
}

const normalized = (text: string | undefined): string =>
  (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A note for this reply has just gone into the context after the preemptive reply
 * started: start it again now from the new context, so the commit can keep it.
 * Only when the caller's words are the ones it answers (the final transcript
 * ending its preflight) and a retry is left; otherwise LiveKit decides at the
 * commit, as before. Returns true when a new preemptive reply is running.
 */
export function restartPreemptive(agent: object, said: string | undefined): boolean {
  const activity = activityOf(agent);
  const running = activity?._preemptiveGeneration;
  if (!activity || !running?.info || !said?.trim()) return false;
  if (!activity.cancelPreemptiveGeneration || !activity.onPreemptiveGeneration) return false;
  if (!normalized(running.info.newTranscript).endsWith(normalized(said))) return false;
  const opts = activity.agentSession?.sessionOptions?.turnHandling?.preemptiveGeneration;
  if ((activity._preemptiveGenerationCount ?? 0) >= (opts?.maxRetries ?? 3)) return false;
  activity.cancelPreemptiveGeneration('user_turn');
  activity.onPreemptiveGeneration(running.info);
  const restarted = activity._preemptiveGeneration !== undefined;
  log.info({ restarted }, 'PREEMPT_STABLE_CONTEXT restart');
  return restarted;
}
