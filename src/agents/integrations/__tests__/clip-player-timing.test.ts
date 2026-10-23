/**
 * BACKCHANNEL_TIMING in the clip player: each live clip gets +-2 dB of gain,
 * and an mm-hm take the backchannel bag chose plays as chosen (VOICED_PRESENCE
 * does not swap it). The turn-opening clip keeps its fixed volume. Off, nothing
 * changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const direct = vi.hoisted(() => ({ played: [] as Array<{ label: string; volume: number }> }));

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
    play: (_pcm: ArrayBuffer, volume: number, label: string) => {
      direct.played.push({ label, volume });
      return true;
    },
    cancelIfFresh: () => false,
    lastWireMs: 57,
    close: async () => {},
  }),
}));

const { startBackchannelClips } = await import('../clip-player.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;
const start = () => startBackchannelClips({} as never, {} as never, () => 'ferni', pcm);

describe('clip player with BACKCHANNEL_TIMING', () => {
  beforeEach(() => {
    direct.played = [];
    vi.stubEnv('REACTION_SIDETRACK', 'direct');
    vi.stubEnv('VOICED_PRESENCE', 'on');
    vi.stubEnv('PRESENCE_SOUNDS', 'off');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('off: live clips at 0.75 and VOICED_PRESENCE swaps "Mhm" for a take', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const clips = await start();
    expect(clips!.live.playClip('Mhm')).toBe(true);
    expect(direct.played[0]!.volume).toBe(0.75);
    expect(direct.played[0]!.label).not.toBe('Mhm');
  });

  it('on: each live clip lands within +-2 dB of 0.75, and differs play to play', async () => {
    vi.stubEnv('BACKCHANNEL_TIMING', 'on');
    const rolls = [0, 1, 0.25];
    vi.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.5);
    const clips = await start();
    for (const text of ['Yeah', 'Right', 'Mm']) clips!.live.playClip(text);
    const volumes = direct.played.map((p) => p.volume);
    expect(volumes[0]).toBeCloseTo(0.75 * 10 ** (-2 / 20), 6);
    expect(volumes[1]).toBeCloseTo(0.75 * 10 ** (2 / 20), 6);
    expect(volumes[2]).toBeCloseTo(0.75 * 10 ** (-1 / 20), 6);
  });

  it("on: the bag's pick plays as picked, and the opening clip keeps 0.75", async () => {
    vi.stubEnv('BACKCHANNEL_TIMING', 'on');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const clips = await start();
    clips!.live.playClip('Mhm');
    clips!.playClip('Mm');
    expect(direct.played.map((p) => p.label)).toEqual(['Mhm', 'Mm']);
    expect(direct.played[1]!.volume).toBe(0.75);
  });
});
