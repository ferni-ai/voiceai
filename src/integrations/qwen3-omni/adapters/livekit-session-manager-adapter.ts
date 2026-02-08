/**
 * LiveKit RealtimeModel adapter that delegates to Qwen3OmniSessionManager.
 *
 * When USE_QWEN3_OMNI_FULL_STACK=true (with Director Mode), this adapter is used
 * so that the full Better Than Human stack (emotion, personality, superhuman,
 * quality, data-channel events) runs and reaches the frontend.
 *
 * Flow: pushAudio → commitAudio → transcribeAudio → session.processTurn(transcript)
 *       → push text + audio to streams, forward session events via sendDataMessage.
 *
 * @module integrations/qwen3-omni/adapters/livekit-session-manager-adapter
 */

import { llm } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { createLogger } from '../../../utils/safe-logger.js';
import type { Qwen3OmniClient } from '../client.js';
import type { Qwen3OmniSessionManager } from '../session/session-manager.js';
import { createQwen3OmniSession } from '../session/session-manager.js';
import type { Qwen3OmniSessionConfig } from '../types.js';
import { bytesToInt16, pcmToWavDataUrl } from '../utils/wav-encoder.js';

const log = createLogger({ module: 'Qwen3SessionManagerAdapter' });

// =============================================================================
// CAPABILITIES
// =============================================================================

const CAPABILITIES: llm.RealtimeCapabilities = {
  messageTruncation: false,
  turnDetection: false,
  userTranscription: true,
  autoToolReplyGeneration: false,
  audioOutput: true,
};

// =============================================================================
// CONFIG
// =============================================================================

export interface SessionManagerRealtimeModelConfig {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Persona ID */
  personaId: string;
  /** Qwen3-Omni Thinker server URL */
  serverUrl?: string;
  /** Qwen3-TTS server URL */
  ttsServerUrl?: string;
  /** Session services (DI container); optional for Director path */
  services?: unknown;
  /** Callback to send data messages to the client (e.g. LiveKit data channel) */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => void | Promise<void>;
  /** Client for transcribeAudio (audio → transcript) */
  client: Qwen3OmniClient;
  /** Input sample rate (default: 24000) */
  inputSampleRate?: number;
  /** Output sample rate (default: 24000) */
  outputSampleRate?: number;
  /** Max audio buffer duration before auto-commit (ms) */
  maxBufferDurationMs?: number;
}

// =============================================================================
// SESSION MANAGER REALTIME MODEL
// =============================================================================

export class SessionManagerRealtimeModel extends llm.RealtimeModel {
  private readonly _config: SessionManagerRealtimeModelConfig;

  constructor(config: SessionManagerRealtimeModelConfig) {
    super(CAPABILITIES);
    this._config = config;
  }

  getConfig(): SessionManagerRealtimeModelConfig {
    return this._config;
  }

  get model(): string {
    return 'qwen3-omni-session-manager';
  }

  session(): llm.RealtimeSession {
    return new SessionManagerRealtimeSession(this);
  }

  override async close(): Promise<void> {
    // Session cleanup is per-session; no persistent connections here
  }
}

// =============================================================================
// SESSION MANAGER REALTIME SESSION
// =============================================================================

export class SessionManagerRealtimeSession extends llm.RealtimeSession {
  private readonly config: SessionManagerRealtimeModelConfig;
  private readonly sessionManager: Qwen3OmniSessionManager;
  private readonly client: Qwen3OmniClient;

  private audioBuffer: Uint8Array[] = [];
  private audioBufferDurationMs = 0;
  private readonly inputSampleRate: number;
  private readonly outputSampleRate: number;
  private readonly maxBufferDurationMs: number;

  /** Set by commitAudio before calling generateReply; consumed by runSessionTurn */
  private pendingAudioWavDataUrl: string | null = null;

  private isGenerating = false;
  private sessionInitialized = false;

  private _chatCtx: llm.ChatContext;
  private _toolCtx: llm.ToolContext = {};

  constructor(realtimeModel: llm.RealtimeModel) {
    super(realtimeModel);
    const model = realtimeModel as SessionManagerRealtimeModel;
    this.config = model.getConfig();
    this.client = this.config.client;
    this.inputSampleRate = this.config.inputSampleRate ?? 24000;
    this.outputSampleRate = this.config.outputSampleRate ?? 24000;
    this.maxBufferDurationMs = this.config.maxBufferDurationMs ?? 30000;

    const sessionConfig: Qwen3OmniSessionConfig = {
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      personaId: this.config.personaId,
      serverUrl: this.config.serverUrl,
      ttsServerUrl: this.config.ttsServerUrl,
      services: this.config.services ?? {},
      streamingEnabled: true,
      sendDataMessage: this.config.sendDataMessage,
    };
    this.sessionManager = createQwen3OmniSession(sessionConfig);
    this._chatCtx = llm.ChatContext.empty();

    this.forwardSessionEvents();
  }

  // ===========================================================================
  // ABSTRACT IMPLEMENTATIONS
  // ===========================================================================

  override get chatCtx(): llm.ChatContext {
    return this._chatCtx;
  }

  override get tools(): llm.ToolContext {
    return this._toolCtx;
  }

  override async updateInstructions(_instructions: string): Promise<void> {
    // Session manager handles its own prompt building
  }

  override async updateChatCtx(chatCtx: llm.ChatContext): Promise<void> {
    this._chatCtx = chatCtx;
  }

  override async updateTools(tools: llm.ToolContext): Promise<void> {
    this._toolCtx = tools;
  }

  override updateOptions(_options: { toolChoice?: unknown }): void {
    // No-op; session manager handles tool selection internally
  }

  private forwardSessionEvents(): void {
    const send = this.config.sendDataMessage;
    if (!send) return;
    const on = (event: string, payload: Record<string, unknown>) => {
      void Promise.resolve(send(event, payload)).catch((e) =>
        log.warn({ error: String(e), event }, 'sendDataMessage failed')
      );
    };
    this.sessionManager.on('qualityMetrics', (p: { qualityMetrics: unknown }) =>
      on('qualityMetrics', p as Record<string, unknown>)
    );
    this.sessionManager.on('personalitySignals', (p: { personalityContext: unknown }) =>
      on('personalitySignals', p as Record<string, unknown>)
    );
    this.sessionManager.on('textChunk', (p: { content: string; accumulated: string }) =>
      on('textChunk', p as Record<string, unknown>)
    );
  }

  override pushAudio(frame: AudioFrame): void {
    const data = frame.data as Int16Array;
    const pcmBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.audioBuffer.push(pcmBytes);
    const frameDurationMs = (frame.samplesPerChannel / frame.sampleRate) * 1000;
    this.audioBufferDurationMs += frameDurationMs;
    if (this.audioBufferDurationMs > this.maxBufferDurationMs) {
      log.warn(
        { durationMs: this.audioBufferDurationMs },
        'Audio buffer exceeded max, auto-committing'
      );
      void this.commitAudio();
    }
  }

  override async commitAudio(): Promise<void> {
    if (this.audioBuffer.length === 0) {
      log.debug('No audio to commit');
      return;
    }
    const totalLength = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of this.audioBuffer) {
      combined.set(buf, offset);
      offset += buf.length;
    }
    this.audioBuffer = [];
    this.audioBufferDurationMs = 0;

    const wavDataUrl = pcmToWavDataUrl(combined, {
      sampleRate: this.inputSampleRate,
      bitsPerSample: 16,
      numChannels: 1,
    });
    this.pendingAudioWavDataUrl = wavDataUrl;

    this.emit('input_transcription_completed', {
      itemId: `user-audio-${Date.now()}`,
      transcript: '[audio input]',
      isFinal: true,
    });

    await this.generateReply();
  }

  override async clearAudio(): Promise<void> {
    this.audioBuffer = [];
    this.audioBufferDurationMs = 0;
    this.pendingAudioWavDataUrl = null;
    log.debug('Audio buffer cleared');
  }

  override async generateReply(instructions?: string): Promise<llm.GenerationCreatedEvent> {
    if (this.isGenerating) {
      await this.interrupt();
    }
    this.isGenerating = true;

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const responseId = `resp-${Date.now()}`;

    let textController: ReadableStreamDefaultController<string> | null = null;
    let audioController: ReadableStreamDefaultController<AudioFrame> | null = null;
    let functionController: ReadableStreamDefaultController<llm.FunctionCall> | null = null;

    const textStream = new ReadableStream<string>({
      start(controller) {
        textController = controller;
      },
    });
    const audioStream = new ReadableStream<AudioFrame>({
      start(controller) {
        audioController = controller;
      },
    });
    const functionStream = new ReadableStream<llm.FunctionCall>({
      start(controller) {
        functionController = controller;
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

    const wavDataUrl = this.pendingAudioWavDataUrl;
    this.pendingAudioWavDataUrl = null;

    this.runSessionTurn(
      wavDataUrl,
      instructions,
      textController!,
      audioController!,
      functionController!
    ).catch((error) => {
      log.error({ error: String(error) }, 'Session turn failed');
      try {
        textController?.error(error);
      } catch {
        textController?.close();
      }
      try {
        audioController?.error(error);
      } catch {
        audioController?.close();
      }
      try {
        functionController?.error(error);
      } catch {
        functionController?.close();
      }
    });

    return {
      messageStream,
      functionStream,
      userInitiated: true,
      responseId,
    };
  }

  private async runSessionTurn(
    wavDataUrl: string | null,
    _instructions: string | undefined,
    textController: ReadableStreamDefaultController<string>,
    audioController: ReadableStreamDefaultController<AudioFrame>,
    _functionController: ReadableStreamDefaultController<llm.FunctionCall>
  ): Promise<void> {
    try {
      if (!this.sessionInitialized) {
        await this.sessionManager.initialize();
        this.sessionInitialized = true;
      }

      const transcript =
        wavDataUrl && wavDataUrl.length > 0
          ? await this.client.transcribeAudio(wavDataUrl)
          : '[audio input]';

      const turnContext = await this.sessionManager.processTurn(transcript);

      if (turnContext.agentResponse) {
        textController.enqueue(turnContext.agentResponse);
      }
      textController.close();

      if (turnContext.audio?.audioData && turnContext.audio.audioData.length > 0) {
        const sampleCount = Math.floor(turnContext.audio.audioData.length / 2);
        const samples = bytesToInt16(turnContext.audio.audioData);
        const frame = new AudioFrame(
          samples,
          turnContext.audio.sampleRate ?? this.outputSampleRate,
          1,
          sampleCount
        );
        audioController.enqueue(frame);
      }
      audioController.close();
    } finally {
      this.isGenerating = false;
    }
  }

  override async interrupt(): Promise<void> {
    this.isGenerating = false;
    log.debug('Session manager generation interrupted');
  }

  override async truncate(_options: {
    messageId: string;
    audioEndMs: number;
    modalities?: ('text' | 'audio')[];
    audioTranscript?: string;
  }): Promise<void> {
    log.debug('Truncation not supported for session manager adapter');
  }

  override startUserActivity(): void {
    super.startUserActivity();
    this.emit('input_speech_started', {});
  }

  override async close(): Promise<void> {
    await this.sessionManager.cleanup();
    await super.close();
  }
}
