/**
 * Ollama LLM Adapter
 *
 * LiveKit-compatible LLM that streams from a local Ollama server's /api/chat endpoint.
 * Used by the Gemma 3n provider's local mode.
 *
 * @module agents/model-provider/ollama-llm-adapter
 */

import { DEFAULT_API_CONNECT_OPTIONS, llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ollama-llm-adapter' });

const DEFAULT_MAX_TOKENS = 150;

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
 * Uses `think: false` to disable model thinking modes so all tokens go directly
 * to response content. This is critical for voice latency.
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
    toolCtx?: llm.ToolContextLike;
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
      toolCtx?: llm.ToolContextLike;
      connOptions: APIConnectOptions;
    }
  ) {
    super(adapter, opts);
    this.adapter = adapter;
  }

  protected async run(): Promise<void> {
    const config = this.adapter._config;
    const messages = chatContextToOllamaMessages(this.chatCtx);

    if (config.instructions) {
      messages.unshift({ role: 'system', content: config.instructions });
    }

    const payload = {
      model: config.model,
      messages,
      stream: true,
      think: false,
      options: {
        num_predict: config.maxTokens ?? DEFAULT_MAX_TOKENS,
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
