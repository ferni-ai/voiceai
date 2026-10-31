/**
 * BACKCHANNEL_TIMING takes: each backchannel token has judged takes
 * (BACKCHANNEL_TAKES), rendered in every persona's own voice, so at prod's
 * 1.7 a minute no take repeats inside 60 s (30% did on 60 prod calls, sounds
 * audit 2026-10-22) and none is dropped for want of a fresh one. Off, the
 * clip choices and the renders are exactly as before. Driven through the real
 * live backchanneling, clip player and audio cache, with Cartesia faked so
 * each voice renders a clip of its own length.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';

const direct = vi.hoisted(() => ({ played: [] as Array<{ label: string; samples: number }> }));

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
    play: (pcm: ArrayBuffer, _volume: number, label: string) => {
      direct.played.push({ label, samples: pcm.byteLength / 2 });
      return true;
    },
    cancelIfFresh: () => false,
    lastWireMs: 57,
    close: async () => {},
  }),
}));

const { initializeLiveBackchanneling } = await import('../live-backchanneling-integration.js');
const { createBackchannelBag } = await import('../backchannel-timing.js');
const { NEUTRAL_BACKCHANNELS, SOFT_BACKCHANNELS } = await import('../backchannel-policy.js');
const { startBackchannelClips } = await import('../clip-player.js');
const cache = await import('../../shared/conversational-audio-cache.js');
const { BACKCHANNEL_TAKES, CLIP_PERSONAS, VOICED_TAKES } =
  await import('../../shared/reaction-clips.js');
const { BACKCHANNEL_TAKE_MAX_MS, backchannelTakeTexts, renderBackchannelTake, transcriptForVoice } =
  await import('../../shared/voiced-take-render.js');
const { getVoiceIdForPersona } = await import('../../../config/voice-ids.js');

const RATE = 16000;
const FRAME = RATE / 100;
// Nothing a reaction fits (backchannel-context.ts), so the neutral picks play.
const PHRASE_END = 'I picked up some milk at the store.';
const ALL_TAKES = backchannelTakeTexts([], { BACKCHANNEL_TIMING: 'on' });
const SOFT_TAKES = new Set(Object.values(BACKCHANNEL_TAKES.soft).flat());

function frame(loud: boolean, t: number): AudioFrame {
  const data = new Int16Array(FRAME);
  if (loud)
    for (let i = 0; i < FRAME; i++) data[i] = Math.round(12000 * Math.sin((t * FRAME + i) / 6));
  return new AudioFrame(data, RATE, 1, FRAME);
}

const seeded =
  (seed: number, scale = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) / 2147483647) * scale;

/** Live backchanneling on the audio clock, as prod runs it: talk 6 s, pause after a sentence. */
function liveCall(
  timing: 'on' | 'off',
  playClip: (text: string) => boolean,
  count: number,
  persona = 'ferni'
): void {
  vi.stubEnv('BACKCHANNEL_AUDIO_CLOCK', 'on');
  vi.stubEnv('BACKCHANNEL_TIMING', timing);
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockImplementation(seeded(7, 0.5));
  let heard = 0;
  const id = `takes-${timing}-${persona}-${count}`;
  const bc = initializeLiveBackchanneling(id, persona, {} as never, () => false, {
    playClip: (text) => playClip(text) && ++heard > 0,
  });
  bc.onNewTurn();
  let t = 0;
  const run = (loud: boolean, ms: number): void => {
    for (let i = 0; i < ms / 10; i++, t++) {
      vi.advanceTimersByTime(10);
      bc.processAudioFrame(frame(loud, t));
    }
  };
  for (let i = 0; i < 400 && heard < count; i++) {
    run(true, 6000);
    bc.updateState({ partialTranscript: PHRASE_END });
    run(false, 500);
  }
}

/** Fake Cartesia: every voice renders a tone of its own length, so audio names its voice. */
const voiceIds = CLIP_PERSONAS.map((p) => getVoiceIdForPersona(p));
const samplesFor = (voiceId: string): number => 2400 + voiceIds.indexOf(voiceId) * 240;
const voiceOf = (samples: number): string | undefined => voiceIds[(samples - 2400) / 240];
const sent: Array<{ voiceId: string; transcript: string }> = [];

beforeEach(() => {
  sent.length = 0;
  direct.played = [];
  cache.clearConversationalCache();
  vi.stubEnv('CARTESIA_API_KEY', 'test-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { transcript: string; voice: { id: string } };
      sent.push({ voiceId: body.voice.id, transcript: body.transcript });
      const s = new Int16Array(samplesFor(body.voice.id));
      for (let i = 0; i < s.length; i++) s[i] = Math.round(6000 * Math.sin(i / 3));
      return new Response(s.buffer);
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Warm each persona's reactions (and the takes, when the flag is on) into the cache. */
async function warm(personas: readonly string[]): Promise<void> {
  vi.stubEnv('SKIP_CONVERSATIONAL_PREWARM', 'true');
  await cache.prewarmConversationalAudio(); // only marks the cache ready
  await Promise.all(personas.map(async (p) => cache.warmPersonaReactions(p)));
}

describe('flag off: as before', () => {
  it('the same twenty live clips, in the same order', () => {
    const played: string[] = [];
    liveCall('off', (t) => (played.push(t), true), 20);
    // Recorded on origin/main 85f0a0f76 with the same seed.
    // prettier-ignore
    expect(played).toEqual(['Mm-hmm', 'Yeah', 'Mhm', 'Yeah', 'Mm-hmm', 'Mhm', 'Yeah', 'Mhm', 'Yeah',
      'Mhm', 'Yeah', 'Mm-hmm', 'Yeah', 'Mhm', 'Yeah', 'Mm-hmm', 'Mhm', 'Yeah', 'Mm-hmm', 'Mhm']);
  });

  it('renders the same clips: no take is sent to Cartesia', async () => {
    vi.stubEnv('VOICED_PRESENCE', 'on'); // as prod runs
    await warm(['maya-santos']);
    expect(sent).toHaveLength(40); // origin/main renders 40 for Maya with VOICED_PRESENCE on
    const takes = ALL_TAKES.map((t) => transcriptForVoice(t, getVoiceIdForPersona('maya-santos')));
    expect(sent.filter((s) => takes.includes(s.transcript))).toEqual([]);
  });
});

describe('flag on: the takes', () => {
  it('each soft token has soft takes, Yeah bright ones (no "Right" take passed the judges)', () => {
    for (const token of SOFT_BACKCHANNELS)
      expect(BACKCHANNEL_TAKES.soft[token]?.length ?? 0, token).toBeGreaterThanOrEqual(3);
    expect(BACKCHANNEL_TAKES.bright.Yeah?.length ?? 0).toBeGreaterThanOrEqual(3);
    const tokens = new Set<string>(NEUTRAL_BACKCHANNELS);
    for (const tier of Object.values(BACKCHANNEL_TAKES))
      for (const token of Object.keys(tier)) expect(tokens).toContain(token);
  });

  it('a take rendered longer than a plain clip is refused, so it is not cached', async () => {
    const tone = (ms: number): ArrayBuffer => {
      const s = new Int16Array((24000 * ms) / 1000);
      for (let i = 0; i < s.length; i++) s[i] = Math.round(6000 * Math.sin(i / 3));
      return s.buffer;
    };
    const rendered = async (ms: number): Promise<boolean> => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(tone(ms)))
      );
      return (await renderBackchannelTake('Mm.', voiceIds[0] ?? '')) !== null;
    };
    expect(await rendered(BACKCHANNEL_TAKE_MAX_MS - 40)).toBe(true);
    expect(await rendered(BACKCHANNEL_TAKE_MAX_MS + 100)).toBe(false);
  });

  // A take whose cache key matched another clip's would not be sent: it would replay that clip.
  it.each([...CLIP_PERSONAS])('%s renders every take in its own voice', async (persona) => {
    vi.stubEnv('BACKCHANNEL_TIMING', 'on');
    await warm([persona]);
    const voiceId = getVoiceIdForPersona(persona);
    const mine = sent.filter((s) => s.voiceId === voiceId).map((s) => s.transcript);
    for (const take of ALL_TAKES) expect(mine, take).toContain(transcriptForVoice(take, voiceId));
    expect(sent.every((s) => s.voiceId === voiceId)).toBe(true);
  });
});

/** One call's backchannel times: 5 s minimum gap plus an exponential wait, `perMin` on average. */
function callTimes(minutes: number, perMin: number, random: () => number): number[] {
  const gapMs = 60_000 / perMin - 5000;
  const out: number[] = [];
  for (let at = 0; ;) {
    at += 5000 - Math.log(1 - random()) * gapMs;
    if (at > minutes * 60_000) return out;
    out.push(at);
  }
}

function repeatsWithin(played: Array<{ text: string; at: number }>, ms: number): string[] {
  return played
    .filter((p, i) => played.slice(0, i).some((q) => q.text === p.text && p.at - q.at < ms))
    .map((p) => p.text);
}

/** A 10-minute call on one persona: the bag over the real cache, a soft moment one time in four. */
function tenMinutes(persona: string, perMin: number, seed: number) {
  const random = seeded(seed);
  const bag = createBackchannelBag(random);
  const played: Array<{ text: string; at: number; voice: string | undefined }> = [];
  const dropped: number[] = [];
  for (const at of callTimes(10, perMin, random)) {
    const soft = random() < 0.25;
    const play = (text: string): boolean => {
      const pcm = cache.getCachedAudioForPersona(text, persona);
      if (pcm === null) return false;
      played.push({ text, at, voice: voiceOf(pcm.byteLength / 2) });
      return true;
    };
    const tokens = soft ? SOFT_BACKCHANNELS : NEUTRAL_BACKCHANNELS;
    if (bag.play(null, tokens, !soft, play, at) === null) dropped.push(at);
  }
  return { played, dropped };
}

describe('flag on: a 10-minute call at 1.7 a minute', () => {
  it.each([...CLIP_PERSONAS])(
    '%s: no take twice inside 60 s, none dropped, its own voice',
    async (persona) => {
      vi.stubEnv('BACKCHANNEL_TIMING', 'on');
      await warm(CLIP_PERSONAS); // every voice in the cache: each persona must pick its own
      for (const seed of [3, 11, 29, 47]) {
        const { played, dropped } = tenMinutes(persona, 1.7, seed);
        expect(played.length).toBeGreaterThanOrEqual(10);
        expect(dropped).toEqual([]);
        expect(repeatsWithin(played, 60_000)).toEqual([]);
        expect(new Set(played.map((p) => p.voice))).toEqual(
          new Set([getVoiceIdForPersona(persona)])
        );
        expect(played.some((p) => ALL_TAKES.includes(p.text))).toBe(true);
      }
    }
  );

  it('at the fastest the gate allows (every 5-6 s), still no repeat inside 60 s', async () => {
    vi.stubEnv('BACKCHANNEL_TIMING', 'on');
    await warm(['ferni']);
    const { played, dropped } = tenMinutes('ferni', 11, 5);
    expect(played.length).toBeGreaterThan(80);
    expect(repeatsWithin(played, 60_000)).toEqual([]);
    expect(dropped.length / (played.length + dropped.length)).toBeLessThan(0.1);
  });

  it('soft and heavy moments draw only plain soft clips and soft takes', async () => {
    vi.stubEnv('BACKCHANNEL_TIMING', 'on');
    await warm(['ferni']);
    const bag = createBackchannelBag(seeded(9));
    const heard: string[] = [];
    for (let at = 0; at < 600_000; at += 7000) {
      const t = bag.play(null, SOFT_BACKCHANNELS, false, (x) => (heard.push(x), true), at);
      expect(t).not.toBeNull();
    }
    for (const t of heard) expect([...SOFT_BACKCHANNELS, ...SOFT_TAKES]).toContain(t);
    expect(heard.some((t) => SOFT_TAKES.has(t))).toBe(true);
    expect(heard.some((t) => (VOICED_TAKES.mmhm as readonly string[]).includes(t))).toBe(false);
  });
});

describe('flag on: the live clip path', () => {
  it('live backchannels play takes in the voice of whoever is on the call', async () => {
    vi.stubEnv('BACKCHANNEL_TIMING', 'on');
    vi.stubEnv('REACTION_SIDETRACK', 'direct');
    vi.stubEnv('PRESENCE_SOUNDS', 'off');
    await warm(['ferni', 'maya-santos']);
    let persona = 'ferni';
    const started = await startBackchannelClips(
      {} as never,
      {} as never,
      () => persona,
      cache.getCachedAudioForPersona
    );
    if (started === null) throw new Error('clip player did not start');
    const play = started.live.playClip;
    liveCall('on', play, 12);
    const ferni = direct.played.splice(0);
    persona = 'maya-santos'; // a handoff: the same call, Maya's voice
    liveCall('on', play, 12, 'maya-santos');
    const maya = direct.played.splice(0);
    for (const [who, heard] of [
      ['ferni', ferni],
      ['maya-santos', maya],
    ] as const) {
      expect(heard).toHaveLength(12);
      expect(heard.some((p) => ALL_TAKES.includes(p.label))).toBe(true);
      expect(new Set(heard.map((p) => voiceOf(p.samples)))).toEqual(
        new Set([getVoiceIdForPersona(who)])
      );
    }
  });
});
