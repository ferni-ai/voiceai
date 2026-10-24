/**
 * sound_played (CLIENT_SIGNALS_V2): every non-speech clip reports its kind
 * when it starts, through the real players (startBackchannelClips, the opener
 * via startTurnSounds, presence sounds, the tool hum, voiced presence), with
 * only the audio tracks and the room faked. Off, nothing new is sent, and
 * backchannel_played is unchanged.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

const direct = vi.hoisted(() => ({ labels: [] as string[] }));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => ({
    playing: false,
    play: (_pcm: ArrayBuffer, _v: number, label: string) => (direct.labels.push(label), true),
    stop: () => {},
    cancelIfFresh: () => false,
    lastWireMs: 57,
    close: async () => {},
  }),
}));
const pcm = () => new Int16Array(2400).fill(8000).buffer;
vi.mock('../../shared/conversational-audio-cache.js', () => ({
  getCachedAudioForPersona: () => new Int16Array(2400).fill(8000).buffer,
}));

const { startBackchannelClips } = await import('../clip-player.js');
const { startTurnSounds } = await import('../../multi-agent/live-call-behaviors.js');
const { LAUGH_CLIP } = await import('../backchannel-policy.js');
const { VOICED_TAKES } = await import('../../shared/reaction-clips.js');
const { createSoundSignal, soundLabel } = await import('../sound-signal.js');

type Msg = { type: string; kind?: string; wireDelayMs?: number; label?: string };
let sent: Msg[] = [];
const room = {
  localParticipant: {
    publishData: async (data: Uint8Array) => {
      sent.push(JSON.parse(new TextDecoder().decode(data)) as Msg);
    },
  },
};
const sounds = () => sent.filter((m) => m.type === 'sound_played');

function fakeSession(userData: Record<string, unknown> = {}) {
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = userData;
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  const user = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: s });
  const warmUp = () => {
    for (let i = 0; i < 3; i++) {
      agent('speaking');
      agent('listening');
    }
  };
  const tool = (callId: string) => {
    const items = new Set<(item: { type: string; callId: string }) => void>();
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, {
      speechHandle: {
        _addItemAddedCallback: (cb: (item: { type: string; callId: string }) => void) =>
          items.add(cb),
        _removeItemAddedCallback: () => {},
        addDoneCallback: () => {},
      },
    });
    agent('thinking');
    items.forEach((cb) => cb({ type: 'function_call', callId }));
  };
  return { session, agent, user, warmUp, tool };
}

const start = (session: EventEmitter = fakeSession().session) =>
  startBackchannelClips(room as never, session as never, () => 'ferni', pcm);

beforeEach(() => {
  sent = [];
  direct.labels = [];
  vi.stubEnv('CLIENT_SIGNALS_V2', 'on');
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sound_played, CLIENT_SIGNALS_V2 on', () => {
  it('live reactions: a laugh is laugh, a backchannel is mm-hmm, without AVATAR_LISTEN_SIGNALS', async () => {
    const clips = await start();
    expect(clips!.live.playClip(LAUGH_CLIP)).toBe(true);
    expect(clips!.live.playClip('Mm-hmm')).toBe(true);
    expect(sounds()).toEqual([
      { type: 'sound_played', kind: 'laugh', wireDelayMs: 650, label: 'laughter' },
      { type: 'sound_played', kind: 'mm-hmm', wireDelayMs: 650, label: 'Mm-hmm' },
    ]);
    expect(sent.some((m) => m.type === 'backchannel_played')).toBe(false);
  });

  it('keeps backchannel_played for existing clients alongside it', async () => {
    vi.stubEnv('AVATAR_LISTEN_SIGNALS', 'on');
    const clips = await start();
    clips!.live.playClip(LAUGH_CLIP);
    expect(sent.map((m) => [m.type, m.kind])).toEqual([
      ['sound_played', 'laugh'],
      ['backchannel_played', 'laugh'],
    ]);
  });

  it('the turn-opening clip (startTurnSounds) is an opener, when it plays', async () => {
    vi.stubEnv('TURN_OPENING_SOUND', 'on');
    vi.useFakeTimers();
    const { session, agent, user } = fakeSession();
    await startTurnSounds({
      room: room as never,
      session: session as never,
      sessionId: 'sound-opener',
      personaId: () => 'ferni',
      lastUserFinalTranscript: () => 'I had such a long day at work',
      cleanupFunctions: [],
    });
    user('speaking');
    vi.advanceTimersByTime(3000);
    user('listening');
    agent('thinking');
    expect(sounds()).toEqual([]);
    vi.advanceTimersByTime(700);
    expect(sounds()).toEqual([
      { type: 'sound_played', kind: 'opener', wireDelayMs: 650, label: expect.any(String) },
    ]);
  });

  it('presence sounds on the mixer: a whistle or hum is hum, the snore is breath', async () => {
    vi.stubEnv('PRESENCE_SOUNDS', 'on');
    vi.stubEnv('PRESENCE_SNORE', 'on');
    vi.useFakeTimers();
    const { session, warmUp } = fakeSession();
    await start(session);
    warmUp();
    vi.advanceTimersByTime(8000);
    expect(sounds().map((m) => m.kind)).toEqual(['hum']);
    vi.advanceTimersByTime(20000);
    expect(sounds().map((m) => m.kind)).toEqual(['hum', 'breath']);
  });

  it('the tool hum is hum, on the mixer estimate', async () => {
    vi.stubEnv('TOOL_HUM', 'on');
    vi.useFakeTimers();
    const { session, tool } = fakeSession();
    await start(session);
    tool('c1');
    expect(sounds()).toEqual([]);
    vi.advanceTimersByTime(1300);
    expect(sounds()).toEqual([
      { type: 'sound_played', kind: 'hum', wireDelayMs: 650, label: 'tool hum' },
    ]);
  });

  it('voiced presence: the quiet-window hum is hum, the morning yawn breath, both direct', async () => {
    vi.stubEnv('VOICED_PRESENCE', 'on');
    vi.stubEnv('PRESENCE_SOUNDS', 'on');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:30:00Z')); // 06:30 in New York
    const morning = fakeSession({ callerTimezone: 'America/New_York' });
    await start(morning.session);
    morning.warmUp();
    vi.advanceTimersByTime(8000);
    expect(VOICED_TAKES['morning-yawn']).toContain(direct.labels[0]);
    vi.setSystemTime(new Date('2026-10-12T18:00:00Z')); // 14:00
    const afternoon = fakeSession({ callerTimezone: 'America/New_York' });
    await start(afternoon.session);
    afternoon.warmUp();
    vi.advanceTimersByTime(8000);
    // The label is the take that played, tags dropped.
    expect(sounds()).toEqual([
      {
        type: 'sound_played',
        kind: 'breath',
        wireDelayMs: 57,
        label: soundLabel(direct.labels[0]!),
      },
      { type: 'sound_played', kind: 'hum', wireDelayMs: 57, label: soundLabel(direct.labels[1]!) },
    ]);
    expect(sounds()[0]!.label).not.toMatch(/[<>[\]]/);
  });
});

describe('sound_played label', () => {
  it('names the take a variation picked, not only the clip asked for', async () => {
    vi.stubEnv('VOICED_PRESENCE', 'on');
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // the last take in the pool
    const clips = await start();
    expect(clips!.live.playClip(LAUGH_CLIP)).toBe(true);
    const take = direct.labels.at(-1)!;
    expect(take).not.toBe(LAUGH_CLIP);
    expect(sounds()).toEqual([
      { type: 'sound_played', kind: 'laugh', wireDelayMs: 57, label: soundLabel(take) },
    ]);
  });

  it('drops TTS tags, reads [laughter] as a word, caps the length, and leaves an empty label out', () => {
    expect(soundLabel('<emotion value="happy"/>[laughter] oh man.')).toBe('laughter oh man.');
    expect(soundLabel('x'.repeat(60))).toHaveLength(40);
    const out: Array<[string, unknown]> = [];
    const send = createSoundSignal(async (type, payload) => void out.push([type, payload]), {
      CLIENT_SIGNALS_V2: 'on',
    })!;
    send('hum', 10.4, '<volume ratio="0.6"/>');
    send('hum', 10.4);
    expect(out).toEqual([
      ['sound_played', { kind: 'hum', wireDelayMs: 10 }],
      ['sound_played', { kind: 'hum', wireDelayMs: 10 }],
    ]);
  });
});

describe('CLIENT_SIGNALS_V2 off', () => {
  it('sends nothing new from any path', async () => {
    vi.stubEnv('CLIENT_SIGNALS_V2', 'off');
    vi.stubEnv('PRESENCE_SOUNDS', 'on');
    vi.stubEnv('TOOL_HUM', 'on');
    vi.useFakeTimers();
    const { session, warmUp, tool } = fakeSession();
    const clips = await start(session);
    clips!.live.playClip(LAUGH_CLIP);
    clips!.openerClip('Mm');
    warmUp();
    vi.advanceTimersByTime(8000);
    tool('c1');
    vi.advanceTimersByTime(1300);
    expect(sent).toEqual([]);
  });
});
