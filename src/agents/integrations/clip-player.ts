/**
 * Plays short pre-rendered voice clips ("mm-hm", "yeah") on their own track.
 *
 * A backchannel spoken through the agent's TTS becomes an agent turn: it
 * enters the chat history, flips the agent to "speaking", and takes a TTS
 * round trip. A cached clip on a side track does none of that and starts in
 * milliseconds. Clips come from the conversational audio cache (24 kHz PCM in
 * the persona's voice, rendered at worker warmup); the mixer runs at 48 kHz.
 *
 * @module agents/integrations/clip-player
 */

import { voice } from '@livekit/agents';
import { AudioFrame, AudioResampler, type Room } from '@livekit/rtc-node';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ClipPlayer' });

const CLIP_RATE = 24000;
const MIX_RATE = 48000;
const FRAME_SAMPLES = CLIP_RATE / 100; // 10 ms

/** 24 kHz mono s16le PCM → 48 kHz frames for the mixer. */
export async function* pcmToFrames(pcm: ArrayBuffer): AsyncGenerator<AudioFrame> {
  const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const resampler = new AudioResampler(CLIP_RATE, MIX_RATE, 1);
  for (let i = 0; i < samples.length; i += FRAME_SAMPLES) {
    const chunk = samples.slice(i, i + FRAME_SAMPLES);
    const frame = new AudioFrame(chunk, CLIP_RATE, 1, chunk.length);
    for (const out of resampler.push(frame)) yield out;
  }
  for (const out of resampler.flush()) yield out;
}

export class ClipPlayer {
  private readonly player = new voice.BackgroundAudioPlayer();
  private started = false;
  private current: voice.PlayHandle | null = null;

  async start(room: Room, session: voice.AgentSession): Promise<void> {
    await this.player.start({ room, agentSession: session });
    this.started = true;
  }

  /** True while a clip is still playing. */
  get playing(): boolean {
    return this.current !== null && !this.current.done();
  }

  /** Play one clip; returns false when not started or another clip is playing. */
  play(pcm: ArrayBuffer, volume = 1): boolean {
    if (!this.started || this.playing) return false;
    try {
      this.current = this.player.play({ source: pcmToFrames(pcm), volume });
      return true;
    } catch (error) {
      log.warn({ error: String(error) }, 'clip playback failed');
      return false;
    }
  }

  stop(): void {
    this.current?.stop();
  }

  async close(): Promise<void> {
    this.started = false;
    await this.player.close();
  }
}

/** Backchannels are softer than speech. */
const BACKCHANNEL_VOLUME = 0.75;

/**
 * Start a clip player for a session's backchannels. Returns the `playClip`
 * callback for live backchanneling, or null when BACKCHANNEL_CLIPS=off or the
 * track could not be published (callers fall back to spoken backchannels).
 */
export async function startBackchannelClips(
  room: Room,
  session: voice.AgentSession,
  personaId: () => string,
  getClip: (text: string, personaId: string) => ArrayBuffer | null
): Promise<{
  playClip: (text: string) => boolean;
  lastPlayedAt: () => number;
  close: () => Promise<void>;
} | null> {
  if (process.env.BACKCHANNEL_CLIPS === 'off') return null;
  const player = new ClipPlayer();
  try {
    await player.start(room, session);
  } catch (error) {
    log.warn({ error: String(error) }, 'clip player failed to start');
    return null;
  }
  let lastPlayedAt = 0;
  return {
    playClip: (text) => {
      const pcm = getClip(text, personaId());
      if (pcm === null || !player.play(pcm, BACKCHANNEL_VOLUME)) return false;
      lastPlayedAt = Date.now();
      return true;
    },
    lastPlayedAt: () => lastPlayedAt,
    close: async () => player.close(),
  };
}
