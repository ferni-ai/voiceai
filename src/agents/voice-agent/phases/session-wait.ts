/**
 * Session Wait
 *
 * Blocks until a voice session is really over: the room disconnected, the
 * room has been empty for a grace period, nobody has spoken for a long idle
 * window, or a hard maximum duration was reached.
 *
 * It replaces a fixed 10-minute safety timer that ended every multi-agent
 * call at minute 10 — shutting the orchestrator down and unregistering the
 * transcript handler mid-conversation, so nothing after that was remembered.
 * The idle and max limits now log loudly and are counted in the
 * memory-capture metrics (`sessionWaitEnds`).
 *
 * @module voice-agent/phases/session-wait
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getLastActivityAt } from '../../../services/memory/turn-sequencer.js';
import {
  recordSessionWaitEnd,
  type SessionWaitEndReason,
} from '../../../services/memory/memory-capture-metrics.js';

const log = createLogger({ module: 'session-wait' });

/** No transcript / spoken reply for this long while participants remain → end. */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60_000;
/** Absolute ceiling, matching the GCE job executor's max session duration. */
export const DEFAULT_MAX_DURATION_MS = 2 * 60 * 60_000;
export const DEFAULT_EMPTY_ROOM_GRACE_MS = 5_000;
const DEFAULT_POLL_MS = 1_000;

/** Minimal room view (LiveKit Room satisfies it). */
export interface WaitableRoom {
  isConnected?: boolean;
  remoteParticipants?: { size: number };
  once?: (event: 'disconnected', handler: () => void) => unknown;
  on?: (event: 'participantDisconnected', handler: () => void) => unknown;
  off?: (event: 'participantDisconnected', handler: () => void) => unknown;
}

export interface SessionWaitOptions {
  room: WaitableRoom | undefined;
  sessionId: string;
  idleTimeoutMs?: number;
  maxDurationMs?: number;
  emptyRoomGraceMs?: number;
  pollMs?: number;
  /** Last activity time (ms epoch). Defaults to the turn sequencer. */
  getLastActivityAt?: () => number | undefined;
  /** Something that keeps a quiet session alive (e.g. music playing). */
  isBusy?: () => boolean;
  now?: () => number;
}

function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolve when the session ends; the value says why.
 */
export function waitForSessionEnd(options: SessionWaitOptions): Promise<SessionWaitEndReason> {
  const {
    room,
    sessionId,
    idleTimeoutMs = envMs('VOICE_SESSION_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS),
    maxDurationMs = envMs('VOICE_SESSION_MAX_DURATION_MS', DEFAULT_MAX_DURATION_MS),
    emptyRoomGraceMs = DEFAULT_EMPTY_ROOM_GRACE_MS,
    pollMs = DEFAULT_POLL_MS,
    getLastActivityAt: lastActivity = () => getLastActivityAt(sessionId),
    isBusy,
    now = Date.now,
  } = options;

  const startedAt = now();

  return new Promise<SessionWaitEndReason>((resolve) => {
    let settled = false;
    let emptySinceMs: number | null = null;

    const onParticipantDisconnected = (): void => {
      if ((room?.remoteParticipants?.size ?? 0) === 0) {
        emptySinceMs = emptySinceMs ?? now();
      }
    };

    const finish = (reason: SessionWaitEndReason): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      room?.off?.('participantDisconnected', onParticipantDisconnected);
      recordSessionWaitEnd(reason);
      const durationMs = now() - startedAt;
      if (reason === 'idle_timeout' || reason === 'max_duration') {
        log.warn(
          { sessionId, reason, durationMs, idleTimeoutMs, maxDurationMs },
          '⏱️ Ending voice session on a time limit'
        );
      } else {
        log.info({ sessionId, reason, durationMs }, 'Voice session wait ended');
      }
      resolve(reason);
    };

    room?.once?.('disconnected', () => finish('room.disconnected'));
    room?.on?.('participantDisconnected', onParticipantDisconnected);

    const poll = setInterval(() => {
      const t = now();
      if (!room?.isConnected) {
        finish('room.!isConnected');
        return;
      }
      if ((room.remoteParticipants?.size ?? 0) === 0) {
        emptySinceMs = emptySinceMs ?? t;
        if (t - emptySinceMs >= emptyRoomGraceMs) {
          finish('empty_room');
          return;
        }
      } else {
        emptySinceMs = null;
      }
      if (t - startedAt >= maxDurationMs) {
        finish('max_duration');
        return;
      }
      const last = Math.max(lastActivity() ?? startedAt, startedAt);
      if (t - last >= idleTimeoutMs && !(isBusy?.() ?? false)) {
        finish('idle_timeout');
      }
    }, pollMs);
  });
}
