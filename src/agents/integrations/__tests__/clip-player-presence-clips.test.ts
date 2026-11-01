/**
 * PRESENCE_SOUND_ASSETS through the real presence path: with it on, the
 * whistle and the snore Ferni plays in a silence are the recorded clips; with
 * it off, the synthesized ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const watchers = vi.hoisted(() => [] as Array<{ play: () => boolean }>);

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
vi.mock('../presence-watcher.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../presence-watcher.js')>();
  return {
    ...actual,
    createPresenceWatcher: (deps: { play: () => boolean }) => {
      watchers.push(deps);
      return { onAgentState: () => {}, onUserState: () => {}, close: () => {} };
    },
  };
});

const { ClipPlayer, startBackchannelClips } = await import('../clip-player.js');
const { loadPresenceClips, presenceClipDirs } = await import('../presence-clips.js');
const { synthHum } = await import('../presence-sounds.js');

const FLAGS = ['PRESENCE_SOUNDS', 'PRESENCE_SNORE', 'VOICED_PRESENCE', 'PRESENCE_SOUND_ASSETS'];

/** The PCM each presence watcher plays: [whistle, snore]. */
async function played(): Promise<Buffer[]> {
  const play = vi.spyOn(ClipPlayer.prototype, 'play');
  const session = { on: vi.fn(), off: vi.fn(), userData: {} };
  const clips = await startBackchannelClips(
    {} as never,
    session as never,
    () => 'ferni',
    () => null
  );
  expect(watchers).toHaveLength(2);
  const out = watchers.map((w) => {
    play.mockClear();
    expect(w.play()).toBe(true);
    return Buffer.from(play.mock.calls[0]![0]);
  });
  await clips?.close();
  return out;
}

const isOneOf = (pcm: Buffer, clips: ArrayBuffer[]) =>
  clips.some((c) => Buffer.from(c).equals(pcm));

describe('presence clips in the clip player', () => {
  const saved = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));
  beforeEach(() => {
    watchers.length = 0;
    process.env.PRESENCE_SOUNDS = 'on';
    process.env.PRESENCE_SNORE = 'on';
    // At or over 0.5 the easy-silence watcher whistles; under it, it hums.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    process.env.VOICED_PRESENCE = 'off';
  });
  afterEach(() => {
    for (const k of FLAGS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  const whistles = loadPresenceClips(presenceClipDirs('whistles'));
  const snores = loadPresenceClips(presenceClipDirs('snores'));

  it('plays a recorded whistle and snore with PRESENCE_SOUND_ASSETS=on', async () => {
    process.env.PRESENCE_SOUND_ASSETS = 'on';
    const [whistle, snore] = await played();
    expect(isOneOf(whistle!, whistles)).toBe(true);
    expect(isOneOf(snore!, snores)).toBe(true);
  });

  it('hums instead of whistling on a draw under 0.5', async () => {
    delete process.env.PRESENCE_SOUND_ASSETS;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const [hum] = await played();
    expect(hum!.equals(Buffer.from(synthHum()))).toBe(true);
  });

  it('plays the synthesized whistle and snore with it off', async () => {
    delete process.env.PRESENCE_SOUND_ASSETS;
    const [whistle, snore] = await played();
    expect(whistle!.length).toBeGreaterThan(0);
    expect(isOneOf(whistle!, whistles)).toBe(false);
    expect(snore!.length).toBeGreaterThan(0);
    expect(isOneOf(snore!, snores)).toBe(false);
  });
});
