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
import { synthHum, synthSnore, synthWhistle } from './presence-sounds.js';
import {
  createPresenceWatcher,
  LONG_QUIET,
  presenceHumEnabled,
  presenceSnoreEnabled,
  presenceSoundsEnabled,
} from './presence-watcher.js';
import { startToolHum } from './tool-hum.js';

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

/**
 * Endless silence at mixer rate. The SDK's AudioMixer (rtc-node) ends itself
 * once its last stream is removed, and later play() calls then fail inside a
 * background task while still returning a handle: only the first clip of a
 * session was ever heard (measured 2026-09-28). A silent stream that never
 * ends keeps the mixer open.
 */
export async function* silence(): AsyncGenerator<AudioFrame> {
  const samples = MIX_RATE / 10; // 100 ms, the mixer's block
  for (;;) yield new AudioFrame(new Int16Array(samples), MIX_RATE, 1, samples);
}

export class ClipPlayer {
  private readonly player = new voice.BackgroundAudioPlayer();
  private started = false;
  private current: voice.PlayHandle | null = null;

  async start(room: Room, session: voice.AgentSession): Promise<void> {
    await this.player.start({ room, agentSession: session });
    this.player.play({ source: silence() });
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

  /**
   * Never rejects: it runs from session cleanup, where a rejection reached the
   * global unhandled-rejection handler. At hang-up the room often goes first:
   * a disconnected room aborts the track unpublish ("This operation was
   * aborted") or has already dropped the track ("track not found").
   */
  async close(): Promise<void> {
    this.started = false;
    try {
      await this.player.close();
    } catch (error) {
      const roomGone =
        (error as { name?: string })?.name === 'AbortError' ||
        String(error).includes('track not found');
      if (roomGone)
        log.debug({ error: String(error) }, 'clip player closed after the room went away');
      else log.warn({ error: String(error) }, 'clip player close failed');
    }
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
  const stopPresence = startPresenceSounds(session, player);
  const stopToolHum = startToolHum(session, player);
  return {
    playClip: (text) => {
      const pcm = getClip(text, personaId());
      if (pcm === null || !player.play(pcm, BACKCHANNEL_VOLUME)) return false;
      lastPlayedAt = Date.now();
      return true;
    },
    lastPlayedAt: () => lastPlayedAt,
    close: async () => {
      stopPresence();
      stopToolHum();
      await player.close();
    },
  };
}

/** A whistle or hum is heard in the room, not said to them: quieter than a backchannel. */
const WHISTLE_VOLUME = 0.5;

/**
 * Sounds of him being there in a silence (presence-watcher.ts), on the same
 * track as the backchannels: a whistle (or, with PRESENCE_HUM, a hum) in an
 * easy pause, and with PRESENCE_SNORE a mock snore in a long quiet. Returns
 * the cleanup; a no-op unless PRESENCE_SOUNDS=on.
 */
function startPresenceSounds(session: voice.AgentSession, player: ClipPlayer): () => void {
  if (!presenceSoundsEnabled()) return () => {};
  const mood = () =>
    (session.userData as { voiceEmotion?: { primary?: string } } | undefined)?.voiceEmotion
      ?.primary;
  const playing = (kind: string, pcm: ArrayBuffer): boolean => {
    const ok = player.play(pcm, WHISTLE_VOLUME);
    if (ok) log.info({ kind }, `PRESENCE_SOUND ${kind}`);
    return ok;
  };
  const stop = () => player.stop();
  const watchers = [
    createPresenceWatcher({
      play: () =>
        presenceHumEnabled() && Math.random() < 0.5
          ? playing('hum', synthHum())
          : playing('whistle', synthWhistle()),
      stop,
      mood,
    }),
  ];
  if (presenceSnoreEnabled()) {
    watchers.push(
      createPresenceWatcher({ play: () => playing('snore', synthSnore()), stop, mood }, LONG_QUIET)
    );
  }
  const onAgent = (ev: { newState?: string }) =>
    watchers.forEach((w) => w.onAgentState(ev.newState ?? ''));
  const onUser = (ev: { newState?: string }) =>
    watchers.forEach((w) => w.onUserState(ev.newState ?? ''));
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
  session.on(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  return () => {
    watchers.forEach((w) => w.close());
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
    session.off(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  };
}
