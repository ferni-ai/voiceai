/**
 * Qwen3-Omni RealtimeModel Adapter for LiveKit
 *
 * Implements LiveKit's RealtimeModel + RealtimeSession interfaces to provide
 * Qwen3-Omni's native speech understanding (STT-free) and Qwen3-Omni Talker
 * for audio generation.
 *
 * Architecture:
 * ```
 * User Audio → pushAudio() → PCM buffer → commitAudio() → WAV encode
 *     → Qwen3-Omni HTTP API (audio + text modalities)
 *     → Streaming response: text chunks + audio blob
 *     → Parse character tags [PersonaName]
 *     → Per-segment instruct + voice_design switching
 *     → Audio frames → LiveKit room
 * ```
 *
 * Key features:
 * - Audio buffering with VAD-triggered commit
 * - Ensemble mode: character tag parsing from LLM output
 * - Per-persona voice switching (voice_design + instruct)
 * - Director Mode integration (real-time mood/cast changes)
 */

import { AudioFrame } from '@livekit/rtc-node';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  pcmToWavDataUrl,
  wavDataUrlToPcm,
  int16ToBytes,
  bytesToInt16,
} from '../utils/wav-encoder.js';
import { splitIntoInstructSegments } from '../humanization/instruct-builder.js';
import { humanizeForQwen3 } from '../humanization/text-humanizer.js';

import type { Qwen3OmniClient } from '../client.js';
import type { Qwen3TTSClient } from '../tts-client.js';
import type { DirectorEngine } from '../director/director-engine.js';
import type { PersonaId } from '../director/types.js';
import type { Qwen3FunctionDefinition, Qwen3OmniMessage } from '../types.js';

const log = createLogger({ module: 'Qwen3RealtimeModel' });

// =============================================================================
// TYPES
// =============================================================================

export interface Qwen3RealtimeModelConfig {
  /** Qwen3-Omni Thinker client */
  client: Qwen3OmniClient;
  /** Qwen3-TTS client (for per-segment voice switching) */
  ttsClient?: Qwen3TTSClient;
  /** Director Engine (optional, for Director Mode) */
  directorEngine?: DirectorEngine;
  /** AutoDirector for intelligent cast/scene suggestions (optional) */
  autoDirector?: import('../director/auto-director.js').AutoDirector;
  /** Default persona ID */
  defaultPersonaId: string;
  /** Sample rate for audio input (default: 24000) */
  inputSampleRate?: number;
  /** Sample rate for audio output (default: 24000) */
  outputSampleRate?: number;
  /** Maximum audio buffer duration before auto-commit (ms) */
  maxBufferDurationMs?: number;
  /** Session ID for humanization */
  sessionId: string;
  /** User name for ensemble prompt */
  userName?: string;
}

// =============================================================================
// REALTIME MODEL
// =============================================================================

const QWEN3_CAPABILITIES: llm.RealtimeCapabilities = {
  messageTruncation: false,
  turnDetection: false,
  userTranscription: true,
  autoToolReplyGeneration: false,
  audioOutput: true,
  manualFunctionCalls: false,
};

export class Qwen3OmniRealtimeModel extends llm.RealtimeModel {
  private readonly _config: Qwen3RealtimeModelConfig;

  constructor(config: Qwen3RealtimeModelConfig) {
    super(QWEN3_CAPABILITIES);
    this._config = config;
  }

  /** Expose config for session (session is created with only realtimeModel) */
  getConfig(): Qwen3RealtimeModelConfig {
    return this._config;
  }

  get model(): string {
    return 'qwen3-omni-director';
  }

  session(): llm.RealtimeSession {
    return new Qwen3OmniRealtimeSession(this);
  }

  override async close(): Promise<void> {
    // No persistent connections to close (HTTP-based)
  }
}

// =============================================================================
// REALTIME SESSION
// =============================================================================

export class Qwen3OmniRealtimeSession extends llm.RealtimeSession {
  private readonly config: Qwen3RealtimeModelConfig;
  private readonly client: Qwen3OmniClient;
  private readonly ttsClient?: Qwen3TTSClient;
  private readonly directorEngine?: DirectorEngine;

  // Audio input buffer
  private audioBuffer: Uint8Array[] = [];
  private audioBufferDurationMs = 0;
  private readonly inputSampleRate: number;
  private readonly outputSampleRate: number;

  // Conversation state
  private conversationHistory: Qwen3OmniMessage[] = [];
  private _instructions = '';
  private _chatCtx: llm.ChatContext;
  private _toolCtx: llm.ToolContext = llm.toToolContext({});
  private _toolsForApi: Qwen3FunctionDefinition[] = [];

  // Generation state
  private currentAbortController: AbortController | null = null;
  private isGenerating = false;

  constructor(realtimeModel: llm.RealtimeModel) {
    super(realtimeModel);
    const model = realtimeModel as Qwen3OmniRealtimeModel;
    this.config = model.getConfig();
    this.client = this.config.client;
    this.ttsClient = this.config.ttsClient;
    this.directorEngine = this.config.directorEngine;
    this.inputSampleRate = this.config.inputSampleRate ?? 24000;
    this.outputSampleRate = this.config.outputSampleRate ?? 24000;
    this._chatCtx = llm.ChatContext.empty();
  }

  override get chatCtx(): llm.ChatContext {
    return this._chatCtx;
  }

  override get tools(): llm.ToolContext {
    return this._toolCtx;
  }

  // ===========================================================================
  // ABSTRACT IMPLEMENTATIONS
  // ===========================================================================

  override async updateInstructions(instructions: string): Promise<void> {
    this._instructions = instructions;
    log.debug({ instructionLength: instructions.length }, 'Instructions updated');
  }

  override async updateChatCtx(chatCtx: llm.ChatContext): Promise<void> {
    this._chatCtx = chatCtx;
    this.syncChatContextToHistory();
  }

  override async updateTools(tools: llm.ToolContext): Promise<void> {
    this._toolCtx = tools;
    this._toolsForApi = this.toolContextToQwen3Definitions(tools);
  }

  override updateOptions(_options: { toolChoice?: unknown }): void {
    log.debug('Tool choice update (handled by prompt)');
  }

  // ===========================================================================
  // AUDIO INPUT
  // ===========================================================================

  override pushAudio(frame: AudioFrame): void {
    const data = frame.data as Int16Array;
    const pcmBytes = int16ToBytes(data);
    this.audioBuffer.push(pcmBytes);

    const frameDurationMs = (frame.samplesPerChannel / frame.sampleRate) * 1000;
    this.audioBufferDurationMs += frameDurationMs;

    const maxDuration = this.config.maxBufferDurationMs ?? 30000;
    if (this.audioBufferDurationMs > maxDuration) {
      log.warn(
        { durationMs: this.audioBufferDurationMs },
        'Audio buffer exceeded max duration, auto-committing'
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
    const bufferedDuration = this.audioBufferDurationMs;
    this.audioBufferDurationMs = 0;

    log.debug(
      { audioBytes: totalLength, durationMs: bufferedDuration },
      'Audio committed, encoding WAV'
    );

    const wavDataUrl = pcmToWavDataUrl(combined, {
      sampleRate: this.inputSampleRate,
      bitsPerSample: 16,
      numChannels: 1,
    });

    this.conversationHistory.push({
      role: 'user',
      content: [{ type: 'audio', audio_url: wavDataUrl }],
    });

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
    log.debug('Audio buffer cleared');
  }

  // ===========================================================================
  // GENERATION
  // ===========================================================================

  override async generateReply(instructions?: string): Promise<llm.GenerationCreatedEvent> {
    if (this.isGenerating) {
      await this.interrupt();
    }

    this.isGenerating = true;
    this.currentAbortController = new AbortController();

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const responseId = `resp-${Date.now()}`;

    const systemPrompt = this.buildSystemPrompt(instructions);

    const messages: Qwen3OmniMessage[] = [
      { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
      ...this.conversationHistory,
    ];

    const leadPersonaId = (this.directorEngine?.leadPersonaId ??
      this.config.defaultPersonaId) as PersonaId;

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

    this.runGeneration(
      messages,
      leadPersonaId,
      textStreamController!,
      audioStreamController!,
      functionStreamController!
    ).catch((error) => {
      log.error({ error: String(error) }, 'Generation failed');
      try {
        textStreamController?.error(error);
      } catch {
        textStreamController?.close();
      }
      try {
        audioStreamController?.error(error);
      } catch {
        audioStreamController?.close();
      }
      try {
        functionStreamController?.error(error);
      } catch {
        functionStreamController?.close();
      }
    });

    return {
      messageStream,
      functionStream,
      userInitiated: true,
    };
  }

  override async interrupt(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.isGenerating = false;
    log.debug('Generation interrupted');
  }

  override async truncate(_options: {
    messageId: string;
    audioEndMs: number;
    modalities?: ('text' | 'audio')[];
    audioTranscript?: string;
  }): Promise<void> {
    log.debug('Truncation not supported for Qwen3-Omni HTTP adapter');
  }

  override startUserActivity(): void {
    super.startUserActivity();
    this.emit('input_speech_started', {});
  }

  override async close(): Promise<void> {
    await super.close();
    await this.interrupt();
    this.conversationHistory = [];
    this.audioBuffer = [];
  }

  // ===========================================================================
  // INTERNAL: GENERATION PIPELINE
  // ===========================================================================

  private toolContextToQwen3Definitions(toolCtx: llm.ToolContext): Qwen3FunctionDefinition[] {
    const defs: Qwen3FunctionDefinition[] = [];
    for (const [name, tool] of Object.entries(toolCtx)) {
      if (!llm.isFunctionTool(tool)) continue;
      try {
        const schema = llm.toJsonSchema(tool.parameters);
        defs.push({
          name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: (schema.properties ?? {}) as Record<
              string,
              Qwen3FunctionDefinition['parameters']['properties'][string]
            >,
            required: schema.required as string[] | undefined,
          },
        });
      } catch (e) {
        log.warn({ name, error: String(e) }, 'Skipping tool for Qwen3 API');
      }
    }
    return defs;
  }

  private async runGeneration(
    messages: Qwen3OmniMessage[],
    leadPersonaId: PersonaId,
    textController: ReadableStreamDefaultController<string>,
    audioController: ReadableStreamDefaultController<AudioFrame>,
    functionController: ReadableStreamDefaultController<llm.FunctionCall>
  ): Promise<void> {
    try {
      const leadActor = this.directorEngine?.getActor(leadPersonaId);
      const voiceDesign =
        leadActor?.getEffectiveVoiceDesign() ?? 'Warm male baritone, natural conversational tone';
      const emotionInstruct =
        leadActor?.getEffectiveEmotionInstruction() ?? 'Warm and natural conversational tone';

      const stream = this.client.streamAudioCompletion(messages, {
        tools: this._toolsForApi.length > 0 ? this._toolsForApi : undefined,
        voiceDesign,
        instruct: emotionInstruct,
        sampleRate: this.outputSampleRate,
      });

      let fullText = '';
      let fullAudioBase64 = '';

      for await (const chunk of stream) {
        if (this.currentAbortController?.signal.aborted) break;

        switch (chunk.type) {
          case 'text': {
            fullText += chunk.content;
            textController.enqueue(chunk.content);
            break;
          }

          case 'audio': {
            fullAudioBase64 += chunk.data;
            try {
              const audioBytes = Buffer.from(chunk.data, 'base64');
              const samples = bytesToInt16(new Uint8Array(audioBytes));
              const frame = new AudioFrame(samples, this.outputSampleRate, 1, samples.length);
              audioController.enqueue(frame);
            } catch (e) {
              log.error(
                { error: String(e), chunkLength: chunk.data.length },
                'Failed to decode audio chunk'
              );
            }
            break;
          }

          case 'function_call': {
            const callId = `call-${Date.now()}`;
            const args =
              typeof chunk.call.arguments === 'string'
                ? chunk.call.arguments
                : JSON.stringify(chunk.call.arguments ?? {});
            const fc = llm.FunctionCall.create({
              callId,
              name: chunk.call.name,
              args,
            });
            functionController.enqueue(fc);
            break;
          }

          case 'done': {
            if (chunk.fullAudioBase64 && fullAudioBase64.length === 0) {
              try {
                const { pcmData } = wavDataUrlToPcm(
                  `data:audio/wav;base64,${chunk.fullAudioBase64}`
                );
                const samples = bytesToInt16(pcmData);
                const frame = new AudioFrame(samples, this.outputSampleRate, 1, samples.length);
                audioController.enqueue(frame);
              } catch (e) {
                log.error(
                  { error: String(e), blobLength: chunk.fullAudioBase64?.length },
                  'Failed to decode full audio blob'
                );
                if (this.ttsClient && fullText.length > 0) {
                  await this.synthesizeWithTTS(fullText, leadPersonaId, audioController);
                }
              }
            }
            break;
          }
        }
      }

      if (fullAudioBase64.length === 0 && fullText.length > 0 && this.ttsClient) {
        await this.synthesizeWithTTS(fullText, leadPersonaId, audioController);
      }

      if (fullText.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: [{ type: 'text', text: fullText }],
        });
      }

      this.directorEngine?.recordTurn();

      if (this.directorEngine) {
        this.directorEngine.emit('director_event', {
          type: 'persona_speaking',
          personaId: leadPersonaId,
          text: fullText,
        });
      }

      // AutoDirector: analyze turn and add/execute suggestions (suggest or autopilot)
      const autoDirector = this.config.autoDirector;
      if (autoDirector && this.directorEngine) {
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
        const userTranscript =
          lastUserMsg?.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join(' ')
            .trim() || '[audio input]';
        const scene = this.directorEngine.getSceneState();
        try {
          await autoDirector.analyzeTurn({
            userTranscript,
            currentLead: this.directorEngine?.leadPersonaId ?? leadPersonaId,
            turnCount: scene?.turnCount ?? 0,
            sessionMinutes: 0,
          });
        } catch (e) {
          log.warn({ error: String(e) }, 'AutoDirector analyzeTurn failed');
        }
      }
    } finally {
      textController.close();
      audioController.close();
      functionController.close();
      this.isGenerating = false;
    }
  }

  private async synthesizeWithTTS(
    text: string,
    defaultPersonaId: string,
    audioController: ReadableStreamDefaultController<AudioFrame>
  ): Promise<void> {
    if (!this.ttsClient) return;

    const humanized = await humanizeForQwen3(text, {
      sessionId: this.config.sessionId,
      userMessage: '',
    });

    const sceneState = this.directorEngine?.getSceneState();
    const segments = splitIntoInstructSegments(humanized.text, defaultPersonaId, {
      sceneMood: sceneState?.mood ?? 'warm',
      moodIntensity: sceneState?.moodIntensity ?? 0.5,
    });

    for (const segment of segments) {
      try {
        const result = await this.ttsClient.synthesize({
          text: segment.text,
          personaId: segment.personaId,
          instruct: segment.instruct,
        });

        if (result.audioData && result.audioData.length > 0) {
          const samples = bytesToInt16(result.audioData);
          const frame = new AudioFrame(
            samples,
            result.sampleRate ?? this.outputSampleRate,
            1,
            samples.length
          );
          audioController.enqueue(frame);
        }
      } catch (error) {
        log.error(
          { error: String(error), personaId: segment.personaId },
          'TTS segment synthesis failed'
        );
      }
    }
  }

  private buildSystemPrompt(additionalInstructions?: string): string {
    if (this.directorEngine) {
      const prompt = this.directorEngine.getSystemPrompt({
        userName: this.config.userName ?? 'the user',
        crossPersonaInsights: undefined,
      });
      return additionalInstructions ? `${prompt}\n\n${additionalInstructions}` : prompt;
    }
    return additionalInstructions
      ? `${this._instructions}\n\n${additionalInstructions}`
      : this._instructions;
  }

  private syncChatContextToHistory(): void {
    const messages: Qwen3OmniMessage[] = [];
    for (const item of this._chatCtx.items) {
      if (item.type !== 'message') continue;
      const msg = item as llm.ChatMessage;
      const text = msg.textContent;
      if (!text) continue;
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: [{ type: 'text', text }],
      });
    }
    this.conversationHistory = messages;
  }
}
