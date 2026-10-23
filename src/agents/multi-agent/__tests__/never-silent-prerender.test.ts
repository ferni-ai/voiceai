/**
 * The pre-rendered fallback must be a real voiced line. Dev call action-claim-b
 * (2026-10-22): the line "played" for 23 ms with no voice on the recording, and
 * the caller heard nothing for 12 s. These pin the bar (MIN_VOICED_MS) with the
 * frames the LiveKit Cartesia plugin makes from a non-audio HTTP body, digital
 * silence and a real recorded clip.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AudioByteStream } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNeverSilentGuard,
  FALLBACK_LINES,
  measureClip,
  MIN_VOICED_MS,
  type NeverSilentSession,
} from '../never-silent.js';

const RATE = 24_000;

interface Frame {
  samplesPerChannel: number;
  sampleRate: number;
  channels: number;
  data: Int16Array;
}

const frame = (data: Int16Array): Frame => ({
  samplesPerChannel: data.length,
  sampleRate: RATE,
  channels: 1,
  data,
});

/**
 * What the plugin's ChunkedStream yields for a failed request: it feeds the
 * response body to AudioByteStream as PCM without checking the HTTP status
 * (@livekit/agents-plugin-cartesia tts.js, /tts/bytes). 1,104 bytes = 23 ms.
 */
function errorBodyFrames(): Frame[] {
  const head = '{"error":"invalid request","message":"';
  const body = head + 'x'.repeat(1104 - head.length - 2) + '"}';
  const stream = new AudioByteStream(RATE, 1);
  return [...stream.write(Buffer.from(body)), ...stream.flush()].map((f) => frame(f.data));
}

/** 24 kHz mono s16 PCM of a WAV file's data chunk. */
function wavFrames(path: string): Frame[] {
  const bytes = readFileSync(path);
  const at = bytes.indexOf('data', 12);
  const size = bytes.readUInt32LE(at + 4);
  const pcm = bytes.subarray(at + 8, at + 8 + size);
  return [frame(new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + size)))];
}

const tone = (ms: number, amplitude = 8000): Frame[] => [
  frame(
    Int16Array.from({ length: (RATE * ms) / 1000 }, (_, i) =>
      Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE))
    )
  ),
];

function setup(lines: () => Frame[]) {
  const said: Array<{ text: string; audio: boolean }> = [];
  const logs: Array<Record<string, unknown>> = [];
  const session = {
    agentState: 'listening',
    userState: 'listening',
    output: { audio: {}, audioEnabled: true },
    tts: {
      synthesize: async function* () {
        for (const f of lines()) yield { frame: f };
      },
    },
    say(text: string, opts?: { audio?: unknown }) {
      said.push({ text, audio: Boolean(opts?.audio) });
    },
    interrupt() {},
  } as NeverSilentSession & { agentState: string };
  const guard = createNeverSilentGuard({ session, mode: 'on', log: (f) => logs.push(f) });
  const state = (s: string) => {
    session.agentState = s;
    guard.onAgentState({ newState: s });
  };
  /** First reply heard (the lines render), then a turn whose reply is abandoned. */
  const failTurnAfterFirstReply = async () => {
    state('speaking');
    state('listening');
    await vi.runAllTimersAsync();
    guard.onSpeechCreated({ speechHandle: { interrupted: false, done: () => false } });
    guard.onItemAdded({ item: { role: 'user' } });
    state('thinking');
    state('listening');
  };
  return { said, logs, failTurnAfterFirstReply };
}

describe('measureClip', () => {
  it('a failed request read as PCM is ~23 ms, far under the bar', () => {
    const clip = measureClip(errorBodyFrames());
    expect(clip.ms).toBe(23);
    expect(clip.voicedMs).toBeLessThan(MIN_VOICED_MS);
  });

  it('digital silence has length but no voice', () => {
    expect(measureClip([frame(new Int16Array(RATE * 3))])).toEqual({ ms: 3000, voicedMs: 0 });
  });

  it('a quiet hiss under -40 dBFS is not voice', () => {
    expect(measureClip(tone(2000, 200)).voicedMs).toBe(0);
  });

  it('a real recorded clip measures its length and its sound', () => {
    const path = fileURLToPath(
      new URL(
        '../../integrations/assets/whistles/people-cheery-whistling-100767__1.wav',
        import.meta.url
      )
    );
    const clip = measureClip(wavFrames(path));
    expect(clip.ms).toBeGreaterThan(2900);
    expect(clip.ms).toBeLessThan(3100);
    expect(clip.voicedMs).toBeGreaterThan(MIN_VOICED_MS);
  });
});

describe('never silent: pre-rendered line', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a voiced rendering is played as pre-rendered audio', async () => {
    const h = setup(() => tone(1500));
    await h.failTurnAfterFirstReply();
    expect(h.said).toEqual([{ text: FALLBACK_LINES[0], audio: true }]);
    expect(h.logs.at(-1)).toMatchObject({ prerendered: true });
  });

  it('the 23 ms rendering from action-claim-b is dropped: the line goes through live TTS', async () => {
    const h = setup(errorBodyFrames);
    await h.failTurnAfterFirstReply();
    expect(h.logs.filter((l) => 'prerenderRejected' in l)).toHaveLength(FALLBACK_LINES.length);
    expect(h.logs[0]).toMatchObject({ prerenderRejected: FALLBACK_LINES[0], ms: 23 });
    expect(h.said).toEqual([{ text: FALLBACK_LINES[0], audio: false }]);
    expect(h.logs.at(-1)).toMatchObject({ reason: 'abandoned', prerendered: false });
  });

  it('a silent rendering is dropped too', async () => {
    const h = setup(() => [frame(new Int16Array(RATE * 3))]);
    await h.failTurnAfterFirstReply();
    expect(h.said).toEqual([{ text: FALLBACK_LINES[0], audio: false }]);
  });

  it('just under the bar is dropped, at the bar is kept', async () => {
    const under = setup(() => [...tone(MIN_VOICED_MS - 10), frame(new Int16Array(RATE))]);
    await under.failTurnAfterFirstReply();
    expect(under.said[0].audio).toBe(false);
    const at = setup(() => [...tone(MIN_VOICED_MS), frame(new Int16Array(RATE))]);
    await at.failTurnAfterFirstReply();
    expect(at.said[0].audio).toBe(true);
  });
});
