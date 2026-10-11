/**
 * How a multi-agent call ends: wait until it's over, then end the job.
 *
 * The wait used to stop every call at 10 minutes, and nothing then ended the
 * job, so a long call left the caller in a room with a silent agent and an End
 * button. Now the ceiling is two hours, the web client hears `conversation_end`
 * before it fires, and the job is ended once the call's cleanup has run.
 *
 * @module voice-agent/phases/session-end
 */

import type { JobContext } from '@livekit/agents';

import { sendFrontendSignal } from '../../../services/communication/frontend-signal.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'session-end' });

/**
 * Longest a call may run before the agent ends it. A backstop for a wait that
 * would otherwise never end (a phantom participant, a room that never closes),
 * not a call length limit: real calls run well past 10 minutes. Matches the
 * job executor's own two-hour failsafe (gce/job-executor.ts).
 */
export const MAX_SESSION_DURATION_MS = 2 * 60 * 60_000;

/** How long the room may stay empty before the call counts as over (the caller may rejoin). */
const EMPTY_ROOM_GRACE_MS = 5_000;

/** Lets the web client play its goodbye before it disconnects. */
const MAX_DURATION_DISCONNECT_DELAY_MS = 2_000;

/** Longest the goodbye signal may hold up the end of the call. */
const END_SIGNAL_TIMEOUT_MS = 3_000;

export interface SessionEndOptions {
  maxDurationMs?: number;
  emptyRoomGraceMs?: number;
}

/**
 * Resolves with why the call ended: 'room.disconnected', 'room.!isConnected',
 * 'empty_room', or 'timeout' (the ceiling, after the client is told).
 */
export function waitForSessionEnd(
  ctx: JobContext,
  sessionId: string,
  {
    maxDurationMs = MAX_SESSION_DURATION_MS,
    emptyRoomGraceMs = EMPTY_ROOM_GRACE_MS,
  }: SessionEndOptions = {}
): Promise<string> {
  return new Promise<string>((resolve) => {
    let settled = false;
    let emptySinceMs: number | null = null;
    const onDisconnected = (): void => finish('room.disconnected');
    const onParticipantLeft = (): void => {
      if ((ctx.room?.remoteParticipants?.size ?? 0) === 0) {
        emptySinceMs = emptySinceMs ?? Date.now();
      }
    };
    const finish = (reason: string): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(ceiling);
      ctx.room?.off('disconnected', onDisconnected);
      ctx.room?.off('participantDisconnected', onParticipantLeft);
      process.stderr.write(`[multi-agent-mode] 🎭 Ending session wait (${reason})\n`);
      resolve(reason);
    };

    ctx.room?.once('disconnected', onDisconnected);
    ctx.room?.on('participantDisconnected', onParticipantLeft);

    const poll = setInterval(() => {
      if (!ctx.room?.isConnected) return finish('room.!isConnected');
      if ((ctx.room?.remoteParticipants?.size ?? 0) > 0) {
        emptySinceMs = null;
        return;
      }
      emptySinceMs = emptySinceMs ?? Date.now();
      if (Date.now() - emptySinceMs >= emptyRoomGraceMs) finish('empty_room');
    }, 1_000);

    const ceiling = setTimeout(() => {
      void tellClientCallIsOver(sessionId).finally(() => finish('timeout'));
    }, maxDurationMs);
  });
}

/** Sends `conversation_end` so the web client hangs up instead of facing a silent room. */
async function tellClientCallIsOver(sessionId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sent = await Promise.race([
    sendFrontendSignal(
      'conversation_end',
      {
        reason: 'max_duration',
        disconnectDelay: MAX_DURATION_DISCONNECT_DELAY_MS,
        timestamp: Date.now(),
      },
      sessionId
    ),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), END_SIGNAL_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (!sent) log.warn({ sessionId }, 'Max call duration reached; conversation_end not delivered');
}

const endedJobs = new WeakSet<JobContext>();

/**
 * Ends the job once the call's cleanup has run, so the agent leaves the room
 * instead of the worker waiting for it to close. Runs `cleanup` first (each
 * handler's error is logged, never thrown) and calls ctx.shutdown at most once
 * per job. A room that already disconnected needs no shutdown, as in the
 * single-agent path.
 */
export async function cleanupThenEndJob(
  ctx: JobContext,
  reason: string | undefined,
  cleanup: ReadonlyArray<() => void | Promise<void>>
): Promise<void> {
  for (const step of cleanup) {
    try {
      await step();
    } catch (error) {
      log.warn({ reason, error: String(error) }, 'Cleanup step failed before ending the job');
    }
  }
  if (endedJobs.has(ctx) || reason === 'room.disconnected') return;
  endedJobs.add(ctx);
  try {
    ctx.shutdown(reason ?? 'session_end');
  } catch (error) {
    log.warn({ reason, error: String(error) }, 'ctx.shutdown failed');
  }
}
