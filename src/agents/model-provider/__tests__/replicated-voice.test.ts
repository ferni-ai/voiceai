/**
 * Replicated voices for Gemini native audio: each persona's sample is rendered
 * from its Cartesia voice (cached), and a setup-only handshake decides whether
 * the project may use replicated voices at all. Google rejects a
 * non-allowlisted project at setup (close 1007, no setupComplete), which would
 * otherwise kill every call; the preflight turns that into a prebuilt voice.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  getPersonaVoiceSample,
  isReplicatedVoiceAllowed,
  resetReplicatedVoiceCaches,
  type VoiceSampleDeps,
} from '../replicated-voice.js';

const SECONDS = (s: number) => Buffer.alloc(Math.round(s * 24000) * 2, 1);

function deps(over: Partial<VoiceSampleDeps> = {}): VoiceSampleDeps {
  const files = new Map<string, Buffer>();
  return {
    env: { CARTESIA_API_KEY: 'k' },
    cacheDir: '/cache',
    voiceIdFor: (p) => `voice-${p}`,
    render: vi.fn(async () => SECONDS(16)),
    readFile: async (p) => {
      const f = files.get(p);
      if (!f) throw new Error('ENOENT');
      return f;
    },
    writeFile: async (p, b) => void files.set(p, b),
    ...over,
  };
}

describe('getPersonaVoiceSample', () => {
  it('renders from the persona voice once, then serves the cache', async () => {
    resetReplicatedVoiceCaches();
    const d = deps();
    const a = await getPersonaVoiceSample('ferni', d);
    const b = await getPersonaVoiceSample('ferni', d);
    expect(a?.length).toBe(SECONDS(16).length);
    expect(b).toBe(a);
    expect(d.render).toHaveBeenCalledTimes(1);
    expect(d.render).toHaveBeenCalledWith('voice-ferni', 'k');
  });

  it('reuses the disk cache across processes', async () => {
    resetReplicatedVoiceCaches();
    const d = deps();
    await getPersonaVoiceSample('maya', d);
    resetReplicatedVoiceCaches(); // new process, same disk
    await getPersonaVoiceSample('maya', d);
    expect(d.render).toHaveBeenCalledTimes(1);
  });

  it('trims a long render to fit the 20s limit', async () => {
    resetReplicatedVoiceCaches();
    const d = deps({ render: vi.fn(async () => SECONDS(26)) });
    const s = await getPersonaVoiceSample('alex', d);
    expect(s!.length / 48000).toBeLessThanOrEqual(20);
    expect(s!.length / 48000).toBeGreaterThanOrEqual(10);
  });

  it('returns null (prebuilt voice) when the render is too short or fails', async () => {
    resetReplicatedVoiceCaches();
    expect(await getPersonaVoiceSample('p1', deps({ render: vi.fn(async () => SECONDS(4)) }))).toBeNull();
    expect(
      await getPersonaVoiceSample('p2', deps({ render: vi.fn(async () => { throw new Error('503'); }) }))
    ).toBeNull();
  });

  it('prefers a hand-recorded sample file when configured', async () => {
    resetReplicatedVoiceCaches();
    const recorded = SECONDS(15);
    const d = deps({
      env: { CARTESIA_API_KEY: 'k', NATIVE_AUDIO_VOICE_SAMPLE_FERNI: '/samples/ferni.pcm' },
      readFile: async (p) => {
        if (p === '/samples/ferni.pcm') return recorded;
        throw new Error('ENOENT');
      },
    });
    expect(await getPersonaVoiceSample('ferni', d)).toBe(recorded);
    expect(d.render).not.toHaveBeenCalled();
  });
});

describe('getPersonaVoiceSample overrides', () => {
  it('rejects a non-PCM override instead of sending a container header as audio', async () => {
    resetReplicatedVoiceCaches();
    const d = deps({
      env: { CARTESIA_API_KEY: 'k', NATIVE_AUDIO_VOICE_SAMPLE_FERNI: '/samples/ferni.wav' },
      readFile: async () => SECONDS(15),
    });
    expect(await getPersonaVoiceSample('ferni', d)).toBeNull();
  });

  it('rejects a hand-recorded sample outside 10-20s', async () => {
    resetReplicatedVoiceCaches();
    const d = deps({
      env: { CARTESIA_API_KEY: 'k', NATIVE_AUDIO_VOICE_SAMPLE: '/samples/short.pcm' },
      readFile: async () => SECONDS(5),
    });
    expect(await getPersonaVoiceSample('ferni', d)).toBeNull();
  });
});

describe('isReplicatedVoiceAllowed', () => {
  const opts = { project: 'p', location: 'us-central1', model: 'gemini-3.8-live', sample: SECONDS(15) };

  it('is true when setup completes', async () => {
    resetReplicatedVoiceCaches();
    const handshake = vi.fn(async () => 'setupComplete' as const);
    expect(await isReplicatedVoiceAllowed(opts, handshake)).toBe(true);
  });

  it('is false when Google rejects the project at setup', async () => {
    resetReplicatedVoiceCaches();
    const handshake = vi.fn(async () => 'rejected' as const);
    expect(await isReplicatedVoiceAllowed(opts, handshake)).toBe(false);
  });

  it('caches the answer per project so calls do not each pay the handshake', async () => {
    resetReplicatedVoiceCaches();
    const handshake = vi.fn(async () => 'setupComplete' as const);
    await isReplicatedVoiceAllowed(opts, handshake);
    await isReplicatedVoiceAllowed(opts, handshake);
    expect(handshake).toHaveBeenCalledTimes(1);
  });

  it('is false (never throws) when the handshake errors', async () => {
    resetReplicatedVoiceCaches();
    const handshake = vi.fn(async () => { throw new Error('network'); });
    expect(await isReplicatedVoiceAllowed(opts, handshake)).toBe(false);
  });
});
