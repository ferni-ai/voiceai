/**
 * Speech wiring, end to end in process: Stage 1 (Speech Director) → the real
 * Cartesia provider and reply stream → the gateway's frames → the real
 * post-TTS enhancement → Stage 2 (opening + tempo) on the real @ferni/audio
 * binary. Only the network is fake: the Cartesia WebSocket is replaced by a
 * socket that records each request and answers with a deterministic tone
 * (s16le, 24 kHz, a whole number of 20 ms frames per piece of text).
 *
 * Voice: VOICE_IDS.FERNI (Lester Pro V3, a Professional Voice Clone).
 *
 * Live (every director lever and both Stage 2 gates): no prosody tag reaches
 * Cartesia, stage directions and sigh cues never do, <spell> does; the plan
 * for exactly (session, turn) carries the tempo and the opening; the audio
 * opens with the sigh (energy before the first speech frame) and the speech
 * is stretched by 1/tempo.
 *
 * Off (nothing set): the pushes are the pre-wiring pushes (captured on the
 * base commit 9f53d3899, see OFF_BASE_PUSHES) except the two deliberate
 * default-path fixes: stage directions dropped (item 4) and <spell> kept
 * (item 5); the audio is exactly the tone Cartesia sent, framed as before.
 */
import { createRequire } from 'node:module';
import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { VOICE_IDS } from '../../../config/voice-ids.js';
import {
  PostTTSPresets,
  applyPostTTSEnhancement,
} from '../../../agents/shared/performance/post-tts-transform.js';
import { isReplyAudioLeadFrame } from '../../../agents/shared/performance/reply-audio-stage.js';
import { clearReplyAudioPlan, setReplyAudioPlan } from '../../reply-audio-plan.js';
import { directorSessions } from '../director/session-state.js';

// ---------------------------------------------------------------------------
// The network: a fake Cartesia WebSocket
// ---------------------------------------------------------------------------

const SR = 24000;
const FRAME = 480;

interface Sent {
  transcript: string;
  continue: boolean;
  voiceId: string;
}

const net = vi.hoisted(() => ({ sent: [] as Sent[], pcm: [] as Int16Array[] }));

/** 150 Hz tone, 4 frames (80 ms) per word: deterministic speech stand-in. */
function tone(words: number, phase: number): Int16Array {
  const n = Math.max(1, words) * 4 * FRAME;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++)
    out[i] = Math.round(6000 * Math.sin((2 * Math.PI * 150 * (phase + i)) / SR));
  return out;
}

vi.mock('../providers/cartesia-socket.js', () => ({
  CartesiaSocket: class {
    private phase = 0;
    connect(): Promise<void> {
      return Promise.resolve();
    }
    async send(
      _contextId: string,
      request: { transcript: string; continue: boolean; voice: { id: string } },
      handler: { onChunk: (pcm: ArrayBuffer) => void; onDone: () => void }
    ): Promise<void> {
      net.sent.push({
        transcript: request.transcript,
        continue: request.continue,
        voiceId: request.voice.id,
      });
      const words = request.transcript.split(/\s+/).filter(Boolean).length;
      if (request.transcript.trim()) {
        const pcm = tone(words, this.phase);
        this.phase += pcm.length;
        net.pcm.push(pcm);
        setTimeout(() => handler.onChunk(new Int16Array(pcm).buffer as ArrayBuffer), 15);
      }
      if (!request.continue) setTimeout(() => handler.onDone(), 30);
    }
    cancel(): void {}
    release(): void {}
  },
}));

// Record every Stage 2 plan the Director sets (the real store still runs).
vi.mock('../../reply-audio-plan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../reply-audio-plan.js')>();
  return { ...actual, setReplyAudioPlan: vi.fn(actual.setReplyAudioPlan) };
});

function hasNative(): boolean {
  try {
    const m = createRequire(import.meta.url)('@ferni/audio') as Record<string, unknown>;
    return typeof m.renderNonverbal === 'function' && typeof m.NativeTempoStretcher === 'function';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The reply
// ---------------------------------------------------------------------------

/** What the LLM streams: a soft start, a sigh cue, a spelled code, stage directions. */
const RAW = [
  '<speed ratio="0.9"/>*sighs* <emotion value="sympathetic"/>Oh, I\'m so sorry you\'re going through this. ',
  'Your confirmation code is <spell>K7Q2</spell>, so keep it handy. ',
  '*smiles* We will get through it together, one step at a time.',
];

/**
 * Pushes with every gate off on the base commit 9f53d3899 (before this
 * wiring), captured by running this scenario there: the opening soft start
 * and emotion as tags, "*sighs*" and "*smiles*" spoken, <spell> stripped.
 */
const OFF_BASE_PUSHES = [
  '<speed ratio="0.9"/><emotion value="sympathetic"/>*sighs* Oh, I\'m so sorry you\'re going through this. ',
  '<speed ratio="1"/><volume ratio="1"/>Your confirmation code is K7Q2, so keep it handy. ',
  '*smiles* We will get through it together, one step at a time. ',
];

const ENV_KEYS = [
  'SPEECH_DIRECTOR',
  'SPEECH_DIRECTOR_NONVERBAL',
  'SPEECH_DIRECTOR_LAUGHTER',
  'SPEECH_STAGE2_NONVERBAL',
  'SPEECH_STAGE2_TEMPO',
] as const;

const ALL_LIVE: Record<(typeof ENV_KEYS)[number], string> = {
  SPEECH_DIRECTOR: 'live',
  SPEECH_DIRECTOR_NONVERBAL: 'live',
  SPEECH_DIRECTOR_LAUGHTER: 'live',
  SPEECH_STAGE2_NONVERBAL: 'live',
  SPEECH_STAGE2_TEMPO: 'live',
};

interface Run {
  frames: AudioFrame[];
  gatewaySameAsOutput: boolean;
}

/**
 * One reply as tts-wrapper runs it: the gateway node for this turn, then
 * post-TTS enhancement + Stage 2 for the same turn. The LLM's text starts
 * only after the post-TTS chain exists, as on a call (TTS starts before the
 * model's first sentence).
 */
async function speak(sessionId: string, turn: number, stageTurn = turn): Promise<Run> {
  const { createGatewayTTSNode } = await import('../gateway-tts-node.js');
  let go: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    go = resolve;
  });
  // One piece every 5 ms, from when `go` is called.
  const pending = [...RAW];
  const text = new ReadableStream<string>({
    start: () => started,
    pull: (c) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          const piece = pending.shift();
          if (piece === undefined) c.close();
          else c.enqueue(piece);
          resolve();
        }, 5);
      }),
  });
  const node = createGatewayTTSNode({
    voiceId: VOICE_IDS.FERNI,
    sessionId,
    personaId: 'ferni',
    turnContext: { turnNumber: turn, userRequest: 'my dad was just diagnosed with cancer' },
    enableCache: false,
  });
  const gateway = (await node(text)) as NodeReadableStream<AudioFrame>;
  const out = await applyPostTTSEnhancement(
    gateway,
    { ...PostTTSPresets.betterThanHuman, sessionId, personaId: 'ferni' },
    stageTurn
  );
  go();
  const frames: AudioFrame[] = [];
  for await (const f of out) frames.push(f);
  return { frames, gatewaySameAsOutput: out === gateway };
}

const samplesOf = (frames: AudioFrame[]): number =>
  frames.reduce((n, f) => n + f.samplesPerChannel, 0);

function rms(frames: AudioFrame[]): number {
  let sum = 0;
  let n = 0;
  for (const f of frames) {
    const x = new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel);
    for (const v of x) sum += v * v;
    n += x.length;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

const pushes = (): string[] => net.sent.filter((s) => s.transcript).map((s) => s.transcript);

let session = 0;
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  net.sent.length = 0;
  net.pcm.length = 0;
  vi.mocked(setReplyAudioPlan).mockClear();
});

describe.skipIf(!hasNative())(
  'speech wiring end to end (real gateway, Cartesia provider, Rust)',
  () => {
    beforeAll(() => {
      // tts-wrapper always enhances; keep the env default (on).
      delete process.env.POST_TTS_ENHANCEMENT_ENABLED;
    });

    it('all levers live on Ferni’s PVC: clean text, one plan for this turn, sigh then stretched speech', async () => {
      Object.assign(process.env, ALL_LIVE);
      const sid = `e2e-live-${++session}`;
      directorSessions.clear(sid);
      const { frames } = await speak(sid, 7);

      // Stage 1: what reached Cartesia.
      const sent = pushes();
      const all = sent.join('');
      expect(net.sent.every((s) => s.voiceId === VOICE_IDS.FERNI)).toBe(true);
      expect(all).not.toMatch(/<\/?(?:speed|emotion|volume)\b/);
      expect(all).not.toMatch(/\*|sigh|smiles/i);
      expect(all).toContain('<spell>K7Q2</spell>');
      expect(all).toContain("Oh, I'm so sorry you're going through this.");
      expect(all).toContain('We will get through it together, one step at a time.');

      // The plan: once, for exactly (session, turn 7), tempo + the sigh at Lester's pitch.
      const { calls } = vi.mocked(setReplyAudioPlan).mock;
      expect(calls).toHaveLength(1);
      expect(calls[0].slice(0, 2)).toEqual([sid, 7]);
      const [, , plan] = calls[0];
      // Heavy reply 0.97, composed with the 0.9 soft start: 0.87 (inside 0.85-1.15).
      expect(plan).toEqual({ tempo: 0.87, opening: { kind: 'sigh', intensity: 0.6, f0Hz: 111 } });

      // Stage 2: the audio opens with the sigh, then stretched speech.
      const firstSpeech = frames.findIndex((f) => !isReplyAudioLeadFrame(f));
      expect(firstSpeech).toBeGreaterThan(0);
      const lead = frames.slice(0, firstSpeech);
      expect(lead.every(isReplyAudioLeadFrame)).toBe(true);
      expect(samplesOf(lead)).toBe(Math.round(0.8 * SR)); // default 800 ms sigh, no gap
      expect(rms(lead)).toBeGreaterThan(200); // audible, not silence
      const speech = frames.slice(firstSpeech);
      expect(speech.some(isReplyAudioLeadFrame)).toBe(false);
      const cartesia = net.pcm.reduce((n, p) => n + p.length, 0);
      expect(samplesOf(speech) / cartesia).toBeGreaterThan((1 / 0.87) * 0.97);
      expect(samplesOf(speech) / cartesia).toBeLessThan((1 / 0.87) * 1.03);
    });

    it('a stage for another turn never takes this turn’s plan', async () => {
      Object.assign(process.env, ALL_LIVE);
      const sid = `e2e-turn-${++session}`;
      const { frames } = await speak(sid, 7, 6);
      expect(vi.mocked(setReplyAudioPlan).mock.calls[0].slice(0, 2)).toEqual([sid, 7]);
      expect(frames.some(isReplyAudioLeadFrame)).toBe(false);
      expect(samplesOf(frames)).toBe(net.pcm.reduce((n, p) => n + p.length, 0)); // not stretched
      clearReplyAudioPlan(sid);
    });

    it('every gate off: the pre-wiring pushes (bar items 4 and 5) and Cartesia’s audio untouched', async () => {
      const sid = `e2e-off-${++session}`;
      const { frames } = await speak(sid, 3);

      const expected = OFF_BASE_PUSHES.map(
        (p) =>
          p
            .replace('*sighs* ', '') // item 4: stage directions are never spoken
            .replace('*smiles* ', '')
            .replace('K7Q2', '<spell>K7Q2</spell>') // item 5: <spell> reaches Cartesia
      );
      expect(pushes()).toEqual(expected);
      expect(vi.mocked(setReplyAudioPlan)).not.toHaveBeenCalled();
      expect(frames.some(isReplyAudioLeadFrame)).toBe(false);
      // Same samples, same framing as Cartesia sent them (post-TTS DSP aside, it
      // keeps length): no opening, no stretch.
      expect(samplesOf(frames)).toBe(net.pcm.reduce((n, p) => n + p.length, 0));
    });
  }
);

describe('every gate off: Stage 2 is not even in the chain', () => {
  it('returns the gateway stream itself when post-TTS DSP is off', async () => {
    process.env.POST_TTS_ENHANCEMENT_ENABLED = 'false';
    try {
      const sid = `e2e-identity-${++session}`;
      const { frames, gatewaySameAsOutput } = await speak(sid, 2);
      expect(gatewaySameAsOutput).toBe(true);
      // Byte for byte the tone Cartesia sent, in 20 ms frames.
      const got = new Int16Array(samplesOf(frames));
      let off = 0;
      for (const f of frames) {
        got.set(new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel), off);
        off += f.samplesPerChannel;
      }
      const sentPcm = new Int16Array(got.length);
      let o = 0;
      for (const p of net.pcm) {
        sentPcm.set(p, o);
        o += p.length;
      }
      expect(Array.from(got)).toEqual(Array.from(sentPcm));
      expect(frames.every((f) => f.samplesPerChannel === FRAME)).toBe(true);
    } finally {
      delete process.env.POST_TTS_ENHANCEMENT_ENABLED;
    }
  });
});
