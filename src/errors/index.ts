/**
 * Ferni Error Handling
 *
 * Unified error types for the Ferni codebase.
 *
 * Design principles:
 * 1. All errors extend FerniError for consistent handling
 * 2. Errors have codes for programmatic handling
 * 3. Errors include context for debugging
 * 4. User-facing messages are separate from technical details
 *
 * @module errors
 */

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

/**
 * Base error class for all Ferni errors.
 *
 * @example
 * throw new FerniError('Database connection failed', 'DB_CONNECTION_ERROR', {
 *   host: 'localhost',
 *   port: 5432,
 * });
 */
export class FerniError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;

  /** User-friendly message (may differ from technical message) */
  readonly userMessage: string;

  /** Whether this error should be logged */
  readonly shouldLog: boolean;

  /** Severity level */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';

  /** Whether this error is retryable */
  readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options: {
      context?: Record<string, unknown>;
      userMessage?: string;
      shouldLog?: boolean;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      retryable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.context = options.context;
    this.userMessage = options.userMessage ?? 'Something went wrong. Please try again.';
    this.shouldLog = options.shouldLog ?? true;
    this.severity = options.severity ?? 'medium';
    this.retryable = options.retryable ?? false;

    // Capture stack trace
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON for logging/serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : undefined,
    };
  }
}

// ============================================================================
// DOMAIN-SPECIFIC ERRORS
// ============================================================================

/**
 * Task-related errors.
 */
export class TaskError extends FerniError {
  constructor(
    message: string,
    code: string,
    options: {
      taskId?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, `TASK_${code}`, {
      context: { taskId: options.taskId, ...options.context },
      cause: options.cause,
      severity: 'medium',
    });
  }
}

/**
 * Tool execution errors.
 */
export class ToolError extends FerniError {
  constructor(
    message: string,
    code: string,
    options: {
      toolId?: string;
      domain?: string;
      params?: Record<string, unknown>;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, `TOOL_${code}`, {
      context: {
        toolId: options.toolId,
        domain: options.domain,
        params: options.params,
        ...options.context,
      },
      cause: options.cause,
      userMessage: "I couldn't complete that action. Let me try something else.",
      severity: 'medium',
      retryable: true,
    });
  }
}

/**
 * Validation errors.
 */
export class ValidationError extends FerniError {
  constructor(
    message: string,
    options: {
      field?: string;
      value?: unknown;
      expected?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, 'VALIDATION_ERROR', {
      context: {
        field: options.field,
        value: options.value,
        expected: options.expected,
        ...options.context,
      },
      userMessage: 'Please check your input and try again.',
      severity: 'low',
      shouldLog: false,
    });
  }
}

/**
 * Authentication errors.
 */
export class AuthenticationError extends FerniError {
  constructor(
    message: string,
    code = 'AUTH_FAILED',
    options: {
      userId?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, code, {
      context: { userId: options.userId, ...options.context },
      userMessage: 'Please sign in to continue.',
      severity: 'medium',
    });
  }
}

/**
 * Authorization errors.
 */
export class AuthorizationError extends FerniError {
  constructor(
    message: string,
    options: {
      userId?: string;
      action?: string;
      resource?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, 'AUTHORIZATION_ERROR', {
      context: {
        userId: options.userId,
        action: options.action,
        resource: options.resource,
        ...options.context,
      },
      userMessage: "You don't have permission to do that.",
      severity: 'medium',
    });
  }
}

/**
 * External service errors.
 */
export class ExternalServiceError extends FerniError {
  constructor(
    service: string,
    message: string,
    options: {
      statusCode?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, 'EXTERNAL_SERVICE_ERROR', {
      context: {
        service,
        statusCode: options.statusCode,
        ...options.context,
      },
      cause: options.cause,
      userMessage: `I'm having trouble connecting to ${service}. Please try again later.`,
      severity:
        typeof options.statusCode === 'number' && options.statusCode >= 500 ? 'high' : 'medium',
      retryable: true,
    });
  }
}

/**
 * Rate limit errors.
 */
export class RateLimitError extends FerniError {
  /** Time in ms until the rate limit resets */
  readonly retryAfterMs: number;

  constructor(
    message: string,
    retryAfterMs: number,
    options: {
      operation?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, 'RATE_LIMIT_ERROR', {
      context: {
        operation: options.operation,
        retryAfterMs,
        ...options.context,
      },
      userMessage: 'Please slow down a bit. Try again in a moment.',
      severity: 'low',
      retryable: true,
    });
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Resource not found errors.
 */
export class NotFoundError extends FerniError {
  constructor(
    resource: string,
    identifier: string,
    options: {
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(`${resource} not found: ${identifier}`, 'NOT_FOUND', {
      context: { resource, identifier, ...options.context },
      userMessage: `I couldn't find that ${resource.toLowerCase()}.`,
      severity: 'low',
      shouldLog: false,
    });
  }
}

/**
 * Configuration errors.
 */
export class ConfigurationError extends FerniError {
  constructor(
    message: string,
    options: {
      configKey?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, 'CONFIGURATION_ERROR', {
      context: { configKey: options.configKey, ...options.context },
      userMessage: 'The system is misconfigured. Please contact support.',
      severity: 'critical',
    });
  }
}

/**
 * Timeout errors.
 */
export class TimeoutError extends FerniError {
  /** Timeout duration in ms */
  readonly timeoutMs: number;

  constructor(
    operation: string,
    timeoutMs: number,
    options: {
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT', {
      context: { operation, timeoutMs, ...options.context },
      userMessage: 'That took too long. Please try again.',
      severity: 'medium',
      retryable: true,
    });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Handoff errors (agent-to-agent transfer failures).
 */
export class HandoffError extends FerniError {
  constructor(
    message: string,
    options: {
      fromAgent?: string;
      toAgent?: string;
      reason?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, 'HANDOFF_ERROR', {
      context: {
        fromAgent: options.fromAgent,
        toAgent: options.toAgent,
        reason: options.reason,
        ...options.context,
      },
      cause: options.cause,
      userMessage: "I'm having trouble connecting you with my colleague. Let me help you instead.",
      severity: 'medium',
      retryable: true,
    });
  }
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Type guard to check if error is a FerniError.
 */
export function isFerniError(error: unknown): error is FerniError {
  return error instanceof FerniError;
}

/**
 * Wrap an unknown error in a FerniError.
 */
export function wrapError(error: unknown, defaultCode = 'UNKNOWN_ERROR'): FerniError {
  if (isFerniError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new FerniError(error.message, defaultCode, {
      cause: error,
      context: { originalName: error.name },
    });
  }

  return new FerniError(String(error), defaultCode);
}

/**
 * Extract a user-friendly message from any error.
 */
export function getUserMessage(error: unknown): string {
  if (isFerniError(error)) {
    return error.userMessage;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Create an error handler that logs and transforms errors.
 */
export function createErrorHandler(options: {
  logError?: (error: FerniError) => void;
  transformError?: (error: FerniError) => FerniError;
}) {
  return (error: unknown): FerniError => {
    const ferniError = wrapError(error);

    if (ferniError.shouldLog && options.logError) {
      options.logError(ferniError);
    }

    if (options.transformError) {
      return options.transformError(ferniError);
    }

    return ferniError;
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  FerniError,
  TaskError,
  ToolError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ExternalServiceError,
  RateLimitError,
  NotFoundError,
  ConfigurationError,
  TimeoutError,
  HandoffError,
  isFerniError,
  wrapError,
  getUserMessage,
  createErrorHandler,
};
