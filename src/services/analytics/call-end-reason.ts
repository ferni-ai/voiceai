/**
 * How a call ended, from why the agent stopped waiting on the room.
 *
 * Every call used to be recorded as 'disconnect', so the disconnect rate sat at
 * 100% and each quiet-hour call opened a critical incident. The wait ends with
 * one of these reasons (voice-agent-entry and multi-agent-mode):
 *   'empty_room'                       caller left; room empty for 5 s
 *   'room.disconnected'                the agent's room connection closed
 *   'room.!isConnected'                poll saw the agent no longer connected
 *   'connectionStateChanged:<state>'   connection state went to disconnected
 *   'job.shutdownCallback'             LiveKit shut the job down (room deleted, job killed)
 *   'room_closed_before_participant'   nobody ever joined
 *   'timeout'                          10-minute safety net fired
 *   undefined                          cleanup ran without a recorded reason
 *
 * natural: the caller left (every hang-up ends in 'empty_room'), or LiveKit
 *   ended the job because the room was deleted after the call.
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
      return 'natural';
    case 'room_closed_before_participant':
    case 'timeout':
    case undefined:
      return 'error';
    default:
      return 'disconnect';
  }
}
