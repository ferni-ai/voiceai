// Mix a converse.mjs recording's tracks into one WAV: the scripted caller (run.mic) and every
// agent track (reply voice, backchannel and opening clips), each placed at the time it started.
// Mono for listening (mix.mjs); stereo, caller left and agent right, for the audio judge
// (audio-judge.mjs), so it can tell who is speaking.
import { readFileSync } from 'node:fs';

export const MIX_RATE = 24000;

/** 16-bit PCM from a converse.mjs WAV, at MIX_RATE (the 48 kHz mic is averaged down). */
export function readWavAt24k(file, read = readFileSync) {
  const buf = read(file);
  const rate = buf.readUInt32LE(24);
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) >> 1);
  if (rate === MIX_RATE) return pcm;
  const out = new Int16Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = (pcm[2 * i] + pcm[2 * i + 1]) >> 1;
  return out;
}

/**
 * The run's parts on one clock: { pcm, startT, gain, side } where side is 'caller' or 'agent'.
 * Tracks that never started (startT null) are left out.
 */
export function partsOf(run, readWav = readWavAt24k) {
  const parts = [{ pcm: readWav(run.mic.file), startT: run.mic.startT, gain: 0.8, side: 'caller' }];
  for (const t of run.tracks ?? []) {
    if (t.startT !== null && t.startT !== undefined) {
      parts.push({ pcm: readWav(t.file), startT: t.startT, gain: 1, side: 'agent' });
    }
  }
  return parts;
}

const clip = (x) => Math.max(-32768, Math.min(32767, Math.round(x)));

/** Interleaved 16-bit PCM: one channel (all parts) or two (caller left, agent right). */
export function mixParts(parts, { stereo = false, rate = MIX_RATE } = {}) {
  const t0 = Math.min(...parts.map((p) => p.startT));
  const at = (p) => Math.round(((p.startT - t0) / 1000) * rate);
  const length = Math.max(...parts.map((p) => at(p) + p.pcm.length));
  const channels = stereo ? 2 : 1;
  const mix = new Float32Array(length * channels);
  for (const p of parts) {
    const ch = stereo && p.side === 'agent' ? 1 : 0;
    const start = at(p);
    for (let i = 0; i < p.pcm.length; i++) mix[(start + i) * channels + ch] += p.pcm[i] * p.gain;
  }
  return { pcm: Int16Array.from(mix, clip), channels, seconds: length / rate };
}

/** A WAV file's bytes for interleaved 16-bit PCM. */
export function wavBytes(pcm, { channels = 1, rate = MIX_RATE } = {}) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2 * channels, 28);
  header.writeUInt16LE(2 * channels, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}
