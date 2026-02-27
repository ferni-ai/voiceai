/**
 * Sonata STT LiveKit adapter.
 *
 * Wraps SonataSTTClient as an STT that implements the LiveKit STT interface.
 * Converts AudioFrame stream to f32 PCM and Sonata transcript events to SpeechEvent.
 *
 * Use when USE_SONATA_STT=true; pass to AgentSession as stt.
 */

import type { AudioFrame } from '@livekit/rtc-node';
import { stt, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { SonataSTTClient } from './sonata-stt.js';

const log = createLogger({ module: 'SonataSTTAdapter' });

const SONATA_STT_LABEL = 'sonata';
const SONATA_SAMPLE_RATE = 24000;

export interface SonataSTTAdapterConfig {
  /** HuggingFace model repo */
  hfRepo?: string;
  /** Model file within repo */
  modelPath?: string;
  /** Enable semantic VAD (default: true) */
  enableVad?: boolean;
}

/**
 * LiveKit STT implementation that uses Sonata (pocket-voice) STT via NAPI.
 * Runs Kyutai Moshi STT 1B on Metal GPU — zero network latency.
 */
export class SonataSTT extends stt.STT {
  readonly label = SONATA_STT_LABEL;
  private readonly config: SonataSTTAdapterConfig;

  constructor(config: SonataSTTAdapterConfig = {}) {
    super({
      streaming: true,
      interimResults: true,
    });
    this.config = config;
  }

  protected _recognize(_frame: unknown, _abortSignal?: AbortSignal): Promise<stt.SpeechEvent> {
    return Promise.reject(new Error('SonataSTT is streaming-only; use stream()'));
  }

  stream(options?: { connOptions?: APIConnectOptions }): SonataSpeechStream {
    return new SonataSpeechStream(
      this,
      SONATA_SAMPLE_RATE,
      this.config,
      options?.connOptions,
    );
  }
}

/**
 * SpeechStream that forwards audio to Sonata STT and emits SpeechEvents.
 */
class SonataSpeechStream extends stt.SpeechStream {
  override label = SONATA_STT_LABEL;
  #config: SonataSTTAdapterConfig;

  constructor(
    sonataStt: SonataSTT,
    sampleRate: number,
    config: SonataSTTAdapterConfig,
    connOptions?: APIConnectOptions,
  ) {
    super(sonataStt, sampleRate, connOptions);
    this.#config = config;
  }

  protected async run(): Promise<void> {
    const client = new SonataSTTClient({
      hfRepo: this.#config.hfRepo,
      modelPath: this.#config.modelPath,
      enableVad: this.#config.enableVad ?? true,
      inputSampleRate: SONATA_SAMPLE_RATE,
    });

    try {
      await client.connect();
    } catch (err) {
      log.warn({ error: err }, 'Sonata STT init failed');
      throw err;
    }

    const startTime = Date.now() / 1000;

    // Register transcript callback — emits SpeechEvents
    client.onTranscript((result) => {
      if (!result.text.trim()) return;

      const event: stt.SpeechEvent = {
        type: stt.SpeechEventType.FINAL_TRANSCRIPT,
        alternatives: [
          {
            language: 'en',
            text: result.text,
            startTime,
            endTime: Date.now() / 1000,
            confidence: 1,
          },
        ],
      };
      try {
        this.queue.put(event);
      } catch (e) {
        if (e instanceof Error && e.message.includes('Queue is closed')) {
          return;
        }
        throw e;
      }
    });

    try {
      for await (const frame of this.input) {
        if (this.abortSignal.aborted) break;
        if (typeof frame === 'symbol') continue;
        const pcm = audioFrameToI16(frame);
        if (pcm.length > 0) {
          await client.sendAudio(pcm);
        }
      }

      // Flush remaining on stream end
      const finalResult = await client.triggerTranscription();
      if (finalResult.text.trim()) {
        const event: stt.SpeechEvent = {
          type: stt.SpeechEventType.FINAL_TRANSCRIPT,
          alternatives: [
            {
              language: 'en',
              text: finalResult.text,
              startTime,
              endTime: Date.now() / 1000,
              confidence: 1,
            },
          ],
        };
        try {
          this.queue.put(event);
        } catch {
          // Queue closed
        }
      }
    } finally {
      await client.disconnect();
    }
  }
}

/**
 * Extract Int16Array PCM from a LiveKit AudioFrame.
 * Matches the pattern in kyutai-stt-adapter.ts audioFrameToPcm().
 */
function audioFrameToI16(frame: AudioFrame): Int16Array {
  const data = frame.data;
  if (!data || data.length === 0) {
    return new Int16Array(0);
  }
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return slice instanceof ArrayBuffer
    ? new Int16Array(slice)
    : new Int16Array(0);
}
