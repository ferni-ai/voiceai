/**
 * ChipChat Model Provider
 *
 * Connects to a local ChipChat-compatible server (e.g. Pipecat with ChipChat,
 * or a future ChipChat HTTP API) for on-device, low-latency voice.
 *
 * Key characteristics:
 * - Expects OpenAI-compatible /v1/chat/completions (streaming)
 * - No built-in turn detection — use LiveKit server_vad
 * - JSON workaround for function calling (same as local pipeline)
 * - Sub-second latency when ChipChat server runs on same machine (e.g. Mac Studio)
 *
 * Environment: USE_CHIPCHAT=true
 *   CHIPCHAT_URL - Server URL (default: http://127.0.0.1:8765)
 *   CHIPCHAT_MODEL - Model name for API (default: chipchat)
 *
 * To try ChipChat: run a ChipChat-compatible server (Pipecat + ChipChat, or
 * future native ChipChat server) and set USE_CHIPCHAT=true, CHIPCHAT_URL=...
 *
 * @module agents/model-provider/chipchat
 */

import { DEFAULT_API_CONNECT_OPTIONS, llm, type APIConnectOptions } from '@livekit/agents';
import { CHIPCHAT_URL } from '../../config/api-urls.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'chipchat-provider' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const CHIPCHAT_DEFAULTS = {
  model: 'chipchat',
  maxTokens: 256,
} as const;

function getChipChatUrl(): string {
  return CHIPCHAT_URL;
}

function getChipChatModel(): string {
  return process.env.CHIPCHAT_MODEL || CHIPCHAT_DEFAULTS.model;
}

// =============================================================================
// CHAT CONTEXT → OPENAI MESSAGES
// =============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function chatContextToOpenAIMessages(chatCtx: llm.ChatContext): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  for (const item of chatCtx.items) {
    if (item.type !== 'message') continue;
    const msg = item as llm.ChatMessage;
    const role = msg.role === 'developer' ? 'system' : msg.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
    const text = msg.textContent?.trim() ?? '';
    if (!text && role !== 'system') continue;
    messages.push({ role: role as OpenAIMessage['role'], content: text });
  }

  return messages;
}

// =============================================================================
// CHIPCHAT LLM ADAPTER
// =============================================================================

export interface ChipChatLLMAdapterConfig {
  url: string;
  model: string;
  instructions?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LiveKit LLM implementation that streams from a ChipChat-compatible
 * OpenAI-style /v1/chat/completions endpoint.
 */
export class ChipChatLLMAdapter extends llm.LLM {
  readonly _config: ChipChatLLMAdapterConfig;

  constructor(config: ChipChatLLMAdapterConfig) {
    super();
    this._config = config;
  }

  get model(): string {
    return this._config.model;
  }

  label(): string {
    return `chipchat/${this._config.model}`;
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
    return new ChipChatLLMStream(this, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions,
    });
  }
}

// =============================================================================
// CHIPCHAT LLM STREAM
// =============================================================================

class ChipChatLLMStream extends llm.LLMStream {
  private adapter: ChipChatLLMAdapter;

  constructor(
    adapter: ChipChatLLMAdapter,
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
    const messages = chatContextToOpenAIMessages(this.chatCtx);

    if (config.instructions) {
      messages.unshift({ role: 'system', content: config.instructions });
    }

    const baseUrl = config.url.replace(/\/$/, '');
    const url = `${baseUrl}/v1/chat/completions`;
    const payload = {
      model: config.model,
      messages,
      stream: true,
      max_tokens: config.maxTokens ?? CHIPCHAT_DEFAULTS.maxTokens,
      temperature: config.temperature ?? 0.7,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ChipChat error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('ChipChat returned no response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completionTokens = 0;

      while (true) {
        if (this.abortController.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (line === '' || line === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(line.slice(6)) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
            };
            const content = json.choices?.[0]?.delta?.content ?? '';
            if (content) {
              this.queue.put({
                id: `chipchat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                delta: { role: 'assistant', content } as llm.ChoiceDelta,
              });
              completionTokens++;
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      this.queue.put({
        id: `chipchat_usage_${Date.now()}`,
        usage: {
          completionTokens,
          promptTokens: 0,
          promptCachedTokens: 0,
          totalTokens: completionTokens,
        } as llm.CompletionUsage,
      });
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      log.error({ error: String(error), url: config.url }, 'ChipChat stream failed');
      throw error;
    }
  }
}

// =============================================================================
// CHIPCHAT PROVIDER
// =============================================================================

export class ChipChatProvider implements ModelProvider {
  readonly id: ModelProviderId = 'chipchat';
  readonly displayName = 'ChipChat (Local Apple MLX, OpenAI-compatible server)';

  hasNativeFunctionCalling(): boolean {
    return false;
  }

  needsJsonWorkaround(): boolean {
    return true;
  }

  hasBuiltInTurnDetection(): boolean {
    return false;
  }

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
    return 8192;
  }

  getMinimalInstructions(): string {
    return '';
  }

  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const url = getChipChatUrl();
    const model = getChipChatModel();

    log.info(
      { url, model, temperature: config.temperature },
      '🍎 Creating ChipChat LLM adapter'
    );

    return new ChipChatLLMAdapter({
      url,
      model,
      instructions: config.instructions,
      temperature: config.temperature ?? 0.7,
      maxTokens: CHIPCHAT_DEFAULTS.maxTokens,
    });
  }

  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return undefined;
  }

  needsPrewarm(): boolean {
    return true;
  }

  getLogPrefix(): string {
    return '🍎';
  }
}
