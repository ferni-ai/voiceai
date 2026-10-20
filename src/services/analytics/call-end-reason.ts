import { DisconnectReason } from '@livekit/rtc-node';

/**
 * How a call ended, from why the agent stopped waiting on the room.
 *
 * Every call used to be recorded as 'disconnect', so the disconnect rate sat at
 * 100% and each quiet-hour call opened a critical incident. The wait ends with
 * one of these reasons (voice-agent-entry and session-end-watch.ts):
 *   'empty_room'                       caller left; room empty for 5 s
 *   'caller_left'                      caller left, then the room closed inside those 5 s
 *   'room.disconnected'                the agent's room connection was lost, caller still there
 *   'room.closed'                      the agent's room connection closed on purpose
 *                                      (roomDisconnectEndReason below), caller still there
 *   'room.!isConnected'                poll saw the agent no longer connected
 *   'connectionStateChanged:<state>'   connection state went to disconnected
 *   'job.shutdownCallback'             LiveKit shut the job down (room deleted, job killed)
 *   'idle'                             nobody spoke for 10 minutes; the agent ended the call
 *   'max_duration' / 'demo_limit'      the call reached its length cap
 *   'room_closed_before_participant'   nobody ever joined
 *   'timeout'                          10-minute safety net fired
 *   undefined                          cleanup ran without a recorded reason
 *
 * Prod, 2026-10-11..18 (multi-agent path, every prod call): 90 empty_room, 6
 * room.disconnected (5 of them 2.5-3 s after the caller left, now caller_left),
 * 3 timeout (the retired 10-minute timer), 2 idle.
 *
 * natural: the caller left, the agent ended the call on purpose, or LiveKit ended
 *   the job because the room was deleted after the call.
 * natural also covers 'room.closed' (the room was closed on purpose) and the
 *   idle and length-cap endings.
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
    case 'caller_left':
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
