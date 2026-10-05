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
 */
export function classifyCallEnd(waitEndReason: string | undefined): 'natural' | 'disconnect' | 'error' {
  // TODO(seth): decide which reasons are a normal hang-up vs a dropped call vs a fault.
  return 'disconnect';
}
