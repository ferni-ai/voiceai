import { DisconnectReason } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';

import { EMPTY_ROOM_GRACE_MS, emptyRoomGraceMs } from '../empty-room-grace.js';

describe('emptyRoomGraceMs', () => {
  it('releases the worker at once when the caller hung up', () => {
    expect(emptyRoomGraceMs(DisconnectReason.CLIENT_INITIATED)).toBe(0);
  });

  it('keeps the rejoin grace for a dropped or unexplained leave', () => {
    expect(emptyRoomGraceMs(DisconnectReason.JOIN_FAILURE)).toBe(EMPTY_ROOM_GRACE_MS);
    expect(emptyRoomGraceMs(DisconnectReason.SIGNAL_CLOSE)).toBe(EMPTY_ROOM_GRACE_MS);
    expect(emptyRoomGraceMs(undefined)).toBe(EMPTY_ROOM_GRACE_MS);
    expect(EMPTY_ROOM_GRACE_MS).toBe(10_000);
  });
});
