/**
 * The call-start timing message (client-timing.ts), through the real connection
 * service: one `ferni.client_timing` message per call, reliable, once Ferni's
 * audio first plays (or at hang-up if it never did, without firstAudioHeardAt);
 * epoch ms moments and platform 'web' only; nothing at all with
 * CLIENT_TIMING_SEND off.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState: Record<string, unknown> = {
  userName: 'Test User',
  deviceId: 'test-device-123',
  selectedPersona: { id: 'ferni', name: 'Ferni' },
  isMuted: false,
};
vi.mock('../../../src/state/app.state.js', () => ({
  appState: { getState: () => mockState, get: (key: string) => mockState[key] },
  setConnectionState: vi.fn(),
  updateAuthState: vi.fn(),
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CLIENT_TIMING_SEND_STORAGE_KEY } from '../../../src/config/client-timing-send-flag.js';
import { CLIENT_TIMING_TOPIC } from '../../../src/services/client-timing.js';

type Handler = (...args: unknown[]) => void;
type Who = { identity: string; isAgent?: boolean; audioTrackPublications: Map<string, unknown> };

/** 2020-01-01: the agent ignores any moment before it as not epoch ms. */
const MIN_EPOCH_MS = 1_577_836_800_000;

function createRoom(ids: { local: string; agent: string; room: string }) {
  const handlers = new Map<string, Set<Handler>>();
  const agent: Who = { identity: ids.agent, isAgent: true, audioTrackPublications: new Map() };
  const room = {
    state: 'disconnected',
    name: ids.room,
    localParticipant: {
      identity: ids.local,
      setMicrophoneEnabled: vi.fn(async () => undefined),
      getTrackPublications: vi.fn(() => []),
      publishData: vi.fn(async (_data: Uint8Array, _options?: unknown) => undefined),
    },
    remoteParticipants: new Map<string, unknown>([[ids.agent, agent]]),
    connect: vi.fn(async () => {
      room.state = 'connected';
    }),
    disconnect: vi.fn(async () => {
      room.state = 'disconnected';
    }),
    on: vi.fn((event: string, cb: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(cb);
      return room;
    }),
    off: vi.fn((event: string, cb: Handler) => {
      handlers.get(event)?.delete(cb);
      return room;
    }),
    emit(event: string, ...args: unknown[]) {
      for (const cb of [...(handlers.get(event) ?? [])]) cb(...args);
    },
  };
  return { room, agent };
}

let room: ReturnType<typeof createRoom>['room'];
let agent: Who;
let service: typeof import('../../../src/services/connection.service.js').connectionService;
const fetchMock = vi.fn();

async function load(ids = { local: 'me', agent: 'agent-1', room: 'voice-1' }): Promise<void> {
  vi.resetModules();
  ({ room, agent } = createRoom(ids));
  (window as unknown as { LiveKit: unknown }).LiveKit = {
    Room: vi.fn(function () {
      return room;
    }),
    RoomEvent: {},
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
  };
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ token: 't', url: 'wss://lk.example', room: ids.room, username: 'U' }),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  service = (await import('../../../src/services/connection.service.js')).connectionService;
}

/** LiveKit's trackSubscribed for Ferni's voice: attach() makes the element the service plays. */
function subscribeFerniAudio(elementId = 'ferni-voice'): HTMLAudioElement {
  const el = document.createElement('audio');
  el.id = elementId;
  el.load = vi.fn();
  el.play = vi.fn(async () => undefined);
  el.pause = vi.fn();
  const track = {
    kind: 'audio',
    sid: 'TR_voice',
    mediaStreamTrack: { id: 'TR_voice' },
    attachedElements: [] as HTMLMediaElement[],
    attach() {
      track.attachedElements.push(el);
      return el;
    },
  };
  const publication = { trackName: 'agent_voice', track };
  agent.audioTrackPublications.set('TR_voice', publication);
  room.emit('trackSubscribed', track, publication, agent);
  return el;
}

function startPlaying(el: HTMLMediaElement): void {
  Object.defineProperty(el, 'paused', { configurable: true, get: () => false });
  Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
  el.dispatchEvent(new Event('playing'));
}

/** The messages published on the timing topic, as raw bytes. */
const timingSends = (): Array<{ data: Uint8Array; options: unknown }> =>
  room.localParticipant.publishData.mock.calls
    .filter(
      ([, options]) => (options as { topic?: string } | undefined)?.topic === CLIENT_TIMING_TOPIC
    )
    .map(([data, options]) => ({ data, options }));

const decode = (data: Uint8Array): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;

/** A call: tap, then 400 ms to the room, Ferni's track 900 ms after it joins, playing 300 ms later. */
async function callThatPlays(): Promise<void> {
  const tapAt = performance.now();
  await vi.advanceTimersByTimeAsync(400);
  await expect(service.connect({ tapAt })).resolves.toBe(true);
  await vi.advanceTimersByTimeAsync(900);
  const el = subscribeFerniAudio();
  await vi.advanceTimersByTimeAsync(300);
  startPlaying(el);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('CLIENT_TIMING_SEND on', () => {
  beforeEach(() => localStorage.setItem(CLIENT_TIMING_SEND_STORAGE_KEY, 'true'));

  it('sends one reliable message once Ferni is heard, and nothing more at hang-up', async () => {
    await load();
    const tapAt = performance.now();
    await vi.advanceTimersByTimeAsync(400);
    await service.connect({ tapAt });
    await vi.advanceTimersByTimeAsync(900);
    const el = subscribeFerniAudio();
    await vi.advanceTimersByTimeAsync(300);
    expect(timingSends()).toHaveLength(0); // his track alone is not "heard"

    startPlaying(el);
    expect(timingSends()).toHaveLength(1);
    const [{ data, options }] = timingSends();
    expect(options).toEqual({ reliable: true, topic: CLIENT_TIMING_TOPIC });
    const timing = decode(data);
    expect(Object.keys(timing).sort()).toEqual(
      ['agentAudioTrackAt', 'firstAudioHeardAt', 'platform', 'roomConnectedAt', 'tapAt'].sort()
    );
    expect(timing.platform).toBe('web');
    const tap = timing.tapAt as number;
    expect(tap).toBeGreaterThanOrEqual(MIN_EPOCH_MS);
    expect((timing.roomConnectedAt as number) - tap).toBe(400);
    expect((timing.agentAudioTrackAt as number) - tap).toBe(1_300);
    expect((timing.firstAudioHeardAt as number) - tap).toBe(1_600);

    startPlaying(el);
    await service.disconnect();
    expect(timingSends()).toHaveLength(1);
  });

  it('a call Ferni is never heard on: one message at hang-up, without firstAudioHeardAt', async () => {
    await load();
    await service.connect({ tapAt: performance.now() });
    await vi.advanceTimersByTimeAsync(700);
    subscribeFerniAudio();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(timingSends()).toHaveLength(0);

    await service.disconnect();
    expect(timingSends()).toHaveLength(1);
    const timing = decode(timingSends()[0].data);
    expect(timing).not.toHaveProperty('firstAudioHeardAt');
    expect((timing.agentAudioTrackAt as number) - (timing.roomConnectedAt as number)).toBe(700);

    await service.disconnect();
    expect(timingSends()).toHaveLength(1);
  });

  it('carries no identity, room name or element id, only moments and the platform', async () => {
    const MARK = 'zq-privacy-marker-7f3';
    await load({ local: `me-${MARK}`, agent: `agent-${MARK}`, room: `voice-${MARK}` });
    await service.connect({ tapAt: performance.now() });
    startPlaying(subscribeFerniAudio(`audio-${MARK}`));
    await service.disconnect();

    expect(timingSends()).toHaveLength(1);
    const text = new TextDecoder().decode(timingSends()[0].data);
    expect(text).not.toContain(MARK);
    const timing = decode(timingSends()[0].data);
    for (const [key, value] of Object.entries(timing)) {
      expect(key === 'platform' ? value === 'web' : typeof value === 'number').toBe(true);
    }
  });
});

describe('CLIENT_TIMING_SEND off', () => {
  it('never publishes on the timing topic, and the screen is what it is with it on', async () => {
    await load();
    await callThatPlays();
    await service.disconnect();
    expect(timingSends()).toHaveLength(0);
    const domOff = document.body.innerHTML;

    document.body.innerHTML = '';
    localStorage.setItem(CLIENT_TIMING_SEND_STORAGE_KEY, 'true');
    await load();
    await callThatPlays();
    await service.disconnect();
    expect(timingSends()).toHaveLength(1);
    expect(document.body.innerHTML).toBe(domOff);
  });

  it("'false' in this browser wins over a build that has it on", async () => {
    vi.stubEnv('VITE_CLIENT_TIMING_SEND', 'true');
    localStorage.setItem(CLIENT_TIMING_SEND_STORAGE_KEY, 'false');
    try {
      await load();
      await callThatPlays();
      await service.disconnect();
      expect(timingSends()).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
