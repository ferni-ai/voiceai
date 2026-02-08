/**
 * Qwen3-Omni Client
 *
 * HTTP/streaming client for the Qwen3-Omni Thinker inference server.
 * Supports:
 * - OpenAI-compatible chat completions API (vLLM/HuggingFace serving)
 * - Native function calling from audio input
 * - Streaming responses
 * - Health checks
 *
 * The Thinker handles audio understanding + text reasoning.
 * TTS is handled separately by Qwen3TTSClient.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../utils/safe-logger.js';
import { getQwen3OmniConfig } from './config.js';
import type {
  Qwen3FunctionCall,
  Qwen3FunctionDefinition,
  Qwen3OmniConfig,
  Qwen3OmniHealthStatus,
  Qwen3OmniMessage,
  Qwen3OmniRequest,
  Qwen3OmniResponse,
  Qwen3OmniStreamChunk,
} from './types.js';

const log = createLogger({ module: 'qwen3-omni-client' });

// =============================================================================
// QWEN3-OMNI THINKER CLIENT
// =============================================================================

export class Qwen3OmniClient extends EventEmitter {
  private config: Qwen3OmniConfig;
  private isConnected = false;
  private requestCount = 0;
  private totalLatencyMs = 0;

  constructor(config?: Partial<Qwen3OmniConfig>) {
    super();
    this.config = { ...getQwen3OmniConfig(), ...config };
  }

  // ===========================================================================
  // CHAT COMPLETIONS (Primary API)
  // ===========================================================================

  /**
   * Send a chat completion request to Qwen3-Omni Thinker.
   * Supports text, audio, and multimodal input with native function calling.
   */
  async chatCompletion(
    messages: Qwen3OmniMessage[],
    options?: {
      tools?: Qwen3FunctionDefinition[];
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<Qwen3OmniResponse> {
    const startTime = Date.now();

    const request: Qwen3OmniRequest = {
      model: this.config.model,
      messages,
      tools: this.config.enableFunctionCalling && options?.tools ? options.tools : undefined,
      temperature: options?.temperature ?? this.config.temperature,
      top_p: this.config.topP,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      stream: options?.stream ?? false,
    };

    if (this.config.debug) {
      log.debug(
        {
          messageCount: messages.length,
          toolCount: request.tools?.length ?? 0,
          stream: request.stream,
        },
        'Sending chat completion request'
      );
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.connectionTimeoutMs ?? 30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qwen3-Omni API error ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as Qwen3OmniResponse;

      const latency = Date.now() - startTime;
      this.requestCount++;
      this.totalLatencyMs += latency;

      if (this.config.debug) {
        log.debug(
          {
            latencyMs: latency,
            finishReason: result.choices[0]?.finish_reason,
            hasToolCalls: !!result.choices[0]?.message.tool_calls,
            tokenUsage: result.usage,
          },
          'Chat completion response received'
        );
      }

      this.emit('response', { latencyMs: latency, result });
      return result;
    } catch (error) {
      log.error(
        { error: String(error), serverUrl: this.config.serverUrl },
        'Chat completion failed'
      );
      this.emit('error', error);
      throw error;
    }
  }

  // ===========================================================================
  // STREAMING CHAT COMPLETIONS
  // ===========================================================================

  /**
   * Stream a chat completion response.
   * Yields text chunks and function call deltas as they arrive.
   */
  async *streamChatCompletion(
    messages: Qwen3OmniMessage[],
    options?: {
      tools?: Qwen3FunctionDefinition[];
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<
    | { type: 'text'; content: string }
    | { type: 'function_call'; call: Qwen3FunctionCall }
    | { type: 'done'; finishReason: string }
  > {
    const startTime = Date.now();

    const request: Qwen3OmniRequest = {
      model: this.config.model,
      messages,
      tools: this.config.enableFunctionCalling && options?.tools ? options.tools : undefined,
      temperature: options?.temperature ?? this.config.temperature,
      top_p: this.config.topP,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      stream: true,
    };

    const response = await fetch(`${this.config.serverUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.connectionTimeoutMs ?? 30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen3-Omni streaming error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedFunctionArgs = '';
    let currentFunctionName = '';
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            const latency = Date.now() - startTime;
            this.requestCount++;
            this.totalLatencyMs += latency;
            yield { type: 'done', finishReason: 'stop' };
            return;
          }

          try {
            const chunk = JSON.parse(data) as Qwen3OmniStreamChunk;
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
              accumulatedText += delta.content;
              yield { type: 'text', content: delta.content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.function?.name) {
                  currentFunctionName = tc.function.name;
                  accumulatedFunctionArgs = '';
                }
                if (tc.function?.arguments) {
                  accumulatedFunctionArgs += tc.function.arguments;
                }
              }
            }

            if (chunk.choices[0]?.finish_reason === 'tool_calls') {
              // Function call complete - parse and yield
              try {
                const args = JSON.parse(accumulatedFunctionArgs) as Record<string, unknown>;
                yield {
                  type: 'function_call',
                  call: {
                    name: currentFunctionName,
                    arguments: args,
                  },
                };
              } catch {
                log.warn(
                  {
                    name: currentFunctionName,
                    args: accumulatedFunctionArgs,
                  },
                  'Failed to parse function call arguments'
                );
              }
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ===========================================================================
  // AUDIO INPUT
  // ===========================================================================

  /**
   * Send audio input to Qwen3-Omni for understanding.
   * The audio is encoded as base64 and sent as part of a multimodal message.
   */
  async processAudioInput(
    audioData: Uint8Array,
    systemPrompt: string,
    options?: {
      tools?: Qwen3FunctionDefinition[];
      conversationHistory?: Qwen3OmniMessage[];
    }
  ): Promise<Qwen3OmniResponse> {
    // Encode audio as base64 data URL
    const base64Audio = Buffer.from(audioData).toString('base64');
    const audioDataUrl = `data:audio/wav;base64,${base64Audio}`;

    const messages: Qwen3OmniMessage[] = [
      {
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }],
      },
      ...(options?.conversationHistory || []),
      {
        role: 'user',
        content: [{ type: 'audio', audio_url: audioDataUrl }],
      },
    ];

    return this.chatCompletion(messages, {
      tools: options?.tools,
    });
  }

  /**
   * Transcribe user audio to text using the Thinker with a transcribe-only prompt.
   * Used by the session-manager adapter to get transcript for processTurn(transcript).
   *
   * @param audioDataUrl - WAV audio as data URL (e.g. from pcmToWavDataUrl)
   * @returns User transcript or '[audio input]' on failure/empty
   */
  async transcribeAudio(audioDataUrl: string): Promise<string> {
    const TRANSCRIBE_ONLY_PROMPT =
      "Transcribe the user's speech. Output only the exact words spoken, nothing else. No punctuation or formatting unless the user clearly pauses.";
    const messages: Qwen3OmniMessage[] = [
      { role: 'system', content: [{ type: 'text', text: TRANSCRIBE_ONLY_PROMPT }] },
      { role: 'user', content: [{ type: 'audio', audio_url: audioDataUrl }] },
    ];
    try {
      const res = await this.chatCompletion(messages);
      const text = res.choices[0]?.message?.content?.trim();
      return text && text.length > 0 ? text : '[audio input]';
    } catch (e) {
      log.warn({ error: String(e) }, 'Transcribe audio failed');
      return '[audio input]';
    }
  }

  // ===========================================================================
  // AUDIO-MODALITY COMPLETION (Qwen3-Omni Talker)
  // ===========================================================================

  /**
   * Stream a chat completion with audio output.
   *
   * Sends messages (which may include audio input) and requests
   * both text and audio modalities in the response. The Talker
   * generates audio as a base64 blob (or incremental chunks in
   * streaming mode).
   *
   * @param messages - Chat messages (may include audio_url for user audio)
   * @param options - Audio output config (voice_design, instruct, etc.)
   */
  async *streamAudioCompletion(
    messages: Qwen3OmniMessage[],
    options: {
      tools?: Qwen3FunctionDefinition[];
      temperature?: number;
      maxTokens?: number;
      /** Natural language voice design description */
      voiceDesign?: string;
      /** Emotion/tone instruct for TTS */
      instruct?: string;
      /** Audio output format */
      format?: 'wav' | 'pcm' | 'opus';
      /** Sample rate (default: 24000) */
      sampleRate?: number;
    }
  ): AsyncGenerator<
    | { type: 'text'; content: string }
    | { type: 'audio'; data: string; format: string }
    | { type: 'function_call'; call: Qwen3FunctionCall }
    | { type: 'done'; finishReason: string; fullAudioBase64?: string }
  > {
    const startTime = Date.now();

    const request = {
      model: this.config.model,
      messages,
      tools: this.config.enableFunctionCalling && options.tools ? options.tools : undefined,
      temperature: options.temperature ?? this.config.temperature,
      top_p: this.config.topP,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      stream: true,
      modalities: ['text', 'audio'] as Array<'text' | 'audio'>,
      audio: {
        voice: options.voiceDesign,
        format: options.format ?? 'wav',
        sample_rate: options.sampleRate ?? this.config.sampleRate ?? 24000,
      },
      voice_design: options.voiceDesign,
      instruct: options.instruct,
    };

    const response = await fetch(`${this.config.serverUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.connectionTimeoutMs ?? 60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen3-Omni audio streaming error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for audio streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedFunctionArgs = '';
    let currentFunctionName = '';
    let fullAudioBase64 = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            const latency = Date.now() - startTime;
            this.requestCount++;
            this.totalLatencyMs += latency;
            yield {
              type: 'done',
              finishReason: 'stop',
              fullAudioBase64: fullAudioBase64 || undefined,
            };
            return;
          }

          try {
            const chunk = JSON.parse(data) as Record<string, unknown>;
            const choices = chunk.choices as Array<{
              delta?: {
                content?: string;
                audio?: { data?: string; format?: string };
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;

            const delta = choices?.[0]?.delta;

            // Text content
            if (delta?.content) {
              yield { type: 'text', content: delta.content };
            }

            // Audio content (incremental)
            if (delta?.audio?.data) {
              fullAudioBase64 += delta.audio.data;
              yield {
                type: 'audio',
                data: delta.audio.data,
                format: delta.audio.format ?? 'wav',
              };
            }

            // Tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.function?.name) {
                  currentFunctionName = tc.function.name;
                  accumulatedFunctionArgs = '';
                }
                if (tc.function?.arguments) {
                  accumulatedFunctionArgs += tc.function.arguments;
                }
              }
            }

            if (choices?.[0]?.finish_reason === 'tool_calls') {
              try {
                const args = JSON.parse(accumulatedFunctionArgs) as Record<string, unknown>;
                yield {
                  type: 'function_call',
                  call: { name: currentFunctionName, arguments: args },
                };
              } catch {
                log.warn(
                  { name: currentFunctionName, args: accumulatedFunctionArgs },
                  'Failed to parse audio stream function call arguments'
                );
              }
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Send audio input and get audio + text output (non-streaming).
   *
   * For use when you want the complete audio response at once
   * (e.g., short cameo responses, greetings).
   */
  async audioCompletion(
    messages: Qwen3OmniMessage[],
    options: {
      tools?: Qwen3FunctionDefinition[];
      voiceDesign?: string;
      instruct?: string;
      format?: 'wav' | 'pcm' | 'opus';
      sampleRate?: number;
    }
  ): Promise<{
    text: string | null;
    audioBase64: string | null;
    audioFormat: string;
    toolCalls?: Qwen3FunctionCall[];
  }> {
    const request = {
      model: this.config.model,
      messages,
      tools: this.config.enableFunctionCalling && options.tools ? options.tools : undefined,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      max_tokens: this.config.maxTokens,
      stream: false,
      modalities: ['text', 'audio'] as Array<'text' | 'audio'>,
      audio: {
        voice: options.voiceDesign,
        format: options.format ?? 'wav',
        sample_rate: options.sampleRate ?? this.config.sampleRate ?? 24000,
      },
      voice_design: options.voiceDesign,
      instruct: options.instruct,
    };

    const response = await fetch(`${this.config.serverUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.connectionTimeoutMs ?? 60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen3-Omni audio completion error ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as Qwen3OmniResponse;
    const choice = result.choices[0];

    const toolCalls: Qwen3FunctionCall[] = [];
    if (choice?.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        try {
          toolCalls.push({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
          });
        } catch {
          log.warn({ name: tc.function.name }, 'Failed to parse tool call args');
        }
      }
    }

    return {
      text: choice?.message.content ?? null,
      audioBase64: choice?.message.audio?.data ?? null,
      audioFormat: choice?.message.audio?.format ?? options.format ?? 'wav',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Check Qwen3-Omni Thinker server health
   */
  async checkHealth(): Promise<Qwen3OmniHealthStatus> {
    try {
      // Try the standard health endpoint
      const healthResponse = await fetch(`${this.config.serverUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });

      const healthy = healthResponse.ok;

      // Try to get model info
      let modelLoaded = 'unknown';
      try {
        const modelsResponse = await fetch(`${this.config.serverUrl}/v1/models`, {
          signal: AbortSignal.timeout(5000),
        });
        if (modelsResponse.ok) {
          const models = (await modelsResponse.json()) as {
            data: Array<{ id: string }>;
          };
          modelLoaded = models.data?.[0]?.id || 'unknown';
        }
      } catch {
        // Model endpoint not available
      }

      this.isConnected = healthy;

      return {
        thinkerHealthy: healthy,
        ttsHealthy: false, // Checked separately by TTS client
        gpuMemoryUsedGB: 0,
        gpuMemoryTotalGB: 0,
        gpuUtilization: 0,
        avgInferenceLatencyMs: this.requestCount > 0 ? this.totalLatencyMs / this.requestCount : 0,
        avgTTSLatencyMs: 0,
        uptimeSeconds: 0,
        modelLoaded,
        quantization: this.config.quantization || 'unknown',
      };
    } catch (error) {
      log.error({ error: String(error), serverUrl: this.config.serverUrl }, 'Health check failed');
      this.isConnected = false;

      return {
        thinkerHealthy: false,
        ttsHealthy: false,
        gpuMemoryUsedGB: 0,
        gpuMemoryTotalGB: 0,
        gpuUtilization: 0,
        avgInferenceLatencyMs: 0,
        avgTTSLatencyMs: 0,
        uptimeSeconds: 0,
        modelLoaded: 'none',
        quantization: this.config.quantization || 'unknown',
      };
    }
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get connected(): boolean {
    return this.isConnected;
  }

  get avgLatencyMs(): number {
    return this.requestCount > 0 ? this.totalLatencyMs / this.requestCount : 0;
  }

  get serverUrl(): string {
    return this.config.serverUrl;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a Qwen3-Omni client
 */
export function createQwen3OmniClient(config?: Partial<Qwen3OmniConfig>): Qwen3OmniClient {
  return new Qwen3OmniClient(config);
}
