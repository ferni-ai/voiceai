/**
 * The call result's data message (call-result-capture.ts injectToActiveSession)
 * looks the owner's call up by its LiveKit ROOM name. On main it asked LiveKit
 * for a room named after the session id (session-<job>-<time>, voice-agent-entry),
 * which no room is, so the owner's app never got the message: listRooms found
 * nothing and it returned "user likely disconnected".
 *
 * The owner's call notes its room beside its session id (live-session.ts); the
 * dispatch for the placed call carries it, signed with the rest
 * (on-behalf-dispatch.ts), so the worker that captures the result knows it.
 *
 * The room is used only with CALL_LIVE_RELAY on (and so CALL_RESULT_LIVE_REPORT,
 * which speaks a member's result instead), and then only when it is the owner's own
 * room with the owner in it (owner-room.ts, pinned in owner-room.test.ts): a call
 * with no member behind it has no owner to bind the room to, so nothing is sent.
 * Off, the lookup is by the session id, as on main.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(async () => ({ success: true })),
}));
const livekit = vi.hoisted(() => ({
  listRooms: vi.fn(async (names: string[]) =>
    names.filter((n) => n === 'room-riley-1').map((name) => ({ name, sid: 'RM_riley_1' }))
  ),
  listParticipants: vi.fn(async (_room: string) => [{ identity: 'uid-riley-test' }]),
  sendData: vi.fn(async (_room: string, _bytes: Uint8Array) => undefined),
}));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    listRooms = livekit.listRooms;
    listParticipants = livekit.listParticipants;
    sendData = livekit.sendData;
  },
  DataPacket_Kind: { RELIABLE: 0 },
}));

const { captureCallResult } = await import('../call-result-capture.js');
const {
  onBehalfDispatchFor,
  onBehalfRequestFromDispatch,
  parseOnBehalfDispatch,
  signOnBehalfDispatch,
  verifyOnBehalfDispatch,
} = await import('../on-behalf-dispatch.js');
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const SESSION = 'session-job-riley-1730000000000';
const ROOM = 'room-riley-1';
const SID = 'RM_riley_1';
const OWNER_ROOM = { name: ROOM, sid: SID };

const asked: OnBehalfCallRequest = {
  contactQuery: 'Priya',
  resolvedContact: { name: 'Priya', phone: '+15555550142' },
  purpose: 'ask about Thursday',
  objective: 'check_in',
  callType: 'personal',
  originalSessionId: SESSION,
  userId: 'uid-riley-test',
  userTimezone: 'UTC',
  userName: 'Riley Test',
  recordingConsent: true,
};
const outcome: CallOutcome = {
  callId: 'c-room-1',
  status: 'completed',
  objectiveAchieved: true,
  outcome: 'Thursday works.',
};

/** The placed call's worker reads the dispatch it was sent, as JSON. */
function asTheCaptureWorkerSeesIt(): OnBehalfCallRequest {
  const sent = JSON.parse(JSON.stringify(onBehalfDispatchFor('c-room-1', asked))) as Record<
    string,
    unknown
  >;
  const call = parseOnBehalfDispatch(sent);
  if (!call) throw new Error('dispatch did not parse');
  return onBehalfRequestFromDispatch(call);
}

const sentTo = (): string[] =>
  livekit.sendData.mock.calls
    .filter(([, bytes]) =>
      new TextDecoder().decode(bytes as Uint8Array).includes('"on_behalf_call_complete"')
    )
    .map(([room]) => room);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CALL_RESULT_LIVE_REPORT;
  delete process.env.CALL_LIVE_RELAY;
  process.env.LIVEKIT_URL = 'wss://example.invalid';
  process.env.LIVEKIT_API_KEY = 'k';
  process.env.LIVEKIT_API_SECRET = 's';
});

describe('the call result reaches the owner app by its room', () => {
  it('the dispatch built in the owner call carries the room; a dispatch without one has none', () => {
    const release = noteLiveSession({}, SESSION, OWNER_ROOM);
    expect(asTheCaptureWorkerSeesIt()).toMatchObject({
      originalRoomName: ROOM,
      originalRoomSid: SID,
    });
    release();
    const without = asTheCaptureWorkerSeesIt();
    expect(without.originalRoomName).toBeUndefined();
    expect(without.originalRoomSid).toBeUndefined();
    expect('originalRoomName' in onBehalfDispatchFor('c-room-1', asked).requester).toBe(false);
    expect('originalRoomSid' in onBehalfDispatchFor('c-room-1', asked).requester).toBe(false);
  });

  it("the room and its sid are the owner call's own and signed: a request or a later edit can't set them", () => {
    const release = noteLiveSession({}, SESSION, OWNER_ROOM);
    const claimed = { ...asked, originalRoomName: 'room-other', originalRoomSid: 'RM_other' };
    const dispatch = onBehalfDispatchFor('c-room-1', claimed);
    release();
    expect(dispatch.requester).toMatchObject({ originalRoomName: ROOM, originalRoomSid: SID });
    const signed = signOnBehalfDispatch(dispatch, 'test-secret');
    expect(verifyOnBehalfDispatch(JSON.stringify(signed), 'test-secret')).toBe(true);
    const edited = { ...signed, requester: { ...signed.requester, originalRoomSid: 'RM_other' } };
    expect(verifyOnBehalfDispatch(JSON.stringify(edited), 'test-secret')).toBe(false);
  });

  // (While You Were Away's own data message, unified-result-capture.ts, still asks by the
  // session id: the same mistake, left for its own change. Only the call result's is asserted.)
  it('CALL_LIVE_RELAY on, a call with no member: no owner to bind the room to, nothing sent', async () => {
    process.env.CALL_RESULT_LIVE_REPORT = 'on';
    process.env.CALL_LIVE_RELAY = 'on';
    const release = noteLiveSession({}, SESSION, OWNER_ROOM);
    const request = { ...asTheCaptureWorkerSeesIt(), userId: 'unknown' };
    release(); // the capture worker is another process: nothing of the owner call there
    // The room exists, has the sid, and someone joined as 'unknown': still not the owner's.
    livekit.listParticipants.mockResolvedValueOnce([{ identity: 'unknown' }]);
    await captureCallResult('c-room-1', outcome, request);
    expect(livekit.sendData).not.toHaveBeenCalled();
  });

  it('CALL_LIVE_RELAY off: looked up by the session id, as on main, room or not', async () => {
    const release = noteLiveSession({}, SESSION, OWNER_ROOM);
    const request = asTheCaptureWorkerSeesIt();
    release();
    expect(request.originalRoomName).toBe(ROOM); // carried, and still not used
    await captureCallResult('c-room-1', outcome, request);
    await captureCallResult(
      'c-room-3',
      { ...outcome, callId: 'c-room-3' },
      {
        ...request,
        userId: 'unknown',
      }
    );
    expect(livekit.listRooms.mock.calls.length).toBeGreaterThanOrEqual(2); // one per result
    expect(livekit.listRooms.mock.calls.every(([names]) => names[0] === SESSION)).toBe(true);
    expect(sentTo()).toEqual([]);
  });

  it('no room known (an older dispatch): looked up as before, by the session id', async () => {
    await captureCallResult('c-room-2', { ...outcome, callId: 'c-room-2' }, asked);
    expect(livekit.listRooms).toHaveBeenCalledWith([SESSION]);
    expect(livekit.listRooms).not.toHaveBeenCalledWith([ROOM]);
    expect(livekit.sendData).not.toHaveBeenCalled();
  });
});
