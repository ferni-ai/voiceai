/**
 * Trim the silence Sonic puts in front of a reply.
 *
 * Measured 2026-10-10 on Ferni's voice through the reply stream (12 replies):
 * the first chunk is 154 ms of audio, of which the first 45-145 ms (median
 * ~110 ms) is below |32| of 32767 (-60 dBFS). The gateway marks first audio
 * on that chunk, so every reply's "first audio" was ~0.1 s of silence before
 * the first word, on top of everything else the caller waits for.
 *
 * This drops the leading quiet of a reply's first context, keeping
 * LEAD_KEEP_MS before the onset so a soft consonant isn't clipped. It gives up
 * (passes the rest through) after MAX_TRIM_MS: a reply that starts with a
 * long quiet breath keeps it. CASCADE_TRIM_LEAD_SILENCE=on turns it on.
 *
 * @module speech/tts-gateway/lead-silence
 */

/** |sample| below this (s16) is silence: about -60 dBFS. */
export const LEAD_THRESHOLD = 32;
/** Quiet kept in front of the first sound. */
export const LEAD_KEEP_MS = 10;
/** Never trim more than this. */
export const MAX_TRIM_MS = 300;

export function leadSilenceTrimEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CASCADE_TRIM_LEAD_SILENCE === 'on';
}

/**
 * Pass s16le mono PCM chunks through, minus the leading silence. `trimmed`
 * reports how many ms were dropped once the first sound (or the cap) is reached.
 */
export async function* trimLeadingSilence(
  chunks: AsyncIterable<ArrayBuffer>,
  sampleRate = 24000,
  trimmed: (ms: number) => void = () => undefined
): AsyncGenerator<ArrayBuffer> {
  const keep = Math.round((LEAD_KEEP_MS * sampleRate) / 1000);
  const cap = Math.round((MAX_TRIM_MS * sampleRate) / 1000);
  let dropped = 0; // samples of silence dropped so far
  let tail = new Int16Array(0); // the last `keep` silent samples, put back before the onset
  let done = false;
  for await (const pcm of chunks) {
    if (done || pcm.byteLength % 2 !== 0) {
      done = true;
      yield pcm;
      continue;
    }
    const samples = new Int16Array(pcm);
    let onset = 0;
    while (onset < samples.length && Math.abs(samples[onset]) < LEAD_THRESHOLD) onset++;
    if (onset === samples.length && dropped + samples.length < cap) {
      // All silence: hold its end back in case the sound starts next chunk.
      const both = new Int16Array(tail.length + samples.length);
      both.set(tail);
      both.set(samples, tail.length);
      tail = both.slice(Math.max(0, both.length - keep));
      dropped += samples.length;
      continue;
    }
    done = true;
    const before = Math.min(onset, keep);
    const fromTail = Math.min(tail.length, keep - before);
    const out = new Int16Array(fromTail + samples.length - (onset - before));
    out.set(tail.subarray(tail.length - fromTail));
    out.set(samples.subarray(onset - before), fromTail);
    trimmed(Math.round(((dropped - fromTail + onset - before) * 1000) / sampleRate));
    yield out.buffer;
  }
}
