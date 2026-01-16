/**
 * OpenAI Realtime Provider
 *
 * Implementation of ModelProvider for OpenAI's Realtime API.
 *
 * Key characteristics:
 * - Native function calling at the protocol level (no JSON workaround)
 * - Text-only mode with Cartesia TTS for persona voices
 * - Server VAD for turn detection
 * - No prewarm needed
 *
 * @module agents/model-provider/openai-realtime
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
 * OpenAI Realtime API has a hard limit of 16,384 tokens for session.instructions.
 * We use a lower limit to leave room for system overhead.
 */
const OPENAI_TOKEN_LIMIT = 14000;

/**
 * Minimal instructions for OpenAI Realtime
 *
 * These are foundational rules that:
 * - Establish platform context (Ferni team)
 * - Clarify output rules (native function calling, NOT JSON)
 * - Set honesty and safety boundaries
 * - Provide voice output guidance
 * - Include anti-hallucination guardrails
 *
 * Critically, this does NOT include JSON function-calling format instructions
 * because OpenAI has native function calling at the protocol level.
 */
const MINIMAL_INSTRUCTIONS = `You are part of **Ferni**, a voice-first life coaching platform. You help people navigate life with warmth, wisdom, and genuine care.

**The Ferni Team:**
- **Ferni** - Life coach coordinator, curious and warm
- **Peter** - Research and analysis
- **Alex** - Communications and productivity
- **Maya** - Habits and routines
- **Jordan** - Events and celebrations
- **Nayan** - Wisdom and philosophy

**Output Rules:**
- For conversation → Output natural speech ONLY
- For tool calls → Use the native function calling (NOT JSON output)
- Never output JSON as speech (no "fn:speak" or similar)
- NEVER output XML, code, file paths, or technical formats
- NEVER speak anything that looks like code (<tags>, {json}, file.ext)

**Anti-Hallucination Rules (CRITICAL):**
- Only speak information you actually have
- Never invent file names, code, or technical details
- Never speak XML tags like <edit>, <path>, etc.
- Never speak programming code or file paths
- If you catch yourself about to output code/XML → STOP and say something natural instead

**Reading News, Weather, Sports:**
When you get news/weather/sports results from a tool, READ THEM OUT LOUD like a friendly radio announcer would. Don't just acknowledge getting them - actually share the content!
- News: "Here's what's happening... [read each headline with natural pauses]"
- Weather: "It's currently 72 degrees and sunny..."
- Sports: "The Eagles won 24-17 last night..."
Add natural transitions between items: "Also...", "And...", "Oh, interesting one..."

**Honesty Rules:**
- Never claim capabilities you don't have
- If a tool fails → Say "That didn't work"
- If you don't know → Say "I don't know"
- Never fabricate outcomes

**Voice Output:**
- Short sentences for voice
- Natural reactions: "Oh!" "Hmm." "Wait—"
- No asterisks or stage directions

**Safety:**
- You're a coach, not an advisor
- Never give medical, financial, or legal advice`;

// ============================================================================
// PROVIDER IMPLEMENTATION
// ============================================================================

/**
 * OpenAI Realtime Provider
 *
 * Uses OpenAI's Realtime API with native function calling.
 * Text-only mode with Cartesia TTS for persona voices.
 */
export class OpenAIRealtimeProvider implements ModelProvider {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  readonly id: ModelProviderId = 'openai-realtime';
  readonly displayName = 'OpenAI Realtime API';

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * OpenAI Realtime has native function calling at the protocol level.
   * Functions are called directly via the API, not by outputting JSON.
   */
  hasNativeFunctionCalling(): boolean {
    return true;
  }

  /**
   * OpenAI does NOT need the JSON workaround.
   * If we include JSON format instructions, the LLM will output "fn:speak" as speech.
   */
  needsJsonWorkaround(): boolean {
    return false;
  }

  /**
   * OpenAI has built-in server_vad turn detection.
   */
  hasBuiltInTurnDetection(): boolean {
    return true;
  }

  // -------------------------------------------------------------------------
  // Prompt Configuration
  // -------------------------------------------------------------------------

  /**
   * OpenAI should NOT include JSON function-calling prompts.
   * Native function calling handles tool execution.
   */
  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: false,
      includeFunctionCallingSpecialty: false,
      includeModelBaseInstructions: false,
      useMinimalInstructions: true,
    };
  }

  /**
   * OpenAI Realtime has a 16,384 token limit for instructions.
   */
  getTokenLimit(): number {
    return OPENAI_TOKEN_LIMIT;
  }

  /**
   * Get minimal instructions for OpenAI (no JSON function-calling format).
   */
  getMinimalInstructions(): string {
    return MINIMAL_INSTRUCTIONS;
  }

  // -------------------------------------------------------------------------
  // Model Creation
  // -------------------------------------------------------------------------

  /**
   * Create an OpenAI Realtime model instance.
   *
   * Uses text-only mode so Cartesia TTS handles persona voices.
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    // Dynamic import to avoid loading SDK if not used
    const openai = await import('@livekit/agents-plugin-openai');

    // Get VAD config from shared constants
    const { VAD_CONFIG } = await import('../shared/constants.js');

    // Use provided VAD config or defaults
    const vadConfig = config.vadConfig || {
      threshold: VAD_CONFIG.threshold,
      silenceDurationMs: VAD_CONFIG.silenceDurationMs,
      prefixPaddingMs: VAD_CONFIG.prefixPaddingMs,
      createResponse: VAD_CONFIG.createResponse,
      interruptResponse: VAD_CONFIG.interruptResponse,
    };

    // OpenAI Realtime requires temperature >= 0.6
    const temperature = Math.max(0.6, config.temperature || 0.7);

    // Note: OpenAI Realtime SDK doesn't accept 'instructions' in RealtimeModel constructor.
    // Instructions are set via the LiveKit Agent system prompt instead.
    // IMPORTANT: Always use OpenAI's realtime model - ignore config.model which may be set to Gemini
    const openaiModel = config.model?.startsWith('gpt-') ? config.model : 'gpt-4o-realtime-preview';
    const model = new openai.realtime.RealtimeModel({
      model: openaiModel,
      modalities: ['text'], // Text-only mode - Cartesia TTS handles persona voice
      temperature,
      turnDetection: {
        type: 'server_vad',
        threshold: vadConfig.threshold,
        prefix_padding_ms: vadConfig.prefixPaddingMs,
        silence_duration_ms: vadConfig.silenceDurationMs,
        create_response: vadConfig.createResponse,
        interrupt_response: vadConfig.interruptResponse,
      },
      // Tools are passed directly to the model via LiveKit Agent, not here
    });

    return model;
  }

  // -------------------------------------------------------------------------
  // Session Configuration
  // -------------------------------------------------------------------------

  /**
   * OpenAI uses internal server_vad, so AgentSession turn detection is undefined.
   */
  getSessionTurnDetection(): 'realtime_llm' | undefined {
    return undefined;
  }

  /**
   * OpenAI doesn't need prewarm - connection is fast.
   */
  needsPrewarm(): boolean {
    return false;
  }

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  /**
   * OpenAI log prefix
   */
  getLogPrefix(): string {
    return '🔮';
  }
}
