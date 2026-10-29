/**
 * AVATAR_LISTEN_SIGNALS=on: each live backchannel or laugh clip that plays
 * sends `backchannel_played { kind, wireDelayMs }` to the client. Off, nothing
 * is sent and live.playClip is the plain player.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataMessageSender } from '../../shared/data-message-envelope.js';

const mixer = vi.hoisted(() => ({ done: true }));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => mixer.done, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});

const { startBackchannelClips } = await import('../clip-player.js');
const { backchannelKind, withBackchannelSignal } = await import('../backchannel-signal.js');
const { LAUGH_CLIP } = await import('../backchannel-policy.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

function fakeRoom() {
  const sent: Array<Record<string, unknown>> = [];
  const room = {
    localParticipant: {
      publishData: async (data: Uint8Array) => {
        sent.push(JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>);
      },
    },
  };
  return { room, sent };
}

describe('backchannel_played', () => {
  beforeEach(() => {
    mixer.done = true;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('names the laugh clip a laugh and every other clip a backchannel', () => {
    expect(backchannelKind(LAUGH_CLIP)).toBe('laugh');
    expect(backchannelKind('Mm-hmm')).toBe('backchannel');
  });

  it('sends only for clips that actually played', async () => {
    const send = vi.fn<DataMessageSender>().mockResolvedValue(undefined);
    let ok = true;
    const play = withBackchannelSignal(
      () => ok,
      send,
      () => 57.4
    );
    expect(play('Mm-hmm')).toBe(true);
    ok = false;
    expect(play(LAUGH_CLIP)).toBe(false);
    expect(send.mock.calls).toEqual([
      ['backchannel_played', { kind: 'backchannel', wireDelayMs: 57, label: 'Mm-hmm' }],
    ]);
  });

  it('on: a live backchannel and a laugh reach the client with the wire delay', async () => {
    vi.stubEnv('AVATAR_LISTEN_SIGNALS', 'on');
    const { room, sent } = fakeRoom();
    const clips = await startBackchannelClips(room as never, {} as never, () => 'ferni', pcm);
    expect(clips!.live.playClip('Mm-hmm')).toBe(true);
    await flush();
    expect(clips!.live.playClip(LAUGH_CLIP)).toBe(true);
    await flush();
    expect(sent).toEqual([
      { type: 'backchannel_played', kind: 'backchannel', wireDelayMs: 650, label: 'Mm-hmm' },
      { type: 'backchannel_played', kind: 'laugh', wireDelayMs: 650, label: 'laughter' },
    ]);
    // The turn-opening clip goes through the top-level playClip: no nod.
    expect(clips!.playClip('Hmm')).toBe(true);
    await flush();
    expect(sent).toHaveLength(2);
  });

  it('on: a clip that could not play (another is playing) sends nothing', async () => {
    vi.stubEnv('AVATAR_LISTEN_SIGNALS', 'on');
    const { room, sent } = fakeRoom();
    const clips = await startBackchannelClips(room as never, {} as never, () => 'ferni', pcm);
    mixer.done = false;
    expect(clips!.live.playClip('Mm-hmm')).toBe(true);
    expect(clips!.live.playClip('Yeah')).toBe(false);
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('off: nothing is sent', async () => {
    const { room, sent } = fakeRoom();
    const clips = await startBackchannelClips(room as never, {} as never, () => 'ferni', pcm);
    expect(clips!.live.playClip('Mm-hmm')).toBe(true);
    await flush();
    expect(sent).toEqual([]);
    expect(clips!.live.playClip).toBe(clips!.playClip);
  });
});
