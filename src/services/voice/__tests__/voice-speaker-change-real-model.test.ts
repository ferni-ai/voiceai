/**
 * The real SpeakerChangeDetector, the real worker and the REAL ECAPA-TDNN
 * model, on the voice-eval scenarios that confirmed false speaker changes on
 * dev (PR #280: talk-over 2, playful 2, all one `say -v Samantha` voice).
 *
 * Runs where the pinned model and macOS `say` + ffmpeg are available (a
 * developer Mac: SPEAKER_MODEL_TEST_PATH=<downloaded model>, see
 * scripts/speaker/README.md); skipped elsewhere. The deterministic version of
 * these properties, which runs everywhere, is voice-speaker-change-fragments.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const extractions = vi.hoisted(() => [] as Array<Promise<unknown>>);

vi.mock('../../voice-memory-enhanced.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../voice-memory-enhanced.js')>();
  return {
    ...real,
    extractSpeakerEmbedding: (audio: Float32Array) => {
      const result = real.extractSpeakerEmbedding(audio);
      extractions.push(result);
      return result;
    },
  };
});

import {
  PINNED_SPEAKER_MODEL_SHA256,
  resetSpeakerEmbeddingWorker,
} from '../speaker-embedding-worker.js';
import { endHouseholdSession } from '../voice-household.js';
import { SpeakerChangeDetector, type SpeakerChangeEvent } from '../voice-speaker-change.js';
import {
  fakeDetectorInterval,
  RATE,
  replayThroughDetector,
  timeline,
} from './speaker-change-replay.js';
import { sha256Of, useSpeakerModel } from './speaker-model-fixture.js';

const MODEL = process.env.SPEAKER_MODEL_TEST_PATH ?? '/models/speaker/ecapa-tdnn-waveform.onnx';
const hasTool = (tool: string): boolean => spawnSync('which', [tool]).status === 0;
const available =
  existsSync(MODEL) &&
  hasTool('say') &&
  hasTool('ffmpeg') &&
  sha256Of(MODEL) === PINNED_SPEAKER_MODEL_SHA256;

const DEVICE = 'real-model-device';
const LINES = {
  gifts:
    "My sister's birthday is next week. She loves hiking and old movies. Give me three gift ideas and tell me why each one would fit her.",
  plan: "Okay. Now walk me through how you'd plan the whole day with her, from morning to night.",
  wait: "Wait, sorry, hold on. She actually hates surprises, so it can't be a surprise.",
  again: "Right, good point. So tell me again, step by step, how you'd do it now.",
  cat: 'Okay so my cat just knocked a full glass of water onto my keyboard. [[slnc 400]] Again.',
  eye: "I'm pretty sure she looked me dead in the eye while she did it.",
  plotting: "I'm starting to think she's plotting against me.",
  mmhmm: 'Mm-hmm.',
  yeah: 'Yeah.',
  uhhuh: 'Uh-huh.',
  laugh: 'Ha ha ha!',
} as const;
type Line = keyof typeof LINES;

let dir = '';
const clips = new Map<string, Float32Array>();
/** `say` -> 16 kHz mono s16le, the format the agent's AudioStream gives the detector. */
function speak(voiceName: string, line: Line): Float32Array {
  const key = `${voiceName}-${line}`;
  const cached = clips.get(key);
  if (cached) return cached;
  const aiff = join(dir, `${key}.aiff`);
  const pcm = join(dir, `${key}.pcm`);
  execFileSync('say', ['-v', voiceName, '-o', aiff, '--', LINES[line]]);
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    aiff,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    's16le',
    pcm,
  ]);
  const bytes = readFileSync(pcm);
  const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const samples = Float32Array.from(i16, (v) => v / 32768);
  clips.set(key, samples);
  return samples;
}
const seconds = (clip: Float32Array): number => clip.length / RATE;

/**
 * A call laid out like scripts/voice-eval/converse.mjs: each turn, then
 * Ferni's reply (the caller's track is silent), with backchannels spoken
 * `at` seconds into the reply. `offset` shifts everything against the 2 s
 * interval, as call timing does.
 */
function call(
  offset: number,
  turns: Array<{ voice: string; line: Line; reply: number; over?: Array<[number, Line]> }>
): Float32Array {
  const placed: Array<[number, Float32Array]> = [];
  let t = offset;
  for (const turn of turns) {
    const clip = speak(turn.voice, turn.line);
    placed.push([t, clip]);
    const replyStart = t + seconds(clip) + 1.2;
    for (const [at, line] of turn.over ?? [])
      placed.push([replyStart + at, speak(turn.voice, line)]);
    t = replyStart + turn.reply;
  }
  return timeline(Math.ceil(t + 2), placed);
}

const talkOver = (voice: (i: number) => string) => [
  {
    voice: voice(0),
    line: 'gifts' as const,
    reply: 7,
    over: [
      [1.5, 'mmhmm'],
      [4, 'yeah'],
    ] as Array<[number, Line]>,
  },
  {
    voice: voice(1),
    line: 'plan' as const,
    reply: 2.5,
    over: [[1.2, 'wait']] as Array<[number, Line]>,
  },
  {
    voice: voice(2),
    line: 'again' as const,
    reply: 6,
    over: [[1.5, 'uhhuh']] as Array<[number, Line]>,
  },
];
const playful = (voice: (i: number) => string) => [
  {
    voice: voice(0),
    line: 'cat' as const,
    reply: 5,
    over: [[2, 'laugh']] as Array<[number, Line]>,
  },
  { voice: voice(1), line: 'eye' as const, reply: 6, over: [[3, 'yeah']] as Array<[number, Line]> },
  { voice: voice(2), line: 'plotting' as const, reply: 5 },
];

let detector: SpeakerChangeDetector;
let changes: SpeakerChangeEvent[];

async function replay(audio: Float32Array): Promise<SpeakerChangeEvent[]> {
  extractions.length = 0;
  detector = new SpeakerChangeDetector(DEVICE);
  changes = [];
  detector.on('speaker_changed', (e: SpeakerChangeEvent) => changes.push(e));
  detector.start('voice-eval-sam');
  await replayThroughDetector(detector, audio, extractions);
  const results = (await Promise.all(extractions)) as Array<{ method: string } | null>;
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((r) => r?.method === 'neural')).toBe(true);
  detector.stop();
  endHouseholdSession(DEVICE);
  return changes;
}

describe.runIf(available)('ECAPA-TDNN speaker change on the eval scenarios', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'speaker-change-real-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    useSpeakerModel(MODEL);
    fakeDetectorInterval();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await resetSpeakerEmbeddingWorker();
    useSpeakerModel(undefined);
  });

  it('one voice with backchannels, laughs and an interruption: no confirmed change', async () => {
    const confirmed: number[] = [];
    for (const offset of [0.3, 0.9, 1.5]) {
      for (const scenario of [talkOver, playful]) {
        const audio = call(
          offset,
          scenario(() => 'Samantha')
        );
        // eslint-disable-next-line no-await-in-loop -- one call at a time through one worker
        const events = await replay(audio);
        confirmed.push(events.length);
      }
    }
    expect(confirmed).toEqual([0, 0, 0, 0, 0, 0]);
  }, 120_000);

  it('a different voice taking over the call is detected', async () => {
    const detected: number[] = [];
    for (const offset of [0.3, 0.9, 1.5]) {
      const voices = (i: number): string => (i === 0 ? 'Samantha' : 'Daniel');
      // eslint-disable-next-line no-await-in-loop -- one call at a time through one worker
      const events = await replay(call(offset, talkOver(voices)));
      detected.push(events.length);
    }
    expect(detected.every((n) => n >= 1)).toBe(true);
  }, 120_000);
});
