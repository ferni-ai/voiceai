/**
 * Gemma 3n Model Provider
 *
 * Makes Gemma 3n "Live compatible" by using the same ModelProvider interface
 * with either:
 * - **Local:** Ollama (e.g. gemma3n:e4b) when GEMMA3N_OLLAMA_URL is set
 * - **Cloud:** Vertex AI or Gemini API generateContentStream when GEMMA3N_OLLAMA_URL is unset
 *
 * No Gemini Live WebSocket — use external STT (e.g. Higgs, Kyutai, Gemini) and TTS (Cartesia, Higgs).
 *
 * Key characteristics:
 * - Local: Ollama /api/chat streaming (same as Local Pipeline)
 * - Cloud: Vertex AI or Gemini API generateContentStream (REST streaming)
 * - No built-in turn detection — use LiveKit server_vad
 * - JSON workaround for function calling (same as Gemini path)
 * - Same voice-agent stack: STT → Gemma 3n (LLM) → TTS
 *
 * Environment: USE_GEMMA3N=true
 *   GEMMA3N_OLLAMA_URL - If set, use local Ollama (model: GEMMA3N_MODEL or gemma3n:e4b). Unset = cloud (Vertex/Gemini API).
 *   GEMMA3N_MODEL     - Model id: cloud default gemma-3n-4b-it; local default gemma3n:e4b
 *   GEMMA3N_USE_VERTEX_AI - Use Vertex AI when using cloud (default: false)
 *   GOOGLE_GENAI_*    - API key / project for Gemini/Vertex (cloud only)
 *
 * @module agents/model-provider/gemma3n
 */

import { DEFAULT_API_CONNECT_OPTIONS, llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { OllamaLLMAdapter } from './local-pipeline.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';
import { getContextualTemperature, TEMPERATURE_DEFAULTS } from './types.js';

const log = createLogger({ module: 'gemma3n-provider' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const GEMMA3N_DEFAULTS = {
  model: 'gemma-3n-4b-it',
  modelOllama: 'gemma3n:e4b',
  maxTokens: 256,
} as const;

/** When set, use local Ollama for Gemma 3n instead of Vertex/Gemini API. */
function getGemma3nOllamaUrl(): string | undefined {
  return process.env.GEMMA3N_OLLAMA_URL;
}

function getGemma3nModel(useOllama: boolean): string {
  return (
    process.env.GEMMA3N_MODEL ||
    (useOllama ? GEMMA3N_DEFAULTS.modelOllama : GEMMA3N_DEFAULTS.model)
  );
}

function useVertexAI(): boolean {
  return (
    process.env.GEMMA3N_USE_VERTEX_AI === 'true' ||
    process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' ||
    process.env.USE_VERTEX_AI === 'true'
  );
}

// =============================================================================
// CHAT CONTEXT → GEMINI CONTENTS
// =============================================================================

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

function chatContextToGeminiContents(chatCtx: llm.ChatContext): {
  contents: GeminiContent[];
  systemInstruction?: string;
} {
  const contents: GeminiContent[] = [];
  let systemInstruction: string | undefined;

  for (const item of chatCtx.items) {
    if (item.type !== 'message') continue;
    const msg = item as llm.ChatMessage;
    const text = msg.textContent?.trim() ?? '';
    if (!text) continue;

    if (msg.role === 'developer' || msg.role === 'system') {
      systemInstruction = systemInstruction
        ? `${systemInstruction}\n\n${text}`
        : text;
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text }] });
  }

  return { contents, systemInstruction };
}

// =============================================================================
// GEMMA 3N LLM ADAPTER
// =============================================================================

export interface Gemma3nLLMAdapterConfig {
  model: string;
  instructions?: string;
  temperature?: number;
  maxTokens?: number;
  useVertexAI: boolean;
}

/**
 * LiveKit LLM implementation that streams from Vertex AI / Gemini API
 * generateContentStream for Gemma 3n (text-in, text-out).
 */
export class Gemma3nLLMAdapter extends llm.LLM {
  readonly _config: Gemma3nLLMAdapterConfig;

  constructor(config: Gemma3nLLMAdapterConfig) {
    super();
    this._config = config;
  }

  get model(): string {
    return this._config.model;
  }

  label(): string {
    return `gemma3n/${this._config.model}`;
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
    return new Gemma3nLLMStream(this, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions,
    });
  }
}

// =============================================================================
// GEMMA 3N LLM STREAM
// =============================================================================

class Gemma3nLLMStream extends llm.LLMStream {
  private adapter: Gemma3nLLMAdapter;

  constructor(
    adapter: Gemma3nLLMAdapter,
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
    const { contents, systemInstruction } = chatContextToGeminiContents(this.chatCtx);

    const systemInstructionFinal = systemInstruction ?? config.instructions ?? '';

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const apiKey = process.env.GOOGLE_GENAI_API_KEY ?? process.env.GOOGLE_API_KEY;
      const project = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

      const clientOptions: Record<string, unknown> = apiKey
        ? { apiKey }
        : {};
      if (config.useVertexAI && project) {
        (clientOptions as Record<string, unknown>).vertexai = true;
        (clientOptions as Record<string, unknown>).project = project;
        (clientOptions as Record<string, unknown>).location = location;
      }

      const ai = new GoogleGenAI(clientOptions as { apiKey?: string; vertexai?: boolean; project?: string; location?: string });

      const request: Record<string, unknown> = {
        model: config.model,
        contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '(No messages)' }] }],
        config: {
          temperature: config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION,
          maxOutputTokens: config.maxTokens ?? GEMMA3N_DEFAULTS.maxTokens,
        },
      };
      if (systemInstructionFinal) {
        (request as Record<string, unknown>).systemInstruction = systemInstructionFinal;
      }

      const stream = await ai.models.generateContentStream(
        request as unknown as Parameters<typeof ai.models.generateContentStream>[0]
      );

      let completionTokens = 0;
      for await (const chunk of stream) {
        if (this.abortController.signal.aborted) break;
        const text = (chunk as { text?: string }).text ?? '';
        if (text) {
          this.queue.put({
            id: `gemma3n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            delta: { role: 'assistant', content: text } as llm.ChoiceDelta,
          });
          completionTokens++;
        }
      }

      this.queue.put({
        id: `gemma3n_usage_${Date.now()}`,
        usage: {
          completionTokens,
          promptTokens: 0,
          promptCachedTokens: 0,
          totalTokens: completionTokens,
        } as llm.CompletionUsage,
      });
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      log.error({ error: String(error) }, 'Gemma 3n stream failed');
      throw error;
    }
  }
}

// =============================================================================
// GEMMA 3N PROVIDER
// =============================================================================

export class Gemma3nProvider implements ModelProvider {
  readonly id: ModelProviderId = 'gemma3n';
  readonly displayName = 'Gemma 3n (Vertex/Gemini API, Live-compatible)';

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
    return 32768;
  }

  getMinimalInstructions(): string {
    return '';
  }

  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const ollamaUrl = getGemma3nOllamaUrl();

    if (ollamaUrl) {
      // Local: Ollama (e.g. ollama run gemma3n:e4b)
      const model = getGemma3nModel(true);
      const temperature =
        config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION;
      const contextualTemp = config.expectsToolCall
        ? getContextualTemperature(true, false, temperature)
        : temperature;

      log.info(
        { ollamaUrl, model, temperature: contextualTemp },
        '🌿 Creating Gemma 3n LLM adapter (local Ollama)'
      );

      return new OllamaLLMAdapter({
        ollamaUrl,
        model,
        instructions: config.instructions,
        temperature: contextualTemp,
        maxTokens: GEMMA3N_DEFAULTS.maxTokens,
      });
    }

    // Cloud: Vertex AI or Gemini API
    const model = getGemma3nModel(false);
    const temperature =
      config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION;
    const contextualTemp = config.expectsToolCall
      ? getContextualTemperature(true, false, temperature)
      : temperature;

    log.info(
      { model, temperature: contextualTemp, useVertexAI: useVertexAI() },
      '🌿 Creating Gemma 3n LLM adapter (Vertex/Gemini API)'
    );

    return new Gemma3nLLMAdapter({
      model,
      instructions: config.instructions,
      temperature: contextualTemp,
      maxTokens: GEMMA3N_DEFAULTS.maxTokens,
      useVertexAI: useVertexAI(),
    });
  }

  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return undefined;
  }

  needsPrewarm(): boolean {
    return true;
  }

  getLogPrefix(): string {
    return '🌿';
  }
}
