import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { tts, voice, USERDATA_TIMED_TRANSCRIPT } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { CaptionBackfill } from '../../../agents/shared/aligned-caption-backfill.js';
import { spokenCaptions } from '../../../agents/personas/turn-request.js';

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});
afterEach(() => vi.unstubAllEnvs());

type Inner = { capabilities: tts.TTSCapabilities; stream: () => unknown };
const inner = (t: object) => (t as unknown as { personaTTS: Inner }).personaTTS;

function aligned(flag: string, gateway: string) {
  vi.stubEnv('TTS_ALIGNED_TRANSCRIPT', flag);
  vi.stubEnv('USE_TTS_GATEWAY', gateway);
  return new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
}

const frame = () => new AudioFrame(new Int16Array(480), 24000, 1, 480);
const words: Array<[string, number, number]> = [
  ['Oh ', 0.12, 0.31],
  ['that ', 0.31, 0.52],
  ['is ', 0.52, 0.6],
  ['great ', 0.6, 1.04],
];

/** A Cartesia plugin stream that yields audio with word timings, as tts.js does. */
function timedInnerStream() {
  return {
    pushText() {},
    flush() {},
    endInput() {},
    close() {},
    updateInputStream() {},
    async *[Symbol.asyncIterator]() {
      for (const [text, startTime, endTime] of words) {
        yield {
          requestId: 'r',
          segmentId: 's',
          final: false,
          frame: frame(),
          timedTranscripts: [voice.createTimedString({ text, startTime, endTime })],
        };
      }
      yield tts.SynthesizeStream.END_OF_STREAM;
    },
  };
}

describe('PersonaAwareTTS aligned transcript capability', () => {
  it('flag off: alignedTranscript stays undefined (the SDK estimates timing)', () => {
    const t = aligned('off', 'false');
    expect(inner(t).capabilities.alignedTranscript).toBe(true); // Cartesia asks for timings
    expect(t.capabilities.alignedTranscript).toBeUndefined();
    expect(t.capabilities.streaming).toBe(true);
  });

  it('flag on with Cartesia: declared, and kept across a voice switch', () => {
    const t = aligned('on', 'false');
    expect(t.capabilities.alignedTranscript).toBe(true);
    t.switchVoice('Maya', 'voice-b');
    expect(t.getVoiceId()).toBe('voice-b');
    expect(t.capabilities.alignedTranscript).toBe(true);
  });

  it('flag on with Cartesia: word timings reach the transcription node intact', async () => {
    const t = aligned('on', 'false');
    inner(t).stream = timedInnerStream;
    // The SDK's own ttsNode (agent.js) puts each chunk's timings on its frame.
    const activity = {
      tts: t,
      _resolveExpressiveOptions: () => undefined,
      agentSession: { connOptions: { ttsConnOptions: undefined } },
    };
    const agent = { getActivityOrThrow: () => activity } as unknown as voice.Agent;
    const backfill = new CaptionBackfill(); // as ferni-agent.ts ttsNode wraps it
    const text = backfill.tapText(ReadableStream.from(['Oh that is great']));
    const audio = backfill.wrapAudio(
      (await voice.Agent.default.ttsNode(agent, text as never, {})) as never
    )!;
    // Read timings off the frames the way performTTSInference (generation.js) does.
    const timed: Array<string | voice.TimedString> = [];
    for await (const f of audio as unknown as AsyncIterable<AudioFrame>) {
      timed.push(...((f.userdata[USERDATA_TIMED_TRANSCRIPT] as voice.TimedString[]) ?? []));
    }
    const captions: voice.TimedString[] = [];
    for await (const c of spokenCaptions(
      ReadableStream.from(timed),
      {}
    ) as never as AsyncIterable<voice.TimedString>) {
      captions.push(c);
    }
    expect(captions.every((c) => voice.isTimedString(c))).toBe(true);
    expect(captions.map((c) => [c.text, c.startTime, c.endTime])).toEqual(words);
  });

  it('flag on but the TTS gateway speaks the replies: not declared', () => {
    expect(aligned('on', '').capabilities.alignedTranscript).toBeUndefined();
    expect(aligned('on', 'true').capabilities.alignedTranscript).toBeUndefined();
  });

  it('flag on but the inner TTS returns no timings (non-Cartesia or fallback): not declared', () => {
    const t = aligned('on', 'false');
    (t as unknown as { personaTTS: Inner }).personaTTS = {
      capabilities: { streaming: true },
      stream: () => ({}),
    };
    expect(t.capabilities.alignedTranscript).toBeUndefined();
  });
});
