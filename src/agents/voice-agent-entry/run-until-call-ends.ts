/**
 * STEP 8 of the single-agent path: wait until the call ends, then close the
 * AgentSession. Returns why the call ended.
 *
 * The wait never hangs forever if LiveKit ends the job without a clean room
 * 'disconnected' event: the room can stay isConnected after the user leaves or
 * the room is deleted, or the job can get a shutdown request while we wait.
 *
 * SINGLE_AGENT_IDLE_WAIT (off): the multi-agent rule instead of the fixed 10-minute wait,
 * which settled mid-conversation (#4157): the call ends after IDLE_MS with no sign of life,
 * or at MAX_CALL_MS whatever happens (session-end-watch.ts). Off: exactly as before.
 */
import type { JobContext } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { roomDisconnectEndReason } from '../../services/analytics/call-end-reason.js';
import { closeAgentSession } from '../shared/close-agent-session.js';
import {
  IDLE_MS,
  MAX_CALL_MS,
  watchCallActivity,
} from '../voice-agent/phases/session-end-watch.js';

export interface RunUntilCallEndsInput {
  ctx: Pick<JobContext, 'room' | 'shutdown' | 'addShutdownCallback'>;
  session: { close(): Promise<void> } | null;
  sessionId: string;
  /** Logs disconnect diagnostics for the reason the call ended. */
  onDisconnect: (reason: string) => void;
  pollMs?: number;
  emptyRoomGraceMs?: number;
  /** The cap: 10 minutes, or MAX_CALL_MS with SINGLE_AGENT_IDLE_WAIT on. */
  maxWaitMs?: number;
  idleMs?: number;
  env?: Env;
}

export async function runUntilCallEnds(input: RunUntilCallEndsInput): Promise<string> {
  const { ctx, onDisconnect, pollMs = 1_000, emptyRoomGraceMs = 5_000, idleMs = IDLE_MS } = input;
  const idleWait = flagOn('SINGLE_AGENT_IDLE_WAIT', input.env);
  const maxWaitMs = input.maxWaitMs ?? (idleWait ? MAX_CALL_MS : 10 * 60_000);
  const reason = await new Promise<string>((resolve) => {
    let settled = false;
    let emptySinceMs: number | null = null;
    const activity = idleWait ? watchCallActivity(ctx.room) : null;
    const timers: Array<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>> = [];

    const finish = (reason: string): void => {
      if (settled) return;
      settled = true;
      activity?.stop();
      for (const t of timers) clearInterval(t as ReturnType<typeof setInterval>);
      for (const t of timers) clearTimeout(t as ReturnType<typeof setTimeout>);
      process.stderr.write(`[voice-agent-entry] 🔌 Ending session wait (${reason})\n`);
      // Unblock LiveKit job_proc close wait (runs after entrypoint returns).
      // Without this, empty-room exits hang forever on once(closeEvent).
      try {
        if (!['room.disconnected', 'room.closed', 'job.shutdownCallback'].includes(reason)) {
          ctx.shutdown(reason);
        }
      } catch {
        /* ignore */
      }
      resolve(reason);
    };

    ctx.room.on('disconnected', (reason?: unknown) => {
      onDisconnect(String(reason || 'unknown'));
      finish(roomDisconnectEndReason(reason));
    });

    // connectionStateChanged often fires even when isConnected lags
    ctx.room.on('connectionStateChanged', (state: unknown): void => {
      const stateStr = String(state);
      if (
        stateStr === 'disconnected' ||
        stateStr.includes('Disconnected') ||
        stateStr === '3' // ConnectionState.DISCONNECTED in some builds
      ) {
        onDisconnect(`connectionStateChanged:${stateStr}`);
        finish(`connectionStateChanged:${stateStr}`);
      }
    });

    // User left / room emptied — don't wait forever for a phantom connected agent
    ctx.room.on('participantDisconnected', (): void => {
      if ((ctx.room.remoteParticipants?.size ?? 0) === 0) {
        emptySinceMs = emptySinceMs ?? Date.now();
      }
    });

    // LiveKit worker shutdown (room delete, job kill, orphan) — unblock entrypoint
    ctx.addShutdownCallback(async () => {
      finish('job.shutdownCallback');
    });

    const poll = setInterval(() => {
      if (!ctx.room.isConnected) {
        finish('room.!isConnected');
        return;
      }

      const remoteCount = ctx.room.remoteParticipants?.size ?? 0;
      if (remoteCount === 0) {
        emptySinceMs = emptySinceMs ?? Date.now();
        if (Date.now() - emptySinceMs >= emptyRoomGraceMs) {
          onDisconnect('empty_room');
          finish('empty_room');
        }
      } else {
        emptySinceMs = null;
      }
      if (!settled && activity && activity.quietMs() >= idleMs) {
        onDisconnect('idle');
        finish('idle');
      }
    }, pollMs);
    timers.push(poll);

    // Absolute safety net (shorter than 30m — leaked activeCalls hurt ops); MAX_CALL_MS on the idle clock
    timers.push(setTimeout(() => {
      if (!settled) {
        onDisconnect(idleWait ? 'max_duration' : 'disconnect_wait_timeout');
        finish(idleWait ? 'max_duration' : 'timeout');
      }
    }, maxWaitMs));
  });

  // Ending the job does not close the session; without this its STT stream
  // stays open and reconnects every time the provider idle-closes it.
  await closeAgentSession(input.session, { sessionId: input.sessionId, endReason: reason });
  return reason;
}
