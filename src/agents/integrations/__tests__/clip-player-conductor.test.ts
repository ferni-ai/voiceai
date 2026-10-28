/**
 * SOUND_CONDUCTOR through the real clip player (startBackchannelClips): the
 * live backchannel, the opener, the laugh, the slow-turn "Mm" and the voiced
 * tool hum all ask the call's conductor at the point they play. Off and shadow
 * play exactly what they did; on drops a pile-up to one sound.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const direct = vi.hoisted(() => ({ played: [] as string[] }));

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
// The direct track is free again at once, so only the conductor can refuse a clip.
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => ({
    playing: false,
    play: (_pcm: ArrayBuffer, _v: number, label: string) => (direct.played.push(label), true),
    cancelIfFresh: () => false,
    lastWireMs: 57,
    stop: () => {},
    close: async () => {},
  }),
}));

const { startBackchannelClips } = await import('../clip-player.js');
const { voicedHumFor } = await import('../voiced-presence.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;

async function pileUp(mode?: 'shadow' | 'on') {
  vi.stubEnv('REACTION_SIDETRACK', 'direct');
  if (mode) vi.stubEnv('SOUND_CONDUCTOR', mode);
  const clips = (await startBackchannelClips({} as never, {} as never, () => 'ferni', pcm))!;
  const played = [
    clips.live.playClip('Mm-hmm'),
    (vi.advanceTimersByTime(400), clips.openerClip('Mm')),
    (vi.advanceTimersByTime(500), clips.live.playClip('[laughter]')),
  ];
  return { clips, played };
}

describe('clip player with SOUND_CONDUCTOR', () => {
  beforeEach(() => {
    direct.played = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('off (default): a backchannel, opener and laugh inside 0.9 s all play, as today', async () => {
    const { played } = await pileUp();
    expect(played).toEqual([true, true, true]);
    expect(direct.played).toEqual(['Mm-hmm', 'Mm', '[laughter]']);
  });

  it('shadow: the same pile-up still plays every sound', async () => {
    const { played } = await pileUp('shadow');
    expect(played).toEqual([true, true, true]);
    expect(direct.played).toEqual(['Mm-hmm', 'Mm', '[laughter]']);
  });

  it('on: the pile-up is one sound, and the next turn edge plays again', async () => {
    const { clips, played } = await pileUp('on');
    expect(played).toEqual([true, false, false]);
    expect(direct.played).toEqual(['Mm-hmm']);
    vi.advanceTimersByTime(1_100);
    expect(clips.slowTurnClip('Hmm')).toBe(false); // the same sound as the "Mm-hmm" 2 s ago
    expect(clips.openerClip('Yeah')).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(clips.live.playClip('Mm-hmm')).toBe(false); // the same clip inside 60 s
    expect(direct.played).toEqual(['Mm-hmm', 'Yeah']);
  });

  it('on: the voiced tool hum asks the same conductor', async () => {
    vi.stubEnv('VOICED_PRESENCE', 'on');
    vi.stubEnv('SOUND_CONDUCTOR', 'on');
    const session = { on: () => {}, off: () => {}, userData: {} };
    const clips = (await startBackchannelClips({} as never, session as never, () => 'ferni', pcm))!;
    const hum = voicedHumFor(session)!;
    expect(clips.live.playClip('Yeah')).toBe(true);
    vi.advanceTimersByTime(500);
    const take = hum.next()!;
    expect(hum.play(take, 0.35)).toBe(false);
    vi.advanceTimersByTime(1_500);
    expect(hum.play(take, 0.35)).toBe(true);
    expect(direct.played).toHaveLength(2);
    await clips.close();
  });
});
