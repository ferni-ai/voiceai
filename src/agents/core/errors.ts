/**
 * Error Hierarchy for Voice Agents
 *
 * Structured error types for clear error handling and recovery.
 * All errors extend AgentError for consistent behavior.
 *
 * @module agents/core/errors
 */

// ============================================================================
// BASE ERROR
// ============================================================================

/**
 * Base error class for all agent errors.
 * Provides structured error information for logging and recovery.
 */
export class AgentError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  /** Whether this error is recoverable */
  readonly recoverable: boolean;

  /** Additional context for debugging */
  readonly context: Record<string, unknown>;

  /** Original error if this wraps another */
  readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code: string;
      recoverable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = options.code;
    this.recoverable = options.recoverable ?? false;
    this.context = options.context ?? {};
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create a user-friendly message for this error.
   */
  toUserMessage(): string {
    if (this.recoverable) {
      return "I'm having a small hiccup. Give me a moment...";
    }
    return 'Something went wrong on my end. Let me try again.';
  }

  /**
   * Convert to a log-friendly object.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

// ============================================================================
// SESSION ERRORS
// ============================================================================

/**
 * Error during session setup.
 */
export class SessionSetupError extends AgentError {
  readonly phase: SessionPhase;

  constructor(
    phase: SessionPhase,
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(`Session setup failed in phase "${phase}": ${message}`, {
      code: 'SESSION_SETUP_ERROR',
      recoverable: ['connect', 'services'].includes(phase),
      context: { phase, ...options?.context },
      cause: options?.cause,
    });
    this.name = 'SessionSetupError';
    this.phase = phase;
  }

  toUserMessage(): string {
    switch (this.phase) {
      case 'connect':
        return "I'm having trouble connecting. Let me try again...";
      case 'services':
        return "I'm getting set up. Just a moment...";
      default:
        return super.toUserMessage();
    }
  }
}

export type SessionPhase =
  | 'identify'
  | 'persona'
  | 'connect'
  | 'services'
  | 'handlers'
  | 'greeting';

/**
 * Error when a session times out.
 */
export class SessionTimeoutError extends AgentError {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number, options?: { cause?: Error }) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`, {
      code: 'SESSION_TIMEOUT',
      recoverable: true,
      context: { operation, timeoutMs },
      cause: options?.cause,
    });
    this.name = 'SessionTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }

  toUserMessage(): string {
    return "That's taking longer than expected. Let me try again...";
  }
}

// ============================================================================
// PERSONA ERRORS
// ============================================================================

/**
 * Error when a persona cannot be found.
 */
export class PersonaNotFoundError extends AgentError {
  readonly personaId: string;

  constructor(personaId: string) {
    super(`Persona "${personaId}" not found`, {
      code: 'PERSONA_NOT_FOUND',
      recoverable: true, // Can fall back to default persona
      context: { personaId },
    });
    this.name = 'PersonaNotFoundError';
    this.personaId = personaId;
  }

  toUserMessage(): string {
    return "I couldn't load my full personality, but I'm still here to help!";
  }
}

/**
 * Error when loading a persona fails.
 */
export class PersonaLoadError extends AgentError {
  readonly personaId: string;

  constructor(personaId: string, cause?: Error) {
    super(`Failed to load persona "${personaId}"`, {
      code: 'PERSONA_LOAD_ERROR',
      recoverable: true,
      context: { personaId },
      cause,
    });
    this.name = 'PersonaLoadError';
    this.personaId = personaId;
  }
}

// ============================================================================
// CONNECTION ERRORS
// ============================================================================

/**
 * Error connecting to a room.
 */
export class RoomConnectionError extends AgentError {
  readonly roomName: string;
  readonly attempt: number;

  constructor(roomName: string, attempt: number, cause?: Error) {
    super(`Failed to connect to room "${roomName}" (attempt ${attempt})`, {
      code: 'ROOM_CONNECTION_ERROR',
      recoverable: attempt < 3,
      context: { roomName, attempt },
      cause,
    });
    this.name = 'RoomConnectionError';
    this.roomName = roomName;
    this.attempt = attempt;
  }

  toUserMessage(): string {
    return "I'm having trouble with the connection. Hang on...";
  }
}

/**
 * Error when room disconnects unexpectedly.
 */
export class RoomDisconnectedError extends AgentError {
  readonly roomName: string;
  readonly reason: string;

  constructor(roomName: string, reason: string) {
    super(`Disconnected from room "${roomName}": ${reason}`, {
      code: 'ROOM_DISCONNECTED',
      recoverable: false,
      context: { roomName, reason },
    });
    this.name = 'RoomDisconnectedError';
    this.roomName = roomName;
    this.reason = reason;
  }
}

// ============================================================================
// TTS ERRORS
// ============================================================================

/**
 * Error with text-to-speech.
 */
export class TTSError extends AgentError {
  readonly operation: 'speak' | 'switch_voice' | 'connect';

  constructor(
    operation: 'speak' | 'switch_voice' | 'connect',
    message: string,
    options?: { cause?: Error; context?: Record<string, unknown> }
  ) {
    super(`TTS ${operation} failed: ${message}`, {
      code: 'TTS_ERROR',
      recoverable: operation === 'speak',
      context: { operation, ...options?.context },
      cause: options?.cause,
    });
    this.name = 'TTSError';
    this.operation = operation;
  }

  toUserMessage(): string {
    if (this.operation === 'speak') {
      return 'Let me try saying that again...';
    }
    return super.toUserMessage();
  }
}

// ============================================================================
// LLM ERRORS
// ============================================================================

/**
 * Error with language model.
 */
export class LLMError extends AgentError {
  readonly model: string;
  readonly operation: 'generate' | 'stream';

  constructor(
    model: string,
    operation: 'generate' | 'stream',
    message: string,
    options?: { cause?: Error }
  ) {
    super(`LLM ${operation} failed (${model}): ${message}`, {
      code: 'LLM_ERROR',
      recoverable: true,
      context: { model, operation },
      cause: options?.cause,
    });
    this.name = 'LLMError';
    this.model = model;
    this.operation = operation;
  }

  toUserMessage(): string {
    return 'Let me think about that again...';
  }
}

// ============================================================================
// HANDLER ERRORS
// ============================================================================

/**
 * Error in a handler.
 */
export class HandlerError extends AgentError {
  readonly handlerName: string;

  constructor(handlerName: string, message: string, options?: { cause?: Error }) {
    super(`Handler "${handlerName}" failed: ${message}`, {
      code: 'HANDLER_ERROR',
      recoverable: true,
      context: { handlerName },
      cause: options?.cause,
    });
    this.name = 'HandlerError';
    this.handlerName = handlerName;
  }
}

// ============================================================================
// PIPELINE ERRORS
// ============================================================================

/**
 * Error in a pipeline step.
 */
export class PipelineStepError extends AgentError {
  readonly stepName: string;
  readonly stepIndex: number;

  constructor(
    stepName: string,
    stepIndex: number,
    message: string,
    options?: { cause?: Error; recoverable?: boolean }
  ) {
    super(`Pipeline step "${stepName}" (${stepIndex}) failed: ${message}`, {
      code: 'PIPELINE_STEP_ERROR',
      recoverable: options?.recoverable ?? false,
      context: { stepName, stepIndex },
      cause: options?.cause,
    });
    this.name = 'PipelineStepError';
    this.stepName = stepName;
    this.stepIndex = stepIndex;
  }
}

// ============================================================================
// USER IDENTIFICATION ERRORS
// ============================================================================

/**
 * Error identifying user.
 */
export class UserIdentificationError extends AgentError {
  readonly source: 'metadata' | 'voice' | 'token';

  constructor(
    source: 'metadata' | 'voice' | 'token',
    message: string,
    options?: { cause?: Error }
  ) {
    super(`User identification from ${source} failed: ${message}`, {
      code: 'USER_IDENTIFICATION_ERROR',
      recoverable: true, // Can proceed with anonymous user
      context: { source },
      cause: options?.cause,
    });
    this.name = 'UserIdentificationError';
    this.source = source;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if an error is recoverable.
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof AgentError) {
    return error.recoverable;
  }
  return false;
}

/**
 * Get a user-friendly message from any error.
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof AgentError) {
    return error.toUserMessage();
  }
  return 'Something unexpected happened. Let me try again.';
}

/**
 * Wrap an unknown error in an AgentError.
 */
export function wrapError(error: unknown, context?: Record<string, unknown>): AgentError {
  if (error instanceof AgentError) {
    return error;
  }

  const cause = error instanceof Error ? error : new Error(String(error));

  return new AgentError(cause.message, {
    code: 'UNKNOWN_ERROR',
    recoverable: false,
    context: context ?? {},
    cause,
  });
}

/**
 * Create an error boundary that catches and wraps errors.
 */
export async function withErrorBoundary<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: { recoverable?: boolean; context?: Record<string, unknown> }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }

    throw new AgentError(`Error in ${operation}`, {
      code: 'BOUNDARY_ERROR',
      recoverable: options?.recoverable ?? false,
      context: { operation, ...options?.context },
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}
