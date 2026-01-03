/**
 * Error Boundaries for Superhuman Tools
 *
 * Provides graceful error handling for tool executions.
 * Returns user-friendly messages instead of technical errors.
 *
 * @module tools/domains/research/superhuman-tools/error-boundaries
 */

import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// ERROR TYPES
// ============================================================================

export type ToolCategory =
  | 'analytics'
  | 'research'
  | 'prediction'
  | 'financial'
  | 'experimentation'
  | 'external'
  | 'network';

// ============================================================================
// USER-FRIENDLY ERROR MESSAGES
// ============================================================================

const ERROR_MESSAGES: Record<ToolCategory, string> = {
  analytics: "I couldn't analyze that right now. Let me try again in a moment.",
  research: "I'm having trouble with the research. Can we try a different approach?",
  prediction: "The prediction model hit a snag. Let me recalibrate.",
  financial: "Financial data is temporarily unavailable. Let's try again shortly.",
  experimentation: "I couldn't process that experiment data. Let me retry.",
  external: "External data sources are slow right now. Let me use what I have.",
  network: "I couldn't analyze your network right now. Let's try again.",
};

const FALLBACK_MESSAGE =
  "Something went wrong, but I'm still here. Let's try a different approach.";

// ============================================================================
// ERROR BOUNDARY WRAPPER
// ============================================================================

/**
 * Wrap a tool execution with error handling.
 * Returns a user-friendly message on error instead of throwing.
 */
export async function withErrorBoundary<T extends string>(
  category: ToolCategory,
  toolName: string,
  fn: () => Promise<T>
): Promise<T | string> {
  try {
    return await fn();
  } catch (error) {
    log.error(
      {
        tool: toolName,
        category,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Tool execution failed'
    );

    return ERROR_MESSAGES[category] || FALLBACK_MESSAGE;
  }
}

/**
 * Wrap a tool execution with error handling and a custom fallback.
 */
export async function withErrorBoundaryFallback<T>(
  category: ToolCategory,
  toolName: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.error(
      {
        tool: toolName,
        category,
        error: error instanceof Error ? error.message : String(error),
      },
      'Tool execution failed, using fallback'
    );

    return fallback;
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that required parameters are present.
 * Returns a user-friendly error message if validation fails.
 */
export function validateRequiredParams<T extends Record<string, unknown>>(
  params: T,
  required: (keyof T)[]
): string | null {
  const missing = required.filter((key) => params[key] === undefined || params[key] === null);

  if (missing.length > 0) {
    return `I need a bit more info: ${missing.join(', ')}. Can you provide that?`;
  }

  return null;
}

/**
 * Validate that a user ID is available.
 */
export function validateUserId(userId: string | null): string | null {
  if (!userId) {
    return "I need to know who you are to help with that. Let's make sure you're signed in.";
  }
  return null;
}

// ============================================================================
// DATA VALIDATION HELPERS
// ============================================================================

/**
 * Check if we have enough data points for analysis.
 */
export function hasEnoughData(
  dataPoints: unknown[],
  minimum: number,
  dataType: string
): string | null {
  if (dataPoints.length < minimum) {
    const needed = minimum - dataPoints.length;
    return `I need ${needed} more ${dataType} data points for meaningful analysis. Keep tracking!`;
  }
  return null;
}

/**
 * Format a "not enough data" message.
 */
export function notEnoughDataMessage(dataType: string, current: number, needed: number): string {
  return [
    `📊 **Need More ${dataType} Data**`,
    '',
    `I have ${current} data points, but need at least ${needed} for reliable analysis.`,
    '',
    `Keep tracking your ${dataType.toLowerCase()} and I'll have insights soon!`,
  ].join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  withErrorBoundary,
  withErrorBoundaryFallback,
  validateRequiredParams,
  validateUserId,
  hasEnoughData,
  notEnoughDataMessage,
};
