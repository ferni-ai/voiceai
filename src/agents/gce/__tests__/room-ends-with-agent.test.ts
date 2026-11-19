/**
 * #1403: a caller held a voice room open for 30+ hours after the agent left. The job only
 * disconnected the agent, and LiveKit's empty timeout never fires while someone is still in
 * the room. ROOM_ENDS_WITH_AGENT=on deletes the room when the agent's job ends with a person
 * still there, unless LiveKit ended the job or another agent carries the call on.
 *
 * These run the real job (runJobInProcess) on a real Room: the session is stubbed to leave
 * people in the room and end the call, and deleteRoom (the LiveKit server call) is recorded.
 */
import type { EventEmitter } from 'node:events';

import { ServerMessage } from '@livekit/protocol';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const deleted = vi.hoisted(() => ({ rooms: [] as string[], fail: false }));
const sockets = vi.hoisted(() => [] as EventEmitter[]);

// LiveKit's worker socket, so a termination can come in as LiveKit sends it (livekit-connection.ts).
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWebSocket extends Emitter {
    static OPEN = 1;
    readyState = 1;
    constructor() {
      super();
      sockets.push(this);
    }
    send(): void {}
    ping(): void {}
    close(): void {}
    terminate(): void {}
  }
  return { WebSocket: FakeWebSocket };
});

vi.mock('../../voice-agent-entry/index.js', () => ({ runFullVoiceAgentEntry: vi.fn() }));
vi.mock('../../shared/phone-goodbye.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/phone-goodbye.js')>()),
  deleteRoom: async (roomName: string) => {
    if (deleted.fail) throw new Error('LiveKit unavailable');
    deleted.rooms.push(roomName);
  },
}));

const { runFullVoiceAgentEntry } = await import('../../voice-agent-entry/index.js');
const { LIVEKIT_TERMINATION, runJobInProcess, shutdownJob } = await import('../job-executor.js');
const { drainJobRunner } = await import('../job-runner.js');
const conn = await import('../livekit-connection.js');

const ROOM = 'eval-room-1403';
const info = (jobId: string) =>
  ({
    job: { id: jobId, room: { name: ROOM } },
    acceptArgs: {},
    url: 'ws://localhost:7880',
    token: 'token',
  }) as unknown as Parameters<typeof runJobInProcess>[0];

interface CallEnd {
  /** Who is still in the room when the call ends. */
  people: ParticipantKind[];
  /** Why the job was told to shut down, in order. */
  reason?: string | string[];
  /** Whether the agent is still connected to the room at the end. */
  connected?: boolean;
  /** The session throws instead of returning. */
  throws?: boolean;
}

type Ctx = Parameters<typeof runFullVoiceAgentEntry>[0];

/** Starts a job whose session leaves `people` in the room; `end` ends the call. */
function startCall(jobId: string, { people, connected = true, throws = false }: CallEnd) {
  vi.mocked(runFullVoiceAgentEntry).mockImplementationOnce(async (ctx: Ctx) => {
    const { room } = ctx;
    Object.defineProperty(room, 'isConnected', { configurable: true, get: () => connected });
    room.disconnect = async () => {
      connected = false;
    };
    people.forEach((kind, i) => {
      room.remoteParticipants.set(`p${i}`, { identity: `p${i}`, kind } as never);
    });
    if (throws) throw new Error('session failed');
  });
  const call = runJobInProcess(info(jobId), () => undefined);
  const end = (reason: string | string[] = 'empty_room') => {
    for (const r of [reason].flat()) shutdownJob(jobId, r);
  };
  return { call, end };
}

const pause = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

/** Runs one call to its end and returns the rooms deleted. */
async function endCall(jobId: string, end: CallEnd): Promise<string[]> {
  const { call, end: endIt } = startCall(jobId, end);
  await vi.waitFor(() => expect(runFullVoiceAgentEntry).toHaveBeenCalled());
  if (end.throws) {
    await expect(call).rejects.toThrow('session failed');
  } else {
    setTimeout(() => endIt(end.reason), 5);
    await call;
  }
  return deleted.rooms;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(runFullVoiceAgentEntry).mockReset();
  deleted.rooms = [];
  deleted.fail = false;
});

describe('ROOM_ENDS_WITH_AGENT on: the room ends with the agent', () => {
  const on = () => vi.stubEnv('ROOM_ENDS_WITH_AGENT', 'on');

  it('deletes the room when the call ends with a web or app caller still in it', async () => {
    on();
    expect(await endCall('AJ_web', { people: [ParticipantKind.STANDARD] })).toEqual([ROOM]);
  });

  it('deletes the room when a phone caller is still on the line', async () => {
    on();
    expect(await endCall('AJ_sip', { people: [ParticipantKind.SIP], reason: 'timeout' })).toEqual([
      ROOM,
    ]);
  });

  it('keeps the room when the session fails, as before: a failure is never made a hang-up', async () => {
    on();
    expect(await endCall('AJ_throw', { people: [ParticipantKind.STANDARD], throws: true })).toEqual(
      []
    );
  });

  it('keeps the room when LiveKit ended the job: it decides what happens to the room', async () => {
    on();
    expect(
      await endCall('AJ_lk', { people: [ParticipantKind.STANDARD], reason: LIVEKIT_TERMINATION })
    ).toEqual([]);
  });

  it("keeps the room when LiveKit's own termination message ends the job (livekit-connection.ts)", async () => {
    on();
    const config = { url: 'http://localhost:7880', apiKey: 'devkey', agentName: 't' };
    conn.initLiveKitConnection({ ...config, apiSecret: 'x'.repeat(32) }, () => undefined);
    void conn.connectToLiveKit();
    const ws = await vi.waitFor(() => sockets[0] ?? Promise.reject(new Error('no socket yet')));
    ws.emit('open');

    const { call } = startCall('AJ_lk_msg', { people: [ParticipantKind.STANDARD] });
    await vi.waitFor(() => expect(runFullVoiceAgentEntry).toHaveBeenCalled());
    await pause(20); // the job is now waiting for its call to end
    const termination = new ServerMessage({
      message: { case: 'termination', value: { jobId: 'AJ_lk_msg' } },
    });
    ws.emit('message', Buffer.from(termination.toBinary()));
    await call; // the termination ended the job
    expect(deleted.rooms).toEqual([]);
    conn.closeConnection();
  });

  it('keeps the room when LiveKit ended the job, even if the session also asked to end', async () => {
    on();
    const reason = [LIVEKIT_TERMINATION, 'empty_room'];
    expect(await endCall('AJ_lk2', { people: [ParticipantKind.STANDARD], reason })).toEqual([]);
  });

  it('keeps the room when another agent is in it: a second job carries the call on', async () => {
    on();
    const people = [ParticipantKind.STANDARD, ParticipantKind.AGENT];
    expect(await endCall('AJ_handoff', { people })).toEqual([]);
  });

  it('keeps the room when no person is left (a recorder or stream is not a caller)', async () => {
    on();
    const people = [ParticipantKind.EGRESS, ParticipantKind.INGRESS];
    expect(await endCall('AJ_empty', { people })).toEqual([]);
  });

  it('keeps the room when the agent was already disconnected: its view of the room is stale', async () => {
    on();
    const people = [ParticipantKind.STANDARD];
    expect(await endCall('AJ_gone', { people, connected: false })).toEqual([]);
  });

  it('a failed delete never fails the job', async () => {
    on();
    deleted.fail = true;
    await expect(endCall('AJ_fail', { people: [ParticipantKind.STANDARD] })).resolves.toEqual([]);
  });

  it('a worker drain or recycle (drainJobRunner) neither ends the call nor deletes the room', async () => {
    on();
    let ended = false;
    const { call, end } = startCall('AJ_drain', { people: [ParticipantKind.STANDARD] });
    void call.finally(() => {
      ended = true;
    });
    await vi.waitFor(() => expect(runFullVoiceAgentEntry).toHaveBeenCalled());
    await pause(20); // the job is now waiting for its call to end
    await drainJobRunner(0, { pollMs: 1 });
    await pause(50);
    expect([ended, deleted.rooms]).toEqual([false, []]);
    end(LIVEKIT_TERMINATION);
    await call;
    expect(deleted.rooms).toEqual([]);
  });
});

describe('ROOM_ENDS_WITH_AGENT off (the default)', () => {
  it('only disconnects the agent, as before: the room is left to LiveKit', async () => {
    vi.stubEnv('ROOM_ENDS_WITH_AGENT', 'off');
    expect(await endCall('AJ_off', { people: [ParticipantKind.STANDARD] })).toEqual([]);
  });
});
