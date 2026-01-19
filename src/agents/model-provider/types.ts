/**
 * Model Provider Types
 *
 * Defines the interface for LLM providers (OpenAI Realtime, Gemini Live, etc.)
 * This abstraction centralizes all model-specific behavior, eliminating
 * scattered environment variable checks throughout the codebase.
 *
 * @module agents/model-provider/types
 */

// Note: AgentSession.turnDetection accepts 'realtime_llm' | undefined
// We don't import the type directly as it's not exported
type AgentSessionTurnDetection = 'realtime_llm' | undefined;

// ============================================================================
// PROVIDER IDENTITY
// ============================================================================

/**
 * Supported model provider identifiers
 */
export type ModelProviderId = 'openai-realtime' | 'gemini-live';

// ============================================================================
// PROMPT CONFIGURATION
// ============================================================================

/**
 * Configuration for which prompt modules to include
 *
 * Different providers need different prompt configurations:
 * - OpenAI Realtime: Native function calling, minimal instructions + tool guidance
 * - Gemini Live: JSON workaround, full function-calling prompts
 */
export interface PromptModuleConfig {
  /**
   * Include shared/function-calling-base.md
   * Contains JSON format instructions for Gemini workaround
   */
  includeFunctionCallingBase: boolean;

  /**
   * Include persona-specific identity/function-calling-specialty.md
   * Contains JSON format examples for Gemini
   */
  includeFunctionCallingSpecialty: boolean;

  /**
   * Include identity/tool-usage-guidance.md
   * Contains conceptual tool guidance (WHEN to use tools, handoff triggers)
   * This is needed by ALL providers, even those with native function calling
   */
  includeToolUsageGuidance: boolean;

  /**
   * Include shared/model-base-instructions.md
   * Contains detailed JSON format rules for Gemini
   */
  includeModelBaseInstructions: boolean;

  /**
   * Use minimal instructions instead of full model-base-instructions
   * OpenAI needs minimal to avoid JSON output as speech
   */
  useMinimalInstructions: boolean;
}

// ============================================================================
// LLM MODEL CONFIGURATION
// ============================================================================

/**
 * Configuration for creating an LLM model instance
 */
export interface LLMModelConfig {
  /** Model identifier (e.g., 'gpt-realtime', 'gemini-2.0-flash-exp') */
  model?: string;

  /** System instructions/prompt */
  instructions: string;

  /** Temperature for response generation */
  temperature?: number;

  /** Voice configuration (for native TTS, if used) */
  voice?: string;

  /** Tool definitions for function calling */
  tools?: unknown[];

  /** VAD configuration */
  vadConfig?: {
    threshold: number;
    silenceDurationMs: number;
    prefixPaddingMs?: number;
    createResponse?: boolean;
    interruptResponse?: boolean;
  };

  /**
   * Whether this turn expects a tool call.
   * When true, providers may lower temperature for more deterministic output.
   * Set by semantic router when it detects tool-calling intent.
   */
  expectsToolCall?: boolean;
}

// ============================================================================
// DYNAMIC TEMPERATURE
// ============================================================================

/**
 * Default temperatures for different contexts.
 * 
 * Research (Jan 2026) shows that lower temperature during tool calls
 * significantly improves Gemini's function calling reliability.
 */
export const TEMPERATURE_DEFAULTS = {
  /** Standard conversation temperature */
  CONVERSATION: 0.7,
  
  /** Temperature when tool call is expected (more deterministic) */
  TOOL_CALL: 0.1,
  
  /** Temperature for retry attempts (even more deterministic) */
  RETRY: 0.05,
} as const;

/**
 * Get appropriate temperature based on context.
 * 
 * @param expectsToolCall - Whether a tool call is expected this turn
 * @param isRetry - Whether this is a retry attempt
 * @param baseTemperature - Base temperature to use if not adjusting
 * @returns Appropriate temperature for the context
 */
export function getContextualTemperature(
  expectsToolCall: boolean = false,
  isRetry: boolean = false,
  baseTemperature: number = TEMPERATURE_DEFAULTS.CONVERSATION
): number {
  if (isRetry) {
    return TEMPERATURE_DEFAULTS.RETRY;
  }
  if (expectsToolCall) {
    return TEMPERATURE_DEFAULTS.TOOL_CALL;
  }
  return baseTemperature;
}

/**
 * Turn detection configuration
 */
export interface TurnDetectionConfig {
  /** Turn detection type */
  type: 'server_vad' | 'realtime_llm' | 'none';

  /** VAD threshold (0-1) */
  threshold?: number;

  /** Silence duration to detect end of turn (ms) */
  silenceDurationMs?: number;

  /** Prefix padding (ms) */
  prefixPaddingMs?: number;

  /** Create response after turn */
  createResponse?: boolean;

  /** Allow interruptions */
  interruptResponse?: boolean;
}

// ============================================================================
// MODEL PROVIDER INTERFACE
// ============================================================================

/**
 * Model Provider Interface
 *
 * Abstracts all model-specific behavior into a single interface.
 * Implementations handle the differences between providers:
 *
 * - OpenAI Realtime: Native function calling, text-only mode with Cartesia TTS
 * - Gemini Live: JSON workaround for function calls, text-only mode with Cartesia TTS
 *
 * @example
 * ```typescript
 * const provider = getModelProvider();
 *
 * // Check capabilities
 * if (provider.hasNativeFunctionCalling()) {
 *   // Skip JSON workaround
 * }
 *
 * // Get prompt config
 * const modules = provider.getPromptModules();
 * if (modules.includeFunctionCallingBase) {
 *   // Load JSON function-calling prompts
 * }
 *
 * // Create model
 * const llm = await provider.createLLMModel(config);
 * ```
 */
export interface ModelProvider {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  /** Unique provider identifier */
  readonly id: ModelProviderId;

  /** Human-readable display name */
  readonly displayName: string;

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * Whether the provider supports native function calling at the API level.
   *
   * - OpenAI Realtime: true (functions are called via protocol)
   * - Gemini Live: false (must use JSON output workaround)
   */
  hasNativeFunctionCalling(): boolean;

  /**
   * Whether the JSON workaround is needed for function calls.
   *
   * When true, prompts include JSON format instructions and the
   * TTS sanitizer intercepts JSON output to execute tools.
   */
  needsJsonWorkaround(): boolean;

  /**
   * Whether the provider has built-in turn detection.
   *
   * - OpenAI Realtime: Uses server_vad internally
   * - Gemini Live: Uses realtime_llm turn detection
   */
  hasBuiltInTurnDetection(): boolean;

  // -------------------------------------------------------------------------
  // Prompt Configuration
  // -------------------------------------------------------------------------

  /**
   * Get the prompt module configuration for this provider.
   *
   * Determines which prompt files to include in the system prompt.
   */
  getPromptModules(): PromptModuleConfig;

  /**
   * Get the maximum token limit for system instructions.
   *
   * - OpenAI Realtime: 16,384 tokens (hard limit)
   * - Gemini Live: Higher limit
   */
  getTokenLimit(): number;

  /**
   * Get minimal instructions for providers that don't need full prompts.
   *
   * Used by OpenAI to avoid JSON function-calling instructions
   * that would be spoken as text.
   */
  getMinimalInstructions(): string;

  // -------------------------------------------------------------------------
  // Model Creation (Strategy Pattern)
  // -------------------------------------------------------------------------

  /**
   * Create an LLM model instance for this provider.
   *
   * Encapsulates all provider-specific SDK initialization.
   *
   * @param config - Model configuration
   * @returns The LLM model instance (type varies by provider)
   */
  createLLMModel(config: LLMModelConfig): Promise<unknown>;

  /**
   * Convert tools to provider-native format.
   *
   * Different providers expect tools in different formats:
   * - OpenAI: function definitions with JSON schema
   * - Gemini: functionDeclarations wrapped in tools array
   * - Qwen: Similar to OpenAI
   *
   * This method enables provider-agnostic tool passing and
   * future-proofs the system for new LLM providers.
   *
   * @param tools - LiveKit tool definitions
   * @returns Provider-specific tool format (varies by provider)
   */
  convertToolsToNativeFormat?(tools: unknown[]): unknown;

  // -------------------------------------------------------------------------
  // Session Configuration
  // -------------------------------------------------------------------------

  /**
   * Get turn detection configuration for AgentSession.
   *
   * - OpenAI: undefined (uses internal server_vad)
   * - Gemini: 'realtime_llm'
   */
  getSessionTurnDetection(): AgentSessionTurnDetection;

  /**
   * Whether the provider needs prewarm before first interaction.
   *
   * - OpenAI: false (no prewarm needed)
   * - Gemini: true (prewarm improves first response latency)
   */
  needsPrewarm(): boolean;

  // -------------------------------------------------------------------------
  // Logging & Telemetry
  // -------------------------------------------------------------------------

  /**
   * Get log prefix for provider-specific logging.
   *
   * - OpenAI: '🔮'
   * - Gemini: '🤖'
   */
  getLogPrefix(): string;
}

// ============================================================================
// PROVIDER CAPABILITIES (for type guards)
// ============================================================================

/**
 * Check if a provider supports native function calling
 */
export function hasNativeFunctionCalling(provider: ModelProvider): boolean {
  return provider.hasNativeFunctionCalling();
}

/**
 * Check if a provider needs JSON workaround
 */
export function needsJsonWorkaround(provider: ModelProvider): boolean {
  return provider.needsJsonWorkaround();
}
