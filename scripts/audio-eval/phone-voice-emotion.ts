/**
 * Does Ferni read a phone caller's voice as well as an app caller's?
 *
 * Splits recordings into utterances, passes each through a phone channel
 * (8 kHz mu-law round trip, optionally the 300-3400 Hz PSTN band), and runs
 * the per-turn voice analyzer (AudioProsodyAnalyzer, as the final-transcript
 * observer does) and the Speech Director's caller-prosody reading on the clean
 * and phone versions. Reports confidence, agreement with the clean reading and
 * pitch error per channel.
 *
 * usage: npx tsx scripts/audio-eval/phone-voice-emotion.ts <file.wav> [...]
 *   e.g. scripts/voice-eval/out/*.mic.wav. USE_NATIVE_AUDIO=false measures
 *   the JavaScript analyzer. The native module must be built from the current
 *   source (cd apps/rust-audio && npx napi build --platform --release): an
 *   older binary reads pitch 0 on every frame.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioProsodyAnalyzer } from '../../src/speech/audio-prosody/analyzer.js';
import { readCallerProsody } from '../../src/speech/audio-prosody/caller-prosody.js';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: phone-voice-emotion.ts <file.wav> [...]');
  process.exit(2);
}
const work = mkdtempSync(join(tmpdir(), 'phone-voice-'));
let tmpN = 0;

/** 16 kHz mono PCM; through the phone channel first when `filter` is set ('' = no band filter). */
function decode(file: string, filter: string | null): Int16Array {
  let src = file;
  if (filter !== null) {
    src = join(work, `p${tmpN++}.wav`);
    execFileSync('ffmpeg', [
      ...['-loglevel', 'error', '-y', '-i', file, '-af', filter || 'anull'],
      ...['-ar', '8000', '-ac', '1', '-c:a', 'pcm_mulaw', src],
    ]);
  }
  const b = execFileSync(
    'ffmpeg',
    ['-loglevel', 'error', '-i', src, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'],
    { maxBuffer: 1 << 28 }
  );
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1).slice();
}

/** Utterances: runs above -40 dBFS split by 700 ms of quiet, with 1.5 s of voice or more. */
function utterances(x: Int16Array): Array<[number, number]> {
  const F = 320;
  const out: Array<[number, number]> = [];
  let start = -1;
  let silent = 0;
  let voiced = 0;
  for (let i = 0; i + F <= x.length; i += F) {
    let s = 0;
    for (let j = i; j < i + F; j++) s += x[j] * x[j];
    const db = 20 * Math.log10(Math.sqrt(s / F) / 32768 + 1e-9);
    if (db > -40) {
      if (start < 0) start = i;
      silent = 0;
      voiced += 20;
    } else if (start >= 0 && (silent += 20) >= 700) {
      if (voiced >= 1500) out.push([start, i]);
      start = -1;
      voiced = 0;
      silent = 0;
    }
  }
  return out;
}

// The analyzers timestamp frames with Date.now(): advance a clock 10 ms per frame.
let clock = 1_700_000_000_000;
Date.now = () => clock;
let session = 0;

function read(x: Int16Array) {
  const id = `phone-eval-${session++}`;
  const analyzer = new AudioProsodyAnalyzer(id);
  for (let i = 0; i + 160 <= x.length; i += 160) {
    clock += 10;
    // A copy per frame: LiveKit frames own their buffer, and the native
    // binding reads from the start of it.
    const data = x.slice(i, i + 160);
    analyzer.processAudioFrame({ data, sampleRate: 16000, channels: 1, samplesPerChannel: 160 } as never);
  }
  const r = analyzer.analyze();
  return {
    emotion: r?.primary,
    confidence: r?.confidence ?? 0,
    pitch: r?.prosody.pitchMean ?? 0,
    caller: readCallerProsody(id),
  };
}

const channels: Record<string, string | null> = {
  clean: null,
  'ulaw-8k': '',
  'pstn-300-3400': 'highpass=f=300,lowpass=f=3400',
};
const rows: Record<string, Array<ReturnType<typeof read>>> = {};
for (const f of files) {
  const clean = decode(f, null);
  const spans = utterances(clean);
  for (const [name, filter] of Object.entries(channels)) {
    const x = filter === null ? clean : decode(f, filter);
    rows[name] ??= [];
    for (const [s, e] of spans) rows[name].push(read(x.subarray(s, Math.min(e, x.length))));
  }
}

const n = rows.clean.length;
const report: Record<string, unknown> = {
  native: process.env.USE_NATIVE_AUDIO !== 'false',
  utterances: n,
};
for (const [name, r] of Object.entries(rows)) {
  const pitchErr = r
    .map((v, i) => Math.abs(v.pitch - rows.clean[i].pitch) / (rows.clean[i].pitch || 1))
    .sort((a, b) => a - b);
  const count = (pred: (v: (typeof r)[number], i: number) => boolean) => r.filter(pred).length;
  report[name] = {
    meanConfidence: +(r.reduce((a, v) => a + v.confidence, 0) / n).toFixed(3),
    zeroConfidence: count((v) => v.confidence === 0),
    confidenceOver05: count((v) => v.confidence > 0.5),
    emotionSameAsClean: `${count((v, i) => v.emotion === rows.clean[i].emotion)}/${n}`,
    medianPitchError: +pitchErr[n >> 1].toFixed(3),
    callerProsodyReadings: `${count((v) => v.caller !== undefined)}/${n}`,
    emotions: Object.fromEntries(
      [...new Set(r.map((v) => v.emotion))].map((e) => [e, count((v) => v.emotion === e)])
    ),
  };
}
console.log(JSON.stringify(report, null, 1));
process.exit(0);
