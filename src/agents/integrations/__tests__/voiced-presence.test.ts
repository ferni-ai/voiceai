/**
 * VOICED_PRESENCE: Seth's kept takes replace the synthesized hum (tool and
 * idle), whistle and snore stay off, a yawn plays only on a 05:00-08:59 call,
 * reactions draw extra variants, everything plays on the direct track, and
 * nothing plays over the caller. Off, the synth path is unchanged.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

const mixer = vi.hoisted(() => ({ plays: 0 }));
const direct = vi.hoisted(() => ({
  labels: [] as string[],
  playing: false,
  stops: 0,
  wire: [] as Array<(w: { label: string; playToWireMs: number }) => void>,
}));

const voicedLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (b: { module?: string }) =>
      b?.module === 'VoicedPresence' ? voicedLog : actual.createLogger(b),
  };
});

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      mixer.plays++;
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});

const fakeDirect = {
  get playing() {
    return direct.playing;
  },
  play: (_pcm: ArrayBuffer, _v: number, label: string) => {
    if (direct.playing) return false;
    direct.labels.push(label);
    return true;
  },
  stop: () => {
    direct.stops++;
  },
  onWireTo: (fn: (w: { label: string; playToWireMs: number }) => void) => direct.wire.push(fn),
  cancelIfFresh: () => false,
  lastWireMs: 50,
  close: async () => {},
};
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => fakeDirect,
}));

const { VOICED_TAKES } = await import('../../shared/reaction-clips.js');
const { reactionSidetrackDirect } = await import('../direct-clip-track.js');
const { startBackchannelClips } = await import('../clip-player.js');
const { startToolHum, TOOL_HUM_DELAY_MS } = await import('../tool-hum.js');
const { createTakePicker, idleCategory, logVoicedTake, startVoicedPresence, voicedHumFor } =
  await import('../voiced-presence.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;
const HUMS = VOICED_TAKES['thinking-hum'];
const IDLE = [...HUMS, ...VOICED_TAKES['sung-hum']];
const YAWNS = VOICED_TAKES['morning-yawn'];

function fakeSession(userData: Record<string, unknown> = {}) {
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = userData;
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  const user = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: s });
  /** Three exchanges, then he finishes and listens. */
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
    return () => items.forEach((cb) => cb({ type: 'function_call_output', callId }));
  };
  return { session, agent, user, warmUp, tool };
}

const start = (s: EventEmitter, opts: Record<string, unknown> = {}) =>
  startVoicedPresence({
    session: s as never,
    direct: fakeDirect,
    mixerBusy: () => false,
    getClip: pcm,
    personaId: () => 'ferni',
    rng: () => 0.1,
    ...opts,
  });

beforeEach(() => {
  vi.useFakeTimers();
  mixer.plays = 0;
  Object.assign(direct, { labels: [], playing: false, stops: 0, wire: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('flag off', () => {
  it('starts nothing and the tool hum stays the synthesized one on the mixer player', () => {
    const { session, tool } = fakeSession();
    expect(start(session, { env: {} })).toBeNull();
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    const voiced = { next: vi.fn(() => pcm()), play: vi.fn(() => true), stop: vi.fn() };
    startToolHum(session as never, player, { TOOL_HUM: 'on' }, () => voiced);
    tool('c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(voiced.next).not.toHaveBeenCalled();
  });

  it('does not route clips to the direct track unless asked', () => {
    expect(reactionSidetrackDirect({})).toBe(false);
    expect(reactionSidetrackDirect({ VOICED_PRESENCE: 'on' })).toBe(true);
  });
});

describe('tool hum, flag on', () => {
  const env = { TOOL_HUM: 'on', VOICED_PRESENCE: 'on' };

  it('plays thinking-hum takes on the direct track, never the same take twice running', () => {
    const { session, tool } = fakeSession();
    start(session, { env });
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    startToolHum(session as never, player, env);
    const done = tool('c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS + 4000);
    done();
    tool('c2')(); // a fast tool: the next slow one may hum again
    tool('c3');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(player.play).not.toHaveBeenCalled();
    expect(direct.labels).toHaveLength(2);
    direct.labels.forEach((l) => expect(HUMS).toContain(l));
    expect(direct.labels[0]).not.toBe(direct.labels[1]);
  });

  it('plays nothing (not the synth hum) when no voiced take is available', () => {
    const { session, tool } = fakeSession();
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    startToolHum(session as never, player, env); // no voiced presence on this session
    tool('c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(player.play).not.toHaveBeenCalled();
    expect(direct.labels).toHaveLength(0);
  });

  it('never starts over the caller, and is gone when the call closes', () => {
    const { session, tool, user } = fakeSession();
    const voiced = start(session, { env });
    startToolHum(session as never, { play: vi.fn(() => true), stop: vi.fn() }, env);
    user('speaking');
    tool('c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS + 1000);
    expect(direct.labels).toHaveLength(0);
    voiced!.close();
    expect(voicedHumFor(session)).toBeUndefined();
  });
});

describe('take picker', () => {
  it('never repeats the last played take while another is ready', () => {
    const picker = createTakePicker(pcm, () => 0);
    let last = -1;
    for (let i = 0; i < 6; i++) {
      const take = picker.take('thinking-hum')!;
      expect(take.index).not.toBe(last);
      picker.played(take);
      last = take.index;
    }
  });

  it('skips takes that are not rendered yet', () => {
    const picker = createTakePicker((t) => (t === HUMS[2] ? pcm() : null));
    expect(picker.take('thinking-hum')!.text).toBe(HUMS[2]);
    expect(createTakePicker(() => null).take('thinking-hum')).toBeNull();
  });
});

describe('morning yawn', () => {
  it('fits only 05:00 to 08:59, never with the time unknown', () => {
    const yawns = (h: number | null) => idleCategory(h, false, () => 0.9) === 'morning-yawn';
    expect([4, 5, 8, 9, 12, 21, 23, null].map(yawns)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('is chosen at most once a call', () => {
    expect(idleCategory(6, false, () => 0.9)).toBe('morning-yawn');
    expect(idleCategory(6, true, () => 0.9)).toBe('thinking-hum');
    expect(idleCategory(22, false, () => 0.1)).toBe('sung-hum');
  });

  const idleAt = (iso: string, tz = 'America/New_York') => {
    const { session, warmUp } = fakeSession({ callerTimezone: tz });
    start(session, {
      env: { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on' },
      now: () => new Date(iso),
    });
    warmUp();
    vi.advanceTimersByTime(8000);
    return direct.labels;
  };

  it('plays in the quiet window on a 06:30 call (caller time)', () => {
    expect(idleAt('2026-10-12T10:30:00Z')).toHaveLength(1); // 06:30 EDT
    expect(YAWNS).toContain(direct.labels[0]);
  });

  it('a 10:00 or 22:00 call gets a hum instead', () => {
    expect(IDLE).toContain(idleAt('2026-10-12T14:00:00Z')[0]); // 10:00 EDT
    direct.labels = [];
    expect(IDLE).toContain(idleAt('2026-10-13T02:00:00Z')[0]); // 22:00 EDT
  });
});

describe('quiet window, flag on', () => {
  const env = { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on' };

  it('stops its sound the moment the caller speaks, and never plays while they talk', () => {
    const { session, warmUp, user } = fakeSession();
    start(session, { env });
    warmUp();
    user('speaking');
    vi.advanceTimersByTime(10_000);
    expect(direct.labels).toHaveLength(0);
    user('listening');
    vi.advanceTimersByTime(4800); // the quiet window with rng 0.1; the clip is still playing
    expect(direct.labels).toHaveLength(1);
    user('speaking');
    expect(direct.stops).toBe(1);
  });

  it('does not play when their voice reads heavy', () => {
    const { session, warmUp } = fakeSession({ voiceEmotion: { primary: 'sad' } });
    start(session, { env });
    warmUp();
    vi.advanceTimersByTime(10_000);
    expect(direct.labels).toHaveLength(0);
  });
});

describe('whistle and snore', () => {
  const run = async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { session, warmUp } = fakeSession();
    await startBackchannelClips({} as never, session as never, () => 'ferni', pcm);
    warmUp();
    vi.advanceTimersByTime(30_000); // past the idle tune and the long-quiet snore
    return mixer.plays - 1; // minus the keep-alive silence
  };
  const on = { PRESENCE_SOUNDS: 'on', PRESENCE_SNORE: 'on' };

  it('off: the synthesized whistle and snore play on the mixer', async () => {
    Object.entries(on).forEach(([k, v]) => vi.stubEnv(k, v));
    expect(await run()).toBe(2);
  });

  it('on: suppressed whatever PRESENCE_SOUNDS/PRESENCE_SNORE say; a voiced hum plays direct', async () => {
    Object.entries({ ...on, VOICED_PRESENCE: 'on' }).forEach(([k, v]) => vi.stubEnv(k, v));
    expect(await run()).toBe(0);
    expect(direct.labels).toHaveLength(1);
    expect(IDLE).toContain(direct.labels[0]);
  });
});

describe('reactions, flag on', () => {
  it('the laugh-along draws a kept take, and the live player falls back when it is not ready', () => {
    const { session } = fakeSession();
    const voiced = start(session, { env: { VOICED_PRESENCE: 'on' }, rng: () => 0.99 })!;
    const played: string[] = [];
    const vary = voiced.vary((t) => {
      played.push(t);
      return true;
    });
    expect(vary('[laughter]')).toBe(true);
    expect(VOICED_TAKES.laugh.slice(1)).toContain(played[0]);
    const missing = voiced.vary((t) => t === 'Aw');
    expect(missing('Aw')).toBe(true); // the take wasn't cached: the plain "Aw"
  });

  it('keeps the plain clip in a heavy moment and for clips without takes', () => {
    const { session } = fakeSession({ voiceEmotion: { primary: 'sad' } });
    const voiced = start(session, { env: { VOICED_PRESENCE: 'on' }, rng: () => 0.99 })!;
    const played: string[] = [];
    const vary = voiced.vary((t) => {
      played.push(t);
      return true;
    });
    vary('Mm-hmm');
    vary('Yeah');
    expect(played).toEqual(['Mm-hmm', 'Yeah']);
  });

  it('live backchannels in startBackchannelClips go through the variants', async () => {
    vi.stubEnv('VOICED_PRESENCE', 'on');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { session } = fakeSession();
    const clips = await startBackchannelClips({} as never, session as never, () => 'ferni', pcm);
    expect(clips!.live.playClip('Oh')).toBe(true);
    expect(VOICED_TAKES.recognition).toContain(direct.labels[0]);
    direct.labels = [];
    expect(clips!.playClip('Oh')).toBe(true); // the turn opener keeps its own clip
    expect(direct.labels).toEqual(['Oh']);
  });
});

describe('one clip at a time, and the log', () => {
  it('plays nothing while the mixer track is playing a clip', () => {
    const { session, warmUp } = fakeSession();
    start(session, {
      env: { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on' },
      mixerBusy: () => true,
    });
    warmUp();
    vi.advanceTimersByTime(10_000);
    expect(direct.labels).toHaveLength(0);
  });

  it('logs VOICED_PRESENCE with category, take and latency for a kept take, only when on', () => {
    voicedLog.info.mockClear();
    logVoicedTake('<emotion value="excited"/>Ah!', 56.4);
    expect(voicedLog.info).not.toHaveBeenCalled();
    vi.stubEnv('VOICED_PRESENCE', 'on');
    logVoicedTake('Yeah', 50);
    expect(voicedLog.info).not.toHaveBeenCalled();
    logVoicedTake('<emotion value="excited"/>Ah!', 56.4);
    expect(voicedLog.info).toHaveBeenCalledWith(
      { category: 'recognition', take: 3, latencyMs: 56 },
      'VOICED_PRESENCE'
    );
  });
});

describe('recorded whistles under VOICED_PRESENCE (PRESENCE_SOUND_ASSETS)', () => {
  const both = { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on', PRESENCE_SOUND_ASSETS: 'on' };
  const isRecorded = (label: string | undefined) =>
    /^recorded-whistle:people-.+__\d\.wav$/.test(label ?? '');

  it('an easy pause can draw one of the recorded whistles, on the direct track', () => {
    const { session, warmUp } = fakeSession();
    start(session, { env: both, now: () => new Date('2026-10-12T14:00:00Z') });
    warmUp();
    vi.advanceTimersByTime(8000);
    expect(direct.labels).toHaveLength(1);
    expect(isRecorded(direct.labels[0])).toBe(true);
  });

  it('plays one sound a call: no second whistle or hum in later pauses', () => {
    const { session, warmUp } = fakeSession();
    start(session, { env: both, now: () => new Date('2026-10-12T14:00:00Z') });
    warmUp();
    vi.advanceTimersByTime(8000);
    warmUp();
    vi.advanceTimersByTime(30_000);
    expect(direct.labels).toHaveLength(1);
  });

  it('the morning yawn keeps its slot', () => {
    const { session, warmUp } = fakeSession({ callerTimezone: 'America/New_York' });
    start(session, { env: both, now: () => new Date('2026-10-12T10:30:00Z') }); // 06:30 EDT
    warmUp();
    vi.advanceTimersByTime(8000);
    expect(YAWNS).toContain(direct.labels[0]);
  });

  it('plays nothing while the mixer track is playing a clip', () => {
    const { session, warmUp } = fakeSession();
    start(session, { env: both, mixerBusy: () => true });
    warmUp();
    vi.advanceTimersByTime(10_000);
    expect(direct.labels).toHaveLength(0);
  });

  it('with PRESENCE_SOUND_ASSETS off, the quiet window is a hum as before', () => {
    const { session, warmUp } = fakeSession();
    start(session, {
      env: { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on' },
      now: () => new Date('2026-10-12T14:00:00Z'),
    });
    warmUp();
    vi.advanceTimersByTime(8000);
    expect(IDLE).toContain(direct.labels[0]);
  });

  it('through the clip player: the whistle plays direct and nothing stacks on the mixer', async () => {
    Object.entries({ ...both, PRESENCE_SNORE: 'on' }).forEach(([k, v]) => vi.stubEnv(k, v));
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { session, warmUp } = fakeSession();
    await startBackchannelClips({} as never, session as never, () => 'ferni', pcm);
    warmUp();
    vi.advanceTimersByTime(30_000);
    expect(mixer.plays - 1).toBe(0); // minus the keep-alive silence: no mixer whistle or snore
    expect(direct.labels).toHaveLength(1);
    expect(isRecorded(direct.labels[0])).toBe(true);
  });

  it('logs VOICED_PRESENCE with the file that played, so ratings map to plays', () => {
    vi.stubEnv('VOICED_PRESENCE', 'on');
    voicedLog.info.mockClear();
    logVoicedTake('recorded-whistle:people-whistling-78101__1.wav', 56.4);
    expect(voicedLog.info).toHaveBeenCalledWith(
      { category: 'recorded-whistle', file: 'people-whistling-78101__1.wav', latencyMs: 56 },
      'VOICED_PRESENCE'
    );
  });
});
