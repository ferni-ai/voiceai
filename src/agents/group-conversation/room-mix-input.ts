/**
 * One audio input for the agent session that carries every person on the call.
 *
 * The session has a single STT stream. On a three-way call each human has their
 * own track, so this input mixes them: the owner's track is the clock. On every
 * owner frame it takes the oldest queued frame from each guest (silence if there
 * is none), sums them, notes each person's level in the talker ledger, and emits
 * the mixed frame. A guest is never waited on, so a slow or broken phone leg can
 * never delay or stop the owner's audio.
 *
 * Tracks must already be in the mix format (16 kHz mono, 10 ms frames); the
 * caller reads each one with `AudioStream` and its own noise cancellation.
 */
import { voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import {
  ReadableStream,
  type ReadableStreamDefaultController,
  type ReadableStreamDefaultReader,
} from 'node:stream/web';
import { createLogger } from '../../utils/safe-logger.js';
import { frameRms, mixFrames } from './audio-mix.js';
import type { TalkerLedger } from './talker-ledger.js';

const log = createLogger({ module: 'RoomMixInput' });

export const MIX_SAMPLE_RATE = 16_000;
/** 10 ms at 16 kHz mono. */
export const MIX_SAMPLES_PER_FRAME = 160;
/** A guest's frames waiting for the next owner frame: 50 ms. When full, the oldest is dropped. */
export const GUEST_QUEUE_FRAMES = 5;

interface Track {
  reader: ReadableStreamDefaultReader<AudioFrame>;
  /** Guest frames not yet mixed, oldest first. Unused for the owner. */
  queue: AudioFrame[];
  warnedFrameSize: boolean;
}

export class RoomMixInput extends voice.AudioInput {
  private readonly tracks = new Map<string, Track>();
  private readonly mixed: ReadableStreamDefaultController<AudioFrame>;
  private attached = true;
  private closed = false;

  constructor(
    private readonly owner: string,
    private readonly ledger: TalkerLedger
  ) {
    super();
    let controller: ReadableStreamDefaultController<AudioFrame> | undefined;
    const mixedStream = new ReadableStream<AudioFrame>({
      start: (c) => {
        controller = c;
      },
    });
    if (!controller) throw new Error('RoomMixInput: mixed stream did not start');
    this.mixed = controller;
    this.multiStream.addInputStream(mixedStream);
  }

  /** People other than the owner whose tracks are in the mix. */
  get guests(): string[] {
    return [...this.tracks.keys()].filter((identity) => identity !== this.owner);
  }

  /**
   * Adds a person's frames to the mix. The owner's frames drive the mix; anyone
   * else's are queued. Adding an identity that is already in the mix replaces
   * its track (an owner reconnecting, say).
   */
  addTrack(identity: string, frames: ReadableStream<AudioFrame>): void {
    if (this.closed) {
      log.warn({ identity }, 'Room mix is closed, track not added');
      return;
    }
    this.removeTrack(identity);
    const track: Track = { reader: frames.getReader(), queue: [], warnedFrameSize: false };
    this.tracks.set(identity, track);
    void this.readTrack(identity, track);
  }

  /** Takes a person out of the mix and stops reading their track. */
  removeTrack(identity: string): void {
    const track = this.tracks.get(identity);
    if (!track) return;
    this.tracks.delete(identity);
    track.reader.cancel().catch((error: unknown) => {
      log.warn({ identity, error: String(error) }, 'Room mix could not cancel a removed track');
    });
  }

  override setAttached(attached: boolean): void {
    this.attached = attached;
  }

  override async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      for (const identity of [...this.tracks.keys()]) this.removeTrack(identity);
      this.mixed.close();
    }
    await super.close();
  }

  private async readTrack(identity: string, track: Track): Promise<void> {
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- a track's frames are read one at a time, in order
        const { done, value } = await track.reader.read();
        if (done || this.tracks.get(identity) !== track) return;
        if (identity === this.owner) this.mixOn(value);
        else this.queueGuestFrame(track, value);
      }
    } catch (error) {
      if (this.tracks.get(identity) === track) {
        log.warn({ identity, error: String(error) }, 'Room mix track failed, treating it as ended');
      }
    } finally {
      // A track that ends is gone from the mix: from now on that person is silence.
      if (this.tracks.get(identity) === track) this.tracks.delete(identity);
    }
  }

  private queueGuestFrame(track: Track, frame: AudioFrame): void {
    track.queue.push(frame);
    if (track.queue.length > GUEST_QUEUE_FRAMES) track.queue.shift();
  }

  private mixOn(ownerFrame: AudioFrame): void {
    const atMs = Date.now();
    const parts: Int16Array[] = [ownerFrame.data];
    this.ledger.note(this.owner, atMs, frameRms(ownerFrame.data));
    for (const [identity, track] of this.tracks) {
      if (identity === this.owner) continue;
      const frame = track.queue.shift();
      const fits = frame !== undefined && frame.data.length === ownerFrame.data.length;
      if (frame && !fits && !track.warnedFrameSize) {
        track.warnedFrameSize = true;
        log.warn(
          { identity, guestSamples: frame.data.length, ownerSamples: ownerFrame.data.length },
          'Room mix guest frame size differs from the owner, mixing it as silence'
        );
      }
      this.ledger.note(identity, atMs, fits ? frameRms(frame.data) : 0);
      if (fits) parts.push(frame.data);
    }
    if (!this.attached || this.closed) return;
    this.mixed.enqueue(
      new AudioFrame(
        mixFrames(parts),
        ownerFrame.sampleRate,
        ownerFrame.channels,
        ownerFrame.samplesPerChannel
      )
    );
  }
}
