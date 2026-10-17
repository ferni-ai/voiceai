import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_KEYS } from '../../config/storage-keys.js';
import { DemoCallError, startDemoCall, type DemoRoom } from '../demo-call.service.js';

function fakeRoom(overrides: Partial<DemoRoom> = {}): DemoRoom & { fireEnd: () => void } {
  let onEnd: () => void = () => undefined;
  return {
    connect: vi.fn(async () => undefined),
    enableMicrophone: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    onEnd: (cb) => {
      onEnd = cb;
    },
    fireEnd: () => onEnd(),
    ...overrides,
  };
}

const demoBody = {
  token: 'jwt',
  url: 'wss://example.livekit.cloud',
  room: 'demo-demo_1',
  claim_token: 'claim-abc',
};

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

afterEach(() => {
  localStorage.clear();
});

describe('startDemoCall', () => {
  it('joins the demo room from /demo-token and stores the claim where demo-claim looks', async () => {
    const room = fakeRoom();
    const fetchFn = respond(200, demoBody);
    await startDemoCall({ fetchFn, createRoom: () => room, requestMicrophone: async () => undefined, now: () => 1234 });

    expect(fetchFn).toHaveBeenCalledWith('/demo-token?persona_id=ferni');
    expect(room.connect).toHaveBeenCalledWith('wss://example.livekit.cloud', 'jwt');
    expect(room.enableMicrophone).toHaveBeenCalled();
    expect(localStorage.getItem(DEMO_KEYS.CLAIM_TOKEN)).toBe('claim-abc');
    expect(localStorage.getItem(DEMO_KEYS.ROOM_NAME)).toBe('demo-demo_1');
    expect(localStorage.getItem(DEMO_KEYS.SESSION_TIME)).toBe('1234');
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

  it('reports used_up on 429 and never opens a room', async () => {
    const createRoom = vi.fn(() => fakeRoom());
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
});
