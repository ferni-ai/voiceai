/**
 * Local Pipeline Model Provider
 *
 * Combines local STT (Sonata) + local LLM (ollama Qwen3-8B) + TTS (Sonata/Cartesia)
 * for a privacy-first voice agent that runs entirely on-device for STT and LLM.
 *
 * Architecture:
 *   Audio In → Sonata STT (local) → Ollama Qwen3-8B (local, 100ms TTFB)
 *            → TTS (Sonata or Cartesia) → Audio Out
 *
 * Environment: USE_LOCAL_PIPELINE=true
 *   OLLAMA_URL          - Ollama API URL (default: http://127.0.0.1:11434)
 *   OLLAMA_MODEL        - Model name (default: qwen3:8b)
 *   USE_SONATA_STT=true - Enables Sonata STT (handled in agent-setup.ts)
 *
 * @module agents/model-provider/local-pipeline
 */

import { DEFAULT_API_CONNECT_OPTIONS, llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'local-pipeline-provider' });

// =============================================================================
// OLLAMA CONFIGURATION
// =============================================================================

const OLLAMA_DEFAULTS = {
  url: 'http://127.0.0.1:11434',
  model: 'qwen3:8b',
  maxTokens: 150,
} as const;

function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || OLLAMA_DEFAULTS.url;
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || OLLAMA_DEFAULTS.model;
}

// =============================================================================
// CHAT CONTEXT → OLLAMA MESSAGES
// =============================================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function chatContextToOllamaMessages(chatCtx: llm.ChatContext): OllamaMessage[] {
  const messages: OllamaMessage[] = [];

  for (const item of chatCtx.items) {
    if (item.type === 'message') {
      const msg = item as llm.ChatMessage;
      const role = msg.role === 'developer' ? 'system' : msg.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
      const text = msg.textContent?.trim() ?? '';
      if (!text && role !== 'system') continue;
      messages.push({ role: role as OllamaMessage['role'], content: text });
    }
  }

  return messages;
}

// =============================================================================
// OLLAMA LLM ADAPTER (LiveKit-compatible)
// =============================================================================

export interface OllamaLLMAdapterConfig {
  ollamaUrl: string;
  model: string;
  instructions?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LiveKit LLM implementation that streams from ollama's /api/chat endpoint.
 *
 * Uses `think: false` to disable Qwen3's thinking mode — all tokens go directly
 * to response content with zero overhead. This is critical for voice latency.
 */
export class OllamaLLMAdapter extends llm.LLM {
  /** @internal */
  readonly _config: OllamaLLMAdapterConfig;

  constructor(config: OllamaLLMAdapterConfig) {
    super();
    this._config = config;
  }

  get model(): string {
    return this._config.model;
  }

  label(): string {
    return `ollama/${this._config.model}`;
  }

  chat(opts: {
    chatCtx: llm.ChatContext;
    toolCtx?: llm.ToolContext;
    connOptions?: APIConnectOptions;
    parallelToolCalls?: boolean;
    toolChoice?: unknown;
    extraKwargs?: Record<string, unknown>;
  }): llm.LLMStream {
    const connOptions = {
      ...DEFAULT_API_CONNECT_OPTIONS,
      ...opts.connOptions,
    };
    return new OllamaLLMStream(this, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions,
    });
  }
}

// =============================================================================
// OLLAMA LLM STREAM
// =============================================================================

class OllamaLLMStream extends llm.LLMStream {
  private adapter: OllamaLLMAdapter;

  constructor(
    adapter: OllamaLLMAdapter,
    opts: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContext;
      connOptions: APIConnectOptions;
    }
  ) {
    super(adapter, opts);
    this.adapter = adapter;
  }

  protected async run(): Promise<void> {
    const config = this.adapter._config;
    const messages = chatContextToOllamaMessages(this.chatCtx);

    // Inject system instructions if provided
    if (config.instructions) {
      messages.unshift({ role: 'system', content: config.instructions });
    }

    const payload = {
      model: config.model,
      messages,
      stream: true,
      think: false, // Critical: disables Qwen3 thinking mode for voice latency
      options: {
        num_predict: config.maxTokens ?? OLLAMA_DEFAULTS.maxTokens,
        temperature: config.temperature ?? 0.7,
      },
    };

    const url = `${config.ollamaUrl}/api/chat`;

    try {
      let completionTokens = 0;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('Ollama returned no response body');
      }

      // Stream NDJSON lines from ollama
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (this.abortController.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (!line) continue;

          try {
            const data = JSON.parse(line) as {
              message?: { role?: string; content?: string };
              done?: boolean;
              eval_count?: number;
              prompt_eval_count?: number;
            };

            const content = data.message?.content ?? '';
            if (content) {
              const chunk: llm.ChatChunk = {
                id: `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                delta: { role: 'assistant', content } as llm.ChoiceDelta,
              };
              this.queue.put(chunk);
              completionTokens++;
            }

            // Final message with stats
            if (data.done) {
              const usage: llm.CompletionUsage = {
                completionTokens: data.eval_count ?? completionTokens,
                promptTokens: data.prompt_eval_count ?? 0,
                promptCachedTokens: 0,
                totalTokens: (data.eval_count ?? completionTokens) + (data.prompt_eval_count ?? 0),
              };
              this.queue.put({
                id: `ollama_usage_${Date.now()}`,
                usage,
              });
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      log.error({ error: String(error) }, 'Ollama stream failed');
      throw error;
    }
  }
}

// =============================================================================
// LOCAL PIPELINE PROVIDER
// =============================================================================

export class LocalPipelineProvider implements ModelProvider {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  readonly id: ModelProviderId = 'local-pipeline';
  readonly displayName = 'Local Pipeline (Kyutai STT + Ollama LLM + Local/Cartesia TTS)';

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  /**
   * Ollama Qwen3-8B supports tool calling, but for reliability we use
   * the JSON workaround (same as Gemini). Can upgrade to native FC later.
   */
  hasNativeFunctionCalling(): boolean {
    return false;
  }

  /**
   * Use JSON workaround for function calls (battle-tested Gemini approach).
   * The tool-call-sanitizer intercepts JSON from the TTS stream.
   */
  needsJsonWorkaround(): boolean {
    return true;
  }

  /**
   * No built-in turn detection — use LiveKit's VAD.
   */
  hasBuiltInTurnDetection(): boolean {
    return false;
  }

  // ---------------------------------------------------------------------------
  // Prompt Configuration
  // ---------------------------------------------------------------------------

  /**
   * Include JSON function-calling prompts (same as Gemini path).
   * This tells the LLM to output {"fn":"toolName","args":{}} for tool calls.
   */
  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: true,
      includeFunctionCallingSpecialty: true,
      includeToolUsageGuidance: true,
      includeModelBaseInstructions: true,
      useMinimalInstructions: false,
    };
  }

  /**
   * Qwen3-8B has a 32K context window, but we keep prompts lean for latency.
   */
  getTokenLimit(): number {
    return 16384;
  }

  getMinimalInstructions(): string {
    return `
You are a caring AI companion with superhuman emotional intelligence.
Keep responses conversational and under 2 sentences for voice.
Speak naturally with contractions, fillers, and real conversational patterns.
Be present, warm, and genuinely supportive.
`.trim();
  }

  // ---------------------------------------------------------------------------
  // Model Creation
  // ---------------------------------------------------------------------------

  /**
   * Create an OllamaLLMAdapter that streams from the local ollama server.
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const ollamaUrl = getOllamaUrl();
    const model = getOllamaModel();

    log.info(
      {
        ollamaUrl,
        model,
        temperature: config.temperature,
      },
      '🏠 Creating local Ollama LLM adapter'
    );

    return new OllamaLLMAdapter({
      ollamaUrl,
      model,
      instructions: config.instructions,
      temperature: config.temperature ?? 0.7,
      maxTokens: 200,
    });
  }

  // ---------------------------------------------------------------------------
  // Session Configuration
  // ---------------------------------------------------------------------------

  /**
   * No built-in turn detection — use LiveKit's server_vad.
   */
  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return undefined;
  }

  /**
   * Ollama benefits from prewarm (first inference loads model into GPU).
   */
  needsPrewarm(): boolean {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  getLogPrefix(): string {
    return '🏠'; // House for local/on-device
  }
}
