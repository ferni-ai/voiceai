/**
 * LiveKit TTS Adapter for Qwen3-TTS
 *
 * Bridges Qwen3-TTS (HTTP synthesize) to LiveKit's TTS interface so that
 * AgentSession can use it when USE_QWEN3_OMNI is set.
 * Output is wrapped with post-TTS enhancement (betterThanHuman preset).
 *
 * @module integrations/qwen3-omni/adapters/livekit-tts-adapter
 */

import { AudioFrame } from '@livekit/rtc-node';
import { DEFAULT_API_CONNECT_OPTIONS, tts, type APIConnectOptions } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { createLogger } from '../../../utils/safe-logger.js';
import { Qwen3TTSClient } from '../tts-client.js';
import {
  applyPostTTSEnhancement,
  buildPersonaPostTTSConfig,
} from '../../../agents/shared/performance/post-tts-transform.js';

const log = createLogger({ module: 'qwen3-omni-tts-adapter' });

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_NUM_CHANNELS = 1;

// -----------------------------------------------------------------------------
// PCM TO AUDIO FRAME
// -----------------------------------------------------------------------------

function pcmToAudioFrame(audioData: Uint8Array, sampleRate: number): AudioFrame {
  // PCM 16-bit requires even byte count; warn and truncate if odd
  if (audioData.length % 2 !== 0) {
    log.warn({ length: audioData.length }, 'Odd-length PCM buffer, truncating last byte');
  }
  const sampleCount = Math.floor(audioData.length / 2);

  // Int16Array requires 2-byte aligned offset. If misaligned, copy to new buffer.
  let int16Data: Int16Array;
  if (audioData.byteOffset % 2 !== 0) {
    const aligned = new Uint8Array(sampleCount * 2);
    aligned.set(audioData.subarray(0, sampleCount * 2));
    int16Data = new Int16Array(aligned.buffer, 0, sampleCount);
  } else {
    int16Data = new Int16Array(audioData.buffer, audioData.byteOffset, sampleCount);
  }

  return new AudioFrame(int16Data, sampleRate, 1, sampleCount);
}

// -----------------------------------------------------------------------------
// QWEN3 CHUNKED STREAM
// -----------------------------------------------------------------------------

class Qwen3ChunkedStream extends tts.ChunkedStream {
  private ttsAdapter: Qwen3TTSAdapter;
  private requestId: string;

  constructor(
    text: string,
    ttsAdapter: Qwen3TTSAdapter,
    connOptions: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    abortSignal?: AbortSignal
  ) {
    super(text, ttsAdapter, connOptions, abortSignal);
    this.ttsAdapter = ttsAdapter;
    this.requestId = `qwen3_tts_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  get label(): string {
    return this.ttsAdapter.label;
  }

  protected async run(): Promise<void> {
    const segmentId = `seg_${Date.now()}`;
    try {
      const result = await this.ttsAdapter.synthesizeWithClient(this.inputText);
      let frame = pcmToAudioFrame(result.audioData, result.sampleRate);
      // Post-TTS enhancement (betterThanHuman preset)
      try {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(frame);
            controller.close();
          },
        });
        const config = buildPersonaPostTTSConfig(this.ttsAdapter.personaId);
        const enhancedStream = await applyPostTTSEnhancement(stream, config);
        const frames: AudioFrame[] = [];
        const reader = enhancedStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) frames.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        if (frames.length > 0) {
          for (let i = 0; i < frames.length; i++) {
            this.queue.put({
              requestId: this.requestId,
              segmentId: `${segmentId}_${i}`,
              frame: frames[i],
              deltaText: result.text,
              final: i === frames.length - 1,
            });
          }
          return;
        }
      } catch (enhanceError) {
        log.debug(
          { error: String(enhanceError), text: this.inputText },
          'Post-TTS enhancement failed; using raw frame'
        );
      }
      this.queue.put({
        requestId: this.requestId,
        segmentId,
        frame,
        deltaText: result.text,
        final: true,
      });
    } catch (error) {
      log.error({ error: String(error), text: this.inputText }, 'Qwen3-TTS synthesize failed');
      throw error;
    }
  }
}

// -----------------------------------------------------------------------------
// QWEN3 TTS ADAPTER
// -----------------------------------------------------------------------------

export interface Qwen3TTSAdapterConfig {
  serverUrl: string;
  personaId: string;
  language?: string;
}

/**
 * LiveKit TTS implementation that delegates to Qwen3-TTS.
 */
export class Qwen3TTSAdapter extends tts.TTS {
  private client: Qwen3TTSClient;
  private _personaId: string;

  constructor(config: Qwen3TTSAdapterConfig) {
    super(DEFAULT_SAMPLE_RATE, DEFAULT_NUM_CHANNELS, { streaming: false });
    this._personaId = config.personaId;
    this.client = new Qwen3TTSClient({
      serverUrl: config.serverUrl,
      language: (config.language ?? 'English') as 'English' | 'Chinese' | 'Japanese' | 'Korean',
    });
  }

  get label(): string {
    return 'Qwen3-TTS';
  }

  /**
   * Return persona-based voice identifier (for compatibility with logging in agent-setup).
   */
  getVoiceId(): string {
    return `qwen3-tts:${this._personaId}`;
  }

  get personaId(): string {
    return this._personaId;
  }

  /**
   * Internal: call Qwen3-TTS and return raw result (for ChunkedStream).
   */
  async synthesizeWithClient(text: string): Promise<{
    audioData: Uint8Array;
    sampleRate: number;
    text: string;
  }> {
    const result = await this.client.synthesize({
      text,
      personaId: this._personaId,
    });
    return {
      audioData: result.audioData,
      sampleRate: result.sampleRate,
      text: result.text,
    };
  }

  synthesize(
    text: string,
    connOptions?: APIConnectOptions,
    abortSignal?: AbortSignal
  ): tts.ChunkedStream {
    const opts = { ...DEFAULT_API_CONNECT_OPTIONS, ...connOptions };
    return new Qwen3ChunkedStream(text, this, opts, abortSignal);
  }

  stream(options?: { connOptions?: APIConnectOptions }): tts.SynthesizeStream {
    const connOptions = {
      ...DEFAULT_API_CONNECT_OPTIONS,
      ...options?.connOptions,
    };
    return new Qwen3SynthesizeStream(this, connOptions);
  }
}

// -----------------------------------------------------------------------------
// QWEN3 SYNTHESIZE STREAM (for streaming text input)
// -----------------------------------------------------------------------------

class Qwen3SynthesizeStream extends tts.SynthesizeStream {
  private ttsAdapter: Qwen3TTSAdapter;

  constructor(ttsAdapter: Qwen3TTSAdapter, connOptions: APIConnectOptions) {
    super(ttsAdapter, connOptions);
    this.ttsAdapter = ttsAdapter;
  }

  get label(): string {
    return this.ttsAdapter.label;
  }

  protected async run(): Promise<void> {
    const requestId = `qwen3_stream_${Date.now()}`;
    let segmentId = 0;
    try {
      for await (const input of this.input) {
        if (input === tts.SynthesizeStream.FLUSH_SENTINEL) {
          continue;
        }
        if (this.abortController.signal.aborted) break;
        const text = input as string;
        if (!text.trim()) continue;
        const result = await this.ttsAdapter.synthesizeWithClient(text);
        let frame = pcmToAudioFrame(result.audioData, result.sampleRate);
        try {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(frame);
              controller.close();
            },
          });
          const config = buildPersonaPostTTSConfig(this.ttsAdapter.personaId);
          const enhancedStream = await applyPostTTSEnhancement(stream, config);
          const frames: AudioFrame[] = [];
          const reader = enhancedStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) frames.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          if (frames.length > 0) {
            for (let i = 0; i < frames.length; i++) {
              this.queue.put({
                requestId,
                segmentId: `seg_${segmentId++}`,
                frame: frames[i],
                deltaText: result.text,
                final: i === frames.length - 1,
              });
            }
            continue;
          }
        } catch (enhanceError) {
          log.debug({ error: String(enhanceError), text }, 'Post-TTS enhancement failed; using raw frame');
        }
        this.queue.put({
          requestId,
          segmentId: `seg_${segmentId++}`,
          frame,
          deltaText: result.text,
          final: true,
        });
      }
      this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
    } catch (error) {
      log.error({ error: String(error) }, 'Qwen3-TTS stream failed');
      throw error;
    }
  }
}
