/**
 * First-writer-wins claim on a room name, so two /token requests for the same
 * not-yet-created room can't both pass the ownership check.
 *
 * token-room-owner.ts used to look the room up in LiveKit and then create it,
 * two steps with a gap: an attacker racing the owner's first request for a
 * fresh name could see it free too and get a join token. The claim is a
 * Firestore `create()`, which fails with ALREADY_EXISTS for everyone but the
 * first caller. LiveKit's own createRoom wasn't used for this: whether it
 * errors or silently returns an existing room isn't verified here.
 *
 * A claim outlives any call (ROOM_CLAIM_TTL_MS), and a live room is also
 * checked by its metadata owner, so an expired claim can't hand a live call
 * to a stranger.
 *
 * @module servers/api/routes/token-room-claim
 */
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'TokenRoomClaim' });

const ROOM_CLAIMS = 'livekit_room_claims';
const ALREADY_EXISTS = 6;
const FAILED_PRECONDITION = 9;
/** Calls end well before 3 h; 4 h keeps a claim alive for the whole of any call. */
export const ROOM_CLAIM_TTL_MS = 4 * 60 * 60 * 1000;

export type RoomClaimResult = 'mine' | 'theirs' | 'unavailable';

interface RoomClaim {
  uid: string;
  expiresAtMs: number;
}

const codeOf = (error: unknown): unknown => (error as { code?: unknown }).code;

/** Claim `roomName` for `uid`, or learn that someone else holds it. */
export async function claimRoom(
  roomName: string,
  uid: string,
  now = Date.now()
): Promise<RoomClaimResult> {
  const db = getFirestoreDb();
  if (!db) {
    log.error({ room: roomName }, 'Firestore unavailable; cannot claim room');
    return 'unavailable';
  }
  const ref = db.collection(ROOM_CLAIMS).doc(Buffer.from(roomName).toString('base64url'));
  // expireAt is a Date so a Firestore TTL policy can delete old claims
  const fresh = {
    uid,
    expiresAtMs: now + ROOM_CLAIM_TTL_MS,
    expireAt: new Date(now + ROOM_CLAIM_TTL_MS),
  };
  try {
    await ref.create(fresh);
    return 'mine';
  } catch (error) {
    if (codeOf(error) !== ALREADY_EXISTS) {
      log.error({ error: String(error), room: roomName }, 'Could not claim room');
      return 'unavailable';
    }
  }
  try {
    const snap = await ref.get();
    const claim = snap.data() as RoomClaim | undefined;
    if (claim?.uid === uid) return 'mine';
    if (claim && claim.expiresAtMs > now) return 'theirs';
    // Expired: take it over only if nobody has changed it since this read
    await ref.update(fresh, { lastUpdateTime: snap.updateTime });
    return 'mine';
  } catch (error) {
    if (codeOf(error) === FAILED_PRECONDITION) return 'theirs';
    log.error({ error: String(error), room: roomName }, 'Could not read or renew room claim');
    return 'unavailable';
  }
}

/** Read-only: does `uid` hold `roomName`? 'unclaimed' when nobody does, or the claim expired. */
export async function roomClaimHolder(
  db: Firestore,
  roomName: string,
  uid: string,
  now = Date.now()
): Promise<'mine' | 'theirs' | 'unclaimed'> {
  const ref = db.collection(ROOM_CLAIMS).doc(Buffer.from(roomName).toString('base64url'));
  const claim = (await ref.get()).data() as RoomClaim | undefined;
  if (claim?.uid === uid) return 'mine';
  return claim && claim.expiresAtMs > now ? 'theirs' : 'unclaimed';
}
