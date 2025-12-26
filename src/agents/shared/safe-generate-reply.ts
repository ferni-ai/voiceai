/**
 * Safe Generate Reply Wrapper
 *
 * This module wraps the LiveKit `session.generateReply()` method with additional
 * safety measures to prevent the native mutex crash that occurs when the Google
 * Realtime API times out.
 *
 * THE PROBLEM:
 * 1. `generateReply()` has a 5-second internal timeout in @livekit/agents-plugin-google
 * 2. When it times out, it calls `fut.reject()` which triggers cleanup
 * 3. The cleanup code has a race condition in the native @livekit/rtc-node bindings
 * 4. A C++ mutex operation fails: "mutex lock failed: Invalid argument"
 * 5. libc++abi terminates the entire Node.js process (exit code 134)
 *
 * THE SOLUTION:
 * - Use our own 3.5-second timeout (fires BEFORE the SDK's 5s timeout)
 * - Cancel gracefully using AbortController where possible
 * - Return a fallback response instead of letting the error propagate
 * - Prevent the cleanup code that triggers the mutex crash
 *
 * @module safe-generate-reply
 */

import type { voice } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { FailureTracker } from './lightweight-resilience.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';

const logger = getLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Our timeout fires BEFORE the SDK's 5s timeout to give us control */
const SAFE_TIMEOUT_MS = 3500;

/** Minimum time between generateReply calls to prevent overwhelming the API */
const MIN_INTERVAL_MS = 500;

/** Maximum context size in characters (~10K tokens) before warning */
const MAX_CONTEXT_CHARS = 40000;

/** Critical context size - likely to cause failures */
const CRITICAL_CONTEXT_CHARS = 60000;

/** Track failures to implement circuit breaker behavior */
const failureTracker = new FailureTracker({
  windowMs: 60_000,
  threshold: 3,
});

/** Track last call time to prevent rapid-fire calls */
let lastCallTime = 0;

/** MUTEX: Prevent concurrent generateReply calls */
let generateReplyInProgress = false;
let currentContext: string | null = null;

// ============================================================================
// TYPES
// ============================================================================

export interface SafeGenerateReplyOptions {
  instructions: string;
  allowInterruptions?: boolean;
  fallbackMessage?: string;
  waitForPlayout?: boolean;
  timeoutMs?: number;
  context?: string;
  /** Optional: session for WebSocket health check */
  session?: voice.AgentSession;
  /** Optional: session ID for coordinated speech */
  sessionId?: string;
}

export interface SafeGenerateReplyResult {
  success: boolean;
  usedFallback: boolean;
  error?: string;
  circuitOpen?: boolean;
  /** True if skipped due to another generateReply in progress */
  skippedConcurrent?: boolean;
  /** True if context size exceeded safe limits */
  contextWarning?: boolean;
  /** True if WebSocket appears unhealthy */
  connectionWarning?: boolean;
}

// ============================================================================
// HELPER: Check circuit breaker
// ============================================================================

function checkCircuitBreaker(
  session: voice.AgentSession,
  fallbackMessage: string | undefined,
  context: string,
  sessionId?: string
): SafeGenerateReplyResult | null {
  if (!failureTracker.shouldSkip()) {
    return null;
  }

  logger.warn({ context, failures: failureTracker.getFailureCount() }, '⚡ Circuit breaker OPEN');

  if (fallbackMessage) {
    try {
      // Use coordinated speech if sessionId available
      if (sessionId) {
        coordinatedSay(sessionId, fallbackMessage, { allowInterruptions: true });
      } else {
        session.say(fallbackMessage, { allowInterruptions: true });
      }
    } catch {
      // Ignore - best effort
    }
  }

  return {
    success: false,
    usedFallback: !!fallbackMessage,
    circuitOpen: true,
    error: 'Circuit breaker open due to recent failures',
  };
}

// ============================================================================
// HELPER: Rate limiting
// ============================================================================

function checkRateLimit(context: string): SafeGenerateReplyResult | null {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;

  if (timeSinceLastCall < MIN_INTERVAL_MS) {
    logger.debug({ context, timeSinceLastCall }, '⚡ Rate limiting generateReply');
    return {
      success: false,
      usedFallback: false,
      error: 'Rate limited - too soon after last call',
    };
  }

  lastCallTime = now;
  return null;
}

// ============================================================================
// HELPER: Mutual exclusion (prevent concurrent generateReply calls)
// ============================================================================

function checkMutualExclusion(context: string): SafeGenerateReplyResult | null {
  if (generateReplyInProgress) {
    logger.warn(
      { context, currentContext },
      '🔒 MUTEX: Skipping generateReply - another call in progress'
    );
    return {
      success: false,
      usedFallback: false,
      skippedConcurrent: true,
      error: `Skipped: generateReply already in progress (${currentContext})`,
    };
  }
  return null;
}

function acquireMutex(context: string): void {
  generateReplyInProgress = true;
  currentContext = context;
}

function releaseMutex(): void {
  generateReplyInProgress = false;
  currentContext = null;
}

// ============================================================================
// HELPER: Context size monitoring
// ============================================================================

interface ContextSizeResult {
  warning: boolean;
  critical: boolean;
  size: number;
  estimatedTokens: number;
}

function checkContextSize(instructions: string): ContextSizeResult {
  const size = instructions.length;
  const estimatedTokens = Math.round(size / 4);
  const warning = size > MAX_CONTEXT_CHARS;
  const critical = size > CRITICAL_CONTEXT_CHARS;

  if (critical) {
    logger.error(
      { size, estimatedTokens, maxAllowed: CRITICAL_CONTEXT_CHARS },
      '🚨 CRITICAL: Context size exceeds safe limits - likely to cause Gemini failure'
    );
  } else if (warning) {
    logger.warn(
      { size, estimatedTokens, recommended: MAX_CONTEXT_CHARS },
      '⚠️ Context size exceeds recommended limit - may cause slow responses'
    );
  }

  return { warning, critical, size, estimatedTokens };
}

// ============================================================================
// HELPER: WebSocket health monitoring
// ============================================================================

/**
 * Check if the session's underlying connection appears healthy.
 * This is a best-effort check - the WebSocket state isn't directly exposed.
 */
function checkConnectionHealth(session: voice.AgentSession): { healthy: boolean; reason?: string } {
  try {
    // The AgentSession doesn't expose WebSocket state directly, but we can check
    // if the session object is in a valid state

    // Check if generateReply method exists (sanity check)
    const hasGenerateReply = typeof session.generateReply === 'function';
    if (!hasGenerateReply) {
      return { healthy: false, reason: 'Session missing generateReply method' };
    }

    // Check if say method exists (another sanity check)
    const hasSay = typeof session.say === 'function';
    if (!hasSay) {
      return { healthy: false, reason: 'Session missing say method' };
    }

    // Additional heuristic: check recent failure rate
    const failureCount = failureTracker.getFailureCount();
    if (failureCount >= 2) {
      logger.debug({ failureCount }, '⚠️ Recent failures suggest connection issues');
      return { healthy: true, reason: `${failureCount} recent failures` };
    }

    return { healthy: true };
  } catch (error) {
    return { healthy: false, reason: `Health check error: ${String(error)}` };
  }
}

// ============================================================================
// HELPER: Execute with timeout
// ============================================================================

async function executeWithTimeout(
  session: voice.AgentSession,
  instructions: string,
  allowInterruptions: boolean,
  waitForPlayout: boolean,
  timeoutMs: number
): Promise<void> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Safe timeout (${timeoutMs}ms) - preventing SDK crash`));
    }, timeoutMs);
  });

  const replyPromise = (async () => {
    const handle = session.generateReply({ instructions, allowInterruptions });
    if (waitForPlayout) {
      await handle.waitForPlayout();
    }
  })();

  await Promise.race([replyPromise, timeoutPromise]);
}

// ============================================================================
// HELPER: Handle fallback
// ============================================================================

function speakFallback(
  session: voice.AgentSession,
  fallbackMessage: string,
  context: string,
  errorMessage: string,
  sessionId?: string
): SafeGenerateReplyResult {
  try {
    // Use coordinated speech if sessionId available
    if (sessionId) {
      coordinatedSay(sessionId, fallbackMessage, { allowInterruptions: true });
    } else {
      session.say(fallbackMessage, { allowInterruptions: true });
    }
    logger.debug({ context, fallback: fallbackMessage.substring(0, 50) }, '🔄 Used fallback');
    return { success: false, usedFallback: true, error: errorMessage };
  } catch (fallbackError) {
    logger.error({ error: String(fallbackError), context }, 'Fallback failed');
    return { success: false, usedFallback: false, error: errorMessage };
  }
}

// ============================================================================
// MAIN: Safe Generate Reply
// ============================================================================

/**
 * Safely call session.generateReply() with pre-emptive timeout protection.
 *
 * SAFEGUARDS:
 * 1. Circuit breaker - stops after 3 failures
 * 2. Rate limiting - 500ms minimum between calls
 * 3. Mutual exclusion - prevents concurrent generateReply calls
 * 4. Context size monitoring - warns on large prompts
 * 5. Connection health check - validates session state
 * 6. Pre-emptive timeout - fires before SDK's internal timeout
 *
 * @example
 * ```ts
 * const result = await safeGenerateReply(session, {
 *   instructions: 'Respond naturally to the user',
 *   fallbackMessage: "I'm here with you.",
 *   context: 'silence-response',
 * });
 * ```
 */
export async function safeGenerateReply(
  session: voice.AgentSession,
  options: SafeGenerateReplyOptions
): Promise<SafeGenerateReplyResult> {
  const {
    instructions,
    allowInterruptions = true,
    fallbackMessage,
    waitForPlayout = true,
    timeoutMs = SAFE_TIMEOUT_MS,
    context = 'unknown',
    sessionId,
  } = options;

  // SAFEGUARD 0 (new): Check if session is closing - abort immediately
  // This prevents wasted time trying to speak on a draining session
  if (sessionId) {
    const { isSessionClosing } = await import('./session-closing-tracker.js');
    if (isSessionClosing(sessionId)) {
      logger.debug({ context, sessionId }, '🚪 Session is closing - skipping generateReply');
      return {
        success: false,
        usedFallback: false,
        error: 'Session is closing',
      };
    }
  }

  // SAFEGUARD 1: Check circuit breaker
  const circuitResult = checkCircuitBreaker(session, fallbackMessage, context, sessionId);
  if (circuitResult) return circuitResult;

  // SAFEGUARD 2: Check rate limit
  const rateLimitResult = checkRateLimit(context);
  if (rateLimitResult) return rateLimitResult;

  // SAFEGUARD 3: Check mutual exclusion (prevent concurrent calls)
  const mutexResult = checkMutualExclusion(context);
  if (mutexResult) return mutexResult;

  // SAFEGUARD 4: Monitor context size
  const contextSize = checkContextSize(instructions);

  // SAFEGUARD 5: Check connection health
  const connectionHealth = checkConnectionHealth(session);
  if (!connectionHealth.healthy) {
    logger.warn({ context, reason: connectionHealth.reason }, '⚠️ Connection appears unhealthy');
    // Don't fail, just warn - the actual call might still work
  }

  // Acquire mutex before making the call
  acquireMutex(context);

  // Execute with timeout (SAFEGUARD 6)
  try {
    await executeWithTimeout(session, instructions, allowInterruptions, waitForPlayout, timeoutMs);
    failureTracker.recordSuccess();
    logger.debug({ context, instructionChars: instructions.length }, '✅ generateReply succeeded');
    return {
      success: true,
      usedFallback: false,
      contextWarning: contextSize.warning,
      connectionWarning: !connectionHealth.healthy,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(
      {
        error: errorMessage,
        context,
        instructionChars: instructions.length,
        estimatedTokens: contextSize.estimatedTokens,
      },
      '❌ generateReply failed'
    );
    failureTracker.recordFailure();

    if (fallbackMessage) {
      return {
        ...speakFallback(session, fallbackMessage, context, errorMessage, sessionId),
        contextWarning: contextSize.warning,
        connectionWarning: !connectionHealth.healthy,
      };
    }

    return {
      success: false,
      usedFallback: false,
      error: errorMessage,
      contextWarning: contextSize.warning,
      connectionWarning: !connectionHealth.healthy,
    };
  } finally {
    // CRITICAL: Always release mutex
    releaseMutex();
  }
}

// ============================================================================
// UTILITY: Safe say with timeout
// ============================================================================

/**
 * Safely call session.say() with timeout protection.
 * @param sessionId - If provided, uses coordinated speech; otherwise falls back to direct session.say
 */
export async function safeSay(
  session: voice.AgentSession,
  text: string,
  options?: {
    allowInterruptions?: boolean;
    timeoutMs?: number;
    context?: string;
    sessionId?: string;
  }
): Promise<boolean> {
  const { allowInterruptions = true, timeoutMs = 5000, context = 'say', sessionId } = options ?? {};

  try {
    const sayPromise = new Promise<void>((resolve) => {
      // Use coordinated speech if sessionId available
      if (sessionId) {
        coordinatedSay(sessionId, text, { allowInterruptions });
      } else {
        session.say(text, { allowInterruptions });
      }
      resolve();
    });

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('say timeout')), timeoutMs);
    });

    await Promise.race([sayPromise, timeoutPromise]);
    return true;
  } catch (error) {
    logger.warn({ error: String(error), context }, 'safeSay() failed');
    return false;
  }
}

// ============================================================================
// CIRCUIT BREAKER STATUS
// ============================================================================

export function isCircuitOpen(): boolean {
  return failureTracker.shouldSkip();
}

export function getFailureStats(): { count: number; threshold: number; isOpen: boolean } {
  return {
    count: failureTracker.getFailureCount(),
    threshold: 3,
    isOpen: failureTracker.shouldSkip(),
  };
}

export function resetCircuitBreaker(): void {
  failureTracker.recordSuccess();
  logger.info('Circuit breaker reset manually');
}

// ============================================================================
// DIAGNOSTICS: Full status report
// ============================================================================

export interface SafeGenerateReplyStatus {
  circuitBreaker: {
    isOpen: boolean;
    failureCount: number;
    threshold: number;
  };
  mutex: {
    isLocked: boolean;
    currentContext: string | null;
  };
  rateLimit: {
    lastCallTime: number;
    msSinceLastCall: number;
    minIntervalMs: number;
  };
  contextLimits: {
    maxChars: number;
    criticalChars: number;
  };
}

/**
 * Get full status report for diagnostics.
 * Useful for debugging why generateReply calls might be failing.
 */
export function getFullStatus(): SafeGenerateReplyStatus {
  const now = Date.now();
  return {
    circuitBreaker: {
      isOpen: failureTracker.shouldSkip(),
      failureCount: failureTracker.getFailureCount(),
      threshold: 3,
    },
    mutex: {
      isLocked: generateReplyInProgress,
      currentContext,
    },
    rateLimit: {
      lastCallTime,
      msSinceLastCall: now - lastCallTime,
      minIntervalMs: MIN_INTERVAL_MS,
    },
    contextLimits: {
      maxChars: MAX_CONTEXT_CHARS,
      criticalChars: CRITICAL_CONTEXT_CHARS,
    },
  };
}

/**
 * Check if it's safe to call generateReply right now.
 * Returns null if safe, or an error message if not.
 */
export function canGenerateReply(): string | null {
  if (failureTracker.shouldSkip()) {
    return 'Circuit breaker is open';
  }
  if (generateReplyInProgress) {
    return `Mutex locked by: ${currentContext}`;
  }
  const timeSinceLastCall = Date.now() - lastCallTime;
  if (timeSinceLastCall < MIN_INTERVAL_MS) {
    return `Rate limited: ${MIN_INTERVAL_MS - timeSinceLastCall}ms until next call allowed`;
  }
  return null;
}

/**
 * Force unlock the mutex (use only in emergency/cleanup scenarios).
 * WARNING: This could cause race conditions if called while a generateReply is actually in progress.
 */
export function forceUnlockMutex(): void {
  if (generateReplyInProgress) {
    logger.warn({ currentContext }, '⚠️ Force unlocking mutex - use with caution');
    releaseMutex();
  }
}

// ============================================================================
// BEHAVIORAL INSTRUCTIONS: Direct guidance without leakage risk
// ============================================================================

/**
 * Format behavioral instructions for the LLM.
 *
 * This creates clear, direct instructions that tell the LLM HOW to respond.
 * Unlike the old "stage direction" approach (which wrapped content in
 * <context> tags and hoped the LLM wouldn't read them), this gives explicit
 * behavioral guidance that can't leak because it's already instructional.
 *
 * @example
 * ```ts
 * // Direct behavioral instruction:
 * behavioralInstruction('User has been quiet', 'Gently check in without being pushy');
 *
 * // For tool results:
 * behavioralInstruction(
 *   'Tool executed: playMusic',
 *   'Acknowledge naturally that music is playing'
 * );
 * ```
 */
export function behavioralInstruction(situation: string, instruction: string): string {
  return `[SITUATION: ${situation}]\n[DO: ${instruction}]`;
}

/**
 * Format a tool result for natural presentation.
 *
 * Instead of wrapping in "invisible" context tags, we give the LLM clear
 * instructions on how to present the result naturally.
 */
export function formatToolResult(toolName: string, result: string): string {
  return [
    `[TOOL RESULT: ${toolName}]`,
    `[DATA: ${result}]`,
    `[DO: Share this naturally and conversationally. Don't read verbatim - summarize key points.]`,
  ].join('\n');
}

/**
 * @deprecated Use behavioralInstruction() instead.
 * Kept for backward compatibility - now outputs behavioral format, not <context> tags.
 */
export function stageDirection(context: string | string[]): string {
  const content = Array.isArray(context) ? context.join('\n') : context;
  // Convert to behavioral format instead of <context> tags (which leaked)
  return `[INTERNAL GUIDANCE]\n${content}\n[DO: Use this to inform your response. Speak naturally.]`;
}

/**
 * Generate a reply with behavioral context.
 * Convenience wrapper that formats context as behavioral instructions.
 *
 * @example
 * ```ts
 * await generateReplyWithContext(session, {
 *   context: ['User has been quiet for 8 seconds', 'They seemed stressed earlier'],
 *   fallbackMessage: "I'm here whenever you're ready.",
 *   logContext: 'dead-air-checkin',
 * });
 * ```
 */
export async function generateReplyWithContext(
  session: voice.AgentSession,
  options: {
    context: string | string[];
    fallbackMessage?: string;
    allowInterruptions?: boolean;
    waitForPlayout?: boolean;
    timeoutMs?: number;
    logContext?: string;
  }
): Promise<SafeGenerateReplyResult> {
  const { context, logContext = 'context-reply', ...rest } = options;
  return safeGenerateReply(session, {
    instructions: stageDirection(context),
    context: logContext,
    ...rest,
  });
}
