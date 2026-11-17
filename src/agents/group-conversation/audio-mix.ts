/**
 * Pure int16 PCM helpers for mixing several callers into one audio stream.
 *
 * A three-way call feeds one STT stream, so every person's 10 ms frame is
 * summed into a single frame. Sums are clamped to the int16 range: wrapping
 * would turn two loud voices into a burst of noise.
 */

const INT16_MAX = 32767;
const INT16_MIN = -32768;

/** Sums equal-length int16 frames sample by sample, clamped to int16. Always returns a new array. */
export function mixFrames(frames: readonly Int16Array[]): Int16Array {
  const length = frames[0]?.length ?? 0;
  for (const frame of frames) {
    if (frame.length !== length) {
      throw new Error(`mixFrames: frame length ${frame.length} does not match ${length}`);
    }
  }
  const mixed = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const frame of frames) sum += frame[i] ?? 0;
    mixed[i] = sum > INT16_MAX ? INT16_MAX : sum < INT16_MIN ? INT16_MIN : sum;
  }
  return mixed;
}

/** Root-mean-square level of a frame, in int16 units (0 for silence or an empty frame). */
export function frameRms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  return Math.sqrt(sumOfSquares / samples.length);
}
