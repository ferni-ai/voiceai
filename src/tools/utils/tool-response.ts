/**
 * Standardized Tool Response Types
 *
 * Following Google Vertex AI Function Calling best practices:
 * - Consistent response format across all tools
 * - Clear success/failure indication
 * - Concise summaries for LLM to construct natural responses
 * - Structured data for downstream processing
 *
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 *
 * USAGE:
 * ```typescript
 * import { success, failure, pending, ToolResponse } from '../utils/tool-response.js';
 *
 * // Success with data
 * return success('Found 3 appointments for tomorrow', { appointments });
 *
 * // Failure with user-friendly message
 * return failure('Database connection failed', 'I had trouble accessing your calendar. Try again?');
 *
 * // Requires confirmation
 * return pending('Send message to John about the meeting?', { action: 'sendMessage', params });
 * ```
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Base response interface for all tool executions
 */
export interface ToolResponseBase {
  /** Whether the tool execution succeeded */
  success: boolean;

  /**
   * Concise summary for the LLM to use in constructing its response.
   * Should be natural language, not technical.
   * Keep under 200 characters for optimal LLM processing.
   */
  summary: string;

  /** Timestamp of execution */
  timestamp: string;

  /** Tool execution duration in ms (for analytics) */
  durationMs?: number;
}

/**
 * Successful tool response
 */
export interface ToolResponseSuccess<T = unknown> extends ToolResponseBase {
  success: true;

  /** Structured data from the tool execution */
  data?: T;

  /** Optional metadata for downstream processing */
  metadata?: Record<string, unknown>;
}

/**
 * Failed tool response
 */
export interface ToolResponseFailure extends ToolResponseBase {
  success: false;

  /** Technical error message (for logging) */
  error: string;

  /** Error code for categorization */
  errorCode?: ToolErrorCode;

  /** Whether the error is recoverable */
  recoverable?: boolean;

  /** Suggested next action */
  suggestion?: string;
}

/**
 * Tool response requiring user confirmation
 */
export interface ToolResponsePending extends ToolResponseBase {
  success: true;

  /** Indicates this needs user confirmation before proceeding */
  requiresConfirmation: true;

  /** The action awaiting confirmation */
  pendingAction: {
    toolId: string;
    params: Record<string, unknown>;
    description: string;
  };

  /** How long this confirmation is valid (ms) */
  confirmationTtlMs?: number;
}

/**
 * Union type for all tool responses
 */
export type ToolResponse<T = unknown> =
  | ToolResponseSuccess<T>
  | ToolResponseFailure
  | ToolResponsePending;

/**
 * Standard error codes for tool failures
 */
export type ToolErrorCode =
  | 'VALIDATION_ERROR' // Invalid input parameters
  | 'PERMISSION_DENIED' // User doesn't have access
  | 'NOT_FOUND' // Resource not found
  | 'SERVICE_UNAVAILABLE' // External service down
  | 'RATE_LIMITED' // Too many requests
  | 'TIMEOUT' // Operation timed out
  | 'INTERNAL_ERROR' // Unexpected error
  | 'CONFIRMATION_REQUIRED' // Needs user confirmation
  | 'CANCELLED' // User cancelled the operation
  | 'INVALID_STATE'; // Operation not valid in current state

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a successful tool response
 *
 * @param summary - Concise natural language summary for LLM
 * @param data - Optional structured data
 * @param metadata - Optional metadata
 */
export function success<T = unknown>(
  summary: string,
  data?: T,
  metadata?: Record<string, unknown>
): ToolResponseSuccess<T> {
  return {
    success: true,
    summary: truncateSummary(summary),
    data,
    metadata,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a failed tool response
 *
 * @param error - Technical error message (for logging)
 * @param userMessage - User-friendly message for LLM to convey
 * @param options - Additional error options
 */
export function failure(
  error: string,
  userMessage: string,
  options?: {
    errorCode?: ToolErrorCode;
    recoverable?: boolean;
    suggestion?: string;
  }
): ToolResponseFailure {
  log.warn({ error, userMessage }, 'Tool execution failed');

  return {
    success: false,
    summary: truncateSummary(userMessage),
    error,
    errorCode: options?.errorCode || 'INTERNAL_ERROR',
    recoverable: options?.recoverable ?? true,
    suggestion: options?.suggestion,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a pending confirmation response
 *
 * @param confirmationPrompt - Question to ask user for confirmation
 * @param pendingAction - The action awaiting confirmation
 * @param ttlMs - How long this confirmation is valid (default 60s)
 */
export function pending(
  confirmationPrompt: string,
  pendingAction: {
    toolId: string;
    params: Record<string, unknown>;
    description: string;
  },
  ttlMs = 60000
): ToolResponsePending {
  return {
    success: true,
    summary: truncateSummary(confirmationPrompt),
    requiresConfirmation: true,
    pendingAction,
    confirmationTtlMs: ttlMs,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Truncate summary to optimal length for LLM processing
 */
function truncateSummary(summary: string, maxLength = 500): string {
  if (summary.length <= maxLength) {
    return summary;
  }
  return summary.slice(0, maxLength - 3) + '...';
}

/**
 * Check if a response requires confirmation
 */
export function requiresConfirmation(response: ToolResponse): response is ToolResponsePending {
  return response.success && 'requiresConfirmation' in response && response.requiresConfirmation;
}

/**
 * Check if a response is a failure
 */
export function isFailure(response: ToolResponse): response is ToolResponseFailure {
  return !response.success;
}

/**
 * Check if a response is a success (not pending)
 */
export function isSuccess<T>(response: ToolResponse<T>): response is ToolResponseSuccess<T> {
  return response.success && !('requiresConfirmation' in response);
}

/**
 * Convert legacy string responses to ToolResponse format
 * Use this during migration of existing tools
 */
export function fromLegacyResponse(result: unknown, toolId: string): ToolResponse {
  // Already a ToolResponse
  if (result && typeof result === 'object' && 'success' in result && 'summary' in result) {
    return result as ToolResponse;
  }

  // String response (most common legacy format)
  if (typeof result === 'string') {
    // Check for error indicators
    const lowerResult = result.toLowerCase();
    if (
      lowerResult.includes('error') ||
      lowerResult.includes('failed') ||
      lowerResult.includes('trouble') ||
      lowerResult.includes('sorry')
    ) {
      return failure(`Tool ${toolId} returned error-like response`, result, { recoverable: true });
    }
    return success(result);
  }

  // Object with error property
  if (result && typeof result === 'object' && 'error' in result) {
    const errorResult = result as { error: string };
    return failure(errorResult.error, `There was an issue: ${errorResult.error}`, {
      recoverable: true,
    });
  }

  // Object response - serialize as data
  if (result && typeof result === 'object') {
    return success(`Completed ${toolId}`, result);
  }

  // Null/undefined
  if (result === null || result === undefined) {
    return success(`Completed ${toolId}`);
  }

  // Fallback
  return success(String(result));
}

/**
 * Format a ToolResponse for LLM consumption
 * Returns just the summary string, with data appended if useful
 */
export function formatForLLM(response: ToolResponse): string {
  if (isFailure(response)) {
    return response.suggestion ? `${response.summary} ${response.suggestion}` : response.summary;
  }

  if (requiresConfirmation(response)) {
    return response.summary;
  }

  // Success - include relevant data in response if present
  const successResponse = response as ToolResponseSuccess;
  if (successResponse.data) {
    // If data is a simple string or number, include it
    if (typeof successResponse.data === 'string' || typeof successResponse.data === 'number') {
      return `${successResponse.summary}: ${successResponse.data}`;
    }
    // For objects, just use the summary (data is for structured processing)
    return successResponse.summary;
  }

  return successResponse.summary;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  success,
  failure,
  pending,
  isSuccess,
  isFailure,
  requiresConfirmation,
  fromLegacyResponse,
  formatForLLM,
};
