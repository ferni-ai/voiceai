/**
 * Which LiveKit room a call result's data message goes to (call-result-capture.ts
 * injectToActiveSession). The message carries the contact's name and what was said.
 *
 * CALL_LIVE_RELAY off: the room named by the session id, as on main (none is, so
 * nothing is sent). On: the owner's own room, and only the owner in it. A room name
 * is chosen by the client and can be used again once the call ends, so the name alone
 * could lead to a new room with someone else in it. Before anything is sent, the
 * room must:
 * - have the sid of the room the owner's call was in. The signed dispatch carries that
 *   sid; LiveKit assigned it to the owner's job (live-session.ts).
 * - have the owner in it: a member whose uid the signed dispatch carries, joined
 *   under that uid. A uid is the identity the token route gives a member.
 * If any of that fails, nothing is sent, and the result goes the way it would
 * without the room.
 *
 * @module services/outreach/owner-room
 */
import type { SendDataOptions } from 'livekit-server-sdk';
import type { OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { callLiveRelayOn } from './call-result-live.js';

const log = createLogger({ module: 'OwnerRoom' });

/** The two RoomServiceClient reads this needs. */
export interface RoomLookup {
  listRooms(names: string[]): Promise<Array<{ sid?: string }> | undefined>;
  listParticipants(room: string): Promise<Array<{ identity?: string }>>;
}

export interface RoomTarget {
  room: string;
  options: SendDataOptions;
}

/** Why the owner's room was not used: a kind, never a name or id. */
export type NotOwnerRoom = 'unbound' | 'room_gone' | 'other_room' | 'owner_absent';

/** The room name to ask LiveKit for: the owner's room with the flag on, else the session id. */
export function resultRoomName(request: OnBehalfCallRequest): string | undefined {
  return (callLiveRelayOn() && request.originalRoomName) || request.originalSessionId || undefined;
}

/** Where to send the result for `room` (resultRoomName), or null to send nothing. */
export async function roomToTell(
  rooms: RoomLookup,
  room: string,
  request: OnBehalfCallRequest,
  callId: string
): Promise<RoomTarget | null> {
  if (!callLiveRelayOn()) {
    const found = await rooms.listRooms([room]);
    if (!found || found.length === 0) {
      log.debug({ callId }, 'Session room not found, user likely disconnected');
      return null;
    }
    return { room, options: {} };
  }
  const owner = request.userId?.trim() ?? '';
  const reason = await whyNotOwnerRoom(rooms, room, request.originalRoomSid, owner);
  if (reason) {
    log.info({ callId, reason }, 'CALL_RESULT_ROOM not sent');
    return null;
  }
  return { room, options: { destinationIdentities: [owner] } };
}

async function whyNotOwnerRoom(
  rooms: RoomLookup,
  room: string,
  sid: string | undefined,
  owner: string
): Promise<NotOwnerRoom | null> {
  // No sid (an older dispatch) or no member: nothing ties this name to the owner.
  if (!sid || !isMemberIdentity(owner)) return 'unbound';
  const [found] = (await rooms.listRooms([room])) ?? [];
  if (!found) return 'room_gone';
  if (found.sid !== sid) return 'other_room';
  const people = await rooms.listParticipants(room);
  return people.some((p) => p.identity === owner) ? null : 'owner_absent';
}
