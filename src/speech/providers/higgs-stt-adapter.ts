/**
 * Higgs STT LiveKit adapter.
 *
 * Uses the Higgs pipeline (TTS_PROVIDER=higgs-pipeline) as the session STT:
 * forwards user audio to Higgs, uses energy-based VAD for turn boundaries,
 * and emits FINAL_TRANSCRIPT from triggerTranscription() so the session gets
 * Higgs transcript + biomarkers without needing Gemini/OpenAI for STT.
 *
 * Use when TTS_PROVIDER=higgs-pipeline; pass to AgentSession as stt.
 * Enables "Higgs STT + Higgs TTS + any LLM" (better than Kyutai: one pipeline, biomarkers).
 *
 * @module speech/providers/higgs-stt-adapter
 */

import type { AudioFrame } from '@livekit/rtc-node';
import { stt, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getHiggsSTTProvider,
  resampleTo16k,
  HIGGS_STT_SAMPLE_RATE,
} from './higgs-stt-integration.js';
import { setHiggsSessionSTTBiomarkers } from './higgs-session-stt-store.js';

const log = createLogger({ module: 'HiggsSTTAdapter' });

const HIGGS_STT_LABEL = 'higgs';

/** Default RMS threshold for energy-based VAD (16-bit PCM). */
const DEFAULT_RMS_THRESHOLD = 400;
/** Frames of silence before end-of-speech (at ~20ms/frame ≈ 300ms). */
const SILENCE_FRAMES_FOR_END = 15;
/** Frames of speech before start-of-speech. */
const SPEECH_FRAMES_FOR_START = 2;

export interface HiggsSTTConfig {
  /** Session ID for storing biomarkers (transcript-handler reads from store). */
  sessionId: string;
  /** RMS threshold for VAD (default 400). */
  rmsThreshold?: number;
  /** Frames of silence to trigger end-of-speech (default 15). */
  silenceFramesForEnd?: number;
}

/**
 * LiveKit STT implementation that uses the Higgs pipeline for transcription.
 * Turn boundaries come from energy-based VAD; transcript + biomarkers from Higgs.
 */
export class HiggsSTT extends stt.STT {
  readonly label = HIGGS_STT_LABEL;
  readonly sessionId: string;
  readonly rmsThreshold: number;
  readonly silenceFramesForEnd: number;

  constructor(config: HiggsSTTConfig) {
    super({
      streaming: true,
      interimResults: true,
    });
    this.sessionId = config.sessionId;
    this.rmsThreshold = config.rmsThreshold ?? DEFAULT_RMS_THRESHOLD;
    this.silenceFramesForEnd = config.silenceFramesForEnd ?? SILENCE_FRAMES_FOR_END;
  }

  protected _recognize(_frame: unknown, _abortSignal?: AbortSignal): Promise<stt.SpeechEvent> {
    return Promise.reject(new Error('HiggsSTT is streaming-only; use stream()'));
  }

  stream(options?: { connOptions?: APIConnectOptions }): HiggsSpeechStream {
    return new HiggsSpeechStream(this, HIGGS_STT_SAMPLE_RATE, options?.connOptions);
  }
}

/**
 * SpeechStream that forwards audio to Higgs and emits SpeechEvents from VAD + triggerTranscription.
 */
class HiggsSpeechStream extends stt.SpeechStream {
  override label = HIGGS_STT_LABEL;
  #stt: HiggsSTT;
  #sampleRate: number;

  constructor(
    higgsStt: HiggsSTT,
    sampleRate: number,
    connOptions?: APIConnectOptions
  ) {
    super(higgsStt, sampleRate, connOptions);
    this.#stt = higgsStt;
    this.#sampleRate = sampleRate;
  }

  protected async run(): Promise<void> {
    const provider = getHiggsSTTProvider();
    if (!provider) {
      throw new Error(
        'Higgs STT provider not available. Set USE_HIGGS_STT=true and HIGGS_PIPELINE_URL=ws://... (or TTS_PROVIDER=higgs-pipeline) and ensure Higgs pipeline is running.'
      );
    }

    const sessionId = this.#stt.sessionId;
    const rmsThreshold = this.#stt.rmsThreshold;
    const silenceFramesForEnd = this.#stt.silenceFramesForEnd;
    const startTime = Date.now() / 1000;

    let speechFrames = 0;
    let silenceFrames = 0;
    let inSpeech = false;
    let emittedStart = false;

    const emitStartOfSpeech = (): void => {
      if (emittedStart) return;
      emittedStart = true;
      try {
        this.queue.put({
          type: stt.SpeechEventType.START_OF_SPEECH,
          alternatives: [{ language: 'en', text: '', startTime: 0, endTime: 0, confidence: 0 }],
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes('Queue is closed')) return;
        throw e;
      }
    };

    const emitEndOfSpeech = (): void => {
      if (!emittedStart) return;
      try {
        this.queue.put({
          type: stt.SpeechEventType.END_OF_SPEECH,
          alternatives: [{ language: 'en', text: '', startTime: 0, endTime: 0, confidence: 0 }],
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes('Queue is closed')) return;
        throw e;
      }
      emittedStart = false;
    };

    const emitFinalTranscript = (text: string): void => {
      try {
        this.queue.put({
          type: stt.SpeechEventType.FINAL_TRANSCRIPT,
          alternatives: [
            {
              language: 'en',
              text,
              startTime,
              endTime: Date.now() / 1000,
              confidence: 1,
            },
          ],
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes('Queue is closed')) return;
        throw e;
      }
    };

    function rmsFromFrame(frame: AudioFrame): number {
      const d = frame.data;
      if (!d || d.length === 0) return 0;
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        const s = d[i]!;
        sum += s * s;
      }
      return Math.sqrt(sum / d.length);
    }

    try {
      for await (const frame of this.input) {
        if (this.abortSignal.aborted) break;
        if (typeof frame === 'symbol') continue;

        const pcm = frame.data;
        if (!pcm || pcm.length === 0) continue;

        const resampled = resampleTo16k(pcm, frame.sampleRate);
        if (resampled.length > 0) {
          void provider.sendUserAudio(resampled).catch((err) => {
            log.warn({ error: String(err) }, 'Higgs sendUserAudio failed');
          });
        }

        const rms = rmsFromFrame(frame);
        const isSpeech = rms >= rmsThreshold;

        if (isSpeech) {
          silenceFrames = 0;
          speechFrames++;
          if (speechFrames >= SPEECH_FRAMES_FOR_START && !inSpeech) {
            inSpeech = true;
            emitStartOfSpeech();
          }
        } else {
          speechFrames = 0;
          if (inSpeech) {
            silenceFrames++;
            if (silenceFrames >= silenceFramesForEnd) {
              inSpeech = false;
              silenceFrames = 0;
              try {
                const result = await provider.triggerTranscription();
                const text = (result.text ?? '').trim();
                if (result.biomarkers) {
                  setHiggsSessionSTTBiomarkers(sessionId, result.biomarkers);
                }
                emitFinalTranscript(text || '');
              } catch (err) {
                log.warn({ error: String(err) }, 'Higgs triggerTranscription failed');
                setHiggsSessionSTTBiomarkers(sessionId, undefined);
                emitFinalTranscript('');
              }
              emitEndOfSpeech();
            }
          }
        }
      }

      if (inSpeech) {
        try {
          const result = await provider.triggerTranscription();
          const text = (result.text ?? '').trim();
          if (result.biomarkers) {
            setHiggsSessionSTTBiomarkers(sessionId, result.biomarkers);
          }
          emitFinalTranscript(text || '');
        } catch (err) {
          log.warn({ error: String(err) }, 'Higgs triggerTranscription failed');
          setHiggsSessionSTTBiomarkers(sessionId, undefined);
          emitFinalTranscript('');
        }
        emitEndOfSpeech();
      }
    } finally {
      // no connection to close — we use the shared Higgs pipeline provider
    }
  }
}
