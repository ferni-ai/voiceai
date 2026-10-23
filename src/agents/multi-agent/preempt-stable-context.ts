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
 * With the flag, the writers ask here first. Turn-context notes wait until the
 * preemptive reply is decided: they are built for the next reply. A note with a
 * crisis or safety category (turn-processor/safety-note.ts) goes in at once, because
 * a restart is right for it. A recall note is for this reply: `on` adds it at once
 * and starts the preemptive reply again from it now, not at the commit; `defer`
 * holds it like the others, so it reaches the next reply instead. The tool closure
 * is never held: LiveKit copies the tools when a generation starts and runs calls
 * against that copy, so a kept reply could run a tool the closure meant to remove.
 *
 * @module agents/multi-agent/preempt-stable-context
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PreemptStableContext' });

/** A write never waits longer than this, even if the turn never commits. */
export const MAX_WAIT_MS = 5000;

export type PreemptStableMode = 'off' | 'on' | 'defer';

export function preemptStableMode(
  env: Record<string, string | undefined> = process.env
): PreemptStableMode {
  const mode = env.PREEMPT_STABLE_CONTEXT?.trim().toLowerCase();
  return mode === 'on' || mode === 'defer' ? mode : 'off';
}

/** The parts of LiveKit's AgentActivity (agent._agentActivity) this reads. */
interface PreemptiveInfo {
  newTranscript?: string;
  startedSpeakingAt?: number;
}
interface ActivityView {
  _preemptiveGeneration?: { info?: PreemptiveInfo; createdAt?: number };
  _preemptiveGenerationCount?: number;
  _currentSpeech?: { interrupted?: boolean };
  schedulingPaused?: boolean;
  newTurnsBlocked?: boolean;
  agentSession?: {
    sessionOptions?: {
      turnHandling?: {
        preemptiveGeneration?: {
          enabled?: boolean;
          maxRetries?: number;
          maxSpeechDuration?: number;
        };
      };
    };
  };
  onPreemptiveGeneration?(info: unknown): void;
}

const activityOf = (agent: object): ActivityView | undefined =>
  (agent as { _agentActivity?: ActivityView })._agentActivity;

/**
 * A preemptive reply has started and the commit has not taken its context yet.
 * LiveKit resets the retry count as the commit begins, before it copies the
 * context, so a reply left behind with a count of 0 is stale: the turn ended in
 * StopResponse or skipReply (ferni-agent.ts, handoff-talk-through.ts) and nothing
 * will decide it. One older than MAX_WAIT_MS is treated as stale too.
 */
export function preemptiveInFlight(agent: object): boolean {
  const activity = activityOf(agent);
  const running = activity?._preemptiveGeneration;
  if (!running || !activity?._preemptiveGenerationCount) return false;
  return running.createdAt === undefined || Date.now() - running.createdAt < MAX_WAIT_MS;
}

const POLL_MS = 50;
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
 * false and calls nothing, so the writer goes ahead itself. A reply older than
 * MAX_WAIT_MS no longer counts as in flight, so a retry is never held twice by it.
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

/** What LiveKit's onPreemptiveGeneration checks before it starts (agent_activity.js). */
function canStartAgain(activity: ActivityView, info: PreemptiveInfo): boolean {
  const opts = activity.agentSession?.sessionOptions?.turnHandling?.preemptiveGeneration;
  if (opts?.enabled === false || activity.schedulingPaused || activity.newTurnsBlocked) {
    return false;
  }
  const speech = activity._currentSpeech;
  if (speech !== undefined && !speech.interrupted) return false;
  const spoke = info.startedSpeakingAt;
  if (spoke !== undefined && Date.now() - spoke > (opts?.maxSpeechDuration ?? 10_000)) {
    return false;
  }
  return (activity._preemptiveGenerationCount ?? 0) < (opts?.maxRetries ?? 3);
}

/**
 * A note for this reply has just gone into the context after the preemptive reply
 * started: start it again now from the new context, so the commit can keep it.
 * Only when the caller's words are the ones it answers (the final transcript
 * ending its preflight) and LiveKit would start one; otherwise the running reply
 * is left alone and LiveKit decides at the commit, as before. Returns true when a
 * new preemptive reply is running.
 */
export function restartPreemptive(agent: object, said: string | undefined): boolean {
  const activity = activityOf(agent);
  const running = activity?._preemptiveGeneration;
  const info = running?.info;
  if (!activity?.onPreemptiveGeneration || !running || !info || !said?.trim()) return false;
  if (!normalized(info.newTranscript).endsWith(normalized(said))) return false;
  if (!canStartAgain(activity, info)) return false;
  // Our patch keeps a running reply whose transcript still matches, so this one is
  // marked as answering nothing: LiveKit then supersedes it itself, and the new
  // attempt continues its turn (continueTurnFrom).
  running.info = { ...info, newTranscript: '' };
  activity.onPreemptiveGeneration(info);
  const restarted = activity._preemptiveGeneration !== running;
  if (!restarted) running.info = info;
  log.info({ restarted }, 'PREEMPT_STABLE_CONTEXT restart');
  return restarted && activity._preemptiveGeneration !== undefined;
}
