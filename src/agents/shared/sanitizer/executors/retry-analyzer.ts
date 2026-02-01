/**
 * Retry Analyzer
 *
 * Analyzes LLM responses for tool call failures and determines
 * if a retry with a modified prompt would help.
 *
 * @module agents/shared/sanitizer/executors/retry-analyzer
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { RetryAnalysis } from '../types.js';
import { detectsFunctionCallLeakage } from '../detectors/leakage-detector.js';
import { getAllToolPatterns } from '../detectors/patterns-loader.js';

const log = createLogger({ module: 'retry-analyzer' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Maximum retry attempts before giving up.
 *
 * Research (Jan 2026) shows that 3 attempts with progressively more
 * forceful prompts catches most transient Gemini function call failures.
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay between retries in milliseconds.
 * Uses exponential backoff: attempt 1 = 100ms, attempt 2 = 200ms, attempt 3 = 400ms
 */
const BASE_RETRY_DELAY_MS = 100;

/**
 * Session retry counter (WeakMap to avoid memory leaks)
 */
const sessionRetryCounters = new WeakMap<object, number>();

/**
 * Calculate exponential backoff delay for a given attempt.
 * @param attempt - Current attempt number (1-indexed)
 * @returns Delay in milliseconds
 */
export function getRetryDelay(attempt: number): number {
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
}

/**
 * Sleep for exponential backoff delay.
 * @param attempt - Current attempt number (1-indexed)
 */
export async function sleepForRetry(attempt: number): Promise<void> {
  const delay = getRetryDelay(attempt);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Common patterns that indicate the LLM talked about a tool instead of calling it
 */
const TALKED_ABOUT_PATTERNS = [
  /i(?:'ll| will) (?:play|search|get|find|look up|check)/i,
  /let me (?:play|search|get|find|look up|check)/i,
  /i(?:'m| am) (?:playing|searching|getting|finding|looking|checking)/i,
  /(?:playing|searching|getting|finding|looking up|checking) (?:some|the|for|now)/i,
];

/**
 * Patterns for music-related tool call leakage
 */
const MUSIC_TALK_PATTERNS = [
  /(?:i(?:'ll| will)|let me) play (?:some )?\w+/i,
  /(?:playing|searching for) (?:some )?\w+ (?:music|songs?|tracks?)/i,
  /(?:i(?:'m| am) going to|going to) play/i,
];

/**
 * Extract tool name from leakage pattern
 */
function extractToolFromPattern(text: string): string | null {
  const toolPatterns = getAllToolPatterns();
  const lowerText = text.toLowerCase();

  // Check for direct tool mentions
  for (const tool of toolPatterns) {
    if (lowerText.includes(tool.toLowerCase())) {
      return tool;
    }
  }

  // Check for music-related patterns
  for (const pattern of MUSIC_TALK_PATTERNS) {
    if (pattern.test(text)) {
      return 'playMusic';
    }
  }

  return null;
}

/**
 * Generate retry prompt based on the detected issue and attempt number.
 *
 * Uses progressively more forceful prompts:
 * - Attempt 1: Standard instruction
 * - Attempt 2: Explicit JSON-only with warnings
 * - Attempt 3: Ultra-explicit with tool name prefilled
 *
 * @param suggestedTool - The tool that should be called
 * @param originalMessage - Original user message
 * @param attempt - Current attempt number (1-indexed)
 */
function generateRetryPrompt(
  suggestedTool: string,
  originalMessage: string,
  attempt: number = 1
): string {
  const isMusic = suggestedTool.toLowerCase().includes('music') || suggestedTool === 'playMusic';
  const isHandoff =
    suggestedTool.toLowerCase().includes('handoff') ||
    suggestedTool.toLowerCase().includes('transfer');

  // ATTEMPT 3: Ultra-explicit with prefilled tool name (last resort)
  if (attempt >= 3) {
    if (isMusic) {
      return `OUTPUT THIS EXACT JSON NOW (fill in the query):
{"fn":"playMusic","args":{"query":"jazz"}}

User wanted: "${originalMessage}"
Replace "jazz" with appropriate query. OUTPUT ONLY JSON. NO OTHER TEXT.`;
    }
    if (isHandoff) {
      return `OUTPUT THIS EXACT JSON NOW:
{"fn":"${suggestedTool}","args":{"reason":"user request"}}

ONLY OUTPUT THE JSON ABOVE. NOTHING ELSE. NO WORDS.`;
    }
    return `OUTPUT JSON FUNCTION CALL NOW:
{"fn":"${suggestedTool}","args":{}}

Fill in args as needed. OUTPUT ONLY JSON. ZERO OTHER TEXT.`;
  }

  // ATTEMPT 2: Explicit JSON-only with strong warnings
  if (attempt >= 2) {
    if (isMusic) {
      return `CRITICAL: You just spoke instead of calling the function. This is WRONG.

The user asked: "${originalMessage}"

You MUST output ONLY this JSON format (no other text):
{"fn":"playMusic","args":{"query":"<search query>"}}

DO NOT say "I'll play" or "Let me play" - just output the JSON.`;
    }
    if (isHandoff) {
      return `CRITICAL: You announced the transfer instead of executing it. This is WRONG.

The user asked: "${originalMessage}"

You MUST output ONLY this JSON format (no other text):
{"fn":"${suggestedTool}","args":{"reason":"<brief reason>"}}

DO NOT say "I'll transfer you" - just output the JSON.`;
    }
    return `CRITICAL: You spoke about the tool instead of calling it. This is WRONG.

The user asked: "${originalMessage}"

You MUST output ONLY the JSON function call:
{"fn":"${suggestedTool}","args":{...}}

NO TEXT BEFORE OR AFTER. ONLY JSON.`;
  }

  // ATTEMPT 1: Standard instruction (existing behavior)
  if (isMusic) {
    return `The user asked: "${originalMessage}"

IMPORTANT: Do NOT say "I'll play" or "Let me play" or "Playing music". 
Instead, output the JSON function call IMMEDIATELY:

{"fn":"playMusic","args":{"query":"<appropriate search query>"}}

Do not add any text before or after the JSON.`;
  }

  if (isHandoff) {
    return `The user asked: "${originalMessage}"

IMPORTANT: Do NOT announce the transfer. Execute it directly with JSON:

{"fn":"${suggestedTool}","args":{"reason":"<brief reason>"}}

No text before or after.`;
  }

  // Generic retry prompt
  return `The user asked: "${originalMessage}"

IMPORTANT: Execute the appropriate tool by outputting ONLY the JSON function call.
Format: {"fn":"toolName","args":{...}}

Do not announce what you're doing. Just output the JSON directly.`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Analyze a response for tool call leakage and determine if retry is needed
 *
 * @param response - The LLM's response text
 * @param session - Session object for tracking retry count
 * @param originalMessage - Original user message
 * @returns Analysis result with retry recommendation
 */
export function analyzeForRetry(
  response: string,
  session: object,
  originalMessage: string
): RetryAnalysis {
  // Get current retry count
  const currentAttempt = sessionRetryCounters.get(session) ?? 0;

  // Check if we've exceeded max retries
  if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
    log.warn(
      { currentAttempt, maxAttempts: MAX_RETRY_ATTEMPTS },
      '🛑 RETRY: Max retry attempts reached, giving up on function call'
    );
    return {
      shouldRetry: false,
      retryPrompt: null,
      suggestedTool: null,
      pattern: null,
      attempt: currentAttempt,
    };
  }

  // Check for leakage
  const detection = detectsFunctionCallLeakage(response);

  if (!detection.detected) {
    // No leakage detected
    return {
      shouldRetry: false,
      retryPrompt: null,
      suggestedTool: null,
      pattern: null,
      attempt: currentAttempt,
    };
  }

  // Try to determine which tool should have been called
  const suggestedTool = detection.toolName ?? extractToolFromPattern(response);

  if (!suggestedTool) {
    // Leakage detected but can't determine tool
    log.debug('Leakage detected but no tool identified');
    return {
      shouldRetry: false,
      retryPrompt: null,
      suggestedTool: null,
      pattern: detection.pattern ?? null,
      attempt: currentAttempt,
    };
  }

  // Increment retry counter first (so attempt is 1-indexed)
  const nextAttempt = currentAttempt + 1;
  sessionRetryCounters.set(session, nextAttempt);

  // Generate retry prompt with escalating forcefulness
  const retryPrompt = generateRetryPrompt(suggestedTool, originalMessage, nextAttempt);
  const retryDelayMs = getRetryDelay(nextAttempt);

  log.info(
    {
      attempt: nextAttempt,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      tool: suggestedTool,
      pattern: detection.pattern,
      delayMs: retryDelayMs,
      forceLevel:
        nextAttempt === 1 ? 'standard' : nextAttempt === 2 ? 'explicit' : 'ultra-explicit',
    },
    `🔄 RETRY: Recommending retry attempt ${nextAttempt}/${MAX_RETRY_ATTEMPTS}`
  );

  return {
    shouldRetry: true,
    retryPrompt,
    suggestedTool,
    pattern: detection.pattern ?? null,
    attempt: nextAttempt,
  };
}

/**
 * Clear retry counter for a session.
 * Call this after successful tool execution or conversation turn completion.
 *
 * @param session - Session object
 */
export function clearRetryCounter(session: object): void {
  sessionRetryCounters.delete(session);
}

/**
 * Get current retry count for a session
 *
 * @param session - Session object
 * @returns Current retry count
 */
export function getRetryCount(session: object): number {
  return sessionRetryCounters.get(session) ?? 0;
}
