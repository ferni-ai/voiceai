/**
 * Gemini Live Provider
 *
 * Implementation of ModelProvider for Google's Gemini Live API.
 *
 * Key characteristics:
 * - JSON workaround for function calling (native FC unreliable)
 * - Text-only mode with Cartesia TTS for persona voices
 * - Built-in VAD turn detection (enabled by default in Gemini)
 * - Prewarm recommended for first response latency
 * - Optional Vertex AI mode for higher quotas
 *
 * Reference: https://docs.livekit.io/agents/models/realtime/plugins/gemini.md
 *
 * @module agents/model-provider/gemini-live
 */

import * as google from '@livekit/agents-plugin-google';

// Use string literal for modality to avoid ESM/CJS interop issues with @google/genai
// The Modality enum from @google/genai can be undefined at runtime with tsx/esbuild
const TEXT_MODALITY = 'TEXT' as const;

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
 * Default Gemini model - using 2.5 Flash native audio preview for better responsiveness
 */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

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
   * Gemini Live API includes built-in VAD-based turn detection, enabled by default.
   * This is server-side and very fast (~100-200ms response time).
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
   * Gemini has built-in VAD turn detection - responses trigger automatically.
   * Supports optional Vertex AI mode for higher quotas.
   *
   * Reference: https://docs.livekit.io/agents/models/realtime/plugins/gemini.md
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    // Dynamic import per official docs
    const google = await import('@livekit/agents-plugin-google');

    // Vertex AI configuration (optional, for higher quotas)
    const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';
    const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
    const vertexLocation = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    // Build model options per official LiveKit docs
    // https://docs.livekit.io/agents/models/realtime/plugins/gemini.md#usage-with-separate-tts
    const modelOptions: Record<string, unknown> = {
      model: config.model || DEFAULT_GEMINI_MODEL,
      // TEXT modality for half-cascade architecture with Cartesia TTS
      modalities: [TEXT_MODALITY],
      temperature: config.temperature || 0.7,
      instructions: config.instructions,
      // Enable user transcription for memory/context
      inputAudioTranscription: {},
      // Enable affective dialog for better emotional responses (native audio models only)
      enableAffectiveDialog: true,
    };

    // Add Vertex AI config if enabled
    if (USE_VERTEX_AI) {
      modelOptions.vertexai = true;
      modelOptions.project = vertexProject;
      modelOptions.location = vertexLocation;
    }

    // Use google.beta.realtime namespace for Gemini Live API
    const model = new google.beta.realtime.RealtimeModel(modelOptions);

    return model;
  }

  // -------------------------------------------------------------------------
  // Session Configuration
  // -------------------------------------------------------------------------

  /**
   * Gemini Live API has built-in VAD-based turn detection, enabled by default.
   * Return undefined to let Gemini's built-in VAD handle turn detection.
   *
   * Per docs: "The Gemini Live API includes built-in VAD-based turn detection,
   * enabled by default."
   */
  getSessionTurnDetection(): 'realtime_llm' | undefined {
    // Return undefined - Gemini's built-in VAD handles turn detection automatically
    // This is server-side and very fast (~100-200ms)
    return undefined;
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
