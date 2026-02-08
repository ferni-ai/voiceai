/**
 * LiveKit LLM Adapter for Qwen3-Omni Thinker
 *
 * Bridges the Qwen3-Omni Thinker (HTTP chat completions) to LiveKit's LLM interface
 * so that AgentSession can use it with STT → Thinker → TTS flow.
 *
 * @module integrations/qwen3-omni/adapters/livekit-llm-adapter
 */

import { DEFAULT_API_CONNECT_OPTIONS, llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import { Qwen3OmniClient } from '../client.js';
import type { Qwen3FunctionDefinition, Qwen3OmniMessage } from '../types.js';

const log = createLogger({ module: 'qwen3-omni-llm-adapter' });

// -----------------------------------------------------------------------------
// CHAT CONTEXT → QWEN3 MESSAGES
// -----------------------------------------------------------------------------

function chatContextToMessages(chatCtx: llm.ChatContext): Qwen3OmniMessage[] {
  const messages: Qwen3OmniMessage[] = [];

  for (const item of chatCtx.items) {
    if (item.type === 'message') {
      const msg = item as llm.ChatMessage;
      const role = msg.role === 'developer' ? 'system' : msg.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
      const text = msg.textContent?.trim() ?? '';
      if (!text && role !== 'system') continue;
      messages.push({
        role: role as 'system' | 'user' | 'assistant',
        content: [{ type: 'text', text }],
      });
    }
    // Optional: add function_call / function_call_output as tool messages
    // for now we only send conversation text; tool results can be added later
  }

  return messages;
}

// -----------------------------------------------------------------------------
// QWEN3 LLM ADAPTER
// -----------------------------------------------------------------------------

export interface Qwen3LLMAdapterConfig {
  serverUrl: string;
  instructions?: string;
  temperature?: number;
  tools?: unknown[];
  model?: string;
}

/**
 * LiveKit LLM implementation that delegates to Qwen3-Omni Thinker.
 */
export class Qwen3LLMAdapter extends llm.LLM {
  /** @internal Exposed for Qwen3LLMStream – do not use externally. */
  readonly _client: Qwen3OmniClient;
  /** @internal Exposed for Qwen3LLMStream – do not use externally. */
  readonly _config: Qwen3LLMAdapterConfig;

  constructor(config: Qwen3LLMAdapterConfig) {
    super();
    this._config = config;
    this._client = new Qwen3OmniClient({ serverUrl: config.serverUrl });
  }

  get model(): string {
    return this._config.model ?? 'Qwen3-Omni';
  }

  label(): string {
    return 'Qwen3-Omni-Thinker';
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
    return new Qwen3LLMStream(this, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions,
    });
  }
}

// -----------------------------------------------------------------------------
// QWEN3 LLM STREAM
// -----------------------------------------------------------------------------

class Qwen3LLMStream extends llm.LLMStream {
  private adapter: Qwen3LLMAdapter;

  constructor(
    adapter: Qwen3LLMAdapter,
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
    const client = this.adapter._client;
    const messages = chatContextToMessages(this.chatCtx);

    if (config.instructions) {
      messages.unshift({
        role: 'system',
        content: [{ type: 'text', text: config.instructions }],
      });
    }

    const tools = (config.tools ?? []) as Qwen3FunctionDefinition[];

    try {
      let completionTokens = 0;

      for await (const event of client.streamChatCompletion(messages, {
        tools: tools.length > 0 ? tools : undefined,
        temperature: config.temperature,
      })) {
        if (this.abortController.signal.aborted) break;

        if (event.type === 'text') {
          const chunk: llm.ChatChunk = {
            id: `qwen3_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            delta: { role: 'assistant', content: event.content } as llm.ChoiceDelta,
          };
          this.queue.put(chunk);
          completionTokens += event.content.length;
        } else if (event.type === 'function_call') {
          const fc = llm.FunctionCall.create({
            callId: `call_${Date.now()}`,
            name: event.call.name,
            args: JSON.stringify(event.call.arguments ?? {}),
          });
          const chunk: llm.ChatChunk = {
            id: `qwen3_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            delta: { role: 'assistant', toolCalls: [fc] } as llm.ChoiceDelta,
          };
          this.queue.put(chunk);
        } else if (event.type === 'done') {
          const usage: llm.CompletionUsage = {
            completionTokens,
            promptTokens: 0,
            promptCachedTokens: 0,
            totalTokens: completionTokens,
          };
          this.queue.put({
            id: `qwen3_usage_${Date.now()}`,
            usage,
          });
        }
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Qwen3-Omni stream failed');
      throw error;
    }
  }
}
