/**
 * LLM error analysis for generate-reply gateway.
 * Extracts structured error details from OpenAI and Gemini API errors.
 *
 * @module gateway/error-analysis
 */

export interface LLMErrorDetails {
  errorType:
    | 'timeout'
    | 'rate_limit'
    | 'auth'
    | 'connection'
    | 'api'
    | 'session_draining'
    | 'active_response'
    | 'audio_buffer'
    | 'websocket_stale'
    | 'unknown';
  errorCode?: number | string;
  isRetryable: boolean;
  isLLMDead: boolean;
  httpStatus?: number;
  rawErrorName?: string;
  /** Provider that generated the error (openai or gemini) */
  provider?: 'openai' | 'gemini' | 'unknown';
}

/**
 * Extract detailed error information from LLM API errors (OpenAI or Gemini).
 *
 * This helps diagnose WHY the LLM failed:
 * - 429 = Rate limit (temporary)
 * - 401/403 = Auth issue (permanent)
 * - ETIMEDOUT = Connection timeout
 * - "generation_created" timeout = LLM session dead
 * - "conversation_already_has_active_response" = OpenAI race condition
 * - "input_audio_buffer" = OpenAI audio buffer error
 */
export function extractLLMErrorDetails(error: unknown): LLMErrorDetails {
  const details: LLMErrorDetails = {
    errorType: 'unknown',
    isRetryable: true,
    isLLMDead: false,
    provider: 'unknown',
  };

  if (!error) return details;

  const errorStr = String(error);
  const errorObj = error as Record<string, unknown>;

  // Check for Error instance properties
  if (error instanceof Error) {
    details.rawErrorName = error.name;

    // Extract error code if present
    if ('code' in error) {
      details.errorCode = (error as { code: unknown }).code as string | number;
    }
    if ('status' in error) {
      details.httpStatus = (error as { status: unknown }).status as number;
    }
    if ('statusCode' in error) {
      details.httpStatus = (error as { statusCode: unknown }).statusCode as number;
    }
  }

  // =========================================================================
  // OPENAI-SPECIFIC ERRORS (check first - more specific patterns)
  // =========================================================================

  // OpenAI: "conversation_already_has_active_response" - race condition
  if (errorStr.includes('conversation_already_has_active_response')) {
    details.errorType = 'active_response';
    details.provider = 'openai';
    details.isRetryable = true;
    details.isLLMDead = false;
    return details;
  }

  // OpenAI: Audio buffer errors
  if (
    errorStr.includes('input_audio_buffer') ||
    errorStr.includes('audio_buffer_append') ||
    errorStr.includes('invalid_audio')
  ) {
    details.errorType = 'audio_buffer';
    details.provider = 'openai';
    details.isRetryable = true;
    details.isLLMDead = false;
    return details;
  }

  // OpenAI: WebSocket connection stale/closed
  if (
    errorStr.includes('WebSocket is not open') ||
    errorStr.includes('WebSocket connection') ||
    errorStr.includes('connection closed unexpectedly')
  ) {
    details.errorType = 'websocket_stale';
    details.provider = 'openai';
    details.isRetryable = false;
    details.isLLMDead = true;
    return details;
  }

  // OpenAI-specific rate limit format
  if (errorStr.includes('rate_limit_exceeded') || errorStr.includes('RateLimitError')) {
    details.errorType = 'rate_limit';
    details.provider = 'openai';
    details.errorCode = 429;
    details.isRetryable = true;
    details.isLLMDead = false;
    return details;
  }

  // =========================================================================
  // LIVEKIT SDK / SESSION ERRORS
  // =========================================================================

  if (
    errorStr.includes('waitForPlayout') &&
    (errorStr.includes('circular wait') || errorStr.includes('from inside the function tool'))
  ) {
    details.errorType = 'session_draining';
    details.isRetryable = false;
    details.isLLMDead = false;
    return details;
  }

  if (errorStr.includes('AgentSession is not running')) {
    details.errorType = 'session_draining';
    details.isRetryable = false;
    details.isLLMDead = false;
    return details;
  }

  // =========================================================================
  // GENERIC LLM ERRORS (both OpenAI and Gemini)
  // =========================================================================

  if (errorStr.includes('Gateway timeout') || errorStr.includes('Safe timeout')) {
    details.errorType = 'timeout';
    details.isLLMDead = true;
  } else if (errorStr.includes('generation_created') || errorStr.includes('timed out waiting')) {
    details.errorType = 'timeout';
    details.isLLMDead = true;
    details.provider = 'gemini';
  } else if (
    errorStr.includes('429') ||
    errorStr.includes('rate limit') ||
    errorStr.includes('RESOURCE_EXHAUSTED')
  ) {
    details.errorType = 'rate_limit';
    details.errorCode = 429;
    details.isRetryable = true;
  } else if (
    errorStr.includes('401') ||
    errorStr.includes('403') ||
    errorStr.includes('UNAUTHENTICATED') ||
    errorStr.includes('PERMISSION_DENIED')
  ) {
    details.errorType = 'auth';
    details.isRetryable = false;
  } else if (
    errorStr.includes('ETIMEDOUT') ||
    errorStr.includes('ECONNRESET') ||
    errorStr.includes('ENOTFOUND') ||
    errorStr.includes('WebSocket')
  ) {
    details.errorType = 'connection';
    details.isLLMDead = true;
  } else if (
    errorStr.includes('500') ||
    errorStr.includes('503') ||
    errorStr.includes('INTERNAL')
  ) {
    details.errorType = 'api';
    details.isRetryable = true;
  }

  // Check nested error objects
  if (errorObj.response && typeof errorObj.response === 'object') {
    const response = errorObj.response as Record<string, unknown>;
    if (response.status) {
      details.httpStatus = response.status as number;
    }
    if (response.data && typeof response.data === 'object') {
      const data = response.data as Record<string, unknown>;
      if (data.error && typeof data.error === 'object') {
        const innerError = data.error as Record<string, unknown>;
        if (innerError.code) details.errorCode = innerError.code as string | number;
      }
    }
  }

  return details;
}
