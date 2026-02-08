/**
 * Qwen3-Omni Model Provider
 *
 * Implements the ModelProvider interface for the Qwen3-Omni Thinker + Qwen3-TTS pipeline.
 * This is the self-hosted, Apache 2.0 alternative to OpenAI Realtime and Gemini Live.
 *
 * Key features:
 * - Native function calling (OpenAI-compatible API)
 * - Separate TTS pipeline (Qwen3-TTS with 3-sec voice cloning)
 * - Larger context window (16K+ tokens)
 * - No per-token API costs (self-hosted)
 * - Full-duplex support
 *
 * Environment: USE_QWEN3_OMNI=true
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'qwen3-omni-provider' });

// =============================================================================
// QWEN3-OMNI PROVIDER
// =============================================================================

export class Qwen3OmniProvider implements ModelProvider {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  readonly id: ModelProviderId = 'qwen3-omni';
  readonly displayName = 'Qwen3-Omni (Self-hosted S2S)';

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * Qwen3-Omni supports native function calling via OpenAI-compatible API.
   * No JSON workaround needed - tools are called via protocol-level tool_calls.
   */
  hasNativeFunctionCalling(): boolean {
    return true;
  }

  /**
   * No JSON workaround needed - native function calling is used.
   */
  needsJsonWorkaround(): boolean {
    return false;
  }

  /**
   * Qwen3-Omni doesn't have built-in LiveKit turn detection.
   * We rely on LiveKit's VAD for turn detection.
   */
  hasBuiltInTurnDetection(): boolean {
    return false;
  }

  // -------------------------------------------------------------------------
  // Prompt Configuration
  // -------------------------------------------------------------------------

  /**
   * Qwen3-Omni uses native function calling, so we skip JSON format instructions.
   * We include tool usage guidance (WHEN to use tools) but not format instructions.
   *
   * Similar to OpenAI Realtime - native FC means no JSON workaround prompts needed.
   */
  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: false, // No JSON format instructions
      includeFunctionCallingSpecialty: false, // No JSON examples
      includeToolUsageGuidance: true, // WHEN to use tools (always needed)
      includeModelBaseInstructions: false, // No JSON rules
      useMinimalInstructions: true, // Minimal, clean instructions
    };
  }

  /**
   * Qwen3-Omni has a large context window.
   * With INT4 quantization, we can afford ~16K tokens for system prompt.
   */
  getTokenLimit(): number {
    return 16384;
  }

  /**
   * Minimal instructions for Qwen3-Omni.
   * Since we use native FC, we don't need JSON format instructions.
   * The full persona prompt is built by the session manager.
   */
  getMinimalInstructions(): string {
    return `
You are a caring AI companion with superhuman emotional intelligence.
Use the tools available to you when helpful, but never announce tool usage.
Speak naturally with contractions, fillers, and real conversational patterns.
Be present, warm, and genuinely supportive.
`.trim();
  }

  // -------------------------------------------------------------------------
  // Model Creation
  // -------------------------------------------------------------------------

  /**
   * Create a LiveKit LLM adapter that delegates to Qwen3-Omni Thinker.
   *
   * Returns a real LLM instance (Qwen3LLMAdapter) so that AgentSession can use
   * the same STT → LLM → TTS flow as OpenAI/Gemini. TTS is provided separately
   * via Qwen3TTSAdapter when USE_QWEN3_OMNI is set.
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const serverUrl = process.env.QWEN3_OMNI_URL || 'http://localhost:8000';

    log.info(
      {
        serverUrl,
        temperature: config.temperature,
        toolCount: config.tools?.length,
      },
      'Creating Qwen3-Omni LLM adapter'
    );

    const { Qwen3LLMAdapter } =
      await import('../../integrations/qwen3-omni/adapters/livekit-llm-adapter.js');

    return new Qwen3LLMAdapter({
      serverUrl,
      instructions: config.instructions,
      temperature: config.temperature ?? 0.7,
      tools: config.tools,
      model: process.env.QWEN3_OMNI_MODEL || 'Qwen3-Omni',
    });
  }

  /**
   * Convert tools to Qwen3-Omni native format.
   * Qwen3-Omni uses OpenAI-compatible function calling format.
   */
  convertToolsToNativeFormat(tools: unknown[]): unknown {
    // Qwen3-Omni accepts the same format as OpenAI
    return tools;
  }

  // -------------------------------------------------------------------------
  // Session Configuration
  // -------------------------------------------------------------------------

  /**
   * No built-in turn detection - use LiveKit VAD.
   */
  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return undefined; // Use LiveKit's server_vad
  }

  /**
   * Qwen3-Omni benefits from prewarm to load the model into GPU memory.
   * First inference is slower (~2-3s) but subsequent ones are fast (~200ms).
   */
  needsPrewarm(): boolean {
    return true;
  }

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  getLogPrefix(): string {
    return '🧠'; // Brain for self-hosted intelligence
  }
}
