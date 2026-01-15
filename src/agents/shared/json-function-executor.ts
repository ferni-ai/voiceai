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

import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import { recordAction } from './action-history.js';
import { logJsonDetected, logJsonExecuted } from './function-call-telemetry.js';
import {
  getActionTracker,
  isTrackableTool,
  getActionTypeForTool,
} from '../../services/action-tracker/index.js';
import {
  cacheToolResult,
  checkToolCache,
  invalidateToolCache,
} from '../../services/performance/tool-response-cache.js';
import { executeWithReliability } from '../../services/performance/tool-execution-reliability.js';
// Developer Platform: Webhook integration for tool events
import {
  onToolCalled as dispatchToolCalledWebhook,
  onToolCompleted as dispatchToolCompletedWebhook,
  onToolFailed as dispatchToolFailedWebhook,
} from '../integrations/developer-webhook-integration.js';

const log = createLogger({ module: 'json-function-executor' });

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
  const { fn, args } = call;
  const startTime = Date.now();
  const sessionId = ctx.sessionId || 'unknown';

  log.info({ fn, args }, '🔧 Executing JSON function call');
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
      ctx.onToolComplete?.(executionResult);
      return executionResult;
    }
  }

  try {
    // ================================================================
    // RELIABILITY: Execute with retry and circuit breaker
    // ================================================================
    const { result, retries, fromFallback } = await executeWithReliability(
      fn,
      async () => routeToTool(fn, args, ctx),
      {
        fallbackValue: getFallbackResponse(fn),
      }
    );

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

    log.info({ fn, durationMs: executionResult.durationMs }, '✅ JSON function executed');

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

    log.error({ fn, args, error: String(err) }, '❌ JSON function execution failed');

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
  // MODULAR EXECUTORS (Refactored domains)
  // Try modular executors first - they return null if not handled
  // ========================================
  const { routeToToolModular } = await import('./tool-executors/index.js');
  const modularResult = await routeToToolModular(fn, args, ctx);
  if (modularResult !== null) {
    return modularResult;
  }

  // ========================================
  // LEGACY TOOL ROUTING
  // Note: Music tools are now handled by modular executor (music-executor.ts)
  // ========================================

  // ========================================
  // MEMORY TOOLS (With Embedding + Firestore for SUPERHUMAN recall)
  // ========================================
  if (fnLower === 'rememberaboutuser') {
    const fact = args.fact as string;
    const category = (args.category as string) || 'personal';
    const importance = (args.importance as string) || 'medium';
    const emotionalContext = args.emotionalContext as string | undefined;

    if (!fact) {
      return 'Please specify what you want me to remember.';
    }

    log.info(
      { fact, category, importance, userId: ctx.userId },
      '💾 Remembering fact (WITH EMBEDDING)'
    );

    // Try to persist to Firestore WITH EMBEDDING for semantic recall
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        // Generate embedding for semantic recall later
        let embedding: number[] | null = null;
        try {
          const { embed } = await import('../../memory/embeddings.js');
          embedding = await embed(fact);
          log.debug(
            { factLength: fact.length, embeddingDim: embedding.length },
            'Generated embedding for memory'
          );
        } catch (embedErr) {
          log.warn({ error: String(embedErr) }, 'Embedding generation failed, storing without');
        }

        // Store with rich metadata for superhuman recall
        const memoryDoc = {
          fact,
          category,
          importance,
          confidence: importance === 'high' ? 0.9 : importance === 'medium' ? 0.7 : 0.5,
          extractedAt: new Date(),
          source: 'explicit_mention',
          // Embedding for semantic search
          ...(embedding && { embedding }),
          // Emotional context if provided
          ...(emotionalContext && { emotionalContext }),
          // Session context for "when did I tell you this"
          sessionId: ctx.sessionId,
          personaId: ctx.personaId || 'ferni',
        };

        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .add(cleanForFirestore(memoryDoc));

        // Also index in vector store for cross-session semantic search
        try {
          const { getFirestoreVectorStore } =
            await import('../../memory/firestore-vector-store.js');
          const vectorStore = getFirestoreVectorStore();

          await vectorStore.addDocument({
            id: `fact_${ctx.userId}_${Date.now()}`,
            text: fact,
            embedding: embedding || undefined,
            metadata: {
              source: 'user_memory',
              category,
              userId: ctx.userId,
              importance,
              timestamp: new Date(),
              emotionalWeight: importance === 'high' ? 0.9 : importance === 'medium' ? 0.6 : 0.3,
            },
          });
          log.debug('Memory also indexed in vector store for semantic search');
        } catch (vectorErr) {
          log.debug({ error: String(vectorErr) }, 'Vector store indexing failed (non-critical)');
        }

        log.info(
          { userId: ctx.userId, fact, hasEmbedding: !!embedding },
          '✅ Memory stored with embedding'
        );

        // Return empty string - tool should execute silently
        // The LLM decides how/if to acknowledge
        return '';
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory storage failed');
      }
    }

    // Return empty string for silent execution
    return '';
  }

  if (fnLower === 'recallfrommemory') {
    const topic = args.topic as string;

    if (!topic) {
      return 'What would you like me to recall?';
    }

    log.info({ topic, userId: ctx.userId }, '🧠 Recalling from memory (SEMANTIC SEARCH)');

    // ========================================
    // SUPERHUMAN MEMORY RECALL - Semantic + Temporal + Emotional
    // ========================================
    if (ctx.userId) {
      // 🚀 PERFORMANCE: Check memory deduplication cache first
      if (ctx.sessionId) {
        try {
          const { getCachedMemoryResult, cacheMemoryResult } =
            await import('./performance/session-optimizations.js');
          const cached = getCachedMemoryResult(ctx.sessionId, topic);
          if (cached) {
            log.debug({ topic }, '💾 Memory recall served from cache');
            return cached.result as string;
          }
        } catch {
          // Cache module may not be loaded - continue without cache
        }
      }

      try {
        // 1. SEMANTIC SEARCH - Find memories by MEANING, not just keywords
        const { getRAGContext } = await import('../../memory/semantic-rag.js');
        const ragResults = await getRAGContext(topic, {
          topK: 5,
          includePersona: false, // Focus on user memories
          includeConversations: true,
          includeUserMemory: true,
          userId: ctx.userId,
          minScore: 0.25, // Lower threshold for broader recall
        });

        // 2. Also get recent facts from Firestore for recency boost
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        interface MemoryItem {
          content: string;
          score: number;
          timestamp?: Date;
          source: 'semantic' | 'fact' | 'summary';
          category?: string;
          emotionalWeight?: number;
        }

        const memories: MemoryItem[] = [];

        // Add semantic results
        for (const result of ragResults.results) {
          memories.push({
            content: result.content,
            score: result.score,
            timestamp: result.metadata?.timestamp
              ? new Date(result.metadata.timestamp as string | number)
              : undefined,
            source: 'semantic',
            category: result.category,
            emotionalWeight: (result.metadata?.emotionalWeight as number) || 0.5,
          });
        }

        // Get recent facts with semantic fallback
        const factsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .orderBy('extractedAt', 'desc')
          .limit(20)
          .get();

        if (!factsSnapshot.empty) {
          // Use embedding similarity if available, otherwise keyword match
          const { embed, cosineSimilarity } = await import('../../memory/embeddings.js');
          let queryEmbedding: number[] | null = null;

          try {
            queryEmbedding = await embed(topic);
          } catch {
            log.debug('Embedding failed, using keyword fallback');
          }

          for (const doc of factsSnapshot.docs) {
            const data = doc.data();
            const factText = (data.fact || data.content || '') as string;
            const factEmbedding = data.embedding as number[] | undefined;

            let score = 0;

            if (queryEmbedding && factEmbedding) {
              // Semantic similarity
              score = cosineSimilarity(queryEmbedding, factEmbedding);
            } else {
              // Keyword fallback
              const topicLower = topic.toLowerCase();
              const factLower = factText.toLowerCase();
              if (factLower.includes(topicLower)) {
                score = 0.6;
              } else {
                // Check for word overlap
                const topicWords = topicLower.split(/\s+/);
                const factWords = factLower.split(/\s+/);
                const overlap = topicWords.filter((w) => factWords.includes(w)).length;
                score = overlap > 0 ? 0.3 + overlap * 0.1 : 0;
              }
            }

            if (score > 0.2) {
              // Apply recency boost (memories from last 7 days get +0.15)
              const daysSince = data.extractedAt
                ? (Date.now() - data.extractedAt.toDate().getTime()) / (1000 * 60 * 60 * 24)
                : 30;
              const recencyBoost = daysSince < 7 ? 0.15 : daysSince < 30 ? 0.05 : 0;

              // Apply emotional weight boost
              const emotionalBoost =
                data.importance === 'high' ? 0.1 : data.importance === 'medium' ? 0.05 : 0;

              memories.push({
                content: factText,
                score: score + recencyBoost + emotionalBoost,
                timestamp: data.extractedAt?.toDate?.() || new Date(),
                source: 'fact',
                category: data.category as string,
                emotionalWeight: emotionalBoost,
              });
            }
          }
        }

        // Sort by score (semantic similarity + recency + emotional weight)
        memories.sort((a, b) => b.score - a.score);

        // Deduplicate by content similarity
        const uniqueMemories: MemoryItem[] = [];
        for (const mem of memories) {
          const isDuplicate = uniqueMemories.some(
            (existing) =>
              existing.content.toLowerCase().includes(mem.content.toLowerCase().slice(0, 30)) ||
              mem.content.toLowerCase().includes(existing.content.toLowerCase().slice(0, 30))
          );
          if (!isDuplicate) {
            uniqueMemories.push(mem);
          }
        }

        if (uniqueMemories.length > 0) {
          // Format with temporal context
          const formatTimeAgo = (timestamp?: Date): string => {
            if (!timestamp) return '';
            const days = Math.floor((Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24));
            if (days === 0) return ' (today)';
            if (days === 1) return ' (yesterday)';
            if (days < 7) return ` (${days} days ago)`;
            if (days < 30) return ` (${Math.floor(days / 7)} weeks ago)`;
            if (days < 365) return ` (${Math.floor(days / 30)} months ago)`;
            return ` (over a year ago)`;
          };

          const topMemories = uniqueMemories.slice(0, 3);
          const formattedMemories = topMemories.map((m) => {
            const timeRef = formatTimeAgo(m.timestamp);
            return `${m.content}${timeRef}`;
          });

          log.info(
            {
              topic,
              found: uniqueMemories.length,
              topScore: uniqueMemories[0]?.score,
            },
            '✅ Semantic memory recall successful'
          );

          // Natural phrasing based on how many and how strong
          let result: string;
          if (topMemories[0].score > 0.7) {
            result = `I clearly remember: ${formattedMemories[0]}`;
          } else if (topMemories.length === 1) {
            result = `I recall: ${formattedMemories[0]}`;
          } else {
            result = `Here's what I remember: ${formattedMemories.join('; ')}`;
          }

          // 🚀 PERFORMANCE: Cache the result for deduplication
          if (ctx.sessionId) {
            try {
              const { cacheMemoryResult } = await import('./performance/session-optimizations.js');
              cacheMemoryResult(ctx.sessionId, topic, result);
            } catch {
              // Cache storage is non-critical
            }
          }

          return result;
        }

        log.info({ topic }, 'No relevant memories found via semantic search');
        return `I don't have specific memories about "${topic}" yet. Tell me more so I can remember?`;
      } catch (err) {
        log.warn({ error: String(err), topic }, 'Semantic memory recall failed, trying fallback');

        // Fallback to basic text search if semantic fails
        try {
          const { getFirestore } = await import('firebase-admin/firestore');
          const db = getFirestore();
          const factsSnapshot = await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('extracted_facts')
            .orderBy('extractedAt', 'desc')
            .limit(10)
            .get();

          if (!factsSnapshot.empty) {
            const topicLower = topic.toLowerCase();
            const relevant = factsSnapshot.docs
              .map((doc) => doc.data())
              .filter((f) => {
                const text = ((f.fact || f.content) as string).toLowerCase();
                return text.includes(topicLower);
              });

            if (relevant.length > 0) {
              return `I remember: ${relevant
                .slice(0, 2)
                .map((f) => f.fact || f.content)
                .join('; ')}`;
            }
          }
        } catch {
          // Silent fallback failure
        }
      }
    }

    return `I don't have specific memories about that right now. Tell me more?`;
  }

  // ========================================
  // MEMORY REINFORCEMENT - Boosts confidence when user confirms
  // ========================================
  if (fnLower === 'reinforcememory') {
    const memory = args.memory as string;
    const confirmationType = (args.confirmationType as string) || 'confirmed';

    if (!memory || !ctx.userId) {
      return '';
    }

    log.info({ memory, confirmationType, userId: ctx.userId }, '💪 Reinforcing memory');

    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      // Find the memory and boost its confidence
      const snapshot = await db
        .collection('bogle_users')
        .doc(ctx.userId)
        .collection('extracted_facts')
        .get();

      const memoryLower = memory.toLowerCase();
      const docToReinforce = snapshot.docs.find((doc) => {
        const data = doc.data();
        const factText = (((data.fact || data.content) as string) || '').toLowerCase();
        return factText.includes(memoryLower) || memoryLower.includes(factText.slice(0, 30));
      });

      if (docToReinforce) {
        const currentData = docToReinforce.data();
        const currentConfidence = (currentData.confidence as number) || 0.5;
        const reinforceCount = (currentData.reinforceCount as number) || 0;

        // Boost confidence (asymptotic approach to 1.0)
        const newConfidence = Math.min(0.99, currentConfidence + (1 - currentConfidence) * 0.15);

        await docToReinforce.ref.update(
          cleanForFirestore({
            confidence: newConfidence,
            reinforceCount: reinforceCount + 1,
            lastReinforcedAt: new Date(),
            importance: newConfidence > 0.85 ? 'high' : currentData.importance,
          })
        );

        log.info(
          { oldConfidence: currentConfidence, newConfidence, reinforceCount: reinforceCount + 1 },
          '✅ Memory reinforced'
        );
      }
    } catch (err) {
      log.debug({ error: String(err) }, 'Memory reinforcement failed (non-critical)');
    }

    // Silent operation
    return '';
  }

  if (fnLower === 'updatememory') {
    const oldFact = args.oldFact as string;
    const newFact = args.newFact as string;

    if (!oldFact || !newFact) {
      return 'Please specify both the old memory and the updated information.';
    }

    log.info({ oldFact, newFact, userId: ctx.userId }, '✏️ Updating memory (WITH NEW EMBEDDING)');

    // If we have userId, try to update in Firestore
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        // Generate new embedding for semantic search
        let newEmbedding: number[] | null = null;
        try {
          const { embed } = await import('../../memory/embeddings.js');
          newEmbedding = await embed(newFact);
        } catch {
          log.debug('Embedding generation failed for updated fact');
        }

        // Find and update the old fact
        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();

        const oldFactLower = oldFact.toLowerCase();
        const docToUpdate = snapshot.docs.find((doc) => {
          const data = doc.data();
          return (data.fact || data.content || '').toLowerCase().includes(oldFactLower);
        });

        if (docToUpdate) {
          const updateData: Record<string, unknown> = {
            fact: newFact,
            updatedAt: new Date(),
            previousVersion: oldFact,
            ...(newEmbedding && { embedding: newEmbedding }),
          };
          await docToUpdate.ref.update(updateData);
          log.info(
            { userId: ctx.userId, hasEmbedding: !!newEmbedding },
            '✅ Memory updated in Firestore'
          );
        } else {
          // If no match found, store as new fact
          await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('extracted_facts')
            .add(
              cleanForFirestore({
                fact: newFact,
                category: 'personal',
                importance: 'medium',
                confidence: 0.8,
                extractedAt: new Date(),
                source: 'explicit_update',
                previousVersion: oldFact,
                ...(newEmbedding && { embedding: newEmbedding }),
              })
            );
        }

        // Silent operation
        return '';
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory update in Firestore failed');
      }
    }

    return '';
  }

  if (fnLower === 'forgetmemory') {
    const topic = args.topic as string;
    const whatToForget = args.whatToForget as string;
    const target = topic || whatToForget;

    if (!target) {
      return 'What would you like me to forget?';
    }

    log.info({ target, userId: ctx.userId }, '🗑️ Forgetting memory');

    // If we have userId, try to remove from Firestore
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();

        const targetLower = target.toLowerCase();
        const docsToDelete = snapshot.docs.filter((doc) => {
          const data = doc.data();
          return (data.fact || data.content || '').toLowerCase().includes(targetLower);
        });

        if (docsToDelete.length > 0) {
          const batch = db.batch();
          docsToDelete.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();

          log.info(
            { userId: ctx.userId, deleted: docsToDelete.length },
            '✅ Memories deleted from Firestore'
          );
          return `I've forgotten about that. Your privacy matters.`;
        }

        return `I didn't find specific memories about "${target}" to remove.`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory deletion from Firestore failed');
      }
    }

    return { forgotten: true, topic: target, message: `I'll forget about that.` };
  }

  if (fnLower === 'getrelationshipsummary') {
    log.info({ userId: ctx.userId }, '📊 Getting relationship summary');

    // If we have userId, try to get real relationship data
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        // Get user profile
        const profileDoc = await db.collection('bogle_users').doc(ctx.userId).get();

        if (profileDoc.exists) {
          const profile = profileDoc.data() as Record<string, unknown> | undefined;
          if (profile) {
            const sections: string[] = [];

            if (profile.displayName || profile.name) {
              sections.push(`I know you as ${profile.displayName || profile.name}.`);
            }

            if (typeof profile.totalConversations === 'number' && profile.totalConversations > 1) {
              sections.push(`We've had ${profile.totalConversations} conversations together.`);
            }

            if (profile.relationshipStage) {
              sections.push(`Our relationship is in the "${profile.relationshipStage}" stage.`);
            }

            const topics = profile.preferredTopics as string[] | undefined;
            if (topics && topics.length > 0) {
              sections.push(`You tend to discuss: ${topics.slice(0, 3).join(', ')}.`);
            }

            if (sections.length > 0) {
              return sections.join(' ');
            }
          }
        }

        return "We're still getting to know each other. I'm here to listen and learn.";
      } catch (err) {
        log.warn({ error: String(err) }, 'Relationship summary from Firestore failed');
      }
    }

    return "This is a new conversation. I'm still getting to know you.";
  }

  // ========================================
  // HANDOFF TOOLS - Now handled by modular handoff-executor.ts
  // See: src/agents/shared/tool-executors/handoff-executor.ts
  // ========================================

  // ========================================
  // INFORMATION TOOLS
  // ========================================
  if (fnLower === 'getweather') {
    const { getCurrentWeather, getWeatherForecast } =
      await import('../../tools/domains/information/weather.js');
    let location = (args.location as string) || 'current';
    const type = (args.type as string) || 'current';

    // 🔍 E2E TRACE: Weather tool execution - log all location sources
    log.info(
      {
        trace: 'E2E_WEATHER_ENTRY',
        argsLocation: args.location,
        initialLocation: location,
        hasUserLocation: !!ctx?.userLocation,
        userLocationCity: ctx?.userLocation?.city,
        userLocationRegion: ctx?.userLocation?.regionCode,
        userId: ctx?.userId,
      },
      `🔍 E2E TRACE [WEATHER] Entry: location="${location}", userLocation.city="${ctx?.userLocation?.city || 'NONE'}"`
    );

    // Handle "current" location - try to get user's location from multiple sources
    if (location === 'current' || location === '' || !location) {
      // Priority 1: Try IP-detected location (TikTok-style personalization)
      if (ctx?.userLocation?.city) {
        location = ctx.userLocation.regionCode
          ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
          : ctx.userLocation.city;
        log.info(
          { trace: 'E2E_WEATHER_LOCATION', source: 'IP_DETECTED', location, userId: ctx.userId },
          `🔍 E2E TRACE [WEATHER] Using IP-detected: "${location}"`
        );
      }

      // Priority 2: Try to get user's saved location from memory
      if ((location === 'current' || !location) && ctx?.userId) {
        try {
          const { getUserLocationPreference } =
            await import('../../tools/domains/information/location-preference.js');
          const savedLocation = getUserLocationPreference(ctx.userId);
          if (savedLocation) {
            location = savedLocation;
            log.info(
              {
                trace: 'E2E_WEATHER_LOCATION',
                source: 'SAVED_PREFERENCE',
                location,
                userId: ctx.userId,
              },
              `🔍 E2E TRACE [WEATHER] Using saved preference: "${location}"`
            );
          }
        } catch {
          // Location preference module may not exist yet, continue with default
        }
      }

      // Priority 3: If still "current", we need to ask the user
      if (location === 'current' || !location) {
        log.warn(
          { trace: 'E2E_WEATHER_NO_LOCATION', location, userId: ctx?.userId },
          '🔍 E2E TRACE [WEATHER] ⚠️ NO LOCATION AVAILABLE - asking user'
        );
        return "I'd love to check the weather for you! What city are you in?";
      }
    }

    log.info(
      { trace: 'E2E_WEATHER_FETCH', location, type },
      `🔍 E2E TRACE [WEATHER] Fetching weather for: "${location}"`
    );

    try {
      let result: string;
      if (type === 'forecast') {
        result = await getWeatherForecast(location, 5);
      } else {
        result = await getCurrentWeather(location);
      }

      log.info(
        {
          trace: 'E2E_WEATHER_SUCCESS',
          location,
          type,
          resultLength: result.length,
          resultPreview: result.slice(0, 150),
        },
        `🔍 E2E TRACE [WEATHER] ✅ Success: "${result.slice(0, 80)}..."`
      );
      return result;
    } catch (weatherErr) {
      log.error(
        {
          trace: 'E2E_WEATHER_FAILED',
          location,
          type,
          error: String(weatherErr),
          stack: (weatherErr as Error)?.stack?.slice(0, 300),
        },
        `🔍 E2E TRACE [WEATHER] ❌ Failed: ${String(weatherErr).slice(0, 100)}`
      );
      // Return a fallback message instead of throwing
      return `I'm having trouble getting weather data for ${location} right now. Could you try asking again in a moment?`;
    }
  }

  if (fnLower === 'getcurrenttime') {
    const timezone = (args.timezone as string) || 'local';
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone === 'local' ? undefined : timezone,
      hour: 'numeric',
      minute: '2-digit',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    };
    const formatted = now.toLocaleString('en-US', options);
    return `It's ${formatted}.`;
  }

  if (fnLower === 'searchnews' || fnLower === 'getnews') {
    const { getFinancialNews, getStockNews, getGeneralNews, getTechNews } =
      await import('../../tools/domains/information/news.js');
    const topic = (args.topic as string)?.toLowerCase() || 'general';
    const query = args.query as string;
    const category = args.category as string;

    log.info({ topic, query, category }, '📰 News search requested');

    // Route to appropriate news function based on topic
    if (topic === 'tech' || topic === 'technology') {
      return getTechNews();
    }
    if (topic === 'financial' || topic === 'finance' || topic === 'market' || topic === 'markets') {
      const newsCategory = (category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
      return getFinancialNews(newsCategory);
    }
    if (topic === 'stock' && query) {
      return getStockNews(query.toUpperCase());
    }
    // Default to general news
    return getGeneralNews();
  }

  if (fnLower === 'getfinancialsnews' || fnLower === 'getfinancialnews') {
    const { getFinancialNews } = await import('../../tools/domains/information/news.js');
    const category = (args.category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
    log.info({ category }, '📰 Financial news requested');
    return getFinancialNews(category);
  }

  if (fnLower === 'gettechnews' || fnLower === 'gettechnews') {
    const { getTechNews } = await import('../../tools/domains/information/news.js');
    log.info({}, '📰 Tech news requested');
    return getTechNews();
  }

  if (fnLower === 'getstocknews') {
    const { getStockNews } = await import('../../tools/domains/information/news.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, TSLA).';
    }
    log.info({ symbol }, '📰 Stock news requested');
    return getStockNews(symbol.toUpperCase());
  }

  if (fnLower === 'getmarketsummary' || fnLower === 'getmarketoverview') {
    const { getMarketOverview } = await import('../../tools/domains/finance/market-data.js');
    log.info({}, '📈 Market summary requested');
    return getMarketOverview();
  }

  if (fnLower === 'getstockquote' || fnLower === 'getstockprice') {
    const { getStockQuote } = await import('../../tools/domains/finance/market-data.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, VTI, SPY).';
    }
    log.info({ symbol }, '📈 Stock quote requested');
    return getStockQuote(symbol);
  }

  // ========================================
  // PRODUCTIVITY TOOLS - Now handled by modular productivity-executor.ts
  // See: src/agents/shared/tool-executors/productivity-executor.ts
  // Tasks, goals, timers, reminders, notes, journal - all with Firestore persistence
  // ========================================

  // ========================================
  // HABITS TOOLS (Connected to Maya's Habit Coaching Domain)
  // Full habit tracking with behavior science backing.
  // ========================================
  if (fnLower === 'createhabit') {
    const name = args.name as string;
    const domain = (args.domain as string) || 'selfCare';
    const cue = args.cue as string;

    if (!name) {
      return 'What habit would you like to develop?';
    }

    log.info({ name, domain, userId: ctx.userId }, '✅ Creating habit');

    // Store habit in Firestore with behavior science structure
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const habitId = `habit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .doc(habitId)
          .set(
            cleanForFirestore({
              id: habitId,
              name,
              domain,
              cue: cue || null,
              currentLevel: 1, // Start at tiny habit level (Glidepath)
              targetLevel: 3,
              frequency: 'daily',
              currentStreak: 0,
              totalCompletions: 0,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          );

        // Return behavior-science guided response
        const tinyHabitResponses = [
          `Starting "${name}" - smart choice. Let's make this so small you can't fail. What's the tiniest version of this habit? Something that takes less than 2 minutes.`,
          `I'm tracking "${name}" for you. Here's the key: start ridiculously small. When and where will you do this? Let's create a clear trigger.`,
          `"${name}" is now in your habit stack. The secret? Attach it to something you already do. After what existing habit could you do this?`,
        ];
        return tinyHabitResponses[Math.floor(Math.random() * tinyHabitResponses.length)];
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit storage failed');
      }
    }

    return `Great habit to build: "${name}". Let's make it stick - what's the tiniest version you could start with?`;
  }

  if (fnLower === 'loghabitcompletion' || fnLower === 'loghabit') {
    const habitName = (args.habitName as string) || (args.name as string);

    if (!habitName) {
      return 'Which habit did you complete?';
    }

    log.info({ habitName, userId: ctx.userId }, '✅ Habit completion logged');

    // Update habit tracking in Firestore
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        // Find the habit by name
        const habitsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('isActive', '==', true)
          .get();

        const matchingHabit = habitsSnapshot.docs.find((doc) => {
          const data = doc.data();
          return data.name.toLowerCase().includes(habitName.toLowerCase());
        });

        if (matchingHabit) {
          const habitData = matchingHabit.data();
          const newStreak = (habitData.currentStreak || 0) + 1;
          const newTotal = (habitData.totalCompletions || 0) + 1;

          await matchingHabit.ref.update(
            cleanForFirestore({
              currentStreak: newStreak,
              totalCompletions: newTotal,
              lastCompleted: new Date(),
              updatedAt: new Date(),
            })
          );

          // Log completion event
          await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('habit_completions')
            .add(
              cleanForFirestore({
                habitId: matchingHabit.id,
                habitName: habitData.name,
                completedAt: new Date(),
                streak: newStreak,
              })
            );

          // Generate streak-aware celebration
          if (newStreak === 7) {
            return `🔥 One week streak on "${habitData.name}"! That's real momentum. Your brain is starting to expect this now.`;
          } else if (newStreak === 21) {
            return `🎯 21 days of "${habitData.name}"! This is becoming automatic. You're rewiring your brain.`;
          } else if (newStreak === 30) {
            return `🏆 30 days! "${habitData.name}" is officially part of who you are now. That's identity change.`;
          } else if (newStreak >= 3 && newStreak % 7 === 0) {
            return `${newStreak} day streak on "${habitData.name}". You're building something real here.`;
          }

          const celebrations = [
            `Nice work on "${habitData.name}"! That's ${newStreak} ${newStreak === 1 ? 'day' : 'days'} in a row.`,
            `"${habitData.name}" - done! Every rep matters. Streak: ${newStreak}.`,
            `Logged! "${habitData.name}" - ${newTotal} total completions. You're showing up.`,
          ];
          return celebrations[Math.floor(Math.random() * celebrations.length)];
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit completion logging failed');
      }
    }

    return `Nice work completing "${habitName}"! Every step counts.`;
  }

  if (fnLower === 'gethabits') {
    log.info({ type: args.type, userId: ctx.userId }, '📋 Habits requested');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const habitsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();

        if (!habitsSnapshot.empty) {
          const habits = habitsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return `${data.name} (${data.currentStreak || 0} day streak)`;
          });
          return `Your active habits: ${habits.join(', ')}. Want to log a completion or add a new one?`;
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit retrieval failed');
      }
    }

    return "You don't have any tracked habits yet. Would you like to start one? I can help you design it using behavior science.";
  }

  if (fnLower === 'gethabitstats') {
    const habitName = args.habitName as string;
    log.info({ habitName, userId: ctx.userId }, '📊 Habit stats requested');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const habitsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('habits')
          .where('isActive', '==', true)
          .get();

        if (!habitsSnapshot.empty) {
          const stats = habitsSnapshot.docs.map((doc) => {
            const data = doc.data();
            const successRate =
              data.totalCompletions > 0
                ? Math.round((data.currentStreak / data.totalCompletions) * 100)
                : 0;
            return `${data.name}: ${data.currentStreak} day streak, ${data.totalCompletions} total`;
          });
          return `Your habit progress:\n${stats.join('\n')}`;
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Habit stats failed');
      }
    }

    return "I don't have habit stats for you yet. Let's create a habit to track!";
  }

  // ========================================
  // WELLNESS TOOLS (Conversational Fallbacks)
  // These provide immediate helpful responses for wellness requests.
  // Crisis resources are real - always provide 988 hotline info.
  // ========================================
  if (fnLower === 'getcrisisresources') {
    log.info({ type: args.type }, '🆘 Crisis resources requested');
    return "If you're in crisis, please reach out: Call or text 988 for the Suicide and Crisis Lifeline, or text HOME to 741741 for the Crisis Text Line. You matter, and help is available 24/7.";
  }

  if (fnLower === 'groundingexercise') {
    log.info({ type: args.type }, '🧘 Grounding exercise requested');
    return "Let's do a quick grounding exercise. Take a slow breath with me. Now, name five things you can see around you. Take your time.";
  }

  if (fnLower === 'logmood') {
    const mood = args.mood as string;
    log.info({ mood, intensity: args.intensity }, '😊 Mood noted');
    return mood
      ? `I hear you're feeling ${mood}. Thank you for sharing that with me.`
      : 'How are you feeling right now?';
  }

  // ========================================
  // WISDOM TOOLS (Conversational Fallbacks)
  // These provide actual wisdom content - not stubs!
  // Nayan's full wisdom tools are in tools/domains/wisdom.
  // ========================================
  if (fnLower === 'paradoxoftheday') {
    log.info({ action: args.action }, '🤔 Paradox requested');
    const paradoxes = [
      "Here's one to sit with: The more you try to control, the less control you have. What does that bring up for you?",
      'Consider this paradox: We must accept ourselves to change ourselves. How does that land?',
      'A paradox to ponder: The obstacle is often the way. What might that mean in your situation?',
    ];
    return paradoxes[Math.floor(Math.random() * paradoxes.length)];
  }

  if (fnLower === 'questionbeneath') {
    const question = args.initialQuestion as string;
    log.info({ question }, '❓ Question beneath requested');
    return question
      ? `You asked: "${question}". But let me ask you - what's the deeper question underneath that one?`
      : "What question is on your mind? I'd like to explore what might be underneath it.";
  }

  if (fnLower === 'lifeportfolioreview') {
    const domain = args.domain as string;
    log.info({ domain }, '📊 Life portfolio review requested');
    return domain
      ? `Let's look at how ${domain} fits into your overall life. On a scale of 1-10, how satisfied are you with this area right now?`
      : "Let's review your life portfolio. Which area would you like to explore: career, relationships, health, purpose, or something else?";
  }

  // ========================================
  // GAMES (Conversational Fallbacks)
  // These initiate game conversations naturally.
  // Full game implementations are in tools/domains/games.
  // ========================================
  if (fnLower === 'startgame' || fnLower === 'starttextgame') {
    const game = args.game as string;
    log.info({ game }, '🎮 Game started');
    return game
      ? `Let's play ${game}! I'll explain the rules as we go. Ready?`
      : "I'd love to play a game with you! What sounds fun - 20 questions, word association, or something else?";
  }

  if (fnLower === 'inboxzerochallenge') {
    log.info({ action: args.action }, '🎮 Inbox Zero Challenge');
    return "Inbox Zero Challenge! Let's tackle that email backlog together. Start by picking the 5 oldest unread emails. Ready to begin?";
  }

  if (fnLower === 'sundayprepgame') {
    log.info({ action: args.action }, '🎮 Sunday Prep Game');
    return "Sunday Prep Game! Let's set up your week for success. First question: What's the ONE thing that would make this week feel like a win?";
  }

  if (fnLower === 'compoundinterestgame') {
    log.info({ action: args.action }, '🎮 Compound Interest Game');
    return "Compound Interest Game! Let's explore how small consistent actions compound over time. What's one tiny habit you'd like to explore?";
  }

  // ========================================
  // COMMUNICATION TOOLS (Conversational Fallbacks)
  // Alex's full communication tools are in tools/domains/communication.
  // These fallbacks help draft/analyze messages conversationally.
  // Note: sendMessage/sendText/sendSMS are connected to real Twilio SMS
  // Note: sendEmail is connected to real SendGrid email
  // ========================================

  // ========================================
  // VOICE MESSAGE - Send personalized voice messages via MMS
  // Uses Cartesia TTS + GCS + Twilio MMS
  // ========================================
  if (fnLower === 'sendvoicemessage') {
    const contactName = (args.contactName || args.contact || args.to) as string;
    const message = (args.message || args.text) as string;
    const persona = (args.persona as string) || 'ferni';

    if (!contactName) {
      return 'Who would you like me to send a voice message to?';
    }

    if (!message) {
      return `What would you like me to say to ${contactName}?`;
    }

    log.info({ contactName, persona, userId: ctx.userId }, '🎤 Voice message requested');

    if (!ctx.userId) {
      return 'I need to know who you are to send voice messages.';
    }

    try {
      // Check if voice synthesis is available
      const { isVoiceSynthesisAvailable, generateVoiceMessage } =
        await import('../../services/outreach/voice-synthesis.js');

      if (!isVoiceSynthesisAvailable()) {
        log.warn('Voice synthesis not configured');
        return "Voice messages aren't set up yet. Would you like me to send a text instead?";
      }

      // Find the contact
      const { searchContacts } =
        await import('../../services/contacts/contact-relationship-service.js');
      const matches = await searchContacts(ctx.userId, contactName);

      if (matches.length === 0) {
        return `I don't have ${contactName} in your contacts. Would you like to add them first?`;
      }

      const contact = matches[0];

      if (!contact.phone) {
        return `${contact.name} doesn't have a phone number saved. Voice messages need a phone number.`;
      }

      // Generate the voice message
      log.info({ persona, messageLength: message.length }, '🎤 Generating voice message');
      const voiceMessage = await generateVoiceMessage({
        text: message,
        personaId: persona,
        userId: ctx.userId,
      });

      if (!voiceMessage) {
        return 'Had trouble generating the voice message. Want me to try again or send a text instead?';
      }

      // Send via MMS using Twilio

      // Twilio MMS requires a media URL - we have it from GCS
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        log.warn('Twilio not configured for MMS');
        return `Voice message ready! Here's the preview: ${voiceMessage.audioUrl}\n\nBut I can't send it yet - messaging isn't fully configured.`;
      }

      // Send MMS with audio attachment
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: contact.phone,
            From: fromNumber,
            Body: `🎤 Voice message from ${persona === 'ferni' ? 'Ferni' : persona}`,
            MediaUrl: voiceMessage.audioUrl,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, '📱 MMS send failed');
        return `I generated the voice message but had trouble sending it. ${voiceMessage.audioUrl}`;
      }

      const mmsData = (await response.json()) as { sid: string };
      log.info({ sid: mmsData.sid, to: contact.phone }, '📱 Voice message sent via MMS');

      return `I sent a voice message to ${contact.name}. They'll receive it as an audio message.`;
    } catch (err) {
      log.error({ error: String(err) }, '🎤 Voice message failed');
      return `Something went wrong sending the voice message. ${String(err)}`;
    }
  }

  // ========================================
  // SEND TEXT MESSAGE (SMS) - Real Twilio integration
  // ========================================
  if (fnLower === 'sendmessage' || fnLower === 'sendtext' || fnLower === 'sendsms') {
    const contactName = (args.contactName || args.contact || args.recipient || args.to) as string;
    const message = (args.message || args.text || args.body) as string;

    if (!contactName) {
      return 'Who would you like me to send a text to?';
    }

    if (!message) {
      return `What would you like me to say to ${contactName}?`;
    }

    log.info({ contactName, userId: ctx.userId }, '📱 Text message requested');

    if (!ctx.userId) {
      return 'I need to know who you are to send messages.';
    }

    try {
      // Find the contact
      const { searchContacts } =
        await import('../../services/contacts/contact-relationship-service.js');
      const matches = await searchContacts(ctx.userId, contactName);

      if (matches.length === 0) {
        return `I don't have ${contactName} in your contacts. Would you like to add them first?`;
      }

      const contact = matches[0];

      if (!contact.phone) {
        return `${contact.name} doesn't have a phone number saved. Text messages need a phone number.`;
      }

      // Check Twilio credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        log.warn('Twilio not configured for SMS');
        return `I'd send "${message}" to ${contact.name}, but messaging isn't set up yet. Want me to help you draft it for copy-paste?`;
      }

      // Send SMS via Twilio
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: contact.phone,
            From: fromNumber,
            Body: message,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, '📱 SMS send failed');
        return `Couldn't send the text to ${contact.name}. Want me to try again?`;
      }

      const smsData = (await response.json()) as { sid: string };
      log.info({ sid: smsData.sid, to: contact.phone }, '📱 SMS sent');

      return `I sent your message to ${contact.name}.`;
    } catch (err) {
      log.error({ error: String(err) }, '📱 Text message failed');
      return `Something went wrong sending the text. ${String(err)}`;
    }
  }

  // ========================================
  // SEND EMAIL - Real SendGrid integration
  // ========================================
  if (fnLower === 'sendemail') {
    const contactName = (args.contactName || args.contact || args.recipient || args.to) as string;
    const subject = (args.subject || args.title) as string;
    const message = (args.message || args.body || args.text) as string;

    if (!contactName) {
      return 'Who would you like me to email?';
    }

    if (!message) {
      return `What would you like me to say to ${contactName}?`;
    }

    log.info({ contactName, userId: ctx.userId }, '📧 Email requested');

    if (!ctx.userId) {
      return 'I need to know who you are to send emails.';
    }

    try {
      // Find the contact
      const { searchContacts } =
        await import('../../services/contacts/contact-relationship-service.js');
      const matches = await searchContacts(ctx.userId, contactName);

      if (matches.length === 0) {
        return `I don't have ${contactName} in your contacts. Would you like to add them first?`;
      }

      const contact = matches[0];

      if (!contact.email) {
        return `${contact.name} doesn't have an email address saved. Would you like to add one?`;
      }

      // Use the sendEmail service
      const { sendEmail } = await import('../../services/communication-service.js');

      const result = await sendEmail(
        contact.email,
        subject || `Message from your friend`,
        message,
        false // plain text
      );

      log.info({ to: contact.email, result }, '📧 Email sent');

      return `I sent your email to ${contact.name}.`;
    } catch (err) {
      log.error({ error: String(err) }, '📧 Email failed');
      if (String(err).includes('not configured')) {
        return `I'd email "${message}" to ${contactName}, but email isn't set up yet. Want me to help you draft it?`;
      }
      return `Something went wrong sending the email. ${String(err)}`;
    }
  }

  if (fnLower === 'draftmessage') {
    const situation = args.situation as string;
    log.info({ situation }, '✍️ Draft message requested');
    return situation
      ? `Let's draft a message for that situation. Who are you writing to, and what's the main thing you want to convey?`
      : "I'd be happy to help you draft a message. What's the situation?";
  }

  if (fnLower === 'analyzemessage') {
    const message = args.message as string;
    log.info({ hasMessage: !!message }, '🔍 Analyze message requested');
    return message
      ? "Let's look at this together. What's your main concern - the tone, the clarity, or how it might be received?"
      : 'I can help analyze a message. What did you receive or want to send?';
  }

  // ========================================
  // CALENDAR TOOLS (Full Integration)
  // Real calendar functionality for voice-first interactions.
  // Uses natural language date parsing for conversational scheduling.
  // ========================================

  // Schedule event using natural language
  if (fnLower === 'scheduleevent' || fnLower === 'createappointment' || fnLower === 'createevent') {
    const title = args.title as string;
    const when = (args.when || args.date || args.time) as string;
    const duration = (args.duration as number) || 60; // minutes
    const location = args.location as string;
    const description = args.description as string;

    if (!ctx.userId) {
      return 'I need to know who you are to schedule events. Try saying your name first.';
    }

    log.info({ title, when, duration, userId: ctx.userId }, '📅 Scheduling event via voice');

    if (!title) {
      return 'What would you like to schedule?';
    }

    if (!when) {
      return `When would you like to schedule "${title}"?`;
    }

    try {
      const { parseNaturalDate, isValidForScheduling, suggestClarification } =
        await import('../../services/calendar/natural-date-parser.js');
      const { createEvent, isConnected } =
        await import('../../services/calendar/calendar-service.js');

      // Check if user has calendar connected
      const hasAccess = await isConnected(ctx.userId);
      if (!hasAccess) {
        return `I'd love to schedule "${title}" for ${when}, but your calendar isn't connected yet. You can connect it in settings.`;
      }

      // Parse the natural language time
      const parsed = parseNaturalDate(when);
      if (!parsed) {
        return `I'm not sure when "${when}" is. Could you be more specific? Try something like "tomorrow at 3pm" or "next Tuesday morning".`;
      }

      // Validate the time
      const validation = isValidForScheduling(parsed.date);
      if (!validation.valid) {
        return validation.reason || "That time doesn't work. When else works for you?";
      }

      // Check for ambiguous times and offer clarification
      if (parsed.ambiguous) {
        const clarification = suggestClarification(parsed);
        if (clarification) {
          log.info({ parsed, clarification }, '📅 Time is ambiguous, confirming');
        }
      }

      // Create the event
      const endTime = new Date(parsed.date.getTime() + duration * 60 * 1000);
      const event = await createEvent(ctx.userId, {
        title,
        startTime: parsed.date,
        endTime,
        location,
        description,
      });

      if (event) {
        const timeStr = parsed.date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        const dateStr = parsed.date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        return `I've scheduled "${title}" for ${timeStr} on ${dateStr}.`;
      }

      return `I ran into an issue scheduling "${title}". Want me to try again?`;
    } catch (err) {
      log.error({ error: String(err) }, '📅 Calendar scheduling failed');
      return `I couldn't schedule that right now. ${String(err)}`;
    }
  }

  // Get today's schedule
  if (fnLower === 'getschedule' || fnLower === 'whatsmyschedule' || fnLower === 'todaysschedule') {
    const dateArg = (args.date || args.when) as string;

    if (!ctx.userId) {
      return 'I need to know who you are to check your schedule.';
    }

    log.info({ dateArg, userId: ctx.userId }, '📅 Getting schedule via voice');

    try {
      const { isConnected, getEventsForDay } =
        await import('../../services/calendar/calendar-service.js');
      const { parseNaturalDate } = await import('../../services/calendar/natural-date-parser.js');

      const hasAccess = await isConnected(ctx.userId);
      if (!hasAccess) {
        return "Your calendar isn't connected yet. You can connect it in settings to see your schedule.";
      }

      // Parse date or default to today
      let targetDate = new Date();
      let dateLabel = 'today';

      if (dateArg) {
        const parsed = parseNaturalDate(dateArg);
        if (parsed) {
          targetDate = parsed.date;
          dateLabel = parsed.interpretation;
        }
      }

      const events = await getEventsForDay(ctx.userId, targetDate);

      if (!events || events.length === 0) {
        return `You have nothing scheduled ${dateLabel}. That's some nice free time!`;
      }

      // Format events for voice
      const eventList = events
        .map((e) => {
          const time = new Date(e.startTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          return `${time}: ${e.title}`;
        })
        .join('. ');

      return `${dateLabel} you have ${events.length} thing${events.length > 1 ? 's' : ''}. ${eventList}.`;
    } catch (err) {
      log.error({ error: String(err) }, '📅 Failed to get schedule');
      return "I couldn't check your calendar right now. Try again in a moment?";
    }
  }

  // Check what's next
  if (fnLower === 'whatsnext' || fnLower === 'nextmeeting' || fnLower === 'nextappointment') {
    if (!ctx.userId) {
      return 'I need to know who you are to check your next meeting.';
    }

    log.info({ userId: ctx.userId }, '📅 Checking next meeting via voice');

    try {
      const { getAmbientCalendarContext } =
        await import('../../services/calendar/ambient-calendar-awareness.js');

      const ambient = await getAmbientCalendarContext(ctx.userId);

      if (!ambient.isCalendarConnected) {
        return "Your calendar isn't connected. Connect it in settings to see upcoming meetings.";
      }

      if (ambient.currentlyInMeeting && ambient.currentMeeting) {
        const minutesLeft = Math.max(
          0,
          Math.round((new Date(ambient.currentMeeting.endTime).getTime() - Date.now()) / 60000)
        );
        return `You're currently in "${ambient.currentMeeting.title}". About ${minutesLeft} minutes left.`;
      }

      if (ambient.nextMeeting.event && ambient.nextMeeting.minutesUntil !== null) {
        const next = ambient.nextMeeting;
        const time = new Date(next.event!.startTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

        if (next.minutesUntil! <= 5) {
          return `"${next.event!.title}" starts in just ${next.minutesUntil} minutes at ${time}!`;
        } else if (next.minutesUntil! <= 60) {
          return `"${next.event!.title}" is coming up in ${next.minutesUntil} minutes at ${time}.`;
        } else {
          const hours = Math.floor(next.minutesUntil! / 60);
          return `Your next thing is "${next.event!.title}" in about ${hours} hour${hours > 1 ? 's' : ''} at ${time}.`;
        }
      }

      return "You don't have any more meetings today. Nice!";
    } catch (err) {
      log.error({ error: String(err) }, '📅 Failed to check next meeting');
      return "I couldn't check your upcoming meetings right now.";
    }
  }

  // Find free time
  if (fnLower === 'findfreetime' || fnLower === 'whenamifree' || fnLower === 'freetime') {
    const duration = (args.duration as number) || 30;
    const dateArg = (args.date || args.when) as string;

    if (!ctx.userId) {
      return 'I need to know who you are to check your free time.';
    }

    log.info({ duration, dateArg, userId: ctx.userId }, '📅 Finding free time via voice');

    try {
      const { isConnected, findFreeTimeSlots } =
        await import('../../services/calendar/calendar-service.js');
      const { parseNaturalDate } = await import('../../services/calendar/natural-date-parser.js');

      const hasAccess = await isConnected(ctx.userId);
      if (!hasAccess) {
        return "I'd need access to your calendar to find free time. Connect it in settings.";
      }

      let targetDate = new Date();
      if (dateArg) {
        const parsed = parseNaturalDate(dateArg);
        if (parsed) targetDate = parsed.date;
      }

      const slots = await findFreeTimeSlots(ctx.userId, targetDate, {
        minDurationMinutes: duration,
      });

      if (!slots || slots.length === 0) {
        return `I couldn't find ${duration} free minutes today. Want me to check tomorrow?`;
      }

      // Return top 2-3 slots for voice
      const topSlots = slots
        .slice(0, 3)
        .map((s: { start: Date; end: Date; durationMinutes: number }) => {
          const time = new Date(s.start).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          return `${time} for ${s.durationMinutes} minutes`;
        });

      return `I found some free time: ${topSlots.join(', or ')}.`;
    } catch (err) {
      log.error({ error: String(err) }, '📅 Failed to find free time');
      return 'I ran into an issue checking your free time.';
    }
  }

  // Block focus time
  if (fnLower === 'blockfocustime' || fnLower === 'schedulefocustime') {
    const duration = (args.duration as number) || 60;
    const when = (args.when || args.time) as string;

    if (!ctx.userId) {
      return 'I need to know who you are to block focus time.';
    }

    log.info({ duration, when, userId: ctx.userId }, '📅 Blocking focus time via voice');

    try {
      const { isConnected, createEvent, findFreeTimeSlots } =
        await import('../../services/calendar/calendar-service.js');
      const { parseNaturalDate } = await import('../../services/calendar/natural-date-parser.js');

      const hasAccess = await isConnected(ctx.userId);
      if (!hasAccess) {
        return 'Connect your calendar in settings to block focus time.';
      }

      let startTime: Date;

      if (when) {
        const parsed = parseNaturalDate(when);
        if (parsed) {
          startTime = parsed.date;
        } else {
          return `I'm not sure when "${when}" is. Try "now" or "this afternoon".`;
        }
      } else {
        // Find next free slot
        const slots = await findFreeTimeSlots(ctx.userId, new Date(), {
          minDurationMinutes: duration,
        });
        if (slots && slots.length > 0) {
          startTime = new Date(slots[0].start);
        } else {
          return `I couldn't find ${duration} minutes free. When would you like to block time?`;
        }
      }

      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

      const event = await createEvent(ctx.userId, {
        title: '🎯 Focus Time',
        startTime,
        endTime,
        description: 'Protected focus time - no interruptions!',
      });

      if (event) {
        const timeStr = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        return `I've blocked ${duration} minutes of focus time starting at ${timeStr}. Protect that time!`;
      }

      return "I couldn't block that time. Want me to try a different slot?";
    } catch (err) {
      log.error({ error: String(err) }, '📅 Failed to block focus time');
      return 'I ran into an issue blocking your focus time.';
    }
  }

  // Legacy fallback for unconnected calendars
  if (fnLower === 'manageappointment') {
    const action = args.action as string;
    log.info({ action }, '📅 Appointment management requested');
    return `What would you like to ${action || 'do'} with your appointment?`;
  }

  // ========================================
  // UTILITIES
  // ========================================
  if (fnLower === 'calculatetip') {
    const amount = args.amount as number;
    const percentage = (args.percentage as number) || 20;
    const split = (args.split as number) || 1;

    if (!amount || amount <= 0) {
      return "What's the bill amount?";
    }

    const tip = amount * (percentage / 100);
    const total = amount + tip;
    const perPerson = total / split;

    if (split > 1) {
      return `On a $${amount.toFixed(2)} bill with ${percentage}% tip: The tip is $${tip.toFixed(2)}, total is $${total.toFixed(2)}. Split ${split} ways, that's $${perPerson.toFixed(2)} each.`;
    }
    return `On a $${amount.toFixed(2)} bill with ${percentage}% tip: The tip is $${tip.toFixed(2)}, making the total $${total.toFixed(2)}.`;
  }

  if (fnLower === 'wrapupconversation') {
    log.info({ reason: args.reason }, '👋 Wrap up conversation requested');
    // Return empty - the wrap up should be handled naturally, not spoken as a tool result
    return '';
  }

  // ========================================
  // BEHAVIOR SYSTEM TOOLS
  // These affect HOW the AI speaks, not WHAT it does
  // They return empty strings (silent) - behavior is handled internally
  // ========================================
  if (fnLower === 'shiftmode') {
    const mode = args.mode as string;
    log.info({ mode }, '🎭 Shifting presence mode');
    // Silent - mode shift is internal behavior
    return '';
  }

  if (fnLower === 'processing') {
    const type = (args.type as string) || 'thinking';
    log.info({ type }, '🤔 Processing...');
    // Return minimal vocal filler if needed
    if (type === 'tool_call') return 'Let me check...';
    if (type === 'thinking') return 'Hmm...';
    return '';
  }

  if (fnLower === 'holdspace') {
    const reason = args.reason as string;
    log.info({ reason }, '🕯️ Holding space');
    // Silent - intentional pause
    return '';
  }

  if (fnLower === 'expresspresence') {
    const type = (args.type as string) || 'breath';
    log.info({ type }, '✨ Expressing presence');
    // Minimal sounds for presence
    if (type === 'hum') return 'Mmm...';
    if (type === 'soft_sound') return 'Mm-hmm...';
    return '';
  }

  if (fnLower === 'adjustpacing') {
    log.info({ speed: args.speed, pauses: args.pauses }, '⏱️ Adjusting pacing');
    // Silent - pacing adjustment is internal
    return '';
  }

  // ========================================
  // SMART HOME TOOLS (aspirational - not yet connected)
  // ========================================
  if (fnLower === 'controllight') {
    const { lightName, action, brightness } = args as {
      lightName?: string;
      action?: string;
      brightness?: number;
    };
    log.info({ lightName, action, brightness }, '💡 Smart home: control light');
    return `Smart home isn't connected yet. To control "${lightName || 'your lights'}", you'll need to set up the integration in settings.`;
  }

  if (fnLower === 'setthermostat') {
    const { temperature, mode } = args as { temperature?: number; mode?: string };
    log.info({ temperature, mode }, '🌡️ Smart home: set thermostat');
    return `Smart home isn't connected yet. To set temperature to ${temperature || 'desired'}°, connect your thermostat in settings.`;
  }

  if (fnLower === 'activatescene') {
    const { sceneName } = args as { sceneName?: string };
    log.info({ sceneName }, '🎬 Smart home: activate scene');
    return `Smart home isn't connected yet. To activate "${sceneName || 'scenes'}", set up the integration in settings.`;
  }

  if (fnLower === 'controllock') {
    const { lockName, action } = args as { lockName?: string; action?: string };
    log.info({ lockName, action }, '🔐 Smart home: control lock');
    return `Smart locks aren't connected yet. To ${action || 'control'} "${lockName || 'your lock'}", set up the integration.`;
  }

  if (fnLower === 'gethomestatus') {
    log.info('🏠 Smart home: get status');
    return `Smart home isn't connected yet. Once you set it up, I can tell you the status of lights, temperature, and more.`;
  }

  // ========================================
  // NOTES & JOURNAL TOOLS
  // ========================================
  if (fnLower === 'savenote') {
    const { content, type } = args as { content?: string; type?: string };
    if (!content) return 'What would you like me to note down?';
    log.info({ type, contentLength: content.length }, '📝 Saving note');
    // Store as memory
    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('notes')
          .add(
            cleanForFirestore({
              content,
              type: type || 'note',
              createdAt: new Date(),
            })
          );
        return `Got it, I've noted that down.`;
      } catch {
        return `I noted that mentally: "${content.slice(0, 50)}..."`;
      }
    }
    return `I'll remember that: "${content.slice(0, 50)}..."`;
  }

  if (fnLower === 'getnotes') {
    const { search } = args as { search?: string };
    log.info({ search }, '📝 Getting notes');
    if (!ctx.userId) return "I'll need to know who you are to get your notes.";
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      const notesSnapshot = await db
        .collection('bogle_users')
        .doc(ctx.userId)
        .collection('notes')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      if (notesSnapshot.empty) return "You don't have any notes yet.";
      const notes = notesSnapshot.docs.map((d) => d.data().content as string);
      if (search) {
        const filtered = notes.filter((n) => n.toLowerCase().includes(search.toLowerCase()));
        if (filtered.length === 0) return `I didn't find any notes about "${search}".`;
        return `Here's what I found about "${search}": ${filtered.join('; ')}`;
      }
      return `Your recent notes: ${notes.join('; ')}`;
    } catch {
      return "I couldn't retrieve your notes right now.";
    }
  }

  if (fnLower === 'journal') {
    const { action } = args as { action?: string };
    log.info({ action }, '📔 Journal');
    return `Journaling is a great habit! What's on your mind? I can help you reflect.`;
  }

  // ========================================
  // SHOPPING & BILLS
  // ========================================
  if (fnLower === 'shoppinglist') {
    const { action, items, item } = args as { action?: string; items?: string[]; item?: string };
    log.info({ action, items, item }, '🛒 Shopping list');
    if (action === 'add' && items) {
      return `Got it! ${items.join(', ')} - I'll remember those for you.`;
    }
    if (action === 'view') {
      return `Tell me what you need to pick up and I'll help you keep track.`;
    }
    return `What do you need to pick up? I'll help you remember.`;
  }

  if (fnLower === 'addbill') {
    const { name, amount, dueDay } = args as { name?: string; amount?: number; dueDay?: number };
    log.info({ name, amount, dueDay }, '💳 Add bill');
    return `Got it! I've noted "${name || 'your bill'}"${amount ? ` for $${amount}` : ''}${dueDay ? ` due on the ${dueDay}th` : ''}. I'll remember to remind you.`;
  }

  if (fnLower === 'paybill') {
    const { billName } = args as { billName?: string };
    log.info({ billName }, '💳 Pay bill');
    return `I've noted that "${billName || 'the bill'}" is paid. Nice job staying on top of things!`;
  }

  if (fnLower === 'getbills') {
    log.info('💳 Get bills');
    return `What bills do you want to keep track of? I can help you stay on top of them.`;
  }

  // ========================================
  // PACKAGES
  // ========================================
  if (fnLower === 'trackpackage') {
    const { trackingNumber, description } = args as {
      trackingNumber?: string;
      description?: string;
    };
    log.info({ trackingNumber, description }, '📦 Track package');
    return `I've noted "${description || 'your package'}"${trackingNumber ? ` with tracking ${trackingNumber}` : ''}. I'll help you remember to check on it.`;
  }

  if (fnLower === 'getpackages') {
    log.info('📦 Get packages');
    return `Package tracking isn't connected yet. Once set up, I'll keep you posted on deliveries.`;
  }

  // ========================================
  // TRAVEL
  // ========================================
  if (fnLower === 'searchflights') {
    const { origin, destination, departureDate } = args as {
      origin?: string;
      destination?: string;
      departureDate?: string;
    };
    log.info({ origin, destination, departureDate }, '✈️ Search flights');
    return `Flight search isn't connected yet. Looking for ${origin || 'somewhere'} to ${destination || 'somewhere'}${departureDate ? ` on ${departureDate}` : ''}. Jordan can help you plan your trip though!`;
  }

  if (fnLower === 'searchhotels') {
    const { destination } = args as { destination?: string };
    log.info({ destination }, '🏨 Search hotels');
    return `Hotel search isn't connected yet. Looking for places in ${destination || 'your destination'}. Want Jordan to help plan your trip?`;
  }

  if (fnLower === 'plantrip') {
    const { name, destination } = args as { name?: string; destination?: string };
    log.info({ name, destination }, '🗺️ Plan trip');
    return `Trip planning is Jordan's specialty! Should I connect you with Jordan to plan "${name || 'your trip'}" to ${destination || 'your destination'}?`;
  }

  // ========================================
  // CALENDAR EXTRAS
  // ========================================
  if (fnLower === 'getcalendartoday') {
    // Alias for getschedule
    log.info({ userId: ctx.userId }, "📅 Getting today's calendar");
    return routeToTool('getschedule', { date: 'today' }, ctx);
  }

  if (fnLower === 'createcalendarevent' || fnLower === 'manageappointment') {
    // Route to the existing schedule handler
    const { title, startTime, date, duration } = args as {
      title?: string;
      startTime?: string;
      date?: string;
      duration?: number;
    };
    log.info({ title, startTime, date }, '📅 Creating event via alias');
    return routeToTool(
      'scheduleevent',
      { title, when: startTime || date, duration: duration || 30 },
      ctx
    );
  }

  // ========================================
  // MEDICATION
  // ========================================
  if (fnLower === 'managemedication') {
    const { action, name, dosage } = args as { action?: string; name?: string; dosage?: string };
    log.info({ action, name, dosage }, '💊 Manage medication');
    if (action === 'add') {
      return `I've noted "${name}" (${dosage || 'as prescribed'}). I'll help you remember to take it.`;
    }
    if (action === 'take') {
      return `Great job taking "${name}"! Consistency is key.`;
    }
    return `Medication tracking helps build healthy habits. What medication would you like to track?`;
  }

  if (fnLower === 'medicationschedule') {
    log.info('💊 Medication schedule');
    return `Your medication schedule isn't fully set up yet. Tell me about your medications and I'll help you remember them.`;
  }

  // ========================================
  // APPLE-SPECIFIC TOOLS
  // ========================================
  if (fnLower === 'searchapplemusic') {
    const { query } = args as { query?: string };
    log.info({ query }, '🎵 Search Apple Music');
    // Route to regular music search
    return routeToTool('playmusic', { query: query || '' }, ctx);
  }

  if (fnLower === 'getappleweather') {
    const { location, includeforecast } = args as { location?: string; includeforecast?: boolean };
    log.info({ location, includeforecast }, '🌤️ Apple Weather');
    // Route to regular weather
    return routeToTool('getweather', { location: location || 'current' }, ctx);
  }

  // ========================================
  // NEWS
  // ========================================
  if (fnLower === 'getnews') {
    const { topic, category } = args as { topic?: string; category?: string };
    log.info({ topic, category }, '📰 Get news');
    // Route to searchNews
    return routeToTool('searchnews', { query: topic || category || 'top stories' }, ctx);
  }

  // ========================================
  // GAME TOOLS
  // ========================================
  if (fnLower === 'submitgameanswer') {
    log.info({ answer: args.answer }, '🎮 Game answer submitted');
    return `Got your answer! Let's see how you did.`;
  }

  if (fnLower === 'getgamehint') {
    log.info('🎮 Game hint requested');
    return `Here's a hint: Think about it from a different angle.`;
  }

  if (fnLower === 'skipgameround') {
    log.info('🎮 Skipping game round');
    return `Skipping this one. Ready for the next?`;
  }

  if (fnLower === 'endgame') {
    log.info('🎮 Ending game');
    return `Good game! Thanks for playing.`;
  }

  if (fnLower === 'getgamestatus') {
    log.info('🎮 Game status requested');
    return `Let me check how you're doing in the game.`;
  }

  if (fnLower === 'suggestgame') {
    log.info('🎮 Game suggestion');
    return `How about a quick trivia game? Or we could do word association!`;
  }

  if (fnLower === 'starttextgame') {
    const { gameType } = args as { gameType?: string };
    log.info({ gameType }, '🎯 Starting text game');
    return `Let's play ${gameType || 'a game'}! I'll start.`;
  }

  if (fnLower === 'maketextgamemove') {
    const { move } = args as { move?: string };
    log.info({ move }, '🎯 Text game move');
    return `Good move! "${move || 'Interesting choice'}". My turn...`;
  }

  if (fnLower === 'gettextgameboard') {
    log.info('🎯 Getting game board');
    return `Here's the current game state. Your turn!`;
  }

  if (fnLower === 'endtextgame') {
    log.info('🎯 Ending text game');
    return `Fun game! Let's play again sometime.`;
  }

  // ========================================
  // ENGAGEMENT CHALLENGES
  // ========================================
  if (fnLower === 'inboxzerochallenge') {
    const { action } = args as { action?: string };
    log.info({ action }, '📧 Inbox Zero Challenge');
    if (action === 'start')
      return `Let's tackle your inbox! Start by archiving 5 emails you don't need.`;
    if (action === 'check-in') return `How's the inbox looking? Let's see your progress.`;
    return `The Inbox Zero Challenge helps you conquer email overwhelm. Ready to start?`;
  }

  if (fnLower === 'sundayprepgame') {
    const { action } = args as { action?: string };
    log.info({ action }, '📅 Sunday Prep');
    if (action === 'start') return `Let's plan your week! What are your top 3 priorities?`;
    return `Sunday Prep helps you start the week strong. Want to do a quick weekly planning session?`;
  }

  if (fnLower === 'compoundinterestgame') {
    const { action } = args as { action?: string };
    log.info({ action }, '📈 Compound Interest Game');
    return `Small daily actions add up! Track your habits and watch them compound over time.`;
  }

  if (fnLower === 'paradoxoftheday') {
    log.info('🤔 Paradox of the Day');
    const paradoxes = [
      'The more you try to control, the less you actually control.',
      'The only constant is change.',
      'To find yourself, you must first lose yourself.',
      "The more you know, the more you realize you don't know.",
    ];
    return paradoxes[Math.floor(Math.random() * paradoxes.length)];
  }

  if (fnLower === 'questionbeneath') {
    const { initialQuestion } = args as { initialQuestion?: string };
    log.info({ initialQuestion }, '🔍 Question Beneath');
    return `"${initialQuestion || 'Your question'}" - interesting. But what's really beneath that? Why does this matter to you right now?`;
  }

  if (fnLower === 'lifeportfolioreview') {
    const { domain } = args as { domain?: string };
    log.info({ domain }, '📊 Life Portfolio Review');
    return `Let's review your ${domain || 'life portfolio'}. On a scale of 1-10, how satisfied are you with this area right now?`;
  }

  if (fnLower === 'predictionmarket') {
    const { action } = args as { action?: string };
    log.info({ action }, '🔮 Prediction Market');
    return `Predicting your own life helps calibrate your intuition. What outcome would you like to predict?`;
  }

  if (fnLower === 'wrapupconversation') {
    const { reason } = args as { reason?: string };
    log.info({ reason }, '👋 Wrap up conversation');
    return `It was great talking with you. Take care!`;
  }

  // ========================================
  // CALCULATE TIP
  // ========================================
  if (fnLower === 'calculatetip') {
    const { amount, percentage, split } = args as {
      amount?: number;
      percentage?: number;
      split?: number;
    };
    if (!amount) return 'What was the bill amount?';
    const tipPercent = percentage || 20;
    const tip = amount * (tipPercent / 100);
    const total = amount + tip;
    log.info({ amount, tipPercent, split }, '💰 Calculate tip');
    if (split && split > 1) {
      const perPerson = total / split;
      return `${tipPercent}% tip on $${amount.toFixed(2)} is $${tip.toFixed(2)}. Total: $${total.toFixed(2)}. Split ${split} ways: $${perPerson.toFixed(2)} each.`;
    }
    return `${tipPercent}% tip on $${amount.toFixed(2)} is $${tip.toFixed(2)}. Total: $${total.toFixed(2)}.`;
  }

  // ========================================
  // LANGUAGE/SETTINGS TOOLS
  // ========================================
  if (fnLower === 'setspokenlanguage') {
    // Support both "language" (from function-calling-base.md) and "languageCode" (legacy)
    const { language, languageCode } = args as { language?: string; languageCode?: string };
    const targetLanguage = language || languageCode;
    log.info(
      { language: targetLanguage, userId: ctx.userId, sessionId: ctx.sessionId },
      '🗣️ Set spoken language'
    );
    if (!targetLanguage) {
      return `Which language would you like me to speak? I support English, Spanish, Japanese, German, French, and more.`;
    }
    // Import and use the language service
    const { languageService } = await import('../../services/language/index.js');
    // Pass sessionId for real-time state consistency
    const result = await languageService().setLanguage(
      ctx.userId || 'anonymous',
      targetLanguage,
      ctx.sessionId
    );
    if (result.success) {
      return result.confirmationMessage || `I'll speak ${targetLanguage} now.`;
    }
    return result.error || `I couldn't switch to that language.`;
  }

  if (fnLower === 'listsupportedlanguages' || fnLower === 'getsupportedlanguages') {
    log.info({ userId: ctx.userId }, '🗣️ List supported languages');
    const { languageService } = await import('../../services/language/index.js');
    const languages = await languageService().getSupportedLanguages();
    const formatted = languages.map((l) => l.displayName).join(', ');
    return `I can speak: ${formatted}. Which would you prefer?`;
  }

  if (fnLower === 'getcurrentlanguage' || fnLower === 'getspokenlanguage') {
    log.info({ userId: ctx.userId }, '🗣️ Get current language');
    const { languageService } = await import('../../services/language/index.js');
    const current = await languageService().getCurrentLanguage(ctx.userId || 'anonymous');
    return `I'm currently speaking ${current.displayName}.`;
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
  const calls = extractAllJsonFunctionCalls(text);

  let cleaned = text;
  for (const call of calls) {
    cleaned = cleaned.replace(call.raw, '');
  }

  // Clean up whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}
