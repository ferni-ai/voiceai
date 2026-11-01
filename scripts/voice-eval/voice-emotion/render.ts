/**
 * Render Ferni replies through the real gateway TTS node, the way a live reply
 * goes out: Speech Director (dev's levers), continuation TTS, Cartesia.
 *
 * Reads a jobs file (JSON array) and writes <out-dir>/<name>.wav per job plus
 * <out-dir>/jobs.json (each job with its seconds and the Director's carry-over
 * after it: emotion, speed, volume). Entries with a `reply` are scenarios
 * (fixtures/scenarios.json) and expand to two arms, A = today's controls and
 * B = VOICE_ATTUNE=on, REPS takes each (default 2), the same text in both, as
 * the second reply in that mood (prime 1). Otherwise an entry is a job:
 *   { name, chunks: string[], env?: {VAR: value}, sessionId?, userEmotion?, userRequest?,
 *     prime?: number }
 * `env` is set for that render only (e.g. VOICE_ATTUNE=on). `prime` replays the
 * Director's opening decision that many times on the same session first, without
 * audio, so a reply is heard as the Nth turn in that mood (turn-to-turn smoothing).
 *
 * usage: npx tsx scripts/voice-eval/voice-emotion/render.ts <secrets.env> <jobs.json> <out-dir>
 *   secrets.env must contain CARTESIA_API_KEY (read, never printed). Voice:
 *   FERNI_VOICE_ID from that file, else the resolved Ferni voice. Existing WAVs are kept
 *   (re-runs cost nothing); delete one to re-render it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';

interface Job {
  name: string;
  chunks: string[];
  env?: Record<string, string>;
  sessionId?: string;
  userEmotion?: string;
  userRequest?: string;
  prime?: number;
}

const [secretsFile, jobsFile, outDir] = process.argv.slice(2);
if (!secretsFile || !jobsFile || !outDir) {
  console.error('usage: render.ts <secrets.env> <jobs.json> <out-dir>');
  process.exit(2);
}
const secrets = Object.fromEntries(
  readFileSync(secretsFile, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
process.env.CARTESIA_API_KEY = secrets.CARTESIA_API_KEY;
// Dev's Director levers (cloud-agents "Speech director plan" lines, 2026-10-11).
Object.assign(process.env, {
  USE_TTS_GATEWAY: 'true',
  SPEECH_DIRECTOR: 'live',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
});
const { getVoiceIdForPersona } = await import('../../../src/config/voice-ids.js');
const voiceId = secrets.FERNI_VOICE_ID || getVoiceIdForPersona('ferni');
if (!process.env.CARTESIA_API_KEY) throw new Error('need CARTESIA_API_KEY');
mkdirSync(outDir, { recursive: true });

const { createGatewayTTSNode } =
  await import('../../../src/speech/tts-gateway/gateway-tts-node.js');
const { directSpeech } = await import('../../../src/speech/tts-gateway/director/index.js');

const textOf = (chunks: string[]) =>
  new ReadableStream<string>({
    async start(c) {
      for (const chunk of chunks) {
        c.enqueue(chunk);
        await new Promise((r) => setTimeout(r, 30)); // like tokens arriving
      }
      c.close();
    },
  });

/** A reply stream that drops everything: the Director decides, nothing is spoken. */
const silent = { push() {}, end() {}, cancel() {}, audio: (async function* () {})() };

async function prime(job: Job): Promise<void> {
  for (let i = 0; i < (job.prime ?? 0); i++) {
    const directed = directSpeech(silent as never, {
      textStream: textOf(job.chunks) as never,
      voiceId,
      sessionId: job.sessionId,
      personaId: 'ferni',
      turnContext: turnContext(job),
    });
    const reader = directed.textStream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (value) directed.reply.push(value);
      if (done) break;
    }
    directed.reply.end();
  }
}

function turnContext(job: Job) {
  return {
    userRequest: job.userRequest,
    userEmotion: job.userEmotion ? { primary: job.userEmotion } : undefined,
  };
}

async function synth(job: Job): Promise<Int16Array> {
  const node = createGatewayTTSNode({
    voiceId,
    sessionId: job.sessionId ?? `ve-${job.name}`,
    personaId: 'ferni',
    turnContext: turnContext(job),
    sampleRate: 24000,
    frameDurationMs: 20,
    enableCache: false,
  });
  const audio = await node(textOf(job.chunks) as never);
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

interface Scenario {
  id: string;
  state: string;
  userEmotion: string;
  user: string;
  reply: string;
}

/** The reply as an LLM streams it: a few words per chunk. */
const asTokens = (text: string): string[] => text.match(/(?:\S+\s*){1,3}/g) ?? [text];

function expand(entries: Array<Job | Scenario>): Job[] {
  const reps = Number(process.env.REPS ?? 2);
  return entries.flatMap((e): Job[] => {
    if (!('reply' in e)) return [e];
    return Array.from({ length: reps }, (_, r) =>
      (['A', 'B'] as const).map((arm): Job => ({
        name: `${e.id}-${arm}-${r + 1}`,
        chunks: asTokens(e.reply),
        env: arm === 'B' ? { VOICE_ATTUNE: 'on' } : {},
        sessionId: `ve-${e.id}-${arm}-${r + 1}`,
        userEmotion: e.userEmotion,
        userRequest: e.user,
        prime: 1,
      }))
    ).flat();
  });
}

const jobs = expand(JSON.parse(readFileSync(jobsFile, 'utf8')) as Array<Job | Scenario>);
const { directorSessions } = await import('../../../src/speech/tts-gateway/director/index.js');
const base = { ...process.env };
// DRY=1: decide only (prime + the reply itself through a silent stream), no Cartesia.
const dry = process.env.DRY === '1';
const index = join(outDir, 'jobs.json');
const before = new Map<string, object | undefined>(
  existsSync(index)
    ? (JSON.parse(readFileSync(index, 'utf8')) as Array<{ name: string; plan?: object }>).map(
        (j) => [j.name, j.plan]
      )
    : []
);
let rendered = 0;
const out: Array<Job & { seconds: number; plan?: object }> = [];
for (const job of jobs) {
  const file = join(outDir, `${job.name}.wav`);
  for (const k of Object.keys(process.env)) if (!(k in base)) delete process.env[k];
  Object.assign(process.env, base, job.env ?? {});
  let seconds = 0;
  let plan = before.get(job.name);
  if (dry) {
    await prime({ ...job, prime: (job.prime ?? 0) + 1 });
  } else if (existsSync(file)) {
    seconds = (readFileSync(file).length - 44) / 48000;
  } else {
    await prime(job);
    const pcm = await synth(job);
    writeFileSync(file, wav(pcm));
    seconds = pcm.length / 24000;
    rendered++;
  }
  if (dry || !plan) plan = job.sessionId ? directorSessions.get(job.sessionId, 'ferni') : undefined;
  out.push({ ...job, seconds: +seconds.toFixed(2), plan });
  console.log(job.name.padEnd(28), seconds.toFixed(2), 's', JSON.stringify(plan ?? {}));
}
if (!dry) writeFileSync(index, JSON.stringify(out, null, 1));
console.log(`rendered ${rendered} new (Cartesia calls), ${jobs.length - rendered} cached`);
process.exit(0);
