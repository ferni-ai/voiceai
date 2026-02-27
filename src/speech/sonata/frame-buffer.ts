/**
 * Frame buffer for accumulating PCM audio into fixed-size frames.
 *
 * The Sonata STT engine expects exactly 1920 samples per frame (80ms at 24kHz).
 * This buffer collects incoming audio and yields complete frames.
 */

import { SONATA_FRAME_SIZE } from './voice-config.js';

export class FrameBuffer {
  private buffer: Float32Array;
  private writePos = 0;
  private readonly frameSize: number;

  constructor(frameSize: number = SONATA_FRAME_SIZE) {
    this.frameSize = frameSize;
    this.buffer = new Float32Array(frameSize * 4); // Pre-allocate for 4 frames
  }

  /**
   * Add PCM samples to the buffer.
   * Returns an array of complete frames ready for processing.
   */
  push(samples: Float32Array): Float32Array[] {
    const frames: Float32Array[] = [];

    // Ensure buffer has enough space
    const needed = this.writePos + samples.length;
    if (needed > this.buffer.length) {
      const newBuf = new Float32Array(needed + this.frameSize * 4);
      newBuf.set(this.buffer.subarray(0, this.writePos));
      this.buffer = newBuf;
    }

    this.buffer.set(samples, this.writePos);
    this.writePos += samples.length;

    // Extract complete frames
    while (this.writePos >= this.frameSize) {
      frames.push(this.buffer.slice(0, this.frameSize));
      // Shift remaining data
      this.buffer.copyWithin(0, this.frameSize, this.writePos);
      this.writePos -= this.frameSize;
    }

    return frames;
  }

  /** Number of samples currently buffered (incomplete frame). */
  get pending(): number {
    return this.writePos;
  }

  /** Clear the buffer. */
  reset(): void {
    this.writePos = 0;
  }
}
