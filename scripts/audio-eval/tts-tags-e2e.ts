/**
 * Do Sonic's speech tags work end to end through our TTS gateway?
 *
 * Each case streams text into the real gateway TTS node the way a live reply
 * does (in chunks, sometimes splitting a tag), collects the audio, and
 * transcribes it back with Ink-2. A tag works if (1) its text is not spoken
 * ("laughter", "emotion value" must not appear in the transcript) and (2) it
 * changes the audio against the same line without it: duration for speed and
 * breaks, loudness for volume, pitch for emotion, non-speech time for
 * laughter. Writes WAVs plus metrics.json; pitch/loudness are analysed by
 * scripts/audio-eval/tts-tags-analyze.py.
 *
 * usage: npx tsx scripts/audio-eval/tts-tags-e2e.ts <secrets.env> <out-dir> [voiceId]
 *   secrets.env must contain CARTESIA_API_KEY (read, never printed)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import WebSocket from 'ws';

const [secretsFile, outDir, voiceArg] = process.argv.slice(2);
if (!secretsFile || !outDir) {
  console.error('usage: tts-tags-e2e.ts <secrets.env> <out-dir> [voiceId]');
  process.exit(2);
}
const secrets = Object.fromEntries(
  readFileSync(secretsFile, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
process.env.CARTESIA_API_KEY = secrets.CARTESIA_API_KEY;
const voiceId = voiceArg || secrets.FERNI_VOICE_ID;
if (!process.env.CARTESIA_API_KEY || !voiceId) throw new Error('need CARTESIA_API_KEY and a voice id');
mkdirSync(outDir, { recursive: true });

const { createGatewayTTSNode } = await import('../../src/speech/tts-gateway/gateway-tts-node.js');

const LINE = "I really didn't see that coming, that's wild.";
/** name → the text as it streams from the LLM (chunks). */
const CASES: Record<string, string[]> = {
  plain: [LINE],
  'emotion-calm': [`<emotion value="calm"/>${LINE}`],
  'emotion-excited': [`<emotion value="excited"/>${LINE}`],
  'emotion-sad': [`<emotion value="sad"/>${LINE}`],
  'emotion-split-tag': ['<emo', 'tion value="sad"/>', LINE], // a tag split across tokens
  'speed-slow': [`<speed ratio="0.75"/>${LINE}`],
  'speed-fast': [`<speed ratio="1.3"/>${LINE}`],
  'volume-soft': [`<volume ratio="0.6"/>${LINE}`],
  laughter: ["That's hilarious, [laughter] okay, okay, you got me."],
  'no-laughter': ["That's hilarious, okay, okay, you got me."],
  'break-1s': ["I really didn't see that coming. <break time=\"1s\"/>That's wild."],
  'no-break': ["I really didn't see that coming. That's wild."],
};

async function synth(chunks: string[]): Promise<Int16Array> {
  const node = createGatewayTTSNode({
    voiceId,
    sessionId: 'tts-tags-e2e',
    personaId: 'ferni',
    sampleRate: 24000,
    frameDurationMs: 20,
    enableCache: false,
  });
  const text = new ReadableStream<string>({
    async start(c) {
      for (const chunk of chunks) {
        c.enqueue(chunk);
        await new Promise((r) => setTimeout(r, 30)); // like tokens arriving
      }
      c.close();
    },
  });
  const audio = await node(text as never);
  if (!audio) return new Int16Array(0);
  const parts: Int16Array[] = [];
  for await (const f of audio as unknown as AsyncIterable<AudioFrame>) {
    parts.push(new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel).slice());
  }
  const all = new Int16Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

/** Ink-2 transcript of 24 kHz audio (resampled to 16 kHz by decimation 3:2). */
async function transcribe(pcm24: Int16Array): Promise<string> {
  const n = Math.floor((pcm24.length * 2) / 3);
  const pcm = Int16Array.from({ length: n }, (_, i) => pcm24[Math.floor((i * 3) / 2)]);
  const ws = new WebSocket(
    'wss://api.cartesia.ai/stt/turns/websocket?model=ink-2&sample_rate=16000&encoding=pcm_s16le',
    { headers: { 'X-API-Key': process.env.CARTESIA_API_KEY!, 'Cartesia-Version': '2026-03-01' } }
  );
  const finals: string[] = [];
  let current = '';
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as { type: string; transcript?: string };
    if (m.type === 'turn.update' && m.transcript) current = m.transcript;
    if (m.type === 'turn.end') {
      finals.push(m.transcript || current);
      current = '';
    }
  });
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
  });
  const all = Int16Array.from([...pcm, ...new Int16Array(16000)]);
  for (let i = 0; i < all.length; i += 320) {
    ws.send(Buffer.from(all.slice(i, i + 320).buffer));
    if ((i / 320) % 4 === 0) await new Promise((r) => setTimeout(r, 20));
  }
  await new Promise((r) => setTimeout(r, 1500));
  ws.send(JSON.stringify({ type: 'close' }));
  await new Promise((r) => setTimeout(r, 1500));
  if (current) finals.push(current);
  ws.terminate();
  return finals.join(' ');
}

function wav(x: Int16Array): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + x.byteLength, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24);
  h.writeUInt32LE(48000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(x.byteLength, 40);
  return Buffer.concat([h, Buffer.from(x.buffer, x.byteOffset, x.byteLength)]);
}

// CASES=plain,emotion-sad runs only those; REPS=3 repeats each (name-1, -2, ...).
const only = process.env.CASES?.split(',');
const reps = Number(process.env.REPS ?? 1);
const runs = Object.entries(CASES)
  .filter(([n]) => !only || only.includes(n))
  .flatMap(([n, c]) => Array.from({ length: reps }, (_, i): [string, string[]] => [reps > 1 ? `${n}-${i + 1}` : n, c]));
const results: Record<string, { seconds: number; transcript: string; spokeTag: boolean }> = {};
for (const [name, chunks] of runs) {
  const pcm = await synth(chunks);
  writeFileSync(join(outDir, `${name}.wav`), wav(pcm));
  const transcript = pcm.length ? await transcribe(pcm) : '';
  results[name] = {
    seconds: +(pcm.length / 24000).toFixed(2),
    transcript,
    spokeTag: /laughter|emotion|value|speed|ratio|volume|break time/i.test(transcript),
  };
  console.log(name.padEnd(18), results[name].seconds, 's |', transcript);
}
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify({ voiceId, results }, null, 1));
process.exit(0);
