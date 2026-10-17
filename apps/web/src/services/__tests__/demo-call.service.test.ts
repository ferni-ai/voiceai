import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DEMO_KEYS } from '../../config/storage-keys.js';
import {
  DEMO_END_GRACE_MS,
  DemoCallError,
  liveKitDemoRoom,
  startDemoCall,
  type DemoRoom,
  type UmdRoom,
} from '../demo-call.service.js';

interface FakeRoom {
  connect: Mock<DemoRoom['connect']>;
  enableMicrophone: Mock<DemoRoom['enableMicrophone']>;
  disconnect: Mock<DemoRoom['disconnect']>;
  waitForAgent: Mock<DemoRoom['waitForAgent']>;
  startAudio: Mock<DemoRoom['startAudio']>;
  onEnd: DemoRoom['onEnd'];
  onPlaybackChange: DemoRoom['onPlaybackChange'];
  fireEnd: () => void;
  firePlayback: (canPlay: boolean) => void;
}

function fakeRoom(overrides: Partial<FakeRoom> = {}): FakeRoom {
  let onEnd: () => void = () => undefined;
  let onPlayback: (canPlay: boolean) => void = () => undefined;
  return {
    connect: vi.fn(async () => undefined),
    enableMicrophone: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    waitForAgent: vi.fn(async () => undefined),
    startAudio: vi.fn(async () => undefined),
    onEnd: (cb) => {
      onEnd = cb;
    },
    onPlaybackChange: (cb) => {
      onPlayback = cb;
    },
    fireEnd: () => onEnd(),
    firePlayback: (canPlay) => onPlayback(canPlay),
    ...overrides,
  };
}

const demoBody = {
  token: 'jwt',
  url: 'wss://example.livekit.cloud',
  room: 'demo-demo_1',
  claim_token: 'claim-abc',
  agent_dispatched: true,
  expires_in_minutes: 3,
};
const noMic = async (): Promise<void> => undefined;

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status })
  ) as unknown as typeof fetch;
}

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('startDemoCall', () => {
  it('joins the demo room from /demo-token and stores the claim where demo-claim looks', async () => {
    const room = fakeRoom();
    const fetchFn = respond(200, demoBody);
    await startDemoCall({
      fetchFn,
      createRoom: () => room,
      requestMicrophone: async () => undefined,
    });

    expect(fetchFn).toHaveBeenCalledWith('/demo-token?persona_id=ferni');
    expect(room.connect).toHaveBeenCalledWith('wss://example.livekit.cloud', 'jwt');
    expect(room.enableMicrophone).toHaveBeenCalled();
    expect(localStorage.getItem(DEMO_KEYS.CLAIM_TOKEN)).toBe('claim-abc');
    expect(localStorage.getItem(DEMO_KEYS.ROOM_NAME)).toBe('demo-demo_1');
    expect(Number(localStorage.getItem(DEMO_KEYS.SESSION_TIME))).toBeGreaterThan(
      Date.now() - 60_000
    );
  });

  it('settles `ended` when the room ends (Ferni leaves or the demo limit closes it)', async () => {
    const room = fakeRoom();
    const call = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => room,
      requestMicrophone: async () => undefined,
    });
    let ended = false;
    void call.ended.then(() => {
      ended = true;
    });
    room.fireEnd();
    await call.ended;
    expect(ended).toBe(true);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('hangs up once however many times end is called', async () => {
    const room = fakeRoom();
    const call = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => room,
      requestMicrophone: async () => undefined,
    });
    call.end();
    call.end();
    room.fireEnd();
    await call.ended;
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reads the 429 reason: daily_limit is used up, cooldown is try again later', async () => {
    const createRoom = vi.fn(() => fakeRoom());
    const cooldown = await startDemoCall({
      fetchFn: respond(429, { error: 'cooldown', message: 'wait' }),
      createRoom,
      requestMicrophone: noMic,
    }).catch((e: unknown) => e);
    expect((cooldown as DemoCallError).failure).toBe('cooldown');
    const failure = await startDemoCall({
      fetchFn: respond(429, { error: 'daily_limit' }),
      createRoom,
      requestMicrophone: async () => undefined,
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(DemoCallError);
    expect((failure as DemoCallError).failure).toBe('used_up');
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('reports mic_blocked before spending a demo session', async () => {
    const fetchFn = respond(200, demoBody);
    const failure = await startDemoCall({
      fetchFn,
      createRoom: () => fakeRoom(),
      requestMicrophone: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    }).catch((e: unknown) => e);
    expect((failure as DemoCallError).failure).toBe('mic_blocked');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports unavailable on a malformed response or a failed connect', async () => {
    const malformed = await startDemoCall({
      fetchFn: respond(200, { token: 1 }),
      createRoom: () => fakeRoom(),
      requestMicrophone: async () => undefined,
    }).catch((e: unknown) => e);
    expect((malformed as DemoCallError).failure).toBe('unavailable');

    const room = fakeRoom({ connect: vi.fn(async () => Promise.reject(new Error('ws closed'))) });
    const broken = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => room,
      requestMicrophone: async () => undefined,
    }).catch((e: unknown) => e);
    expect((broken as DemoCallError).failure).toBe('unavailable');
    expect(room.disconnect).toHaveBeenCalled();
  });

  it('fails as unavailable when the server could not dispatch Ferni', async () => {
    const createRoom = vi.fn(() => fakeRoom());
    const failure = await startDemoCall({
      fetchFn: respond(200, { ...demoBody, agent_dispatched: false }),
      createRoom,
      requestMicrophone: noMic,
    }).catch((e: unknown) => e);
    expect((failure as DemoCallError).failure).toBe('unavailable');
    expect(createRoom).not.toHaveBeenCalled();
    expect(localStorage.getItem(DEMO_KEYS.CLAIM_TOKEN)).toBeNull();
  });

  it('hangs up at the demo length plus grace, and end() clears that timer', async () => {
    vi.useFakeTimers();
    const room = fakeRoom();
    const call = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => room,
      requestMicrophone: noMic,
    });
    vi.advanceTimersByTime(3 * 60_000 + DEMO_END_GRACE_MS - 1);
    expect(room.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await call.ended;
    expect(room.disconnect).toHaveBeenCalledTimes(1);

    const early = fakeRoom();
    const second = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => early,
      requestMicrophone: noMic,
    });
    second.end();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports blocked audio and resumes it on a tap', async () => {
    const room = fakeRoom();
    const call = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => room,
      requestMicrophone: noMic,
    });
    const seen: boolean[] = [];
    call.onPlaybackBlocked((blocked) => seen.push(blocked));
    room.firePlayback(false);
    room.firePlayback(true);
    await call.resumeAudio();
    expect(seen).toEqual([true, false]);
    expect(room.startAudio).toHaveBeenCalled();
  });
});

/** A stand-in for window.LiveKit's Room that lets a test fire its events. */
type StubRoom = UmdRoom & {
  disconnect: Mock<UmdRoom['disconnect']>;
  localParticipant: { setMicrophoneEnabled: Mock<(enabled: boolean) => Promise<unknown>> };
  emit: (event: string, ...args: unknown[]) => void;
};

function stubUmdRoom(): StubRoom {
  const handlers = new Map<string, ((...args: never[]) => void)[]>();
  return {
    canPlaybackAudio: false,
    remoteParticipants: new Map(),
    localParticipant: { setMicrophoneEnabled: vi.fn(async () => undefined) },
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    startAudio: vi.fn(async () => undefined),
    on(event: string, cb: (...args: never[]) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
      return this;
    },
    off(event: string, cb: (...args: never[]) => void) {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((h) => h !== cb)
      );
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const h of handlers.get(event) ?? []) (h as (...a: unknown[]) => void)(...args);
    },
  };
}

describe('liveKitDemoRoom', () => {
  const audioTrack = () => ({ kind: 'audio', attach: () => document.createElement('audio') });

  it("plays Ferni's audio, and removes it and ends when the room disconnects", () => {
    const umd = stubUmdRoom();
    const room = liveKitDemoRoom(() => umd);
    const onEnd = vi.fn();
    room.onEnd(onEnd);
    umd.emit('trackSubscribed', audioTrack());
    expect(document.querySelectorAll('audio')).toHaveLength(1);
    umd.emit('disconnected');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });

  it('ends when Ferni leaves, not when another participant does', () => {
    const umd = stubUmdRoom();
    const room = liveKitDemoRoom(() => umd);
    const onEnd = vi.fn();
    room.onEnd(onEnd);
    umd.emit('participantDisconnected', { identity: 'guest-2', isAgent: false });
    expect(onEnd).not.toHaveBeenCalled();
    umd.emit('participantDisconnected', { identity: 'agent-1', isAgent: true });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('reports playback now and on audioPlaybackChanged', () => {
    const umd = stubUmdRoom();
    const seen: boolean[] = [];
    liveKitDemoRoom(() => umd).onPlaybackChange((canPlay) => seen.push(canPlay));
    (umd as { canPlaybackAudio: boolean }).canPlaybackAudio = true;
    umd.emit('audioPlaybackChanged');
    expect(seen).toEqual([false, true]);
  });

  it('gives up as unavailable when Ferni does not join within the agent timeout', async () => {
    vi.useFakeTimers();
    const umd = stubUmdRoom();
    const pending = startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => liveKitDemoRoom(() => umd),
      requestMicrophone: noMic,
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(((await pending) as DemoCallError).failure).toBe('unavailable');
    expect(umd.disconnect).toHaveBeenCalled();
  });

  it('starts once Ferni is in the room', async () => {
    const umd = stubUmdRoom();
    umd.remoteParticipants.set('agent-1', { identity: 'agent-1', isAgent: true });
    const call = await startDemoCall({
      fetchFn: respond(200, demoBody),
      createRoom: () => liveKitDemoRoom(() => umd),
      requestMicrophone: noMic,
    });
    expect(umd.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    call.end();
  });
});
