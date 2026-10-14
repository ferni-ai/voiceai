/**
 * How long a worker keeps a room open after the last caller leaves.
 *
 * A dropped connection gets EMPTY_ROOM_GRACE_MS to rejoin. A caller who hung
 * up (CLIENT_INITIATED) is not coming back: every call gets a fresh room, so
 * holding the worker only makes the next call wait. On 2026-10-12 a prod redial
 * waited 5.5 s for the single worker to finish a 10 s grace on a hung-up call.
 */

import { DisconnectReason } from '@livekit/rtc-node';

export const EMPTY_ROOM_GRACE_MS = 10_000;

export function emptyRoomGraceMs(reason: DisconnectReason | undefined): number {
  return reason === DisconnectReason.CLIENT_INITIATED ? 0 : EMPTY_ROOM_GRACE_MS;
}
