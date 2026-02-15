/**
 * Kyutai STT LiveKit adapter.
 *
 * Wraps KyutaiSTTClient as an STT that implements the LiveKit STT interface.
 * Converts AudioFrame stream to PCM and Kyutai transcript/VAD events to SpeechEvent.
 *
 * Use when USE_KYUTAI_STT=true; pass to AgentSession as stt.
 */

import type { AudioFrame } from '@livekit/rtc-node';
import { stt, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { KyutaiSTTClient } from './kyutai-stt.js';

const log = createLogger({ module: 'KyutaiSTTAdapter' });

const KYUTAI_STT_LABEL = 'kyutai';
const KYUTAI_STT_SAMPLE_RATE = 16000;

export interface KyutaiSTTAdapterConfig {
  /** WebSocket URL for ASR streaming (default: KYUTAI_STT_URL env) */
  sttUrl?: string;
  /** Auth token (optional) */
  authId?: string;
}

/**
 * LiveKit STT implementation that uses Kyutai STT WebSocket.
 */
export class KyutaiSTT extends stt.STT {
  readonly label = KYUTAI_STT_LABEL;
  readonly sttUrl: string;
  private readonly authId: string;

  constructor(config: KyutaiSTTAdapterConfig = {}) {
    super({
      streaming: true,
      interimResults: true,
    });
    const envUrl = process.env.KYUTAI_STT_URL;
    this.sttUrl = config.sttUrl || envUrl || 'ws://localhost:8089/api/asr-streaming';
    this.authId = config.authId || process.env.KYUTAI_API_KEY || 'public_token';
  }

  protected _recognize(_frame: unknown, _abortSignal?: AbortSignal): Promise<stt.SpeechEvent> {
    return Promise.reject(new Error('KyutaiSTT is streaming-only; use stream()'));
  }

  stream(options?: { connOptions?: APIConnectOptions }): KyutaiSpeechStream {
    return new KyutaiSpeechStream(
      this,
      KYUTAI_STT_SAMPLE_RATE,
      this.sttUrl,
      options?.connOptions
    );
  }
}

/**
 * SpeechStream that forwards audio to Kyutai STT and emits SpeechEvents.
 */
class KyutaiSpeechStream extends stt.SpeechStream {
  override label = KYUTAI_STT_LABEL;
  #sttUrl: string;

  constructor(
    kyutaiStt: KyutaiSTT,
    sampleRate: number,
    sttUrl: string,
    connOptions?: APIConnectOptions
  ) {
    super(kyutaiStt, sampleRate, connOptions);
    this.#sttUrl = sttUrl;
  }

  protected async run(): Promise<void> {
    const client = new KyutaiSTTClient({
      sttUrl: this.#sttUrl,
      sampleRate: KYUTAI_STT_SAMPLE_RATE,
    });

    try {
      await client.connect();
    } catch (err) {
      log.warn({ error: err, url: this.#sttUrl }, 'Kyutai STT connect failed');
      throw err;
    }

    const startTime = Date.now() / 1000;
    client.onTranscript((ev) => {
      const event: stt.SpeechEvent = {
        type: ev.isFinal ? stt.SpeechEventType.FINAL_TRANSCRIPT : stt.SpeechEventType.INTERIM_TRANSCRIPT,
        alternatives: [
          {
            language: 'en',
            text: ev.text,
            startTime,
            endTime: startTime,
            confidence: 1,
            words: ev.words?.map((w) => ({
              text: w.word,
              startTime: w.startMs != null ? w.startMs / 1000 : undefined,
              endTime: w.endMs != null ? w.endMs / 1000 : undefined,
            })),
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

    client.onVAD((ev) => {
      const event: stt.SpeechEvent = {
        type: ev.isSpeaking ? stt.SpeechEventType.START_OF_SPEECH : stt.SpeechEventType.END_OF_SPEECH,
        alternatives: [
          { language: 'en', text: '', startTime: 0, endTime: 0, confidence: 0 },
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
        const pcm = audioFrameToPcm(frame);
        if (pcm.byteLength > 0) {
          client.sendAudio(pcm);
        }
      }
    } finally {
      client.close();
    }
  }
}

function audioFrameToPcm(frame: AudioFrame): ArrayBuffer {
  const data = frame.data;
  if (!data || data.length === 0) {
    return new ArrayBuffer(0);
  }
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return slice instanceof ArrayBuffer ? slice : new ArrayBuffer(0);
}
