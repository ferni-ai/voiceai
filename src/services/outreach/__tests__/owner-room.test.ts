/**
 * CALL_LIVE_RELAY: the call result's data message (the contact's name and what was
 * said) goes only to the owner's own room, and only to the owner. A room name is
 * chosen by the client and outlives the call, so after the owner's call ends anyone
 * can make a room with that name. The room must have the sid the owner's job had,
 * and the owner must be in it under the uid the signed dispatch carries.
 * Fictional data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => [] as Array<{ fields: Record<string, unknown>; msg: string }>);
vi.mock('../../../utils/safe-logger.js', () => {
  const at = (fields: Record<string, unknown>, msg: string) => void logs.push({ fields, msg });
  return { createLogger: () => ({ info: at, debug: at, warn: at, error: at }) };
});

const { resultRoomName, roomToTell } = await import('../owner-room.js');
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const OWNER = 'uid-riley-test';
const ROOM = 'voice-1730000000000';
const SID = 'RM_riley_1';
const SESSION = 'session-job-riley-1730000000000';

interface LiveRoom {
  name: string;
  sid: string;
  people: string[];
}
let live: LiveRoom[] = [];
const rooms = {
  listRooms: vi.fn(async (names: string[]) =>
    live.filter((r) => names.includes(r.name)).map(({ name, sid }) => ({ name, sid }))
  ),
  listParticipants: vi.fn(async (room: string) =>
    (live.find((r) => r.name === room)?.people ?? []).map((identity) => ({ identity }))
  ),
};

const request: OnBehalfCallRequest = {
  contactQuery: 'Priya',
  resolvedContact: { name: 'Priya', phone: '+15555550142' },
  purpose: 'ask about Thursday',
  objective: 'check_in',
  callType: 'personal',
  originalSessionId: SESSION,
  originalRoomName: ROOM,
  originalRoomSid: SID,
  userId: OWNER,
  userTimezone: 'UTC',
  userName: 'Riley Test',
  recordingConsent: true,
};

const tell = (r: OnBehalfCallRequest = request) =>
  roomToTell(rooms, resultRoomName(r) ?? '', r, 'c-room-1');
const notSent = () => logs.filter((l) => l.msg === 'CALL_RESULT_ROOM not sent');

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  live = [];
  process.env.CALL_RESULT_LIVE_REPORT = 'on';
  process.env.CALL_LIVE_RELAY = 'on';
});

describe('CALL_LIVE_RELAY on: only the owner, in the owner room', () => {
  it("the owner's room, owner in it: sent there, to the owner alone", async () => {
    live = [{ name: ROOM, sid: SID, people: [OWNER, 'agent-ferni'] }];
    expect(await tell()).toEqual({ room: ROOM, options: { destinationIdentities: [OWNER] } });
    expect(rooms.listRooms).toHaveBeenCalledWith([ROOM]);
    expect(notSent()).toEqual([]);
  });

  it('the owner call ended and someone made a room with its name: nothing sent', async () => {
    // A new room under the old name: another sid, another user in it.
    live = [{ name: ROOM, sid: 'RM_other', people: ['uid-someone-else'] }];
    expect(await tell()).toBeNull();
    expect(notSent().map((l) => l.fields.reason)).toEqual(['other_room']);
  });

  it('a new room with the same name, even with the owner in it: nothing sent', async () => {
    live = [{ name: ROOM, sid: 'RM_later', people: [OWNER] }];
    expect(await tell()).toBeNull();
    expect(notSent().map((l) => l.fields.reason)).toEqual(['other_room']);
  });

  it('the same room, owner gone and someone else in it: nothing sent', async () => {
    live = [{ name: ROOM, sid: SID, people: ['uid-someone-else'] }];
    expect(await tell()).toBeNull();
    expect(notSent().map((l) => l.fields.reason)).toEqual(['owner_absent']);
  });

  it('the room is gone: nothing sent', async () => {
    expect(await tell()).toBeNull();
    expect(notSent().map((l) => l.fields.reason)).toEqual(['room_gone']);
  });

  it('nothing ties the name to the owner (no sid, or no member): nothing sent, nothing asked', async () => {
    live = [{ name: ROOM, sid: SID, people: [OWNER, 'unknown'] }];
    expect(await tell({ ...request, originalRoomSid: undefined })).toBeNull();
    expect(await tell({ ...request, userId: 'unknown' })).toBeNull();
    expect(await tell({ ...request, userId: 'anon:caller-7f3a' })).toBeNull();
    expect(rooms.listRooms).not.toHaveBeenCalled();
    expect(notSent().map((l) => l.fields.reason)).toEqual(['unbound', 'unbound', 'unbound']);
  });

  it('logs carry the call id and a reason only', async () => {
    live = [{ name: ROOM, sid: 'RM_other', people: ['uid-someone-else'] }];
    await tell();
    const written = JSON.stringify(logs);
    for (const secret of [ROOM, SID, OWNER, 'Priya', '5550142', 'uid-someone-else']) {
      expect(written).not.toContain(secret);
    }
    expect(notSent()[0].fields).toEqual({ callId: 'c-room-1', reason: 'other_room' });
  });
});

describe('CALL_LIVE_RELAY off: as on main', () => {
  it('looked up by the session id, the room and sid unused, sent to the room without a target', async () => {
    delete process.env.CALL_LIVE_RELAY;
    live = [{ name: SESSION, sid: 'RM_any', people: [] }];
    expect(resultRoomName(request)).toBe(SESSION);
    expect(await tell()).toEqual({ room: SESSION, options: {} });
    expect(rooms.listRooms).toHaveBeenCalledWith([SESSION]);
    expect(rooms.listParticipants).not.toHaveBeenCalled();
  });
});
