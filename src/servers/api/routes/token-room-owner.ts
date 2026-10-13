/**
 * /token issues a join token only for a room the caller owns or a new one.
 *
 * The client picks the room name (web: `voice-<ms>`), and /token used to sign
 * a roomJoin + subscribe token for any name, dispatching a second agent when
 * the room already existed. So a signed-in user who knew or guessed another
 * user's live room could hear that call, and take over the seat by reusing the
 * participant identity. Every room /token creates records its owner as
 * `firebase_uid` in the room metadata; a live room whose owner is anyone else
 * (or no one: demo, SIP and outbound rooms) is refused.
 *
 * @module servers/api/routes/token-room-owner
 */
import type { ServerResponse } from 'http';

import { getRoomService } from '../../token/livekit.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'TokenRoomOwner' });

export type RoomOwnership = 'free' | 'owned' | 'taken';

function ownerOf(metadata: string | undefined): string | undefined {
  try {
    const parsed = JSON.parse(metadata || '{}') as { firebase_uid?: unknown };
    return typeof parsed.firebase_uid === 'string' ? parsed.firebase_uid : undefined;
  } catch {
    return undefined;
  }
}

/** Whether `roomName` is unused, already the caller's, or someone else's. */
export async function roomOwnership(roomName: string, uid: string): Promise<RoomOwnership> {
  const existing = (await getRoomService().listRooms([roomName])).at(0);
  if (existing === undefined) return 'free';
  return ownerOf(existing.metadata) === uid ? 'owned' : 'taken';
}

/**
 * Answer 403 for a room someone else owns, or 503 when ownership can't be
 * checked (fail closed). Returns true when it answered.
 */
export async function refuseUnownedRoom(
  roomName: string,
  uid: string,
  res: ServerResponse
): Promise<boolean> {
  let ownership: RoomOwnership;
  try {
    ownership = await roomOwnership(roomName, uid);
  } catch (error) {
    log.error({ error: String(error), room: roomName }, '/token could not check room ownership');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Voice service unavailable, try again' }));
    return true;
  }
  if (ownership !== 'taken') return false;
  log.warn(
    { room: roomName, caller: uid.substring(0, 8) },
    'SECURITY: /token refused a room owned by someone else'
  );
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'That room belongs to another session' }));
  return true;
}
