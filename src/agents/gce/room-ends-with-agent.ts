/**
 * ROOM_ENDS_WITH_AGENT (#1403): when the agent's job ends with a caller still in the room,
 * the room is deleted, which drops them, so nobody holds it open after the agent left.
 *
 * Prod: a caller held a voice room open for 30+ hours with no agent in it. The job only
 * disconnects the agent (job-executor.ts), LiveKit's empty timeout never fires while someone
 * is still connected, and the 2-hour session cap ends the session, not the room. The minutes
 * were billed, and it blocked a deploy.
 *
 * The room stays when:
 * - LiveKit ended the job (a termination): LiveKit decides what happens to the room;
 * - the session failed: the room stays as before, so a failure that LiveKit or the caller can
 *   recover from never becomes a hang-up;
 * - the agent is no longer connected: what it sees of the room is stale;
 * - another agent is in the room: a re-dispatched or second job carries the call on;
 * - no person is left (participant-kind.ts): the empty timeout ends the room.
 * A worker drain or recycle never ends a job: it lets calls end, and a call still running at
 * its deadline dies with the process, which never reaches this (drain.ts, worker-recycle.ts).
 *
 * @module agents/gce/room-ends-with-agent
 */
import { ParticipantKind } from '@livekit/rtc-node';

import { flagOn, type Env } from '../../config/env-flag.js';
import { isPersonKind } from '../shared/participant-kind.js';
import { deleteRoom } from '../shared/phone-goodbye.js';

/** What happened to the room; ids and enums only go to the log. */
export type RoomEnd =
  | 'off'
  | 'kept_livekit_ended'
  | 'kept_session_failed'
  | 'kept_agent_disconnected'
  | 'kept_agent_present'
  | 'kept_no_person'
  | 'deleted'
  | 'delete_failed';

/** The room as the ending job sees it. */
export interface EndingRoom {
  readonly isConnected: boolean;
  readonly remoteParticipants: ReadonlyMap<string, { readonly kind?: ParticipantKind }>;
}

export interface EndingJob {
  jobId: string;
  /** The job's room name; none means nothing to delete. */
  roomName: string | undefined;
  /** LiveKit terminated the job. */
  liveKitEnded: boolean;
  /** The voice session threw instead of ending. */
  sessionFailed: boolean;
}

/** Why the room stays, or null when it should be deleted. */
function keepReason(room: EndingRoom, job: EndingJob): RoomEnd | null {
  if (job.liveKitEnded) return 'kept_livekit_ended';
  if (job.sessionFailed) return 'kept_session_failed';
  if (!room.isConnected) return 'kept_agent_disconnected';
  const kinds = [...room.remoteParticipants.values()].map((p) => p.kind);
  if (kinds.includes(ParticipantKind.AGENT)) return 'kept_agent_present';
  if (!kinds.some(isPersonKind)) return 'kept_no_person';
  return null;
}

/** Deletes the room the agent's job leaves with a caller still in it, or keeps it; never throws. */
async function roomEnd(room: EndingRoom, job: EndingJob & { roomName: string }): Promise<RoomEnd> {
  const keep = keepReason(room, job);
  if (keep) return keep;
  try {
    await deleteRoom(job.roomName);
    return 'deleted';
  } catch {
    return 'delete_failed';
  }
}

/** ROOM_ENDS_WITH_AGENT=on: ends the job's room or keeps it, and logs which (job id and outcome). */
export async function endRoomWithAgent(
  room: EndingRoom,
  job: EndingJob,
  log: (msg: string, data: Record<string, unknown>) => void,
  env: Env = process.env
): Promise<RoomEnd> {
  const { roomName } = job;
  if (!flagOn('ROOM_ENDS_WITH_AGENT', env) || !roomName) return 'off';
  const outcome = await roomEnd(room, { ...job, roomName });
  log('Room end', { jobId: job.jobId, roomEnd: outcome });
  return outcome;
}
