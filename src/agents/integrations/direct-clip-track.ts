/**
 * A side track for reaction clips ("mm-hmm", a laugh, the turn-opening "Mm")
 * with no mixer in front of it: 10 ms frames go straight into an AudioSource
 * that holds ~50 ms of silence while idle, and a clip's frames the moment it
 * plays.
 *
 * The BackgroundAudioPlayer path queues ahead of every clip: its AudioMixer
 * works in 100 ms blocks and its AudioSource holds 400 ms. A clip reached the
 * wire 640-688 ms after play() (rtc-node, n=8, 2026-10-10), and in dev evals
 * 82% of mid-turn backchannels started after the caller was talking again.
 * Without the mixer the same measurement is ~56 ms, short enough to land a
 * backchannel inside a 450 ms pause and to cut one short when the caller
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
/** Source capacity: up to this much of a clip is queued, a cushion against stalls. */
export const DIRECT_CAPACITY_MS = 400;
/** Silence kept queued while idle: all a new clip waits behind. */
export const IDLE_QUEUE_MS = 50;
const IDLE_POLL_MS = 5;
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
  /** The clip being played, all its frames, and how many went to the source. */
  private frames: Int16Array[] = [];
  private sent = 0;
  /** Wall clock when the last clip frame queued so far finishes playing. */
  private clipEndsAt = 0;
  private current: {
    label: string;
    playedAt: number;
    pauseStartedAt?: number;
    wired: boolean;
  } | null = null;
  private lastWire: number | null = null;
  private readonly cleanups: Array<() => void> = [];
  private closed = false;
  private pump: Promise<void> | null = null;
  private publication: LocalTrackPublication | null = null;
  private room: Room | null = null;

  constructor(
    private readonly onWire: (wire: ClipWire) => void = () => {},
    private readonly source: AudioSource = new AudioSource(RATE, 1, DIRECT_CAPACITY_MS),
    private readonly idleQueueMs = IDLE_QUEUE_MS
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

  /** True while a clip has frames left to send or audio still queued to play. */
  get playing(): boolean {
    return this.sent < this.frames.length || Date.now() < this.clipEndsAt;
  }

  /** The last clip's measured play()-to-wire time, or null before the first. */
  get lastWireMs(): number | null {
    return this.lastWire;
  }

  /**
   * Queue a clip; false when closed, empty, or another clip is still playing.
   * `pauseStartedAt` (wall clock) is the caller's pause onset, for the log.
   */
  play(pcm: ArrayBuffer, volume: number, label: string, pauseStartedAt?: number): boolean {
    if (this.closed || this.playing) return false;
    const frames = clipFrames(pcm, volume);
    if (frames.length === 0) return false;
    this.frames = frames;
    this.sent = 0;
    this.current = { label, playedAt: performance.now(), pauseStartedAt, wired: false };
    return true;
  }

  /** Run `fn` on close(). */
  onClose(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /**
   * The caller carried on: cut a clip played under `windowMs` ago. Its start
   * has usually been heard already, so the queued audio is dropped and the
   * clip fades out from about where playout is, rather than stopping dead.
   * True if cut.
   */
  cancelIfFresh(windowMs = CANCEL_WINDOW_MS): boolean {
    if (!this.playing || !this.current) return false;
    if (performance.now() - this.current.playedAt > windowMs) return false;
    const queued = Math.min(this.sent, Math.round(this.source.queuedDuration / 10));
    const at = this.sent - queued;
    this.source.clearQueue();
    const tail = this.frames.slice(at, at + FADE_FRAMES).map((f, k) => {
      const out = new Int16Array(f.length);
      for (let j = 0; j < f.length; j++) {
        const g = 1 - (k * f.length + j) / (FADE_FRAMES * f.length);
        out[j] = Math.round(f[j] * g);
      }
      return out;
    });
    this.frames = tail;
    this.sent = 0;
    this.clipEndsAt = 0;
    return true;
  }

  stop(): void {
    this.frames = [];
    this.sent = 0;
    this.clipEndsAt = 0;
  }

  /**
   * Clip frames go in as fast as the source takes them, up to its 400 ms
   * capacity, so an event-loop stall mid-clip plays out of the queue instead
   * of leaving a gap in the "mm-hmm". Idle, silence is topped up only to
   * `idleQueueMs`, so a new clip waits behind that little and no more.
   */
  private async run(): Promise<void> {
    const silent = new Int16Array(FRAME);
    while (!this.closed) {
      const clip = this.sent < this.frames.length ? this.frames[this.sent] : undefined;
      if (clip === undefined && this.source.queuedDuration >= this.idleQueueMs) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, IDLE_POLL_MS);
        });
        continue;
      }
      const cur = this.current;
      if (clip !== undefined && cur && !cur.wired) {
        cur.wired = true;
        const queuedAheadMs = this.source.queuedDuration;
        const playToWireMs = performance.now() - cur.playedAt + queuedAheadMs;
        const wireAt = Date.now() + queuedAheadMs;
        this.lastWire = playToWireMs;
        this.onWire({
          label: cur.label,
          playToWireMs,
          queuedAheadMs,
          wireAt,
          pauseToWireMs: cur.pauseStartedAt === undefined ? undefined : wireAt - cur.pauseStartedAt,
        });
      }
      if (clip !== undefined) this.sent++;
      try {
        await this.source.captureFrame(new AudioFrame(clip ?? silent, RATE, 1, FRAME));
      } catch {
        break;
      }
      if (clip !== undefined) this.clipEndsAt = Date.now() + this.source.queuedDuration;
    }
  }

  /** Never rejects: it runs from session cleanup, often after the room is gone. */
  async close(): Promise<void> {
    this.closed = true;
    this.stop();
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
