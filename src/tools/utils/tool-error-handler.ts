/**
 * Tool Error Handler
 *
 * Provides standardized error handling for tools to replace silent `return []`
 * patterns with proper error context and user-friendly messages.
 *
 * PRINCIPLES:
 *   - Never silently fail - always provide context
 *   - User-friendly messages for voice responses
 *   - Detailed logging for debugging
 *   - Distinguish between service unavailability and other errors
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Error result with user-friendly message and empty data fallback
 */
export interface ToolErrorResult<T> {
  /** Empty fallback data (e.g., [], null) */
  data: T;
  /** Whether this is an error condition */
  isError: true;
  /** User-friendly error message */
  userMessage: string;
  /** Technical error code for logging */
  errorCode: string;
  /** Whether the service is unavailable (vs. other error) */
  serviceUnavailable: boolean;
}

/**
 * Success result
 */
export interface ToolSuccessResult<T> {
  data: T;
  isError: false;
}

export type ToolResult<T> = ToolSuccessResult<T> | ToolErrorResult<T>;

/**
 * Common error codes for tools
 */
export const ToolErrorCode = {
  /** Service credentials missing or invalid */
  SERVICE_NOT_CONFIGURED: 'SERVICE_NOT_CONFIGURED',
  /** Service temporarily unavailable */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /** User not authenticated */
  USER_NOT_AUTHENTICATED: 'USER_NOT_AUTHENTICATED',
  /** Rate limited by external API */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Network request failed */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Database operation failed */
  DATABASE_ERROR: 'DATABASE_ERROR',
  /** Invalid parameters provided */
  INVALID_PARAMS: 'INVALID_PARAMS',
  /** Resource not found */
  NOT_FOUND: 'NOT_FOUND',
  /** Unknown error */
  UNKNOWN: 'UNKNOWN',
} as const;

export type ToolErrorCodeType = (typeof ToolErrorCode)[keyof typeof ToolErrorCode];

// ============================================================================
// ERROR MESSAGES (USER-FRIENDLY, WARM BRAND VOICE)
// ============================================================================

const DEFAULT_ERROR_MESSAGES: Record<ToolErrorCodeType, string> = {
  [ToolErrorCode.SERVICE_NOT_CONFIGURED]:
    "That feature isn't set up yet. Let's get it connected!",
  [ToolErrorCode.SERVICE_UNAVAILABLE]:
    "I'm having trouble reaching that service right now. Try again in a moment?",
  [ToolErrorCode.USER_NOT_AUTHENTICATED]:
    'You need to sign in first to use this feature.',
  [ToolErrorCode.RATE_LIMITED]:
    "I've made too many requests. Give me a moment to cool down.",
  [ToolErrorCode.NETWORK_ERROR]:
    'I ran into a connection issue. Can you try again?',
  [ToolErrorCode.DATABASE_ERROR]:
    "Something went wrong saving that. I'll try again.",
  [ToolErrorCode.INVALID_PARAMS]:
    "I didn't quite get that. Could you give me more details?",
  [ToolErrorCode.NOT_FOUND]:
    "I couldn't find that. Want to try something else?",
  [ToolErrorCode.UNKNOWN]:
    'Something unexpected happened. Let me try again.',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a success result
 */
export function toolSuccess<T>(data: T): ToolSuccessResult<T> {
  return { data, isError: false };
}

/**
 * Create an error result with proper logging
 */
export function toolError<T>(
  fallbackData: T,
  errorCode: ToolErrorCodeType,
  context: {
    toolName: string;
    userId?: string;
    error?: unknown;
    customMessage?: string;
    additionalContext?: Record<string, unknown>;
  }
): ToolErrorResult<T> {
  const { toolName, userId, error, customMessage, additionalContext } = context;

  const serviceUnavailableCodes: ToolErrorCodeType[] = [
    ToolErrorCode.SERVICE_NOT_CONFIGURED,
    ToolErrorCode.SERVICE_UNAVAILABLE,
    ToolErrorCode.RATE_LIMITED,
    ToolErrorCode.NETWORK_ERROR,
  ];
  const serviceUnavailable = serviceUnavailableCodes.includes(errorCode);

  // Log the error with context
  log.warn(
    {
      toolName,
      userId,
      errorCode,
      serviceUnavailable,
      error: error instanceof Error ? error.message : error,
      ...additionalContext,
    },
    `Tool error: ${toolName} - ${errorCode}`
  );

  return {
    data: fallbackData,
    isError: true,
    userMessage: customMessage || DEFAULT_ERROR_MESSAGES[errorCode],
    errorCode,
    serviceUnavailable,
  };
}

/**
 * Wrap a tool function with error handling
 *
 * @example
 * async function getDevices(): Promise<Device[]> {
 *   return withToolErrorHandling(
 *     async () => {
 *       const result = await api.getDevices();
 *       return result.devices;
 *     },
 *     [],
 *     { toolName: 'getSpotifyDevices', userId }
 *   );
 * }
 */
export async function withToolErrorHandling<T>(
  fn: () => Promise<T>,
  fallbackData: T,
  context: {
    toolName: string;
    userId?: string;
    additionalContext?: Record<string, unknown>;
  }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorCode = classifyError(error);
    const result = toolError(fallbackData, errorCode, {
      ...context,
      error,
    });
    return result.data;
  }
}

/**
 * Wrap a tool function with error handling, returning full result
 */
export async function withToolErrorHandlingFull<T>(
  fn: () => Promise<T>,
  fallbackData: T,
  context: {
    toolName: string;
    userId?: string;
    additionalContext?: Record<string, unknown>;
  }
): Promise<ToolResult<T>> {
  try {
    return toolSuccess(await fn());
  } catch (error) {
    const errorCode = classifyError(error);
    return toolError(fallbackData, errorCode, {
      ...context,
      error,
    });
  }
}

/**
 * Classify an error into an error code
 */
function classifyError(error: unknown): ToolErrorCodeType {
  if (!error) return ToolErrorCode.UNKNOWN;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Check for common patterns
  if (
    message.includes('not configured') ||
    message.includes('credentials') ||
    message.includes('api key')
  ) {
    return ToolErrorCode.SERVICE_NOT_CONFIGURED;
  }

  if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) {
    return ToolErrorCode.RATE_LIMITED;
  }

  if (
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('not authenticated')
  ) {
    return ToolErrorCode.USER_NOT_AUTHENTICATED;
  }

  if (message.includes('not found') || message.includes('404')) {
    return ToolErrorCode.NOT_FOUND;
  }

  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed')
  ) {
    return ToolErrorCode.NETWORK_ERROR;
  }

  if (
    message.includes('database') ||
    message.includes('firestore') ||
    message.includes('postgres')
  ) {
    return ToolErrorCode.DATABASE_ERROR;
  }

  if (
    message.includes('unavailable') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('service')
  ) {
    return ToolErrorCode.SERVICE_UNAVAILABLE;
  }

  return ToolErrorCode.UNKNOWN;
}

/**
 * Check if a service is configured before attempting to use it
 *
 * @example
 * const check = checkServiceConfigured('SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET');
 * if (!check.configured) {
 *   return toolError([], ToolErrorCode.SERVICE_NOT_CONFIGURED, {
 *     toolName: 'searchSpotify',
 *     customMessage: check.message,
 *   });
 * }
 */
export function checkServiceConfigured(
  ...envVars: string[]
): { configured: boolean; message: string; missing: string[] } {
  const missing: string[] = [];

  for (const envVar of envVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    return {
      configured: false,
      message: `Service not configured. Missing: ${missing.join(', ')}`,
      missing,
    };
  }

  return { configured: true, message: '', missing: [] };
}

/**
 * Create a user-friendly response for when a service isn't available
 */
export function serviceUnavailableResponse(serviceName: string): string {
  return `I can't reach ${serviceName} right now. Want to try something else?`;
}

/**
 * Create a user-friendly response for when configuration is missing
 */
export function serviceNotConfiguredResponse(serviceName: string): string {
  return `${serviceName} isn't set up yet. Would you like me to help you connect it?`;
}

/**
 * Log and track error for observability without throwing
 */
export function trackToolError(
  toolName: string,
  errorCode: ToolErrorCodeType,
  error?: unknown,
  additionalContext?: Record<string, unknown>
): void {
  log.error(
    {
      toolName,
      errorCode,
      error: error instanceof Error ? error.message : error,
      ...additionalContext,
    },
    `Tool error tracked: ${toolName}`
  );
}
