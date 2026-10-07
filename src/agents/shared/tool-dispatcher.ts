/**
 * Neutral tool dispatcher used by text chat and other non-voice callers.
 *
 * Voice pipelines with native function calling execute tools through the
 * model SDK. This module is the shared runtime for an already-chosen tool.
 *
 * @module agents/shared/tool-dispatcher
 */

import { executeWithReliability } from '../../services/performance/tool-execution-reliability.js';
import {
  cacheToolResult,
  checkToolCache,
  invalidateToolCache,
} from '../../services/performance/tool-response-cache.js';
import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import {
  executeWithParallelFallback,
  isCriticalTool,
  type ToolResult as ParallelToolResult,
} from './parallel-tool-executor.js';
import {
  completeToolInFlight,
  registerToolInFlight,
} from '../../intelligence/context-builders/awareness/system-state-awareness.js';
import { getConversationState } from '../../services/conversation-state.js';
import { isServiceHealthyFast } from '../../services/self-healing/index.js';
import { isMetaToolCall, unwrapMetaToolCall } from './meta-tool.js';
import {
  notifyToolFailed,
  notifyToolStarted,
  notifyToolSucceeded,
} from './tool-dispatcher-effects.js';

const log = createLogger({ module: 'tool-dispatcher' });

const TOOL_SERVICE_MAP: Record<string, string> = {
  playMusic: 'spotify',
  searchMusic: 'spotify',
  pauseMusic: 'spotify',
  resumeMusic: 'spotify',
  skipTrack: 'spotify',
  setVolume: 'spotify',
  getQueue: 'spotify',
  shufflePlayback: 'spotify',
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

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  fn: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
  speakDirectly?: boolean;
}

export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  publisherId?: string;
  onToolStart?: (fn: string, args: Record<string, unknown>) => void;
  onToolComplete?: (result: ToolExecutionResult) => void;
  onHandoff?: (target: string, reason: string) => Promise<void>;
  inputText?: string;
  semanticPrediction?: {
    toolId: string;
    confidence: number;
  };
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
}

function getRequiredServiceForTool(toolName: string): string | null {
  if (toolName in TOOL_SERVICE_MAP) {
    return TOOL_SERVICE_MAP[toolName];
  }
  const lowered = toolName.toLowerCase();
  if (
    lowered.includes('music') ||
    lowered.includes('song') ||
    lowered.includes('playlist') ||
    lowered.includes('track')
  ) {
    return 'spotify';
  }
  if (
    lowered.includes('save') ||
    lowered.includes('store') ||
    lowered.includes('remember') ||
    (lowered.startsWith('get') &&
      (lowered.includes('note') || lowered.includes('memory') || lowered.includes('habit')))
  ) {
    return 'firestore';
  }
  return null;
}

function getFallbackResponse(fn: string): string | undefined {
  const fnLower = fn.toLowerCase();
  if (fnLower === 'getweather') {
    return "I couldn't get the current weather right now. Try again in a moment?";
  }
  if (fnLower === 'getnews' || fnLower === 'searchnews') {
    return "I'm having trouble fetching news right now. Let me try again shortly.";
  }
  if (fnLower === 'getmarketsummary' || fnLower === 'getquote') {
    return "Market data isn't available at the moment. I'll try again soon.";
  }
  if (fnLower === 'getcalendartoday' || fnLower === 'getschedule') {
    return "I couldn't access your calendar right now. Want me to try again?";
  }
  if (fnLower === 'getcurrenttime') {
    return `The current time is ${new Date().toLocaleTimeString()}.`;
  }
  return undefined;
}

function clearInFlight(sessionId: string, fn: string): void {
  completeToolInFlight(sessionId, fn);
  try {
    getConversationState(sessionId).endToolExecution();
  } catch {
    // Conversation state may not exist yet
  }
}

async function routeToTool(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown> {
  const fnLower = fn.toLowerCase();

  if (fnLower === 'speak' || fnLower === 'dynamicresponse' || fnLower === 'say') {
    const text = args.text;
    if (typeof text === 'string' && text.trim()) {
      return { __speakDirectly: true, text: text.trim() };
    }
    return null;
  }

  if (fnLower === '__conversation__' || fnLower === 'conversation') {
    return null;
  }

  const { routeToToolModular } = await import('./tool-executors/index.js');
  const modularResult = await routeToToolModular(fn, args, ctx);
  if (modularResult !== null) {
    return modularResult;
  }

  const { executeLegacyFallback } = await import('./tool-executors/legacy-fallback-executor.js');
  const legacyResult = await executeLegacyFallback(fn, args, ctx);
  if (legacyResult !== null) {
    return legacyResult;
  }

  log.warn({ fn, args, userId: ctx.userId, personaId: ctx.personaId }, 'Unknown tool — no route');
  return "I'm not able to do that specific action right now, but I'm happy to help in another way.";
}

/**
 * Execute a named tool with arguments. Callers already chose the tool;
 * this does not parse JSON from model text.
 */
export async function executeTool(
  call: ToolCall,
  ctx: ToolExecutionContext = {}
): Promise<ToolExecutionResult> {
  let { name: fn, args } = call;
  const startTime = Date.now();
  const sessionId = ctx.sessionId || 'unknown';

  if (isMetaToolCall(fn)) {
    const unwrapped = unwrapMetaToolCall(args);
    if (!unwrapped) {
      return {
        success: false,
        fn,
        args,
        result: 'Invalid meta-tool call: missing toolName or invalid args',
        error: 'Invalid meta-tool call format',
        durationMs: Date.now() - startTime,
      };
    }
    fn = unwrapped.toolName;
    args = unwrapped.toolArgs;
  }

  log.info(
    { fn, args: truncateForLog(JSON.stringify(args), 200), sessionId, userId: ctx.userId },
    `Tool start: ${fn}`
  );
  ctx.onToolStart?.(fn, args);
  notifyToolStarted(sessionId, fn, args, ctx);

  if (sessionId !== 'unknown') {
    registerToolInFlight(sessionId, fn);
    try {
      getConversationState(sessionId).startToolExecution(fn);
    } catch {
      // Conversation state may not exist yet
    }
  }

  if (ctx.sessionId) {
    const cached = checkToolCache(ctx.sessionId, fn, args);
    if (cached.hit) {
      const executionResult: ToolExecutionResult = {
        success: true,
        fn,
        args,
        result: cached.result,
        durationMs: Date.now() - startTime,
      };
      clearInFlight(ctx.sessionId, fn);
      ctx.onToolComplete?.(executionResult);
      return executionResult;
    }
  }

  const requiredService = getRequiredServiceForTool(fn);
  if (requiredService && !isServiceHealthyFast(requiredService)) {
    const executionResult: ToolExecutionResult = {
      success: false,
      fn,
      args,
      result: getFallbackResponse(fn),
      durationMs: Date.now() - startTime,
      error: `Service '${requiredService}' is unavailable`,
    };
    if (sessionId !== 'unknown') {
      clearInFlight(sessionId, fn);
    }
    ctx.onToolComplete?.(executionResult);
    return executionResult;
  }

  try {
    let result: unknown;
    let retries = 0;
    let fromFallback = false;

    if (isCriticalTool(fn)) {
      const parallelResult = await executeWithParallelFallback(
        fn,
        args,
        async (toolArgs): Promise<ParallelToolResult> => {
          try {
            return { success: true, data: await routeToTool(fn, toolArgs, ctx) };
          } catch (err) {
            return { success: false, error: String(err) };
          }
        },
        { maxParallel: 2, timeoutMs: 5000, verbose: true }
      );
      if (parallelResult.success) {
        result = parallelResult.data;
      } else {
        fromFallback = true;
        result = getFallbackResponse(fn);
      }
    } else {
      const reliabilityResult = await executeWithReliability(
        fn,
        async () => routeToTool(fn, args, ctx),
        { fallbackValue: getFallbackResponse(fn) }
      );
      result = reliabilityResult.result;
      retries = reliabilityResult.retries;
      fromFallback = reliabilityResult.fromFallback;
    }

    const speakDirectlyResult = result as { __speakDirectly?: boolean; text?: string } | null;
    const isSpeakDirectly =
      !!speakDirectlyResult &&
      typeof speakDirectlyResult === 'object' &&
      speakDirectlyResult.__speakDirectly === true &&
      typeof speakDirectlyResult.text === 'string';

    const executionResult: ToolExecutionResult = {
      success: true,
      fn,
      args,
      result: isSpeakDirectly ? speakDirectlyResult.text : result,
      durationMs: Date.now() - startTime,
      speakDirectly: isSpeakDirectly || undefined,
    };

    if (ctx.sessionId && !fromFallback) {
      cacheToolResult(ctx.sessionId, fn, args, result);
      invalidateToolCache(ctx.sessionId, fn);
    }

    log.info(
      { fn, durationMs: executionResult.durationMs, sessionId, retries, fromFallback },
      `Tool completed: ${fn}`
    );
    notifyToolSucceeded({ sessionId, fn, args, result, durationMs: executionResult.durationMs, ctx });
    if (sessionId !== 'unknown') {
      clearInFlight(sessionId, fn);
    }
    ctx.onToolComplete?.(executionResult);
    return executionResult;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const executionResult: ToolExecutionResult = {
      success: false,
      fn,
      args,
      error: String(err),
      durationMs,
    };
    log.error({ fn, error: String(err), durationMs, sessionId }, `Tool failed: ${fn}`);
    notifyToolFailed({ sessionId, fn, args, error: err, durationMs, ctx });
    if (sessionId !== 'unknown') {
      clearInFlight(sessionId, fn);
    }
    ctx.onToolComplete?.(executionResult);
    return executionResult;
  }
}
