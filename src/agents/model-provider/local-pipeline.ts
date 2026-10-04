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

import { createLogger } from '../../utils/safe-logger.js';
import { OllamaLLMAdapter } from './ollama-llm-adapter.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'local-pipeline-provider' });

const OLLAMA_DEFAULTS = {
  url: 'http://127.0.0.1:11434',
  model: 'qwen3:8b',
} as const;

function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || OLLAMA_DEFAULTS.url;
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || OLLAMA_DEFAULTS.model;
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
