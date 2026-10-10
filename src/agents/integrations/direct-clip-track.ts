/**
 * A side track for reaction clips ("mm-hmm", a laugh, the turn-opening "Mm")
 * with no mixer in front of it: 10 ms frames go straight into a 50 ms
 * AudioSource queue, silence when idle, a clip's frames the moment it plays.
 *
 * The BackgroundAudioPlayer path queues ahead of every clip: its AudioMixer
 * works in 100 ms blocks and its AudioSource holds 400 ms. A clip reached the
 * wire 640-688 ms after play() (rtc-node, n=8, 2026-10-10), and in dev evals
 * 82% of mid-turn backchannels started after the caller was talking again.
 * Without the mixer the same measurement is ~56 ms, short enough to land a
 * backchannel inside a 450 ms pause and to take one back when the caller
 * carries on (cancelIfFresh).
 *
 * The track name contains "background" so the voice-eval harness counts it as
 * a side track, not as Ferni's reply voice (converse.mjs, score.mjs).
 *
 * @module agents/integrations/direct-clip-track
 */

import { voice } from '@livekit/agents';
import {
  AudioFrame,
  AudioResampler,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  type LocalTrackPublication,
  type Room,
} from '@livekit/rtc-node';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DirectClipTrack' });

const RATE = 48000;
const CLIP_RATE = 24000;
const FRAME = RATE / 100; // 10 ms
const FADE_FRAMES = 2;

export const DIRECT_TRACK_NAME = 'background_reactions';
/** Audio queued in the source: the cushion against event-loop stalls. */
export const DIRECT_QUEUE_MS = 50;
/** A clip the caller talks over within this long of play() is taken back. */
export const CANCEL_WINDOW_MS = 200;

/** REACTION_SIDETRACK=direct: reaction clips play on this track. */
export function reactionSidetrackDirect(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REACTION_SIDETRACK === 'direct';
}

/** When a clip's first frame went out, measured, not estimated. */
export interface ClipWire {
  label: string;
  /** play() to the first frame entering the source, plus the audio queued ahead of it. */
  playToWireMs: number;
  queuedAheadMs: number;
  /** Wall-clock time the first frame reaches the wire. */
  wireAt: number;
  /** From the caller's pause onset (when the caller passed it) to the wire. */
  pauseToWireMs?: number;
}

/** 24 kHz mono s16le clip PCM → 10 ms frames at 48 kHz, scaled by `volume`. */
export function clipFrames(pcm: ArrayBuffer, volume = 1): Int16Array[] {
  const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const resampler = new AudioResampler(CLIP_RATE, RATE, 1);
  const parts: Int16Array[] = [];
  const step = CLIP_RATE / 100;
  for (let i = 0; i < samples.length; i += step) {
    const chunk = samples.slice(i, i + step);
    for (const f of resampler.push(new AudioFrame(chunk, CLIP_RATE, 1, chunk.length)))
      parts.push(f.data);
  }
  for (const f of resampler.flush()) parts.push(f.data);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const frames: Int16Array[] = [];
  const all = new Int16Array(Math.ceil(total / FRAME) * FRAME);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  for (let i = 0; i < all.length; i += FRAME) {
    const f = all.slice(i, i + FRAME);
    if (volume !== 1) for (let j = 0; j < f.length; j++) f[j] = Math.round(f[j] * volume);
    frames.push(f);
  }
  return frames;
}

export class DirectClipTrack {
  private pending: Int16Array[] = [];
  private current: {
    label: string;
    playedAt: number;
    pauseStartedAt?: number;
    wired: boolean;
  } | null = null;
  private readonly cleanups: Array<() => void> = [];
  private closed = false;
  private pump: Promise<void> | null = null;
  private publication: LocalTrackPublication | null = null;
  private room: Room | null = null;

  constructor(
    private readonly onWire: (wire: ClipWire) => void = () => {},
    private readonly source: AudioSource = new AudioSource(RATE, 1, DIRECT_QUEUE_MS)
  ) {}

  /** Publish the track and start feeding it. */
  async publish(room: Room): Promise<void> {
    const participant = room.localParticipant;
    if (!participant) throw new Error('Local participant not available');
    const track = LocalAudioTrack.createAudioTrack(DIRECT_TRACK_NAME, this.source);
    this.publication = await participant.publishTrack(track, new TrackPublishOptions());
    this.room = room;
    this.start();
  }

  /** Start feeding the source (publish() does this). */
  start(): void {
    this.pump ??= this.run();
  }

  /** True while a clip still has frames to send. */
  get playing(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Queue a clip; false when closed, empty, or another clip is still playing.
   * `pauseStartedAt` (wall clock) is the caller's pause onset, for the log.
   */
  play(pcm: ArrayBuffer, volume: number, label: string, pauseStartedAt?: number): boolean {
    if (this.closed || this.playing) return false;
    const frames = clipFrames(pcm, volume);
    if (frames.length === 0) return false;
    this.pending = frames;
    this.current = { label, playedAt: performance.now(), pauseStartedAt, wired: false };
    return true;
  }

  /** Run `fn` on close(). */
  onClose(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /**
   * The caller carried on: drop the rest of a clip played under `windowMs`
   * ago, after a short fade so the cut does not click. True if dropped.
   */
  cancelIfFresh(windowMs = CANCEL_WINDOW_MS): boolean {
    if (!this.playing || !this.current) return false;
    if (performance.now() - this.current.playedAt > windowMs) return false;
    const tail = this.pending.slice(0, FADE_FRAMES).map((f, k) => {
      const out = new Int16Array(f.length);
      for (let j = 0; j < f.length; j++) {
        const g = 1 - (k * f.length + j) / (FADE_FRAMES * f.length);
        out[j] = Math.round(f[j] * g);
      }
      return out;
    });
    this.pending = tail;
    return true;
  }

  stop(): void {
    this.pending = [];
  }

  private async run(): Promise<void> {
    const silent = new Int16Array(FRAME);
    while (!this.closed) {
      const data = this.pending.shift() ?? silent;
      const cur = this.current;
      if (cur && !cur.wired && data !== silent) {
        cur.wired = true;
        const queuedAheadMs = this.source.queuedDuration;
        const playToWireMs = performance.now() - cur.playedAt + queuedAheadMs;
        const wireAt = Date.now() + queuedAheadMs;
        this.onWire({
          label: cur.label,
          playToWireMs,
          queuedAheadMs,
          wireAt,
          pauseToWireMs: cur.pauseStartedAt === undefined ? undefined : wireAt - cur.pauseStartedAt,
        });
      }
      try {
        // Resolves once the queue has room: this is what paces the track.
        await this.source.captureFrame(new AudioFrame(data, RATE, 1, FRAME));
      } catch {
        break;
      }
    }
  }

  /** Never rejects: it runs from session cleanup, often after the room is gone. */
  async close(): Promise<void> {
    this.closed = true;
    this.pending = [];
    for (const fn of this.cleanups.splice(0)) fn();
    await this.pump?.catch(() => undefined);
    try {
      if (this.publication?.sid && this.room?.localParticipant)
        await this.room.localParticipant.unpublishTrack(this.publication.sid);
    } catch {
      // the room went first
    }
    await this.source.close().catch(() => undefined);
  }
}

/**
 * Publish a direct clip track for a session: logs CLIP_WIRE per clip (the
 * measured play-to-wire time, and pause-to-wire when known) and takes a fresh
 * clip back when the caller's VAD says they started talking again. Null when
 * the track could not be published (the caller keeps the mixer path).
 */
export async function startDirectClips(
  room: Room,
  session: voice.AgentSession
): Promise<DirectClipTrack | null> {
  const track = new DirectClipTrack((wire) =>
    log.info(
      {
        clip: wire.label,
        playToWireMs: Math.round(wire.playToWireMs),
        queuedAheadMs: Math.round(wire.queuedAheadMs),
        pauseToWireMs:
          wire.pauseToWireMs === undefined ? undefined : Math.round(wire.pauseToWireMs),
        track: 'direct',
      },
      'CLIP_WIRE'
    )
  );
  try {
    await track.publish(room);
  } catch (error) {
    log.warn({ error: String(error) }, 'direct clip track failed to start');
    await track.close();
    return null;
  }
  const onUser = (ev: { newState?: string }): void => {
    if (ev.newState === 'speaking' && track.cancelIfFresh())
      log.info({ by: 'vad' }, 'CLIP_CANCELLED');
  };
  session.on(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  track.onClose(() => session.off(voice.AgentSessionEventTypes.UserStateChanged, onUser));
  return track;
}
