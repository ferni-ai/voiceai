/**
 * Blind listening kit for Ferni's phone voice. Renders sample replies through
 * the live TTS path in four arms, puts each through a simulated phone line
 * (phone-sim.ts) and writes shuffled, anonymised WAVs plus an answer key.
 *
 *   A  today's prod levers (SpeechDirector log, 2026-10-10)
 *   B  A + PHONE_VOICE_PROFILE
 *   C  B + nonverbal live (SPEECH_DIRECTOR_NONVERBAL + SPEECH_STAGE2_NONVERBAL)
 *   D  B + prosody live (SPEECH_DIRECTOR_PROSODY), answering a simulated caller
 *
 * Each arm runs production code as tts-wrapper.ts does: the gateway TTS node
 * (Speech Director, Cartesia continuations), then applyPostTTSEnhancement.
 * Cartesia never voices text the same way twice, so an arm whose Cartesia
 * transcript (text and tags) matches an earlier arm's reuses that take; only
 * arms the Director voices differently are new takes (the key says which).
 * Clips are matched to one listening level (unless --no-match) so loudness
 * can't pick the winner.
 *
 * usage: npx tsx --env-file=<.env with CARTESIA_API_KEY> scripts/audio-eval/phone-voice-blind.ts
 *          <out-dir> [--lines f.json] [--voice id] [--no-match] [--base KEY=VALUE ...]
 *   --lines: [{ text, userText, caller: steady|low|excited|tense }], default fixtures/phone-voice-lines.json
 *   --voice: default getVoiceIdForPersona('ferni') under the loaded env; pass prod's voice
 *   --base:  extra env for every arm (e.g. SPEECH_STAGE2_TEMPO=live if prod has it)
 * Writes <out>/line-NN/{a,b,c,d}.wav, RATE-ME.csv and answer-key.json (open it last).
 */
import { createHash, randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';

import { notePhoneListener } from '../../src/agents/shared/performance/phone-voice-profile.js';
import {
  applyPostTTSEnhancement,
  PostTTSPresets,
  postTtsEnvOverrides,
} from '../../src/agents/shared/performance/post-tts-transform.js';
import { getVoiceIdForPersona } from '../../src/config/voice-ids.js';
import { getCallerProsodyTracker } from '../../src/speech/audio-prosody/caller-prosody.js';
import { createGatewayTTSNode } from '../../src/speech/tts-gateway/gateway-tts-node.js';
import type { ReplyStream } from '../../src/speech/tts-gateway/providers/cartesia-reply-stream.js';
import { getTTSProvider } from '../../src/speech/tts-gateway/providers/index.js';
import { getReplyAudioId } from '../../src/speech/tts-gateway/reply-audio-id.js';
import { activeLevelDb, matchLevel, PHONE_RATE, phoneLine } from './phone-sim.js';
import { encodeWav } from './speech-e2e-lib.js';

type Caller = 'steady' | 'low' | 'excited' | 'tense';
interface Line {
  text: string;
  userText: string;
  caller: Caller;
}

/** The prod levers (SpeechDirector log, 2026-10-10): every key is set for every arm. */
const LEVER_ENV: Record<string, string | undefined> = {
  SPEECH_DIRECTOR: 'live',
  SPEECH_DIRECTOR_LAUGHTER: 'live',
  SPEECH_DIRECTOR_NONVERBAL: undefined,
  SPEECH_DIRECTOR_PROSODY: undefined,
  SPEECH_STAGE2_NONVERBAL: undefined,
  SPEECH_STAGE2_TEMPO: undefined,
  POST_TTS_ENHANCEMENT_ENABLED: undefined,
  PHONE_VOICE_PROFILE: undefined,
  TTS_REPLY_CONTINUATIONS: undefined, // prod default: one Cartesia context per reply
};
const ARMS: Record<string, Record<string, string>> = {
  A: {},
  B: { PHONE_VOICE_PROFILE: 'on' },
  C: {
    PHONE_VOICE_PROFILE: 'on',
    SPEECH_DIRECTOR_NONVERBAL: 'live',
    SPEECH_STAGE2_NONVERBAL: 'live',
  },
  D: { PHONE_VOICE_PROFILE: 'on', SPEECH_DIRECTOR_PROSODY: 'live' },
};
const LISTEN_DB = -24;
const RATE = 24000;

/** Synthetic caller voice: a baseline turn, then the answered turn in the line's mood. */
function simulateCaller(sessionId: string, userText: string, caller: Caller): void {
  const tracker = getCallerProsodyTracker(sessionId);
  const words = userText.split(/\s+/).filter(Boolean).length;
  const baseRate = 3.2; // words per voiced second
  const speak = (t0: number, ms: number, hz: (f: number) => number, energyDb: number): number => {
    for (let t = 0; t < ms; t += 10) {
      tracker.addFrame(
        { pitchHz: hz(t / ms), pitchConfidence: 0.9, energyDb, isSpeech: true },
        t0 + t
      );
    }
    return t0 + ms;
  };
  const t = speak(0, 2500, () => 120, -30);
  tracker.readTurn(8); // 8 words in 2.5 s: the baseline closes when the caller speaks again
  const rel = { steady: 1, low: 0.6, excited: 1.4, tense: 1.4 }[caller];
  const ms = Math.max(1600, Math.round((words / (baseRate * rel)) * 1000));
  const tail = 1 - Math.min(1, 1000 / ms); // falling pitch over the last second
  const shape: Record<Caller, [(f: number) => number, number]> = {
    steady: [() => 120, -30],
    low: [(f) => (f < tail ? 120 : 120 - 25 * ((f - tail) / (1 - tail))), -36],
    excited: [() => 125, -25],
    tense: [() => 140, -25],
  };
  speak(t + 3000, ms, ...shape[caller]);
}

/** Audio per Cartesia transcript, and which arm voiced it first. */
const takes = new Map<string, { chunks: ArrayBuffer[]; arm: string }>();
let currentArm = '';
let armTakes: string[] = [];

/** Collects the reply's pushes; at end() replays an identical earlier take or voices it. */
class ReplayReply implements ReplyStream {
  private readonly pieces: string[] = [];
  private closed = false;
  private cancelled = false;
  private wake: (() => void) | undefined;

  constructor(private readonly open: () => ReplyStream) {}

  push(text: string): void {
    this.pieces.push(text);
  }
  end(): void {
    this.closed = true;
    this.wake?.();
  }
  cancel(): void {
    this.cancelled = true;
    this.wake?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {
    while (!this.closed && !this.cancelled) await new Promise<void>((r) => (this.wake = r));
    if (this.cancelled) return;
    const transcript = this.pieces.join('');
    const take = takes.get(transcript);
    armTakes.push(take ? `reused ${take.arm}` : 'new take');
    if (take) return yield* take.chunks;
    const real = this.open();
    for (const piece of this.pieces) real.push(piece);
    real.end();
    const chunks: ArrayBuffer[] = [];
    for await (const chunk of real) {
      chunks.push(chunk);
      yield chunk;
    }
    takes.set(transcript, { chunks, arm: currentArm });
  }
}

function replayTakes(): void {
  const provider = getTTSProvider();
  const open = provider.openReplyStream?.bind(provider);
  if (!open) throw new Error('the TTS provider has no reply streams');
  provider.openReplyStream = (voiceId: string) => new ReplayReply(() => open(voiceId));
}

function textStream(text: string): ReadableStream<string> {
  const words = text.split(' ');
  return new ReadableStream<string>({
    start(c) {
      for (let i = 0; i < words.length; i += 3) c.enqueue(`${words.slice(i, i + 3).join(' ')} `);
      c.close();
    },
  });
}

async function render(
  line: Line,
  arm: string,
  voiceId: string,
  base: Record<string, string>
): Promise<Float32Array> {
  for (const [k, v] of Object.entries({ ...LEVER_ENV, ...base, ...ARMS[arm] })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  currentArm = arm;
  armTakes = [];
  const sessionId = `blind-${arm}-${randomInt(1e9)}`;
  notePhoneListener(sessionId, { identity: 'sip_blind-test' });
  simulateCaller(sessionId, line.userText, line.caller);
  const tts = createGatewayTTSNode({
    voiceId,
    sessionId,
    personaId: 'ferni',
    turnContext: { turnNumber: 3, userRequest: line.userText },
    sampleRate: RATE,
    frameDurationMs: 20,
    enableCache: false,
  });
  const audio = await tts(textStream(line.text) as never);
  if (!audio) throw new Error(`no audio for arm ${arm}`);
  const config = { ...PostTTSPresets.betterThanHuman, ...postTtsEnvOverrides(), sessionId };
  const out = await applyPostTTSEnhancement(
    audio,
    { ...config, personaId: 'ferni' },
    getReplyAudioId(audio)
  );
  const chunks: number[] = [];
  for await (const f of out as unknown as AsyncIterable<AudioFrame>) {
    if (f.sampleRate !== RATE) throw new Error(`unexpected rate ${f.sampleRate}`);
    for (const v of new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel))
      chunks.push(v / 32768);
  }
  return Float32Array.from(chunks);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i > 0 ? args[i + 1] : undefined;
  };
  if (!outDir || outDir.startsWith('--')) {
    console.error(
      'usage: phone-voice-blind.ts <out-dir> [--lines f.json] [--voice id] [--no-match] [--base K=V ...]'
    );
    process.exit(2);
  }
  if (!process.env.CARTESIA_API_KEY)
    throw new Error('CARTESIA_API_KEY is not set (pass --env-file)');
  const linesFile = flag('--lines') ?? join(import.meta.dirname, 'fixtures/phone-voice-lines.json');
  const lines = JSON.parse(readFileSync(linesFile, 'utf8')) as Line[];
  const voiceId = flag('--voice') ?? getVoiceIdForPersona('ferni');
  const base: Record<string, string> = {};
  args.forEach((a, i) => {
    if (args[i - 1] !== '--base') return;
    const eq = a.indexOf('=');
    base[a.slice(0, eq)] = a.slice(eq + 1);
  });
  const match = !args.includes('--no-match');
  replayTakes();

  const key: Record<string, unknown> = {
    voiceId,
    base,
    listeningLevelDb: match ? LISTEN_DB : null,
    arms: ARMS,
    lines: {},
  };
  const csv = ['line,clip,naturalness_1to5,clarity_1to5,best_of_line(y/blank),notes'];
  for (const [li, line] of lines.entries()) {
    const dir = `line-${String(li + 1).padStart(2, '0')}`;
    mkdirSync(join(outDir, dir), { recursive: true });
    takes.clear();
    const letters = Object.keys(ARMS) // clip letters in a random order (random sort keys)
      .map((_, i) => ({ letter: String.fromCharCode(97 + i), key: randomInt(2 ** 40) }))
      .sort((x, y) => x.key - y.key)
      .map((x) => x.letter);
    const clips: Record<string, unknown> = {};
    const heard = new Map<string, string>(); // audio hash -> first arm with it
    for (const [ai, arm] of Object.keys(ARMS).entries()) {
      const phone = phoneLine(await render(line, arm, voiceId, base), RATE);
      const phoneLevelDb = +activeLevelDb(phone, PHONE_RATE).toFixed(1);
      const listeningGainDb = match ? +matchLevel(phone, PHONE_RATE, LISTEN_DB).toFixed(1) : 0;
      const clip = letters[ai];
      const pcm = Int16Array.from(phone, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));
      writeFileSync(join(outDir, dir, `${clip}.wav`), encodeWav(pcm, PHONE_RATE));
      const seconds = +(phone.length / PHONE_RATE).toFixed(2);
      const hash = createHash('sha256').update(new Uint8Array(phone.buffer)).digest('hex');
      const identicalTo = heard.get(hash);
      heard.set(hash, identicalTo ?? arm);
      const tts = armTakes.join(', ');
      clips[clip] = { arm, tts, identicalTo, phoneLevelDb, listeningGainDb, seconds };
      console.log(`${dir}/${clip}.wav (${tts})`);
    }
    for (const clip of Object.keys(clips).sort()) csv.push(`${dir},${clip},,,,`);
    (key.lines as Record<string, unknown>)[dir] = { ...line, clips };
  }
  writeFileSync(join(outDir, 'RATE-ME.csv'), `${csv.join('\n')}\n`);
  writeFileSync(join(outDir, 'answer-key.json'), JSON.stringify(key, null, 1));
  console.log(
    `\n${lines.length} lines x ${Object.keys(ARMS).length} arms in ${outDir}. Rate RATE-ME.csv before opening answer-key.json.`
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  }
);
