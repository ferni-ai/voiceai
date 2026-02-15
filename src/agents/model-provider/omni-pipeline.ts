/**
 * Omni Pipeline Model Provider
 *
 * Connects the LiveKit voice agent to the Rust FullOmniPipeline server
 * (Candle-based Qwen3-Omni Thinker) via its OpenAI-compatible HTTP API.
 *
 * Architecture:
 *   Audio In → LiveKit STT → Rust Thinker (local, Candle) → Cartesia TTS → Audio Out
 *
 * The Rust server exposes /v1/chat/completions (OpenAI-compatible, non-streaming)
 * and /health for readiness checks.
 *
 * Environment: USE_OMNI_PIPELINE=true
 *   OMNI_PIPELINE_URL - Rust server base URL (default: http://127.0.0.1:8505)
 *
 * @module agents/model-provider/omni-pipeline
 */

import { DEFAULT_API_CONNECT_OPTIONS, llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'omni-pipeline-provider' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const OMNI_DEFAULTS = {
  url: 'http://127.0.0.1:8505',
  model: 'qwen3-omni-candle',
  maxTokens: 200,
} as const;

export function isOmniPipelineEnabled(): boolean {
  return process.env.USE_OMNI_PIPELINE === 'true';
}

export function getOmniPipelineUrl(): string {
  return process.env.OMNI_PIPELINE_URL || OMNI_DEFAULTS.url;
}

// =============================================================================
// CHAT CONTEXT → OPENAI MESSAGES
// =============================================================================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function chatContextToMessages(chatCtx: llm.ChatContext): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const item of chatCtx.items) {
    if (item.type === 'message') {
      const msg = item as llm.ChatMessage;
      const role = msg.role === 'developer' ? 'system' : msg.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
      const text = msg.textContent?.trim() ?? '';
      if (!text && role !== 'system') continue;
      messages.push({ role: role as ChatMessage['role'], content: text });
    }
  }

  return messages;
}

// =============================================================================
// OMNI PIPELINE LLM ADAPTER (LiveKit-compatible)
// =============================================================================

export interface OmniPipelineLLMConfig {
  serverUrl: string;
  model: string;
  instructions?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LiveKit LLM implementation that calls the Rust FullOmniPipeline server's
 * OpenAI-compatible /v1/chat/completions endpoint.
 *
 * The Rust server currently returns a full (non-streaming) JSON response,
 * so we emit the entire response as a single chunk. When the Rust server
 * adds streaming support (Task #1), this adapter can be upgraded to parse
 * NDJSON/SSE incrementally.
 */
export class OmniPipelineLLMAdapter extends llm.LLM {
  /** @internal */
  readonly _config: OmniPipelineLLMConfig;

  constructor(config: OmniPipelineLLMConfig) {
    super();
    this._config = config;
  }

  get model(): string {
    return this._config.model;
  }

  label(): string {
    return `omni-pipeline/${this._config.model}`;
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
    return new OmniPipelineLLMStream(this, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions,
    });
  }
}

// =============================================================================
// OMNI PIPELINE LLM STREAM
// =============================================================================

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: { role: string; content?: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class OmniPipelineLLMStream extends llm.LLMStream {
  private adapter: OmniPipelineLLMAdapter;

  constructor(
    adapter: OmniPipelineLLMAdapter,
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
    const messages = chatContextToMessages(this.chatCtx);

    // Inject system instructions if provided
    if (config.instructions) {
      messages.unshift({ role: 'system', content: config.instructions });
    }

    const payload = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens ?? OMNI_DEFAULTS.maxTokens,
      temperature: config.temperature ?? 0.7,
      stream: false,
    };

    const url = `${config.serverUrl}/v1/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Omni Pipeline error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;

      const content = data.choices?.[0]?.message?.content ?? '';
      if (content) {
        const chunk: llm.ChatChunk = {
          id: data.id || `omni_${Date.now()}`,
          delta: { role: 'assistant', content } as llm.ChoiceDelta,
        };
        this.queue.put(chunk);
      }

      // Emit usage stats
      if (data.usage) {
        const usage: llm.CompletionUsage = {
          completionTokens: data.usage.completion_tokens,
          promptTokens: data.usage.prompt_tokens,
          promptCachedTokens: 0,
          totalTokens: data.usage.total_tokens,
        };
        this.queue.put({
          id: `${data.id}_usage`,
          usage,
        });
      }
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      log.error({ error: String(error) }, 'Omni Pipeline request failed');
      throw error;
    }
  }
}

// =============================================================================
// OMNI PIPELINE PROVIDER
// =============================================================================

export class OmniPipelineProvider implements ModelProvider {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  readonly id: ModelProviderId = 'omni-pipeline';
  readonly displayName = 'Omni Pipeline (Local Rust/Candle)';

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  /**
   * The Rust server exposes an OpenAI-compatible API. For now we use the
   * JSON workaround (same as Gemini/Ollama path) since the Candle server
   * doesn't support tool_calls in the response format yet.
   */
  hasNativeFunctionCalling(): boolean {
    return false;
  }

  needsJsonWorkaround(): boolean {
    return true;
  }

  hasBuiltInTurnDetection(): boolean {
    return false;
  }

  // ---------------------------------------------------------------------------
  // Prompt Configuration
  // ---------------------------------------------------------------------------

  /**
   * Same prompt strategy as LocalPipelineProvider — include JSON function-calling
   * prompts so the LLM outputs {"fn":"tool","args":{}} which the sanitizer intercepts.
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

  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const serverUrl = getOmniPipelineUrl();

    // Health check — verify the Rust server is running
    try {
      const healthResp = await fetch(`${serverUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!healthResp.ok) {
        log.warn(
          { status: healthResp.status },
          'Omni Pipeline server health check returned non-OK status'
        );
      }
    } catch (error) {
      log.warn(
        { serverUrl, error: String(error) },
        'Omni Pipeline server not reachable — LLM calls will fail until server starts'
      );
    }

    log.info(
      {
        serverUrl,
        temperature: config.temperature,
      },
      '🦀 Creating Omni Pipeline LLM adapter (Rust/Candle)'
    );

    return new OmniPipelineLLMAdapter({
      serverUrl,
      model: OMNI_DEFAULTS.model,
      instructions: config.instructions,
      temperature: config.temperature ?? 0.7,
      maxTokens: OMNI_DEFAULTS.maxTokens,
    });
  }

  // ---------------------------------------------------------------------------
  // Session Configuration
  // ---------------------------------------------------------------------------

  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return undefined; // Use LiveKit's server_vad
  }

  needsPrewarm(): boolean {
    return true; // First inference loads model weights into GPU/CPU
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  getLogPrefix(): string {
    return '🦀'; // Rust crab for Candle/Rust pipeline
  }
}
