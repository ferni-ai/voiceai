/**
 * Native Omni RealtimeModel – in-process STS via Candle NAPI.
 *
 * Implements LiveKit RealtimeModel + RealtimeSession using NativeOmniEngine
 * (ferni-omni) instead of HTTP. pushAudio buffers PCM; commitAudio runs the
 * pipeline and streams 24 kHz audio out. No LLM/TTS – raw audio → pipeline → audio.
 *
 * Sample rates: pipeline expects 16 kHz in, produces 24 kHz out. When input is
 * 48 kHz (LiveKit default), we resample to 16 kHz using @ferni/audio resampleF32
 * when available, else TS linear interpolation.
 */

import { createRequire } from 'node:module';
import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import { NativeOmniEngine } from '../native-engine.js';

const log = createLogger({ module: 'NativeOmniRealtimeModel' });

const requireFn = createRequire(import.meta.url);

/** Lazy-loaded @ferni/audio resampleF32 (48k→16k, 24k→48k). */
let rustResample:
  | ((samples: Float32Array, fromRate: number, toRate: number) => Float32Array)
  | null = null;

function getRustResample(): typeof rustResample {
  if (rustResample !== null) return rustResample;
  try {
    const mod = requireFn('@ferni/audio') as {
      resampleF32?: (s: Float32Array, a: number, b: number) => Float32Array;
    };
    if (typeof mod?.resampleF32 === 'function') {
      rustResample = mod.resampleF32;
      return rustResample;
    }
  } catch {
    /* @ferni/audio not available */
  }
  return null;
}

const NATIVE_OMNI_CAPABILITIES: llm.RealtimeCapabilities = {
  messageTruncation: false,
  turnDetection: false,
  userTranscription: true,
  autoToolReplyGeneration: false,
  audioOutput: true,
  manualFunctionCalls: false,
};

export interface NativeOmniRealtimeModelConfig {
  /** In-process Omni engine (from NativeOmniEngine.create). */
  engine: NativeOmniEngine;
  /** Sample rate of incoming LiveKit frames (default 16000; 48000 resampled to 16k via @ferni/audio). */
  inputSampleRate?: number;
  /** Sample rate of pipeline output (default 24000). */
  outputSampleRate?: number;
  /** When set (e.g. 48000), pipeline output is resampled to this rate for LiveKit. Uses @ferni/audio when available. */
  liveKitOutputSampleRate?: number;
  /** Max buffer duration before auto-commit (ms). */
  maxBufferDurationMs?: number;
}

export class NativeOmniRealtimeModel extends llm.RealtimeModel {
  private readonly _config: NativeOmniRealtimeModelConfig;

  constructor(config: NativeOmniRealtimeModelConfig) {
    super(NATIVE_OMNI_CAPABILITIES);
    this._config = config;
  }

  getConfig(): NativeOmniRealtimeModelConfig {
    return this._config;
  }

  get model(): string {
    return 'qwen3-omni-native';
  }

  session(): llm.RealtimeSession {
    return new NativeOmniRealtimeSession(this);
  }

  override async close(): Promise<void> {
    // Engine is owned by caller; nothing to close
  }
}

export class NativeOmniRealtimeSession extends llm.RealtimeSession {
  private readonly config: NativeOmniRealtimeModelConfig;
  private readonly engine: NativeOmniEngine;

  private audioBuffer: Int16Array[] = [];
  private audioBufferSamples = 0;
  private readonly inputSampleRate: number;
  private readonly outputSampleRate: number;
  private readonly liveKitOutputSampleRate: number | undefined;

  /** Set by commitAudio(); consumed by generateReply() to run the pipeline. */
  private pendingCommittedF32: Float32Array | null = null;

  private _instructions = '';
  private _chatCtx: llm.ChatContext = llm.ChatContext.empty();
  private _toolCtx: llm.ToolContext = llm.toToolContext({});
  private currentAbortController: AbortController | null = null;
  private isGenerating = false;

  constructor(realtimeModel: llm.RealtimeModel) {
    super(realtimeModel);
    const model = realtimeModel as NativeOmniRealtimeModel;
    this.config = model.getConfig();
    this.engine = this.config.engine;
    this.inputSampleRate = this.config.inputSampleRate ?? 16000;
    this.outputSampleRate = this.config.outputSampleRate ?? this.engine.sampleRateOut;
    this.liveKitOutputSampleRate = this.config.liveKitOutputSampleRate;
  }

  override get chatCtx(): llm.ChatContext {
    return this._chatCtx;
  }

  override get tools(): llm.ToolContext {
    return this._toolCtx;
  }

  override async updateInstructions(instructions: string): Promise<void> {
    this._instructions = instructions;
  }

  override async updateChatCtx(chatCtx: llm.ChatContext): Promise<void> {
    this._chatCtx = chatCtx;
  }

  override async updateTools(tools: llm.ToolContext): Promise<void> {
    this._toolCtx = tools;
  }

  override updateOptions(_options: { toolChoice?: unknown }): void {}

  override pushAudio(frame: AudioFrame): void {
    const data = frame.data as Int16Array;
    this.audioBuffer.push(data);
    this.audioBufferSamples += data.length;

    const maxDuration = this.config.maxBufferDurationMs ?? 30000;
    const durationMs = (this.audioBufferSamples / this.inputSampleRate) * 1000;
    if (durationMs > maxDuration) {
      log.warn({ durationMs }, 'Audio buffer exceeded max duration, auto-committing');
      void this.commitAudio();
    }
  }

  override async commitAudio(): Promise<void> {
    if (this.audioBuffer.length === 0) {
      log.debug('No audio to commit');
      return;
    }

    const totalSamples = this.audioBuffer.reduce((sum, b) => sum + b.length, 0);
    const combined = new Int16Array(totalSamples);
    let offset = 0;
    for (const buf of this.audioBuffer) {
      combined.set(buf, offset);
      offset += buf.length;
    }
    this.audioBuffer = [];
    this.audioBufferSamples = 0;

    const pcm16F32 = NativeOmniEngine.int16ToFloat32(combined);
    const inputF32 =
      this.inputSampleRate !== 16000
        ? this.resampleInputTo16k(pcm16F32, this.inputSampleRate)
        : pcm16F32;
    this.pendingCommittedF32 = inputF32;

    this.emit('input_transcription_completed', {
      itemId: `user-audio-${Date.now()}`,
      transcript: '[audio input]',
      isFinal: true,
    });

    await this.generateReply();
  }

  /** Resample input to 16 kHz for pipeline. Uses @ferni/audio resampleF32 when available. */
  private resampleInputTo16k(samples: Float32Array, fromRate: number): Float32Array {
    if (fromRate === 16000) return samples;
    const resample = getRustResample();
    if (resample) {
      return resample(samples, fromRate, 16000);
    }
    return this.downsampleTo16kTS(samples, fromRate);
  }

  /** TS fallback: linear interpolation (e.g. 48k → 16k). */
  private downsampleTo16kTS(samples: Float32Array, fromRate: number): Float32Array {
    const ratio = fromRate / 16000;
    const outLen = Math.floor(samples.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * ratio;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, samples.length - 1);
      const t = srcIdx - lo;
      out[i] = samples[lo]! * (1 - t) + samples[hi]! * t;
    }
    return out;
  }

  override async generateReply(_instructions?: string): Promise<llm.GenerationCreatedEvent> {
    const messageId = `msg-${Date.now()}`;
    const responseId = `resp-${Date.now()}`;

    let textStreamController: ReadableStreamDefaultController<string> | null = null;
    let audioStreamController: ReadableStreamDefaultController<AudioFrame> | null = null;
    let functionStreamController: ReadableStreamDefaultController<llm.FunctionCall> | null = null;

    const textStream = new ReadableStream<string>({
      start(controller) {
        textStreamController = controller;
      },
    });
    const audioStream = new ReadableStream<AudioFrame>({
      start(controller) {
        audioStreamController = controller;
      },
    });
    const functionStream = new ReadableStream<llm.FunctionCall>({
      start(controller) {
        functionStreamController = controller;
      },
    });
    const messageStream = new ReadableStream<llm.MessageGeneration>({
      start(controller) {
        controller.enqueue({
          messageId,
          textStream,
          audioStream,
        });
        controller.close();
      },
    });

    const event: llm.GenerationCreatedEvent = {
      messageStream,
      functionStream,
      userInitiated: true,
    };
    this.emit('generation_created', event);

    const pending = this.pendingCommittedF32;
    this.pendingCommittedF32 = null;
    if (pending && pending.length > 0) {
      this.runPipelineWithControllers(
        pending,
        textStreamController!,
        audioStreamController!,
        functionStreamController!
      );
    }
    type TextCtrl = ReadableStreamDefaultController<string>;
    type AudioCtrl = ReadableStreamDefaultController<AudioFrame>;
    type FnCtrl = ReadableStreamDefaultController<llm.FunctionCall>;
    const t = textStreamController as TextCtrl | null;
    const a = audioStreamController as AudioCtrl | null;
    const f = functionStreamController as FnCtrl | null;
    try {
      t?.close();
      a?.close();
      f?.close();
    } finally {
      this.isGenerating = false;
      this.currentAbortController = null;
    }

    return event;
  }

  private runPipelineWithControllers(
    pending: Float32Array,
    _textCtrl: ReadableStreamDefaultController<string>,
    audioCtrl: ReadableStreamDefaultController<AudioFrame>,
    _fnCtrl: ReadableStreamDefaultController<llm.FunctionCall>
  ): void {
    this.isGenerating = true;
    this.currentAbortController = new AbortController();
    try {
      let outF32 = this.engine.processAudio(pending);
      if (this.currentAbortController.signal.aborted) return;

      let frameSampleRate = this.outputSampleRate;
      if (
        this.liveKitOutputSampleRate != null &&
        this.liveKitOutputSampleRate !== this.outputSampleRate
      ) {
        const resample = getRustResample();
        if (resample) {
          outF32 = resample(outF32, this.outputSampleRate, this.liveKitOutputSampleRate);
          frameSampleRate = this.liveKitOutputSampleRate;
        }
      }

      const outInt16 = NativeOmniEngine.float32ToInt16(outF32);
      const frame = new AudioFrame(outInt16, frameSampleRate, 1, outInt16.length);
      audioCtrl.enqueue(frame);
    } catch (err) {
      log.error({ err: String(err) }, 'Native Omni pipeline failed');
      audioCtrl.error(err as Error);
    }
    // Controllers are closed by generateReply() so we don't double-close
  }

  override async interrupt(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.isGenerating = false;
  }

  override async truncate(_options: {
    messageId: string;
    audioEndMs: number;
    modalities?: ('text' | 'audio')[];
    audioTranscript?: string;
  }): Promise<void> {}

  override startUserActivity(): void {
    super.startUserActivity();
    this.emit('input_speech_started', {});
  }

  override async clearAudio(): Promise<void> {
    this.audioBuffer = [];
    this.audioBufferSamples = 0;
  }

  override async close(): Promise<void> {
    await this.interrupt();
    this.audioBuffer = [];
  }
}
