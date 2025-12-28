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
 * Maximum retry attempts before giving up
 */
const MAX_RETRY_ATTEMPTS = 2;

/**
 * Session retry counter (WeakMap to avoid memory leaks)
 */
const sessionRetryCounters = new WeakMap<object, number>();

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
 * Generate retry prompt based on the detected issue
 */
function generateRetryPrompt(suggestedTool: string, originalMessage: string): string {
  // Customize prompt based on tool type
  if (suggestedTool.toLowerCase().includes('music') || suggestedTool === 'playMusic') {
    return `The user asked: "${originalMessage}"

IMPORTANT: Do NOT say "I'll play" or "Let me play" or "Playing music". 
Instead, output the JSON function call IMMEDIATELY:

{"fn":"playMusic","args":{"query":"<appropriate search query>"}}

Do not add any text before or after the JSON.`;
  }

  if (
    suggestedTool.toLowerCase().includes('handoff') ||
    suggestedTool.toLowerCase().includes('transfer')
  ) {
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
    log.debug('Max retry attempts reached, not retrying');
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

  // Generate retry prompt
  const retryPrompt = generateRetryPrompt(suggestedTool, originalMessage);

  // Increment retry counter
  sessionRetryCounters.set(session, currentAttempt + 1);

  log.info('Recommending retry:', {
    attempt: currentAttempt + 1,
    tool: suggestedTool,
    pattern: detection.pattern,
  });

  return {
    shouldRetry: true,
    retryPrompt,
    suggestedTool,
    pattern: detection.pattern ?? null,
    attempt: currentAttempt + 1,
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
