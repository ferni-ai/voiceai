import { DisconnectReason } from '@livekit/rtc-node';

/**
 * How a call ended, from why the agent stopped waiting on the room.
 *
 * Every call used to be recorded as 'disconnect', so the disconnect rate sat at
 * 100% and each quiet-hour call opened a critical incident. The wait ends with
 * one of these reasons (voice-agent-entry and multi-agent-mode):
 *   'empty_room'                       caller left; room empty for 5 s
 *   'room.disconnected'                the agent's room connection was lost
 *   'room.closed'                      the agent's room connection closed on purpose
 *                                      (roomDisconnectEndReason below)
 *   'room.!isConnected'                poll saw the agent no longer connected
 *   'connectionStateChanged:<state>'   connection state went to disconnected
 *   'job.shutdownCallback'             LiveKit shut the job down (room deleted, job killed)
 *   'room_closed_before_participant'   nobody ever joined
 *   'timeout'                          10-minute safety net fired
 *   'idle' | 'max_duration' | 'demo_limit'   multi-agent wait (session-end-watch.ts)
 *   undefined                          cleanup ran without a recorded reason
 *
 * natural: the caller left (every hang-up ends in 'empty_room'), LiveKit
 *   ended the job or closed the room after the call, the agent hung up, or the
 *   call went idle or hit its cap.
 * disconnect: the agent lost its own connection while the caller was there.
 * error: the call never started, never ended on its own, or ended down a path
 *   that recorded no reason (setup failure).
 * An unrecognized reason counts as a disconnect: a new way of losing the room
 * should raise the alarm, not hide in "natural".
 */
export function classifyCallEnd(
  waitEndReason: string | undefined
): 'natural' | 'disconnect' | 'error' {
  switch (waitEndReason) {
    case 'empty_room':
    case 'job.shutdownCallback':
    case 'room.closed':
    case 'idle':
    case 'max_duration':
    case 'demo_limit':
      return 'natural';
    case 'room_closed_before_participant':
    case 'timeout':
    case undefined:
      return 'error';
    default:
      return 'disconnect';
  }
}

/**
 * LiveKit reasons for the agent's own room connection ending that mean someone
 * ended the call: the agent left (CLIENT_INITIATED, e.g. idle timeout), the room
 * was deleted (end-call tool, call-wrap-up), the agent was removed from it, or
 * LiveKit closed the room because the caller left (ROOM_CLOSED). Before this,
 * every 'disconnected' event counted as a dropped call whatever its reason.
 */
const ENDED_ON_PURPOSE: ReadonlySet<unknown> = new Set([
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
]);

/** The wait-end reason for the room's 'disconnected' event, from its LiveKit reason. */
export function roomDisconnectEndReason(reason: unknown): 'room.closed' | 'room.disconnected' {
  return ENDED_ON_PURPOSE.has(reason) ? 'room.closed' : 'room.disconnected';
}
