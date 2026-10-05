// Mix a converse.mjs recording into one file to listen to: the scripted user
// and every agent track (reply voice, backchannel/opening clips), each placed
// at the time it started.
//
// usage: node mix.mjs <run.json> [out.wav]
import { readFileSync, writeFileSync } from 'node:fs';

const RATE = 24000;
const [runFile, outFile = runFile.replace(/\.json$/, '.mix.wav')] = process.argv.slice(2);
const run = JSON.parse(readFileSync(runFile, 'utf8'));

function readWav(file) {
  const buf = readFileSync(file);
  const rate = buf.readUInt32LE(24);
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) >> 1);
  if (rate === RATE) return pcm;
  // 48 kHz mic: average sample pairs down to 24 kHz.
  const out = new Int16Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = (pcm[2 * i] + pcm[2 * i + 1]) >> 1;
  return out;
}

const parts = [{ pcm: readWav(run.mic.file), startT: run.mic.startT, gain: 0.8 }];
for (const t of run.tracks) if (t.startT !== null) parts.push({ pcm: readWav(t.file), startT: t.startT, gain: 1 });

const t0 = Math.min(...parts.map((p) => p.startT));
const length = Math.max(...parts.map((p) => Math.round(((p.startT - t0) / 1000) * RATE) + p.pcm.length));
const mix = new Float32Array(length);
for (const p of parts) {
  const at = Math.round(((p.startT - t0) / 1000) * RATE);
  for (let i = 0; i < p.pcm.length; i++) mix[at + i] += p.pcm[i] * p.gain;
}
const out = new Int16Array(length);
for (let i = 0; i < length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(mix[i])));

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + out.byteLength, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(out.byteLength, 40);
writeFileSync(outFile, Buffer.concat([header, Buffer.from(out.buffer)]));
console.log(`${outFile} (${(length / RATE).toFixed(1)} s, ${parts.length} tracks)`);
