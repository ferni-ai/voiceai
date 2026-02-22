/**
 * JSON Function Executor (LEGACY FALLBACK)
 *
 * General-purpose executor for JSON function calls from LLM output.
 *
 * ⚠️ LEGACY STATUS (Dec 2024):
 * This is a FALLBACK system. The primary tool calling path is now:
 *
 *   1. SEMANTIC ROUTER (src/tools/semantic-router/) - Pre-LLM routing
 *      - Pattern matching, keyword scoring, embedding similarity
 *      - High confidence → Direct execution, bypass LLM
 *      - <20ms latency for common tool requests
 *
 *   2. JSON FUNCTION CALLING (this module) - LLM-instructed fallback
 *      - Used when semantic router has low confidence
 *      - Used for complex/multi-tool scenarios
 *      - LLM outputs JSON like: {"fn":"playMusic","args":{"query":"jazz"}}
 *
 * WORKAROUND CONTEXT: Gemini Live API's native function calling is unreliable.
 * The semantic router + JSON fallback provides a reliable alternative.
 *
 * Features:
 * - Robust JSON parsing (handles formatted/minified JSON)
 * - Dynamic tool routing
 * - Graceful error handling
 * - Execution result callbacks
 *
 * @module agents/shared/json-function-executor
 */

import {
  getActionTracker,
  getActionTypeForTool,
  isTrackableTool,
} from '../../services/action-tracker/index.js';
import { executeWithReliability } from '../../services/performance/tool-execution-reliability.js';
import {
  cacheToolResult,
  checkToolCache,
  invalidateToolCache,
} from '../../services/performance/tool-response-cache.js';
import { cleanForFirestore, toSafeDate } from '../../utils/firestore-utils.js';
import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import { recordAction } from './action-history.js';
import { logJsonDetected, logJsonExecuted } from './function-call-telemetry.js';
// Parallel tool executor for critical tools (Jan 2026)
import {
  executeWithParallelFallback,
  isCriticalTool,
  type ToolResult as ParallelToolResult,
} from './parallel-tool-executor.js';
// Developer Platform: Webhook integration for tool events
import {
  onToolCalled as dispatchToolCalledWebhook,
  onToolCompleted as dispatchToolCompletedWebhook,
  onToolFailed as dispatchToolFailedWebhook,
} from '../integrations/developer-webhook-integration.js';
// Timing-aware tool tracking (Phase 3 BTH Communication Overhaul)
import {
  completeToolInFlight,
  registerToolInFlight,
} from '../../intelligence/context-builders/awareness/system-state-awareness.js';
// Centralized conversation state for tool tracking (P0-#2 UTO Fix - January 2026)
import { getConversationState } from '../../services/conversation-state.js';
// P2 UTO Fix (January 2026): Service health pre-check before tool execution
import { isServiceHealthyFast } from '../../services/self-healing/index.js';
// Phase 3: Implicit correction capture for learning loop closure
import { recordActualToolExecution } from '../../tools/semantic-router/learning/implicit-correction-capture.js';
// LLMCompiler: Parallel function calling with dependency tracking (Jan 2026)
import {
  containsLLMCompilerPlan,
  // Pre-Act: Upfront reasoning before tool execution
  containsPreActPlan,
  executeLLMCompilerPlan,
  parseLLMCompilerPlan,
  parsePreActPlan,
  stripLLMCompilerPlan,
  stripPreActFormat,
} from './llm-compiler/index.js';
// Meta-tool pattern: Single executeTool instead of 100+ declarations (Jan 2026)
import { isMetaToolCall, unwrapMetaToolCall } from './meta-tool.js';

const log = createLogger({ module: 'json-function-executor' });

/** Feature flag for LLMCompiler parallel execution */
const USE_LLMCOMPILER = process.env.USE_LLMCOMPILER === 'true';

/** Feature flag for Pre-Act upfront reasoning (enabled with LLMCompiler) */
const USE_PREACT = process.env.USE_PREACT === 'true' || USE_LLMCOMPILER;

// ============================================================================
// P2 UTO Fix (January 2026): TOOL → SERVICE MAPPING
// Maps tool names to their required backend services for health pre-checks
// ============================================================================

/**
 * Map of tool name patterns to their required backend services.
 * Used for service health pre-checks before tool execution.
 *
 * Service names match those in health-monitors.ts:
 * - 'firestore': Database operations
 * - 'gemini': AI/LLM operations
 * - 'spotify': Music playback
 * - 'openai': OpenAI-specific operations
 * - 'cartesia': TTS operations (handled separately)
 * - 'livekit': Voice/audio operations (handled separately)
 */
const TOOL_SERVICE_MAP: Record<string, string> = {
  // Music tools → Spotify
  playMusic: 'spotify',
  searchMusic: 'spotify',
  pauseMusic: 'spotify',
  resumeMusic: 'spotify',
  skipTrack: 'spotify',
  setVolume: 'spotify',
  getQueue: 'spotify',
  shufflePlayback: 'spotify',

  // Memory/storage tools → Firestore
  saveNote: 'firestore',
  getNotes: 'firestore',
  saveMemory: 'firestore',
  getMemory: 'firestore',
  saveCommitment: 'firestore',
  getCommitments: 'firestore',
  saveReflection: 'firestore',
  getReflections: 'firestore',
  saveHabit: 'firestore',
  getHabits: 'firestore',
  saveGoal: 'firestore',
  getGoals: 'firestore',
  saveEvent: 'firestore',
  getEvents: 'firestore',
  saveContact: 'firestore',
  getContacts: 'firestore',
};

/**
 * Get the required backend service for a tool.
 * Returns null if no specific service is required (general tools).
 *
 * @param toolName - The name of the tool to check
 * @returns The required service name, or null if no specific service required
 */
function getRequiredServiceForTool(toolName: string): string | null {
  // Direct match
  if (toolName in TOOL_SERVICE_MAP) {
    return TOOL_SERVICE_MAP[toolName];
  }

  // Pattern matching for tool families
  const lowered = toolName.toLowerCase();

  // Music-related tools
  if (
    lowered.includes('music') ||
    lowered.includes('song') ||
    lowered.includes('playlist') ||
    lowered.includes('track') ||
    lowered.includes('album') ||
    lowered.includes('artist')
  ) {
    return 'spotify';
  }

  // Memory/storage tools
  if (
    lowered.includes('save') ||
    lowered.includes('store') ||
    lowered.includes('persist') ||
    lowered.includes('remember') ||
    (lowered.startsWith('get') &&
      (lowered.includes('note') || lowered.includes('memory') || lowered.includes('habit')))
  ) {
    return 'firestore';
  }

  // No specific service required
  return null;
}

// ============================================================================
// LEARNING LOOP INTEGRATION
// ============================================================================

/**
 * Fire-and-forget recording for semantic intelligence learning loop.
 * Does not block tool execution.
 */
function recordSemanticExecution(params: {
  userId: string;
  sessionId?: string;
  personaId?: string;
  inputText: string;
  toolId: string;
  args: Record<string, unknown>;
  success: boolean;
  executionTimeMs: number;
  semanticPrediction?: { toolId: string; confidence: number };
}): void {
  // Fire and forget - don't await, don't block tool execution
  import('../../intelligence/semantic-intelligence/index.js')
    .then(async ({ recordExecution }) =>
      recordExecution({
        userId: params.userId,
        sessionId: params.sessionId || 'unknown',
        personaId: params.personaId || 'ferni',
        inputText: params.inputText,
        toolId: params.toolId,
        args: params.args,
        success: params.success,
        executionTimeMs: params.executionTimeMs,
        semanticPrediction: params.semanticPrediction,
      })
    )
    .catch((err) => {
      // Silent failure - learning loop is non-critical
      log.debug({ error: String(err) }, 'Learning loop recording failed (non-critical)');
    });
}

/**
 * Fire-and-forget recording for tool intelligence outcome tracking.
 * Feeds into the learning pipeline for improving tool selection.
 * Does not block tool execution.
 */
function recordToolOutcome(params: {
  sessionId: string;
  turnId?: string;
  toolId: string;
  query: string;
  success: boolean;
  executionTimeMs: number;
  personaId?: string;
  selectionMethod?: 'router' | 'semantic' | 'hybrid' | 'mcts' | 'direct';
  confidence?: number;
  emotion?: string;
}): void {
  // Fire and forget - don't await, don't block tool execution
  import('../../tools/intelligence/learning/index.js')
    .then(({ getOutcomeTracker }) => {
      const tracker = getOutcomeTracker();
      tracker.track({
        sessionId: params.sessionId,
        turnId: params.turnId || `turn_${Date.now()}`,
        toolId: params.toolId,
        query: params.query,
        selectedBy: params.selectionMethod || 'direct',
        confidence: params.confidence || 0.5,
        wasExecuted: true,
        executionSuccess: params.success,
        executionLatencyMs: params.executionTimeMs,
        userContinued: true, // Default, may be updated later
        followUpTools: [],
        personaId: params.personaId || 'ferni',
        emotion: params.emotion,
      });
    })
    .catch((err) => {
      // Silent failure - outcome tracking is non-critical
      log.debug({ error: String(err) }, 'Outcome tracking failed (non-critical)');
    });
}

/**
 * Extract target name from tool arguments.
 * Looks for common patterns in tool args for contact/recipient info.
 */
function extractTargetFromArgs(args: Record<string, unknown>): string | undefined {
  // Check common arg names for contact/target info
  const targetKeys = [
    'contact',
    'contactName',
    'recipient',
    'to',
    'target',
    'name',
    'phone',
    'email',
  ];
  for (const key of targetKeys) {
    if (typeof args[key] === 'string' && args[key]) {
      return args[key] as string;
    }
  }
  return undefined;
}

/**
 * Extract domain from tool name.
 * Tool names often follow pattern: domain-action or domainAction
 * Falls back to 'general' if no domain can be determined.
 */
function extractDomainFromTool(toolName: string): string {
  // Common tool patterns and their domains
  const domainPatterns: Record<string, string[]> = {
    music: ['playmusic', 'pausemusic', 'skiptrack', 'getplaylist', 'setvolume'],
    weather: ['getweather', 'weatherforecast'],
    calendar: ['getcalendar', 'getschedule', 'createevent', 'updateevent'],
    communication: ['sendtext', 'sendemail', 'makecall', 'leavemessage'],
    family: ['sharefeeling', 'familymessage', 'leavemessage'],
    habits: ['createhabit', 'loghabit', 'gethabits'],
    memories: ['savememory', 'recallmemory', 'getmemories'],
    news: ['getnews', 'searchnews'],
    finance: ['getmarketsummary', 'getquote', 'getportfolio'],
  };

  const toolLower = toolName.toLowerCase();
  for (const [domain, patterns] of Object.entries(domainPatterns)) {
    if (patterns.some((p) => toolLower.includes(p) || toolLower === p)) {
      return domain;
    }
  }
  return 'general';
}

/**
 * Fire-and-forget action tracking for high-impact tools.
 * Does not block tool execution.
 */
function trackHighImpactAction(params: {
  userId: string;
  sessionId?: string;
  toolId: string;
  args: Record<string, unknown>;
  inputText?: string;
  success: boolean;
  resultSummary: string;
  durationMs: number;
}): void {
  // Only track if we have a userId and the tool is trackable
  if (!params.userId || !isTrackableTool(params.toolId)) {
    return;
  }

  const actionType = getActionTypeForTool(params.toolId);
  if (!actionType) {
    return;
  }

  // Fire and forget - don't await, don't block tool execution
  (async () => {
    try {
      const tracker = getActionTracker();
      const target = extractTargetFromArgs(params.args);

      // Create the action (or find existing pending one)
      const action = await tracker.createAction({
        userId: params.userId,
        type: actionType,
        description: params.inputText || `${actionType} to ${target || 'contact'}`,
        target,
        targetContact: (params.args.phone as string) || (params.args.email as string) || undefined,
        sessionId: params.sessionId,
        userMessage: params.inputText,
      });

      // Start execution
      await tracker.startExecution(action.id, {
        toolId: params.toolId,
        toolArgs: params.args,
      });

      // Complete execution
      await tracker.completeExecution(action.id, {
        success: params.success,
        resultSummary: params.resultSummary,
        callDurationSeconds:
          actionType === 'call' ? Math.round(params.durationMs / 1000) : undefined,
        deliveryStatus: params.success ? 'sent' : 'failed',
      });

      log.debug(
        { actionId: action.id, toolId: params.toolId, success: params.success },
        '📋 High-impact action tracked'
      );
    } catch (err) {
      // Silent failure - action tracking is non-critical
      log.debug({ error: String(err) }, 'Action tracking failed (non-critical)');
    }
  })();
}

// ============================================================================
// TYPES
// ============================================================================

/** Parsed JSON function call */
export interface JsonFunctionCall {
  fn: string;
  args: Record<string, unknown>;
  raw: string;
}

/** Result of executing a function */
export interface FunctionExecutionResult {
  success: boolean;
  fn: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
  /**
   * If true, the result should be spoken directly via session.say()
   * without going through safeGenerateReply() for LLM summarization.
   * Used by the "speak" pseudo-tool for dynamic silence responses.
   */
  speakDirectly?: boolean;
}

/** Context for tool execution */
export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  /** Publisher ID for marketplace/custom personas (enables webhook dispatch) */
  publisherId?: string;
  /** Callback when a tool starts executing */
  onToolStart?: (fn: string, args: Record<string, unknown>) => void;
  /** Callback when a tool finishes */
  onToolComplete?: (result: FunctionExecutionResult) => void;
  /** Callback for handoff requests */
  onHandoff?: (target: string, reason: string) => Promise<void>;
  /**
   * Original user input text that triggered this tool execution.
   * Used by the semantic intelligence learning loop to learn patterns.
   */
  inputText?: string;
  /**
   * Semantic prediction for this input (if semantic intelligence was used).
   * Compared to actual execution to detect implicit corrections.
   */
  semanticPrediction?: {
    toolId: string;
    confidence: number;
  };
  /**
   * User's IP-detected location (TikTok-style personalization).
   * Used for weather defaults, local content hints.
   */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
  /**
   * Whether this execution is from LLMCompiler parallel execution.
   * Used for telemetry differentiation.
   */
  fromLLMCompiler?: boolean;
}

// ============================================================================
// JSON PARSING
// ============================================================================

/**
 * Parse JSON function call from text.
 * Handles both minified and formatted JSON.
 *
 * Formats supported:
 * - {"fn":"playMusic","args":{"query":"jazz"}}
 * - { "fn": "playMusic", "args": { "query": "jazz" } }
 * - Multi-line formatted JSON
 */
export function parseJsonFunctionCall(text: string): JsonFunctionCall | null {
  // Try to find JSON object in text
  const jsonPatterns = [
    // Minified: {"fn":"name","args":{...}}
    /(\{["\s]*"?fn"?\s*:\s*"(\w+)"["\s]*,\s*"?args"?\s*:\s*(\{[^}]*\})\s*\})/,
    // With potential nested objects - greedy match
    /(\{\s*"fn"\s*:\s*"(\w+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\})/,
  ];

  for (const pattern of jsonPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const fullJson = match[1];
        const fn = match[2];
        const argsStr = match[3];

        // Parse args - handle nested objects
        const args = JSON.parse(argsStr) as Record<string, unknown>;

        log.debug({ fn, args, rawLength: fullJson.length }, 'Parsed JSON function call');
        return { fn, args, raw: fullJson };
      } catch (parseErr) {
        log.debug(
          { error: String(parseErr), text: text.slice(0, 100) },
          'JSON parse failed, trying full parse'
        );
      }
    }
  }

  // Fallback: Try parsing the entire text as JSON
  try {
    // Clean up potential markdown code blocks
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();

    // Try to find JSON object boundaries
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = cleanText.slice(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonStr) as { fn?: string; args?: Record<string, unknown> };

      if (parsed.fn && typeof parsed.fn === 'string') {
        const args = parsed.args || {};
        return { fn: parsed.fn, args, raw: jsonStr };
      }
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

/**
 * Check if text contains a JSON function call
 */
export function containsJsonFunctionCall(text: string): boolean {
  return parseJsonFunctionCall(text) !== null;
}

/**
 * Extract all JSON function calls from text (for multi-tool calls)
 */
export function extractAllJsonFunctionCalls(text: string): JsonFunctionCall[] {
  const calls: JsonFunctionCall[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const call = parseJsonFunctionCall(line);
    if (call) {
      calls.push(call);
    }
  }

  // Also try the full text if no line-by-line matches
  if (calls.length === 0) {
    const call = parseJsonFunctionCall(text);
    if (call) {
      calls.push(call);
    }
  }

  return calls;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a JSON function call.
 * Routes to the appropriate tool based on function name.
 */
export async function executeJsonFunction(
  call: JsonFunctionCall,
  ctx: ToolExecutionContext = {}
): Promise<FunctionExecutionResult> {
  let { fn, args } = call;
  const startTime = Date.now();
  const sessionId = ctx.sessionId || 'unknown';

  // =========================================================================
  // META-TOOL UNWRAPPING (Jan 2026)
  // =========================================================================
  // If this is a meta-tool call (executeTool), unwrap it to get the actual
  // tool name and args. The meta-tool pattern lets the LLM make a simple
  // binary decision ("use tool?") and specify which via executeTool.
  // =========================================================================
  if (isMetaToolCall(fn)) {
    const unwrapped = unwrapMetaToolCall(args);
    if (unwrapped) {
      log.debug(
        { originalFn: fn, actualFn: unwrapped.toolName, argsKeys: Object.keys(unwrapped.toolArgs) },
        '🎯 Unwrapped meta-tool call'
      );
      fn = unwrapped.toolName;
      args = unwrapped.toolArgs;
    } else {
      log.warn({ fn, args }, '⚠️ Failed to unwrap meta-tool call');
      return {
        success: false,
        fn,
        args,
        result: 'Invalid meta-tool call: missing toolName or invalid args',
        error: 'Invalid meta-tool call format',
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 🔍 E2E TRACE: Tool execution started
  log.info(
    {
      fn,
      args: truncateForLog(JSON.stringify(args), 200),
      sessionId,
      userId: ctx.userId,
      trace: 'E2E_TOOL_START',
    },
    `🔍 E2E TRACE [TOOL] Starting: ${fn}(${truncateForLog(JSON.stringify(args), 50)})`
  );
  ctx.onToolStart?.(fn, args);

  // Developer Platform: Dispatch tool.called webhook (fire-and-forget)
  dispatchToolCalledWebhook({
    sessionId,
    userId: ctx.userId,
    personaId: ctx.personaId,
    publisherId: ctx.publisherId,
    toolName: fn,
    toolDomain: extractDomainFromTool(fn),
    args,
  });

  // Telemetry: Log that a JSON function call was detected
  logJsonDetected(sessionId, fn, args);

  // Timing-aware tracking: Register tool as in-flight (Phase 3 BTH)
  if (sessionId !== 'unknown') {
    registerToolInFlight(sessionId, fn);
    // P0-#2 UTO Fix: Also register in centralized conversation state
    // This enables the system-state-awareness context builder to detect in-flight tools
    try {
      const convState = getConversationState(sessionId);
      convState.startToolExecution(fn);
    } catch {
      // Conversation state may not exist yet - that's OK
    }
  }

  // ================================================================
  // PERFORMANCE: Check tool response cache for read-only tools
  // ================================================================
  if (ctx.sessionId) {
    const cached = checkToolCache(ctx.sessionId, fn, args);
    if (cached.hit) {
      const executionResult: FunctionExecutionResult = {
        success: true,
        fn,
        args,
        result: cached.result,
        durationMs: Date.now() - startTime,
      };
      log.info({ fn, cached: true }, '🎯 Tool response from cache');
      // Timing-aware tracking: Mark tool as complete (Phase 3 BTH)
      completeToolInFlight(ctx.sessionId, fn);
      // P0-#2 UTO Fix: Also clear in-flight in conversation state
      try {
        const convState = getConversationState(ctx.sessionId);
        convState.endToolExecution();
      } catch {
        // Ignore - conversation state may not exist
      }
      ctx.onToolComplete?.(executionResult);
      return executionResult;
    }
  }

  // ================================================================
  // P2 UTO Fix (January 2026): Service health pre-check
  // Skip tool execution if required backend services are unhealthy
  // ================================================================
  const requiredService = getRequiredServiceForTool(fn);
  if (requiredService && !isServiceHealthyFast(requiredService)) {
    log.warn(
      { fn, requiredService, sessionId },
      `⚠️ Skipping tool execution - required service '${requiredService}' is unhealthy`
    );

    // Return fallback without attempting execution
    const fallbackResult = getFallbackResponse(fn);
    const executionResult: FunctionExecutionResult = {
      success: false,
      fn,
      args,
      result: fallbackResult,
      durationMs: Date.now() - startTime,
      error: `Service '${requiredService}' is unavailable`,
    };

    // Clean up in-flight tracking
    if (sessionId !== 'unknown') {
      completeToolInFlight(sessionId, fn);
      try {
        const convState = getConversationState(sessionId);
        convState.endToolExecution();
      } catch {
        // Ignore - conversation state may not exist
      }
    }

    ctx.onToolComplete?.(executionResult);
    return executionResult;
  }

  try {
    // ================================================================
    // RELIABILITY: Execute with retry and circuit breaker
    // For CRITICAL tools (handoffs, calls), use parallel execution
    // ================================================================
    let result: unknown;
    let retries = 0;
    let fromFallback = false;
    let parallelAttempt: number | undefined;

    if (isCriticalTool(fn)) {
      // CRITICAL TOOL: Use parallel execution for high reliability
      log.info({ fn }, '🚀 Critical tool detected - using parallel execution');

      const parallelResult = await executeWithParallelFallback(
        fn,
        args,
        async (toolArgs): Promise<ParallelToolResult> => {
          try {
            const toolResult = await routeToTool(fn, toolArgs, ctx);
            return { success: true, data: toolResult };
          } catch (err) {
            return { success: false, error: String(err) };
          }
        },
        {
          maxParallel: 2,
          timeoutMs: 5000,
          verbose: true,
        }
      );

      if (parallelResult.success) {
        result = parallelResult.data;
        parallelAttempt = parallelResult.attempt;
        if (parallelAttempt && parallelAttempt > 1) {
          log.info({ fn, parallelAttempt }, '🚀 Critical tool succeeded on parallel attempt');
        }
      } else {
        // Parallel execution failed - try fallback
        fromFallback = true;
        result = getFallbackResponse(fn);
        log.warn(
          { fn, error: parallelResult.error, parallelDurationMs: parallelResult.durationMs },
          '⚠️ Critical tool parallel execution failed, using fallback'
        );
      }
    } else {
      // NON-CRITICAL: Use standard retry with circuit breaker
      const reliabilityResult = await executeWithReliability(
        fn,
        async () => routeToTool(fn, args, ctx),
        {
          fallbackValue: getFallbackResponse(fn),
        }
      );

      result = reliabilityResult.result;
      retries = reliabilityResult.retries;
      fromFallback = reliabilityResult.fromFallback;
    }

    if (retries > 0) {
      log.info({ fn, retries }, '🔄 Tool succeeded after retries');
    }
    if (fromFallback) {
      log.warn({ fn }, '⚠️ Tool returned fallback response');
    }

    // Check if this is a "speak directly" result from the speak pseudo-tool
    const speakDirectlyResult = result as { __speakDirectly?: boolean; text?: string } | null;
    const isSpeakDirectly =
      speakDirectlyResult &&
      typeof speakDirectlyResult === 'object' &&
      speakDirectlyResult.__speakDirectly === true &&
      typeof speakDirectlyResult.text === 'string';

    const executionResult: FunctionExecutionResult = {
      success: true,
      fn,
      args,
      // For speak pseudo-tool, extract the text; otherwise use the result as-is
      result: isSpeakDirectly ? speakDirectlyResult.text : result,
      durationMs: Date.now() - startTime,
      // Flag to tell the sanitizer to use session.say() directly
      speakDirectly: isSpeakDirectly || undefined,
    };

    // ================================================================
    // PERFORMANCE: Cache successful results & invalidate on writes
    // ================================================================
    if (ctx.sessionId && !fromFallback) {
      // Cache the result for read-only tools (don't cache fallbacks)
      cacheToolResult(ctx.sessionId, fn, args, result);
      // Invalidate affected caches for write operations
      invalidateToolCache(ctx.sessionId, fn);
    }

    // 🔍 E2E TRACE: Tool execution completed
    // Telemetry: Track which layer handled this tool call
    // - 'json-workaround': This executor (JSON intercepted from LLM output)
    // - 'semantic-router': Handled pre-LLM by semantic router
    // - 'native-fc': Handled by LLM's native function calling
    log.info(
      {
        fn,
        durationMs: executionResult.durationMs,
        sessionId,
        resultPreview: truncateForLog(JSON.stringify(result), 200),
        retries,
        fromFallback,
        handledBy: 'json-workaround', // This executor is the JSON workaround layer
        trace: 'E2E_TOOL_SUCCESS',
      },
      `🔍 E2E TRACE [TOOL] Completed: ${fn} in ${executionResult.durationMs}ms (via json-workaround)`
    );

    // Phase 3: Record actual tool execution for implicit correction capture (fire-and-forget)
    // This detects when the LLM chose a different tool than the semantic router predicted
    if (sessionId !== 'unknown') {
      recordActualToolExecution(sessionId, fn, 'json_fallback').catch(() => {
        // Ignore errors - this is non-critical
      });
    }

    // Developer Platform: Dispatch tool.completed webhook (fire-and-forget)
    dispatchToolCompletedWebhook({
      sessionId,
      userId: ctx.userId,
      personaId: ctx.personaId,
      publisherId: ctx.publisherId,
      toolName: fn,
      toolDomain: extractDomainFromTool(fn),
      result: truncateForLog(JSON.stringify(result), 500),
      executionTimeMs: executionResult.durationMs,
    });

    // Telemetry: Log successful execution
    logJsonExecuted(sessionId, fn, true, executionResult.durationMs);

    // Action History: Record for honest capability responses
    // (e.g., when user asks "did you call my mom?")
    if (sessionId) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      recordAction(sessionId, fn, args, true, truncateForLog(resultStr || '', 200));
    }

    // Action Tracker: Persist high-impact actions (calls, texts, emails, calendar)
    // for unified visibility in the Activity dashboard
    if (ctx.userId) {
      const resultSummaryStr = typeof result === 'string' ? result : JSON.stringify(result);
      trackHighImpactAction({
        userId: ctx.userId,
        sessionId: sessionId !== 'unknown' ? sessionId : undefined,
        toolId: fn,
        args,
        inputText: ctx.inputText,
        success: true,
        resultSummary: truncateForLog(resultSummaryStr, 200),
        durationMs: executionResult.durationMs,
      });
    }

    // Learning Loop: Record for semantic intelligence pattern learning
    // (compares what was predicted vs what was executed to improve future hints)
    if (ctx.userId && ctx.inputText) {
      recordSemanticExecution({
        userId: ctx.userId,
        sessionId: sessionId !== 'unknown' ? sessionId : undefined,
        personaId: ctx.personaId,
        inputText: ctx.inputText,
        toolId: fn,
        args,
        success: true,
        executionTimeMs: executionResult.durationMs,
        semanticPrediction: ctx.semanticPrediction,
      });
    }

    // Tool Intelligence: Record for outcome tracking and learning pipeline
    if (sessionId !== 'unknown' && ctx.inputText) {
      recordToolOutcome({
        sessionId,
        toolId: fn,
        query: ctx.inputText,
        success: true,
        executionTimeMs: executionResult.durationMs,
        personaId: ctx.personaId,
        selectionMethod: ctx.semanticPrediction ? 'semantic' : 'direct',
        confidence: ctx.semanticPrediction?.confidence,
      });
    }

    // Timing-aware tracking: Mark tool as complete (Phase 3 BTH)
    if (sessionId !== 'unknown') {
      completeToolInFlight(sessionId, fn);
      // P0-#2 UTO Fix: Also clear in-flight in conversation state
      try {
        const convState = getConversationState(sessionId);
        convState.endToolExecution();
      } catch {
        // Ignore - conversation state may not exist
      }
    }

    ctx.onToolComplete?.(executionResult);
    return executionResult;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const executionResult: FunctionExecutionResult = {
      success: false,
      fn,
      args,
      error: String(err),
      durationMs,
    };

    // 🔍 E2E TRACE: Tool execution failed
    log.error(
      {
        fn,
        args: truncateForLog(JSON.stringify(args), 200),
        error: String(err),
        durationMs,
        sessionId,
        trace: 'E2E_TOOL_FAILED',
      },
      `🔍 E2E TRACE [TOOL FAILED] ${fn} after ${durationMs}ms: ${String(err).slice(0, 100)}`
    );

    // Developer Platform: Dispatch tool.failed webhook (fire-and-forget)
    dispatchToolFailedWebhook({
      sessionId,
      userId: ctx.userId,
      personaId: ctx.personaId,
      publisherId: ctx.publisherId,
      toolName: fn,
      toolDomain: extractDomainFromTool(fn),
      error: String(err).slice(0, 500),
    });

    // Telemetry: Log failed execution
    logJsonExecuted(sessionId, fn, false, durationMs, String(err));

    // Action History: Record failed attempt for honest capability responses
    if (sessionId) {
      recordAction(sessionId, fn, args, false, `Failed: ${String(err).slice(0, 100)}`);
    }

    // Action Tracker: Persist failed high-impact actions for visibility
    if (ctx.userId) {
      trackHighImpactAction({
        userId: ctx.userId,
        sessionId: sessionId !== 'unknown' ? sessionId : undefined,
        toolId: fn,
        args,
        inputText: ctx.inputText,
        success: false,
        resultSummary: `Failed: ${String(err).slice(0, 150)}`,
        durationMs,
      });
    }

    // Learning Loop: Record failures too (helps learn what NOT to suggest)
    if (ctx.userId && ctx.inputText) {
      recordSemanticExecution({
        userId: ctx.userId,
        sessionId: sessionId !== 'unknown' ? sessionId : undefined,
        personaId: ctx.personaId,
        inputText: ctx.inputText,
        toolId: fn,
        args,
        success: false,
        executionTimeMs: durationMs,
        semanticPrediction: ctx.semanticPrediction,
      });
    }

    // Tool Intelligence: Record failures for outcome tracking and learning pipeline
    if (sessionId !== 'unknown' && ctx.inputText) {
      recordToolOutcome({
        sessionId,
        toolId: fn,
        query: ctx.inputText,
        success: false,
        executionTimeMs: durationMs,
        personaId: ctx.personaId,
        selectionMethod: ctx.semanticPrediction ? 'semantic' : 'direct',
        confidence: ctx.semanticPrediction?.confidence,
      });
    }

    // Timing-aware tracking: Mark tool as complete even on failure (Phase 3 BTH)
    if (sessionId !== 'unknown') {
      completeToolInFlight(sessionId, fn);
      // P0-#2 UTO Fix: Also clear in-flight in conversation state
      try {
        const convState = getConversationState(sessionId);
        convState.endToolExecution();
      } catch {
        // Ignore - conversation state may not exist
      }
    }

    ctx.onToolComplete?.(executionResult);
    return executionResult;
  }
}

/**
 * Get fallback response for a tool when it fails
 */
function getFallbackResponse(fn: string): string | undefined {
  const fnLower = fn.toLowerCase();

  // Weather fallback
  if (fnLower === 'getweather') {
    return "I couldn't get the current weather right now. Try again in a moment?";
  }

  // News fallback
  if (fnLower === 'getnews' || fnLower === 'searchnews') {
    return "I'm having trouble fetching news right now. Let me try again shortly.";
  }

  // Market fallback
  if (fnLower === 'getmarketsummary' || fnLower === 'getquote') {
    return "Market data isn't available at the moment. I'll try again soon.";
  }

  // Calendar fallback
  if (fnLower === 'getcalendartoday' || fnLower === 'getschedule') {
    return "I couldn't access your calendar right now. Want me to try again?";
  }

  // Time fallback (use local time)
  if (fnLower === 'getcurrenttime') {
    return `The current time is ${new Date().toLocaleTimeString()}.`;
  }

  // No fallback for other tools
  return undefined;
}

/**
 * Route function call to the appropriate tool.
 * This is the main dispatcher.
 */
async function routeToTool(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown> {
  const fnLower = fn.toLowerCase();

  // ========================================
  // SPEAK PSEUDO-TOOL (Dynamic silence responses)
  // Returns text to be spoken directly via session.say()
  // Used by generateReply() for dynamic content without echoing
  // Format: {"fn":"speak","args":{"text":"I'm here with you."}}
  // ========================================
  if (fnLower === 'speak' || fnLower === 'dynamicresponse' || fnLower === 'say') {
    const text = args.text as string;
    if (text && typeof text === 'string' && text.trim()) {
      log.info(
        { textLength: text.length, preview: text.slice(0, 50) },
        '🎤 Speak pseudo-tool - returning text for direct speech'
      );
      // Return a special marker object that the sanitizer will recognize
      return { __speakDirectly: true, text: text.trim() };
    }
    log.warn({ args }, '🎤 Speak pseudo-tool called without valid text');
    return null;
  }

  // ========================================
  // CONVERSATION PSEUDO-TOOL (FTIS signals "just conversation")
  // When FTIS classifies input as pure conversation, it outputs __conversation__
  // This signals: "don't execute a tool, let the LLM respond naturally"
  // Return null to pass through to LLM without tool execution
  // ========================================
  if (fnLower === '__conversation__' || fnLower === 'conversation') {
    log.debug({ query: args.query }, '💬 Conversation pseudo-tool - passing through to LLM');
    // Return null to signal "no tool result, let LLM handle this"
    // The conversation flow will continue naturally
    return null;
  }

  // ========================================
  // MODULAR EXECUTORS (Refactored domains)
  // Try modular executors first - they return null if not handled
  // ========================================
  const { routeToToolModular } = await import('./tool-executors/index.js');
  const modularResult = await routeToToolModular(fn, args, ctx);
  if (modularResult !== null) {
    return modularResult;
  }

  // ========================================
  // LEGACY FALLBACK (tools not yet in modular executors)
  // ========================================
  const { executeLegacyFallback } = await import('./tool-executors/legacy-fallback-executor.js');
  const legacyResult = await executeLegacyFallback(fn, args, ctx);
  if (legacyResult !== null) {
    return legacyResult;
  }

  // ========================================
  // UNKNOWN TOOL
  // ========================================
  // Log with details for monitoring and debugging (helps identify missing tool routes)
  log.warn(
    {
      fn,
      args,
      userId: ctx.userId,
      personaId: ctx.personaId,
    },
    '⚠️ Unknown function - no route defined. Add route in json-function-executor.ts if this is a valid tool.'
  );

  // Also output to stderr for maximum visibility in production logs
  process.stderr.write(`\n⚠️ UNKNOWN TOOL: "${fn}" with args: ${JSON.stringify(args)}\n`);
  process.stderr.write(
    `   User: ${ctx.userId || 'unknown'}, Persona: ${ctx.personaId || 'unknown'}\n`
  );
  process.stderr.write(`   → If this is a valid tool, add route in json-function-executor.ts\n\n`);

  // Return a human-friendly response that can be spoken by TTS
  // Note: Returning a string (not an object) ensures the agent can speak naturally
  return `I'm not able to do that specific action right now, but I'm happy to help in another way. What would you like to do?`;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Parse and execute all JSON function calls in text
 */
export async function parseAndExecuteAll(
  text: string,
  ctx: ToolExecutionContext = {}
): Promise<FunctionExecutionResult[]> {
  // Pre-Act: Check for reasoning + plan format (upfront planning)
  if (USE_PREACT && containsPreActPlan(text)) {
    const preActPlan = parsePreActPlan(text);

    if (preActPlan) {
      log.info(
        {
          format: preActPlan.format,
          confidence: preActPlan.confidence,
          taskCount: preActPlan.plan.tasks.length,
          reasoningLength: preActPlan.reasoning.length,
          sessionId: ctx.sessionId,
        },
        '🧠 Pre-Act plan detected with reasoning'
      );

      // Log the reasoning for observability (helps debug decision-making)
      if (preActPlan.reasoning.length > 0) {
        log.debug(
          { reasoning: preActPlan.reasoning.slice(0, 200), sessionId: ctx.sessionId },
          'Pre-Act reasoning'
        );
      }

      // Execute the plan using LLMCompiler
      const compilerResult = await executeLLMCompilerPlan(preActPlan.plan, {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        personaId: ctx.personaId,
        publisherId: ctx.publisherId,
        inputText: ctx.inputText,
      });

      return compilerResult.taskResults.map((tr) => ({
        success: tr.success,
        fn: tr.fn,
        args: {},
        result: tr.result,
        error: tr.error,
        durationMs: tr.durationMs,
      }));
    }
  }

  // LLMCompiler: Check for DAG format for parallel execution
  if (USE_LLMCOMPILER && containsLLMCompilerPlan(text)) {
    const plan = parseLLMCompilerPlan(text);

    if (plan && plan.tasks.length > 1) {
      log.info(
        { taskCount: plan.tasks.length, sessionId: ctx.sessionId },
        '🔀 Using LLMCompiler parallel execution'
      );

      const compilerResult = await executeLLMCompilerPlan(plan, {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        personaId: ctx.personaId,
        publisherId: ctx.publisherId,
        inputText: ctx.inputText,
      });

      // Convert to FunctionExecutionResult format for compatibility
      return compilerResult.taskResults.map((tr) => ({
        success: tr.success,
        fn: tr.fn,
        args: {},
        result: tr.result,
        error: tr.error,
        durationMs: tr.durationMs,
      }));
    }
  }

  // Standard sequential execution (fallback)
  const calls = extractAllJsonFunctionCalls(text);
  const results: FunctionExecutionResult[] = [];

  for (const call of calls) {
    const result = await executeJsonFunction(call, ctx);
    results.push(result);
  }

  return results;
}

/**
 * Strip JSON function calls from text (for TTS)
 */
export function stripJsonFunctionCalls(text: string): string {
  let cleaned = text;

  // Strip Pre-Act format first (includes reasoning + plan)
  if (USE_PREACT && containsPreActPlan(text)) {
    const { cleanText } = stripPreActFormat(cleaned);
    cleaned = cleanText;
  }

  // Strip LLMCompiler DAG format (if present)
  if (USE_LLMCOMPILER && containsLLMCompilerPlan(cleaned)) {
    cleaned = stripLLMCompilerPlan(cleaned);
  }

  // Strip individual JSON function calls
  const calls = extractAllJsonFunctionCalls(cleaned);
  for (const call of calls) {
    cleaned = cleaned.replace(call.raw, '');
  }

  // Clean up whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}
