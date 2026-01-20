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
 * Feature flags:
 * - USE_GEMINI_NATIVE_FC=true: Enable native function calling from generated schemas
 * - USE_GENERATED_TOOL_DOCS=true: Use auto-generated tool documentation
 *
 * Reference: https://docs.livekit.io/agents/models/realtime/plugins/gemini.md
 *
 * @module agents/model-provider/gemini-live
 */

// Use string literal for modality to avoid ESM/CJS interop issues with @google/genai
// The Modality enum from @google/genai can be undefined at runtime with tsx/esbuild
const TEXT_MODALITY = 'TEXT' as const;

// ============================================================================
// GEMINI FUNCTION DECLARATION TYPE
// ============================================================================

/**
 * Gemini function declaration format.
 * Used for native function calling as a backup to the semantic router.
 */
interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';
import { getContextualTemperature, TEMPERATURE_DEFAULTS } from './types.js';
import { isFTISV2OnlyMode } from '../processors/ftis-v2-integration.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Gemini has a higher token limit than OpenAI.
 * Setting to 30,000 which is safe for most use cases.
 */
const GEMINI_TOKEN_LIMIT = 30000;

/**
 * Function calling mode for Gemini.
 * 
 * Environment variable: GEMINI_FC_MODE
 * 
 * Options:
 * - 'AUTO' (default): Gemini decides when to call functions based on user input
 * - 'ANY': Force function calling - Gemini MUST call a function when tools are available
 *          This significantly improves reliability but may call functions unexpectedly
 * - 'NONE': Disable native function calling entirely (use JSON workaround only)
 * 
 * Research (Jan 2026) shows 'ANY' mode reduces flakiness significantly by
 * forcing Gemini to commit to a function call rather than speaking about tools.
 */
type GeminiFCMode = 'AUTO' | 'ANY' | 'NONE';

/**
 * Get the configured function calling mode from environment.
 * 
 * FIX (Jan 2026): Now properly checks isFTISV2OnlyMode() instead of
 * just the env var. When FTIS V2 is active (default), native FC should
 * be NONE since FTIS handles all tool routing via transcripts.
 */
function getGeminiFCMode(): GeminiFCMode {
  // FTIS V2 mode disables all Gemini native tool knowledge
  // FTIS V2 handles tools via transcript classification, not native FC
  if (isFTISV2OnlyMode()) {
    return 'NONE';
  }
  const mode = process.env.GEMINI_FC_MODE?.toUpperCase();
  if (mode === 'ANY' || mode === 'NONE' || mode === 'AUTO') {
    return mode;
  }
  // Default to AUTO when FTIS V2 is disabled
  return 'AUTO';
}

/**
 * Check if FTIS-only mode is enabled.
 * When true, Gemini has NO tool knowledge - FTIS handles everything.
 * 
 * NOTE: This function delegates to the consolidated isFTISV2OnlyMode() from
 * ftis-v2-integration.ts which is the single source of truth.
 * It checks both FTIS_V2_ONLY_MODE and FTIS_ONLY_MODE env vars.
 */
function isFTISOnlyMode(): boolean {
  return isFTISV2OnlyMode();
}

/**
 * Default Gemini model for TEXT modality with external TTS (half-cascade architecture).
 *
 * IMPORTANT: Native-audio models (gemini-*-native-audio-*) do NOT support TEXT modality!
 * They fail with "Cannot extract voices from a non-audio request" error.
 * This is a known Google bug: https://github.com/livekit/agents/issues/4423
 *
 * For TEXT mode with Cartesia TTS, use standard models:
 * - gemini-2.0-flash-exp (recommended - stable, fast)
 * - gemini-2.5-flash (if available)
 *
 * Native-audio models should ONLY be used with AUDIO modality where Gemini
 * handles both STT and TTS internally.
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
   * Whether Gemini has native function calling capabilities.
   *
   * When FTIS_ONLY_MODE=true: NO - FTIS handles all tools externally
   * Otherwise: YES - Native FC enabled as backup layer
   *
   * Architecture (when not in FTIS-only mode):
   * 1. Semantic Router handles 90%+ of tool calls (primary, <1ms)
   * 2. Native FC provides backup for uncertain cases
   * 3. JSON workaround catches any remaining edge cases
   * 4. SSML processor strips any leaked JSON
   */
  hasNativeFunctionCalling(): boolean {
    if (isFTISOnlyMode()) {
      return false; // FTIS handles all tools - no native FC
    }
    return true; // Enabled as backup layer
  }

  /**
   * Whether Gemini needs the JSON workaround for function calling.
   *
   * When FTIS_ONLY_MODE=true: NO - FTIS handles all tools externally
   * Otherwise: YES - JSON workaround provides defense-in-depth
   *
   * The sanitizer intercepts JSON output to execute tools before TTS.
   */
  needsJsonWorkaround(): boolean {
    if (isFTISOnlyMode()) {
      return false; // FTIS handles all tools - no JSON workaround needed
    }
    return true; // Still enabled for defense-in-depth
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
   * Gemini prompt modules configuration.
   * 
   * When FTIS_ONLY_MODE=true:
   * - NO JSON function calling prompts (Gemini has no tool knowledge)
   * - FTIS handles all tool routing externally
   * - Gemini just does natural conversation
   */
  getPromptModules(): PromptModuleConfig {
    if (isFTISOnlyMode()) {
      // FTIS handles all tools - Gemini is pure conversation
      return {
        includeFunctionCallingBase: false,
        includeFunctionCallingSpecialty: false,
        includeToolUsageGuidance: false, // No tool guidance needed
        includeModelBaseInstructions: true,
        useMinimalInstructions: false,
      };
    }
    
    // Default: Include JSON function-calling prompts
    return {
      includeFunctionCallingBase: true, // JSON format instructions
      includeFunctionCallingSpecialty: true, // JSON format examples
      includeToolUsageGuidance: true, // Conceptual guidance (ALL providers need this)
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
   * Native function calling is passed as a BACKUP layer - the semantic router
   * handles most tool calls, but native FC provides defense-in-depth.
   *
   * Reference: https://docs.livekit.io/agents/models/realtime/plugins/gemini.md
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    // Dynamic import per official docs
    const google = await import('@livekit/agents-plugin-google');

    // FERNI (Jan 2026): TEXT modality configuration for half-cascade architecture
    //
    // CRITICAL: Native-audio models do NOT work with TEXT modality!
    // See: https://github.com/livekit/agents/issues/4423
    // See: https://github.com/googleapis/python-genai/issues/1780
    //
    // For TEXT output + external TTS (Cartesia), use standard models like:
    // - gemini-2.0-flash-exp (recommended)
    // - gemini-2.5-flash
    //
    // Native-audio models (gemini-*-native-audio-*) ONLY work with AUDIO modality
    // where Gemini handles both STT and TTS internally.
    
    // Dynamic temperature: Lower when tool call is expected for more deterministic output
    // Research (Jan 2026) shows this significantly improves Gemini's function calling reliability
    const temperature = config.expectsToolCall
      ? getContextualTemperature(true, false, config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION)
      : config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION;

    if (config.expectsToolCall) {
      console.log(
        `🌡️ [Gemini] Lowered temperature to ${temperature} (tool call expected)`
      );
    }

    const modelOptions: Record<string, unknown> = {
      model: config.model || DEFAULT_GEMINI_MODEL,
      modalities: [TEXT_MODALITY],
      temperature,
      instructions: config.instructions,
      // Enable input audio transcription for FTIS V2 and debugging
      // CRITICAL: Must be empty object {} - the AudioTranscriptionConfig interface
      // is empty and adding invalid fields like languageCode breaks transcription!
      // This enables UserInputTranscribed events needed for FTIS V2 tool routing.
      inputAudioTranscription: {},
    };

    // Pass tools for native function calling as a backup layer
    // The semantic router handles 90%+ of tool calls, but native FC
    // provides defense-in-depth for edge cases
    //
    // Priority:
    // 1. Generated declarations (USE_GEMINI_NATIVE_FC=true): Single source of truth
    // 2. Converted config.tools: Existing tool definitions
    const fcMode = getGeminiFCMode();
    
    // Only load tools if FC mode is not NONE
    if (fcMode !== 'NONE') {
      const generatedDeclarations = await this.loadGeneratedDeclarations();

      if (generatedDeclarations && generatedDeclarations.length > 0) {
        // Use generated declarations from tool schemas
        modelOptions.tools = [{ functionDeclarations: generatedDeclarations }];
      } else if (config.tools && config.tools.length > 0) {
        // Fall back to converted LiveKit tools
        const functionDeclarations = this.convertToGeminiFunctions(config.tools);
        if (functionDeclarations.length > 0) {
          modelOptions.tools = [{ functionDeclarations }];
        }
      }

      // Configure function calling mode
      // Research (Jan 2026): 'ANY' mode forces function calling and reduces flakiness
      // See: https://ai.google.dev/gemini-api/docs/function-calling
      if (modelOptions.tools) {
        modelOptions.toolConfig = {
          functionCallingConfig: {
            mode: fcMode, // 'AUTO' or 'ANY'
          },
        };
        
        console.log(
          `🎯 [Gemini] Function calling mode: ${fcMode} (${fcMode === 'ANY' ? 'FORCED' : 'automatic'})`
        );
      }
    } else {
      if (isFTISOnlyMode()) {
        console.log('🚀 [Gemini] FTIS_ONLY_MODE: Gemini has NO tool knowledge - FTIS handles everything');
      } else {
        console.log('🎯 [Gemini] Native function calling DISABLED (GEMINI_FC_MODE=NONE)');
      }
    }

    // Use google.beta.realtime namespace for Gemini Live API
    const model = new google.beta.realtime.RealtimeModel(modelOptions);

    // 🔊 E2E TRACING: Attach comprehensive message logging
    // Enable with DEBUG_GEMINI_ALL=true to see EVERYTHING
    const debugAll = process.env.DEBUG_GEMINI_ALL === 'true' || process.env.DEBUG_GEMINI_MESSAGES === 'true';
    
    const modelWithEvents = model as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    
    if (modelWithEvents.on) {
      console.log('🔊 [GEMINI] Attaching E2E message tracing...');
      
      // Log ALL events from the model
      const eventsToTrace = [
        // Core message events
        'message',
        'response',
        'content',
        // Audio events
        'input_audio_transcription_completed',
        'input_transcription',
        'audio_buffer_speech_started',
        'audio_buffer_speech_stopped',
        // State events
        'session.created',
        'session.update',
        'conversation.item.created',
        'response.created',
        'response.done',
        'response.output_item.added',
        'response.content_part.added',
        'response.text.delta',
        'response.text.done',
        'response.function_call_arguments.delta',
        'response.function_call_arguments.done',
        // Error events
        'error',
        'close',
      ];
      
      for (const eventName of eventsToTrace) {
        modelWithEvents.on(eventName, (event: unknown) => {
          const eventStr = JSON.stringify(event, null, 2);
          const truncated = eventStr.length > 2000 ? eventStr.slice(0, 2000) + '...[TRUNCATED]' : eventStr;
          
          if (debugAll) {
            process.stderr.write(`\n📡 [GEMINI ${eventName}] ${truncated}\n`);
          } else {
            // Always log important events even without debug flag
            if (['error', 'close', 'input_audio_transcription_completed'].includes(eventName)) {
              process.stderr.write(`\n📡 [GEMINI ${eventName}] ${truncated}\n`);
            }
          }
        });
      }
      
      console.log(`🔊 [GEMINI] Tracing ${eventsToTrace.length} event types (DEBUG_GEMINI_ALL=${debugAll})`);
    } else {
      console.log('⚠️ [GEMINI] Model does not support event listeners - no tracing available');
    }

    return model;
  }

  // -------------------------------------------------------------------------
  // Generated Tool Declarations
  // -------------------------------------------------------------------------

  /**
   * Load generated function declarations from tool schemas.
   *
   * When USE_GEMINI_NATIVE_FC=true, loads declarations from:
   * src/tools/schemas/generated/gemini-declarations.generated.ts
   *
   * This is part of the Gemini Native Tool Schema migration:
   * - Single source of truth: JSON schema files
   * - Auto-generated declarations: validated, consistent
   * - Feature flag: opt-in, parallel operation with existing system
   *
   * @returns Generated declarations or null if disabled/unavailable
   */
  async loadGeneratedDeclarations(): Promise<GeminiFunctionDeclaration[] | null> {
    if (process.env.USE_GEMINI_NATIVE_FC !== 'true') {
      return null;
    }

    try {
      // Dynamic import to avoid loading unless feature is enabled
      const { functionDeclarations } =
        await import('../../tools/schemas/generated/gemini-declarations.generated.js');

      // Log success (only once per session)
      if (Array.isArray(functionDeclarations) && functionDeclarations.length > 0) {
        console.log(
          `🎯 [Gemini] Loaded ${functionDeclarations.length} native function declarations from schemas`
        );
      }

      return functionDeclarations as GeminiFunctionDeclaration[];
    } catch (error) {
      console.warn(
        '⚠️ [Gemini] USE_GEMINI_NATIVE_FC=true but generated declarations not found:',
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Tool Conversion
  // -------------------------------------------------------------------------

  /**
   * Convert LiveKit tool definitions to Gemini function declarations.
   *
   * Gemini expects tools in this format:
   * ```
   * tools: [{
   *   functionDeclarations: [{
   *     name: 'toolName',
   *     description: 'what it does',
   *     parameters: { type: 'object', properties: {...} }
   *   }]
   * }]
   * ```
   *
   * @param tools - LiveKit tool definitions
   * @returns Array of Gemini function declarations
   */
  convertToGeminiFunctions(tools: unknown[]): GeminiFunctionDeclaration[] {
    return tools
      .map((tool) => {
        // Handle various tool definition formats
        const t = tool as Record<string, unknown>;

        // Skip if no name
        const name = t.name as string | undefined;
        if (!name) return null;

        const declaration: GeminiFunctionDeclaration = {
          name,
          description: (t.description as string) || `Execute ${name}`,
        };

        // Convert parameters if present
        const params = t.parameters as Record<string, unknown> | undefined;
        if (params != null && params.properties != null) {
          declaration.parameters = {
            type: 'object',
            properties: params.properties as Record<string, unknown>,
            required: Array.isArray(params.required) ? params.required : [],
          };
        }

        return declaration;
      })
      .filter((d): d is GeminiFunctionDeclaration => d !== null);
  }

  /**
   * Convert tools to provider-native format (implements ModelProvider interface)
   */
  convertToolsToNativeFormat(tools: unknown[]): unknown {
    return [{ functionDeclarations: this.convertToGeminiFunctions(tools) }];
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
