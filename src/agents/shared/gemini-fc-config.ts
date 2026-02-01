/**
 * Gemini Function Calling Configuration
 *
 * Centralized configuration for Gemini's function calling behavior.
 * All options are configurable via environment variables.
 *
 * ## Architecture Options
 *
 * 1. **JSON Workaround (Legacy)**
 *    - Gemini outputs `{"fn":"toolName","args":{...}}`
 *    - TTS sanitizer intercepts and executes
 *    - Prompts include JSON format instructions
 *
 * 2. **Native Function Calling (New)**
 *    - Gemini uses API-level function declarations
 *    - No JSON in output, proper function_call events
 *    - Simpler prompts without JSON instructions
 *
 * 3. **Turn-by-Turn Optimization**
 *    - Dynamically update tools each turn based on intent
 *    - Reduces tool bloat (1000+ → 8-15 per turn)
 *    - Eliminates hallucination from tool overload
 *
 * @module agents/shared/gemini-fc-config
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GeminiFCConfig' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Function calling mode for Gemini
 *
 * - 'AUTO': Model decides when to call functions (default for conversation)
 * - 'ANY': Model MUST call a function when tools available (use when intent is clear)
 * - 'NONE': Disable native FC entirely (fall back to JSON workaround)
 */
export type GeminiFCMode = 'AUTO' | 'ANY' | 'NONE';

/**
 * Tool injection strategy
 *
 * - 'static': Load all tools at session start, never update
 * - 'turn-by-turn': Dynamically inject tools based on each turn's intent
 * - 'hybrid': Start with essentials, add domain tools as needed, don't remove
 */
export type ToolInjectionStrategy = 'static' | 'turn-by-turn' | 'hybrid';

/**
 * Gemini function calling configuration
 */
export interface GeminiFCConfiguration {
  // Core mode flags
  /** Use native function calling instead of JSON workaround */
  useNativeFunctionCalling: boolean;

  /** Keep JSON workaround as fallback even with native FC */
  enableJsonFallback: boolean;

  /** Function calling mode (AUTO, ANY, NONE) */
  fcMode: GeminiFCMode;

  // Turn-by-turn optimization
  /** Enable turn-by-turn tool optimization */
  enableTurnOptimization: boolean;

  /** Tool injection strategy */
  injectionStrategy: ToolInjectionStrategy;

  /** Maximum tools to send per turn */
  maxToolsPerTurn: number;

  /** Minimum semantic score to include a tool (0-1) */
  semanticThreshold: number;

  // Schema strictness (anti-hallucination)
  /** Add additionalProperties: false to all schemas */
  enforceStrictSchemas: boolean;

  /** Validate tool calls against known tools before execution */
  validateToolCalls: boolean;

  // Prompt configuration
  /** Use simplified prompts without JSON format instructions */
  useNativePrompts: boolean;

  /** Include tool usage guidance (when to use, handoff triggers) */
  includeToolGuidance: boolean;

  // Performance
  /** Log tool selection decisions for debugging */
  debugToolSelection: boolean;

  /** Emit metrics for tool call success/failure rates */
  emitToolMetrics: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: GeminiFCConfiguration = {
  // Core mode - default to JSON workaround for safety
  useNativeFunctionCalling: false,
  enableJsonFallback: true,
  fcMode: 'AUTO',

  // Turn optimization - disabled by default
  enableTurnOptimization: false,
  injectionStrategy: 'static',
  maxToolsPerTurn: 15,
  semanticThreshold: 0.3,

  // Schema strictness
  enforceStrictSchemas: true,
  validateToolCalls: true,

  // Prompts
  useNativePrompts: false,
  includeToolGuidance: true,

  // Debugging
  debugToolSelection: false,
  emitToolMetrics: false,
};

// ============================================================================
// CONFIGURATION LOADER
// ============================================================================

let cachedConfig: GeminiFCConfiguration | null = null;

/**
 * Load Gemini function calling configuration from environment.
 *
 * Environment variables:
 * - GEMINI_USE_NATIVE_FC: Enable native function calling (true/false)
 * - GEMINI_FC_MODE: Function calling mode (AUTO/ANY/NONE)
 * - GEMINI_JSON_FALLBACK: Keep JSON workaround as fallback (true/false)
 * - GEMINI_TURN_OPTIMIZATION: Enable turn-by-turn tool optimization (true/false)
 * - GEMINI_INJECTION_STRATEGY: Tool injection strategy (static/turn-by-turn/hybrid)
 * - GEMINI_MAX_TOOLS_PER_TURN: Maximum tools per turn (number)
 * - GEMINI_SEMANTIC_THRESHOLD: Minimum semantic score (0-1)
 * - GEMINI_STRICT_SCHEMAS: Enforce strict schemas (true/false)
 * - GEMINI_VALIDATE_TOOLS: Validate tool calls (true/false)
 * - GEMINI_NATIVE_PROMPTS: Use native prompts without JSON instructions (true/false)
 * - GEMINI_DEBUG_TOOLS: Log tool selection decisions (true/false)
 * - GEMINI_TOOL_METRICS: Emit tool metrics (true/false)
 */
export function loadGeminiFCConfig(): GeminiFCConfiguration {
  if (cachedConfig) {
    return cachedConfig;
  }

  const env = process.env;

  // Parse boolean helper
  const parseBool = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  };

  // Parse number helper
  const parseNum = (value: string | undefined, defaultValue: number): number => {
    if (value === undefined) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  // Parse FC mode
  const parseFCMode = (value: string | undefined): GeminiFCMode => {
    const upper = value?.toUpperCase();
    if (upper === 'AUTO' || upper === 'ANY' || upper === 'NONE') {
      return upper;
    }
    return DEFAULT_CONFIG.fcMode;
  };

  // Parse injection strategy
  const parseStrategy = (value: string | undefined): ToolInjectionStrategy => {
    const lower = value?.toLowerCase();
    if (lower === 'static' || lower === 'turn-by-turn' || lower === 'hybrid') {
      return lower;
    }
    return DEFAULT_CONFIG.injectionStrategy;
  };

  cachedConfig = {
    // Core mode
    useNativeFunctionCalling: parseBool(
      env.GEMINI_USE_NATIVE_FC,
      DEFAULT_CONFIG.useNativeFunctionCalling
    ),
    enableJsonFallback: parseBool(env.GEMINI_JSON_FALLBACK, DEFAULT_CONFIG.enableJsonFallback),
    fcMode: parseFCMode(env.GEMINI_FC_MODE),

    // Turn optimization
    enableTurnOptimization: parseBool(
      env.GEMINI_TURN_OPTIMIZATION,
      DEFAULT_CONFIG.enableTurnOptimization
    ),
    injectionStrategy: parseStrategy(env.GEMINI_INJECTION_STRATEGY),
    maxToolsPerTurn: parseNum(env.GEMINI_MAX_TOOLS_PER_TURN, DEFAULT_CONFIG.maxToolsPerTurn),
    semanticThreshold: parseNum(env.GEMINI_SEMANTIC_THRESHOLD, DEFAULT_CONFIG.semanticThreshold),

    // Schema strictness
    enforceStrictSchemas: parseBool(env.GEMINI_STRICT_SCHEMAS, DEFAULT_CONFIG.enforceStrictSchemas),
    validateToolCalls: parseBool(env.GEMINI_VALIDATE_TOOLS, DEFAULT_CONFIG.validateToolCalls),

    // Prompts
    useNativePrompts: parseBool(env.GEMINI_NATIVE_PROMPTS, DEFAULT_CONFIG.useNativePrompts),
    includeToolGuidance: parseBool(env.GEMINI_TOOL_GUIDANCE, DEFAULT_CONFIG.includeToolGuidance),

    // Debugging
    debugToolSelection: parseBool(env.GEMINI_DEBUG_TOOLS, DEFAULT_CONFIG.debugToolSelection),
    emitToolMetrics: parseBool(env.GEMINI_TOOL_METRICS, DEFAULT_CONFIG.emitToolMetrics),
  };

  // Log configuration on first load
  const effectiveNativePrompts = shouldUseNativePromptsInternal(cachedConfig);

  log.info(
    {
      useNativeFunctionCalling: cachedConfig.useNativeFunctionCalling,
      fcMode: cachedConfig.fcMode,
      enableJsonFallback: cachedConfig.enableJsonFallback,
      enableTurnOptimization: cachedConfig.enableTurnOptimization,
      injectionStrategy: cachedConfig.injectionStrategy,
      maxToolsPerTurn: cachedConfig.maxToolsPerTurn,
      useNativePrompts: cachedConfig.useNativePrompts,
      effectiveNativePrompts,
    },
    `🔧 Gemini FC config: native=${cachedConfig.useNativeFunctionCalling}, ` +
      `json_fallback=${cachedConfig.enableJsonFallback}, ` +
      `native_prompts=${effectiveNativePrompts} (no JSON examples in system prompt)`
  );

  return cachedConfig;
}

/**
 * Get the current configuration (loads if not cached)
 */
export function getGeminiFCConfig(): GeminiFCConfiguration {
  return loadGeminiFCConfig();
}

/**
 * Reset cached configuration (for testing)
 */
export function resetGeminiFCConfig(): void {
  cachedConfig = null;
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Check if native function calling is enabled
 */
export function isNativeFCEnabled(): boolean {
  return getGeminiFCConfig().useNativeFunctionCalling;
}

/**
 * Check if JSON fallback is enabled
 */
export function isJsonFallbackEnabled(): boolean {
  return getGeminiFCConfig().enableJsonFallback;
}

/**
 * Check if turn-by-turn optimization is enabled
 */
export function isTurnOptimizationEnabled(): boolean {
  return getGeminiFCConfig().enableTurnOptimization;
}

/**
 * Get the function calling mode
 */
export function getFCMode(): GeminiFCMode {
  return getGeminiFCConfig().fcMode;
}

/**
 * Internal helper to check native prompts without causing infinite loop
 * (since getGeminiFCConfig calls this during logging)
 *
 * IMPORTANT (Jan 2026): When native FC is enabled, we should ALWAYS use
 * native prompts (no JSON format examples) to avoid confusing the model.
 *
 * The JSON fallback setting controls whether the SANITIZER intercepts JSON
 * output, NOT whether we teach the model to output JSON. Teaching the model
 * both native FC AND JSON format causes confusion and unreliable behavior.
 */
function shouldUseNativePromptsInternal(config: GeminiFCConfiguration): boolean {
  // If native prompts flag is explicitly set, use that
  if (process.env.GEMINI_NATIVE_PROMPTS !== undefined) {
    return config.useNativeFunctionCalling && config.useNativePrompts;
  }

  // CHANGED (Jan 2026): When native FC is enabled, ALWAYS use native prompts
  // regardless of JSON fallback setting. The JSON fallback is a safety net
  // for the sanitizer, not a reason to teach the model two conflicting formats.
  //
  // Old behavior: Only use native prompts when JSON fallback was disabled
  // New behavior: Use native prompts whenever native FC is enabled
  //
  // This prevents the model from getting conflicting instructions like:
  // - Native FC instructions: "Use function calling API, don't output JSON"
  // - function-calling-base.md: "Output {"fn":"toolName","args":{...}}"
  if (config.useNativeFunctionCalling) {
    return true;
  }

  // Otherwise, use the explicit config
  return config.useNativePrompts;
}

/**
 * Check if native prompts should be used (no JSON instructions)
 *
 * IMPORTANT: When native function calling is enabled, we should default to
 * native prompts (no JSON format examples) to avoid confusion. The JSON
 * format examples would conflict with the native function calling mechanism.
 *
 * The user can override this by setting GEMINI_NATIVE_PROMPTS=false explicitly
 * if they want to keep JSON prompts as a fallback teaching mechanism.
 */
export function shouldUseNativePrompts(): boolean {
  return shouldUseNativePromptsInternal(getGeminiFCConfig());
}

// ============================================================================
// CONFIGURATION PRESETS
// ============================================================================

/**
 * Preset configurations for common use cases
 */
export const GeminiFCPresets = {
  /**
   * Legacy mode - JSON workaround, full prompts
   * Use when: Testing, debugging, or if native FC has issues
   */
  legacy: (): Partial<GeminiFCConfiguration> => ({
    useNativeFunctionCalling: false,
    enableJsonFallback: true,
    fcMode: 'NONE',
    enableTurnOptimization: false,
    useNativePrompts: false,
  }),

  /**
   * Native mode - Full native FC, no JSON fallback
   * Use when: Native FC is stable and working well
   */
  native: (): Partial<GeminiFCConfiguration> => ({
    useNativeFunctionCalling: true,
    enableJsonFallback: false,
    fcMode: 'AUTO',
    enableTurnOptimization: false,
    useNativePrompts: true,
  }),

  /**
   * Native with fallback - Native FC + JSON fallback for safety
   * Use when: Transitioning from JSON to native
   *
   * NOTE: Even with JSON fallback enabled, we use native prompts (no JSON
   * format instructions). The fallback is a sanitizer safety net, not a
   * reason to teach the model conflicting formats.
   */
  nativeWithFallback: (): Partial<GeminiFCConfiguration> => ({
    useNativeFunctionCalling: true,
    enableJsonFallback: true,
    fcMode: 'AUTO',
    enableTurnOptimization: false,
    useNativePrompts: true, // Native prompts - sanitizer catches JSON if model outputs it
  }),

  /**
   * Optimized - Native FC + turn-by-turn optimization
   * Use when: Production with stable native FC
   */
  optimized: (): Partial<GeminiFCConfiguration> => ({
    useNativeFunctionCalling: true,
    enableJsonFallback: false,
    fcMode: 'AUTO',
    enableTurnOptimization: true,
    injectionStrategy: 'turn-by-turn',
    maxToolsPerTurn: 15,
    useNativePrompts: true,
  }),

  /**
   * Hybrid optimized - Native FC + hybrid injection (add but don't remove)
   * Use when: Want optimization but worried about missing tools
   */
  hybridOptimized: (): Partial<GeminiFCConfiguration> => ({
    useNativeFunctionCalling: true,
    enableJsonFallback: true,
    fcMode: 'AUTO',
    enableTurnOptimization: true,
    injectionStrategy: 'hybrid',
    maxToolsPerTurn: 25,
    useNativePrompts: false,
  }),
};
