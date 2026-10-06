/**
 * Gemini Live Provider
 *
 * Implementation of ModelProvider for Google's Gemini Live API.
 *
 * Key characteristics:
 * - Native function calling by default (VOICE_PIPELINE=gemini-live)
 * - Text-only mode with Cartesia TTS for persona voices
 * - Built-in VAD turn detection (enabled by default in Gemini)
 * - Prewarm recommended for first response latency
 * - Optional Vertex AI mode for higher quotas
 *
 * Configuration (via environment or gemini-fc-config.ts):
 * - GEMINI_USE_NATIVE_FC: Native function calling (default true on gemini-live)
 * - GEMINI_FC_MODE: Function calling mode (AUTO/ANY/NONE)
 * - GEMINI_TURN_OPTIMIZATION: Enable turn-by-turn tool optimization (true/false)
 * - GEMINI_NATIVE_PROMPTS: Use simplified prompts without JSON instructions (true/false)
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
 * Used for native function calling.
 */
interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

import { REALTIME_MODEL } from '../../config/gemini-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isFTISEnabled } from '../processors/tool-routing-integration.js';
import {
  getGeminiFCConfig,
  isNativeFCEnabled,
  type GeminiFCMode,
} from '../shared/gemini-fc-config.js';
import type {
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';
import { getContextualTemperature, TEMPERATURE_DEFAULTS } from './types.js';

const log = createLogger({ module: 'GeminiLiveProvider' });

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Gemini has a higher token limit than OpenAI.
 * Setting to 30,000 which is safe for most use cases.
 */
const GEMINI_TOKEN_LIMIT = 30000;

/**
 * Get the configured function calling mode.
 *
 * Priority:
 * 1. FTIS V2 mode active → NONE (FTIS handles all tools externally)
 * 2. Native FC disabled → NONE (use JSON workaround only)
 * 3. Use configured mode from gemini-fc-config
 */
function getGeminiFCMode(): GeminiFCMode {
  // FTIS mode disables all Gemini native tool knowledge
  if (isFTISEnabled()) {
    return 'NONE';
  }

  // If native FC is disabled, return NONE
  if (!isNativeFCEnabled()) {
    return 'NONE';
  }

  // Use configured mode
  return getGeminiFCConfig().fcMode;
}

/**
 * Check if FTIS is enabled.
 * When true, Gemini has NO tool knowledge - FTIS handles everything.
 */
function isFTISOnlyMode(): boolean {
  return isFTISEnabled();
}

// ============================================================================
// NATIVE FUNCTION CALLING INSTRUCTIONS
// ============================================================================

/**
 * Minimal instructions for Gemini with native function calling.
 *
 * These are foundational rules that:
 * - Establish platform context (Ferni team)
 * - CRITICAL: Tell Gemini to USE the native function calling API (not JSON)
 * - Set voice output guidance
 * - Include anti-hallucination guardrails
 *
 * This is analogous to OpenAI's MINIMAL_INSTRUCTIONS but for Gemini.
 * Without this, Gemini doesn't know HOW to call tools - only WHEN (from tool-usage-guidance.md).
 */
/**
 * Native Function Calling Instructions for Gemini
 *
 * SIMPLIFIED VERSION (Jan 2026) - Research shows shorter prompts = better FC reliability
 * Key changes:
 * - Under 50 lines (was 130+)
 * - Positive framing ("DO" not "DON'T")
 * - Action-oriented trigger table
 * - No lengthy explanations
 *
 * Reference: https://cloud.google.com/vertex-ai/generative-ai/docs/live-api/best-practices
 */
const GEMINI_NATIVE_FC_INSTRUCTIONS = `You are Ferni, a warm voice-first AI life coach. Speak naturally, like a wise friend.

## ACTION RULE (CRITICAL)

When you hear an actionable request, CALL THE FUNCTION IMMEDIATELY — before speaking.

| User Says | DO THIS FIRST |
|-----------|---------------|
| "play music", "put on some jazz", "some music" | → playMusic({query:"..."}) |
| "weather", "temperature" | → getWeather() |
| "reminder", "remind me" | → setReminder({...}) |
| "timer", "alarm" | → quickTimer({...}) or quickAlarm({...}) |
| "talk to Maya/Peter/Alex/Jordan/Nayan" | → handoffToMaya/Peter/Alex/Jordan/Nayan({...}) |
| "news", "what's happening" | → getNews() |
| "remember this", "save" | → rememberAboutUser({...}) |

WRONG: "Let me play that for you" (then no function call)
WRONG: "What kind of music are you in the mood for?" (don't ask — just pick something)
RIGHT: call playMusic({query:"morning jazz"}) then say "Here we go!"

## MUSIC RULE (NEVER ASK, JUST PLAY)

When the user mentions music in ANY way — "play some music", "put on something", "some tunes", "morning music" — you MUST call playMusic() immediately. NEVER ask what kind. Pick something appropriate based on context (time of day, mood, conversation topic). If they want something specific, they'll tell you.

## VOICE OUTPUT RULES

1. Your output is spoken aloud — only say what a friend would say out loud
2. After a function returns, announce the result naturally: "It's 72 and sunny" / "Here's some jazz"
3. Keep sentences short. Use reactions: "Oh!" "Hmm." "Got it."
4. Never output brackets, JSON, or function names — function calls are API events, not text
5. NEVER generate text that narrates actions like "[plays music]" or "[searches weather]" — CALL the function instead

## YOUR TEAM (handoff available)

- Maya: habits & routines
- Peter: research & analysis
- Alex: communications & productivity
- Jordan: events & celebrations
- Nayan: wisdom & philosophy

## SAFETY

You're a life coach, not a licensed professional. For medical/legal/financial/crisis: show empathy and suggest professional help.`;

// ============================================================================
// PROVIDER IMPLEMENTATION
// ============================================================================

/**
 * Gemini Live Provider
 *
 * Uses Google's Gemini Live API with native function calling.
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
   * Determined by:
   * 1. FTIS_ONLY_MODE → NO (FTIS handles all tools externally)
   * 2. Otherwise native FC (default when VOICE_PIPELINE=gemini-live)
   */
  hasNativeFunctionCalling(): boolean {
    if (isFTISOnlyMode()) {
      return false; // FTIS handles all tools - no native FC
    }
    return isNativeFCEnabled();
  }

  /**
   * The JSON {fn,args} workaround is gone. Gemini Live uses native FC or FTIS.
   */
  needsJsonWorkaround(): boolean {
    return false;
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
   * Two modes:
   * 1. FTIS_ONLY_MODE: No function calling prompts (FTIS handles all tools)
   * 2. Native FC: No JSON format instructions, just tool guidance
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

    log.debug('Using native FC prompts with minimal instructions');
    return {
      includeFunctionCallingBase: false,
      includeFunctionCallingSpecialty: false,
      includeToolUsageGuidance: true,
      includeModelBaseInstructions: true,
      useMinimalInstructions: true,
    };
  }

  /**
   * Gemini has a higher token limit.
   */
  getTokenLimit(): number {
    return GEMINI_TOKEN_LIMIT;
  }

  /**
   * Get minimal instructions for Gemini native function calling mode.
   *
   * CRITICAL: When native FC is enabled, these instructions tell Gemini
   * HOW to use the function calling API. Without this, Gemini knows WHEN
   * to use tools (from tool-usage-guidance.md) but not HOW (it would just
   * talk instead of actually calling functions).
   */
  getMinimalInstructions(): string {
    // Only return native FC instructions when using native function calling
    return GEMINI_NATIVE_FC_INSTRUCTIONS;
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
    // - gemini-2.0-flash-live-preview-04-09 (current, retiring March 2026)
    // - gemini-live-2.5-flash-preview (future upgrade, supports TEXT modality)
    //
    // Native-audio models (gemini-*-native-audio-*) ONLY work with AUDIO modality
    // where Gemini handles both STT and TTS internally.

    // Dynamic temperature: Lower when tool call is expected for more deterministic output
    // Research (Jan 2026) shows this significantly improves Gemini's function calling reliability
    const temperature = config.expectsToolCall
      ? getContextualTemperature(
          true,
          false,
          config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION
        )
      : (config.temperature ?? TEMPERATURE_DEFAULTS.CONVERSATION);

    if (config.expectsToolCall) {
      log.debug({ temperature }, '🌡️ Lowered temperature (tool call expected)');
    }

    // Check if Vertex AI should be used for Live API
    // Try BOTH env vars - GEMINI_LIVE_USE_VERTEX_AI for explicit control, or fall back to general vars
    const useVertexAI =
      process.env.GEMINI_LIVE_USE_VERTEX_AI === 'true' ||
      process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' ||
      process.env.USE_VERTEX_AI === 'true';
    const gcpProject = process.env.GOOGLE_CLOUD_PROJECT;
    const gcpLocation = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    const modelOptions: Record<string, unknown> = {
      model: config.model || REALTIME_MODEL,
      modalities: [TEXT_MODALITY],
      temperature,
      instructions: config.instructions,
      // Lock language to English to prevent Gemini from misidentifying input language
      // and responding in Korean/Chinese/etc. Flows to speechConfig.languageCode.
      language: 'en-US',
      // Enable input audio transcription for FTIS V2 and debugging
      // CRITICAL: Must be empty object {} - the AudioTranscriptionConfig interface
      // is empty and adding invalid fields like languageCode breaks transcription!
      // This enables UserInputTranscribed events needed for FTIS V2 tool routing.
      inputAudioTranscription: {},
    };

    // Configure Vertex AI if enabled (higher quotas)
    if (useVertexAI && gcpProject) {
      modelOptions.vertexai = true;
      modelOptions.project = gcpProject;
      modelOptions.location = gcpLocation;
      log.info({ project: gcpProject, location: gcpLocation }, '🔷 Gemini Live using Vertex AI');
    } else {
      log.info(
        '🔶 Gemini Live using Gemini API (set GOOGLE_GENAI_USE_VERTEXAI=true for Vertex AI)'
      );
    }

    // Pass tools for native function calling
    // Configured via gemini-fc-config.ts
    const fcMode = getGeminiFCMode();
    const geminiFCConfig = getGeminiFCConfig();

    // Only load tools if FC mode is not NONE
    if (fcMode !== 'NONE') {
      const generatedDeclarations = await this.loadGeneratedDeclarations();

      let functionDeclarations: GeminiFunctionDeclaration[] = [];

      if (generatedDeclarations && generatedDeclarations.length > 0) {
        // Use generated declarations from tool schemas
        functionDeclarations = generatedDeclarations;
      } else if (config.tools && config.tools.length > 0) {
        // Fall back to converted LiveKit tools
        functionDeclarations = this.convertToGeminiFunctions(config.tools);
      }

      // Apply strict schemas if configured (anti-hallucination)
      if (geminiFCConfig.enforceStrictSchemas && functionDeclarations.length > 0) {
        functionDeclarations = functionDeclarations.map((decl) => ({
          ...decl,
          parameters: decl.parameters
            ? {
                ...decl.parameters,
                additionalProperties: false,
              }
            : undefined,
        }));
        log.debug('🔒 Applied strict schemas (additionalProperties: false)');
      }

      if (functionDeclarations.length > 0) {
        // Cap tools at maxToolsPerTurn if turn optimization is enabled
        if (geminiFCConfig.enableTurnOptimization) {
          const maxTools = geminiFCConfig.maxToolsPerTurn;
          if (functionDeclarations.length > maxTools) {
            log.debug(
              { original: functionDeclarations.length, capped: maxTools },
              '✂️ Capping tools at maxToolsPerTurn'
            );
            functionDeclarations = functionDeclarations.slice(0, maxTools);
          }
        }

        // NOTE (Jan 2026): LiveKit's RealtimeModel constructor does NOT accept `tools` option!
        // Function declarations must be sent via session.updateTools() AFTER session starts.
        // The agent's _tools are automatically sent via registerInitialTools() in voice-agent-entry.ts
        // and persona-agent-factory.ts after session.start().
        //
        // We configure toolConfig here for the FC mode (AUTO/ANY), but the actual function
        // declarations are registered separately via LiveKit's updateTools() → toFunctionDeclarations()

        // Configure function calling mode
        // Research (Jan 2026): 'AUTO' mode lets Gemini decide, 'ANY' forces function calling
        modelOptions.toolConfig = {
          functionCallingConfig: {
            mode: fcMode, // 'AUTO' or 'ANY'
          },
        };

        log.info(
          {
            fcMode,
            toolCount: functionDeclarations.length,
            strictSchemas: geminiFCConfig.enforceStrictSchemas,
            turnOptimization: geminiFCConfig.enableTurnOptimization,
          },
          `🎯 Native FC configured: ${fcMode} mode (tools sent via session.updateTools after start)`
        );
      }
    } else {
      if (isFTISOnlyMode()) {
        log.debug('🚀 FTIS_ONLY_MODE: Gemini has NO tool knowledge - FTIS handles everything');
      } else {
        log.debug(
          '🎯 Native function calling DISABLED (GEMINI_FC_MODE=NONE or GEMINI_USE_NATIVE_FC=false)'
        );
      }
    }

    // Use google.beta.realtime namespace for Gemini Live API
    const model = new google.beta.realtime.RealtimeModel(modelOptions);

    // 🔊 E2E TRACING: Attach comprehensive message logging
    // Enable with DEBUG_GEMINI_ALL=true to see EVERYTHING
    const debugAll =
      process.env.DEBUG_GEMINI_ALL === 'true' || process.env.DEBUG_GEMINI_MESSAGES === 'true';

    const modelWithEvents = model as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
    };

    if (modelWithEvents.on) {
      log.debug('🔊 Attaching E2E message tracing...');

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
          const truncated =
            eventStr.length > 2000 ? `${eventStr.slice(0, 2000)}...[TRUNCATED]` : eventStr;

          if (debugAll) {
            process.stderr.write(`\n📡 [GEMINI ${eventName}] ${truncated}\n`);
          } else {
            // Always log important events even without debug flag
            if (['error', 'close', 'input_audio_transcription_completed'].includes(eventName)) {
              process.stderr.write(`\n📡 [GEMINI ${eventName}] ${truncated}\n`);
            }
          }

          // 🔧 NATIVE FC LOGGING: Always log function call events for debugging
          // These events indicate Gemini is using native function calling
          if (eventName === 'response.function_call_arguments.done') {
            const fcEvent = event as {
              name?: string;
              call_id?: string;
              arguments?: string;
            };
            let parsedArgs: unknown = fcEvent.arguments;
            try {
              if (typeof fcEvent.arguments === 'string') {
                parsedArgs = JSON.parse(fcEvent.arguments);
              }
            } catch {
              // Keep as string if not valid JSON
            }
            process.stderr.write(
              `\n🔧 [NATIVE FC] Gemini function call COMPLETE:\n` +
                `   Tool: ${fcEvent.name || 'unknown'}\n` +
                `   Call ID: ${fcEvent.call_id || 'none'}\n` +
                `   Arguments: ${JSON.stringify(parsedArgs, null, 2)}\n\n`
            );
          }
        });
      }

      log.debug({ eventCount: eventsToTrace.length, debugAll }, '🔊 Tracing event types');
    } else {
      log.warn('⚠️ Model does not support event listeners - no tracing available');
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
    // Use the centralized config instead of checking env var directly
    // This ensures consistency - GEMINI_USE_NATIVE_FC is the correct env var name
    if (!isNativeFCEnabled()) {
      return null;
    }

    try {
      // Dynamic import to avoid loading unless feature is enabled
      const { functionDeclarations } =
        await import('../../tools/schemas/generated/gemini-declarations.generated.js');

      // Log success (only once per session)
      if (Array.isArray(functionDeclarations) && functionDeclarations.length > 0) {
        log.info(
          { count: functionDeclarations.length },
          '🎯 Loaded native function declarations from schemas'
        );
      }

      return functionDeclarations as GeminiFunctionDeclaration[];
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '⚠️ Native FC enabled but generated declarations file not found - falling back to converted tools'
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
