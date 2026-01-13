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
export type ToolResponse<T = unknown> = ToolResponseSuccess<T> | ToolResponseFailure | ToolResponsePending;
/**
 * Standard error codes for tool failures
 */
export type ToolErrorCode = 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'RATE_LIMITED' | 'TIMEOUT' | 'INTERNAL_ERROR' | 'CONFIRMATION_REQUIRED' | 'CANCELLED' | 'INVALID_STATE';
/**
 * Create a successful tool response
 *
 * @param summary - Concise natural language summary for LLM
 * @param data - Optional structured data
 * @param metadata - Optional metadata
 */
export declare function success<T = unknown>(summary: string, data?: T, metadata?: Record<string, unknown>): ToolResponseSuccess<T>;
/**
 * Create a failed tool response
 *
 * @param error - Technical error message (for logging)
 * @param userMessage - User-friendly message for LLM to convey
 * @param options - Additional error options
 */
export declare function failure(error: string, userMessage: string, options?: {
    errorCode?: ToolErrorCode;
    recoverable?: boolean;
    suggestion?: string;
}): ToolResponseFailure;
/**
 * Create a pending confirmation response
 *
 * @param confirmationPrompt - Question to ask user for confirmation
 * @param pendingAction - The action awaiting confirmation
 * @param ttlMs - How long this confirmation is valid (default 60s)
 */
export declare function pending(confirmationPrompt: string, pendingAction: {
    toolId: string;
    params: Record<string, unknown>;
    description: string;
}, ttlMs?: number): ToolResponsePending;
/**
 * Check if a response requires confirmation
 */
export declare function requiresConfirmation(response: ToolResponse): response is ToolResponsePending;
/**
 * Check if a response is a failure
 */
export declare function isFailure(response: ToolResponse): response is ToolResponseFailure;
/**
 * Check if a response is a success (not pending)
 */
export declare function isSuccess<T>(response: ToolResponse<T>): response is ToolResponseSuccess<T>;
/**
 * Convert legacy string responses to ToolResponse format
 * Use this during migration of existing tools
 */
export declare function fromLegacyResponse(result: unknown, toolId: string): ToolResponse;
/**
 * Format a ToolResponse for LLM consumption
 * Returns just the summary string, with data appended if useful
 */
export declare function formatForLLM(response: ToolResponse): string;
declare const _default: {
    success: typeof success;
    failure: typeof failure;
    pending: typeof pending;
    isSuccess: typeof isSuccess;
    isFailure: typeof isFailure;
    requiresConfirmation: typeof requiresConfirmation;
    fromLegacyResponse: typeof fromLegacyResponse;
    formatForLLM: typeof formatForLLM;
};
export default _default;
//# sourceMappingURL=tool-response.d.ts.map