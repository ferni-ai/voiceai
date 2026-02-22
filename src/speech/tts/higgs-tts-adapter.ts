/**
 * Higgs TTS Adapter
 *
 * Bridges the TTS gateway Higgs provider to the LiveKit TTS interface
 * (synthesize + stream) so PersonaAwareTTS and createUnifiedTTS can use
 * Higgs when TTS_PROVIDER=higgs-pipeline.
 *
 * @module @ferni/speech/tts/higgs-tts-adapter
 */

import { AudioFrame } from '@livekit/rtc-node';
import { tts } from '@livekit/agents';
import { getTTSProvider } from '../tts-gateway/providers/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HiggsTTSAdapter' });

const SAMPLE_RATE = 24000;
const FRAME_DURATION_MS = 20;
const BYTES_PER_SAMPLE = 2;

function* bufferToFrames(buffer: ArrayBuffer): Generator<AudioFrame> {
  const samplesPerFrame = Math.floor((SAMPLE_RATE * FRAME_DURATION_MS) / 1000);
  const bytesPerFrame = samplesPerFrame * BYTES_PER_SAMPLE;
  let offset = 0;
  while (offset < buffer.byteLength) {
    const frameSize = Math.min(bytesPerFrame, buffer.byteLength - offset);
    const frameBuffer = buffer.slice(offset, offset + frameSize);
    const samplesPerChannel = frameSize / BYTES_PER_SAMPLE;
    if (samplesPerChannel <= 0) {
      offset += frameSize;
      continue;
    }
    yield new AudioFrame(new Int16Array(frameBuffer), SAMPLE_RATE, 1, samplesPerChannel);
    offset += frameSize;
  }
}

/**
 * Higgs TTS adapter: implements synthesize(text) and stream() using the gateway Higgs provider.
 */
export class HiggsTTSAdapter {
  readonly sampleRate = SAMPLE_RATE;
  readonly numChannels = 1;

  constructor(private readonly voiceId: string) {}

  /**
   * Synthesize text to audio (batch). Returns an async iterable of audio compatible with ChunkedStream.
   */
  async synthesize(text: string): Promise<AsyncIterable<AudioFrame>> {
    const cleanText = text?.trim() ?? '';
    if (!cleanText) {
      return (async function* () {})();
    }
    const provider = getTTSProvider();
    const buffer = await provider.synthesize(cleanText, this.voiceId, {});
    return (async function* () {
      for (const frame of bufferToFrames(buffer)) {
        yield frame;
      }
    })();
  }

  /**
   * Create a streaming session: pushText(text) buffers text; iteration yields audio from Higgs streaming.
   */
  stream(): HiggsSynthesizeStream {
    return new HiggsSynthesizeStream(this.voiceId);
  }
}

/**
 * Streaming session: buffers text via pushText(), yields AudioFrames from Higgs synthesizeStreaming.
 */
class HiggsSynthesizeStream implements AsyncIterable<
  AudioFrame | typeof tts.SynthesizeStream.END_OF_STREAM
> {
  private textQueue: string[] = [];
  private inputEnded = false;
  private eventQueue: (AudioFrame | typeof tts.SynthesizeStream.END_OF_STREAM)[] = [];
  private resolveWait: (() => void) | null = null;

  constructor(private readonly voiceId: string) {}

  pushText(text: string): void {
    if (this.inputEnded) return;
    const t = (text ?? '').trim();
    if (t) this.textQueue.push(t);
  }

  endInput(): void {
    this.inputEnded = true;
    if (this.eventQueue.length === 0) {
      this.eventQueue.push(tts.SynthesizeStream.END_OF_STREAM);
      this.resolveWait?.();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<
    AudioFrame | typeof tts.SynthesizeStream.END_OF_STREAM
  > {
    const provider = getTTSProvider();
    const streamFn = (provider as unknown as Record<string, unknown>).synthesizeStreaming as
      | ((text: string, voiceId: string, prosody: Record<string, unknown>) => AsyncIterable<ArrayBuffer>)
      | undefined;
    if (!streamFn) {
      log.warn('Higgs provider has no synthesizeStreaming; yielding END_OF_STREAM');
      yield tts.SynthesizeStream.END_OF_STREAM;
      return;
    }
    const fullText = this.textQueue.join(' ').trim();
    if (!fullText) {
      yield tts.SynthesizeStream.END_OF_STREAM;
      return;
    }
    try {
      for await (const chunk of streamFn(fullText, this.voiceId, {})) {
        if (chunk && chunk.byteLength > 0) {
          for (const frame of bufferToFrames(chunk)) {
            yield frame;
          }
        }
      }
    } catch (err) {
      log.error(
        { error: String(err), textLen: fullText.length },
        'Higgs streaming synthesis failed'
      );
    }
    yield tts.SynthesizeStream.END_OF_STREAM;
  }
}

export function createHiggsTTSAdapter(voiceId: string): HiggsTTSAdapter {
  return new HiggsTTSAdapter(voiceId);
}
