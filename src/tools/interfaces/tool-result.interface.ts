/**
 * Tool Result Interface
 *
 * Standardized result type for tool execution.
 * Provides consistent structure for success and failure cases.
 *
 * @module tools/interfaces/tool-result.interface
 */

/**
 * Base result interface.
 */
export interface IToolResultBase {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Tool ID that was executed */
  toolId: string;
  /** Arguments that were passed */
  args: Record<string, unknown>;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Successful tool result.
 */
export interface IToolResultSuccess extends IToolResultBase {
  success: true;
  /** The result value (can be any type) */
  result: unknown;
  /** Optional metadata about the result */
  metadata?: IToolResultMetadata;
}

/**
 * Failed tool result.
 */
export interface IToolResultFailure extends IToolResultBase {
  success: false;
  /** Error message */
  error: string;
  /** Error code for programmatic handling */
  errorCode?: ToolErrorCode;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Suggested fallback action */
  fallback?: string;
}

/**
 * Union type for tool results.
 */
export type IToolResult = IToolResultSuccess | IToolResultFailure;

/**
 * Metadata about a successful result.
 */
export interface IToolResultMetadata {
  /** Whether result should be spoken directly (no LLM summarization) */
  speakDirectly?: boolean;
  /** Suggested text for TTS */
  spokenText?: string;
  /** Result came from cache */
  cached?: boolean;
  /** Cache TTL remaining in seconds */
  cacheTtlRemaining?: number;
  /** Source of the result (database, API, etc.) */
  source?: string;
  /** Confidence score (0-1) for generated results */
  confidence?: number;
}

/**
 * Standard error codes for tool failures.
 */
export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'INVALID_ARGUMENTS'
  | 'MISSING_REQUIRED_ARGUMENT'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'
  | 'USER_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'
  | 'CONFIGURATION_ERROR'
  | 'VALIDATION_ERROR';

/**
 * Helper function to create a success result.
 */
export function createSuccessResult(
  toolId: string,
  args: Record<string, unknown>,
  result: unknown,
  durationMs: number,
  metadata?: IToolResultMetadata
): IToolResultSuccess {
  return {
    success: true,
    toolId,
    args,
    result,
    durationMs,
    metadata,
  };
}

/**
 * Helper function to create a failure result.
 */
export function createFailureResult(
  toolId: string,
  args: Record<string, unknown>,
  error: string,
  durationMs: number,
  options?: {
    errorCode?: ToolErrorCode;
    retryable?: boolean;
    fallback?: string;
  }
): IToolResultFailure {
  return {
    success: false,
    toolId,
    args,
    error,
    durationMs,
    ...options,
  };
}

/**
 * Type guard for success results.
 */
export function isSuccessResult(result: IToolResult): result is IToolResultSuccess {
  return result.success === true;
}

/**
 * Type guard for failure results.
 */
export function isFailureResult(result: IToolResult): result is IToolResultFailure {
  return result.success === false;
}
