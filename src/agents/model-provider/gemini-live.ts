/**
 * Gemini Live Provider
 *
 * Implementation of ModelProvider for Google's Gemini Live API.
 *
 * Key characteristics:
 * - JSON workaround for function calling (native FC unreliable)
 * - Text-only mode with Cartesia TTS for persona voices
 * - realtime_llm turn detection
 * - Prewarm recommended for first response latency
 * - Optional Vertex AI mode for higher quotas
 *
 * @module agents/model-provider/gemini-live
 */

import type {
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
  LLMModelConfig,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Gemini has a higher token limit than OpenAI.
 * Setting to 30,000 which is safe for most use cases.
 */
const GEMINI_TOKEN_LIMIT = 30000;

/**
 * Default Gemini model
 */
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-exp';

// ============================================================================
// PROVIDER IMPLEMENTATION
// ============================================================================

/**
 * Gemini Live Provider
 *
 * Uses Google's Gemini Live API with JSON workaround for function calling.
 * Text-only mode with Cartesia TTS for persona voices.
 */
export class GeminiLiveProvider implements ModelProvider {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  readonly id: ModelProviderId = 'gemini-live';
  readonly displayName = 'Gemini Live API';

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * Gemini Live's native function calling is unreliable.
   * It often narrates tool calls instead of executing them.
   */
  hasNativeFunctionCalling(): boolean {
    return false;
  }

  /**
   * Gemini NEEDS the JSON workaround.
   * Prompts include JSON format instructions and the TTS sanitizer
   * intercepts JSON output to execute tools.
   */
  needsJsonWorkaround(): boolean {
    return true;
  }

  /**
   * Gemini uses realtime_llm turn detection.
   */
  hasBuiltInTurnDetection(): boolean {
    return true;
  }

  // -------------------------------------------------------------------------
  // Prompt Configuration
  // -------------------------------------------------------------------------

  /**
   * Gemini needs full JSON function-calling prompts.
   */
  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: true,
      includeFunctionCallingSpecialty: true,
      includeModelBaseInstructions: true,
      useMinimalInstructions: false,
    };
  }

  /**
   * Gemini has a higher token limit.
   */
  getTokenLimit(): number {
    return GEMINI_TOKEN_LIMIT;
  }

  /**
   * Gemini doesn't use minimal instructions - it needs full JSON prompts.
   */
  getMinimalInstructions(): string {
    // This shouldn't be called for Gemini since useMinimalInstructions is false
    return '';
  }

  // -------------------------------------------------------------------------
  // Model Creation
  // -------------------------------------------------------------------------

  /**
   * Create a Gemini Live model instance.
   *
   * Uses text-only mode so Cartesia TTS handles persona voices.
   * Supports optional Vertex AI mode for higher quotas.
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    // Dynamic imports to avoid loading SDK if not used
    const google = await import('@livekit/agents-plugin-google');
    const genai = await import('@google/genai');

    // Vertex AI configuration (optional, for higher quotas)
    const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';
    const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
    const vertexLocation = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    // Build model options
    const modelOptions: Record<string, unknown> = {
      model: config.model || DEFAULT_GEMINI_MODEL,
      modalities: [genai.Modality.TEXT], // Text-only → Cartesia TTS
      temperature: config.temperature || 0.7,
      instructions: config.instructions,
      // Enable user transcription
      inputAudioTranscription: {},
      // Auto tool choice for JSON workaround
      toolChoice: 'auto',
      // Enable Google Search built-in tool
      geminiTools: { googleSearch: {} },
    };

    // Add Vertex AI config if enabled
    if (USE_VERTEX_AI) {
      modelOptions.vertexai = true;
      modelOptions.project = vertexProject;
      modelOptions.location = vertexLocation;
    }

    const model = new google.beta.realtime.RealtimeModel(modelOptions);

    return model;
  }

  // -------------------------------------------------------------------------
  // Session Configuration
  // -------------------------------------------------------------------------

  /**
   * Gemini uses realtime_llm turn detection.
   */
  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return 'realtime_llm';
  }

  /**
   * Gemini benefits from prewarm to improve first response latency.
   */
  needsPrewarm(): boolean {
    return true;
  }

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  /**
   * Gemini log prefix
   */
  getLogPrefix(): string {
    return '🤖';
  }
}
